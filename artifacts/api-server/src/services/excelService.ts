import ExcelJS from "exceljs";
import type { Response } from "express";

/**
 * Shared Excel (.xlsx) generation service.
 *
 * Every finance export across the platform (settlements, payouts, master data,
 * tax registers) is rendered through this single service so styling, number
 * formatting and the streaming MIME type stay consistent. Callers describe the
 * workbook declaratively (sheets → columns → rows) and never touch exceljs
 * directly.
 */

export type ExcelAlign = "left" | "right" | "center";
export type ExcelType = "text" | "number" | "currency" | "integer" | "percent" | "date";

export interface ExcelColumn {
  /** Key used to look up the value in each row record. */
  key: string;
  /** Human-readable column header. */
  header: string;
  /** Column width in characters. Falls back to a type-based default. */
  width?: number;
  /** Cell alignment. Falls back to a type-based default. */
  align?: ExcelAlign;
  /** Cell value type — drives number formatting and default alignment. */
  type?: ExcelType;
  /** When true, this column is summed into the totals row. */
  total?: boolean;
}

/** A hyperlink cell value — renders as clickable text linking to `url`. */
export interface ExcelHyperlink {
  text: string;
  url: string;
}

export type ExcelCell = string | number | boolean | null | undefined | ExcelHyperlink;

export interface ExcelSheetSpec {
  /** Sheet/tab name (truncated to Excel's 31-char limit). */
  name: string;
  /** Optional bold title row rendered above the header. */
  title?: string;
  columns: ExcelColumn[];
  rows: Record<string, ExcelCell>[];
  /** When true, appends a bold totals row summing every `total` column. */
  totals?: boolean;
}

// Indian-grouping number formats (lakh/crore style, e.g. 12,34,567.00).
const CURRENCY_FMT = "#,##,##0.00";
const INTEGER_FMT = "#,##,##0";
const PERCENT_FMT = '0.00"%"';

const HEADER_FILL = "FF0F172A"; // slate-900
const ROW_STRIPE_FILL = "FFF8FAFC"; // slate-50
const TOTAL_FILL = "FFEFF6FF"; // blue-50
const LINK_COLOR = "FF2563EB"; // blue-600

function isHyperlink(v: ExcelCell): v is ExcelHyperlink {
  return typeof v === "object" && v !== null && "url" in v && "text" in v;
}

function defaultAlign(col: ExcelColumn): ExcelAlign {
  switch (col.type) {
    case "currency":
    case "number":
    case "integer":
    case "percent":
      return "right";
    default:
      return "left";
  }
}

function defaultWidth(col: ExcelColumn): number {
  switch (col.type) {
    case "currency":
    case "number":
      return 16;
    case "integer":
    case "percent":
      return 12;
    case "date":
      return 14;
    default:
      return 18;
  }
}

function numFmtFor(col: ExcelColumn): string | undefined {
  switch (col.type) {
    case "currency":
    case "number":
      return CURRENCY_FMT;
    case "integer":
      return INTEGER_FMT;
    case "percent":
      return PERCENT_FMT;
    default:
      return undefined;
  }
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFE2E8F0" } };
  return { top: side, left: side, bottom: side, right: side };
}

function applyCell(cell: ExcelJS.Cell, col: ExcelColumn, value: ExcelCell): void {
  const align = col.align ?? defaultAlign(col);

  if (value === null || value === undefined || value === "") {
    cell.value = null;
    cell.alignment = { horizontal: align, vertical: "middle" };
    return;
  }

  if (isHyperlink(value)) {
    cell.value = { text: value.text, hyperlink: value.url };
    cell.font = { color: { argb: LINK_COLOR }, underline: true, size: 10 };
    cell.alignment = { horizontal: col.align ?? "left", vertical: "middle" };
    return;
  }

  const type = col.type ?? "text";
  const isNumeric = type === "currency" || type === "number" || type === "integer" || type === "percent";

  if (isNumeric && typeof value === "number") {
    cell.value = value;
    const fmt = numFmtFor(col);
    if (fmt) cell.numFmt = fmt;
    cell.alignment = { horizontal: align, vertical: "middle" };
  } else {
    cell.value = value;
    cell.alignment = { horizontal: align, vertical: "middle" };
  }
  cell.font = { size: 10 };
}

/**
 * Builds a styled multi-sheet .xlsx workbook and returns it as a Buffer.
 */
export async function buildWorkbook(sheets: ExcelSheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Swasthera Settlement Module";
  wb.created = new Date();

  for (const spec of sheets) {
    const colCount = spec.columns.length;
    const headerRowIdx = spec.title ? 2 : 1;

    const ws = wb.addWorksheet(spec.name.slice(0, 31), {
      views: [{ state: "frozen", ySplit: headerRowIdx }],
    });

    if (spec.title) {
      ws.mergeCells(1, 1, 1, Math.max(colCount, 1));
      const titleCell = ws.getCell(1, 1);
      titleCell.value = spec.title;
      titleCell.font = { bold: true, size: 14, color: { argb: HEADER_FILL } };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(1).height = 24;
    }

    // Column widths
    spec.columns.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.width ?? defaultWidth(col);
    });

    // Header row
    const headerRow = ws.getRow(headerRowIdx);
    spec.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: col.align ?? defaultAlign(col), vertical: "middle", wrapText: true };
      cell.border = thinBorder();
    });
    headerRow.height = 20;

    // Data rows
    spec.rows.forEach((row, ri) => {
      const r = ws.getRow(headerRowIdx + 1 + ri);
      spec.columns.forEach((col, ci) => {
        const cell = r.getCell(ci + 1);
        applyCell(cell, col, row[col.key]);
        cell.border = thinBorder();
        if (ri % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_STRIPE_FILL } };
        }
      });
    });

    // Totals row
    if (spec.totals && spec.rows.length > 0) {
      const totalRowIdx = headerRowIdx + 1 + spec.rows.length;
      const tr = ws.getRow(totalRowIdx);
      spec.columns.forEach((col, ci) => {
        const cell = tr.getCell(ci + 1);
        cell.font = { bold: true, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
        cell.border = {
          ...thinBorder(),
          top: { style: "medium", color: { argb: HEADER_FILL } },
        };
        if (ci === 0) {
          cell.value = "TOTAL";
          cell.alignment = { horizontal: "left", vertical: "middle" };
        } else if (col.total) {
          const sum = spec.rows.reduce((s, row) => {
            const v = row[col.key];
            return s + (typeof v === "number" ? v : 0);
          }, 0);
          cell.value = Math.round(sum * 100) / 100;
          const fmt = numFmtFor(col);
          if (fmt) cell.numFmt = fmt;
          cell.alignment = { horizontal: col.align ?? "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: col.align ?? defaultAlign(col), vertical: "middle" };
        }
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Streams a workbook Buffer to the client with the correct .xlsx MIME type. */
export function sendWorkbook(res: Response, filename: string, buf: Buffer): void {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
}

/** Builds a hyperlink cell for a document URL, or an em-dash placeholder when absent. */
export function docLink(url: string | null | undefined, label = "View"): ExcelCell {
  return url ? { text: label, url } : "—";
}
