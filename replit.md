# Swasthera Settlement Module

A full-stack, deployable React web application for a finance team to manage a 6-phase marketplace settlement platform.

## Architecture

### Monorepo Structure
- `artifacts/swasthera/` — React + Vite + Tailwind v4 + shadcn/Radix frontend (port 20381, preview path `/`)
- `artifacts/api-server/` — Express 5 REST API backend (port 8080, path `/api`)
- `lib/db/` — Drizzle ORM PostgreSQL schema + migrations
- `lib/api-spec/` — OpenAPI 3.1 spec (`openapi.yaml`) with Orval codegen
- `lib/api-client-react/` — Generated TanStack Query React hooks
- `lib/api-zod/` — Generated Zod validation schemas

### Frontend Stack
- React 19 + Vite 7 + TypeScript
- Tailwind CSS v4 + shadcn/ui + Radix UI
- TanStack Query for server state
- wouter for routing
- recharts for charts
- react-hook-form + Zod for forms

### Backend Stack
- Express 5 + TypeScript
- Drizzle ORM + PostgreSQL (Replit managed DB)
- pino + pino-http for structured logging
- esbuild for bundling

## Settlement Module — 6 Phases

1. **Brand Onboarding** — Maker creates draft (company, brand, warehouse, commercial terms), KYB verified, documents uploaded, submits for Checker review
2. **Checker Approval** — Queue of pending submissions; Checker approves/rejects with notes; Fynd sync triggered on approval
3. **Fynd Sync** — After approval, brand is synced to Fynd platform (Company Code, Brand ID, Location ID)
4. **Order Tracking** — Bag register with OMS state, return window eligibility, TCS/TDS accrual per bag
5. **Settlement Computation** — Deduction waterfall: GMV → brand promotions (not marketplace) → commission → GST on commission → TCS → TDS → MDR → penalty → net payable
6. **Payout with UTR** — Maker-Checker approval workflow: Maker reviews & initiates, Checker approves, backend auto-generates UTR → Settled

## Database Schema

Tables:
- `onboardings` — Brand onboarding submissions (status: DRAFT → SUBMITTED → APPROVED/REJECTED → ACTIVE); denormalized brand/warehouse fields kept for backward compat
  - Fields: registeredAddress, brandLegalName, stateCode, tcsApplicable (BRD §2)
  - Document URLs: panDocUrl, gstCertUrl, cinDocUrl, cancelledChequeUrl, signedAgreementUrl, digitalSignatureUrl (BRD §3.1)
  - KYB tracking: kybStatus, kybVerifiedAt, kybAttempts (BRD §3.2)
- `brands` — Normalised brand table (Company → Brand hierarchy); brandCode=BR-XXXXX, companyId=CO-XXXXX derived from onboarding_id
  - Auto-created on POST /onboardings; auto-populated from onboarding data on first GET /onboardings/:id/brands
- `warehouses` — Normalised warehouse table (Brand → Warehouse hierarchy); warehouseCode=WH-XXXXX
  - isPrimary flag; stateCode derived from warehouseGstin prefix; auto-created alongside brand
  - Used as authoritative source for stateCode/GSTIN in bag/TCS calculations
- `commission_master` — Versioned commission rate history per onboarding (BRD §3.4)
  - Fields: commissionType (FLAT_PERCENT/TIERED), commissionPercent, effectiveFromDate, effectiveToDate, isCurrent
- `bags` — OMS bag register with eligibility (eligible/in_window/on_hold/settled/awaiting_delivery); stateCode + stateGstin sourced from primary warehouse
- `tcs_records` — TCS accruals by state GSTIN per month; supports reversal entries (isReversal, reversalReason, originalBagId)
- `tds_records` — TDS deductions by company TAN per month; supports reversal entries
- `settlements` — Settlement computation runs with deduction waterfall; includes brandPromotions + marketplacePromotions (BRD §7)
- `payouts` — Payout records with UTR confirmation
- `activity` — Audit activity log

## API Routes

