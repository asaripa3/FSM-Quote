import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildQuote, money, type TradePack } from "./trades";

export type QuoteLine = { part: TradePack["demo"]["parts"][number]; listing: TradePack["demo"]["parts"][number]["listings"][number]; qty: number };
const ascii = (s: string) => s.replace(/µ/g, "u").replace(/[—–]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E]/g, "");

export async function createQuotePdf(pack: TradePack, lines: QuoteLine[], quote: ReturnType<typeof buildQuote>, company = "") {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([595.28, 841.89]);
  const ink = rgb(.08, .15, .24), blue = rgb(.02, .27, .85), muted = rgb(.4, .44, .49);
  const write = (text: string, x: number, y: number, size = 11, font = regular, color = ink) => page.drawText(ascii(text), { x, y, size, font, color });
  const right = (text: string, y: number, size = 11, font = mono) => { const clean = ascii(text); write(clean, 547 - font.widthOfTextAtSize(clean, size), y, size, font); };
  const rule = (y: number) => page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: .6, color: rgb(.8,.83,.85) });
  page.drawRectangle({ x: 0, y: 833, width: 596, height: 9, color: blue });
  write(ascii(company || "exa / FieldQuote").slice(0,40), 48, 777, company.length > 25 ? 17 : 26, bold, blue);
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
  write("PART / DESCRIPTION", 48, 610, 9, mono, muted);
  write("QTY", 390, 610, 9, mono, muted);
  right("AMOUNT", 610, 9);
  rule(598);
  let y = 575;
  for (const line of lines) {
    write(line.part.discovery.sku, 48, y, 12, bold);
    write(String(line.qty), 396, y, 11, mono);
    right(money(line.listing.price * line.qty), y);
    // Current trade packs have short descriptions; wrapping keeps future copy inside its column.
    const words = ascii(line.part.discovery.name).split(" ");
    let row = "";
    for (const word of words) {
      if (regular.widthOfTextAtSize(`${row} ${word}`, 10) > 310) { y -= 16; write(row, 48, y, 10, regular, muted); row = word; }
      else row = row ? `${row} ${word}` : word;
    }
    if (row) { y -= 16; write(row, 48, y, 10, regular, muted); }
    y -= 17; write(`${line.listing.supplier} | ${money(line.listing.price)} each`, 48, y, 10, regular, muted);
    y -= 18; rule(y); y -= 27;
  }
  const amounts: [string, number][] = [["Parts subtotal", quote.partsSubtotal], [`Parts markup (${pack.config.markupPercent}%)`, quote.markup], [`Labor (${pack.demo.laborHours} hr x ${money(pack.config.laborRate)})`, quote.labor]];
  y -= 10;
  for (const [label, value] of amounts) { write(label, 285, y, 11); right(money(value), y); y -= 26; }
  page.drawRectangle({ x: 270, y: y - 35, width: 277, height: 53, color: rgb(.93,.96,1) });
  write("ESTIMATED TOTAL", 285, y - 15, 10, bold, blue); right(money(quote.total), y - 17, 23, bold);
  y -= 88;
  write("SUPPLIER REFERENCES", 48, y, 9, mono, muted);
  for (const line of lines) { y -= 18; write(`${line.part.discovery.sku} - ${line.listing.domain}`, 48, y, 10); }
  rule(139);
  write("ESTIMATE - NOT A PAYMENT RECEIPT", 48, 118, 9, mono, blue);
  write("Supplier prices are subject to change. Confirm final pricing and fit before ordering.", 48, 99, 9, regular, muted);
  write("No taxes or shipping included. Parts + markup + labor are calculated by fixed rules.", 48, 83, 9, regular, muted);
  write("Built for the people who keep things running.", 48, 48, 10, regular, muted);
  right("1 / 1", 48, 9);
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
