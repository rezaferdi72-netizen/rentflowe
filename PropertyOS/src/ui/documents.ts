import "regenerator-runtime/runtime.js";
import type { PDFPage } from "pdf-lib";
import { format, words } from "../core/money";
import type { PropertyService } from "../core/service";
import type { Row } from "../core/vault";
import { desktop } from "../core/storage";
import { csvText } from "../core/exports";
export function download(blob: Blob, name: string) {
  void saveDownload(blob, name).catch((e) =>
    window.dispatchEvent(
      new CustomEvent("propertyos-error", { detail: e.message }),
    ),
  );
}
async function saveDownload(blob: Blob, name: string) {
  if (desktop()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: name });
    if (path) await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return;
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function csv(rows: Row[], name: string) {
  download(
    new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }),
    name + ".csv",
  );
}
export async function makePDF(
  title: string,
  subtitle: string,
  lines: Row[],
  columns: { key: string; label: string; money?: boolean; width: number }[],
  summary: string[],
  business: Row,
  filename: string,
) {
  const [{ PDFDocument, rgb }, { default: fontkit }] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);
  const green = rgb(0.08, 0.24, 0.21),
    gray = rgb(0.35, 0.4, 0.4),
    light = rgb(0.94, 0.96, 0.95);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = await fetch(
    new URL("document-font.ttf", document.baseURI),
  ).then((r) => {
    if (!r.ok) throw new Error("Local PDF font is missing.");
    return r.arrayBuffer();
  });
  const font = await doc.embedFont(bytes, { subset: true });
  const bnBytes = await fetch(
    new URL("document-bengali.ttf", document.baseURI),
  ).then((r) => r.arrayBuffer());
  const bengali = await doc.embedFont(bnBytes, { subset: true });
  let page!: PDFPage,
    y = 0;
  let pageNo = 0;
  const chunks = (text: string) =>
    String(text)
      .split(/([\u0980-\u09ff]+)/)
      .filter(Boolean)
      .map((t) => ({
        text: t,
        font: /[\u0980-\u09ff]/.test(t) ? bengali : font,
      }));
  const measure = (text: string, size: number) =>
    chunks(text).reduce(
      (n, c) => n + c.font.widthOfTextAtSize(c.text, size),
      0,
    );
  const write = (
    text: string,
    x: number,
    yy: number,
    size = 9,
    color = gray,
  ) => {
    for (const c of chunks(text)) {
      page.drawText(c.text, { x, y: yy, size, font: c.font, color });
      x += c.font.widthOfTextAtSize(c.text, size);
    }
  };
  const wrap = (text: string, max: number, size = 9) => {
    const out: string[] = [];
    let line = "";
    for (const word of String(text).split(/\s+/)) {
      const candidate = line ? line + " " + word : word;
      if (measure(candidate, size) > max && line) {
        out.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };
  const newPage = () => {
    page = doc.addPage([595.28, 841.89]);
    pageNo++;
    page.drawRectangle({
      x: 0,
      y: 738,
      width: 595.28,
      height: 104,
      color: green,
    });
    const brand = business.business_name || "PropertyOS";
    write(
      brand,
      38,
      795,
      Math.min(18, (460 / Math.max(1, measure(brand, 18))) * 18),
      rgb(1, 1, 1),
    );
    write(title, 38, 765, 12, rgb(0.82, 0.91, 0.87));
    write(subtitle, 38, 715, 9);
    write(`PropertyOS · ${filename} · Page ${pageNo}`, 38, 27, 7);
    y = 685;
  };
  newPage();
  if (business.logo_data) {
    try {
      const logo = await doc.embedPng(business.logo_data);
      const dim = logo.scaleToFit(70, 60);
      page!.drawImage(logo, {
        x: 480,
        y: 766,
        width: dim.width,
        height: dim.height,
      });
    } catch {
      /* Text branding remains valid if logo cannot be decoded. */
    }
  }
  for (const detail of [
    business.address,
    [business.phone, business.email].filter(Boolean).join(" · "),
  ].filter(Boolean)) {
    for (const line of wrap(detail, 510)) {
      write(line, 38, y);
      y -= 15;
    }
  }
  y -= 12;
  const header = () => {
    page.drawRectangle({
      x: 38,
      y: y - 9,
      width: 519,
      height: 26,
      color: light,
    });
    let x = 46;
    for (const c of columns) {
      write(c.label, x, y, 8, green);
      x += c.width;
    }
    y -= 32;
  };
  header();
  for (const line of lines) {
    const cells = columns.map((c) =>
      wrap(
        c.money ? format(line[c.key] ?? 0) : String(line[c.key] ?? ""),
        c.width - 12,
        8,
      ),
    );
    const height = Math.max(...cells.map((c) => c.length)) * 13 + 13;
    if (y - height < 110) {
      newPage();
      header();
    }
    let x = 46;
    for (let ci = 0; ci < columns.length; ci++) {
      cells[ci].forEach((text, i) => write(text, x, y - i * 13, 8));
      x += columns[ci].width;
    }
    y -= height;
    page.drawLine({
      start: { x: 38, y: y + 12 },
      end: { x: 557, y: y + 12 },
      thickness: 0.5,
      color: rgb(0.87, 0.9, 0.89),
    });
  }
  y -= 17;
  for (const text of summary) {
    const wrapped = wrap(text, 510, 10);
    if (y - wrapped.length * 16 < 85) newPage();
    for (const line of wrapped) {
      write(line, 38, y, 10, green);
      y -= 17;
    }
    y -= 3;
  }
  if (y < 160) newPage();
  y -= 12;
  for (const line of wrap(business.terms || "", 510, 8)) {
    write(line, 38, y, 8);
    y -= 13;
  }
  page.drawLine({
    start: { x: 395, y: 90 },
    end: { x: 557, y: 90 },
    thickness: 0.6,
    color: gray,
  });
  write("Authorized signature", 415, 74, 8);
  const pdf = await doc.save();
  download(
    new Blob([pdf.slice().buffer], { type: "application/pdf" }),
    filename + ".pdf",
  );
}
export async function invoicePDF(s: PropertyService, i: Row) {
  const snap = JSON.parse(i.snapshot),
    items = s.v.all(
      "SELECT description,amount FROM invoice_items WHERE invoice_id=?",
      [i.id],
    );
  return makePDF(
    "RENTAL INVOICE",
    `${i.number}  |  Issued ${i.issue_date}  |  Due ${i.due_date}`,
    items,
    [
      {
        key: "description",
        label: `${snap.tenant} · ${snap.property} / ${snap.unit} · ${i.month}`,
        width: 365,
      },
      { key: "amount", label: "Amount", money: true, width: 150 },
    ],
    [
      `Current invoice total: ${format(i.total)}`,
      `Previous account balance at issue: ${format(snap.previous_balance)} (information only)`,
      `Total account balance at issue: ${format(snap.account_payable)}`,
      `Current unpaid invoice amount: ${format(s.invoiceBalance(i.id))}`,
      snap.business.payment_instructions || "",
    ],
    snap.business,
    i.number,
  );
}
export async function receiptPDF(s: PropertyService, p: Row) {
  const snap = JSON.parse(p.snapshot),
    alloc =
      snap.allocations ??
      s.v.all(
        "SELECT i.number description,a.amount FROM payment_allocations a JOIN invoices i ON i.id=a.invoice_id WHERE a.payment_id=? ORDER BY i.issue_date",
        [p.id],
      );
  return makePDF(
    "MONEY RECEIPT",
    `${p.receipt_number}  |  ${p.payment_date}  |  ${snap.tenant} · ${snap.property} / ${snap.unit}`,
    alloc,
    [
      {
        key: "description",
        label: "Invoice allocation at receipt",
        width: 365,
      },
      { key: "amount", label: "Applied amount", money: true, width: 150 },
    ],
    [
      `Amount received: ${format(p.amount)}`,
      words(p.amount).replace(/^./, (c) => c.toUpperCase()),
      `Method: ${p.method}  |  Reference: ${p.reference || "—"}`,
      `Account balance after this payment was recorded: ${format(snap.balance_after)}`,
      `Status: ${p.status || "posted"} · Recorded ${p.created_at}`,
    ],
    snap.business,
    p.receipt_number,
  );
}
