/** Amounts are integer poisha. User input is parsed as text, never multiplied as a float. */
export function money(value: string): number {
  const s = value.trim().replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw new Error("Enter a positive amount with at most two decimal places.");
  const [whole, part = ""] = s.split(".");
  const n = BigInt(whole) * 100n + BigInt(part.padEnd(2, "0"));
  if (n > 900000000000000n) throw new Error("Amount is too large.");
  return Number(n);
}
export function minor(n: unknown, positive = false): number {
  if (
    typeof n !== "number" ||
    !Number.isSafeInteger(n) ||
    n < 0 ||
    n > 900000000000000 ||
    (positive && n === 0)
  )
    throw new Error("Invalid monetary amount.");
  return n;
}
export function roundRatio(n: bigint, d: bigint): number {
  if (d <= 0n) throw new Error("Invalid divisor");
  const r = (n + d / 2n) / d;
  if (r > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Monetary total exceeds safe range");
  return Number(r);
}
export function sum(values: number[]): number {
  const n = values.reduce((a, b) => a + BigInt(b), 0n);
  if (
    n > BigInt(Number.MAX_SAFE_INTEGER) ||
    n < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("Monetary total exceeds safe range");
  return Number(n);
}
export function format(n: number, currency = "BDT", locale = "en-BD"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
  }).format(n / 100);
}
export function words(amount: number): string {
  const ones = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const spell = (n: number): string =>
    n < 20
      ? ones[n]
      : n < 100
        ? tens[Math.floor(n / 10)] + (n % 10 ? " " + spell(n % 10) : "")
        : n < 1000
          ? spell(Math.floor(n / 100)) +
            " hundred" +
            (n % 100 ? " " + spell(n % 100) : "")
          : n < 100000
            ? spell(Math.floor(n / 1000)) +
              " thousand" +
              (n % 1000 ? " " + spell(n % 1000) : "")
            : n < 10000000
              ? spell(Math.floor(n / 100000)) +
                " lakh" +
                (n % 100000 ? " " + spell(n % 100000) : "")
              : spell(Math.floor(n / 10000000)) +
                " crore" +
                (n % 10000000 ? " " + spell(n % 10000000) : "");
  return `${spell(Math.floor(amount / 100))} taka${amount % 100 ? " and " + spell(amount % 100) + " poisha" : ""} only`;
}
export function date(s: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s
  )
    throw new Error("Enter a valid date.");
  return s;
}
export function month(s: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s))
    throw new Error("Enter a valid billing month.");
  return s;
}
export function today(timezone = "Asia/Dhaka"): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`;
}
export function addMonths(m: string, n: number): string {
  const d = new Date(m + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}
export function amortization(principal: number, bps: number, months: number) {
  minor(principal, true);
  if (
    !Number.isInteger(bps) ||
    bps < 0 ||
    bps > 10000 ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 600
  )
    throw new Error("Invalid loan terms.");
  // Integer binary search finds the fixed installment; interest is rounded monthly.
  const interest = (balance: number) =>
    roundRatio(BigInt(balance) * BigInt(bps), 120000n);
  const remains = (payment: number) => {
    let b = principal;
    for (let i = 0; i < months; i++) {
      b = b + interest(b) - payment;
      if (b <= 0) return 0;
    }
    return b;
  };
  let lo = 1,
    hi = principal + interest(principal);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (remains(mid) > 0) lo = mid + 1;
    else hi = mid;
  }
  let balance = principal;
  return Array.from({ length: months }, (_, i) => {
    const int = interest(balance);
    const pay = Math.min(lo, balance + int);
    const p = pay - int;
    balance -= p;
    return {
      period: i + 1,
      payment: pay,
      principal: p,
      interest: int,
      balance,
    };
  });
}
