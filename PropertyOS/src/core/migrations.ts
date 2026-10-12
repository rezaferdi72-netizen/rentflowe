/** Version 2 is additive and preserves all v1 property, rent and accounting records. */
export const schemaV2 = `
CREATE TABLE IF NOT EXISTS owner_transactions(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES owners(id),property_id TEXT REFERENCES properties(id),entry_date TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN('contribution','distribution')),amount INTEGER NOT NULL CHECK(amount>0),account_id TEXT NOT NULL REFERENCES financial_accounts(id),description TEXT NOT NULL,journal_id TEXT NOT NULL REFERENCES journal_entries(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS investment_assets(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,property_id TEXT REFERENCES properties(id),opened_on TEXT NOT NULL,institution TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS investment_transactions(id TEXT PRIMARY KEY,asset_id TEXT NOT NULL REFERENCES investment_assets(id),entry_date TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('purchase','income','redemption')),amount INTEGER NOT NULL CHECK(amount>=0),principal INTEGER NOT NULL CHECK(principal>=0),account_id TEXT NOT NULL REFERENCES financial_accounts(id),description TEXT NOT NULL,journal_id TEXT NOT NULL REFERENCES journal_entries(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS expense_budgets(id TEXT PRIMARY KEY,property_id TEXT NOT NULL REFERENCES properties(id),month TEXT NOT NULL,category TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>=0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(property_id,month,category));
CREATE INDEX IF NOT EXISTS owner_transactions_scope ON owner_transactions(owner_id,entry_date);
CREATE INDEX IF NOT EXISTS investment_transactions_scope ON investment_transactions(asset_id,entry_date);
CREATE INDEX IF NOT EXISTS expense_budgets_scope ON expense_budgets(property_id,month);
INSERT INTO financial_accounts VALUES('financial_investments','1510','Financial investments','asset',0,datetime('now')) ON CONFLICT(id) DO NOTHING;
INSERT INTO financial_accounts VALUES('investment_income','4030','Investment returns and gains','income',0,datetime('now')) ON CONFLICT(id) DO NOTHING;
INSERT INTO financial_accounts VALUES('investment_loss','5200','Realized investment losses','expense',0,datetime('now')) ON CONFLICT(id) DO NOTHING;
INSERT OR IGNORE INTO schema_migrations VALUES(2,datetime('now'));
${["owner_transactions", "investment_transactions"].flatMap((table) => ["UPDATE", "DELETE"].map((op) => `CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op.toLowerCase()} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Posted records are immutable; use a reversal'); END;`)).join("\n")}
`;