All routes under `/api/`:
- `GET /healthz` — Health check
- `GET /dashboard/summary` — Cycle KPIs (GMV, net payable, TCS, TDS, pending approvals)
- `GET /dashboard/brand-settlements` — Brand settlement status table
- `GET /activity` — Recent activity log
- `GET/POST /onboardings` — List & create onboardings (auto-creates commission_master + brands entry + warehouses entry)
- `GET/PUT /onboardings/:id` — Get & update onboarding (PUT recalculates docsUploaded count)
- `POST /onboardings/:id/kyb-check` — Simulate KYB API (validates PAN format regex, 600ms delay); blocks submit if failed
- `POST /onboardings/:id/submit` — Maker submits (blocked if kybStatus !== PASSED)
- `POST /onboardings/:id/approve` — Checker approves (triggers Fynd sync, updates commission_master checker field)
- `POST /onboardings/:id/reject` — Checker rejects with reason
- `GET /commission-master/:onboardingId` — List all versioned commission rates
- `POST /commission-master/:onboardingId` — Add new version (archives current, sets effectiveToDate)
- `GET /orders` — Bag register with filters
- `GET /orders/:id` — Bag detail with OMS timeline
- `GET /compliance/tcs-tds` — TCS/TDS summary (gross, reversals, net) by month/year
- `GET /compliance/tcs-records` — State-wise TCS register (includes reversal entries)
- `GET /compliance/tds-records` — Company TDS register (includes reversal entries)
- `POST /compliance/reversal` — Log TCS/TDS reversal for a bag (BRD §5.4); inserts negative entries, marks bag on_hold
- `GET /compliance/calendar` — 13 compliance due dates incl. Form 27EQ, 26Q, 16A
- `GET/POST /settlements` — Settlement list & compute new run (brand vs marketplace promotions tracked separately)
- `GET /settlements/:id` — Settlement with waterfall detail
- `GET /settlements/:id/soc` — Download SoC as CSV (27 BRD fields per bag: Order ID, ESP, discounts, commission, TCS, TDS, UTR...)
- `POST /settlements/:id/approve` — Checker finance sign-off (triggers payout creation)
- `GET /payouts` — Payout list (filterable by status)
- `POST /payouts/:id/initiate` — Maker action: submit payout for Checker approval (PENDING_APPROVAL → INITIATED)
- `POST /payouts/:id/approve` — Checker action: approve payout → backend auto-generates NEFT UTR → SETTLED immediately

## Frontend Pages

- `/` — Dashboard (KPI cards, brand settlement table, activity feed)
- `/onboarding` — Onboarding list with KYB status column and docs count
- `/onboarding/new` — Full onboarding form (company, brand, banking, SPOC, warehouse, commercial terms)
- `/onboarding/:id` — Onboarding detail with:
  - KYB phase gate panel (Run KYB Check button → shows PASSED/FAILED)
  - Document checklist (6 docs with simulated upload; blocked until KYB passes)
  - Commission Master versioning panel (view history, add new version)
  - Fynd Sync IDs (post-approval)
  - Role-gated actions: Maker sees Submit, Checker sees Approve/Reject
- `/orders` — Bag register (TCS/TDS per bag, eligibility, return window)
- `/compliance` — TCS/TDS registers with reversal entry rows (amber highlighted), net after reversals in summary cards, Log Reversal button, 13-entry compliance calendar
- `/settlements` — Settlement list with status filter
- `/settlements/:id` — Settlement detail with:
  - BRD §7 deduction waterfall (numbered steps 1–10, brand vs marketplace promotions split)
  - Download SoC CSV button (27-field per-bag report)
  - Finance approval dialog with notes (Checker only)
- `/payouts` — Payout management + UTR recording modal

## Role Simulation (BRD §3.1 Maker-Checker)

`RoleContext` (`artifacts/swasthera/src/contexts/RoleContext.tsx`) stores role in localStorage.
Role switcher (Maker / Checker toggle) in the sidebar footer — active role label shown.
- **Maker**: can create drafts, run KYB, upload documents, submit for review
- **Checker**: can approve or reject submitted onboardings, approve settlements

