import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Generic, document-agnostic PDF invoice renderer.
 *
 * Input is a fully-structured `InvoiceDocument` (no settlement/customer coupling),
 * output is a PDF byte buffer. Both the brand settlement invoice and the future
 * customer-invoice repository can build an `InvoiceDocument` and reuse this.
 *
 * Standard (WinAnsi) fonts cannot encode the ₹ glyph, so all currency is rendered
 * with an "INR" prefix and Indian digit grouping rather than the rupee symbol.
 */

export interface PdfPartyBlock {
  heading: string;
  name: string;
  lines: string[];
}

export interface PdfMetaItem {
  label: string;
  value: string;
}

export interface PdfColumn {
  /** Stable key used to look up the value in a row's `cells`. */
  key: string;
  header: string;
  /** Relative width weight; columns share the table width proportionally. */
  width: number;
  align?: "left" | "right";
}

export interface PdfRow {
  cells: Record<string, string>;
  /** Render in red (credit notes / reversals). */
  negative?: boolean;
  /** Render emphasised on a tinted band (carry-forward / adjustment lines). */
  emphasis?: boolean;
}

export interface PdfSummaryItem {
  label: string;
  value: string;
  negative?: boolean;
}

export interface InvoiceDocument {
  /** Large heading, e.g. the platform brand name. */
  brandHeading: string;
  /** Sub-heading describing the document type, e.g. "Settlement Invoice". */
  docTitle: string;
  invoiceNumber: string;
  metaItems: PdfMetaItem[];
  parties: PdfPartyBlock[];
  bankBlock?: { heading: string; lines: string[] };
  columns: PdfColumn[];
  rows: PdfRow[];
  summary: PdfSummaryItem[];
  netLabel: string;
  netValue: string;
  footerNotes?: string[];
  signatory?: { heading: string; lines: string[] };
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const INK = rgb(0.06, 0.09, 0.16); // slate-900
const MUTED = rgb(0.42, 0.45, 0.5); // slate-500
const LINE = rgb(0.85, 0.87, 0.9); // slate-200
const BAND = rgb(0.95, 0.96, 0.98); // slate-50
const RED = rgb(0.72, 0.11, 0.11);
const AMBER_BG = rgb(0.99, 0.95, 0.86);
const GREEN = rgb(0.09, 0.45, 0.27);

/** Indian digit-grouped number with two decimals, no currency prefix. */
export function groupINR(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(n).toFixed(2);
  const [intPart, dec] = abs.split(".");
  let last3 = intPart.slice(-3);
  let rest = intPart.slice(0, -3);
  if (rest) {
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    last3 = "," + last3;
  }
  return `${neg ? "-" : ""}${rest}${last3}.${dec}`;
}

/** Indian digit-grouped currency string with an INR prefix. */
export function formatINR(n: number): string {
  return `INR ${groupINR(n)}`;
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

/** Strip characters StandardFonts (WinAnsi) cannot encode to avoid render errors. */
function safe(text: string): string {
  return (text ?? "").replace(/[^\x20-\x7E]/g, (c) => (c === "₹" ? "INR " : ""));
}

export async function generateInvoicePdf(doc: InvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = A4[0];
  const contentWidth = pageWidth - MARGIN * 2;
  const bottomLimit = MARGIN + 60;

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGIN;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right"; maxWidth?: number } = {},
  ) => {
    const size = opts.size ?? 9;
    const f = opts.font ?? font;
    let str = safe(s);
    if (opts.maxWidth) str = truncate(str, f, size, opts.maxWidth);
    let drawX = x;
    if (opts.align === "right") drawX = x - f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: drawX, y: yy, size, font: f, color: opts.color ?? INK });
  };

  // Resolve proportional column geometry once.
  const totalWeight = doc.columns.reduce((s, c) => s + c.width, 0);
  const colX: number[] = [];
  let acc = MARGIN;
  const colWidths = doc.columns.map((c) => (c.width / totalWeight) * contentWidth);
  doc.columns.forEach((_, i) => {
    colX.push(acc);
    acc += colWidths[i];
  });

  const drawTableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 16, width: contentWidth, height: 18, color: INK });
    doc.columns.forEach((c, i) => {
      const isRight = c.align === "right";
      const x = isRight ? colX[i] + colWidths[i] - 4 : colX[i] + 4;
      text(c.header, x, y - 12, { size: 7.5, font: bold, color: rgb(1, 1, 1), align: c.align, maxWidth: colWidths[i] - 8 });
    });
    y -= 20;
  };

  const ensureSpace = (needed: number, repeatHeader = false) => {
    if (y - needed < bottomLimit) {
      page = pdf.addPage(A4);
      y = A4[1] - MARGIN;
      if (repeatHeader) drawTableHeader();
    }
  };

  // ---- Header band: brand heading + document title + invoice number ----
  text(doc.brandHeading, MARGIN, y - 12, { size: 18, font: bold });
  text(doc.docTitle.toUpperCase(), pageWidth - MARGIN, y - 6, { size: 11, font: bold, align: "right", color: MUTED });
  text(doc.invoiceNumber, pageWidth - MARGIN, y - 20, { size: 9, align: "right", color: INK });
  y -= 30;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: pageWidth - MARGIN, y }, thickness: 1, color: LINE });
  y -= 18;

  // ---- Meta row (period, status, payout date) ----
  const metaColW = contentWidth / Math.max(doc.metaItems.length, 1);
  doc.metaItems.forEach((m, i) => {
    const x = MARGIN + i * metaColW;
    text(m.label.toUpperCase(), x, y, { size: 6.5, font: bold, color: MUTED });
    text(m.value, x, y - 11, { size: 9, font: bold });
  });
  y -= 30;

  // ---- Parties + bank block (two/three columns) ----
  const blocks: { heading: string; name?: string; lines: string[] }[] = [
    ...doc.parties.map((p) => ({ heading: p.heading, name: p.name, lines: p.lines })),
  ];
  if (doc.bankBlock) blocks.push({ heading: doc.bankBlock.heading, lines: doc.bankBlock.lines });

  const blockColW = contentWidth / Math.max(blocks.length, 1);
  const blockTopY = y;
  let maxLines = 0;
  blocks.forEach((b, i) => {
    const x = MARGIN + i * blockColW;
    let by = blockTopY;
    text(b.heading.toUpperCase(), x, by, { size: 6.5, font: bold, color: MUTED });
    by -= 12;
    if (b.name) {
      text(b.name, x, by, { size: 9.5, font: bold, maxWidth: blockColW - 8 });
      by -= 12;
    }
    b.lines.forEach((ln) => {
      text(ln, x, by, { size: 8, color: rgb(0.3, 0.34, 0.4), maxWidth: blockColW - 8 });
      by -= 11;
    });
    const used = (blockTopY - by) ;
    maxLines = Math.max(maxLines, used);
  });
  y = blockTopY - maxLines - 14;

  // ---- Line items table ----
  ensureSpace(40);
  drawTableHeader();

  const rowHeight = 15;
  doc.rows.forEach((r, idx) => {
    ensureSpace(rowHeight, true);
    const rowColor = r.negative ? RED : INK;
    if (r.emphasis) {
      page.drawRectangle({ x: MARGIN, y: y - rowHeight + 3, width: contentWidth, height: rowHeight, color: AMBER_BG });
    } else if (idx % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - rowHeight + 3, width: contentWidth, height: rowHeight, color: BAND });
    }
    doc.columns.forEach((c, i) => {
      const raw = r.cells[c.key] ?? "";
      const isRight = c.align === "right";
      const x = isRight ? colX[i] + colWidths[i] - 4 : colX[i] + 4;
      text(raw, x, y - rowHeight + 7, {
        size: 7.5,
        font: r.emphasis ? bold : font,
        color: r.emphasis ? rgb(0.55, 0.34, 0.03) : rowColor,
        align: c.align,
        maxWidth: colWidths[i] - 8,
      });
    });
    y -= rowHeight;
  });
  page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: pageWidth - MARGIN, y: y + 2 }, thickness: 1, color: LINE });
  y -= 18;

  // ---- Summary block (right-aligned column) ----
  ensureSpace(doc.summary.length * 14 + 80);
  const sumLabelX = pageWidth - MARGIN - 200;
  const sumValueX = pageWidth - MARGIN;
  doc.summary.forEach((s) => {
    text(s.label, sumLabelX, y, { size: 8.5, color: MUTED });
    text(s.value, sumValueX, y, { size: 8.5, align: "right", color: s.negative ? RED : INK });
    y -= 14;
  });
  y -= 4;

  // ---- Net Settlement Amount highlight ----
  const netBoxH = 30;
  page.drawRectangle({ x: sumLabelX - 12, y: y - netBoxH + 6, width: pageWidth - MARGIN - (sumLabelX - 12), height: netBoxH, color: rgb(0.93, 0.97, 0.94) });
  text(doc.netLabel.toUpperCase(), sumLabelX, y - 9, { size: 8, font: bold, color: GREEN });
  text(doc.netValue, sumValueX, y - 11, { size: 13, font: bold, align: "right", color: GREEN });
  y -= netBoxH + 20;

  // ---- Footer notes ----
  if (doc.footerNotes?.length) {
    ensureSpace(doc.footerNotes.length * 11 + 10);
    doc.footerNotes.forEach((n) => {
      text(n, MARGIN, y, { size: 7.5, color: MUTED, maxWidth: contentWidth });
      y -= 11;
    });
    y -= 10;
  }

  // ---- Authorised signatory block (bottom-right) ----
  if (doc.signatory) {
    ensureSpace(60);
    const sigX = pageWidth - MARGIN - 180;
    let sy = Math.max(y, bottomLimit + 50);
    page.drawLine({ start: { x: sigX, y: sy }, end: { x: pageWidth - MARGIN, y: sy }, thickness: 0.75, color: LINE });
    sy -= 12;
    text(doc.signatory.heading, sigX, sy, { size: 8, font: bold });
    sy -= 11;
    doc.signatory.lines.forEach((ln) => {
      text(ln, sigX, sy, { size: 7.5, color: MUTED });
      sy -= 10;
    });
  }

  return pdf.save();
}
