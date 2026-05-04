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

1. **Brand Onboarding** — Maker creates draft (company, brand, warehouse, commercial terms), submits for Checker review
2. **Checker Approval** — Queue of pending submissions; Checker approves/rejects with notes
3. **Fynd Sync** — After approval, brand is synced to Fynd platform (Company Code, Brand ID, Location ID)
4. **Order Tracking** — Bag register with OMS state, return window eligibility, TCS/TDS accrual per bag
5. **Settlement Computation** — Deduction waterfall: GMV → promotions → commission → GST on commission → TCS → TDS → MDR → penalty → net payable
6. **Payout with UTR** — NEFT/RTGS payout initiation and UTR bank acknowledgment recording

## Database Schema

Tables:
- `onboardings` — Brand onboarding submissions (status: DRAFT → SUBMITTED → APPROVED/REJECTED → ACTIVE)
- `bags` — OMS bag register with eligibility (eligible/in_window/on_hold/settled/awaiting_delivery)
- `tcs_records` — TCS accruals by state GSTIN per month
- `tds_records` — TDS deductions by company TAN per month
- `settlements` — Settlement computation runs with deduction waterfall
- `payouts` — Payout records with UTR confirmation
- `activity` — Audit activity log

## API Routes

All routes under `/api/`:
- `GET /healthz` — Health check
- `GET /dashboard/summary` — Cycle KPIs (GMV, net payable, TCS, TDS, pending approvals)
- `GET /dashboard/brand-settlements` — Brand settlement status table
- `GET /activity` — Recent activity log
- `GET/POST /onboardings` — List & create onboardings
- `GET/PUT /onboardings/:id` — Get & update onboarding
- `POST /onboardings/:id/submit` — Maker submits for Checker
- `POST /onboardings/:id/approve` — Checker approves
- `POST /onboardings/:id/reject` — Checker rejects
- `GET /orders` — Bag register with filters
- `GET /orders/:id` — Bag detail with OMS timeline
- `GET /compliance/tcs-tds` — TCS/TDS summary by month/year
- `GET /compliance/tcs-records` — State-wise TCS register
- `GET /compliance/tds-records` — Company TDS register
- `GET /compliance/calendar` — Compliance due dates
- `GET/POST /settlements` — Settlement list & compute new run
- `GET /settlements/:id` — Settlement with waterfall detail
- `POST /settlements/:id/approve` — Finance sign-off (triggers payout creation)
- `GET /payouts` — Payout list
- `POST /payouts/:id/record-utr` — Record UTR and mark settled

## Frontend Pages

- `/` — Dashboard (KPI cards, brand settlement table, activity feed)
- `/onboarding` — Onboarding list with search/filter
- `/onboarding/new` — Multi-step onboarding wizard
- `/onboarding/:id` — Onboarding detail + Checker panel
- `/orders` — Bag register (TCS/TDS per bag, eligibility, return window)
- `/compliance` — TCS/TDS register (state-wise), TDS register (company-wise), compliance calendar
- `/settlements` — Settlement list with status filter
- `/settlements/:id` — Settlement detail with deduction waterfall
- `/payouts` — Payout management + UTR recording modal

## Seed Data (MAY-2026-C1 cycle)

Active brands: Zara India, H&M India, Fabindia
- 15 bags seeded across the cycle
- 3 settlements (1 APPROVED/PAID, 1 PENDING_APPROVAL, 1 COMPUTED)
- 1 completed payout with UTR for Zara India
- TCS/TDS records for May 2026 and April 2026

## Codegen

After modifying `lib/api-spec/openapi.yaml`:
```bash
pnpm --filter @workspace/api-spec run codegen
# Then manually restore:
echo 'export * from "./generated/api";' > lib/api-zod/src/index.ts
```

Note: The `lib/api-zod/src/index.ts` gets overwritten by codegen with stale references — it must be fixed to only export from `./generated/api` after each codegen run.

## Key Business Rules

- TCS rate: 1% of taxable supply (collected at source by marketplace operator per Section 52 GST)
- TDS rate: 1% of gross payment (deducted at source per Section 194-O IT Act)
- Commission is charged as a % of GMV; GST at 18% is applied on commission
- Return window: typically 14–21 days post-delivery; bags in window are "in_window" (not eligible yet)
- GSTR-8 filing deadline: 10th of following month
- TCS/TDS deposit deadline: 7th of following month
