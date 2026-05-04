import { useState, useEffect, useRef } from "react";

type Step =
  | "dashboard"
  | "ob-company" | "ob-brand" | "ob-warehouse"
  | "kyb-pending" | "kyb-passed"
  | "ob-docs" | "ob-commercial" | "ob-review" | "ob-submitted"
  | "checker-queue" | "checker-detail"
  | "fynd-syncing" | "fynd-done"
  | "orders" | "tcs-tds"
  | "settlement" | "settlement-approve"
  | "payout" | "utr-entry" | "complete";

// ─── DESIGN TOKENS ──────────────────────────────────────────────────────────
const c = {
  sidebar: "bg-[#0F172A]",
  page: "bg-[#F8FAFC]",
  card: "bg-white border border-[#E2E8F0] rounded",
  th: "text-[10px] font-semibold text-[#64748B] uppercase tracking-wider py-2 px-3 text-left",
  td: "text-[11px] text-[#1E293B] py-2 px-3 border-t border-[#F1F5F9]",
  label: "block text-[11px] font-medium text-[#475569] mb-1",
  input: "w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-[12px] text-[#1E293B] bg-white focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20",
  select: "w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-[12px] text-[#1E293B] bg-white focus:outline-none focus:border-[#2563EB]",
  btnPrimary: "bg-[#2563EB] text-white text-[12px] font-semibold px-4 py-1.5 rounded hover:bg-[#1D4ED8] cursor-pointer transition-colors",
  btnSecondary: "border border-[#CBD5E1] text-[#475569] text-[12px] font-medium px-3 py-1.5 rounded hover:bg-[#F8FAFC] cursor-pointer transition-colors bg-white",
  btnDanger: "border border-[#FECACA] text-[#DC2626] text-[12px] font-medium px-3 py-1.5 rounded hover:bg-[#FEF2F2] cursor-pointer transition-colors bg-white",
  btnSuccess: "bg-[#16A34A] text-white text-[12px] font-semibold px-4 py-1.5 rounded hover:bg-[#15803D] cursor-pointer transition-colors",
};

