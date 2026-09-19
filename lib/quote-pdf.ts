import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { buildQuote, money, type TradePack } from "./trades";

export type QuoteLine = { part: TradePack["demo"]["parts"][number]; listing: TradePack["demo"]["parts"][number]["listings"][number]; qty: number };
const ascii = (s: string) => s.replace(/µ/g, "u").replace(/[—–]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E]/g, "");

const WIDTH = 595.28, HEIGHT = 841.89;
/**
 * Nothing is drawn below this on a page carrying items. The closing block (totals, supplier
 * references, the legal footer) is fixed to the bottom of the last page, so an estimate that runs
 * long has to break rather than print over it. Three selected parts was already enough to overlap.
 */
const FLOOR = 165;

export async function createQuotePdf(pack: TradePack, lines: QuoteLine[], quote: ReturnType<typeof buildQuote>, company = "") {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const ink = rgb(.08, .15, .24), blue = rgb(.02, .27, .85), muted = rgb(.4, .44, .49);
  const pages: PDFPage[] = [];
  // Assigned by the first startPage call below, which every drawing helper runs after.
  let page!: PDFPage;
  let y = 0;
  const write = (text: string, x: number, y: number, size = 11, font = regular, color = ink) => page.drawText(ascii(text), { x, y, size, font, color });
  const right = (text: string, y: number, size = 11, font = mono) => { const clean = ascii(text); write(clean, 547 - font.widthOfTextAtSize(clean, size), y, size, font); };
  const rule = (y: number) => page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: .6, color: rgb(.8,.83,.85) });
  const name = ascii(company || "exa / FieldQuote").slice(0, 40);

  const startPage = (kind: "first" | "items" | "closing") => {
    page = doc.addPage([WIDTH, HEIGHT]); pages.push(page);
    page.drawRectangle({ x: 0, y: 833, width: 596, height: 9, color: blue });
    if (kind === "first") {
      write(name, 48, 777, company.length > 25 ? 17 : 26, bold, blue);
      write("FIELD SERVICE ESTIMATE", 48, 749, 10, mono, muted);
      right(`FQ-${pack.id.toUpperCase()}`, 777, 10);
      right(new Date().toLocaleDateString("en-US"), 754, 10);
      rule(723);
      write("PREPARED FOR", 48, 695, 9, mono, muted);
      write(pack.demo.customer, 48, 674, 15, bold);
      write(pack.demo.site, 48, 654, 11);
      write("SERVICE", 370, 695, 9, mono, muted);
      write(`${pack.name} repair`, 370, 674, 13, bold);
      write("Customer estimate", 370, 654, 9, regular, muted);
      y = 610;
    } else {
      // A continued page still has to say whose estimate it is, without repeating the whole header.
      write(name, 48, 790, 13, bold, blue);
      write(`${pack.demo.customer} - continued`, 48, 772, 9, mono, muted);
      right(`FQ-${pack.id.toUpperCase()}`, 790, 10);
      y = 740;
    }
    if (kind !== "closing") { write("PART / DESCRIPTION", 48, y, 9, mono, muted); write("QTY", 390, y, 9, mono, muted); right("AMOUNT", y, 9); rule(y - 12); y -= 35; }
  };

  startPage("first");
  for (const line of lines) {
    // Current trade packs have short descriptions; wrapping keeps future copy inside its column.
    const rows: string[] = [];
    let row = "";
    for (const word of ascii(line.part.discovery.name).split(" ")) {
      if (regular.widthOfTextAtSize(`${row} ${word}`, 10) > 310) { rows.push(row); row = word; }
      else row = row ? `${row} ${word}` : word;
    }
    if (row) rows.push(row);
    // Measure the whole item before starting it, so a line never straddles a page break.
    if (y - (16 * rows.length + 62) < FLOOR) startPage("items");
    write(line.part.discovery.sku, 48, y, 12, bold);
    write(String(line.qty), 396, y, 11, mono);
    right(money(line.listing.price * line.qty), y);
    for (const text of rows) { y -= 16; write(text, 48, y, 10, regular, muted); }
    y -= 17; write(`${line.listing.supplier} | ${money(line.listing.price)} each`, 48, y, 10, regular, muted);
    y -= 18; rule(y); y -= 22;
  }

  const amounts: [string, number][] = [["Parts subtotal", quote.partsSubtotal], [`Parts markup (${pack.config.markupPercent}%)`, quote.markup], [`Labor (${pack.demo.laborHours} hr x ${money(pack.config.laborRate)})`, quote.labor]];
  // Totals, the supplier list and the footer are one block: they move to a fresh page together. The
  // last reference has to clear the footer rule at 139, which is what this threshold protects.
  if (y - (10 + 26 * amounts.length + 72 + 14 * lines.length) < 152) startPage("closing");
  y -= 10;
  for (const [label, value] of amounts) { write(label, 285, y, 11); right(money(value), y); y -= 26; }
  page.drawRectangle({ x: 270, y: y - 35, width: 277, height: 53, color: rgb(.93,.96,1) });
  write("ESTIMATED TOTAL", 285, y - 15, 10, bold, blue); right(money(quote.total), y - 17, 23, bold);
  y -= 72;
  write("SUPPLIER REFERENCES", 48, y, 9, mono, muted);
  for (const line of lines) { y -= 14; write(`${line.part.discovery.sku} - ${line.listing.domain}`, 48, y, 10); }
  rule(139);
  write("ESTIMATE - NOT A PAYMENT RECEIPT", 48, 118, 9, mono, blue);
  write("Supplier prices are subject to change. Confirm final pricing and fit before ordering.", 48, 99, 9, regular, muted);
  write("No taxes or shipping included. Parts + markup + labor are calculated by fixed rules.", 48, 83, 9, regular, muted);
  write("Built for the people who keep things running.", 48, 48, 10, regular, muted);
  for (const [index, p] of pages.entries()) {
    const label = `${index + 1} / ${pages.length}`;
    p.drawText(label, { x: 547 - mono.widthOfTextAtSize(label, 9), y: 48, size: 9, font: mono, color: muted });
  }
  return doc.save();
}

export async function downloadQuotePdf(pack: TradePack, lines: QuoteLine[], quote: ReturnType<typeof buildQuote>, company = "") {
  const bytes = await createQuotePdf(pack, lines, quote, company);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url; link.download = `FieldQuote-${pack.id}-estimate.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
