import { type Row } from "./vault";
const monetary = new Set([
  "amount",
  "total",
  "balance",
  "opening",
  "closing",
  "rent",
  "monthly_rent",
  "service_charge",
  "deposit",
  "deposit_required",
  "late_fee",
  "purchase_price",
  "registration_cost",
  "principal",
  "interest",
  "estimated_cost",
  "value",
  "debit",
  "credit",
  "charge",
  "payment",
  "income",
  "operating",
  "noi",
  "cash",
  "capital",
  "invested",
  "estimated_value",
  "billed",
  "collected",
  "expected",
  "outstanding",
  "budget",
  "actual",
  "variance",
  "purchases",
  "proceeds",
  "realized",
]);
function amount(n: number) {
  const v = BigInt(n),
    absolute = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function csvText(rows: Row[]) {
  if (!rows.length) throw new Error("There are no records to export.");
  const keys = Object.keys(rows[0]).filter(
    (k) => !["snapshot", "content"].includes(k),
  );
  function cell(value: any, key = "") {
    const numeric = typeof value === "number" && Number.isFinite(value);
    let text =
      numeric && monetary.has(key) && Number.isSafeInteger(value)
        ? amount(value)
        : String(value ?? "");
    if (!numeric && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  return (
    "\uFEFF" +
    keys.map((k) => cell(k)).join(",") +
    "\r\n" +
    rows.map((row) => keys.map((k) => cell(row[k], k)).join(",")).join("\r\n")
  );
}
