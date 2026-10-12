import type { PropertyService } from "../core/service";
export type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  source?: string;
  optional?: boolean;
  default?: any;
  help?: string;
};
export type FormSpec = {
  title: string;
  method: string;
  fields: Field[];
  hint?: string;
};
const f = (
  key: string,
  label: string,
  type = "text",
  optional = false,
  extra: Partial<Field> = {},
): Field => ({ key, label, type, optional, ...extra });
const prop = f("property_id", "Property", "select", false, {
    source: "properties",
  }),
  unit = f("unit_id", "Unit", "select", false, { source: "units" }),
  lease = f("lease_id", "Lease", "select", false, { source: "leases" }),
  account = f("account_id", "Cash / bank account", "select", false, {
    source: "cash",
  }),
  amount = f("amount", "Amount (৳)", "money"),
  when = f("entry_date", "Transaction date", "date");
export const forms: Record<string, FormSpec> = {
  owner: {
    title: "Add owner / investor", method: "addOwner",
    fields: [f("name", "Owner name"), f("contact", "Phone / email", "text", true)],
  },
  ownerTransaction: {
    title: "Record owner capital", method: "recordOwnerTransaction",
    hint: "Contributions add cash and owner equity. Distributions reduce both; they are not operating expenses.",
    fields: [f("owner_id", "Owner", "select", false, { source: "owners" }), { ...prop, optional: true }, when, f("direction", "Movement", "select", false, { options: ["contribution", "distribution"] }), amount, account, f("description", "Description")],
  },
  investmentAsset: {
    title: "Add investment holding", method: "addInvestmentAsset",
    hint: "Create the holding, then record the actual money invested. This form does not move cash.",
    fields: [f("name", "Investment name"), f("category", "Type", "select", false, { options: ["Fixed deposit", "Shares", "Business partnership", "Mutual fund", "Other"] }), { ...prop, optional: true }, f("opened_on", "Opened on", "date"), f("institution", "Bank / institution / partner", "text", true), f("notes", "Notes", "textarea", true)],
  },
  assetTransaction: {
    title: "Record investment transaction", method: "recordAssetTransaction",
    hint: "Purchase: money invested. Income: interest or dividends received. Redemption: actual net cash received and the cost basis released. Cost basis is only used for redemptions.",
    fields: [f("asset_id", "Investment holding", "select", false, { source: "investment_assets" }), when, f("kind", "Transaction", "select", false, { options: ["purchase", "income", "redemption"] }), f("amount", "Actual cash invested / received (৳)", "money"), f("principal", "Cost basis released on redemption (৳)", "money", true), account, f("description", "Description")],
  },
  budget: {
    title: "Set monthly expense budget", method: "saveBudget",
    hint: "Saving the same property, month and category updates that budget. Budgets do not create financial transactions.",
    fields: [prop, f("month", "Budget month", "month"), f("category", "Expense category", "select", false, { options: ["Electricity", "Water", "Gas", "Repairs", "Maintenance", "Staff salaries", "Security", "Cleaning", "Property taxes", "Insurance", "Legal fees", "Management", "Other"] }), amount],
  },
  property: {
    title: "Add property",
    method: "addProperty",
    hint: "Purchase price is reference information. Post an investment separately to record cash spent.",
    fields: [
      f("name", "Property name"),
      f("category", "Category", "select", false, {
        options: ["Residential", "Commercial", "Mixed use", "Land", "Parking"],
      }),
      f("address", "Address", "textarea"),
      f("land_area", "Land area", "text", true),
      f("building_area", "Building area", "text", true),
      f("acquired_on", "Acquisition date", "date", true),
      f("purchase_price", "Purchase price (৳)", "money", true),
      f("registration_cost", "Legal & registration costs (৳)", "money", true),
      f("insurance", "Insurance details", "textarea", true),
      f("utilities", "Utility account details", "textarea", true),
      f("notes", "Notes", "textarea", true),
    ],
  },
  building: {
    title: "Add building / block",
    method: "addBuilding",
    fields: [prop, f("name", "Building name")],
  },
  floor: {
    title: "Add floor",
    method: "addFloor",
    fields: [
      f("building_id", "Building", "select", false, { source: "buildings" }),
      f("name", "Floor name"),
    ],
  },
  unit: {
    title: "Add rentable unit",
    method: "addUnit",
    fields: [
      prop,
      f("building_id", "Building / block", "select", true, {
        source: "buildings",
      }),
      f("floor_id", "Floor", "select", true, { source: "floors" }),
      f("number", "Unit number"),
      f("type", "Unit type", "select", false, {
        options: [
          "Apartment",
          "Flat",
          "Shop",
          "Office",
          "Parking",
          "Land",
          "Other",
        ],
      }),
      f("size", "Size / area", "text", true),
      f("monthly_rent", "Base monthly rent (৳)", "money"),
      f("service_charge", "Service charge (৳)", "money", true),
      f("deposit_required", "Deposit requirement (৳)", "money", true),
      f("notes", "Notes", "textarea", true),
    ],
  },
  tenant: {
    title: "Add tenant",
    method: "addTenant",
    fields: [
      f("name", "Full name"),
      f("phone", "Phone"),
      f("email", "Email", "email", true),
      f("address", "Address", "textarea", true),
      f("emergency_contact", "Emergency contact", "text", true),
      f("identification_reference", "ID document reference", "text", true),
      f("occupation", "Occupation / business", "text", true),
      f("guarantor", "Guarantor", "text", true),
      f("notes", "Notes", "textarea", true),
    ],
  },
  lease: {
    title: "Create lease / renewal",
    method: "addLease",
    hint: "Dates cannot overlap an existing lease. Renewals create a new record and preserve the previous lease.",
    fields: [
      unit,
      f("tenant_id", "Tenant", "select", false, { source: "tenants" }),
      f("start_date", "Lease starts", "date"),
      f("end_date", "Lease ends", "date"),
      f("rent", "Monthly rent (৳)", "money"),
      f("service_charge", "Monthly service charge (৳)", "money", true),
      f("deposit", "Agreed security deposit (৳)", "money", true),
      f("billing_day", "Billing day (1–28)", "number", false, { default: 1 }),
      f("due_day", "Due day (1–28)", "number", false, { default: 10 }),
      f("prorate", "Prorate partial months", "checkbox", true, {
        default: true,
      }),
      f(
        "late_fee",
        "One-time late fee per overdue rent invoice (৳)",
        "money",
        true,
      ),
      f("grace_days", "Grace days", "number", true, { default: 0 }),
      f("renewed_from", "Previous lease (renewal only)", "select", true, {
        source: "leases",
      }),
      f("termination_terms", "Termination terms", "textarea", true),
    ],
  },
  rentSchedule: {
    title: "Schedule rent change",
    method: "scheduleRent",
    hint: "Previously issued invoices stay unchanged. New billing uses this effective date.",
    fields: [
      lease,
      f("effective_on", "Effective date", "date"),
      f("rent", "New monthly rent (৳)", "money"),
    ],
  },
  payment: {
    title: "Record rent payment",
    method: "recordPayment",
    hint: "Payments allocate to oldest unpaid invoices. Any remaining amount becomes advance credit. A receipt is saved with every payment.",
    fields: [
      lease,
      f("payment_date", "Payment date", "date"),
      amount,
      account,
      f("method", "Method", "select", false, {
        options: [
          "Bank transfer",
          "Cash",
          "Cheque",
          "Mobile banking",
          "Card",
          "Other",
        ],
      }),
      f("reference", "Transaction reference", "text", true),
      f("notes", "Notes", "textarea", true),
    ],
  },
  deposit: {
    title: "Record security deposit",
    method: "recordDeposit",
    hint: "Deposits are held as refundable liabilities and do not count as rental income.",
    fields: [
      lease,
      when,
      amount,
      f("direction", "Transaction", "select", false, {
        options: ["received", "refunded"],
      }),
      account,
      f("reference", "Reference", "text", true),
    ],
  },
  customInvoice: {
    title: "Add one-time charge",
    method: "customInvoice",
    fields: [
      lease,
      f("month", "Billing period", "month"),
      f("issue_date", "Issue date", "date"),
      f("due_date", "Due date", "date"),
      f("description", "Charge description"),
      amount,
    ],
  },
  credit: {
    title: "Issue credit note",
    method: "creditInvoice",
    fields: [
      f("invoice_id", "Invoice", "select", false, { source: "invoices" }),
      when,
      amount,
      f("reason", "Reason", "textarea"),
    ],
  },
  refund: {
    title: "Refund unused advance",
    method: "refundAdvance",
    fields: [
      f("payment_id", "Payment", "select", false, { source: "payments" }),
      when,
      amount,
      account,
      f("reason", "Reason", "textarea"),
    ],
  },
  expense: {
    title: "Record expense / vendor bill",
    method: "recordExpense",
    hint: "Leave the paying account empty for an unpaid vendor bill. Capital expenditure becomes an asset, not an operating expense.",
    fields: [
      prop,
      { ...unit, optional: true },
      f("vendor_id", "Vendor", "select", true, { source: "vendors" }),
      f("category", "Category", "select", false, {
        options: [
          "Electricity",
          "Water",
          "Gas",
          "Repairs",
          "Maintenance",
          "Staff salaries",
          "Security",
          "Cleaning",
          "Property taxes",
          "Insurance",
          "Legal fees",
          "Management",
          "Other",
        ],
      }),
      f("description", "Description"),
      when,
      amount,
      { ...account, optional: true },
      f("capital", "Capital expenditure", "checkbox", true, { default: false }),
    ],
  },
  expensePayment: {
    title: "Pay vendor bill",
    method: "payExpense",
    fields: [
      f("expense_id", "Vendor bill", "select", false, {
        source: "unpaid_expenses",
      }),
      when,
      amount,
      account,
    ],
  },
  vendor: {
    title: "Add vendor / contractor",
    method: "addVendor",
    fields: [
      f("name", "Vendor name"),
      f("phone", "Phone", "text", true),
      f("notes", "Notes", "textarea", true),
    ],
  },
  recurringExpense: {
    title: "Recurring paid expense",
    method: "addRecurringExpense",
    hint: "The catch-up runner posts one expense for each month. Make sure this represents an expense you authorize for automatic payment recording.",
    fields: [
      prop,
      f("description", "Description"),
      f("category", "Category"),
      amount,
      account,
      f("start_month", "Starts in", "month"),
      f("end_month", "Ends in", "month", true),
    ],
  },
  investment: {
    title: "Record property capital investment",
    method: "recordInvestment",
    hint: "Records actual cash spent on property capital. Estimated valuations are recorded separately.",
    fields: [
      prop,
      when,
      f("category", "Investment type", "select", false, {
        options: [
          "Acquisition",
          "Registration",
          "Construction",
          "Renovation",
          "Capital improvement",
          "Other",
        ],
      }),
      f("description", "Description"),
      amount,
      account,
    ],
  },
  valuation: {
    title: "Record property valuation",
    method: "addValuation",
    hint: "This estimate affects investment reporting only. It does not create income or cash.",
    fields: [
      prop,
      f("valuation_date", "Valuation date", "date"),
      f("value", "Estimated value (৳)", "money"),
      f("notes", "Valuation basis / notes", "textarea", true),
    ],
  },
  loan: {
    title: "Record loan disbursement",
    method: "addLoan",
    hint: "The principal enters the selected cash / bank account and becomes a loan liability. Only use this form for actual loan funding.",
    fields: [
      prop,
      f("lender", "Lending institution"),
      f("principal", "Loan principal (৳)", "money"),
      f(
        "annual_rate_bps",
        "Annual rate (basis points; 900 = 9%)",
        "number",
        false,
        { default: 900 },
      ),
      f("term_months", "Term in months", "number", false, { default: 60 }),
      f("start_date", "Disbursement date", "date"),
      f("due_day", "Installment due day (1–28)", "number", false, {
        default: 10,
      }),
      account,
    ],
  },
  loanPayment: {
    title: "Record loan repayment",
    method: "repayLoan",
    hint: "Use the lender’s actual principal / interest split. The amortization schedule is a planning estimate.",
    fields: [
      f("loan_id", "Loan", "select", false, { source: "loans" }),
      when,
      f("principal", "Principal repaid (৳)", "money", true),
      f("interest", "Interest paid (৳)", "money", true),
      account,
    ],
  },
  maintenance: {
    title: "New maintenance request",
    method: "addMaintenance",
    hint: "Estimates do not affect financial reports. Record the actual cost as an expense when incurred.",
    fields: [
      prop,
      { ...unit, optional: true },
      f("vendor_id", "Assigned vendor", "select", true, { source: "vendors" }),
      f("category", "Category", "select", false, {
        options: [
          "Plumbing",
          "Electrical",
          "Structure",
          "Cleaning",
          "Inspection",
          "Other",
        ],
      }),
      f("priority", "Priority", "select", false, {
        options: ["normal", "low", "high", "urgent"],
      }),
      f("description", "Request description", "textarea"),
      f("reported_on", "Reported date", "date"),
      f("scheduled_on", "Scheduled date", "date", true),
      f("estimated_cost", "Estimated cost (৳)", "money", true),
    ],
  },
  account: {
    title: "Add financial account",
    method: "openAccount",
    hint: "An opening cash balance is balanced against owner equity.",
    fields: [
      f("name", "Account name"),
      f("code", "Unique account code"),
      f("opening_balance", "Opening balance (৳)", "money", true),
      when,
    ],
  },
  transfer: {
    title: "Transfer between accounts",
    method: "transfer",
    fields: [
      f("from", "From account", "select", false, { source: "cash" }),
      f("to", "To account", "select", false, { source: "cash" }),
      when,
      amount,
      f("description", "Description"),
    ],
  },
  meter: {
    title: "Add utility meter",
    method: "addMeter",
    fields: [
      unit,
      f("name", "Utility name"),
      f("rate", "Rate per whole unit (৳)", "money"),
    ],
  },
  reading: {
    title: "Record utility reading",
    method: "addReading",
    hint: "Enter readings before issuing the monthly invoice. Whole-number readings are supported in this release.",
    fields: [
      f("meter_id", "Meter", "select", false, { source: "utility_meters" }),
      f("month", "Billing month", "month"),
      f("previous_reading", "Previous reading", "number"),
      f("current_reading", "Current reading", "number"),
    ],
  },
};
export function choices(
  s: PropertyService,
  source: string,
  values: Record<string, any>,
) {
  const rows =
    source === "cash"
      ? s.list("financial_accounts").filter((r) => r.cash)
      : source === "unpaid_expenses"
        ? s
            .list("expenses")
            .filter((r) => r.balance > 0 && r.status !== "reversed")
        : s.list(source);
  return rows
    .filter((r) =>
      source === "units" && values.property_id
        ? r.property_id === values.property_id
        : source === "buildings" && values.property_id
          ? r.property_id === values.property_id
          : source === "floors" && values.building_id
            ? r.building_id === values.building_id
            : true,
    )
    .map((r) => ({
      value: r.id,
      label:
        source === "leases"
          ? `${r.tenant} · ${r.property} / ${r.unit} · ${r.start_date}`
          : source === "units"
            ? `${r.property} / ${r.number}`
            : source === "invoices"
              ? `${r.number} · ${r.tenant}`
              : source === "payments"
                ? `${r.receipt_number} · ${r.tenant}`
                : source === "unpaid_expenses"
                  ? r.description
                  : source === "loans"
                    ? `${r.lender} · ${r.start_date}`
                    : r.name || r.number || r.description || r.id,
    }));
}
