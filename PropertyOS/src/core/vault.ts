import initSqlJs, {
  type Database,
  type SqlJsStatic,
  type SqlValue,
} from "sql.js";
import schema from "./schema";
import { schemaV2 } from "./migrations";
export type Row = Record<string, any>;
export interface Envelope {
  format: "PropertyOS";
  version: 1;
  vaultId: string;
  revision: number;
  salt: string;
  iv: string;
  ciphertext: string;
}
export interface StorageAdapter {
  load(): Promise<Envelope | null>;
  save(value: Envelope, expected: number | null): Promise<void>;
  recovery?(): Promise<Envelope | null>;
  checkpoint?(day: string, value: Envelope): Promise<void>;
  lastBackup?(): Promise<string | null>;
  snapshots?(): Promise<{ day: string; value: Envelope }[]>;
  preserveBeforeRestore?(value: Envelope): Promise<void>;
}
const b64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const buf = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;
const iterations = 310000;
export async function derive(password: string, salt: Uint8Array) {
  if (password.length < 12)
    throw new Error("Use a passphrase of at least 12 characters.");
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
const aad = (e: Pick<Envelope, "vaultId" | "revision">) =>
  new TextEncoder().encode(`PropertyOS:1:${e.vaultId}:${e.revision}`);
export async function encrypt(
  bytes: Uint8Array,
  key: CryptoKey,
  salt: string,
  vaultId: string,
  revision: number,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const e = {
    format: "PropertyOS" as const,
    version: 1 as const,
    vaultId,
    revision,
    salt,
    iv: b64(iv),
  };
  const c = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: buf(iv), additionalData: aad(e) },
    key,
    buf(bytes),
  );
  return { ...e, ciphertext: b64(new Uint8Array(c)) };
}
export function validateEnvelope(x: any): asserts x is Envelope {
  if (
    !x ||
    x.format !== "PropertyOS" ||
    x.version !== 1 ||
    typeof x.vaultId !== "string" ||
    !Number.isSafeInteger(x.revision) ||
    x.revision < 1 ||
    typeof x.salt !== "string" ||
    typeof x.iv !== "string" ||
    typeof x.ciphertext !== "string" ||
    unb64(x.salt).length !== 16 ||
    unb64(x.iv).length !== 12
  )
    throw new Error("This is not a supported PropertyOS encrypted backup.");
}
export async function decrypt(e: Envelope, password: string) {
  validateEnvelope(e);
  const key = await derive(password, unb64(e.salt));
  try {
    const bytes = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: buf(unb64(e.iv)), additionalData: aad(e) },
        key,
        buf(unb64(e.ciphertext)),
      ),
    );
    return { bytes, key };
  } catch {
    throw new Error("Incorrect passphrase or damaged backup.");
  }
}
let engine: Promise<SqlJsStatic> | undefined;
export function sqlite() {
  return (engine ??= initSqlJs({
    locateFile: () => new URL("sql-wasm.wasm", document.baseURI).href,
  }));
}
export class Vault {
  db: Database;
  readonly SQL: SqlJsStatic;
  private key: CryptoKey;
  private envelope: Envelope;
  private adapter: StorageAdapter;
  private queue: Promise<unknown> = Promise.resolve();
  closed = false;
  private constructor(
    SQL: SqlJsStatic,
    db: Database,
    key: CryptoKey,
    envelope: Envelope,
    adapter: StorageAdapter,
  ) {
    this.SQL = SQL;
    this.db = db;
    this.key = key;
    this.envelope = envelope;
    this.adapter = adapter;
    this.db.run("PRAGMA foreign_keys=ON");
  }
  static async create(
    SQL: SqlJsStatic,
    adapter: StorageAdapter,
    password: string,
    name: string,
  ) {
    if (await adapter.load())
      throw new Error(
        "An existing workspace must be unlocked or explicitly restored.",
      );
    const db = new SQL.Database();
    db.run(schema);
    const now = new Date().toISOString();
    db.run("INSERT INTO schema_migrations VALUES(1,?)", [now]);
    db.run("INSERT INTO roles VALUES('owner','Owner','all')");
    db.run("INSERT INTO users VALUES('owner',?,'owner',?)", [
      name.trim() || "Owner",
      now,
    ]);
    db.run("INSERT INTO portfolios VALUES(?,?,?)", [
      "portfolio",
      "My portfolio",
      now,
    ]);
    const accounts = [
      ["cash", "1000", "Cash", "asset", 1],
      ["bank", "1010", "Bank", "asset", 1],
      ["receivable", "1100", "Tenant receivables", "asset", 0],
      ["assets", "1500", "Property capital", "asset", 0],
      ["deposit", "2000", "Refundable deposits", "liability", 0],
      ["loan", "2100", "Loans payable", "liability", 0],
      ["payable", "2200", "Vendor payables", "liability", 0],
      ["equity", "3000", "Owner equity", "equity", 0],
      ["rent", "4000", "Rental income", "income", 0],
      ["service", "4010", "Service charges", "income", 0],
      ["other_income", "4020", "Other billed income", "income", 0],
      ["operating", "5000", "Operating expenses", "expense", 0],
      ["interest", "5100", "Loan interest", "expense", 0],
    ];
    for (const a of accounts)
      db.run("INSERT INTO financial_accounts VALUES(?,?,?,?,?,?)", [...a, now]);
    for (const [k, v] of Object.entries({
      business_name: name || "PropertyOS",
      address: "",
      phone: "",
      email: "",
      currency: "BDT",
      locale: "en-BD",
      timezone: "Asia/Dhaka",
      terms: "Please pay by the due date. Keep this document for your records.",
      payment_instructions: "Contact the property manager for payment details.",
      theme: "light",
      auto_billing: "false",
      financial_year_start: "7",
    }))
      db.run("INSERT INTO settings VALUES(?,?,?)", [k, v, now]);
    db.run(schemaV2);
    installGuards(db);
    const salt = b64(crypto.getRandomValues(new Uint8Array(16))),
      key = await derive(password, unb64(salt));
    const e = await encrypt(db.export(), key, salt, crypto.randomUUID(), 1);
    await adapter.save(e, null);
    return new Vault(SQL, db, key, e, adapter);
  }
  static async open(
    SQL: SqlJsStatic,
    adapter: StorageAdapter,
    password: string,
  ) {
    const e = await adapter.load();
    if (!e) throw new Error("No workspace found.");
    const { bytes, key } = await decrypt(e, password);
    const db = new SQL.Database(bytes);
    const v = new Vault(SQL, db, key, e, adapter);
    if (
      v.one("SELECT MAX(version) version FROM schema_migrations")?.version === 1
    )
      await v.transaction(() => v.db.run(schemaV2));
    v.health();
    return v;
  }
  all(sql: string, params: SqlValue[] = []): Row[] {
    if (this.closed) throw new Error("Workspace is locked.");
    const s = this.db.prepare(sql);
    try {
      s.bind(params);
      const rows: Row[] = [];
      while (s.step()) rows.push(s.getAsObject());
      return rows;
    } finally {
      s.free();
    }
  }
  one(sql: string, params: SqlValue[] = []): Row | undefined {
    return this.all(sql, params)[0];
  }
  run(sql: string, params: SqlValue[] = []) {
    if (this.closed) throw new Error("Workspace is locked.");
    this.db.run(sql, params);
  }
  transaction<T>(fn: () => T): Promise<T> {
    const execute = async () => {
      if (this.closed) throw new Error("Workspace is locked.");
      const before = this.db.export();
      try {
        this.db.run("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
        const value = fn();
        this.health();
        this.db.run("COMMIT");
        const after = this.db.export();
        if (
          after.length === before.length &&
          after.every((byte, index) => byte === before[index])
        )
          return value;
        const next = await encrypt(
          after,
          this.key,
          this.envelope.salt,
          this.envelope.vaultId,
          this.envelope.revision + 1,
        );
        await this.adapter.save(next, this.envelope.revision);
        this.envelope = next;
        return value;
      } catch (e) {
        this.db.close();
        this.db = new this.SQL.Database(before);
        this.db.run("PRAGMA foreign_keys=ON");
        throw e;
      }
    };
    const result = this.queue.then(execute);
    this.queue = result.catch(() => {});
    return result;
  }
  health() {
    const integrity = this.db.exec("PRAGMA integrity_check")[0]?.values[0]?.[0];
    if (integrity !== "ok") throw new Error("Database integrity check failed.");
    if (this.db.exec("PRAGMA foreign_key_check").length)
      throw new Error("Database contains broken record links.");
    const version = this.db.exec(
      "SELECT MAX(version) FROM schema_migrations",
    )[0]?.values[0]?.[0];
    if (version !== 2) throw new Error("Unsupported database version.");
    const unbalanced = this.db.exec(
      "SELECT e.id FROM journal_entries e LEFT JOIN journal_lines l ON l.entry_id=e.id GROUP BY e.id HAVING COALESCE(SUM(l.debit-l.credit),0)<>0 OR COUNT(l.id)<2",
    );
    if (unbalanced.length) throw new Error("Journal entries do not balance.");
    if (
      this.db.exec(
        "SELECT i.id FROM invoices i LEFT JOIN invoice_items x ON x.invoice_id=i.id GROUP BY i.id HAVING i.total<>COALESCE(SUM(x.amount),0)",
      ).length
    )
      throw new Error("Invoice totals do not reconcile.");
    return {
      integrity: "ok",
      version: 2,
      revision: this.envelope.revision,
      size:
        Number(this.db.exec("PRAGMA page_count")[0].values[0][0]) *
        Number(this.db.exec("PRAGMA page_size")[0].values[0][0]),
      records: this.db
        .exec("SELECT name FROM sqlite_master WHERE type='table'")[0]
        .values.reduce(
          (n, [t]) =>
            n +
            Number(
              this.db.exec(`SELECT COUNT(*) FROM ${String(t)}`)[0].values[0][0],
            ),
          0,
        ),
    };
  }
  async backup(): Promise<Envelope> {
    await this.queue;
    this.health();
    return { ...this.envelope };
  }
  async restore(e: Envelope, password: string) {
    const execute = async () => {
      if (this.closed) throw new Error("Workspace is locked.");
      const { bytes, key } = await decrypt(e, password);
      const candidate = new this.SQL.Database(bytes);
      const old = this.db;
      this.db = candidate;
      try {
        this.db.run("PRAGMA foreign_keys=ON");
        if (
          this.one("SELECT MAX(version) version FROM schema_migrations")
            ?.version === 1
        )
          this.db.run(schemaV2);
        this.health();
        const next = await encrypt(
          this.db.export(),
          key,
          e.salt,
          e.vaultId,
          this.envelope.revision + 1,
        );
        await this.adapter.preserveBeforeRestore?.(this.envelope);
        await this.adapter.save(next, this.envelope.revision);
        this.key = key;
        this.envelope = next;
        old.close();
      } catch (err) {
        candidate.close();
        this.db = old;
        throw err;
      }
    };
    const result = this.queue.then(execute);
    this.queue = result.catch(() => {});
    return result;
  }
  async close() {
    await this.queue;
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
  changePassphrase(password: string) {
    const execute = async () => {
      if (this.closed) throw new Error("Workspace is locked.");
      this.health();
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      const key = await derive(password, unb64(salt));
      const next = await encrypt(
        this.db.export(),
        key,
        salt,
        this.envelope.vaultId,
        this.envelope.revision + 1,
      );
      await this.adapter.save(next, this.envelope.revision);
      this.key = key;
      this.envelope = next;
    };
    const result = this.queue.then(execute);
    this.queue = result.catch(() => {});
    return result;
  }
}
function installGuards(db: Database) {
  for (const table of [
    "invoices",
    "invoice_items",
    "payments",
    "payment_allocations",
    "journal_entries",
    "journal_lines",
    "credit_notes",
    "refunds",
    "security_deposits",
    "expenses",
    "expense_payments",
    "investments",
    "loans",
    "loan_transactions",
    "reversals",
    "activity_logs",
    "record_versions",
  ])
    for (const op of ["UPDATE", "DELETE"])
      db.run(
        `CREATE TRIGGER immutable_${table}_${op.toLowerCase()} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Posted records are immutable; use a correction or reversal'); END`,
      );
}
export class MemoryStorage implements StorageAdapter {
  value: Envelope | null = null;
  previous: Envelope | null = null;
  preRestore: Envelope | null = null;
  async preserveBeforeRestore(value: Envelope) {
    this.preRestore = structuredClone(value);
  }
  async load() {
    return this.value;
  }
  async save(value: Envelope, expected: number | null) {
    if ((this.value?.revision ?? null) !== expected)
      throw new Error(
        "Another session changed this workspace. Lock and reopen before continuing.",
      );
    this.previous = this.value;
    this.value = structuredClone(value);
  }
  async recovery() {
    return this.previous;
  }
}