// ─── STATUS BADGE ────────────────────────────────────────────────────────────
function Badge({ text, type }: { text: string; type: "green"|"amber"|"red"|"blue"|"gray"|"purple" }) {
  const map = {
    green: "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]",
    amber: "bg-[#FEF9C3] text-[#B45309] border-[#FDE68A]",
    red: "bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]",
    blue: "bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]",
    gray: "bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]",
    purple: "bg-[#F3E8FF] text-[#7C3AED] border-[#E9D5FF]",
  };
  return <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${map[type]}`}>{text}</span>;
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
const NAV = [
  { group: "Settlement", items: [
    { id: "dashboard", label: "Dashboard", icon: "⊞" },
    { id: "ob-company", label: "Brand Onboarding", icon: "＋", badge: undefined },
    { id: "checker-queue", label: "Approval Queue", icon: "✓", badge: "1" },
    { id: "orders", label: "Order Tracking", icon: "◉" },
    { id: "tcs-tds", label: "TCS / TDS Register", icon: "⚖" },
    { id: "settlement", label: "Settlement Runs", icon: "≡" },
    { id: "payout", label: "Payout", icon: "↗" },
  ]},
  { group: "Config", items: [
    { id: "dashboard", label: "Commission Master", icon: "%" },
    { id: "dashboard", label: "Return Policies", icon: "↩" },
    { id: "dashboard", label: "Brands & Companies", icon: "🏢" },
  ]},
];

function Sidebar({ step, setStep }: { step: Step; setStep: (s: Step) => void }) {
  const active = (id: string) => step === id || (id === "ob-company" && step.startsWith("ob-")) || (id === "ob-company" && ["kyb-pending","kyb-passed","ob-submitted"].includes(step)) || (id === "checker-queue" && step === "checker-detail") || (id === "settlement" && step === "settlement-approve") || (id === "payout" && ["utr-entry","complete"].includes(step)) || (id === "orders" && step === "orders-detail");
  return (
    <aside className={`w-48 shrink-0 flex flex-col ${c.sidebar} h-full`}>
      <div className="px-4 py-3.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#2563EB] flex items-center justify-center text-white text-[10px] font-bold">S</div>
          <div><div className="text-white text-[12px] font-semibold leading-none">Swasthera</div><div className="text-[#94A3B8] text-[10px] mt-0.5">Finance Portal v2.4</div></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {NAV.map(g => (
          <div key={g.group} className="mb-3">
            <div className="text-[9px] text-[#64748B] font-semibold uppercase tracking-widest px-4 py-1.5">{g.group}</div>
            {g.items.map(item => (
              <button key={item.label} onClick={() => setStep(item.id as Step)}
                className={`w-full flex items-center justify-between px-4 py-1.5 text-[11px] transition-colors ${active(item.id) ? "bg-[#2563EB] text-white font-medium" : "text-[#94A3B8] hover:text-white hover:bg-white/5"}`}>
                <span className="flex items-center gap-2">
                  <span className="w-3 text-center text-[11px] opacity-70">{item.icon}</span>
                  {item.label}
                </span>
                {item.badge && <span className="bg-[#F59E0B] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{item.badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-[9px] font-bold">AP</div>
          <div><div className="text-white text-[10px] font-medium">Anjali Patel</div><div className="text-[#64748B] text-[9px]">Finance · Maker</div></div>
        </div>
      </div>
    </aside>
  );
}

// ─── TOP BAR ─────────────────────────────────────────────────────────────────
const BREADCRUMBS: Partial<Record<Step, string[]>> = {
  "dashboard": ["Settlement"],
  "ob-company": ["Onboarding", "Company Details"],
  "ob-brand": ["Onboarding", "Brand Details"],
  "ob-warehouse": ["Onboarding", "Warehouse"],
  "kyb-pending": ["Onboarding", "KYB Verification"],
  "kyb-passed": ["Onboarding", "KYB Result"],
  "ob-docs": ["Onboarding", "Documents"],
  "ob-commercial": ["Onboarding", "Commercial Terms"],
  "ob-review": ["Onboarding", "Review & Submit"],
  "ob-submitted": ["Onboarding", "Submitted"],
  "checker-queue": ["Approval", "Queue"],
  "checker-detail": ["Approval", "Review — OB-2026-049"],
  "fynd-syncing": ["Fynd Sync", "Syncing"],
  "fynd-done": ["Fynd Sync", "Complete"],
  "orders": ["Order Tracking", "Bag Register"],
  "tcs-tds": ["Compliance", "TCS / TDS Register"],
  "settlement": ["Settlement", "Computation"],
  "settlement-approve": ["Settlement", "Finance Sign-off"],
  "payout": ["Payout", "Initiation"],
  "utr-entry": ["Payout", "UTR Confirmation"],
  "complete": ["Payout", "Settled"],
};

function TopBar({ step, setStep }: { step: Step; setStep: (s: Step) => void }) {
  const crumbs = BREADCRUMBS[step] ?? ["Settlement"];
  return (
    <div className="h-10 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-1.5 text-[11px]">
        {crumbs.map((c2, i) => (
          <span key={c2} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[#CBD5E1]">/</span>}
            <span className={i === crumbs.length - 1 ? "text-[#1E293B] font-semibold" : "text-[#94A3B8]"}>{c2}</span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded px-2.5 py-1 text-[10px] text-[#475569]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
          Cycle: MAY-2026-C1 · 1–15 May 2026
        </div>
        <div className="flex items-center gap-1.5 bg-[#FEF9C3] border border-[#FDE68A] rounded px-2.5 py-1 text-[10px] text-[#B45309] font-medium cursor-pointer" onClick={() => setStep("checker-queue")}>
          ⚠ 1 pending approval
        </div>
      </div>
    </div>
  );
}

// ─── SHARED ───────────────────────────────────────────────────────────────────
function F({ label, value, placeholder, hint, mono, required, type, span }: { label: string; value?: string; placeholder?: string; hint?: string; mono?: boolean; required?: boolean; type?: string; span?: number }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className={c.label}>{label}{required && <span className="text-[#DC2626] ml-0.5">*</span>}</label>
      <input defaultValue={value} placeholder={placeholder} type={type}
        className={`${c.input} ${mono ? "font-mono text-[11px]" : ""}`} />
      {hint && <div className="text-[10px] text-[#94A3B8] mt-0.5">{hint}</div>}
    </div>
  );
}
function SL({ label, opts, required }: { label: string; opts: string[]; required?: boolean }) {
  return (
    <div>
      <label className={c.label}>{label}{required && <span className="text-[#DC2626] ml-0.5">*</span>}</label>
      <select className={c.select}>{opts.map(o => <option key={o}>{o}</option>)}</select>
    </div>
  );
}
function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div><h1 className="text-[16px] font-semibold text-[#0F172A] leading-none">{title}</h1>{sub && <div className="text-[11px] text-[#64748B] mt-1">{sub}</div>}</div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
function KPI({ label, value, sub, delta, color }: { label: string; value: string; sub?: string; delta?: string; color?: string }) {
  return (
    <div className={`${c.card} px-4 py-3`}>
      <div className="text-[10px] text-[#64748B] font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-[20px] font-bold mt-1 leading-none ${color ?? "text-[#0F172A]"}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94A3B8] mt-1">{sub}</div>}
      {delta && <div className="text-[10px] text-[#16A34A] mt-1 font-medium">{delta}</div>}
    </div>
  );
}
function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 mb-3">{children}</div>;
}
function SearchInput({ placeholder }: { placeholder: string }) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] text-[10px]">⌕</span>
      <input placeholder={placeholder} className="border border-[#E2E8F0] rounded pl-6 pr-3 py-1.5 text-[11px] text-[#1E293B] bg-white focus:outline-none focus:border-[#2563EB] w-48" />
    </div>
  );
}
function WizardSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-0 mb-5 border-b border-[#E2E8F0] pb-4">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${i < current ? "bg-[#16A34A] text-white" : i === current ? "bg-[#2563EB] text-white" : "bg-[#E2E8F0] text-[#94A3B8]"}`}>
              {i < current ? "✓" : i + 1}
            </div>
            <span className={`text-[10px] font-medium ${i === current ? "text-[#2563EB]" : i < current ? "text-[#16A34A]" : "text-[#94A3B8]"}`}>{s}</span>
          </div>
          {i < steps.length - 1 && <div className={`w-5 h-px mx-2 ${i < current ? "bg-[#16A34A]" : "bg-[#E2E8F0]"}`} />}
        </div>
      ))}
    </div>
  );
}
function SectionCard({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`${c.card} mb-4`}>
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#F1F5F9]">
          <span className="text-[11px] font-semibold text-[#1E293B]">{title}</span>
          {action}
        </div>
      )}
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}
function FooterActions({ left, right }: { left?: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-[#E2E8F0] mt-4">
      <div>{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

// ─── SCREEN: DASHBOARD ───────────────────────────────────────────────────────
function ScreenDashboard({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="Settlement Dashboard"
        right={<>
          <button className={c.btnSecondary}>Export ↓</button>
          <button className={c.btnPrimary} onClick={() => setStep("ob-company")}>+ New Brand Onboarding</button>
        </>} />

      <div className="grid grid-cols-6 gap-3 mb-4">
        <KPI label="Gross GMV (Cycle)" value="₹2,84,60,450" sub="14,820 eligible bags" delta="↑ 12% vs last cycle" />
        <KPI label="Net Payable" value="₹2,41,35,780" sub="After all deductions" color="text-[#2563EB]" />
        <KPI label="Commission Earned" value="₹31,30,649" sub="11% avg rate" />
        <KPI label="TCS Accrued" value="₹2,84,604" sub="Cycle · 10 GSTINs" color="text-[#B45309]" />
        <KPI label="TDS Deducted" value="₹2,84,604" sub="194-O · 12 companies" color="text-[#B45309]" />
        <KPI label="Pending Payouts" value="₹68,80,800" sub="2 awaiting UTR" color="text-[#DC2626]" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="col-span-2">
          <SectionCard title="Active Cycle — Brand Settlement Summary" action={<button className="text-[10px] text-[#2563EB]">View all →</button>}>
            <table className="w-full">
              <thead>
                <tr>
                  {["Company","Brand","Eligible Bags","GMV (₹)","Commission (₹)","TCS (₹)","TDS (₹)","Net Payable (₹)","Status"].map(h => <th key={h} className={c.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  { co:"GreenLeaf Ayurveda","brand":"GreenLeaf Herbs",bags:2840,gmv:"28,40,800",comm:"3,12,488",tcs:"28,408",tds:"28,408",net:"24,71,496",st:"Pending Approval",stt:"amber" as const },
                  { co:"NutriLife Sciences","brand":"NutriLife Pro",bags:1820,gmv:"18,20,540",comm:"2,00,259",tcs:"18,205",tds:"18,205",net:"15,83,871",st:"Approved",stt:"green" as const },
                  { co:"MedTech Devices","brand":"MedTech OTC",bags:2640,gmv:"26,40,600",comm:"2,90,466",tcs:"26,406",tds:"26,406",net:"22,97,322",st:"Payout Initiated",stt:"blue" as const },
                  { co:"VitaBoost Wellness","brand":"VitaBoost",bags:420,gmv:"4,20,350",comm:"46,238",tcs:"4,203",tds:"4,203",net:"3,65,706",st:"On Hold",stt:"red" as const },
                ].map((r) => (
                  <tr key={r.co} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => setStep("settlement")}>
                    <td className={c.td}><div className="font-medium">{r.co}</div></td>
                    <td className={c.td}>{r.brand}</td>
                    <td className={c.td + " font-mono text-right"}>{r.bags.toLocaleString()}</td>
                    <td className={c.td + " font-mono text-right"}>{r.gmv}</td>
                    <td className={c.td + " font-mono text-right text-[#475569]"}>{r.comm}</td>
                    <td className={c.td + " font-mono text-right text-[#B45309]"}>{r.tcs}</td>
                    <td className={c.td + " font-mono text-right text-[#B45309]"}>{r.tds}</td>
                    <td className={c.td + " font-mono text-right font-semibold"}>{r.net}</td>
                    <td className={c.td}><Badge text={r.st} type={r.stt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </div>
        <div className="space-y-3">
          <SectionCard title="Pending Actions">
            <div className="space-y-2">
              {[
                { label:"OB-2026-049 awaiting Checker", action:"Review", step:"checker-queue" as Step, type:"amber" as const },
                { label:"GreenLeaf Herbs settlement approval", action:"Approve", step:"settlement-approve" as Step, type:"amber" as const },
                { label:"TCS payment due 7 Jun 2026", action:"View", step:"tcs-tds" as Step, type:"red" as const },
                { label:"GSTR-8 filing due 11 Jun 2026", action:"View", step:"tcs-tds" as Step, type:"red" as const },
              ].map(a => (
                <div key={a.label} className="flex items-start justify-between gap-2 py-1.5 border-b border-[#F1F5F9] last:border-0">
                  <div>
                    <div className="text-[10px] text-[#1E293B] font-medium">{a.label}</div>
                  </div>
                  <button className="text-[10px] text-[#2563EB] font-medium shrink-0" onClick={() => setStep(a.step)}>{a.action} →</button>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="TCS/TDS Summary — May 2026">
            <table className="w-full">
              <thead><tr>
                <th className={c.th}>State</th><th className={c.th}>TCS (₹)</th><th className={c.th}>TDS (₹)</th><th className={c.th}>Status</th>
              </tr></thead>
              <tbody>
                {[["MH (27)","28,408","28,408","Accrued"],["KA (29)","18,205","18,205","Accrued"],["DL (07)","9,840","9,840","Filed"]].map(r => (
                  <tr key={r[0]}><td className={c.td + " font-mono"}>{r[0]}</td><td className={c.td + " font-mono text-right text-[#B45309]"}>{r[1]}</td><td className={c.td + " font-mono text-right text-[#B45309]"}>{r[2]}</td><td className={c.td}><Badge text={r[3]} type={r[3]==="Filed"?"green":"amber"} /></td></tr>
                ))}
              </tbody>
            </table>
            <button className="text-[10px] text-[#2563EB] mt-2 font-medium" onClick={() => setStep("tcs-tds")}>Full TCS/TDS Register →</button>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Recent Activity">
        <div className="space-y-0">
          {[
            { ts:"14 May 16:42", user:"Rahul Kumar", action:"Approved onboarding OB-2026-048 — MedTech Devices Ltd", type:"green" as const },
            { ts:"14 May 14:10", user:"Anjali Patel", action:"Submitted onboarding OB-2026-049 — GreenLeaf Ayurveda for Checker review", type:"blue" as const },
            { ts:"14 May 11:55", user:"System", action:"Fynd Sync completed — MedTech Devices Ltd · fynd_brand_id: FYN-BR-2203", type:"gray" as const },
            { ts:"13 May 09:30", user:"Pradeep Verma", action:"UTR NEFT2405130041 recorded — NutriLife Sciences — ₹15,83,871 settled", type:"green" as const },
            { ts:"12 May 17:00", user:"System", action:"TCS accrued ₹28,408 for GreenLeaf Herbs at bag_invoiced — MH (27)", type:"amber" as const },
          ].map(e => (
            <div key={e.ts} className="flex items-start gap-3 py-2 border-b border-[#F1F5F9] last:border-0">
              <div className="w-24 shrink-0 text-[10px] text-[#94A3B8] pt-px">{e.ts}</div>
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${e.type==="green"?"bg-[#16A34A]":e.type==="blue"?"bg-[#2563EB]":e.type==="amber"?"bg-[#F59E0B]":"bg-[#94A3B8]"}`} />
              <div>
                <span className="text-[10px] text-[#64748B] font-medium">{e.user} · </span>
                <span className="text-[10px] text-[#1E293B]">{e.action}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── SCREEN: ONBOARDING — COMPANY ────────────────────────────────────────────
function ScreenOBCompany({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="New Brand Onboarding" sub="Ref: OB-2026-049 · Maker: Anjali Patel · Started: 14 May 2026 10:48 AM" />
      <WizardSteps steps={["Company","Brand","Warehouse","KYB","Documents","Commercial","Review"]} current={0} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <SectionCard title="1.1 Company Identity">
            <div className="grid grid-cols-2 gap-3">
              <F label="Legal Company Name" value="GreenLeaf Ayurveda Pvt Ltd" required />
              <SL label="Company Type" opts={["Private Ltd","LLP","Proprietorship","Partnership","Public Ltd"]} required />
              <F label="PAN Number" value="AABCG1234F" mono required hint="KYB: PAN verification via NSDL" />
              <F label="CIN / LLPIN" value="U24239MH2020PTC123456" mono hint="Required for Pvt Ltd / LLP" />
            </div>
          </SectionCard>
          <SectionCard title="1.2 Tax Registration">
            <div className="grid grid-cols-2 gap-3">
              <F label="Master GSTIN" value="27AABCG1234F1ZK" mono required hint="Used for commission invoice" />
              <F label="TAN Number" value="MUMC12345A" mono hint="Section 194-O TDS deduction" />
              <SL label="TCS Applicable" opts={["Yes — collect TCS under 52","No — threshold not crossed"]} required />
              <F label="Annual Turnover (Prev FY)" placeholder="e.g. 2,50,00,000" hint="For TCS threshold check" />
            </div>
          </SectionCard>
          <SectionCard title="1.3 Bank Account">
            <div className="grid grid-cols-3 gap-3">
              <F label="Account Number" value="50200012345678" mono required />
              <F label="IFSC Code" value="HDFC0001234" mono required />
              <F label="Bank Name" value="HDFC Bank" required />
              <F label="Account Type" value="Current" />
              <F label="Account Holder Name" value="GreenLeaf Ayurveda Pvt Ltd" span={2} required hint="Must match company legal name exactly" />
            </div>
          </SectionCard>
          <SectionCard title="1.4 Registered Address & SPOC">
            <div className="grid grid-cols-2 gap-3">
              <F label="Registered Address" value="Plot 12, Andheri East, Mumbai" required />
              <F label="City / State / PIN" value="Mumbai, Maharashtra, 400069" required />
              <F label="Finance SPOC Name" value="Priya Sharma" required />
              <F label="Finance SPOC Email" value="priya@greenleaf.in" required />
              <F label="Finance SPOC Mobile" value="+91 98765 43210" required />
              <F label="Finance SPOC Designation" value="Head of Finance" />
            </div>
          </SectionCard>
        </div>
        <div className="space-y-3">
          <SectionCard title="Maker–Checker Control">
            <div className="text-[10px] text-[#475569] leading-relaxed space-y-2">
              <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded p-2 text-[#1D4ED8]">
                <div className="font-semibold mb-0.5">You are the Maker</div>
                <div>Submit for Checker (Finance Supervisor) approval after all steps. Maker cannot self-approve.</div>
              </div>
              <div>Checker: <span className="font-medium text-[#1E293B]">Rahul Kumar · Finance Supervisor</span></div>
            </div>
          </SectionCard>
          <SectionCard title="Step Completion">
            {["Company","Brand","Warehouse","KYB","Documents","Commercial","Review"].map((s, i) => (
              <div key={s} className="flex items-center justify-between py-1.5 border-b border-[#F8FAFC] last:border-0">
                <span className="text-[10px] text-[#475569]">{i+1}. {s}</span>
                <Badge text={i===0?"Active":"Pending"} type={i===0?"blue":"gray"} />
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Important Notes">
            <ul className="text-[10px] text-[#475569] space-y-1.5 list-none">
              <li>· PAN must match GST registration name exactly</li>
              <li>· Cancelled cheque required for bank verification</li>
              <li>· TCS accrues at state GSTIN level (warehouse-wise)</li>
              <li>· TDS u/s 194-O deducted at company level</li>
              <li>· All fields are audited — changes logged with timestamp</li>
            </ul>
          </SectionCard>
        </div>
      </div>
      <FooterActions
        left={<button className={c.btnSecondary} onClick={() => setStep("dashboard")}>← Dashboard</button>}
        right={<>
          <button className={c.btnSecondary}>Save Draft</button>
          <button className={c.btnPrimary} onClick={() => setStep("ob-brand")}>Save & Next: Brand →</button>
        </>} />
    </div>
  );
}

// ─── SCREEN: ONBOARDING — BRAND ──────────────────────────────────────────────
function ScreenOBBrand({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="New Brand Onboarding" sub="Ref: OB-2026-049 · Step 2 of 7" />
      <WizardSteps steps={["Company","Brand","Warehouse","KYB","Documents","Commercial","Review"]} current={1} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <SectionCard title="2.1 Brand Identity">
            <div className="grid grid-cols-2 gap-3">
              <F label="Brand Name (Display)" value="GreenLeaf Herbs" required />
              <F label="Brand Legal Name" value="GreenLeaf Ayurveda Pvt Ltd" required hint="Usually same as company legal name" />
              <SL label="Brand Type" opts={["MANUFACTURER","RETAILER","TRADER","DISTRIBUTOR","IMPORTER"]} required />
              <F label="Category / Sub-category" value="Ayurveda · Wellness" required />
              <F label="HSN / SAC Codes (primary)" placeholder="e.g. 3004, 8718" hint="Comma-separated for multiple SKUs" span={2} />
            </div>
          </SectionCard>
          <SectionCard title="2.2 GST Registrations (Multi-state)" action={<button className="text-[10px] text-[#2563EB] font-medium">+ Add GSTIN</button>}>
            <table className="w-full mb-2">
              <thead><tr>
                <th className={c.th}>State</th><th className={c.th}>GSTIN</th><th className={c.th}>Registration Status</th><th className={c.th}>TCS Filed Here</th>
              </tr></thead>
              <tbody>
                {[["Maharashtra (27)","27AABCG1234F1ZK","Active","Yes"],["Karnataka (29)","29AABCG1234F1ZP","Active","No"]].map(r => (
                  <tr key={r[0]}><td className={c.td}>{r[0]}</td><td className={c.td + " font-mono"}>{r[1]}</td><td className={c.td}><Badge text={r[2]} type="green" /></td><td className={c.td}><Badge text={r[3]} type={r[3]==="Yes"?"blue":"gray"} /></td></tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] text-[#94A3B8]">TCS is filed per warehouse state GSTIN. Payment to company bank account regardless of which brand GSTIN is used.</div>
          </SectionCard>
          <SectionCard title="2.3 Drug License (if applicable)">
            <div className="grid grid-cols-2 gap-3">
              <F label="Drug License Number" value="MH/DRUG/2024/00841" mono hint="Required for Rx / OTC / Scheduled" />
              <F label="License Valid Until" type="date" value="2027-03-31" />
              <F label="Issuing Authority" value="Maharashtra FDA" />
              <SL label="License Type" opts={["Retail","Wholesale","Manufacturing","Import"]} />
            </div>
          </SectionCard>
        </div>
        <div className="space-y-3">
          <div className={`${c.card} px-4 py-3`}>
            <div className="text-[10px] font-semibold text-[#475569] uppercase tracking-wide mb-2">Linked Company</div>
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded p-2.5">
              <div className="text-[11px] font-semibold text-[#15803D]">GreenLeaf Ayurveda Pvt Ltd</div>
              <div className="text-[10px] text-[#16A34A] mt-0.5">Private Ltd · PAN: AABCG1234F</div>
              <div className="text-[10px] text-[#16A34A]">Bank: HDFC ····4521</div>
            </div>
            <div className="text-[10px] text-[#94A3B8] mt-2">Settlement credits company bank. Brands are display entities only — they don't hold bank accounts.</div>
          </div>
          <SectionCard title="Brand–Company Rule">
            <div className="text-[10px] text-[#475569] space-y-1">
              <div>· One brand can be sold under multiple companies (separate commission tracks)</div>
              <div>· Same brand under different companies = independent settlement records</div>
              <div>· Commission % can differ per company–brand pair</div>
            </div>
          </SectionCard>
        </div>
      </div>
      <FooterActions
        left={<button className={c.btnSecondary} onClick={() => setStep("ob-company")}>← Company</button>}
        right={<>
          <button className={c.btnSecondary}>Save Draft</button>
          <button className={c.btnPrimary} onClick={() => setStep("ob-warehouse")}>Save & Next: Warehouse →</button>
        </>} />
    </div>
  );
}

// ─── SCREEN: ONBOARDING — WAREHOUSE ──────────────────────────────────────────
function ScreenOBWarehouse({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="New Brand Onboarding" sub="Ref: OB-2026-049 · Step 3 of 7" />
      <WizardSteps steps={["Company","Brand","Warehouse","KYB","Documents","Commercial","Review"]} current={2} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <SectionCard title="3.1 Warehouse — Mumbai Distribution Hub" action={<button className="text-[10px] text-[#2563EB]">+ Add Warehouse</button>}>
            <div className="grid grid-cols-3 gap-3">
              <F label="Warehouse Name" value="Mumbai Distribution Hub" required />
              <F label="Warehouse Code (internal)" value="WH-MUM-001" mono />
              <F label="State GSTIN" value="27AABCG1234F1ZK" mono required hint="Drives TCS state" />
              <F label="Address Line 1" value="Plot 22, Turbhe MIDC" required />
              <F label="Address Line 2" value="Navi Mumbai" />
              <F label="City" value="Navi Mumbai" required />
              <F label="State" value="Maharashtra" required />
              <F label="PIN" value="400705" />
              <F label="State Code" value="27" mono hint="Auto from GSTIN" />
            </div>
          </SectionCard>
          <SectionCard title="3.2 Fynd Location Mapping">
            <div className="grid grid-cols-2 gap-3">
              <F label="Fynd Company Code (post-sync)" placeholder="Assigned after Fynd Sync" mono />
              <F label="Fynd Location ID (post-sync)" placeholder="Assigned after Fynd Sync" mono />
            </div>
            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded p-2.5 mt-2 text-[10px] text-[#B45309]">
              Fynd IDs are populated automatically after Checker approval triggers the Fynd Sync API. Do not fill manually.
            </div>
          </SectionCard>
          <div className={`${c.card} bg-[#F8FAFC] border-[#E2E8F0] px-4 py-3`}>
            <div className="text-[10px] font-semibold text-[#475569] mb-2 uppercase tracking-wide">All Warehouses — Summary</div>
            <table className="w-full">
              <thead><tr><th className={c.th}>Warehouse</th><th className={c.th}>State</th><th className={c.th}>GSTIN</th><th className={c.th}>Drug Lic</th></tr></thead>
              <tbody>
                <tr><td className={c.td + " font-medium"}>Mumbai Distribution Hub</td><td className={c.td}>MH (27)</td><td className={c.td + " font-mono text-[10px]"}>27AABCG1234F1ZK</td><td className={c.td}><Badge text="MH/DRUG/2024" type="green" /></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-3">
          <SectionCard title="TCS Filing Rule">
            <div className="text-[10px] text-[#475569] space-y-1.5">
              <div className="font-semibold text-[#1E293B]">1% TCS per state GSTIN</div>
              <div>TCS is accrued at <code className="bg-[#F1F5F9] px-1 rounded">bag_invoiced</code> OMS state, keyed to the warehouse state GSTIN.</div>
              <div className="border-t border-[#F1F5F9] pt-1.5 mt-1.5">
                <div>Active: <span className="font-medium">Maharashtra (27)</span></div>
                <div>TCS → GSTR-8 · filed monthly by 11th</div>
                <div>Certificate → Form 27EQ · quarterly</div>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="KYB — Next Step">
            <div className="text-[10px] text-[#475569] space-y-1">
              <div>Clicking "Submit & Trigger KYB" will run 4 automated checks:</div>
              <div className="font-mono bg-[#F8FAFC] rounded p-2 space-y-0.5 mt-1">
                <div>1. PAN — NSDL lookup</div>
                <div>2. GSTIN — GST portal</div>
                <div>3. CIN — MCA21</div>
                <div>4. Bank — Penny drop / IFSC</div>
              </div>
              <div className="mt-1">Documents locked until KYB passes.</div>
            </div>
          </SectionCard>
        </div>
      </div>
      <FooterActions
        left={<button className={c.btnSecondary} onClick={() => setStep("ob-brand")}>← Brand</button>}
        right={<>
          <button className={c.btnSecondary}>Save Draft</button>
          <button className={c.btnPrimary} onClick={() => setStep("kyb-pending")}>Submit & Trigger KYB →</button>
        </>} />
    </div>
  );
}

// ─── SCREEN: KYB PENDING ─────────────────────────────────────────────────────
function ScreenKYBPending({ setStep }: { setStep: (s: Step) => void }) {
  const [done, setDone] = useState<number[]>([]);
  const checks = [
    { n:1, name:"PAN Verification", api:"NSDL API · GET /pan/AABCG1234F", detail:"Name match · Status check" },
    { n:2, name:"GSTIN Validation", api:"GST Portal · GET /gstin/27AABCG1234F1ZK", detail:"Active · Composition check · Returns filed" },
    { n:3, name:"CIN Verification", api:"MCA21 · GET /company/U24239MH2020PTC123456", detail:"Company status · Director match" },
    { n:4, name:"Bank Account Check", api:"IFSC Validator · Penny-drop simulation", detail:"Account holder · IFSC format" },
  ];
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      if (i < checks.length) { setDone(d => [...d, i]); i++; }
      else { clearInterval(t); setTimeout(() => setStep("kyb-passed"), 500); }
    }, 800);
    return () => clearInterval(t);
  }, []);
  const progress = (done.length / checks.length) * 100;
  return (
    <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
      <div className={`${c.card} p-6 w-[520px]`}>
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#F1F5F9]">
          <div className="w-8 h-8 rounded-full border-2 border-[#BFDBFE] bg-[#EFF6FF] flex items-center justify-center">
            <div className="w-4 h-4 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[#0F172A]">KYB Verification in Progress</div>
            <div className="text-[10px] text-[#64748B]">OB-2026-049 · GreenLeaf Ayurveda Pvt Ltd · {done.length}/{checks.length} checks</div>
          </div>
        </div>
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-[#64748B] mb-1"><span>Progress</span><span>{Math.round(progress)}%</span></div>
          <div className="w-full bg-[#E2E8F0] rounded-full h-1.5">
            <div className="bg-[#2563EB] h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="space-y-2">
          {checks.map((check, i) => {
            const isDone = done.includes(i);
            const isActive = done.length === i;
            return (
              <div key={check.n} className={`border rounded p-3 transition-all ${isDone ? "border-[#BBF7D0] bg-[#F0FDF4]" : isActive ? "border-[#BFDBFE] bg-[#EFF6FF]" : "border-[#E2E8F0] bg-white opacity-50"}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isDone ? "bg-[#16A34A] text-white" : isActive ? "bg-[#2563EB] text-white" : "bg-[#E2E8F0] text-[#94A3B8]"}`}>
                    {isDone ? "✓" : check.n}
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-semibold text-[#1E293B]">{check.name}</div>
                    <div className="text-[10px] font-mono text-[#64748B]">{check.api}</div>
                    {isDone && <div className="text-[10px] text-[#16A34A] mt-0.5">✓ {check.detail}</div>}
                  </div>
                  {isDone && <Badge text="PASS" type="green" />}
                  {isActive && <Badge text="Running" type="blue" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: KYB PASSED ──────────────────────────────────────────────────────
function ScreenKYBPassed({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
      <div className={`${c.card} p-6 w-[560px]`}>
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-[#F1F5F9]">
          <div className="w-8 h-8 rounded-full bg-[#DCFCE7] flex items-center justify-center text-[#16A34A] font-bold text-[14px]">✓</div>
          <div>
            <div className="text-[13px] font-semibold text-[#0F172A]">KYB Verification — PASSED</div>
            <div className="text-[10px] text-[#64748B]">OB-2026-049 · Verified at 14 May 2026 · 10:59 AM · 4/4 checks</div>
          </div>
          <div className="ml-auto"><Badge text="KYB_PASSED" type="green" /></div>
        </div>
        <table className="w-full mb-4">
          <thead><tr><th className={c.th}>Check</th><th className={c.th}>Reference</th><th className={c.th}>Result</th><th className={c.th}>Detail</th></tr></thead>
          <tbody>
            {[
              ["PAN","AABCG1234F","PASS","Name: GreenLeaf Ayurveda · Active"],
              ["GSTIN","27AABCG1234F1ZK","PASS","Status: Active · Returns: Current"],
              ["CIN","U24239MH2020PTC123456","PASS","Company Status: Active · MCA21"],
              ["Bank IFSC","HDFC0001234","PASS","HDFC Bank · Mumbai · Valid account"],
            ].map(r => (
              <tr key={r[0]}><td className={c.td + " font-semibold"}>{r[0]}</td><td className={c.td + " font-mono text-[10px]"}>{r[1]}</td><td className={c.td}><Badge text={r[2]} type="green" /></td><td className={c.td + " text-[#475569]"}>{r[3]}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-3 text-[10px] text-[#475569] mb-4 font-mono">
          Status transition: KYB_PENDING → KYB_PASSED · Document upload now unlocked
        </div>
        <div className="flex justify-end gap-2">
          <button className={c.btnSecondary} onClick={() => setStep("ob-warehouse")}>← Warehouse</button>
          <button className={c.btnPrimary} onClick={() => setStep("ob-docs")}>Upload Documents →</button>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: DOCUMENTS ───────────────────────────────────────────────────────
function ScreenOBDocs({ setStep }: { setStep: (s: Step) => void }) {
  const docs = [
    { name:"PAN Copy", code:"PAN", file:"PAN_GreenLeaf_2024.pdf", size:"284 KB", uploaded:true, verified:true },
    { name:"GST Registration Certificate", code:"GST", file:"GST_Cert_27AABCG.pdf", size:"1.1 MB", uploaded:true, verified:true },
    { name:"CIN / MCA Certificate", code:"CIN", file:"CIN_Cert_2020.pdf", size:"432 KB", uploaded:true, verified:true },
    { name:"Cancelled Cheque / Bank Statement", code:"BANK", file:"Cheque_HDFC4521.pdf", size:"560 KB", uploaded:true, verified:false },
    { name:"Signed Brand Agreement", code:"AGMT", file:"", size:"", uploaded:false, verified:false },
    { name:"Digital Signature Certificate (DSC)", code:"DSC", file:"", size:"", uploaded:false, verified:false },
  ];
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="New Brand Onboarding" sub="Ref: OB-2026-049 · Step 5 of 7 · KYB Status: PASSED" />
      <WizardSteps steps={["Company","Brand","Warehouse","KYB","Documents","Commercial","Review"]} current={4} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <SectionCard title="Mandatory Documents (6 required)">
            <table className="w-full">
              <thead><tr>
                <th className={c.th}>Document</th><th className={c.th}>Code</th><th className={c.th}>Filename</th><th className={c.th}>Size</th><th className={c.th}>Status</th><th className={c.th}>Action</th>
              </tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.code}>
                    <td className={c.td + " font-medium"}>{d.name}</td>
                    <td className={c.td + " font-mono text-[#64748B]"}>{d.code}</td>
                    <td className={c.td + " text-[10px] text-[#475569]"}>{d.file || <span className="text-[#94A3B8] italic">Not uploaded</span>}</td>
                    <td className={c.td + " text-[#94A3B8]"}>{d.size || "—"}</td>
                    <td className={c.td}>{d.uploaded ? d.verified ? <Badge text="Verified" type="green" /> : <Badge text="Uploaded" type="blue" /> : <Badge text="Pending" type="amber" />}</td>
                    <td className={c.td}>{d.uploaded ? <button className="text-[10px] text-[#2563EB]">View ↗</button> : <button className="text-[10px] text-[#2563EB] font-semibold">Upload ↑</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
          <SectionCard title="Upload Area">
            <div className="border-2 border-dashed border-[#CBD5E1] rounded p-6 text-center hover:border-[#2563EB] cursor-pointer">
              <div className="text-[#94A3B8] text-[11px]">Drag & drop files here, or click to browse</div>
              <div className="text-[10px] text-[#CBD5E1] mt-1">PDF, JPG, PNG · Max 5 MB per file</div>
            </div>
            <div className="bg-[#FEF9C3] border border-[#FDE68A] rounded p-2.5 mt-3 text-[10px] text-[#B45309]">
              ⚠ 2 documents pending: <strong>Signed Agreement</strong> and <strong>DSC</strong>. All 6 must be uploaded before submission to Checker.
            </div>
          </SectionCard>
        </div>
        <div className="space-y-3">
          <SectionCard title="Upload Progress">
            <div className="flex justify-between text-[10px] text-[#64748B] mb-1"><span>4 of 6 uploaded</span><span>67%</span></div>
            <div className="w-full bg-[#E2E8F0] rounded-full h-1.5 mb-3"><div className="bg-[#2563EB] h-1.5 rounded-full" style={{ width:"67%" }} /></div>
            {docs.map(d => (
              <div key={d.code} className="flex items-center gap-2 py-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${d.verified?"bg-[#16A34A]":d.uploaded?"bg-[#2563EB]":"bg-[#E2E8F0]"}`} />
                <span className={`text-[10px] ${d.uploaded?"text-[#1E293B]":"text-[#94A3B8]"}`}>{d.name}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Document Rules">
            <ul className="text-[10px] text-[#475569] space-y-1">
              <li>· All docs must be valid and unexpired</li>
              <li>· Bank doc must show full account number</li>
              <li>· Agreement must be on company letterhead</li>
              <li>· DSC must be Class 3 or higher</li>
              <li>· Files stored encrypted in object storage</li>
            </ul>
          </SectionCard>
        </div>
      </div>
      <FooterActions
        left={<button className={c.btnSecondary} onClick={() => setStep("kyb-passed")}>← KYB Result</button>}
        right={<>
          <button className={c.btnSecondary}>Save Progress</button>
          <button className={c.btnPrimary} onClick={() => setStep("ob-commercial")}>Next: Commercial Terms →</button>
        </>} />
    </div>
  );
}

// ─── SCREEN: COMMERCIAL TERMS ─────────────────────────────────────────────────
function ScreenOBCommercial({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="New Brand Onboarding" sub="Ref: OB-2026-049 · Step 6 of 7" />
      <WizardSteps steps={["Company","Brand","Warehouse","KYB","Documents","Commercial","Review"]} current={5} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <SectionCard title="6.1 Commission Structure">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <SL label="Commission Type" opts={["FLAT_PERCENT","TIERED","CATEGORY_WISE"]} required />
              <div>
                <label className={c.label}>Commission Rate (%)<span className="text-[#DC2626] ml-0.5">*</span></label>
                <div className="relative"><input defaultValue="11.00" className={c.input + " font-mono pr-8"} /><span className="absolute right-2.5 top-1.5 text-[10px] text-[#94A3B8]">%</span></div>
              </div>
              <F label="Effective From" type="date" value="2026-05-15" required hint="Rate locks to order_created_at" />
            </div>
            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded p-2.5 text-[10px] text-[#B45309]">
              <strong>Order-date Rate Lock:</strong> Every bag settles at the commission % effective on its <code className="bg-[#FEF9C3] px-1 rounded">order_created_at</code> date. Rate changes are versioned — historic rates are never overwritten. Editing creates a new Commission Master record.
            </div>
          </SectionCard>
          <SectionCard title="6.2 Return Window Policy">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={c.label}>Return Window (days)<span className="text-[#DC2626] ml-0.5">*</span></label>
                <div className="relative"><input defaultValue="7" className={c.input + " font-mono pr-10"} /><span className="absolute right-2.5 top-1.5 text-[10px] text-[#94A3B8]">days</span></div>
                <div className="text-[10px] text-[#94A3B8] mt-0.5">From bag's <code>delivery_done</code></div>
              </div>
              <SL label="Return Policy Type" opts={["Standard","Extended","No Return","Category-wise"]} />
              <F label="Return Cooldown Override (days)" placeholder="0" hint="Extra days after return window" />
            </div>
          </SectionCard>
          <SectionCard title="6.3 Tax & Compliance Parameters">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={c.label}>TCS Rate</label>
                <div className="flex gap-2">
                  <input defaultValue="1.00" className={c.input + " font-mono w-24"} />
                  <div className="border border-[#E2E8F0] rounded px-2.5 flex items-center text-[10px] text-[#94A3B8] bg-[#F8FAFC]">% · Section 52</div>
                </div>
                <div className="text-[10px] text-[#94A3B8] mt-0.5">Accrues at <code>bag_invoiced</code> per warehouse state GSTIN</div>
              </div>
              <div>
                <label className={c.label}>TDS Rate</label>
                <div className="flex gap-2">
                  <input defaultValue="1.00" className={c.input + " font-mono w-24"} />
                  <div className="border border-[#E2E8F0] rounded px-2.5 flex items-center text-[10px] text-[#94A3B8] bg-[#F8FAFC]">% · S.194-O</div>
                </div>
                <div className="text-[10px] text-[#94A3B8] mt-0.5">Deducted at settlement · per company GSTIN/TAN</div>
              </div>
              <SL label="MDR Pass-through" opts={["Yes — at actuals from PGW report","No — absorbed by Swasthera"]} />
              <F label="GST on Commission" value="18%" hint="SAC 9983 · auto-applied" />
            </div>
          </SectionCard>
        </div>
        <div className="space-y-3">
          <SectionCard title="Deduction Preview (per ₹10,000 ESP)">
            <table className="w-full">
              <tbody>
                {[
                  ["Gross ESP","₹10,000","text-[#1E293B] font-semibold"],
                  ["Commission 11%","−₹1,100","text-[#475569]"],
                  ["GST 18% on Comm","−₹198","text-[#475569]"],
                  ["TCS 1%","−₹100","text-[#B45309]"],
                  ["TDS 1% (194-O)","−₹100","text-[#B45309]"],
                  ["MDR ~0.3%","−₹30","text-[#475569]"],
                  ["Net Payable","≈₹8,472","text-[#16A34A] font-bold"],
                ].map(([k,v,cl]) => (
                  <tr key={k as string} className={k === "Net Payable" ? "border-t border-[#E2E8F0]" : ""}>
                    <td className={c.td + " text-[#64748B] py-1.5"}>{k}</td>
                    <td className={`${c.td} text-right font-mono py-1.5 ${cl}`}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
          <SectionCard title="Commission Versioning">
            <div className="text-[10px] text-[#475569] space-y-1">
              <div className="font-semibold text-[#1E293B] mb-1">Current Rate History</div>
              <div className="font-mono bg-[#F8FAFC] rounded p-2 text-[9px] space-y-0.5">
                <div className="text-[#94A3B8]">No prior rates — new brand</div>
              </div>
              <div className="mt-1.5">When rates change: current record is closed (<code>effective_to_date</code> set) and a new record is created. Historic rates never modified.</div>
            </div>
          </SectionCard>
        </div>
      </div>
      <FooterActions
        left={<button className={c.btnSecondary} onClick={() => setStep("ob-docs")}>← Documents</button>}
        right={<>
          <button className={c.btnSecondary}>Save Draft</button>
          <button className={c.btnPrimary} onClick={() => setStep("ob-review")}>Review & Submit →</button>
        </>} />
    </div>
  );
}

// ─── SCREEN: REVIEW & SUBMIT ──────────────────────────────────────────────────
function ScreenOBReview({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="New Brand Onboarding — Review" sub="Ref: OB-2026-049 · Final check before submission to Checker" />
      <WizardSteps steps={["Company","Brand","Warehouse","KYB","Documents","Commercial","Review"]} current={6} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-3">
          {[
            { title:"Company", status:"green", rows:[["Legal Name","GreenLeaf Ayurveda Pvt Ltd"],["Type","Private Ltd"],["PAN","AABCG1234F"],["Master GSTIN","27AABCG1234F1ZK"],["TAN","MUMC12345A"],["Bank","HDFC Bank · A/C ****4521 · IFSC HDFC0001234"],["SPOC","Priya Sharma · priya@greenleaf.in · +91 98765 43210"]] },
            { title:"Brand", status:"green", rows:[["Brand Name","GreenLeaf Herbs"],["Category","Ayurveda · Wellness"],["Type","MANUFACTURER"],["GSTINs","27AABCG1234F1ZK (MH), 29AABCG1234F1ZP (KA)"],["Drug License","MH/DRUG/2024/00841 · Valid till Mar 2027"]] },
            { title:"Warehouse", status:"green", rows:[["Warehouse","Mumbai Distribution Hub · WH-MUM-001"],["State GSTIN","27AABCG1234F1ZK · Maharashtra (27)"],["Address","Plot 22, Turbhe MIDC, Navi Mumbai 400705"],["TCS State","Maharashtra (27) · 1% on taxable supply"]] },
            { title:"Commercial Terms", status:"green", rows:[["Commission","11.00% Flat · Effective 15 May 2026"],["Return Window","7 days from delivery_done"],["TCS","1% · accrues at bag_invoiced"],["TDS","1% · Section 194-O · at settlement"],["GST on Commission","18% · SAC 9983"],["MDR","Pass-through at actuals"]] },
          ].map(s => (
            <SectionCard key={s.title} title={s.title} action={<Badge text="✓ Complete" type="green" />}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {s.rows.map(([k,v]) => (
                  <div key={k as string} className="flex items-start gap-2 py-1 border-b border-[#F8FAFC]">
                    <span className="text-[10px] text-[#94A3B8] w-28 shrink-0">{k}</span>
                    <span className="text-[10px] font-medium text-[#1E293B]">{v}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
          <SectionCard title="Documents" action={<Badge text="6 / 6 Uploaded" type="green" />}>
            <div className="flex flex-wrap gap-2">
              {["PAN Copy","GST Certificate","CIN Certificate","Cancelled Cheque","Signed Agreement","DSC"].map(d => (
                <div key={d} className="flex items-center gap-1.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded px-2.5 py-1 text-[10px] text-[#15803D]">
                  <span>✓</span>{d}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
        <div className="space-y-3">
          <SectionCard title="Readiness Checklist">
            {[
              "KYB: PASSED (4/4 checks)",
              "All 6 documents uploaded",
              "Bank account verified",
              "Commercial terms configured",
              "Return window set (7 days)",
              "TCS/TDS parameters confirmed",
            ].map(item => (
              <div key={item} className="flex items-center gap-2 py-1.5 border-b border-[#F8FAFC] last:border-0">
                <span className="text-[#16A34A] text-[10px]">✓</span>
                <span className="text-[10px] text-[#1E293B]">{item}</span>
              </div>
            ))}
          </SectionCard>
          <div className={`${c.card} p-4`}>
            <div className="text-[10px] font-semibold text-[#B45309] mb-2 uppercase tracking-wide">Maker Declaration</div>
            <div className="text-[10px] text-[#475569] mb-3 leading-relaxed">I confirm all information provided is accurate and complete. I acknowledge that this submission will be reviewed by the Finance Supervisor (Checker). Maker cannot approve their own submission.</div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-[#2563EB]" />
              <span className="text-[10px] font-medium text-[#1E293B]">I confirm the above declaration</span>
            </label>
          </div>
          <button className={`${c.btnSuccess} w-full py-2.5 text-[13px]`} onClick={() => setStep("ob-submitted")}>
            Submit to Checker →
          </button>
          <div className="text-[10px] text-[#94A3B8] text-center">Status: DRAFT → SUBMITTED_FOR_REVIEW</div>
        </div>
      </div>
      <FooterActions
        left={<button className={c.btnSecondary} onClick={() => setStep("ob-commercial")}>← Commercial Terms</button>}
        right={<></>} />
    </div>
  );
}

// ─── SCREEN: SUBMITTED ───────────────────────────────────────────────────────
function ScreenOBSubmitted({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
      <div className={`${c.card} p-6 w-[520px]`}>
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-[#F1F5F9]">
          <div className="w-8 h-8 rounded-full bg-[#DBEAFE] flex items-center justify-center text-[#2563EB] text-[14px]">✉</div>
          <div>
            <div className="text-[13px] font-semibold text-[#0F172A]">Submitted for Checker Review</div>
            <div className="text-[10px] text-[#64748B]">OB-2026-049 · 14 May 2026 · 11:24 AM</div>
          </div>
          <div className="ml-auto"><Badge text="SUBMITTED" type="blue" /></div>
        </div>
        <table className="w-full mb-4">
          <tbody>
            {[
              ["Reference","OB-2026-049"],["Submitted By","Anjali Patel · Finance · Maker"],["Submitted At","14 May 2026 · 11:24 AM IST"],["Assigned Checker","Rahul Kumar · Finance Supervisor"],["Expected TAT","2 business days"],["Notifications","Email + in-app to Checker"],
            ].map(([k,v]) => (
              <tr key={k as string}><td className={c.td + " text-[#64748B] w-36"}>{k}</td><td className={c.td + " font-medium"}>{v}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded p-2.5 text-[10px] text-[#15803D] mb-4">
          On Checker approval: Status → ACTIVE · Fynd Sync triggers automatically · Brand goes live for order capture
        </div>
        <div className="flex justify-end gap-2">
          <button className={c.btnSecondary} onClick={() => setStep("dashboard")}>Dashboard</button>
          <button className={c.btnPrimary} onClick={() => setStep("checker-queue")}>View Approval Queue →</button>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: CHECKER QUEUE ───────────────────────────────────────────────────
function ScreenCheckerQueue({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="Approval Queue" sub="Finance Supervisor · Checker role" right={<>
        <button className={c.btnSecondary}>Export ↓</button>
        <button className={c.btnSecondary}>← Dashboard</button>
      </>} />
      <div className="grid grid-cols-4 gap-3 mb-4">
        <KPI label="Pending Review" value="2" color="text-[#B45309]" />
        <KPI label="Approved (30d)" value="14" color="text-[#16A34A]" />
        <KPI label="Rejected (30d)" value="1" color="text-[#DC2626]" />
        <KPI label="Avg TAT" value="1.4 days" sub="vs SLA: 2 days" color="text-[#2563EB]" />
      </div>
      <SectionCard title="Pending Onboarding Submissions" action={
        <div className="flex gap-2">
          <SearchInput placeholder="Search company, ref…" />
          <select className="border border-[#E2E8F0] rounded px-2 py-1 text-[11px] text-[#475569] bg-white"><option>All types</option><option>Onboarding</option><option>Rate Change</option></select>
        </div>
      }>
        <table className="w-full">
          <thead><tr>
            {["Ref","Company","Brand","Type","Submitted By","Submitted At","KYB","Docs","Urgency","Action"].map(h => <th key={h} className={c.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[
              { ref:"OB-2026-049", co:"GreenLeaf Ayurveda Pvt Ltd", brand:"GreenLeaf Herbs", type:"New Onboarding", by:"Anjali Patel", at:"14 May · 11:24", kyb:"PASSED", docs:"6/6", urg:"Normal" },
              { ref:"OB-2026-047", co:"HealthFirst Distributors LLP", brand:"HealthFirst OTC", type:"New Onboarding", by:"Vikram Shah", at:"11 May · 09:30", kyb:"PASSED", docs:"5/6", urg:"Overdue" },
            ].map((r, i) => (
              <tr key={r.ref} className={`hover:bg-[#F8FAFC] cursor-pointer ${i===0?"ring-1 ring-[#BFDBFE] bg-[#F8FAFC]":""}`}
                onClick={() => setStep("checker-detail")}>
                <td className={c.td + " font-mono font-medium text-[#2563EB]"}>{r.ref}</td>
                <td className={c.td + " font-medium"}>{r.co}</td>
                <td className={c.td}>{r.brand}</td>
                <td className={c.td}><Badge text={r.type} type="gray" /></td>
                <td className={c.td + " text-[#64748B]"}>{r.by}</td>
                <td className={c.td + " text-[#64748B]"}>{r.at}</td>
                <td className={c.td}><Badge text={r.kyb} type="green" /></td>
                <td className={c.td}><Badge text={r.docs} type={r.docs==="6/6"?"green":"amber"} /></td>
                <td className={c.td}><Badge text={r.urg} type={r.urg==="Overdue"?"red":"gray"} /></td>
                <td className={c.td}><button className={c.btnPrimary} onClick={(e) => {e.stopPropagation(); setStep("checker-detail");}}>Review</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Recently Processed (Last 30 days)" action={<button className="text-[10px] text-[#2563EB]">View all →</button>}>
        <table className="w-full">
          <thead><tr>
            {["Ref","Company","Type","Outcome","By","Completed At","Notes"].map(h => <th key={h} className={c.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[
              { ref:"OB-2026-048", co:"MedTech Devices Ltd", type:"New Onboarding", out:"Approved", by:"Rahul Kumar", at:"14 May · 16:42", note:"All checks clear" },
              { ref:"OB-2026-046", co:"CureWell Pharma", type:"Rate Change", out:"Approved", by:"Rahul Kumar", at:"10 May · 14:10", note:"Rate 9% → 10.5%" },
              { ref:"OB-2026-044", co:"VitaMax Labs LLP", type:"New Onboarding", out:"Rejected", by:"Rahul Kumar", at:"8 May · 11:00", note:"GSTIN mismatch, re-submit" },
            ].map(r => (
              <tr key={r.ref}><td className={c.td + " font-mono text-[#475569]"}>{r.ref}</td><td className={c.td}>{r.co}</td><td className={c.td}><Badge text={r.type} type="gray" /></td><td className={c.td}><Badge text={r.out} type={r.out==="Approved"?"green":"red"} /></td><td className={c.td}>{r.by}</td><td className={c.td + " text-[#94A3B8]"}>{r.at}</td><td className={c.td + " text-[#475569]"}>{r.note}</td></tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

// ─── SCREEN: CHECKER DETAIL ───────────────────────────────────────────────────
function ScreenCheckerDetail({ setStep }: { setStep: (s: Step) => void }) {
  const [reject, setReject] = useState(false);
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="Review Submission — OB-2026-049" sub="GreenLeaf Ayurveda Pvt Ltd · Submitted 14 May 2026 · 11:24 AM · Maker: Anjali Patel"
        right={<>
          <Badge text="SUBMITTED_FOR_REVIEW" type="blue" />
          <button className={c.btnSecondary} onClick={() => setStep("checker-queue")}>← Queue</button>
        </>} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-3">
          <SectionCard title="Verification Checklist — Checker Responsibilities">
            <table className="w-full">
              <thead><tr><th className={c.th}>Check</th><th className={c.th}>Expected</th><th className={c.th}>Found</th><th className={c.th}>Result</th></tr></thead>
              <tbody>
                {[
                  ["PAN matches company name","GreenLeaf Ayurveda Pvt Ltd","GreenLeaf Ayurveda Pvt Ltd ✓","PASS"],
                  ["GSTIN active & filing current","Active · returns current","Active · MAY returns filed","PASS"],
                  ["CIN registered company type","Private Ltd","Private Ltd · U24239MH2020PTC","PASS"],
                  ["Bank account holder matches","GreenLeaf Ayurveda Pvt Ltd","GreenLeaf Ayurveda Pvt Ltd ✓","PASS"],
                  ["All 6 docs uploaded & valid","6/6","6/6 · all unexpired","PASS"],
                  ["Commission rate in policy range","7%–15%","11.00% ✓","PASS"],
                  ["Return window configured","Min 3 days","7 days ✓","PASS"],
                  ["TCS/TDS parameters set","Both 1%","TCS 1% · TDS 1% 194-O ✓","PASS"],
                ].map(r => (
                  <tr key={r[0]}>
                    <td className={c.td}>{r[0]}</td>
                    <td className={c.td + " text-[#94A3B8]"}>{r[1]}</td>
                    <td className={c.td + " text-[10px]"}>{r[2]}</td>
                    <td className={c.td}><Badge text={r[3]} type={r[3]==="PASS"?"green":"red"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
          <div className="grid grid-cols-2 gap-4">
            <SectionCard title="Key Parameters">
              {[["Company","GreenLeaf Ayurveda Pvt Ltd"],["Brand","GreenLeaf Herbs"],["Warehouse","Mumbai Hub · MH (27)"],["Commission","11% Flat · eff. 15 May 2026"],["Return Window","7 days"],["TCS","1% · MH (27) · bag_invoiced"],["TDS","1% · 194-O · company level"],["Bank","HDFC ····4521 · HDFC0001234"]].map(([k,v]) => (
                <div key={k as string} className="flex justify-between text-[10px] py-1 border-b border-[#F8FAFC] last:border-0">
                  <span className="text-[#94A3B8]">{k}</span>
                  <span className="font-medium text-[#1E293B]">{v}</span>
                </div>
              ))}
            </SectionCard>
            <SectionCard title="Documents">
              {["PAN Copy","GST Certificate","CIN Certificate","Cancelled Cheque","Signed Agreement","DSC"].map(d => (
                <div key={d} className="flex items-center justify-between py-1 border-b border-[#F8FAFC] last:border-0">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#1E293B]">
                    <span className="text-[#16A34A] text-[10px]">✓</span>{d}
                  </div>
                  <button className="text-[10px] text-[#2563EB]">View</button>
                </div>
              ))}
            </SectionCard>
          </div>
        </div>
        <div className="space-y-3">
          <SectionCard title="Checker Decision">
            <div className="text-[10px] text-[#475569] mb-3">All 8 checks passed. Safe to approve. On approval, Fynd Sync will trigger automatically.</div>
            <div className="mb-3">
              <label className={c.label}>Checker Notes (optional)</label>
              <textarea className="w-full border border-[#E2E8F0] rounded px-2.5 py-1.5 text-[11px] text-[#1E293B] bg-white focus:outline-none focus:border-[#2563EB] h-16 resize-none" placeholder="Add any conditions, comments, or follow-up actions…" />
            </div>
            <div className="space-y-2">
              <button className={`${c.btnSuccess} w-full py-2.5 text-[13px]`} onClick={() => setStep("fynd-syncing")}>
                ✓ Approve — Activate Brand
              </button>
              <button className={`${c.btnDanger} w-full py-2`} onClick={() => setReject(!reject)}>
                ✗ Reject — Return to Maker
              </button>
            </div>
            {reject && (
              <div className="mt-3 bg-[#FEF2F2] border border-[#FECACA] rounded p-3">
                <div className="text-[10px] font-semibold text-[#DC2626] mb-1">Rejection Flow</div>
                <div className="text-[10px] text-[#DC2626] mb-2">Status: SUBMITTED → REJECTED → DRAFT (Maker can re-edit and resubmit)</div>
                <div className="mb-2">
                  <label className={c.label + " text-[#DC2626]"}>Rejection Reason (required)</label>
                  <select className="w-full border border-[#FECACA] rounded px-2 py-1.5 text-[11px] bg-white text-[#1E293B] focus:outline-none">
                    <option>GSTIN mismatch</option><option>Document quality</option><option>Commission out of range</option><option>Bank details mismatch</option><option>Other</option>
                  </select>
                </div>
                <button className={c.btnDanger + " w-full"} onClick={() => setStep("checker-queue")}>Confirm Rejection</button>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Approval Impact">
            <div className="text-[10px] text-[#475569] space-y-1.5">
              <div className="flex items-start gap-1.5"><span className="text-[#16A34A] shrink-0">→</span>Status: ACTIVE</div>
              <div className="flex items-start gap-1.5"><span className="text-[#16A34A] shrink-0">→</span>Fynd Sync: auto-triggered</div>
              <div className="flex items-start gap-1.5"><span className="text-[#16A34A] shrink-0">→</span>Commission Master created</div>
              <div className="flex items-start gap-1.5"><span className="text-[#16A34A] shrink-0">→</span>TCS/TDS parameters locked</div>
              <div className="flex items-start gap-1.5"><span className="text-[#16A34A] shrink-0">→</span>Email to brand SPOC</div>
              <div className="flex items-start gap-1.5"><span className="text-[#16A34A] shrink-0">→</span>Audit log: Checker + timestamp</div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: FYND SYNCING ─────────────────────────────────────────────────────
function ScreenFyndSyncing({ setStep }: { setStep: (s: Step) => void }) {
  const [done, setDone] = useState<number[]>([]);
  const ops = [
    { n:1, method:"POST", endpoint:"/v1.0/companies", response:"fynd_company_code: FYN-CO-8801", ms:"142ms" },
    { n:2, method:"POST", endpoint:"/v1.0/brands", response:"fynd_brand_id: FYN-BR-2204", ms:"88ms" },
    { n:3, method:"POST", endpoint:"/v1.0/locations", response:"fynd_location_id: FYN-LOC-5510", ms:"110ms" },
    { n:4, method:"PUT", endpoint:"/v1.0/mapping/persist", response:"mapping saved · state_gstin: 27", ms:"64ms" },
    { n:5, method:"POST", endpoint:"/v1.0/activation/confirm", response:"brand_status: ACTIVE", ms:"78ms" },
  ];
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      if (i < ops.length) { setDone(d => [...d, i]); i++; }
      else { clearInterval(t); setTimeout(() => setStep("fynd-done"), 400); }
    }, 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
      <div className={`${c.card} p-6 w-[580px]`}>
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-[#F1F5F9]">
          <div className="w-7 h-7 rounded border border-[#BFDBFE] bg-[#EFF6FF] flex items-center justify-center">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[#0F172A]">Phase 2 — Fynd Sync in Progress</div>
            <div className="text-[10px] text-[#64748B]">GreenLeaf Ayurveda · Calling Fynd Platform APIs</div>
          </div>
          <div className="ml-auto text-[10px] text-[#64748B] font-mono">{done.length}/{ops.length} calls</div>
        </div>
        <div className="space-y-2">
          {ops.map((op, i) => {
            const isDone = done.includes(i);
            const isActive = done.length === i;
            return (
              <div key={op.n} className={`border rounded p-2.5 transition-all duration-300 ${isDone ? "border-[#BBF7D0] bg-[#F0FDF4]" : isActive ? "border-[#BFDBFE] bg-[#EFF6FF]" : "border-[#E2E8F0] opacity-40"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${op.method==="POST"?"bg-[#DBEAFE] text-[#1D4ED8]":"bg-[#F3E8FF] text-[#7C3AED]"}`}>{op.method}</span>
                    <code className="text-[10px] text-[#1E293B]">{op.endpoint}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDone && <span className="text-[9px] text-[#94A3B8] font-mono">{op.ms}</span>}
                    {isDone ? <Badge text="200 OK" type="green" /> : isActive ? <Badge text="Pending" type="blue" /> : null}
                  </div>
                </div>
                {isDone && <div className="font-mono text-[10px] text-[#16A34A] mt-1.5 pl-1">← {op.response}</div>}
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-t border-[#F1F5F9] pt-3">
          <div className="flex justify-between text-[10px] text-[#64748B] mb-1"><span>Progress</span><span>{Math.round((done.length/ops.length)*100)}%</span></div>
          <div className="w-full bg-[#E2E8F0] rounded-full h-1"><div className="bg-[#2563EB] h-1 rounded-full transition-all duration-500" style={{ width:`${(done.length/ops.length)*100}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: FYND DONE ────────────────────────────────────────────────────────
function ScreenFyndDone({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
      <div className={`${c.card} p-6 w-[540px]`}>
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-[#F1F5F9]">
          <div className="w-7 h-7 rounded-full bg-[#DCFCE7] flex items-center justify-center text-[#16A34A] text-[12px] font-bold">✓</div>
          <div>
            <div className="text-[13px] font-semibold text-[#0F172A]">Fynd Sync Complete — Brand ACTIVE</div>
            <div className="text-[10px] text-[#64748B]">14 May 2026 · 11:46 AM · 5/5 API calls · Total 482ms</div>
          </div>
          <div className="ml-auto"><Badge text="ACTIVE" type="green" /></div>
        </div>
        <table className="w-full mb-4">
          <thead><tr><th className={c.th}>Entity</th><th className={c.th}>Swasthera ID</th><th className={c.th}>Fynd ID</th><th className={c.th}>State</th></tr></thead>
          <tbody>
            {[
              ["Company","CO-GREENLEAF-001","FYN-CO-8801","Synced"],
              ["Brand","BR-GREENLEAF-001","FYN-BR-2204","Synced"],
              ["Location / Warehouse","WH-MUM-001","FYN-LOC-5510","Synced"],
            ].map(r => (
              <tr key={r[0]}><td className={c.td}>{r[0]}</td><td className={c.td + " font-mono text-[10px]"}>{r[1]}</td><td className={c.td + " font-mono text-[10px] text-[#2563EB]"}>{r[2]}</td><td className={c.td}><Badge text={r[3]} type="green" /></td></tr>
            ))}
          </tbody>
        </table>
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-3 text-[10px] text-[#475569] mb-4 space-y-1">
          <div className="font-semibold text-[#1E293B]">What happens now</div>
          <div>· Fynd IDs persisted in <code>fynd_entity_mapping</code> table</div>
          <div>· OMS order capture begins for GreenLeaf Herbs</div>
          <div>· TCS accrues at <code>bag_invoiced</code> event — MH (27)</div>
          <div>· Bags visible in Order Tracking within 15 min</div>
        </div>
        <div className="flex justify-end gap-2">
          <button className={c.btnSecondary} onClick={() => setStep("checker-detail")}>← Checker Detail</button>
          <button className={c.btnPrimary} onClick={() => setStep("orders")}>View Order Tracking →</button>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: ORDER TRACKING ───────────────────────────────────────────────────
function ScreenOrders({ setStep }: { setStep: (s: Step) => void }) {
  const bags = [
    { id:"FY-2840192", oid:"ORD-48291", brand:"GreenLeaf Herbs", sku:"GL-ASHW-500", esp:3200, qty:1, state:"delivery_done", inv:"4 May", del:"8 May", winExp:"15 May", tcs:32, tds:32, elig:"In Window" },
    { id:"FY-2840188", oid:"ORD-48285", brand:"GreenLeaf Herbs", sku:"GL-TRPH-250", esp:1200, qty:2, state:"bag_invoiced", inv:"6 May", del:"—", winExp:"—", tcs:24, tds:0, elig:"Awaiting Delivery" },
    { id:"FY-2840175", oid:"ORD-48271", brand:"GreenLeaf Herbs", sku:"GL-ASHW-500", esp:4800, qty:1, state:"return_window_expired", inv:"2 May", del:"5 May", winExp:"12 May", tcs:48, tds:48, elig:"Eligible ✓" },
    { id:"FY-2840162", oid:"ORD-48259", brand:"GreenLeaf Herbs", sku:"GL-BRHM-100", esp:2100, qty:1, state:"return_initiated", inv:"30 Apr", del:"4 May", winExp:"HOLD", tcs:21, tds:0, elig:"On Hold" },
    { id:"FY-2840150", oid:"ORD-48240", brand:"GreenLeaf Herbs", sku:"GL-TRPH-250", esp:5500, qty:2, state:"return_window_expired", inv:"28 Apr", del:"1 May", winExp:"8 May", tcs:55, tds:55, elig:"Eligible ✓" },
    { id:"FY-2840139", oid:"ORD-48225", brand:"GreenLeaf Herbs", sku:"GL-ASHW-500", esp:3200, qty:1, state:"settled", inv:"25 Apr", del:"28 Apr", winExp:"5 May", tcs:32, tds:32, elig:"Settled" },
  ];
  const stateBadge = (s: string) => {
    const m: Record<string,[string,"green"|"amber"|"red"|"blue"|"gray"|"purple"]> = {
      bag_invoiced:["bag_invoiced","blue"],delivery_done:["delivery_done","amber"],return_window_expired:["return_window_expired","green"],return_initiated:["return_initiated","red"],settled:["settled","purple"]
    };
    const [label, type] = m[s] ?? [s,"gray"];
    return <Badge text={label} type={type} />;
  };
  const eligBadge = (e: string) => {
    if (e.includes("Eligible")) return <Badge text={e} type="green" />;
    if (e === "On Hold") return <Badge text={e} type="red" />;
    if (e === "Settled") return <Badge text={e} type="purple" />;
    if (e.includes("Awaiting")) return <Badge text={e} type="blue" />;
    return <Badge text={e} type="amber" />;
  };
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="Order & Bag Tracking" sub="Phase 3 + 4 · OMS State Monitor · GreenLeaf Herbs"
        right={<>
          <button className={c.btnSecondary} onClick={() => setStep("tcs-tds")}>TCS/TDS Register →</button>
          <button className={c.btnSecondary}>Export CSV ↓</button>
        </>} />
      <div className="grid grid-cols-6 gap-3 mb-4">
        <KPI label="Total Bags" value="6" />
        <KPI label="Eligible" value="2" color="text-[#16A34A]" sub="Return window expired" />
        <KPI label="In Window" value="1" color="text-[#B45309]" sub="7-day window active" />
        <KPI label="On Hold" value="1" color="text-[#DC2626]" sub="Return initiated" />
        <KPI label="TCS Accrued" value="₹212" color="text-[#B45309]" sub="This cycle" />
        <KPI label="TDS Accrued" value="₹167" color="text-[#B45309]" sub="Eligible bags only" />
      </div>
      <SectionCard title="Bag Register — MAY-2026-C1" action={
        <FilterBar>
          <SearchInput placeholder="bag_id, order_id, SKU…" />
          <select className="border border-[#E2E8F0] rounded px-2 py-1 text-[11px] text-[#475569] bg-white"><option>All OMS States</option><option>return_window_expired</option><option>delivery_done</option><option>bag_invoiced</option></select>
          <select className="border border-[#E2E8F0] rounded px-2 py-1 text-[11px] text-[#475569] bg-white"><option>All Eligibility</option><option>Eligible</option><option>On Hold</option></select>
        </FilterBar>
      }>
        <table className="w-full">
          <thead>
            <tr>
              {["bag_id ↕","order_id","SKU","ESP (₹) ↕","Qty","OMS State","Invoice Date","Delivery Date","Window Expiry","TCS (₹)","TDS (₹)","Eligibility"].map(h => <th key={h} className={c.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {bags.map(b => (
              <tr key={b.id} className="hover:bg-[#F8FAFC] cursor-pointer">
                <td className={c.td + " font-mono text-[#2563EB] font-medium text-[10px]"}>{b.id}</td>
                <td className={c.td + " font-mono text-[10px] text-[#64748B]"}>{b.oid}</td>
                <td className={c.td + " font-mono text-[10px]"}>{b.sku}</td>
                <td className={c.td + " font-mono text-right font-semibold"}>{b.esp.toLocaleString()}</td>
                <td className={c.td + " text-center text-[#64748B]"}>{b.qty}</td>
                <td className={c.td}>{stateBadge(b.state)}</td>
                <td className={c.td + " text-[#94A3B8]"}>{b.inv}</td>
                <td className={c.td + " text-[#94A3B8]"}>{b.del}</td>
                <td className={c.td + " text-[#94A3B8]"}>{b.winExp}</td>
                <td className={c.td + " font-mono text-right text-[#B45309]"}>{b.tcs}</td>
                <td className={c.td + " font-mono text-right text-[#B45309]"}>{b.tds || "—"}</td>
                <td className={c.td}>{eligBadge(b.elig)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#F8FAFC]">
              <td colSpan={3} className={c.td + " font-semibold text-[#475569]"}>Totals</td>
              <td className={c.td + " font-mono text-right font-bold"}>20,000</td>
              <td className={c.td + " text-center font-semibold"}>8</td>
              <td colSpan={4} className={c.td} />
              <td className={c.td + " font-mono text-right font-bold text-[#B45309]"}>212</td>
              <td className={c.td + " font-mono text-right font-bold text-[#B45309]"}>167</td>
              <td className={c.td} />
            </tr>
          </tfoot>
        </table>
      </SectionCard>
      <div className={`${c.card} p-3 text-[10px] text-[#475569] flex items-start gap-2`}>
        <span className="text-[#2563EB] shrink-0">ℹ</span>
        <span>Settlement eligibility requires: OMS state = <code className="bg-[#F1F5F9] px-1 rounded">return_window_expired</code> AND no active return on the bag. TCS accrues at <code className="bg-[#F1F5F9] px-1 rounded">bag_invoiced</code>. TDS accrues at settlement computation time. 77 OMS states monitored continuously via Fynd webhooks.</span>
      </div>
      <FooterActions left={<button className={c.btnSecondary} onClick={() => setStep("fynd-done")}>← Fynd Sync</button>}
        right={<button className={c.btnPrimary} onClick={() => setStep("settlement")}>Proceed to Settlement →</button>} />
    </div>
  );
}

// ─── SCREEN: TCS/TDS REGISTER ─────────────────────────────────────────────────
function ScreenTCSTDS({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="TCS / TDS Compliance Register" sub="Section 52 (TCS) · Section 194-O (TDS) · FY 2025-26"
        right={<>
          <select className="border border-[#E2E8F0] rounded px-2 py-1.5 text-[11px] text-[#475569] bg-white">
            <option>May 2026</option><option>April 2026</option><option>March 2026</option>
          </select>
          <button className={c.btnSecondary}>Export ↓</button>
          <button className={c.btnSecondary}>GSTR-8 Preview</button>
        </>} />

      <div className="grid grid-cols-4 gap-3 mb-4">
        <KPI label="TCS Accrued (May)" value="₹2,84,604" sub="Cycle MAY-2026-C1" color="text-[#B45309]" />
        <KPI label="TCS Paid (May)" value="₹2,18,450" sub="Paid 7 May 2026" color="text-[#16A34A]" />
        <KPI label="TDS Deducted (May)" value="₹2,41,356" sub="Settled brands" color="text-[#B45309]" />
        <KPI label="GSTR-8 Status" value="Pending" sub="Due: 11 Jun 2026" color="text-[#DC2626]" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <SectionCard title="TCS Register — By Warehouse State GSTIN" action={<Badge text="Section 52 · e-Commerce" type="blue" />}>
          <table className="w-full">
            <thead><tr>
              <th className={c.th}>State GSTIN</th><th className={c.th}>State</th><th className={c.th}>Brand</th><th className={c.th}>Taxable Supply (₹)</th><th className={c.th}>TCS Rate</th><th className={c.th}>TCS Amount (₹)</th><th className={c.th}>Accrual Status</th><th className={c.th}>Payment Due</th>
            </tr></thead>
            <tbody>
              {[
                { gstin:"27AABCG1234F1ZK", state:"MH", brand:"GreenLeaf Herbs", supply:"28,40,800", rate:"1%", tcs:"28,408", status:"Accrued", due:"7 Jun 2026" },
                { gstin:"29AABCG1234F1ZP", state:"KA", brand:"GreenLeaf Herbs", supply:"18,20,540", rate:"1%", tcs:"18,205", status:"Accrued", due:"7 Jun 2026" },
                { gstin:"27HDFC1234F1ZM", state:"MH", brand:"NutriLife Pro", supply:"18,20,540", rate:"1%", tcs:"18,205", status:"Paid", due:"7 May 2026" },
                { gstin:"29NUTRI5678F1ZP", state:"KA", brand:"NutriLife Pro", supply:"8,40,200", rate:"1%", tcs:"8,402", status:"Paid", due:"7 May 2026" },
                { gstin:"27MEDTC9012F1ZK", state:"MH", brand:"MedTech OTC", supply:"26,40,600", rate:"1%", tcs:"26,406", status:"Filed", due:"7 May 2026" },
              ].map(r => (
                <tr key={r.gstin} className="hover:bg-[#F8FAFC]">
                  <td className={c.td + " font-mono text-[10px] text-[#2563EB]"}>{r.gstin}</td>
                  <td className={c.td}>{r.state}</td>
                  <td className={c.td}>{r.brand}</td>
                  <td className={c.td + " font-mono text-right"}>{r.supply}</td>
                  <td className={c.td + " text-center"}>{r.rate}</td>
                  <td className={c.td + " font-mono text-right font-semibold text-[#B45309]"}>{r.tcs}</td>
                  <td className={c.td}><Badge text={r.status} type={r.status==="Paid"||r.status==="Filed"?"green":"amber"} /></td>
                  <td className={c.td + " text-[#94A3B8]"}>{r.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title="TDS Register — By Company TAN" action={<Badge text="Section 194-O · e-Commerce Operator" type="purple" />}>
          <table className="w-full">
            <thead><tr>
              <th className={c.th}>Company</th><th className={c.th}>TAN</th><th className={c.th}>Gross Payment (₹)</th><th className={c.th}>TDS Rate</th><th className={c.th}>TDS Amount (₹)</th><th className={c.th}>Net Paid (₹)</th><th className={c.th}>Status</th>
            </tr></thead>
            <tbody>
              {[
                { co:"GreenLeaf Ayurveda", tan:"MUMC12345A", gross:"24,71,496", rate:"1%", tds:"24,714", net:"24,46,782", st:"Pending" },
                { co:"NutriLife Sciences", tan:"MUMC98765B", gross:"15,83,871", rate:"1%", tds:"15,838", net:"15,68,033", st:"Deposited" },
                { co:"MedTech Devices", tan:"BLRC44123C", gross:"22,97,322", rate:"1%", tds:"22,973", net:"22,74,349", st:"Deposited" },
              ].map(r => (
                <tr key={r.co} className="hover:bg-[#F8FAFC]">
                  <td className={c.td + " font-medium"}>{r.co}</td>
                  <td className={c.td + " font-mono text-[10px]"}>{r.tan}</td>
                  <td className={c.td + " font-mono text-right"}>{r.gross}</td>
                  <td className={c.td + " text-center"}>{r.rate}</td>
                  <td className={c.td + " font-mono text-right font-semibold text-[#B45309]"}>{r.tds}</td>
                  <td className={c.td + " font-mono text-right font-semibold"}>{r.net}</td>
                  <td className={c.td}><Badge text={r.st} type={r.st==="Deposited"?"green":"amber"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SectionCard title="Compliance Calendar — Jun 2026">
          <table className="w-full">
            <thead><tr><th className={c.th}>Obligation</th><th className={c.th}>Section</th><th className={c.th}>Due Date</th><th className={c.th}>Status</th></tr></thead>
            <tbody>
              {[
                { obl:"TCS Payment (May)", sec:"52", due:"7 Jun 2026", st:"Upcoming" },
                { obl:"TDS Deposit (May)", sec:"194-O", due:"7 Jun 2026", st:"Upcoming" },
                { obl:"GSTR-8 Filing", sec:"52", due:"11 Jun 2026", st:"Upcoming" },
                { obl:"Form 27EQ (Q1)", sec:"194-O", due:"15 Jul 2026", st:"Future" },
                { obl:"Form 16A Issue", sec:"194-O", due:"30 Jul 2026", st:"Future" },
              ].map(r => (
                <tr key={r.obl}><td className={c.td}>{r.obl}</td><td className={c.td + " font-mono text-[10px] text-[#64748B]"}>{r.sec}</td><td className={c.td + " text-[#94A3B8]"}>{r.due}</td><td className={c.td}><Badge text={r.st} type={r.st==="Upcoming"?"amber":"gray"} /></td></tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title="TCS — Bag-Level Accrual (Sample)">
          <table className="w-full">
            <thead><tr><th className={c.th}>bag_id</th><th className={c.th}>ESP (₹)</th><th className={c.th}>State</th><th className={c.th}>TCS (₹)</th><th className={c.th}>At Event</th></tr></thead>
            <tbody>
              {[
                ["FY-2840192","3,200","MH","32","bag_invoiced"],
                ["FY-2840188","1,200","MH","24","bag_invoiced"],
                ["FY-2840175","4,800","MH","48","bag_invoiced"],
                ["FY-2840162","2,100","MH","21","bag_invoiced"],
                ["FY-2840150","5,500","KA","55","bag_invoiced"],
              ].map(r => (
                <tr key={r[0]}><td className={c.td + " font-mono text-[10px] text-[#2563EB]"}>{r[0]}</td><td className={c.td + " font-mono text-right"}>{r[1]}</td><td className={c.td}>{r[2]}</td><td className={c.td + " font-mono text-right text-[#B45309] font-semibold"}>{r[3]}</td><td className={c.td + " text-[10px] font-mono text-[#94A3B8]"}>{r[4]}</td></tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title="Reconciliation Status">
          {[
            { label:"TCS booked = TCS paid (Apr)", status:"Matched", type:"green" as const },
            { label:"GSTR-8 (Apr) filed & submitted", status:"Filed", type:"green" as const },
            { label:"TDS Form 26Q (Q4 FY25)", status:"Filed", type:"green" as const },
            { label:"TCS booked vs paid (May)", status:"Pending", type:"amber" as const },
            { label:"GSTR-8 (May) preparation", status:"In Progress", type:"amber" as const },
            { label:"Form 27EQ (Q1 FY26)", status:"Future", type:"gray" as const },
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-[#F8FAFC] last:border-0">
              <span className="text-[10px] text-[#475569]">{r.label}</span>
              <Badge text={r.status} type={r.type} />
            </div>
          ))}
        </SectionCard>
      </div>
      <FooterActions left={<button className={c.btnSecondary} onClick={() => setStep("orders")}>← Order Tracking</button>}
        right={<button className={c.btnPrimary} onClick={() => setStep("settlement")}>Settlement Computation →</button>} />
    </div>
  );
}

// ─── SCREEN: SETTLEMENT ───────────────────────────────────────────────────────
function ScreenSettlement({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="Settlement Computation" sub="Cycle MAY-2026-C1 · GreenLeaf Ayurveda Pvt Ltd · GreenLeaf Herbs · 2 eligible bags"
        right={<>
          <button className={c.btnSecondary}>Download SoC ↓</button>
          <button className={c.btnSecondary}>Preview Invoice</button>
        </>} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <SectionCard title="Bag-Level Summary — Eligible Bags">
            <table className="w-full mb-2">
              <thead><tr>
                {["bag_id","SKU","ESP (₹)","Invoice Date","Delivery Date","Commission Rate","Return Window"].map(h => <th key={h} className={c.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[
                  ["FY-2840175","GL-ASHW-500","4,800","2 May 2026","5 May 2026","11% (locked @ order date)","Expired 12 May"],
                  ["FY-2840150","GL-TRPH-250","5,500","28 Apr 2026","1 May 2026","11% (locked @ order date)","Expired 8 May"],
                ].map(r => (
                  <tr key={r[0]}><td className={c.td + " font-mono text-[10px] text-[#2563EB]"}>{r[0]}</td><td className={c.td + " font-mono text-[10px]"}>{r[1]}</td><td className={c.td + " font-mono text-right font-semibold"}>{r[2]}</td><td className={c.td + " text-[#94A3B8]"}>{r[3]}</td><td className={c.td + " text-[#94A3B8]"}>{r[4]}</td><td className={c.td}>{r[5]}</td><td className={c.td}><Badge text="Expired ✓" type="green" /></td></tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          <SectionCard title="Deduction Waterfall — Step-by-Step Computation">
            <table className="w-full">
              <thead><tr>
                <th className={c.th + " w-6"}>#</th>
                <th className={c.th}>Line Item</th>
                <th className={c.th}>Basis</th>
                <th className={c.th + " text-right"}>Amount (₹)</th>
                <th className={c.th + " text-right"}>Running Total (₹)</th>
              </tr></thead>
              <tbody>
                {[
                  { n:"1", item:"Gross Merchandise Value (GMV)", basis:"SUM(ESP) — FY-2840175 (₹4,800) + FY-2840150 (₹5,500)", amt:"10,300", run:"10,300", type:"header" },
                  { n:"2", item:"− Brand-funded Promotions", basis:"Brand discount per Fynd order report · 2 bags", amt:"−200", run:"10,100", type:"deduct" },
                  { n:"", item:"  Marketplace Promotions (informational)", basis:"Borne by Swasthera — not netted from brand", amt:"(150)", run:"—", type:"info" },
                  { n:"3", item:"= Net Payable Before Commission", basis:"Step 1 minus Step 2", amt:"10,100", run:"10,100", type:"subtotal" },
                  { n:"4", item:"− Marketplace Commission (11.00%)", basis:"Rate locked @ order_created_at · Commission Master CM-001", amt:"−1,111", run:"8,989", type:"deduct" },
                  { n:"5", item:"− GST on Commission (18%)", basis:"On ₹1,111 · SAC 9983 · Swasthera GSTIN 27SWAS1234A1ZK", amt:"−200", run:"8,789", type:"deduct" },
                  { n:"6", item:"− TCS (1% on taxable supply)", basis:"Accrued at bag_invoiced · MH (27) · already deposited in accrual a/c", amt:"−103", run:"8,686", type:"tcs" },
                  { n:"7", item:"− TDS u/s 194-O (1% of gross ESP)", basis:"Section 194-O · deducted by Swasthera · Form 26Q filing", amt:"−103", run:"8,583", type:"tds" },
                  { n:"8", item:"− MDR / Payment Gateway Charges", basis:"Pass-through at actuals per PGW report · 0.30% avg", amt:"−31", run:"8,552", type:"deduct" },
                  { n:"9", item:"− Penalty / Recovery (if any)", basis:"Nil this cycle", amt:"0", run:"8,552", type:"deduct" },
                  { n:"10", item:"= Net Amount Payable to Brand", basis:"NEFT/RTGS to HDFC Bank ····4521 · GreenLeaf Ayurveda Pvt Ltd", amt:"8,552", run:"8,552", type:"total" },
                ].map(r => (
                  <tr key={r.n + r.item} className={r.type==="total" ? "bg-[#F0FDF4]" : r.type==="subtotal" ? "bg-[#EFF6FF]" : r.type==="info" ? "opacity-60" : r.type==="tcs" || r.type==="tds" ? "bg-[#FFFBEB]" : ""}>
                    <td className={c.td + " text-[#94A3B8] font-mono text-[10px]"}>{r.n}</td>
                    <td className={c.td + (r.type==="total" ? " font-bold text-[#15803D]" : r.type==="subtotal" ? " font-semibold text-[#1D4ED8]" : r.type==="info" ? " italic text-[#94A3B8]" : r.type==="tcs" || r.type==="tds" ? " text-[#B45309]" : "")}>{r.item}</td>
                    <td className={c.td + " text-[10px] text-[#94A3B8]"}>{r.basis}</td>
                    <td className={c.td + " font-mono text-right font-semibold " + (r.type==="total" ? "text-[#15803D] text-[14px]" : r.type==="subtotal" ? "text-[#1D4ED8]" : r.amt.startsWith("−") ? "text-[#DC2626]" : r.type==="info" ? "text-[#94A3B8]" : "")}>{r.amt}</td>
                    <td className={c.td + " font-mono text-right text-[#475569]"}>{r.run}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </div>
        <div className="space-y-3">
          <SectionCard title="Settlement Summary">
            {[["Gross GMV","₹10,300"],["Total Deductions","− ₹1,748"],["Net Payable","₹8,552"],["Eligible Bags","2"],["Cycle","MAY-2026-C1"],["Computation Date","14 May 2026"]].map(([k,v]) => (
              <div key={k as string} className={`flex justify-between text-[11px] py-1.5 border-b border-[#F8FAFC] last:border-0 ${k === "Net Payable" ? "font-bold text-[#15803D]" : ""}`}>
                <span className="text-[#64748B]">{k}</span><span className={k === "Net Payable" ? "text-[15px]" : "font-medium text-[#1E293B]"}>{v}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="TCS / TDS in this Settlement">
            <div className="space-y-2">
              <div className={`${c.card} bg-[#FFFBEB] border-[#FDE68A] p-3`}>
                <div className="text-[10px] font-semibold text-[#B45309] mb-1">TCS (Section 52)</div>
                <div className="text-[10px] text-[#92400E] space-y-0.5">
                  <div>Accrued: ₹103 (at bag_invoiced)</div>
                  <div>State GSTIN: 27AABCG1234F1ZK · MH</div>
                  <div>Payment: 7 Jun 2026</div>
                  <div>Filing: GSTR-8 · 11 Jun 2026</div>
                </div>
              </div>
              <div className={`${c.card} bg-[#FFF7ED] border-[#FED7AA] p-3`}>
                <div className="text-[10px] font-semibold text-[#C2410C] mb-1">TDS (Section 194-O)</div>
                <div className="text-[10px] text-[#9A3412] space-y-0.5">
                  <div>Deducted: ₹103 (at settlement)</div>
                  <div>TAN: MUMC12345A</div>
                  <div>Deposit: 7 Jun 2026</div>
                  <div>Form 26Q: Quarterly</div>
                  <div>Form 16A: Issued to brand CA</div>
                </div>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Auto-Generated Outputs">
            <div className="space-y-2">
              {[
                { name:"Commission Invoice", sub:"SAC 9983 · Digital signature · IRN", st:"Draft" },
                { name:"Statement of Claim (SoC)", sub:"27 fields per bag · Bag report", st:"Draft" },
                { name:"TDS Certificate (Form 16A)", sub:"On approval · Quarterly", st:"Queued" },
              ].map(d => (
                <div key={d.name} className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] font-medium text-[#1E293B]">{d.name}</div>
                    <div className="text-[9px] text-[#94A3B8]">{d.sub}</div>
                  </div>
                  <Badge text={d.st} type="gray" />
                </div>
              ))}
              <div className="text-[9px] text-[#94A3B8] pt-1 border-t border-[#F8FAFC]">Emailed to brand SPOC on Finance approval</div>
            </div>
          </SectionCard>
          <SectionCard title="Compliance Gate">
            {["TCS accruals reconciled","TDS entries complete","No pending returns on eligible bags","Compliance lock: CLEARED"].map(item => (
              <div key={item} className="flex items-center gap-1.5 py-1 text-[10px] text-[#15803D]">
                <span>✓</span>{item}
              </div>
            ))}
          </SectionCard>
          <button className={`${c.btnSuccess} w-full py-2.5`} onClick={() => setStep("settlement-approve")}>
            Submit for Finance Approval →
          </button>
        </div>
      </div>
      <FooterActions left={<button className={c.btnSecondary} onClick={() => setStep("tcs-tds")}>← TCS/TDS Register</button>}
        right={<></>} />
    </div>
  );
}

// ─── SCREEN: SETTLEMENT APPROVE ───────────────────────────────────────────────
function ScreenSettlementApprove({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
      <div className={`${c.card} p-6 w-[580px]`}>
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-[#F1F5F9]">
          <div className="w-7 h-7 rounded bg-[#DBEAFE] flex items-center justify-center text-[#2563EB] text-[12px]">≡</div>
          <div>
            <div className="text-[13px] font-semibold text-[#0F172A]">Finance Sign-off — Settlement Statement</div>
            <div className="text-[10px] text-[#64748B]">GreenLeaf Ayurveda Pvt Ltd · Cycle MAY-2026-C1 · 2 bags</div>
          </div>
          <div className="ml-auto"><Badge text="AWAITING_APPROVAL" type="amber" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[["Gross GMV","₹10,300"],["Commission (11%)","₹1,111"],["GST on Commission","₹200"],["TCS Deducted (1%)","₹103"],["TDS Deducted (1%)","₹103"],["MDR","₹31"],["Net Payable","₹8,552"],["Bank Account","HDFC ····4521 · HDFC0001234"]].map(([k,v]) => (
            <div key={k as string} className={`bg-[#F8FAFC] border border-[#E2E8F0] rounded p-2.5 ${k==="Net Payable" ? "border-[#BBF7D0] bg-[#F0FDF4]" : ""}`}>
              <div className="text-[9px] text-[#94A3B8] uppercase tracking-wide">{k}</div>
              <div className={`text-[12px] font-bold mt-0.5 ${k==="Net Payable" ? "text-[#15803D] text-[16px]" : "text-[#1E293B]"}`}>{v}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2 mb-4">
          {[
            { check:"Settlement computation verified against Fynd order report", done:true },
            { check:"Commission rate matches Commission Master CM-001 (11% · eff. 15 May)", done:true },
            { check:"TCS (₹103) accrued and reconciled — MH (27)", done:true },
            { check:"TDS (₹103) computed correctly — S.194-O — MUMC12345A", done:true },
            { check:"No unresolved returns on eligible bags", done:true },
            { check:"Bank account on record — last verified at KYB (14 May 2026)", done:true },
          ].map(item => (
            <div key={item.check} className="flex items-center gap-2.5">
              <div className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${item.done ? "bg-[#16A34A] text-white" : "bg-[#E2E8F0] text-[#94A3B8]"}`}>{item.done ? "✓" : ""}</div>
              <span className="text-[10px] text-[#1E293B]">{item.check}</span>
            </div>
          ))}
        </div>
        <div className="mb-4">
          <label className={c.label}>Finance Notes</label>
          <textarea defaultValue="Settlement reviewed and verified. All figures match Fynd bi-monthly report. Approved for NEFT transfer." className="w-full border border-[#E2E8F0] rounded px-2.5 py-1.5 text-[11px] text-[#1E293B] bg-white focus:outline-none h-14 resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button className={c.btnDanger + " py-2.5 text-[12px]"} onClick={() => setStep("settlement")}>✗ Reject — Return for Recalculation</button>
          <button className={c.btnSuccess + " py-2.5 text-[13px]"} onClick={() => setStep("payout")}>✓ Approve — Release Payout</button>
        </div>
        <div className="text-[9px] text-[#94A3B8] text-center mt-2">Approval triggers NEFT/RTGS transfer initiation and auto-emails Commission Invoice + SoC to brand SPOC</div>
      </div>
    </div>
  );
}

// ─── SCREEN: PAYOUT ───────────────────────────────────────────────────────────
function ScreenPayout({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto p-5 bg-[#F8FAFC]">
      <PageHeader title="Payout — Settlement MAY-2026-C1" sub="GreenLeaf Ayurveda Pvt Ltd · Finance approved · 14 May 2026 · 04:10 PM"
        right={<>
          <Badge text="TRANSFER_INITIATED" type="blue" />
          <button className={c.btnSecondary}>Download Payout Report ↓</button>
        </>} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className={`${c.card} border-[#BBF7D0] bg-[#F0FDF4] p-4 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#16A34A] flex items-center justify-center text-white text-[13px] font-bold">✓</div>
              <div>
                <div className="text-[12px] font-semibold text-[#15803D]">Settlement Approved · NEFT Transfer Initiated</div>
                <div className="text-[10px] text-[#16A34A]">GreenLeaf Ayurveda Pvt Ltd · HDFC Bank ····4521 · Ref: SWA-MAY26-C1-GREENLEAF</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#16A34A]">Net Amount</div>
              <div className="text-[22px] font-bold text-[#15803D]">₹8,552</div>
            </div>
          </div>

          <SectionCard title="Bank Transfer Details">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Beneficiary Name","GreenLeaf Ayurveda Pvt Ltd"],["Account Number","····4521 (HDFC Bank)"],["IFSC Code","HDFC0001234"],["Branch","Andheri East, Mumbai"],["Transfer Mode","NEFT"],["Amount","₹8,552"],["Initiated At","14 May 2026 · 04:10 PM IST"],["Expected Credit","14 May 2026 · by 6 PM IST"],["Payment Reference","SWA-MAY26-C1-GREENLEAF"],["Status","Pending Bank ACK"],
              ].map(([k,v]) => (
                <div key={k as string} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded px-3 py-2">
                  <div className="text-[9px] text-[#94A3B8] uppercase tracking-wide">{k}</div>
                  <div className={`text-[11px] font-medium text-[#1E293B] mt-0.5 ${(k as string).includes("IFSC") || (k as string).includes("Account") || (k as string).includes("Reference") ? "font-mono" : ""}`}>{v}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Settlement — Bag Disposition">
            <table className="w-full">
              <thead><tr>
                <th className={c.th}>bag_id</th><th className={c.th}>SKU</th><th className={c.th}>ESP (₹)</th><th className={c.th}>Comm (₹)</th><th className={c.th}>TCS (₹)</th><th className={c.th}>TDS (₹)</th><th className={c.th}>Net (₹)</th><th className={c.th}>Status</th>
              </tr></thead>
              <tbody>
                {[
                  ["FY-2840175","GL-ASHW-500","4,800","528.00","48","48","4,176","Payout Initiated"],
                  ["FY-2840150","GL-TRPH-250","5,500","605.00","55","55","4,785","Payout Initiated"],
                ].map(r => (
                  <tr key={r[0]}><td className={c.td + " font-mono text-[10px] text-[#2563EB]"}>{r[0]}</td><td className={c.td + " font-mono text-[10px]"}>{r[1]}</td><td className={c.td + " font-mono text-right"}>{r[2]}</td><td className={c.td + " font-mono text-right text-[#475569]"}>{r[3]}</td><td className={c.td + " font-mono text-right text-[#B45309]"}>{r[4]}</td><td className={c.td + " font-mono text-right text-[#B45309]"}>{r[5]}</td><td className={c.td + " font-mono text-right font-semibold"}>{r[6]}</td><td className={c.td}><Badge text={r[7]} type="blue" /></td></tr>
                ))}
                <tr className="bg-[#F8FAFC]"><td colSpan={2} className={c.td + " font-bold"}>Total</td><td className={c.td + " font-mono text-right font-bold"}>10,300</td><td className={c.td + " font-mono text-right font-bold"}>1,133</td><td className={c.td + " font-mono text-right font-bold text-[#B45309]"}>103</td><td className={c.td + " font-mono text-right font-bold text-[#B45309]"}>103</td><td className={c.td + " font-mono text-right font-bold"}>8,961</td><td className={c.td} /></tr>
              </tbody>
            </table>
          </SectionCard>

          <SectionCard title="Documents Dispatched">
            <div className="grid grid-cols-3 gap-3">
              {[
                { name:"Commission Invoice", id:"INV-MAY2026-0049", st:"Emailed ✓", to:"priya@greenleaf.in" },
                { name:"Statement of Claim", id:"SOC-MAY2026-0049", st:"Emailed ✓", to:"priya@greenleaf.in" },
                { name:"Payout Confirmation", id:"PAY-MAY2026-0049", st:"Pending UTR", to:"On UTR recording" },
              ].map(d => (
                <div key={d.name} className="border border-[#E2E8F0] rounded p-3">
                  <div className="text-[10px] font-semibold text-[#1E293B]">{d.name}</div>
                  <div className="text-[9px] font-mono text-[#94A3B8] mt-0.5">{d.id}</div>
                  <div className={`text-[9px] mt-1.5 font-semibold ${d.st.includes("Emailed") ? "text-[#16A34A]" : "text-[#B45309]"}`}>{d.st}</div>
                  <div className="text-[9px] text-[#94A3B8]">→ {d.to}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
        <div className="space-y-3">
          <div className={`${c.card} border-[#FDE68A] bg-[#FFFBEB] p-4`}>
            <div className="text-[11px] font-semibold text-[#B45309] mb-2">Record UTR to Complete Settlement</div>
            <div className="text-[10px] text-[#92400E] mb-3 leading-relaxed">Enter the UTR received from the bank after NEFT credit acknowledgement. This locks all bag_ids to SETTLED status permanently.</div>
            <label className={c.label + " text-[#B45309]"}>UTR Number<span className="text-[#DC2626] ml-0.5">*</span></label>
            <input defaultValue="NEFT2405140082" className={c.input + " font-mono mb-3"} />
            <label className={c.label + " text-[#B45309]"}>Bank ACK Date & Time</label>
            <input type="datetime-local" defaultValue="2026-05-14T18:12" className={c.input + " mb-3"} />
            <label className={c.label + " text-[#B45309]"}>Amount Credited (₹)</label>
            <input defaultValue="8552" className={c.input + " font-mono mb-3"} />
            <button className={`${c.btnSuccess} w-full py-2.5 text-[13px]`} onClick={() => setStep("utr-entry")}>
              Record UTR & Mark Settled →
            </button>
            <div className="text-[9px] text-[#94A3B8] mt-2 text-center">Bags FY-2840175, FY-2840150 will be permanently SETTLED</div>
          </div>
          <SectionCard title="Post-Settlement Rules">
            <div className="text-[10px] text-[#475569] space-y-1.5">
              <div>· Once SETTLED, bags cannot be re-included in any cycle</div>
              <div>· Post-settlement returns → credit note raised → netted in next cycle</div>
              <div>· No bank transfer reversal for returns after payout</div>
              <div>· Duplicate payment guard: UTR can only be used once</div>
            </div>
          </SectionCard>
          <SectionCard title="TCS/TDS Post-Payout">
            <div className="text-[10px] text-[#475569] space-y-1.5">
              <div className="font-semibold text-[#1E293B]">TCS (₹103) → due 7 Jun</div>
              <div>GSTR-8 filing: 11 Jun 2026</div>
              <div>Certificate to brand: Form 27EQ Q1</div>
              <div className="border-t border-[#F1F5F9] pt-1.5 font-semibold text-[#1E293B]">TDS (₹103) → deposit 7 Jun</div>
              <div>Form 26Q: Quarterly</div>
              <div>Form 16A to brand CA: 30 Jul 2026</div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: UTR ENTRY / COMPLETE ─────────────────────────────────────────────
function ScreenUTREntry({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
      <div className={`${c.card} p-6 w-[560px]`}>
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-[#F1F5F9]">
          <div className="w-7 h-7 rounded-full bg-[#DCFCE7] flex items-center justify-center text-[#16A34A] font-bold text-[12px]">✓</div>
          <div>
            <div className="text-[13px] font-semibold text-[#0F172A]">Settlement Complete — UTR Recorded</div>
            <div className="text-[10px] text-[#64748B]">MAY-2026-C1 · GreenLeaf Ayurveda Pvt Ltd · 14 May 2026 · 6:14 PM</div>
          </div>
          <div className="ml-auto"><Badge text="SETTLED" type="green" /></div>
        </div>
        <div className="bg-[#0F172A] rounded p-4 mb-4 text-center">
          <div className="text-[10px] text-[#64748B] mb-1">UTR Reference</div>
          <div className="text-[20px] font-mono font-bold text-white">NEFT2405140082</div>
          <div className="text-[11px] text-[#64748B] mt-1">₹8,552 · HDFC Bank · 14 May 2026 · 6:12 PM IST</div>
        </div>
        <table className="w-full mb-4">
          <tbody>
            {[
              ["Cycle","MAY-2026-C1 · 1–15 May 2026"],["Company","GreenLeaf Ayurveda Pvt Ltd"],["Brand","GreenLeaf Herbs"],["Bags Settled","FY-2840175, FY-2840150 (2 bags)"],["Gross GMV","₹10,300"],["Net Transferred","₹8,552"],["UTR","NEFT2405140082"],["Bank","HDFC Bank ····4521"],["Commission Invoice","INV-MAY2026-0049 · emailed"],["Statement of Claim","SOC-MAY2026-0049 · emailed"],["TDS Certificate","Form 16A · Q1 FY26 · Jul 2026"],["TCS Certificate","Form 27EQ · Q1 FY26 · Jul 2026"],["Next Cycle","MAY-2026-C2 · 16–31 May 2026"],
            ].map(([k,v]) => (
              <tr key={k as string}><td className={c.td + " text-[#94A3B8] w-36"}>{k}</td><td className={c.td + " font-medium " + (k==="Net Transferred" ? "text-[#15803D] font-bold" : "")}>{v}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded p-3 text-[10px] text-[#1D4ED8] mb-4">
          Bags permanently locked to SETTLED. Duplicate-payment guard active. Any returns post-settlement will generate a credit note for the next cycle.
        </div>
        <div className="flex gap-2">
          <button className={c.btnSecondary + " flex-1 py-2"} onClick={() => setStep("dashboard")}>← Dashboard</button>
          <button className={c.btnSecondary + " flex-1 py-2"} onClick={() => setStep("tcs-tds")}>TCS/TDS Register</button>
          <button className={c.btnPrimary + " flex-1 py-2"} onClick={() => setStep("ob-company")}>+ New Onboarding</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export function E2EPrototype() {
  const [step, setStep] = useState<Step>("dashboard");

  const screen = () => {
    switch (step) {
      case "dashboard": return <ScreenDashboard setStep={setStep} />;
      case "ob-company": return <ScreenOBCompany setStep={setStep} />;
      case "ob-brand": return <ScreenOBBrand setStep={setStep} />;
      case "ob-warehouse": return <ScreenOBWarehouse setStep={setStep} />;
      case "kyb-pending": return <ScreenKYBPending setStep={setStep} />;
      case "kyb-passed": return <ScreenKYBPassed setStep={setStep} />;
      case "ob-docs": return <ScreenOBDocs setStep={setStep} />;
      case "ob-commercial": return <ScreenOBCommercial setStep={setStep} />;
      case "ob-review": return <ScreenOBReview setStep={setStep} />;
      case "ob-submitted": return <ScreenOBSubmitted setStep={setStep} />;
      case "checker-queue": return <ScreenCheckerQueue setStep={setStep} />;
      case "checker-detail": return <ScreenCheckerDetail setStep={setStep} />;
      case "fynd-syncing": return <ScreenFyndSyncing setStep={setStep} />;
      case "fynd-done": return <ScreenFyndDone setStep={setStep} />;
      case "orders": return <ScreenOrders setStep={setStep} />;
      case "tcs-tds": return <ScreenTCSTDS setStep={setStep} />;
      case "settlement": return <ScreenSettlement setStep={setStep} />;
      case "settlement-approve": return <ScreenSettlementApprove setStep={setStep} />;
      case "payout": return <ScreenPayout setStep={setStep} />;
      case "utr-entry": return <ScreenUTREntry setStep={setStep} />;
      default: return <ScreenDashboard setStep={setStep} />;
    }
  };

  return (
    <div className="h-screen flex font-sans bg-white overflow-hidden text-[#1E293B]" style={{ fontSize: 12 }}>
      <Sidebar step={step} setStep={setStep} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar step={step} setStep={setStep} />
        {screen()}
      </div>
    </div>
  );
}
