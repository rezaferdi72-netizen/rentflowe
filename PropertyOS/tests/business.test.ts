import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { Vault, MemoryStorage, decrypt } from "../src/core/vault";
import { PropertyService } from "../src/core/service";
import { money, amortization, words } from "../src/core/money";
const SQL = await initSqlJs({
  locateFile: (name) => "node_modules/sql.js/dist/" + name,
});
const password = "my private property passphrase";
async function setup() {
  const store = new MemoryStorage(),
    vault = await Vault.create(SQL, store, password, "Green Estates"),
    s = new PropertyService(vault);
  const property = await s.addProperty({
      name: "Green Tower",
      category: "Residential",
      address: "Dhaka",
    }),
    unit = await s.addUnit({
      property_id: property,
      number: "A-101",
      type: "Apartment",
      monthly_rent: money("25000"),
      service_charge: money("2000"),
    }),
    tenant = await s.addTenant({ name: "Rahim", phone: "01700000000" }),
    lease = await s.addLease({
      unit_id: unit,
      tenant_id: tenant,
      start_date: "2026-10-01",
      end_date: "2027-09-30",
      rent: money("25000"),
      service_charge: money("2000"),
      billing_day: 1,
      due_day: 10,
      deposit: money("50000"),
    });
  return { store, vault, s, property, unit, tenant, lease };
}
test("Green Tower: immutable October invoice, two receipts, closing 5000, carry-forward without new revenue", async () => {
  const { s, vault, lease, tenant } = await setup();
  assert.equal(await s.billMonth("2026-10"), 1);
  assert.equal(await s.billMonth("2026-10"), 0);
  const inv = s.list("invoices")[0];
  assert.equal(inv.total, money("27000"));
  const p1 = await s.recordPayment({
    lease_id: lease,
    payment_date: "2026-10-05",
    amount: money("20000"),
    method: "Bank",
    account_id: "bank",
  });
  assert.equal(s.invoiceBalance(inv.id), money("7000"));
  const p2 = await s.recordPayment({
    lease_id: lease,
    payment_date: "2026-10-10",
    amount: money("2000"),
    method: "Cash",
    account_id: "cash",
  });
  assert.equal(s.invoiceBalance(inv.id), money("5000"));
  assert.equal(s.tenantBalance(tenant), money("5000"));
  assert.notEqual(
    s.list("payments")[0].receipt_number,
    s.list("payments")[1].receipt_number,
  );
  const statement = s.statement(tenant, "2026-10-01", "2026-10-31");
  assert.equal(statement.closing, money("5000"));
  assert.deepEqual(
    statement.rows.map((r) => r.date),
    ["2026-10-01", "2026-10-05", "2026-10-10"],
  );
  assert.equal(
    JSON.parse(
      vault.one("SELECT snapshot FROM payments WHERE id=?", [p1])!.snapshot,
    ).balance_after,
    money("7000"),
  );
  assert.equal(
    JSON.parse(
      vault.one("SELECT snapshot FROM payments WHERE id=?", [p2])!.snapshot,
    ).balance_after,
    money("5000"),
  );
  assert.equal(await s.billMonth("2026-11"), 1);
  const nov = s.list("invoices")[0];
  assert.equal(nov.total, money("27000"));
  assert.equal(JSON.parse(nov.snapshot).previous_balance, money("5000"));
  assert.equal(s.metrics("2026-11-01", "2026-11-30").rent, money("25000"));
  assert.equal(
    s.statement(tenant, "2026-11-01", "2026-11-30").opening,
    money("5000"),
  );
  assert.equal(
    s.statement(tenant, "2026-11-01", "2026-11-30").closing,
    money("32000"),
  );
  assert.throws(
    () => vault.run("UPDATE invoices SET total=0 WHERE id=?", [inv.id]),
    /immutable/,
  );
  const trial = s.trialBalance("2026-11-30");
  assert.equal(
    trial.reduce((n, r) => n + r.debit - r.credit, 0),
    0,
  );
});
test("Payment reversal is additive, preserves historical balances and receipt, and rejects repeats", async () => {
  const { s, lease, tenant } = await setup();
  await s.billMonth("2026-10");
  const p = await s.recordPayment({
    lease_id: lease,
    payment_date: "2026-10-05",
    amount: money("20000"),
    method: "Cash",
    account_id: "cash",
  });
  await s.reverse("payment", p, "Wrong bank reference", "2026-10-10");
  assert.equal(s.tenantBalance(tenant), money("27000"));
  assert.equal(
    s.statement(tenant, "2026-10-01", "2026-10-09").closing,
    money("7000"),
  );
  assert.equal(s.list("payments")[0].status, "reversed");
  await assert.rejects(
    s.reverse("payment", p, "Again", "2026-10-11"),
    /already/,
  );
  assert.equal(s.metrics("2026-10-01", "2026-10-31").collected, 0);
});
test("Vacant unit, lease overlap, renewal, midmonth move-in and rent escalation", async () => {
  const { s, property, unit, tenant } = await setup();
  await s.addUnit({
    property_id: property,
    number: "A-102",
    type: "Shop",
    monthly_rent: money("10000"),
  });
  assert.equal(s.metrics("2026-10-01", "2026-10-31").vacant, 1);
  await assert.rejects(
    s.addLease({
      unit_id: unit,
      tenant_id: tenant,
      start_date: "2026-10-05",
      end_date: "2026-11-30",
      rent: 1,
      billing_day: 1,
      due_day: 10,
    }),
    /overlap/,
  );
  await s.addLease({
    unit_id: unit,
    tenant_id: tenant,
    start_date: "2027-10-01",
    end_date: "2028-09-30",
    rent: money("28000"),
    billing_day: 1,
    due_day: 10,
    renewed_from: s.list("leases").find((l) => l.start_date === "2026-10-01")!
      .id,
  });
  const u = s.list("units").find((u) => u.number === "A-102")!,
    t = await s.addTenant({ name: "New tenant", phone: "01800000000" }),
    l = await s.addLease({
      unit_id: u.id,
      tenant_id: t,
      start_date: "2026-10-16",
      end_date: "2027-10-15",
      rent: money("31000"),
      service_charge: 0,
      billing_day: 1,
      due_day: 10,
    });
  await s.scheduleRent({
    lease_id: l,
    effective_on: "2026-11-01",
    rent: money("62000"),
  });
  await s.billMonth("2026-10", l);
  assert.equal(s.list("invoices")[0].total, money("16000"));
  await s.billMonth("2026-11", l);
  assert.equal(s.list("invoices")[0].total, money("62000"));
});
test("Advance allocations across invoices, credits, and advance refunds remain balanced", async () => {
  const { s, lease, tenant } = await setup();
  const pay = await s.recordPayment({
    lease_id: lease,
    payment_date: "2026-10-01",
    amount: money("60000"),
    method: "Bank",
    account_id: "bank",
  });
  assert.equal(
    s.tenantBalance(tenant),
    money("-0".replace("-", "")) - money("60000"),
  );
  await s.billMonth("2026-10");
  await s.billMonth("2026-11");
  assert.equal(s.list("payments")[0].advance, money("6000"));
  assert.equal(s.invoiceBalance(s.list("invoices")[0].id, "2026-11-30"), 0);
  await s.refundAdvance({
    payment_id: pay,
    amount: money("6000"),
    account_id: "bank",
    entry_date: "2026-10-11",
    reason: "Return unused advance",
  });
  assert.equal(s.tenantBalance(tenant), 0);
  await assert.rejects(
    s.refundAdvance({
      payment_id: pay,
      amount: 1,
      account_id: "bank",
      entry_date: "2026-10-11",
      reason: "Over-refund",
    }),
    /available/,
  );
  assert.equal(s.metrics("2026-10-01", "2026-11-30").collected, money("54000"));
});
test("Deposits are liabilities, capex is asset, vendor bills payable, loan principal distinct from interest", async () => {
  const { s, property, lease } = await setup();
  await s.recordDeposit({
    lease_id: lease,
    entry_date: "2026-10-01",
    amount: money("50000"),
    direction: "received",
    account_id: "bank",
  });
  await s.recordDeposit({
    lease_id: lease,
    entry_date: "2026-10-10",
    amount: money("10000"),
    direction: "refunded",
    account_id: "bank",
  });
  assert.equal(s.depositBalance(lease), money("40000"));
  await assert.rejects(
    s.recordDeposit({
      lease_id: lease,
      entry_date: "2026-10-10",
      amount: money("40001"),
      direction: "refunded",
      account_id: "bank",
    }),
    /exceeds/,
  );
  await s.recordExpense({
    property_id: property,
    category: "Repairs",
    description: "Repair water line",
    entry_date: "2026-10-02",
    amount: money("3000"),
    account_id: "bank",
  });
  await s.recordInvestment({
    property_id: property,
    category: "Renovation",
    description: "New lift",
    entry_date: "2026-10-03",
    amount: money("100000"),
    account_id: "bank",
  });
  const bill = await s.recordExpense({
    property_id: property,
    category: "Cleaning",
    description: "Vendor cleaning",
    entry_date: "2026-10-03",
    amount: money("1000"),
  });
  await s.payExpense({
    expense_id: bill,
    entry_date: "2026-10-04",
    amount: money("1000"),
    account_id: "bank",
  });
  const loan = await s.addLoan({
    property_id: property,
    lender: "Bank",
    principal: money("1000000"),
    annual_rate_bps: 900,
    term_months: 60,
    start_date: "2026-10-01",
    account_id: "bank",
  });
  await s.repayLoan({
    loan_id: loan,
    entry_date: "2026-10-05",
    principal: money("10000"),
    interest: money("7500"),
    account_id: "bank",
  });
  const m = s.metrics("2026-10-01", "2026-10-31");
  assert.equal(m.deposits, money("40000"));
  assert.equal(m.operating, money("4000"));
  assert.equal(m.invested, money("100000"));
  assert.equal(m.loans, money("990000"));
  assert.equal(m.interest, money("7500"));
  assert.equal(m.payable, 0);
  assert.equal(m.rent, 0);
  assert.equal(m.cash, money("918500"));
});
test("Backup decrypt, integrity, restart, wrong passphrase, corrupt backup, restore and optimistic conflict", async () => {
  const { s, vault, store } = await setup();
  await s.billMonth("2026-10");
  const backup = await vault.backup();
  const restarted = await Vault.open(SQL, store, password);
  assert.equal(new PropertyService(restarted).list("invoices").length, 1);
  await assert.rejects(
    Vault.open(SQL, store, "incorrect passphrase"),
    /Incorrect/,
  );
  await assert.rejects(
    decrypt(
      { ...backup, ciphertext: backup.ciphertext.slice(0, -4) + "AAAA" },
      password,
    ),
    /damaged/,
  );
  await s.addTenant({ name: "Later tenant", phone: "01900000000" });
  assert.equal(s.list("tenants").length, 2);
  await vault.restore(backup, password);
  assert.equal(s.list("tenants").length, 1);
  const stale = new PropertyService(restarted);
  await assert.rejects(
    stale.addTenant({ name: "Stale", phone: "111" }),
    /Another session/,
  );
  assert.equal(stale.list("tenants").length, 1);
  assert.equal(vault.health().integrity, "ok");
});
test("A failed save rolls back the complete transaction, not just the UI", async () => {
  const { s, vault, store } = await setup();
  const original = store.save.bind(store);
  store.save = async () => {
    throw new Error("Disk full");
  };
  await assert.rejects(s.billMonth("2026-10"), /Disk full/);
  assert.equal(s.list("invoices").length, 0);
  assert.equal(vault.all("SELECT * FROM journal_entries").length, 0);
  store.save = original;
  assert.equal(await s.billMonth("2026-10"), 1);
});
test("Automation catches missed recurring jobs and does not double post", async () => {
  const { s, property } = await setup();
  await s.saveSettings({ auto_billing: "true" });
  await s.addRecurringExpense({
    property_id: property,
    description: "Security guard",
    category: "Security",
    amount: money("1000"),
    account_id: "bank",
    start_month: "2026-10",
  });
  assert.equal(await s.runAutomation("2026-12-12"), 3);
  assert.equal(await s.runAutomation("2026-12-12"), 0);
  assert.equal(s.list("invoices").length, 3);
  assert.equal(s.list("expenses").length, 3);
});
test("Meters, credit notes, maintenance and linked documents have persisted workflows", async () => {
  const { s, unit, lease, property, vault } = await setup();
  const meter = await s.addMeter({
    unit_id: unit,
    name: "Electricity",
    rate: money("10"),
  });
  await s.addReading({
    meter_id: meter,
    month: "2026-10",
    previous_reading: 100,
    current_reading: 150,
  });
  await s.billMonth("2026-10", lease);
  const inv = s.list("invoices")[0];
  assert.equal(inv.total, money("27500"));
  await s.creditInvoice({
    invoice_id: inv.id,
    amount: money("500"),
    entry_date: "2026-10-02",
    reason: "Goodwill discount",
  });
  assert.equal(s.invoiceBalance(inv.id), money("27000"));
  const task = await s.addMaintenance({
    property_id: property,
    unit_id: unit,
    description: "Leaking sink",
    category: "Plumbing",
    priority: "high",
    reported_on: "2026-10-01",
  });
  await s.updateMaintenance(task, "completed", "Pipe replaced");
  assert.equal(s.list("maintenance_requests")[0].status, "completed");
  const doc = await s.attach(
    { entity_type: "properties", entity_id: property, category: "Deed" },
    new File(["test deed"], "deed.txt", { type: "text/plain" }),
  );
  assert.equal(s.list("documents").length, 1);
  assert.equal(
    new TextDecoder().decode(
      vault.one("SELECT content FROM documents WHERE id=?", [doc])!.content,
    ),
    "test deed",
  );
});
test("Integer money and amortization have exact repayments, zero interest and no binary money errors", () => {
  assert.equal(money("0.29"), 29);
  assert.throws(() => money("1.001"));
  assert.throws(() => money("-1"));
  for (const rate of [0, 900, 1500]) {
    const schedule = amortization(money("35000000"), rate, 60);
    assert.equal(schedule.at(-1)!.balance, 0);
    assert.equal(
      schedule.reduce((n, r) => n + r.principal, 0),
      money("35000000"),
    );
    assert.ok(schedule.every((r) => Number.isSafeInteger(r.interest)));
  }
  assert.match(words(money("27000")), /twenty seven thousand taka only/);
});
test("Multiple one-time charges in one month, receipt snapshots and profile version history are preserved", async () => {
  const { s, lease, tenant, vault } = await setup();
  await s.billMonth("2026-10");
  await s.customInvoice({
    lease_id: lease,
    month: "2026-10",
    issue_date: "2026-10-02",
    due_date: "2026-10-10",
    description: "Parking",
    amount: money("500"),
  });
  await s.customInvoice({
    lease_id: lease,
    month: "2026-10",
    issue_date: "2026-10-03",
    due_date: "2026-10-10",
    description: "Replacement key",
    amount: money("200"),
  });
  assert.equal(s.list("invoices").length, 3);
  const pay = await s.recordPayment({
    lease_id: lease,
    payment_date: "2026-10-05",
    amount: money("27200"),
    method: "Cash",
    account_id: "cash",
  });
  const snap = JSON.parse(
    vault.one("SELECT snapshot FROM payments WHERE id=?", [pay])!.snapshot,
  );
  assert.deepEqual(
    snap.allocations.map((r: any) => r.amount),
    [money("27000"), money("200")],
  );
  assert.equal(s.tenantBalance(tenant), money("500"));
  const old = s.list("tenants")[0];
  await s.updateRecord(
    "tenants",
    tenant,
    { name: "Rahim updated" },
    old.updated_at,
  );
  assert.equal(
    JSON.parse(vault.one("SELECT snapshot FROM record_versions")!.snapshot)
      .name,
    "Rahim",
  );
  assert.equal(JSON.parse(s.list("invoices")[0].snapshot).tenant, "Rahim");
  assert.equal(
    JSON.parse(
      vault.one("SELECT snapshot FROM payments WHERE id=?", [pay])!.snapshot,
    ).tenant,
    "Rahim",
  );
  await assert.rejects(
    s.updateRecord("tenants", tenant, { name: "Stale update" }, old.updated_at),
    /changed/,
  );
});
