---
name: Server-side PDF generation (pdf-lib)
description: Choice of PDF library for api-server invoices and the rupee-glyph gotcha
---

# Server-side PDF generation

The api-server generates PDFs with **pdf-lib** (pure JS, in `services/pdfService.ts` as a generic
`generateInvoicePdf(InvoiceDocument)` utility, reusable across invoice types).

**Why pdf-lib over pdfkit/pdfmake/puppeteer:** the api-server bundles with esbuild. pdf-lib is pure
JS with no external font files (uses built-in StandardFonts) and no native deps, so it bundles
cleanly with zero esbuild config. pdfkit/pdfmake ship `.afm`/`vfs` font assets that fight esbuild;
puppeteer needs a browser. (puppeteer/playwright are already in build.mjs `external`.)

**Rupee glyph gotcha:** StandardFonts use WinAnsi encoding, which **cannot encode `₹` (U+20B9)** —
`drawText("₹…")` throws "WinAnsi cannot encode". Render currency as an `INR ` prefix with Indian
digit grouping instead (see `formatINR`/`groupINR` in pdfService). Any non-ASCII char must be
stripped/transliterated before drawing.

**How to apply:** build a structured `InvoiceDocument` (parties, columns, rows, summary, net) and
hand it to `generateInvoicePdf`; never recompute money inside the renderer. Manual table layout with
page-break handling lives in the renderer.