## Invoice PDFs (two distinct documents)

Every captured order generates an `invoices` row. Each row can be downloaded as TWO different PDFs:
- **Customer tax invoice** — `GET /api/invoices/:id/pdf` (`buildCustomerInvoiceDocument`): GST tax invoice to the end customer (CGST/SGST/IGST, Bill To customer, HSN). Credit notes use the same builder.
- **Brand settlement invoice** — `GET /api/invoices/:id/brand-pdf` (`buildBrandInvoiceDocument`): the deduction waterfall the marketplace raises against the brand (GMV → commission → GST on commission → TDS → TCS → net payable to brand).
- A legacy HTML preview still exists at `GET /api/invoices/:id/download` but the UI no longer links to it — both the Orders invoice dialog and the Invoice Repository download PDFs.

## Seeing reversals manually (UI)

Reversal actions live on the **Orders page** (`/orders`) and require the **Backend** role (switch via the role toggle in the sidebar footer — the Actions/Reverse column only renders for Backend). Each bag row has a Reverse (↺) button → opens the ReversalDialog, which calls `GET /transactions/:orderId/reversal-preview` (read-only) and shows the classified scenario + statutory deadline before you confirm. The Return Window column also shows a red "Reversal by <date>" warning when the deadline has passed.

## Seed Data (MAY-2026-C1 cycle)

Active brands: Zara India, H&M India, Fabindia + 2 new onboardings (Manyavar, Biba)
- 30 bags seeded across the cycle
- 3 settlements (1 APPROVED, 1 PENDING_APPROVAL, 1 COMPUTED)
- 1 completed payout with UTR for Zara India
- TCS/TDS records for May 2026 (3 entries each) and April 2026

### Reversal demo bags (JUN-2026-DEMO cycle)

Three Zara India bags (each with a captured invoice) are seeded so all reversal cases are runnable live from the Orders page in the Backend role:
- `DEMO-PREDELIVERY-CANCEL` — not yet delivered (delivery_date NULL) → Reverse triggers Pre-delivery cancellation (scenario 1) → CANCELLED + credit note + reversal (deadline in the future, eligible).
- `DEMO-RETURN-INWINDOW` — delivered, return window open → Reverse initiates a return (scenario 2); then accept (credit note + reversal) or reject (window restored).
- `DEMO-RETURN-PASTWINDOW` — delivered, window expired, reversal deadline already past (red warning) → Reverse is rejected (scenario 3): no credit note, audit log only.

These are inserted directly in Postgres (no seed script exists); recreate via `POST /bags` + `POST /transactions/capture` (X-Role: backend), and `UPDATE bags SET delivery_date=NULL` for the pre-delivery one (POST /bags always defaults a delivery date).

## Codegen

After modifying `lib/api-spec/openapi.yaml`:
```bash
pnpm --filter @workspace/api-spec run codegen
# Then manually restore:
echo 'export * from "./generated/api";' > lib/api-zod/src/index.ts
```

Note: New endpoints (KYB check, commission-master, SoC download, compliance reversal) use direct `fetch` in the frontend rather than generated hooks, since codegen requires OpenAPI spec updates.

## Key Business Rules

- TCS rate: 1% of taxable supply (collected at source by marketplace operator per Section 52 GST)
- TDS rate: 1% of gross payment (deducted at source per Section 194-O IT Act)
- Commission is charged as a % of GMV; GST at 18% is applied on commission
- Marketplace-funded promotions are NOT deducted from brand payout (BRD §7 note)
- Brand-funded promotions ARE deducted from brand payout
- Return window: typically 14–21 days post-delivery; bags in window are "in_window" (not eligible yet)
- KYB must pass (PAN format validation) before Maker can submit for Checker review
- GSTR-8 filing deadline: 10th of following month
- TCS/TDS deposit deadline: 7th of following month
- Commission versioning: each new rate archives the previous (effectiveToDate set); orders settled at rate effective on order date
