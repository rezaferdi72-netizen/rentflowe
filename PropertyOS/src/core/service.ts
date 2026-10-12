import { Vault, type Row } from "./vault";
import {
  minor,
  date,
  month,
  roundRatio,
  sum,
  today,
  addMonths,
  amortization,
  money,
} from "./money";
import { readImport, type ImportKind } from "./imports";
const id = () => crypto.randomUUID(),
  now = () => new Date().toISOString();
const required = (x: unknown, label: string) => {
  if (typeof x !== "string" || !x.trim() || x.length > 5000)
    throw new Error(`${label} is required (maximum 5,000 characters).`);
  return x.trim();
};
const optional = (x: unknown) => (typeof x === "string" ? x.trim() : "");
export class PropertyService {
  constructor(public v: Vault) {}
  settings() {
    return Object.fromEntries(
      this.v.all("SELECT key,value FROM settings").map((x) => [x.key, x.value]),
    );
  }
  planImport(kind: ImportKind, text: string) {
    const rows = readImport(kind, text),
      errors: string[] = [],
      prepared: Row[] = [];
    const seen = new Set<string>();
    const properties = this.list("properties"),
      units = this.list("units"),
      tenants = this.list("tenants"),
      leases = this.list("leases");
    const one = (rows: Row[], label: string) => {
      if (rows.length !== 1)
        throw new Error(`${label} must match exactly one existing record.`);
      return rows[0];
    };
    rows.forEach((x, i) => {
      try {
        let data: Row, duplicate: string;
        if (kind === "properties") {
          const name = required(x.name, "Property name");
          duplicate = name.toLowerCase();
          if (properties.some((p) => p.name.toLowerCase() === duplicate))
            throw new Error("Property name already exists.");
          data = {
            portfolio_id: "portfolio",
            name,
            category: required(x.category, "Category"),
            address: optional(x.address),
            land_area: optional(x.land_area),
            building_area: optional(x.building_area),
            acquired_on: x.acquired_on ? date(x.acquired_on) : null,
            purchase_price: money(x.purchase_price || "0"),
            registration_cost: money(x.registration_cost || "0"),
            ownership_bps: 10000,
            insurance: optional(x.insurance),
            utilities: optional(x.utilities),
            notes: optional(x.notes),
            updated_at: now(),
          };
        } else if (kind === "tenants") {
          const phone = required(x.phone, "Phone");
          duplicate = phone;
          if (tenants.some((t) => t.phone === phone))
            throw new Error(
              "Tenant phone already exists. Edit the existing tenant instead.",
            );
          data = {
            name: required(x.name, "Tenant name"),
            phone,
            email: optional(x.email),
            address: optional(x.address),
            emergency_contact: optional(x.emergency_contact),
            identification_reference: optional(x.identification_reference),
            occupation: optional(x.occupation),
            guarantor: optional(x.guarantor),
            notes: optional(x.notes),
            updated_at: now(),
          };
        } else {
          const p = one(
            properties.filter((p) => p.name === x.property_name),
            "Property name",
          );
          if (kind === "units") {
            const number = required(x.number, "Unit number");
            duplicate = p.id + ":" + number;
            if (
              units.some((u) => u.property_id === p.id && u.number === number)
            )
              throw new Error("Unit number already exists in this property.");
            data = {
              property_id: p.id,
              building_id: null,
              floor_id: null,
              number,
              type: required(x.type, "Unit type"),
              size: optional(x.size),
              monthly_rent: money(x.monthly_rent || "0"),
              service_charge: money(x.service_charge || "0"),
              deposit_required: money(x.deposit_required || "0"),
              notes: optional(x.notes),
              updated_at: now(),
            };
          } else {
            const u = one(
              units.filter(
                (u) => u.property_id === p.id && u.number === x.unit_number,
              ),
              "Unit number",
            );
            if (u.status === "retired")
              throw new Error("Retired units cannot be leased.");
            const t = one(
              tenants.filter((t) => t.phone === x.tenant_phone),
              "Tenant phone",
            );
            const start = date(x.start_date),
              end = date(x.end_date);
            if (end < start)
              throw new Error("Lease end date must be on or after start date.");
            const overlap = (l: Row) =>
              l.unit_id === u.id &&
              start <= (l.move_out_date || l.end_date) &&
              end >= l.start_date;
            if (leases.some(overlap) || prepared.some(overlap))
              throw new Error("Lease overlaps another lease for this unit.");
            const day = (v: string, fallback: number, max: number, min = 1) => {
              const n = v ? Number(v) : fallback;
              if (!Number.isInteger(n) || n < min || n > max)
                throw new Error(
                  `Day must be a whole number from ${min} to ${max}.`,
                );
              return n;
            };
            if (
              x.prorate &&
              !["true", "false", "1", "0"].includes(x.prorate.toLowerCase())
            )
              throw new Error("Prorate must be true or false.");
            duplicate = u.id + ":" + start;
            data = {
              unit_id: u.id,
              tenant_id: t.id,
              start_date: start,
              end_date: end,
              rent: money(required(x.rent, "Monthly rent")),
              service_charge: money(x.service_charge || "0"),
              deposit: money(x.deposit || "0"),
              billing_day: day(x.billing_day, 1, 28),
              due_day: day(x.due_day, 10, 28),
              prorate: ["false", "0"].includes(x.prorate?.toLowerCase())
                ? 0
                : 1,
              late_fee: money(x.late_fee || "0"),
              grace_days: day(x.grace_days, 0, 90, 0),
              termination_terms: optional(x.termination_terms),
              updated_at: now(),
            };
          }
        }
        if (seen.has(duplicate))
          throw new Error("Duplicate record in this file.");
        seen.add(duplicate);
        prepared.push(data);
      } catch (error) {
        errors.push(`Data row ${i + 1}: ${(error as Error).message}`);
      }
    });
    return { rows, prepared, errors };
  }
  importRecords(kind: ImportKind, text: string) {
    return this.v.transaction(() => {
      const plan = this.planImport(kind, text);
      if (plan.errors.length)
        throw new Error(plan.errors.slice(0, 5).join("\n"));
      for (const data of plan.prepared) this.create(kind, data);
      this.audit(
        "import",
        kind,
        "imported",
        `${plan.prepared.length} validated records`,
      );
      return plan.prepared.length;
    });
  }
  today() {
    return today(this.settings().timezone);
  }
  private get(table: string, key: string) {
    const r = this.v.one(`SELECT * FROM ${table} WHERE id=?`, [key]);
    if (!r) throw new Error("The selected record no longer exists.");
    return r;
  }
  private insert(table: string, data: Row) {
    const keys = Object.keys(data);
    this.v.run(
      `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
      keys.map((k) => data[k] ?? null),
    );
    return data.id as string;
  }
  private audit(type: string, key: string, action: string, details = "") {
    this.insert("activity_logs", {
      id: id(),
      actor_id: "owner",
      entity_type: type,
      entity_id: key,
      action,
      details,
      created_at: now(),
    });
  }
  private create(table: string, data: Row) {
    const key = id();
    this.insert(table, { id: key, ...data, created_at: now() });
    this.audit(table, key, "created");
    return key;
  }
  private context(leaseId: string) {
    return (
      this.v.one(
        "SELECT l.*,u.property_id,u.number unit_number,p.name property_name,t.name tenant_name,t.phone tenant_phone FROM leases l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id JOIN tenants t ON t.id=l.tenant_id WHERE l.id=?",
        [leaseId],
      ) ??
      (() => {
        throw new Error("Lease not found.");
      })()
    );
  }
  private scope(property: string, unit?: string) {
    this.get("properties", property);
    if (unit && this.get("units", unit).property_id !== property)
      throw new Error("Unit does not belong to the selected property.");
  }
  private cash(account: string) {
    const a = this.get("financial_accounts", account);
    if (!a.cash) throw new Error("Select a cash or bank account.");
  }
  private journal(
    type: string,
    event: string,
    when: string,
    description: string,
    lines: { account: string; debit?: number; credit?: number }[],
    scope: Row = {},
  ) {
    date(when);
    const deb = sum(lines.map((l) => minor(l.debit ?? 0))),
      cred = sum(lines.map((l) => minor(l.credit ?? 0)));
    if (deb === 0 || deb !== cred)
      throw new Error("Financial posting must have equal debits and credits.");
    const key = id();
    this.insert("journal_entries", {
      id: key,
      event_type: type,
      event_id: event,
      entry_date: when,
      description,
      property_id: scope.property_id,
      unit_id: scope.unit_id,
      tenant_id: scope.tenant_id,
      reverses_id: scope.reverses_id,
      created_at: now(),
    });
    for (const l of lines) {
      if ((l.debit ?? 0) + (l.credit ?? 0) === 0) continue;
      this.insert("journal_lines", {
        id: id(),
        entry_id: key,
        account_id: l.account,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
      });
    }
    return key;
  }
  addProperty(x: Row) {
    return this.v.transaction(() =>
      this.create("properties", {
        portfolio_id: "portfolio",
        name: required(x.name, "Property name"),
        category: required(x.category, "Category"),
        address: optional(x.address),
        land_area: optional(x.land_area),
        building_area: optional(x.building_area),
        acquired_on: x.acquired_on ? date(x.acquired_on) : null,
        purchase_price: minor(x.purchase_price ?? 0),
        registration_cost: minor(x.registration_cost ?? 0),
        ownership_bps: 10000,
        insurance: optional(x.insurance),
        utilities: optional(x.utilities),
        notes: optional(x.notes),
        updated_at: now(),
      }),
    );
  }
  addBuilding(x: Row) {
    return this.v.transaction(() => {
      this.get("properties", x.property_id);
      return this.create("buildings", {
        property_id: x.property_id,
        name: required(x.name, "Building name"),
      });
    });
  }
  addFloor(x: Row) {
    return this.v.transaction(() => {
      this.get("buildings", x.building_id);
      return this.create("floors", {
        building_id: x.building_id,
        name: required(x.name, "Floor name"),
      });
    });
  }
  addUnit(x: Row) {
    return this.v.transaction(() => {
      this.scope(x.property_id);
      if (
        x.building_id &&
        this.get("buildings", x.building_id).property_id !== x.property_id
      )
        throw new Error("Building must belong to property.");
      if (
        x.floor_id &&
        this.get("floors", x.floor_id).building_id !== x.building_id
      )
        throw new Error("Floor must belong to building.");
      return this.create("units", {
        property_id: x.property_id,
        building_id: x.building_id || null,
        floor_id: x.floor_id || null,
        number: required(x.number, "Unit number"),
        type: required(x.type, "Unit type"),
        size: optional(x.size),
        monthly_rent: minor(x.monthly_rent),
        service_charge: minor(x.service_charge ?? 0),
        deposit_required: minor(x.deposit_required ?? 0),
        notes: optional(x.notes),
        updated_at: now(),
      });
    });
  }
  addTenant(x: Row) {
    return this.v.transaction(() =>
      this.create("tenants", {
        name: required(x.name, "Tenant name"),
        phone: required(x.phone, "Phone"),
        email: optional(x.email),
        address: optional(x.address),
        emergency_contact: optional(x.emergency_contact),
        identification_reference: optional(x.identification_reference),
        occupation: optional(x.occupation),
        guarantor: optional(x.guarantor),
        notes: optional(x.notes),
        updated_at: now(),
      }),
    );
  }
  addLease(x: Row) {
    return this.v.transaction(() => {
      const u = this.get("units", x.unit_id);
      if (u.status !== "available")
        throw new Error("This unit is unavailable for leasing.");
      this.get("tenants", x.tenant_id);
      date(x.start_date);
      date(x.end_date);
      if (x.end_date < x.start_date)
        throw new Error("Lease end must follow lease start.");
      for (const k of ["billing_day", "due_day"])
        if (!Number.isInteger(x[k]) || x[k] < 1 || x[k] > 28)
          throw new Error("Billing and due days must be between 1 and 28.");
      if (x.renewed_from) {
        const old = this.get("leases", x.renewed_from);
        if (
          old.unit_id !== x.unit_id ||
          old.tenant_id !== x.tenant_id ||
          x.start_date <= (old.move_out_date || old.end_date)
        )
          throw new Error(
            "Renewals must follow the previous lease for the same tenant and unit.",
          );
      }
      return this.create("leases", {
        unit_id: x.unit_id,
        tenant_id: x.tenant_id,
        start_date: x.start_date,
        end_date: x.end_date,
        rent: minor(x.rent),
        service_charge: minor(x.service_charge ?? 0),
        billing_day: x.billing_day,
        due_day: x.due_day,
        deposit: minor(x.deposit ?? 0),
        prorate: x.prorate === false ? 0 : 1,
        late_fee: minor(x.late_fee ?? 0),
        grace_days: Number(x.grace_days ?? 0),
        renewed_from: x.renewed_from || null,
        termination_terms: optional(x.termination_terms),
        updated_at: now(),
      });
    });
  }
  endLease(leaseId: string, when: string) {
    return this.v.transaction(() => {
      const l = this.get("leases", leaseId);
      date(when);
      if (when < l.start_date || when > l.end_date)
        throw new Error("Move-out must be within the lease period.");
      if (
        this.v.one("SELECT id FROM invoices WHERE lease_id=? AND month>?", [
          leaseId,
          when.slice(0, 7),
        ])
      )
        throw new Error(
          "Reverse later invoices before ending the lease early.",
        );
      this.v.run(
        "UPDATE leases SET status='ended',move_out_date=?,updated_at=? WHERE id=?",
        [when, now(), leaseId],
      );
      this.audit("leases", leaseId, "ended");
    });
  }
  scheduleRent(x: Row) {
    return this.v.transaction(() => {
      const l = this.get("leases", x.lease_id);
      date(x.effective_on);
      if (x.effective_on < l.start_date || x.effective_on > l.end_date)
        throw new Error("Rent increase date must be inside the lease.");
      return this.create("lease_rent_schedules", {
        lease_id: l.id,
        effective_on: x.effective_on,
        rent: minor(x.rent),
      });
    });
  }
  addMeter(x: Row) {
    return this.v.transaction(() => {
      this.get("units", x.unit_id);
      return this.create("utility_meters", {
        unit_id: x.unit_id,
        name: required(x.name, "Meter name"),
        rate: minor(x.rate),
      });
    });
  }
  addReading(x: Row) {
    return this.v.transaction(() => {
      const m = this.get("utility_meters", x.meter_id);
      month(x.month);
      const prev = Number(x.previous_reading),
        curr = Number(x.current_reading);
      if (
        !Number.isSafeInteger(prev) ||
        !Number.isSafeInteger(curr) ||
        prev < 0 ||
        curr < prev
      )
        throw new Error("Meter readings must be increasing whole numbers.");
      if (
        this.v.one(
          "SELECT i.id FROM invoices i JOIN leases l ON l.id=i.lease_id WHERE l.unit_id=? AND i.month=? AND i.kind='rent'",
          [m.unit_id, x.month],
        )
      )
        throw new Error(
          "Enter meter readings before issuing the monthly invoice.",
        );
      return this.create("meter_readings", {
        meter_id: m.id,
        month: x.month,
        previous_reading: prev,
        current_reading: curr,
      });
    });
  }
  private charges(l: Row, m: string) {
    const start = m + "-01",
      end = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10),
      days = Number(end.slice(-2)),
      from = l.start_date > start ? l.start_date : start,
      to =
        (l.move_out_date || l.end_date) < end
          ? l.move_out_date || l.end_date
          : end;
    if (from > to) return [];
    const schedules = this.v.all(
      "SELECT * FROM lease_rent_schedules WHERE lease_id=? AND effective_on<=? ORDER BY effective_on",
      [l.id, to],
    );
    let amount = 0n,
      activeDays = 0;
    for (let day = 1; day <= days; day++) {
      const d = m + "-" + String(day).padStart(2, "0");
      if (d < from || d > to) continue;
      const rate =
        schedules.filter((s) => s.effective_on <= d).at(-1)?.rent ?? l.rent;
      amount += BigInt(rate);
      activeDays++;
    }
    const items = [
      {
        description: `Rent · ${m}${l.prorate && activeDays < days ? ` (${activeDays}/${days} days)` : ""}`,
        amount: l.prorate
          ? roundRatio(amount, BigInt(days))
          : (schedules.filter((s) => s.effective_on <= from).at(-1)?.rent ??
            l.rent),
        account: "rent",
      },
      {
        description: "Service charge",
        amount: l.prorate
          ? roundRatio(
              BigInt(l.service_charge) * BigInt(activeDays),
              BigInt(days),
            )
          : l.service_charge,
        account: "service",
      },
    ];
    for (const r of this.v.all(
      "SELECT m.*,r.previous_reading,r.current_reading FROM utility_meters m JOIN meter_readings r ON r.meter_id=m.id WHERE m.unit_id=? AND r.month=?",
      [l.unit_id, m],
    ))
      items.push({
        description: `${r.name} (${r.current_reading - r.previous_reading} units)`,
        amount: roundRatio(
          BigInt(r.current_reading - r.previous_reading) * BigInt(r.rate),
          1n,
        ),
        account: "other_income",
      });
    return items.filter((x) => x.amount > 0);
  }
  private number(prefix: string, table: string) {
    const n = Number(this.v.one(`SELECT COUNT(*) n FROM ${table}`)!.n) + 1;
    return `${prefix}-${String(n).padStart(6, "0")}`;
  }
  private issue(
    l: Row,
    m: string,
    items: { description: string; amount: number; account: string }[],
    issue: string,
    due: string,
    kind = "rent",
  ) {
    const total = sum(items.map((x) => minor(x.amount))),
      key = id();
    if (total === 0) return null;
    const previous = this.leaseBalance(l.id);
    const j = this.journal(
      "invoice",
      key,
      issue,
      `Invoice ${m}`,
      [
        { account: "receivable", debit: total },
        ...items.map((x) => ({ account: x.account, credit: x.amount })),
      ],
      l,
    );
    const snapshot = JSON.stringify({
      business: this.settings(),
      tenant: l.tenant_name,
      phone: l.tenant_phone,
      property: l.property_name,
      unit: l.unit_number,
      previous_balance: previous,
      account_payable: sum([previous, total]),
    });
    this.insert("invoices", {
      id: key,
      number: this.number("INV", "invoices"),
      lease_id: l.id,
      month: m,
      issue_date: issue,
      due_date: due,
      total,
      snapshot,
      kind,
      journal_id: j,
      created_at: now(),
    });
    for (const x of items)
      this.insert("invoice_items", {
        id: id(),
        invoice_id: key,
        description: x.description,
        amount: x.amount,
        account_id: x.account,
      });
    this.allocate(l.id);
    this.audit("invoices", key, "issued");
    return key;
  }
  customInvoice(x: Row) {
    return this.v.transaction(() => {
      const l = this.context(x.lease_id);
      month(x.month);
      date(x.issue_date);
      date(x.due_date);
      if (x.due_date < x.issue_date)
        throw new Error("Due date cannot predate the issue date.");
      return this.issue(
        l,
        x.month,
        [
          {
            description: required(x.description, "Charge description"),
            amount: minor(x.amount, true),
            account: "other_income",
          },
        ],
        x.issue_date,
        x.due_date,
        "custom",
      );
    });
  }
  billMonth(m: string, leaseId?: string) {
    month(m);
    return this.v.transaction(() => {
      let generated = 0;
      const ls = leaseId
        ? [this.context(leaseId)]
        : this.v.all("SELECT id FROM leases").map((x) => this.context(x.id));
      for (const l of ls) {
        if (
          this.v.one(
            "SELECT id FROM invoices WHERE lease_id=? AND month=? AND kind='rent'",
            [l.id, m],
          )
        )
          continue;
        const items = this.charges(l, m);
        if (!items.length) continue;
        const issue = [
          m + "-" + String(l.billing_day).padStart(2, "0"),
          l.start_date,
        ]
          .sort()
          .at(-1)!;
        const due = [m + "-" + String(l.due_day).padStart(2, "0"), issue]
          .sort()
          .at(-1)!;
        if (this.issue(l, m, items, issue, due)) generated++;
      }
      return generated;
    });
  }
  invoiceBalance(invoiceId: string, asOf = this.today()): number {
    const i = this.get("invoices", invoiceId);
    if (
      i.issue_date > asOf ||
      this.v.one(
        "SELECT id FROM reversals WHERE event_type='invoice' AND event_id=? AND reversal_date<=?",
        [i.id, asOf],
      )
    )
      return 0;
    const paid = Number(
      this.v.one(
        "SELECT COALESCE(SUM(a.amount),0) n FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.invoice_id=? AND p.payment_date<=? AND NOT EXISTS(SELECT 1 FROM reversals r WHERE r.event_type='payment' AND r.event_id=p.id AND r.reversal_date<=?)",
        [i.id, asOf, asOf],
      )!.n,
    );
    const credits = Number(
      this.v.one(
        "SELECT COALESCE(SUM(amount),0) n FROM credit_notes WHERE invoice_id=? AND entry_date<=?",
        [i.id, asOf],
      )!.n,
    );
    return Math.max(0, sum([i.total, -paid, -credits]));
  }
  private unallocated(p: Row) {
    if (
      this.v.one(
        "SELECT id FROM reversals WHERE event_type='payment' AND event_id=?",
        [p.id],
      )
    )
      return 0;
    return sum([
      p.amount,
      -Number(
        this.v.one(
          "SELECT COALESCE(SUM(amount),0) n FROM payment_allocations WHERE payment_id=?",
          [p.id],
        )!.n,
      ),
      -Number(
        this.v.one(
          "SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE payment_id=?",
          [p.id],
        )!.n,
      ),
    ]);
  }
  private allocate(leaseId: string) {
    const ps = this.v.all(
      "SELECT * FROM payments p WHERE lease_id=? AND NOT EXISTS(SELECT 1 FROM reversals r WHERE r.event_type='payment' AND r.event_id=p.id) ORDER BY payment_date,created_at,id",
      [leaseId],
    );
    const inv = this.v.all(
      "SELECT * FROM invoices i WHERE lease_id=? AND NOT EXISTS(SELECT 1 FROM reversals r WHERE r.event_type='invoice' AND r.event_id=i.id) ORDER BY issue_date,created_at,id",
      [leaseId],
    );
    for (const p of ps) {
      let available = this.unallocated(p);
      for (const i of inv) {
        if (available <= 0) break;
        const due = this.invoiceBalance(i.id, "9999-12-31");
        const amount = Math.min(available, due);
        if (amount > 0) {
          this.insert("payment_allocations", {
            id: id(),
            payment_id: p.id,
            invoice_id: i.id,
            amount,
            created_at: now(),
          });
          available -= amount;
        }
      }
    }
  }
  recordPayment(x: Row) {
    return this.v.transaction(() => {
      const l = this.context(x.lease_id),
        amount = minor(x.amount, true);
      date(x.payment_date);
      this.cash(x.account_id);
      if (x.payment_date > this.today())
        throw new Error("A posted payment cannot be dated in the future.");
      this.allocate(l.id);
      let remaining = amount;
      const allocations: Row[] = [];
      for (const invoice of this.v.all(
        "SELECT * FROM invoices i WHERE lease_id=? AND NOT EXISTS(SELECT 1 FROM reversals r WHERE r.event_type='invoice' AND r.event_id=i.id) ORDER BY issue_date,created_at,id",
        [l.id],
      )) {
        const applied = Math.min(
          remaining,
          this.invoiceBalance(invoice.id, "9999-12-31"),
        );
        if (applied > 0) {
          allocations.push({ description: invoice.number, amount: applied });
          remaining -= applied;
        }
        if (remaining === 0) break;
      }
      const previousBalance = this.leaseBalance(l.id);
      const key = id();
      const j = this.journal(
        "payment",
        key,
        x.payment_date,
        "Rent payment",
        [
          { account: x.account_id, debit: amount },
          { account: "receivable", credit: amount },
        ],
        l,
      );
      const number = this.number("PAY", "payments"),
        receipt_number = this.number("RCT", "payments");
      const snapshot = JSON.stringify({
        business: this.settings(),
        tenant: l.tenant_name,
        phone: l.tenant_phone,
        property: l.property_name,
        unit: l.unit_number,
        balance_after: sum([previousBalance, -amount]),
        allocations,
        advance: remaining,
      });
      this.insert("payments", {
        id: key,
        number,
        receipt_number,
        snapshot,
        lease_id: l.id,
        payment_date: x.payment_date,
        amount,
        method: required(x.method, "Payment method"),
        account_id: x.account_id,
        reference: optional(x.reference),
        notes: optional(x.notes),
        journal_id: j,
        created_at: now(),
      });
      this.allocate(l.id);
      this.audit("payments", key, "posted");
      return key;
    });
  }
  reverse(
    type: "payment" | "invoice" | "expense",
    key: string,
    reason: string,
    when = this.today(),
  ) {
    return this.v.transaction(() => {
      const table =
        type === "payment"
          ? "payments"
          : type === "invoice"
            ? "invoices"
            : "expenses";
      const event = this.get(table, key);
      date(when);
      const original = this.get("journal_entries", event.journal_id);
      if (when < original.entry_date || when > this.today())
        throw new Error(
          "Reversal date must be between the original posting and today.",
        );
      if (
        this.v.one(
          "SELECT id FROM reversals WHERE event_type=? AND event_id=?",
          [type, key],
        )
      )
        throw new Error("This transaction has already been reversed.");
      if (
        type === "invoice" &&
        (this.v.one("SELECT id FROM credit_notes WHERE invoice_id=?", [key]) ||
          this.v
            .all(
              "SELECT p.* FROM payments p JOIN payment_allocations a ON a.payment_id=p.id WHERE a.invoice_id=?",
              [key],
            )
            .some(
              (p) =>
                !this.v.one(
                  "SELECT id FROM reversals WHERE event_type='payment' AND event_id=?",
                  [p.id],
                ),
            ))
      )
        throw new Error(
          "Reverse allocated payments before reversing this invoice.",
        );
      if (
        type === "payment" &&
        this.v.one("SELECT id FROM refunds WHERE payment_id=?", [key])
      )
        throw new Error("Refunded payments cannot be reversed.");
      if (
        type === "expense" &&
        this.v.one("SELECT id FROM expense_payments WHERE expense_id=?", [key])
      )
        throw new Error(
          "Paid vendor bills require a separate accounting correction.",
        );
      const r = id();
      const lines = this.v
        .all("SELECT * FROM journal_lines WHERE entry_id=?", [original.id])
        .map((l) => ({
          account: l.account_id,
          debit: l.credit,
          credit: l.debit,
        }));
      const j = this.journal(
        "reversal",
        r,
        when,
        required(reason, "Reversal reason"),
        lines,
        { ...original, reverses_id: original.id },
      );
      this.insert("reversals", {
        id: r,
        event_type: type,
        event_id: key,
        reason: reason.trim(),
        reversal_date: when,
        journal_id: j,
        created_at: now(),
      });
      this.audit(table, key, "reversed");
      return r;
    });
  }
  creditInvoice(x: Row) {
    return this.v.transaction(() => {
      const i = this.get("invoices", x.invoice_id),
        l = this.context(i.lease_id),
        amount = minor(x.amount, true);
      date(x.entry_date);
      if (
        x.entry_date < i.issue_date ||
        amount > this.invoiceBalance(i.id, "9999-12-31")
      )
        throw new Error(
          "Credit exceeds the unpaid invoice balance or predates the invoice.",
        );
      const key = id(),
        j = this.journal(
          "credit",
          key,
          x.entry_date,
          required(x.reason, "Reason"),
          [
            { account: "other_income", debit: amount },
            { account: "receivable", credit: amount },
          ],
          l,
        );
      this.insert("credit_notes", {
        id: key,
        number: this.number("CRN", "credit_notes"),
        invoice_id: i.id,
        amount,
        reason: x.reason,
        entry_date: x.entry_date,
        journal_id: j,
        created_at: now(),
      });
      this.audit("credit_notes", key, "posted");
      return key;
    });
  }
  refundAdvance(x: Row) {
    return this.v.transaction(() => {
      const p = this.get("payments", x.payment_id),
        amount = minor(x.amount, true);
      this.cash(x.account_id);
      date(x.entry_date);
      if (amount > this.unallocated(p) || x.entry_date < p.payment_date)
        throw new Error(
          "Only available unallocated advance credit may be refunded.",
        );
      const l = this.context(p.lease_id),
        key = id(),
        j = this.journal(
          "refund",
          key,
          x.entry_date,
          required(x.reason, "Reason"),
          [
            { account: "receivable", debit: amount },
            { account: x.account_id, credit: amount },
          ],
          l,
        );
      this.insert("refunds", {
        id: key,
        payment_id: p.id,
        amount,
        entry_date: x.entry_date,
        account_id: x.account_id,
        reason: x.reason,
        journal_id: j,
        created_at: now(),
      });
      this.audit("refunds", key, "posted");
      return key;
    });
  }
  private ledgerBalance(where: string, args: any[], asOf = "9999-12-31") {
    return Number(
      this.v.one(
        `SELECT COALESCE(SUM(l.debit-l.credit),0) n FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id='receivable' AND ${where} AND e.entry_date<=?`,
        [...args, asOf],
      )!.n,
    );
  }
  leaseBalance(key: string, asOf = "9999-12-31") {
    const l = this.get("leases", key);
    return this.ledgerBalance(
      "e.unit_id=? AND e.tenant_id=? AND e.event_id IN (SELECT id FROM invoices WHERE lease_id=? UNION SELECT id FROM payments WHERE lease_id=? UNION SELECT c.id FROM credit_notes c JOIN invoices i ON i.id=c.invoice_id WHERE i.lease_id=? UNION SELECT r.id FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.lease_id=? UNION SELECT r.id FROM reversals r WHERE r.event_id IN (SELECT id FROM invoices WHERE lease_id=? UNION SELECT id FROM payments WHERE lease_id=?))",
      [l.unit_id, l.tenant_id, ...Array(6).fill(key)],
      asOf,
    );
  }
  tenantBalance(key: string, asOf = "9999-12-31") {
    this.get("tenants", key);
    return this.ledgerBalance("e.tenant_id=?", [key], asOf);
  }
  statement(tenant: string, from: string, to: string) {
    date(from);
    date(to);
    if (from > to) throw new Error("Start date must be before end date.");
    const rows = this.v.all(
      "SELECT e.id,e.entry_date date,e.event_type,e.event_id,e.description,e.created_at,SUM(l.debit) charge,SUM(l.credit) payment FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id WHERE e.tenant_id=? AND l.account_id='receivable' AND e.entry_date<=? GROUP BY e.id ORDER BY e.entry_date,e.created_at,e.id",
      [tenant, to],
    );
    let balance = 0,
      opening = 0;
    const result: Row[] = [];
    for (const r of rows) {
      balance = sum([balance, r.charge, -r.payment]);
      if (r.date < from) opening = balance;
      else result.push({ ...r, balance });
    }
    return { opening, closing: balance, rows: result };
  }
  depositBalance(lease: string) {
    return Number(
      this.v.one(
        "SELECT COALESCE(SUM(CASE WHEN direction='received' THEN amount ELSE -amount END),0) n FROM security_deposits WHERE lease_id=?",
        [lease],
      )!.n,
    );
  }
  recordDeposit(x: Row) {
    return this.v.transaction(() => {
      const l = this.context(x.lease_id),
        amount = minor(x.amount, true);
      date(x.entry_date);
      this.cash(x.account_id);
      if (!["received", "refunded"].includes(x.direction))
        throw new Error("Select deposit received or refunded.");
      if (x.direction === "refunded" && amount > this.depositBalance(l.id))
        throw new Error("Refund exceeds the deposit held.");
      const key = id(),
        receive = x.direction === "received";
      const j = this.journal(
        "deposit",
        key,
        x.entry_date,
        receive ? "Security deposit received" : "Security deposit refunded",
        [
          { account: x.account_id, [receive ? "debit" : "credit"]: amount },
          { account: "deposit", [receive ? "credit" : "debit"]: amount },
        ],
        l,
      );
      this.insert("security_deposits", {
        id: key,
        lease_id: l.id,
        entry_date: x.entry_date,
        amount,
        direction: x.direction,
        account_id: x.account_id,
        reference: optional(x.reference),
        journal_id: j,
        created_at: now(),
      });
      this.audit("security_deposits", key, "posted");
      return key;
    });
  }
  addVendor(x: Row) {
    return this.v.transaction(() =>
      this.create("vendors", {
        name: required(x.name, "Vendor name"),
        phone: optional(x.phone),
        notes: optional(x.notes),
      }),
    );
  }
  recordExpense(x: Row) {
    return this.v.transaction(() => this.expense(x));
  }
  private expense(x: Row) {
    this.scope(x.property_id, x.unit_id);
    if (x.vendor_id) this.get("vendors", x.vendor_id);
    const amount = minor(x.amount, true);
    date(x.entry_date);
    if (x.account_id) this.cash(x.account_id);
    const key = id(),
      j = this.journal(
        "expense",
        key,
        x.entry_date,
        required(x.description, "Description"),
        [
          { account: x.capital ? "assets" : "operating", debit: amount },
          { account: x.account_id || "payable", credit: amount },
        ],
        x,
      );
    this.insert("expenses", {
      id: key,
      property_id: x.property_id,
      unit_id: x.unit_id || null,
      vendor_id: x.vendor_id || null,
      category: required(x.category, "Category"),
      description: x.description,
      entry_date: x.entry_date,
      amount,
      capital: x.capital ? 1 : 0,
      account_id: x.account_id || null,
      journal_id: j,
      created_at: now(),
    });
    this.audit("expenses", key, "posted");
    return key;
  }
  payExpense(x: Row) {
    return this.v.transaction(() => {
      const e = this.get("expenses", x.expense_id);
      const amount = minor(x.amount, true),
        paid = Number(
          this.v.one(
            "SELECT COALESCE(SUM(amount),0) n FROM expense_payments WHERE expense_id=?",
            [e.id],
          )!.n,
        );
      if (
        e.account_id ||
        this.v.one(
          "SELECT id FROM reversals WHERE event_type='expense' AND event_id=?",
          [e.id],
        ) ||
        amount > e.amount - paid
      )
        throw new Error("Payment exceeds the unpaid vendor bill.");
      date(x.entry_date);
      if (x.entry_date < e.entry_date)
        throw new Error("Payment cannot predate the vendor bill.");
      this.cash(x.account_id);
      const key = id(),
        j = this.journal(
          "expense_payment",
          key,
          x.entry_date,
          "Vendor bill payment",
          [
            { account: "payable", debit: amount },
            { account: x.account_id, credit: amount },
          ],
          e,
        );
      this.insert("expense_payments", {
        id: key,
        expense_id: e.id,
        entry_date: x.entry_date,
        amount,
        account_id: x.account_id,
        journal_id: j,
        created_at: now(),
      });
      this.audit("expense_payments", key, "posted");
      return key;
    });
  }
  addRecurringExpense(x: Row) {
    return this.v.transaction(() => {
      this.scope(x.property_id);
      this.cash(x.account_id);
      month(x.start_month);
      if (x.end_month) {
        month(x.end_month);
        if (x.end_month < x.start_month)
          throw new Error("End month must follow start month.");
      }
      return this.create("recurring_expenses", {
        property_id: x.property_id,
        description: required(x.description, "Description"),
        category: required(x.category, "Category"),
        amount: minor(x.amount, true),
        account_id: x.account_id,
        start_month: x.start_month,
        end_month: x.end_month || null,
      });
    });
  }
  recordInvestment(x: Row) {
    return this.v.transaction(() => {
      this.scope(x.property_id);
      date(x.entry_date);
      this.cash(x.account_id);
      const amount = minor(x.amount, true),
        key = id(),
        j = this.journal(
          "investment",
          key,
          x.entry_date,
          required(x.description, "Description"),
          [
            { account: "assets", debit: amount },
            { account: x.account_id, credit: amount },
          ],
          x,
        );
      this.insert("investments", {
        id: key,
        property_id: x.property_id,
        entry_date: x.entry_date,
        category: required(x.category, "Category"),
        amount,
        description: x.description,
        account_id: x.account_id,
        journal_id: j,
        created_at: now(),
      });
      this.audit("investments", key, "posted");
      return key;
    });
  }
  addValuation(x: Row) {
    return this.v.transaction(() => {
      this.scope(x.property_id);
      date(x.valuation_date);
      return this.create("property_valuations", {
        property_id: x.property_id,
        valuation_date: x.valuation_date,
        value: minor(x.value),
        notes: optional(x.notes),
      });
    });
  }
  addLoan(x: Row) {
    return this.v.transaction(() => {
      this.scope(x.property_id);
      date(x.start_date);
      this.cash(x.account_id);
      amortization(x.principal, x.annual_rate_bps, x.term_months);
      const key = id(),
        j = this.journal(
          "loan",
          key,
          x.start_date,
          "Loan disbursement",
          [
            { account: x.account_id, debit: x.principal },
            { account: "loan", credit: x.principal },
          ],
          x,
        );
      this.insert("loans", {
        id: key,
        property_id: x.property_id,
        lender: required(x.lender, "Lender"),
        principal: x.principal,
        annual_rate_bps: x.annual_rate_bps,
        term_months: x.term_months,
        start_date: x.start_date,
        due_day: Number(x.due_day ?? 10),
        account_id: x.account_id,
        journal_id: j,
        created_at: now(),
      });
      this.audit("loans", key, "posted");
      return key;
    });
  }
  addOwner(x: Row) {
    return this.v.transaction(() =>
      this.create("owners", {
        name: required(x.name, "Owner name"),
        contact: optional(x.contact),
      }),
    );
  }
  recordOwnerTransaction(x: Row) {
    return this.v.transaction(() => {
      this.get("owners", x.owner_id);
      if (x.property_id) this.scope(x.property_id);
      this.cash(x.account_id);
      date(x.entry_date);
      if (!["contribution", "distribution"].includes(x.direction))
        throw new Error("Choose contribution or distribution.");
      const amount = minor(x.amount, true),
        key = id(),
        receive = x.direction === "contribution";
      const description = required(x.description, "Description");
      const journal = this.journal(
        "owner_transaction",
        key,
        x.entry_date,
        description,
        [
          { account: x.account_id, [receive ? "debit" : "credit"]: amount },
          { account: "equity", [receive ? "credit" : "debit"]: amount },
        ],
        x,
      );
      this.insert("owner_transactions", {
        id: key,
        owner_id: x.owner_id,
        property_id: x.property_id || null,
        entry_date: x.entry_date,
        direction: x.direction,
        amount,
        account_id: x.account_id,
        description,
        journal_id: journal,
        created_at: now(),
      });
      this.audit("owner_transactions", key, "posted");
      return key;
    });
  }
  addInvestmentAsset(x: Row) {
    return this.v.transaction(() => {
      if (x.property_id) this.scope(x.property_id);
      date(x.opened_on);
      return this.create("investment_assets", {
        name: required(x.name, "Investment name"),
        category: required(x.category, "Investment type"),
        property_id: x.property_id || null,
        opened_on: x.opened_on,
        institution: optional(x.institution),
        notes: optional(x.notes),
      });
    });
  }
  investmentPosition(asset: string, asOf = "9999-12-31") {
    this.get("investment_assets", asset);
    const rows = this.v.all(
      "SELECT t.*,COALESCE((SELECT r.reversal_date FROM reversals r WHERE r.event_type='investment_transaction' AND r.event_id=t.id),'9999-12-31') reversed_on FROM investment_transactions t WHERE asset_id=? AND entry_date<=?",
      [asset, asOf],
    );
    let balance = 0,
      purchases = 0,
      proceeds = 0,
      realized = 0;
    for (const t of rows) {
      if (t.reversed_on !== "9999-12-31" && t.reversed_on <= asOf) continue;
      if (t.kind === "purchase") {
        balance = sum([balance, t.principal]);
        purchases = sum([purchases, t.amount]);
      } else if (t.kind === "redemption") {
        balance = sum([balance, -t.principal]);
        proceeds = sum([proceeds, t.amount]);
        realized = sum([realized, t.amount, -t.principal]);
      } else realized = sum([realized, t.amount]);
    }
    return { balance, purchases, proceeds, realized };
  }
  private validateInvestmentTimeline(asset: string) {
    const rows = this.v.all(
      `SELECT entry_date, SUM(CASE WHEN kind='purchase' THEN principal WHEN kind='redemption' THEN -principal ELSE 0 END) movement FROM investment_transactions t WHERE asset_id=? AND NOT EXISTS(SELECT 1 FROM reversals r WHERE r.event_type='investment_transaction' AND r.event_id=t.id) GROUP BY entry_date ORDER BY entry_date`,
      [asset],
    );
    let balance = 0;
    for (const r of rows) {
      balance = sum([balance, r.movement]);
      if (balance < 0)
        throw new Error(
          "This change would redeem more principal than was invested. Check transaction dates and reverse later redemptions first.",
        );
    }
  }
  recordAssetTransaction(x: Row) {
    return this.v.transaction(() => {
      const asset = this.get("investment_assets", x.asset_id);
      date(x.entry_date);
      this.cash(x.account_id);
      if (x.entry_date < asset.opened_on)
        throw new Error(
          "Transaction date cannot precede the investment opening date.",
        );
      if (!["purchase", "income", "redemption"].includes(x.kind))
        throw new Error("Choose purchase, income or redemption.");
      const amount = minor(x.amount, x.kind !== "redemption");
      const principal =
        x.kind === "purchase"
          ? amount
          : x.kind === "income"
            ? 0
            : minor(x.principal, true);
      if (
        x.kind === "redemption" &&
        principal > this.investmentPosition(asset.id, x.entry_date).balance
      )
        throw new Error(
          "Redeemed cost basis exceeds the invested principal on this date.",
        );
      const key = id(),
        description = required(x.description, "Description");
      let lines: { account: string; debit?: number; credit?: number }[];
      if (x.kind === "purchase")
        lines = [
          { account: "financial_investments", debit: amount },
          { account: x.account_id, credit: amount },
        ];
      else if (x.kind === "income")
        lines = [
          { account: x.account_id, debit: amount },
          { account: "investment_income", credit: amount },
        ];
      else {
        const gain = amount - principal;
        lines = [
          { account: x.account_id, debit: amount },
          { account: "financial_investments", credit: principal },
          ...(gain >= 0
            ? [{ account: "investment_income", credit: gain }]
            : [{ account: "investment_loss", debit: -gain }]),
        ];
      }
      const journal = this.journal(
        "investment_transaction",
        key,
        x.entry_date,
        description,
        lines,
        { property_id: asset.property_id },
      );
      this.insert("investment_transactions", {
        id: key,
        asset_id: asset.id,
        entry_date: x.entry_date,
        kind: x.kind,
        amount,
        principal,
        account_id: x.account_id,
        description,
        journal_id: journal,
        created_at: now(),
      });
      this.validateInvestmentTimeline(asset.id);
      this.audit("investment_transactions", key, "posted");
      return key;
    });
  }
  reversePortfolioTransaction(
    kind: "owner_transactions" | "investment_transactions",
    key: string,
    reason: string,
    when = this.today(),
  ) {
    return this.v.transaction(() => {
      const t = this.get(kind, key),
        original = this.get("journal_entries", t.journal_id);
      const eventType =
        kind === "owner_transactions"
          ? "owner_transaction"
          : "investment_transaction";
      date(when);
      required(reason, "Reversal reason");
      if (when < t.entry_date || when > this.today())
        throw new Error(
          "Reversal date must be between the original transaction and today.",
        );
      if (
        this.v.one(
          "SELECT id FROM reversals WHERE event_type=? AND event_id=?",
          [eventType, key],
        )
      )
        throw new Error("This transaction has already been reversed.");
      const reversal = id();
      const lines = this.v
        .all(
          "SELECT account_id account,debit,credit FROM journal_lines WHERE entry_id=?",
          [t.journal_id],
        )
        .map((r) => ({ account: r.account, debit: r.credit, credit: r.debit }));
      const journal = this.journal(
        "reversal",
        reversal,
        when,
        "Reversal: " + reason,
        lines,
        { property_id: original.property_id, reverses_id: original.id },
      );
      this.insert("reversals", {
        id: reversal,
        event_type: eventType,
        event_id: key,
        reversal_date: when,
        reason,
        journal_id: journal,
        created_at: now(),
      });
      if (kind === "investment_transactions")
        this.validateInvestmentTimeline(t.asset_id);
      this.audit(kind, key, "reversed");
      return reversal;
    });
  }
  saveBudget(x: Row) {
    return this.v.transaction(() => {
      this.scope(x.property_id);
      month(x.month);
      required(x.category, "Category");
      const amount = minor(x.amount),
        previous = this.v.one(
          "SELECT * FROM expense_budgets WHERE property_id=? AND month=? AND category=?",
          [x.property_id, x.month, x.category],
        );
      if (previous) {
        this.insert("record_versions", {
          id: id(),
          entity_type: "expense_budgets",
          entity_id: previous.id,
          snapshot: JSON.stringify(previous),
          created_at: now(),
        });
        this.v.run(
          "UPDATE expense_budgets SET amount=?,updated_at=? WHERE id=?",
          [amount, now(), previous.id],
        );
        this.audit("expense_budgets", previous.id, "updated");
        return previous.id;
      }
      return this.create("expense_budgets", {
        property_id: x.property_id,
        month: x.month,
        category: x.category,
        amount,
        updated_at: now(),
      });
    });
  }
  budgetReport(from: string, to: string, property = "") {
    date(from);
    date(to);
    if (from > to) throw new Error("Choose a valid date range.");
    const result = new Map<string, Row>();
    const ensure = (p: string, m: string, c: string) => {
      const key = p + ":" + m + ":" + c;
      if (!result.has(key))
        result.set(key, {
          property: this.get("properties", p).name,
          month: m,
          category: c,
          budget: 0,
          actual: 0,
          variance: 0,
        });
      return result.get(key)!;
    };
    for (const b of this.list("expense_budgets").filter(
      (b) =>
        (!property || b.property_id === property) &&
        b.month >= from.slice(0, 7) &&
        b.month <= to.slice(0, 7),
    ))
      ensure(b.property_id, b.month, b.category).budget += b.amount;
    const actual = this.v.all(
      `SELECT e.property_id,substr(e.entry_date,1,7) month,x.category,SUM(l.debit-l.credit) amount FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id LEFT JOIN journal_entries original ON original.id=e.reverses_id JOIN expenses x ON x.id=CASE WHEN e.reverses_id IS NULL THEN e.event_id ELSE original.event_id END WHERE l.account_id='operating' AND e.entry_date BETWEEN ? AND ? ${property ? "AND e.property_id=?" : ""} GROUP BY e.property_id,substr(e.entry_date,1,7),x.category`,
      property ? [from, to, property] : [from, to],
    );
    for (const a of actual)
      ensure(a.property_id, a.month, a.category).actual = a.amount;
    return [...result.values()]
      .map((r): Row => ({ ...r, variance: r.budget - r.actual }))
      .sort((a, b) =>
        (a.month + a.property + a.category).localeCompare(
          b.month + b.property + b.category,
        ),
      );
  }
  cashFlow(from: string, to: string, property = "") {
    date(from);
    date(to);
    if (from > to) throw new Error("Choose a valid date range.");
    let operating = 0,
      investing = 0,
      financing = 0;
    const entries = this.v.all(
      `SELECT e.*,SUM(l.debit-l.credit) cash FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN financial_accounts a ON a.id=l.account_id WHERE a.cash=1 AND e.entry_date BETWEEN ? AND ? ${property ? "AND e.property_id=?" : ""} GROUP BY e.id`,
      property ? [from, to, property] : [from, to],
    );
    for (const entry of entries) {
      const source = entry.reverses_id
        ? this.get("journal_entries", entry.reverses_id)
        : entry;
      const sign = entry.reverses_id ? -1 : 1,
        kind = source.event_type;
      if (kind === "loan_payment") {
        const t = this.get("loan_transactions", source.event_id);
        financing = sum([financing, -t.principal * sign]);
        operating = sum([operating, -t.interest * sign]);
      } else if (["opening", "loan", "owner_transaction"].includes(kind))
        financing = sum([financing, entry.cash]);
      else if (
        kind === "investment" ||
        (kind === "investment_transaction" &&
          this.get("investment_transactions", source.event_id).kind !==
            "income")
      )
        investing = sum([investing, entry.cash]);
      else if (
        kind === "expense" &&
        this.get("expenses", source.event_id).capital
      )
        investing = sum([investing, entry.cash]);
      else if (
        kind === "expense_payment" &&
        this.get(
          "expenses",
          this.get("expense_payments", source.event_id).expense_id,
        ).capital
      )
        investing = sum([investing, entry.cash]);
      else operating = sum([operating, entry.cash]);
    }
    return [
      { description: "Operating activities", amount: operating },
      { description: "Investing activities", amount: investing },
      { description: "Financing activities", amount: financing },
      {
        description: "Net change in cash",
        amount: sum([operating, investing, financing]),
      },
    ];
  }
  loanBalance(key: string) {
    const l = this.get("loans", key);
    return (
      l.principal -
      Number(
        this.v.one(
          "SELECT COALESCE(SUM(principal),0) n FROM loan_transactions WHERE loan_id=?",
          [key],
        )!.n,
      )
    );
  }
  repayLoan(x: Row) {
    return this.v.transaction(() => {
      const l = this.get("loans", x.loan_id),
        p = minor(x.principal),
        i = minor(x.interest);
      date(x.entry_date);
      this.cash(x.account_id);
      if (
        p > this.loanBalance(l.id) ||
        p + i <= 0 ||
        x.entry_date < l.start_date
      )
        throw new Error("Invalid principal repayment or payment date.");
      const key = id(),
        j = this.journal(
          "loan_payment",
          key,
          x.entry_date,
          "Loan installment",
          [
            { account: "loan", debit: p },
            { account: "interest", debit: i },
            { account: x.account_id, credit: sum([p, i]) },
          ],
          l,
        );
      this.insert("loan_transactions", {
        id: key,
        loan_id: l.id,
        entry_date: x.entry_date,
        principal: p,
        interest: i,
        account_id: x.account_id,
        journal_id: j,
        created_at: now(),
      });
      this.audit("loan_transactions", key, "posted");
      return key;
    });
  }
  addMaintenance(x: Row) {
    return this.v.transaction(() => {
      this.scope(x.property_id, x.unit_id);
      if (x.vendor_id) this.get("vendors", x.vendor_id);
      date(x.reported_on);
      if (x.scheduled_on) date(x.scheduled_on);
      return this.create("maintenance_requests", {
        property_id: x.property_id,
        unit_id: x.unit_id || null,
        vendor_id: x.vendor_id || null,
        category: required(x.category, "Category"),
        priority: required(x.priority, "Priority"),
        description: required(x.description, "Description"),
        reported_on: x.reported_on,
        scheduled_on: x.scheduled_on || null,
        estimated_cost: minor(x.estimated_cost ?? 0),
        status: "open",
        updated_at: now(),
      });
    });
  }
  updateMaintenance(key: string, status: string, notes: string) {
    return this.v.transaction(() => {
      this.get("maintenance_requests", key);
      if (
        ![
          "open",
          "scheduled",
          "in_progress",
          "completed",
          "cancelled",
        ].includes(status)
      )
        throw new Error("Invalid maintenance status.");
      this.v.run(
        "UPDATE maintenance_requests SET status=?,completed_on=?,updated_at=? WHERE id=?",
        [status, status === "completed" ? this.today() : null, now(), key],
      );
      this.create("maintenance_events", {
        request_id: key,
        status,
        notes: optional(notes),
      });
      this.audit("maintenance_requests", key, "status changed");
    });
  }
  openAccount(x: Row) {
    return this.v.transaction(() => {
      const key = this.create("financial_accounts", {
        code: required(x.code, "Account code"),
        name: required(x.name, "Account name"),
        type: "asset",
        cash: 1,
      });
      const amount = minor(x.opening_balance ?? 0);
      if (amount)
        this.journal(
          "opening",
          key,
          date(x.entry_date),
          "Owner opening balance",
          [
            { account: key, debit: amount },
            { account: "equity", credit: amount },
          ],
        );
      return key;
    });
  }
  transfer(x: Row) {
    return this.v.transaction(() => {
      this.cash(x.from);
      this.cash(x.to);
      if (x.from === x.to) throw new Error("Select different accounts.");
      const amount = minor(x.amount, true),
        key = id();
      this.journal(
        "transfer",
        key,
        date(x.entry_date),
        required(x.description, "Description"),
        [
          { account: x.from, credit: amount },
          { account: x.to, debit: amount },
        ],
      );
      this.audit("financial_accounts", key, "transfer");
      return key;
    });
  }
  accountBalance(key: string, asOf = "9999-12-31") {
    return Number(
      this.v.one(
        "SELECT COALESCE(SUM(l.debit-l.credit),0) n FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=? AND e.entry_date<=?",
        [key, asOf],
      )!.n,
    );
  }
  accountStatement(key: string, from: string, to: string) {
    this.get("financial_accounts", key);
    date(from);
    date(to);
    const rows = this.v.all(
      "SELECT e.entry_date date,e.id,e.description,SUM(l.debit) debit,SUM(l.credit) credit FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id WHERE l.account_id=? AND e.entry_date<=? GROUP BY e.id ORDER BY e.entry_date,e.created_at,e.id",
      [key, to],
    );
    let opening = 0,
      balance = 0;
    const filtered: Row[] = [];
    for (const r of rows) {
      balance = sum([balance, r.debit, -r.credit]);
      if (r.date < from) opening = balance;
      else filtered.push({ ...r, balance });
    }
    return { opening, closing: balance, rows: filtered };
  }
  async attach(x: Row, file: File) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Each document must be 10 MB or smaller.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    return this.v.transaction(() => {
      if (
        ![
          "properties",
          "units",
          "tenants",
          "leases",
          "maintenance_requests",
          "loans",
          "expenses",
          "investment_assets",
          "investment_transactions",
          "owners",
          "owner_transactions",
        ].includes(x.entity_type)
      )
        throw new Error("Unsupported document link.");
      this.get(x.entity_type, x.entity_id);
      let version = 1;
      if (x.supersedes_id) {
        const old = this.get("documents", x.supersedes_id);
        if (old.entity_type !== x.entity_type || old.entity_id !== x.entity_id)
          throw new Error(
            "Document versions must remain linked to the same record.",
          );
        version = old.version + 1;
      }
      return this.create("documents", {
        entity_type: x.entity_type,
        entity_id: x.entity_id,
        name: file.name,
        mime: file.type || "application/octet-stream",
        category: required(x.category, "Category"),
        size: file.size,
        content: bytes,
        version,
        supersedes_id: x.supersedes_id || null,
      });
    });
  }
  updateRecord(
    table: "properties" | "units" | "tenants",
    key: string,
    changes: Row,
    expected: string,
  ) {
    return this.v.transaction(() => {
      const current = this.get(table, key);
      if (current.updated_at !== expected)
        throw new Error(
          "This record changed since the form opened. Reopen it before editing.",
        );
      const allowed =
        table === "properties"
          ? ["name", "category", "address", "notes", "insurance", "utilities"]
          : table === "units"
            ? ["number", "type", "size", "notes", "status"]
            : [
                "name",
                "phone",
                "email",
                "address",
                "emergency_contact",
                "occupation",
                "guarantor",
                "notes",
              ];
      for (const [k, val] of Object.entries(changes)) {
        if (!allowed.includes(k) || typeof val !== "string")
          throw new Error("Invalid record update.");
        if (["name", "number", "phone", "category", "type"].includes(k))
          required(val, k);
      }
      const keys = Object.keys(changes);
      if (keys.length) {
        this.insert("record_versions", {
          id: id(),
          entity_type: table,
          entity_id: key,
          snapshot: JSON.stringify(current),
          created_at: now(),
        });
        this.v.run(
          `UPDATE ${table} SET ${keys.map((k) => k + "=?").join(",")},updated_at=? WHERE id=?`,
          [...keys.map((k) => changes[k]), now(), key],
        );
        this.audit(table, key, "updated", keys.join(", "));
      }
    });
  }
  saveSettings(x: Row) {
    return this.v.transaction(() => {
      const allowed = [
        "business_name",
        "address",
        "phone",
        "email",
        "locale",
        "timezone",
        "terms",
        "payment_instructions",
        "theme",
        "auto_billing",
        "financial_year_start",
        "logo_data",
      ];
      for (const [k, value] of Object.entries(x)) {
        if (
          !allowed.includes(k) ||
          typeof value !== "string" ||
          value.length > (k === "logo_data" ? 1500000 : 10000)
        )
          throw new Error("Unsupported setting.");
        if (k === "timezone")
          new Intl.DateTimeFormat("en", { timeZone: value });
        if (k === "locale") new Intl.NumberFormat(value);
        this.v.run(
          "INSERT INTO settings VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
          [k, value, now()],
        );
      }
      this.audit("settings", "workspace", "updated", Object.keys(x).join(", "));
    });
  }
  async runAutomation(asOf = this.today()) {
    date(asOf);
    let billed = 0;
    const settings = this.settings();
    if (settings.auto_billing === "true") {
      const starts = this.v.all("SELECT MIN(start_date) first FROM leases")[0]
        ?.first;
      if (starts) {
        for (
          let m = starts.slice(0, 7);
          m <= asOf.slice(0, 7);
          m = addMonths(m, 1)
        ) {
          const leases = this.v.all(
            "SELECT id,billing_day,start_date FROM leases WHERE start_date<=? AND COALESCE(move_out_date,end_date)>=?",
            [m + "-31", m + "-01"],
          );
          for (const l of leases) {
            if (
              m + "-" + String(l.billing_day).padStart(2, "0") <= asOf &&
              l.start_date <= asOf
            )
              billed += await this.billMonth(m, l.id);
          }
        }
      }
    }
    await this.v.transaction(() => {
      for (const r of this.v.all("SELECT * FROM recurring_expenses"))
        for (
          let m = r.start_month;
          m <= asOf.slice(0, 7) && (!r.end_month || m <= r.end_month);
          m = addMonths(m, 1)
        ) {
          if (
            this.v.one(
              "SELECT id FROM scheduled_jobs WHERE kind=? AND entity_id=? AND period=?",
              ["expense", r.id, m],
            )
          )
            continue;
          this.expense({ ...r, entry_date: m + "-01" });
          this.insert("scheduled_jobs", {
            id: id(),
            kind: "expense",
            entity_id: r.id,
            period: m,
            status: "complete",
            ran_at: now(),
          });
        }
      for (const i of this.v.all("SELECT * FROM invoices WHERE kind='rent'")) {
        const l = this.context(i.lease_id);
        const grace = new Date(i.due_date + "T00:00:00Z");
        grace.setUTCDate(grace.getUTCDate() + l.grace_days);
        const feeDate = new Date(grace);
        feeDate.setUTCDate(feeDate.getUTCDate() + 1);
        const feeDay = feeDate.toISOString().slice(0, 10);
        if (
          l.late_fee > 0 &&
          feeDay <= asOf &&
          this.invoiceBalance(i.id, feeDay) > 0 &&
          !this.v.one(
            "SELECT id FROM invoices WHERE lease_id=? AND month=? AND kind='late_fee'",
            [l.id, i.month],
          )
        )
          this.issue(
            l,
            i.month,
            [
              {
                description: `Late fee for ${i.number}`,
                amount: l.late_fee,
                account: "other_income",
              },
            ],
            feeDay,
            feeDay,
            "late_fee",
          );
      }
    });
    return billed;
  }
  list(kind: string): Row[] {
    const day = this.today();
    switch (kind) {
      case "owners":
        return this.v
          .all("SELECT * FROM owners ORDER BY name")
          .map((o) => ({
            ...o,
            balance: Number(
              this.v.one(
                "SELECT COALESCE(SUM(CASE WHEN direction='contribution' THEN amount ELSE -amount END),0) balance FROM owner_transactions t WHERE owner_id=? AND entry_date<=? AND NOT EXISTS(SELECT 1 FROM reversals r WHERE r.event_type='owner_transaction' AND r.event_id=t.id AND r.reversal_date<=?)",
                [o.id, day, day],
              )!.balance,
            ),
          }));
      case "investment_assets":
        return this.v
          .all(
            "SELECT a.*,p.name property FROM investment_assets a LEFT JOIN properties p ON p.id=a.property_id ORDER BY a.name",
          )
          .map((a) => ({ ...a, ...this.investmentPosition(a.id, day) }));
      case "investment_transactions":
        return this.v
          .all(
            "SELECT t.*,a.name investment,a.property_id FROM investment_transactions t JOIN investment_assets a ON a.id=t.asset_id ORDER BY t.entry_date DESC,t.created_at DESC",
          )
          .map((t) => ({
            ...t,
            status: this.v.one(
              "SELECT id FROM reversals WHERE event_type='investment_transaction' AND event_id=?",
              [t.id],
            )
              ? "reversed"
              : "posted",
            realized: t.kind === "purchase" ? 0 : t.amount - t.principal,
          }));
      case "owner_transactions":
        return this.v
          .all(
            "SELECT t.*,o.name owner,p.name property FROM owner_transactions t JOIN owners o ON o.id=t.owner_id LEFT JOIN properties p ON p.id=t.property_id ORDER BY t.entry_date DESC,t.created_at DESC",
          )
          .map((t) => ({
            ...t,
            status: this.v.one(
              "SELECT id FROM reversals WHERE event_type='owner_transaction' AND event_id=?",
              [t.id],
            )
              ? "reversed"
              : "posted",
          }));
      case "expense_budgets":
        return this.v.all(
          "SELECT b.*,p.name property FROM expense_budgets b JOIN properties p ON p.id=b.property_id ORDER BY b.month DESC,p.name,b.category",
        );
      case "properties":
        return this.v.all(
          "SELECT p.*,(SELECT COUNT(*) FROM units u WHERE u.property_id=p.id) units FROM properties p ORDER BY p.name",
        );
      case "units":
        return this.v.all(
          "SELECT u.*,p.name property,EXISTS(SELECT 1 FROM leases l WHERE l.unit_id=u.id AND l.start_date<=? AND COALESCE(l.move_out_date,l.end_date)>=?) occupied FROM units u JOIN properties p ON p.id=u.property_id ORDER BY p.name,u.number",
          [day, day],
        );
      case "leases":
        return this.v.all(
          "SELECT l.*,t.name tenant,u.number unit,p.name property FROM leases l JOIN tenants t ON t.id=l.tenant_id JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id ORDER BY l.start_date DESC",
        );
      case "invoices":
        return this.v
          .all(
            "SELECT i.*,t.name tenant,u.number unit,u.property_id FROM invoices i JOIN leases l ON l.id=i.lease_id JOIN tenants t ON t.id=l.tenant_id JOIN units u ON u.id=l.unit_id ORDER BY i.issue_date DESC,i.created_at DESC",
          )
          .map((i) => {
            const balance = this.invoiceBalance(i.id);
            const reversed = !!this.v.one(
              "SELECT id FROM reversals WHERE event_type='invoice' AND event_id=?",
              [i.id],
            );
            return {
              ...i,
              balance,
              status: reversed
                ? "voided"
                : i.issue_date > day
                  ? "scheduled"
                  : balance === 0
                    ? "paid"
                    : balance < i.total
                      ? "partially paid"
                      : i.due_date < day
                        ? "overdue"
                        : "issued",
            };
          });
      case "payments":
        return this.v
          .all(
            "SELECT p.*,t.name tenant,u.number unit,u.property_id FROM payments p JOIN leases l ON l.id=p.lease_id JOIN tenants t ON t.id=l.tenant_id JOIN units u ON u.id=l.unit_id ORDER BY p.payment_date DESC,p.created_at DESC",
          )
          .map((p) => ({
            ...p,
            status: this.v.one(
              "SELECT id FROM reversals WHERE event_type='payment' AND event_id=?",
              [p.id],
            )
              ? "reversed"
              : "posted",
            advance: this.unallocated(p),
          }));
      case "expenses":
        return this.v
          .all(
            "SELECT e.*,p.name property,v.name vendor FROM expenses e JOIN properties p ON p.id=e.property_id LEFT JOIN vendors v ON v.id=e.vendor_id ORDER BY e.entry_date DESC",
          )
          .map((e) => ({
            ...e,
            status: this.v.one(
              "SELECT id FROM reversals WHERE event_type='expense' AND event_id=?",
              [e.id],
            )
              ? "reversed"
              : e.account_id
                ? "paid"
                : "vendor bill",
            balance: e.account_id
              ? 0
              : e.amount -
                Number(
                  this.v.one(
                    "SELECT COALESCE(SUM(amount),0) n FROM expense_payments WHERE expense_id=?",
                    [e.id],
                  )!.n,
                ),
          }));
      case "documents":
        return this.v.all(
          "SELECT id,entity_type,entity_id,name,mime,category,size,version,created_at FROM documents ORDER BY created_at DESC",
        );
      default:
        if (
          ![
            "tenants",
            "buildings",
            "floors",
            "vendors",
            "investments",
            "property_valuations",
            "loans",
            "loan_transactions",
            "maintenance_requests",
            "financial_accounts",
            "security_deposits",
            "activity_logs",
            "utility_meters",
            "meter_readings",
            "lease_rent_schedules",
            "recurring_expenses",
            "credit_notes",
            "refunds",
          ].includes(kind)
        )
          throw new Error("Unsupported record type.");
        return this.v.all(`SELECT * FROM ${kind} ORDER BY created_at DESC`);
    }
  }
  metrics(from: string, to: string, property = "") {
    date(from);
    date(to);
    if (from > to) throw new Error("Select a valid date range.");
    const where = property ? " AND e.property_id=?" : "",
      params = property ? [from, to, property] : [from, to];
    const activity = this.v.all(
      `SELECT a.id,a.type,a.cash,COALESCE(SUM(l.debit),0) debit,COALESCE(SUM(l.credit),0) credit FROM financial_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.entry_id WHERE e.entry_date BETWEEN ? AND ?${where} GROUP BY a.id`,
      params,
    );
    const movement = (account: string) =>
      activity
        .filter((a) => a.id === account)
        .reduce((n, a) => sum([n, a.debit, -a.credit]), 0);
    const rent = -movement("rent") || 0,
      service = -movement("service") || 0,
      other = -movement("other_income") || 0,
      operating = movement("operating"),
      interest = movement("interest");
    const cash = sum(
      activity.filter((a) => a.cash).map((a) => a.debit - a.credit),
    );
    const collected = Number(
      this.v.one(
        `SELECT COALESCE(SUM(l.credit-l.debit),0) n FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id WHERE l.account_id='receivable' AND (e.event_type IN('payment','refund') OR e.reverses_id IN(SELECT id FROM journal_entries WHERE event_type='payment')) AND e.entry_date BETWEEN ? AND ?${where}`,
        params,
      )!.n,
    );
    const units = this.list("units").filter(
      (u) => !property || u.property_id === property,
    );
    const occupied = units.filter((u) =>
      this.v.one(
        "SELECT id FROM leases WHERE unit_id=? AND start_date<=? AND COALESCE(move_out_date,end_date)>=?",
        [u.id, to, to],
      ),
    ).length;
    const inv = this.list("invoices").filter(
      (i) => (!property || i.property_id === property) && i.issue_date <= to,
    );
    const outstanding = sum(inv.map((i) => this.invoiceBalance(i.id, to)));
    const ages = [0, 0, 0, 0];
    for (const i of inv) {
      const bal = this.invoiceBalance(i.id, to);
      const days = Math.floor(
        (Date.parse(to) - Date.parse(i.due_date)) / 86400000,
      );
      if (days >= 0)
        ages[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3] += bal;
    }
    const balanceAccount = (account: string) =>
      Number(
        this.v.one(
          `SELECT COALESCE(SUM(l.debit-l.credit),0) n FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=? AND e.entry_date<=?${where}`,
          [account, to, ...(property ? [property] : [])],
        )!.n,
      );
    const valuations = this.list("properties")
      .filter((p) => !property || p.id === property)
      .map(
        (p) =>
          this.v.one(
            "SELECT value FROM property_valuations WHERE property_id=? AND valuation_date<=? ORDER BY valuation_date DESC,created_at DESC LIMIT 1",
            [p.id, to],
          )?.value ?? 0,
      );
    const expected = sum(
      this.list("leases")
        .filter(
          (l) =>
            (!property ||
              this.get("units", l.unit_id).property_id === property) &&
            l.start_date <= to &&
            (l.move_out_date || l.end_date) >= to,
        )
        .map(
          (l) =>
            (this.v.one(
              "SELECT rent FROM lease_rent_schedules WHERE lease_id=? AND effective_on<=? ORDER BY effective_on DESC LIMIT 1",
              [l.id, to],
            )?.rent ?? l.rent) + l.service_charge,
        ),
    );
    return {
      properties: this.list("properties").filter(
        (p) => !property || p.id === property,
      ).length,
      units: units.length,
      occupied,
      vacant: units.length - occupied,
      occupancy: units.length ? (occupied / units.length) * 100 : 0,
      expected,
      rent,
      service,
      other,
      collected,
      outstanding,
      overdue: inv.filter(
        (i) => i.due_date < to && this.invoiceBalance(i.id, to) > 0,
      ).length,
      deposits: -balanceAccount("deposit") || 0,
      operating,
      interest,
      noi: sum([rent, service, other, -operating]),
      cash,
      invested: balanceAccount("assets"),
      value: sum(valuations),
      loans: -balanceAccount("loan") || 0,
      payable: -balanceAccount("payable") || 0,
      receivable: balanceAccount("receivable"),
      maintenance: this.list("maintenance_requests").filter(
        (x) =>
          (!property || x.property_id === property) &&
          !["completed", "cancelled"].includes(x.status),
      ).length,
      ages,
      expiring: this.list("leases").filter(
        (l) =>
          l.end_date >= to &&
          l.end_date <=
            new Date(Date.parse(to) + 30 * 86400000)
              .toISOString()
              .slice(0, 10) &&
          (!property || this.get("units", l.unit_id).property_id === property),
      ).length,
    };
  }
  trends(end: string, property = "") {
    return Array.from({ length: 6 }, (_, i) => {
      const m = addMonths(end.slice(0, 7), i - 5),
        last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 0))
          .toISOString()
          .slice(0, 10),
        x = this.metrics(m + "-01", last, property);
      return { month: m, ...x };
    });
  }
  timeline(type: string, key: string) {
    return this.v.all(
      "SELECT * FROM activity_logs WHERE entity_type=? AND entity_id=? ORDER BY created_at",
      [type, key],
    );
  }
  trialBalance(asOf = this.today()) {
    return this.v.all(
      "SELECT a.*,COALESCE(SUM(CASE WHEN e.entry_date<=? THEN l.debit ELSE 0 END),0) debit,COALESCE(SUM(CASE WHEN e.entry_date<=? THEN l.credit ELSE 0 END),0) credit FROM financial_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.entry_id GROUP BY a.id ORDER BY a.code",
      [asOf, asOf],
    );
  }
}
