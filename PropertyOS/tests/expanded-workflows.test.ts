import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { Vault, MemoryStorage, decrypt, encrypt } from "../src/core/vault";
import { PropertyService } from "../src/core/service";
import { money } from "../src/core/money";
import { parseCSV } from "../src/core/imports";
import { csvText } from "../src/core/exports";
const SQL = await initSqlJs({
  locateFile: (name) => "node_modules/sql.js/dist/" + name,
});
const passphrase = "long private business passphrase";
async function setup() {
  const store = new MemoryStorage();
  const v = await Vault.create(SQL, store, passphrase, "Business test");
  return { store, v, s: new PropertyService(v) };
}

test("CSV handles quoted commas, Bengali, multiline cells, CRLF and strict malformed quotes", () => {
  assert.deepEqual(
    parseCSV(
      '\ufeffname,notes\r\n"বাড়ি, ঢাকা","first\nsecond ""quoted"""\r\n',
    ),
    [
      ["name", "notes"],
      ["বাড়ি, ঢাকা", 'first\nsecond "quoted"'],
    ],
  );
  assert.throws(() => parseCSV('a,b\n"bad,quote'), /unclosed/);
  assert.throws(() => parseCSV('a\n"okay"extra'), /Unexpected/);
});
test("CSV exports exact taka decimals, negative monetary amounts and safe spreadsheet text", () => {
  const rows = parseCSV(
    csvText([
      {
        name: '=HYPERLINK("malicious")',
        amount: money("20000.29"),
        variance: -money("150.50"),
        basis_points: 900,
        snapshot: "private snapshot",
        content: "private content",
      },
    ]),
  );
  assert.deepEqual(rows[0], ["name", "amount", "variance", "basis_points"]);
  assert.equal(rows[1][0], '\'=HYPERLINK("malicious")');
  assert.equal(rows[1][1], "20000.29");
  assert.equal(rows[1][2], "-150.50");
  assert.equal(rows[1][3], "900");
});
test("Master imports are atomic, reject duplicates/overlaps and connect tenants, units and leases", async () => {
  const { s, v } = await setup();
  await assert.rejects(
    s.importRecords(
      "properties",
      "name,category\nTower,Residential\nTower,Commercial",
    ),
    /Duplicate/,
  );
  assert.equal(s.list("properties").length, 0);
  await s.importRecords(
    "properties",
    "name,category,address\nTower,Residential,ঢাকা",
  );
  await s.importRecords("tenants", "name,phone\nRahim,01700000000");
  await s.importRecords(
    "units",
    "property_name,number,type,monthly_rent\nTower,A1,Apartment,25000",
  );
  await s.importRecords(
    "leases",
    "property_name,unit_number,tenant_phone,start_date,end_date,rent,prorate\nTower,A1,01700000000,2026-01-01,2026-12-31,25000,true",
  );
  assert.equal(s.list("leases")[0].rent, money("25000"));
  await assert.rejects(
    s.importRecords(
      "leases",
      "property_name,unit_number,tenant_phone,start_date,end_date,rent\nTower,A1,01700000000,2026-11-01,2027-02-01,26000",
    ),
    /overlap/,
  );
  assert.equal(s.list("leases").length, 1);
  const plan = s.planImport("tenants", "name,phone\nDuplicate,01700000000");
  assert.equal(plan.errors.length, 1);
  assert.equal(v.health().integrity, "ok");
  await v.close();
});
test("Investment principal, realized income, redemption gains/losses and reversals reconcile", async () => {
  const { s, v } = await setup();
  const asset = await s.addInvestmentAsset({
    name: "FDR",
    category: "Fixed deposit",
    opened_on: "2026-01-01",
    institution: "Test bank",
  });
  const purchase = await s.recordAssetTransaction({
    asset_id: asset,
    entry_date: "2026-01-01",
    kind: "purchase",
    amount: money("100000"),
    account_id: "bank",
    description: "FDR placement",
  });
  await s.recordAssetTransaction({
    asset_id: asset,
    entry_date: "2026-02-01",
    kind: "income",
    amount: money("1000"),
    account_id: "bank",
    description: "Net interest",
  });
  const redemption = await s.recordAssetTransaction({
    asset_id: asset,
    entry_date: "2026-03-01",
    kind: "redemption",
    principal: money("40000"),
    amount: money("42000"),
    account_id: "bank",
    description: "Partial redemption",
  });
  assert.deepEqual(s.investmentPosition(asset, "2026-03-01"), {
    balance: money("60000"),
    purchases: money("100000"),
    proceeds: money("42000"),
    realized: money("3000"),
  });
  await assert.rejects(
    s.recordAssetTransaction({
      asset_id: asset,
      entry_date: "2026-04-01",
      kind: "redemption",
      principal: money("60001"),
      amount: money("60001"),
      account_id: "bank",
      description: "Excess",
    }),
    /exceeds/,
  );
  await assert.rejects(
    s.reversePortfolioTransaction(
      "investment_transactions",
      purchase,
      "Invalid reversal",
      "2026-04-01",
    ),
    /more principal/,
  );
  await s.reversePortfolioTransaction(
    "investment_transactions",
    redemption,
    "Wrong split",
    "2026-04-01",
  );
  assert.equal(
    s.investmentPosition(asset, "2026-03-31").balance,
    money("60000"),
  );
  assert.equal(
    s.investmentPosition(asset, "2026-04-01").balance,
    money("100000"),
  );
  await s.recordAssetTransaction({
    asset_id: asset,
    entry_date: "2026-04-02",
    kind: "redemption",
    principal: money("100000"),
    amount: money("95000"),
    account_id: "bank",
    description: "Final redemption at loss",
  });
  assert.equal(s.investmentPosition(asset).balance, 0);
  assert.equal(s.investmentPosition(asset).realized, -money("4000"));
  assert.equal(s.accountBalance("financial_investments"), 0);
  assert.equal(s.accountBalance("investment_loss"), money("5000"));
  assert.equal(s.accountBalance("investment_income"), -money("1000"));
  assert.equal(s.accountBalance("bank"), -money("4000"));
  assert.throws(
    () => v.run("UPDATE investment_transactions SET amount=1"),
    /immutable/,
  );
  assert.equal(v.health().integrity, "ok");
  await v.close();
});
test("Owner capital and cash-flow classes reconcile with all cash accounts and loan splits", async () => {
  const { s, v } = await setup();
  const property = await s.addProperty({
    name: "Tower",
    category: "Residential",
  });
  const owner = await s.addOwner({ name: "Owner" });
  await s.recordOwnerTransaction({
    owner_id: owner,
    property_id: property,
    entry_date: "2026-01-01",
    direction: "contribution",
    amount: money("200000"),
    account_id: "bank",
    description: "Owner funds",
  });
  const withdrawn = await s.recordOwnerTransaction({
    owner_id: owner,
    property_id: property,
    entry_date: "2026-01-02",
    direction: "distribution",
    amount: money("10000"),
    account_id: "bank",
    description: "Withdrawal",
  });
  await s.reversePortfolioTransaction(
    "owner_transactions",
    withdrawn,
    "Cancelled withdrawal",
    "2026-01-03",
  );
  await s.recordInvestment({
    property_id: property,
    entry_date: "2026-01-04",
    category: "Renovation",
    description: "Capital improvement",
    amount: money("100000"),
    account_id: "bank",
  });
  await s.recordExpense({
    property_id: property,
    entry_date: "2026-01-05",
    category: "Repairs",
    description: "Repairs",
    amount: money("10000"),
    account_id: "bank",
  });
  const loan = await s.addLoan({
    property_id: property,
    lender: "Test lender",
    principal: money("50000"),
    annual_rate_bps: 900,
    term_months: 12,
    start_date: "2026-01-06",
    account_id: "bank",
  });
  await s.repayLoan({
    loan_id: loan,
    entry_date: "2026-01-07",
    principal: money("5000"),
    interest: money("500"),
    account_id: "bank",
  });
  await s.transfer({
    from: "bank",
    to: "cash",
    entry_date: "2026-01-08",
    amount: money("1000"),
    description: "Cash float",
  });
  const flow = s.cashFlow("2026-01-01", "2026-01-31");
  assert.equal(flow[0].amount, -money("10500"));
  assert.equal(flow[1].amount, -money("100000"));
  assert.equal(flow[2].amount, money("245000"));
  assert.equal(flow[3].amount, money("134500"));
  assert.equal(flow[3].amount, s.metrics("2026-01-01", "2026-01-31").cash);
  assert.equal(s.list("owners")[0].balance, money("200000"));
  assert.equal(v.health().integrity, "ok");
  await v.close();
});
test("Budget comparisons include unbudgeted expenses, corrections and budget history", async () => {
  const { s, v } = await setup();
  const property = await s.addProperty({
    name: "Tower",
    category: "Residential",
  });
  const budget = await s.saveBudget({
    property_id: property,
    month: "2026-01",
    category: "Repairs",
    amount: money("10000"),
  });
  await s.saveBudget({
    property_id: property,
    month: "2026-01",
    category: "Repairs",
    amount: money("12000"),
  });
  assert.equal(s.list("expense_budgets").length, 1);
  assert.equal(
    JSON.parse(
      v.one("SELECT snapshot FROM record_versions WHERE entity_id=?", [budget])!
        .snapshot,
    ).amount,
    money("10000"),
  );
  const expense = await s.recordExpense({
    property_id: property,
    entry_date: "2026-01-03",
    category: "Repairs",
    description: "Repair",
    amount: money("1000"),
    account_id: "bank",
  });
  await s.recordExpense({
    property_id: property,
    entry_date: "2026-01-04",
    category: "Cleaning",
    description: "Cleaning",
    amount: money("500"),
    account_id: "bank",
  });
  await s.reverse("expense", expense, "Duplicate repair", "2026-01-05");
  const rows = s.budgetReport("2026-01-01", "2026-01-31", property);
  assert.equal(
    rows.find((r) => r.category === "Repairs")!.variance,
    money("12000"),
  );
  assert.equal(
    rows.find((r) => r.category === "Cleaning")!.variance,
    -money("500"),
  );
  await v.close();
});
test("Passphrase rotation is durable, preserves old backups and rolls back failed saves", async () => {
  const { store, v, s } = await setup();
  await s.addTenant({ name: "Rahim", phone: "01700000000" });
  const before = await v.backup();
  const newPassphrase = "my completely new private passphrase";
  await v.changePassphrase(newPassphrase);
  const after = await v.backup();
  assert.equal(after.revision, before.revision + 1);
  await assert.rejects(decrypt(after, passphrase), /Incorrect/);
  await decrypt(before, passphrase);
  await decrypt(after, newPassphrase);
  const save = store.save.bind(store);
  store.save = async () => {
    throw new Error("storage full");
  };
  await assert.rejects(
    v.changePassphrase("failed private passphrase change"),
    /storage full/,
  );
  assert.deepEqual(await v.backup(), after);
  store.save = save;
  await v.close();
  const reopened = await Vault.open(SQL, store, newPassphrase);
  assert.equal(new PropertyService(reopened).list("tenants")[0].name, "Rahim");
  await reopened.close();
});
test("Existing v1 encrypted workspaces and v1 backups migrate to v2 without losing records", async () => {
  const { store, v, s } = await setup();
  await s.addTenant({ name: "Legacy tenant", phone: "01700000000" });
  const current = await v.backup(),
    unlocked = await decrypt(current, passphrase);
  const legacyDb = new SQL.Database(unlocked.bytes);
  legacyDb.run(
    "PRAGMA foreign_keys=OFF; DROP TABLE owner_transactions; DROP TABLE investment_transactions; DROP TABLE investment_assets; DROP TABLE expense_budgets; DELETE FROM financial_accounts WHERE id IN('financial_investments','investment_income','investment_loss'); DELETE FROM schema_migrations WHERE version=2",
  );
  const legacy = await encrypt(
    legacyDb.export(),
    unlocked.key,
    current.salt,
    current.vaultId,
    current.revision,
  );
  legacyDb.close();
  await v.close();
  store.value = legacy;
  const reopened = await Vault.open(SQL, store, passphrase);
  assert.equal(reopened.health().version, 2);
  assert.equal(store.value!.revision, legacy.revision + 1);
  assert.equal(
    new PropertyService(reopened).list("tenants")[0].name,
    "Legacy tenant",
  );
  await reopened.restore(legacy, passphrase);
  assert.equal(reopened.health().version, 2);
  const verified = await Vault.open(SQL, store, passphrase);
  assert.equal(verified.health().version, 2);
  await reopened.close();
  await verified.close();
});
