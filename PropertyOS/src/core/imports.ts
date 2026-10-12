export const importColumns = {
  properties: [
    "name",
    "category",
    "address",
    "land_area",
    "building_area",
    "acquired_on",
    "purchase_price",
    "registration_cost",
    "insurance",
    "utilities",
    "notes",
  ],
  tenants: [
    "name",
    "phone",
    "email",
    "address",
    "emergency_contact",
    "identification_reference",
    "occupation",
    "guarantor",
    "notes",
  ],
  units: [
    "property_name",
    "number",
    "type",
    "size",
    "monthly_rent",
    "service_charge",
    "deposit_required",
    "notes",
  ],
  leases: [
    "property_name",
    "unit_number",
    "tenant_phone",
    "start_date",
    "end_date",
    "rent",
    "service_charge",
    "deposit",
    "billing_day",
    "due_day",
    "prorate",
    "late_fee",
    "grace_days",
    "termination_terms",
  ],
} as const;
export type ImportKind = keyof typeof importColumns;
export type ImportRow = Record<string, string>;

/** RFC 4180-style reader. Quoted commas, escaped quotes and embedded newlines are supported. */
export function parseCSV(text: string): string[][] {
  if (text.length > 3_000_000)
    throw new Error("CSV file must be smaller than 3 MB.");
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  function cell() {
    row.push(value);
    value = "";
    closed = false;
  }
  function line() {
    cell();
    if (row.some((v) => v.trim())) rows.push(row);
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else value += ch;
    } else if (ch === '"') {
      if (value || closed)
        throw new Error("Unexpected quote in CSV. Quote the entire cell.");
      quoted = true;
    } else if (ch === ",") cell();
    else if (ch === "\n" || ch === "\r") {
      line();
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      if (closed) throw new Error("Unexpected text after a quoted CSV cell.");
      value += ch;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted cell.");
  if (value || row.length || closed) line();
  if (rows.length > 2001)
    throw new Error("Import at most 2,000 records at a time.");
  return rows;
}
export function readImport(kind: ImportKind, text: string): ImportRow[] {
  const parsed = parseCSV(text);
  if (parsed.length < 2)
    throw new Error("Add at least one data row below the column headers.");
  const headers = parsed[0].map((v) => v.trim());
  const allowed: readonly string[] = importColumns[kind];
  if (!allowed) throw new Error("Choose a supported import type.");
  if (headers.some((h) => !allowed.includes(h)))
    throw new Error(
      "CSV has unsupported columns. Download and use this module's template.",
    );
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV contains duplicate column headers.");
  return parsed.slice(1).map((row, index) => {
    if (row.length !== headers.length)
      throw new Error(
        `Data row ${index + 1} has ${row.length} cells; expected ${headers.length}.`,
      );
    return Object.fromEntries(headers.map((h, j) => [h, row[j].trim()]));
  });
}
export function csvTemplate(kind: ImportKind) {
  return importColumns[kind].join(",") + "\r\n";
}
