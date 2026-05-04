import { useState, useEffect, useCallback } from "react";

type Step =
  | "dashboard"
  | "ob-company" | "ob-brand" | "ob-warehouse"
  | "kyb-pending" | "kyb-passed"
  | "ob-docs" | "ob-commercial" | "ob-review" | "ob-submitted"
  | "checker-queue" | "checker-detail" | "checker-rejected"
  | "fynd-syncing" | "fynd-done"
  | "orders" | "orders-detail"
  | "settlement" | "settlement-approve"
  | "payout" | "utr-entry" | "complete";

const PHASES = [
  { id: 1, label: "Onboarding", steps: ["ob-company","ob-brand","ob-warehouse","kyb-pending","kyb-passed","ob-docs","ob-commercial","ob-review","ob-submitted"] },
  { id: 2, label: "Fynd Sync", steps: ["checker-queue","checker-detail","fynd-syncing","fynd-done"] },
  { id: 3, label: "Order Tracking", steps: ["orders","orders-detail"] },
  { id: 4, label: "Return Window", steps: [] },
  { id: 5, label: "Settlement", steps: ["settlement","settlement-approve"] },
  { id: 6, label: "Payout", steps: ["payout","utr-entry","complete"] },
];

function getPhase(step: Step) {
  for (const p of PHASES) if (p.steps.includes(step)) return p.id;
  return 0;
}
function isPhaseComplete(phaseId: number, step: Step) {
  const idx = PHASES.findIndex(p => p.id === phaseId);
  const cur = PHASES.findIndex(p => p.steps.includes(step));
  return cur > idx;
}

function Sidebar({ step, setStep }: { step: Step; setStep: (s: Step) => void }) {
  const phase = getPhase(step);
  const navItems = [
    { label: "Dashboard", icon: "⊞", s: "dashboard" as Step },
    { label: "Onboarding", icon: "+", s: "ob-company" as Step, phase: 1 },
    { label: "Approval Queue", icon: "✓", s: "checker-queue" as Step, phase: 2, badge: phase <= 1 ? "1" : undefined },
    { label: "Fynd Sync", icon: "⟳", s: "fynd-done" as Step, phase: 2 },
    { label: "Order Tracking", icon: "◎", s: "orders" as Step, phase: 3 },
    { label: "Settlement", icon: "◈", s: "settlement" as Step, phase: 5 },
    { label: "Payout", icon: "↗", s: "payout" as Step, phase: 6 },
    { label: "Compliance", icon: "≡", s: "dashboard" as Step },
  ];
  return (
    <aside className="w-52 border-r border-gray-100 flex flex-col shrink-0 bg-white">
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center"><span className="text-white text-xs font-bold">S</span></div>
          <div><div className="text-sm font-semibold text-gray-900 leading-none">Swasthera</div><div className="text-[10px] text-gray-400 mt-0.5">Settlement Module</div></div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const active = step === item.s || (item.phase !== undefined && getPhase(step) === item.phase && item.s !== "fynd-done");
          const locked = item.phase !== undefined && phase < item.phase && item.s !== "checker-queue";
          return (
            <button key={item.label} onClick={() => !locked && setStep(item.s)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${active ? "bg-emerald-50 text-emerald-700 font-medium" : locked ? "text-gray-300 cursor-not-allowed" : "text-gray-500 hover:bg-gray-50 cursor-pointer"}`}>
              <span className="flex items-center gap-2"><span className="text-xs w-4 text-center opacity-60">{item.icon}</span>{item.label}</span>
              {item.badge && <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span>}
              {item.phase !== undefined && isPhaseComplete(item.phase, step) && <span className="text-emerald-500 text-xs">✓</span>}
            </button>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-semibold text-emerald-700">AP</div>
          <div><div className="text-xs font-medium text-gray-800">Anjali Patel</div><div className="text-[10px] text-gray-400">Finance · Maker</div></div>
        </div>
      </div>
    </aside>
  );
}

function JourneyBar({ step }: { step: Step }) {
  const phase = getPhase(step);
  return (
    <div className="bg-white border-b border-gray-100 px-6 py-2.5 flex items-center gap-0">
      {PHASES.map((p, i) => {
        const done = isPhaseComplete(p.id, step);
        const active = p.id === phase;
        return (
          <div key={p.id} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${done ? "bg-emerald-50 text-emerald-700" : active ? "bg-blue-600 text-white" : "text-gray-400"}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${done ? "bg-emerald-500 text-white" : active ? "bg-white text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                {done ? "✓" : p.id}
              </span>
              {p.label}
            </div>
            {i < 5 && <div className={`w-6 h-px mx-1 ${done ? "bg-emerald-300" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", disabled = false }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean }) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "border border-gray-200 text-gray-600 hover:bg-gray-50",
    danger: "border border-red-200 text-red-600 hover:bg-red-50",
    ghost: "text-gray-400 hover:text-gray-600",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${styles[variant]} ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
      {children}
    </button>
  );
}

function Field({ label, placeholder, value, required, hint, mono }: { label: string; placeholder?: string; value?: string; required?: boolean; hint?: string; mono?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input defaultValue={value} placeholder={placeholder}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 bg-white ${mono ? "font-mono" : ""}`} />
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function StepWizard({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-0 mb-5">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i < step ? "bg-emerald-500 text-white" : i === step ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>
              {i < step ? "✓" : i + 1}
            </div>
            <span className={`text-xs font-medium ${i < step ? "text-emerald-600" : i === step ? "text-blue-600" : "text-gray-400"}`}>{s}</span>
          </div>
          {i < steps.length - 1 && <div className={`w-6 h-px mx-2 ${i < step ? "bg-emerald-300" : "bg-gray-200"}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── SCREENS ────────────────────────────────────────────────────────────────

function ScreenDashboard({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><div className="text-xs text-gray-400 uppercase tracking-wide font-medium">Overview</div><div className="text-xl font-semibold text-gray-900 mt-0.5">Settlement Dashboard</div></div>
        <div className="flex gap-2">
          <div className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-md">Cycle: MAY-2026-C1 · 1–15 May</div>
          <button onClick={() => setStep("ob-company")} className="bg-blue-600 text-white text-xs font-semibold px-4 py-1.5 rounded-md hover:bg-blue-700">+ New Brand Onboarding</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Gross GMV (Cycle)", value: "₹2,84,60,450", sub: "14,820 eligible bags", color: "text-emerald-600" },
          { label: "Net Payable", value: "₹2,41,35,780", sub: "After all deductions", color: "text-blue-600" },
          { label: "Pending Approvals", value: "3", sub: "Finance sign-off needed", color: "text-amber-600" },
          { label: "Active Brands", value: "12", sub: "Fynd-synced & live", color: "text-gray-700" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <div className="text-xs text-gray-400">{k.label}</div>
            <div className={`text-2xl font-bold mt-1.5 ${k.color}`}>{k.value}</div>
            <div className="text-[11px] text-gray-400 mt-1">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-sm font-semibold text-gray-800 mb-4">Active Settlement Cycle — Brand Summary</div>
          <div className="space-y-0">
            {[
              { brand: "HealWell Pharma Pvt Ltd", bags: 2840, net: "₹68,80,800", status: "Pending Approval", sc: "bg-amber-50 text-amber-700" },
              { brand: "NutriLife Sciences LLP", bags: 1820, net: "₹46,10,540", status: "Approved", sc: "bg-emerald-50 text-emerald-700" },
              { brand: "MedTech Devices Ltd", bags: 2640, net: "₹60,24,600", status: "Approved", sc: "bg-emerald-50 text-emerald-700" },
              { brand: "VitaBoost Wellness", bags: 420, net: "₹18,64,350", status: "On Hold", sc: "bg-red-50 text-red-600" },
            ].map(r => (
              <div key={r.brand} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">{r.brand[0]}</div>
                  <div><div className="text-xs font-medium text-gray-800">{r.brand}</div><div className="text-[11px] text-gray-400">{r.bags.toLocaleString()} bags</div></div>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-sm font-semibold text-gray-900">{r.net}</div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.sc}`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-blue-600 rounded-xl p-5 text-white">
            <div className="text-xs text-blue-200 font-medium mb-1">Quick Action</div>
            <div className="text-sm font-semibold mb-1">Onboard a New Brand</div>
            <div className="text-xs text-blue-100 mb-3">Start the 6-phase settlement journey for a new brand partner.</div>
            <button onClick={() => setStep("ob-company")} className="bg-white text-blue-600 text-xs font-bold px-3 py-1.5 rounded-md hover:bg-blue-50 w-full">Start Onboarding →</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-3">Phase Health</div>
            {PHASES.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">{p.id}</div>
                <div className="flex-1 text-xs text-gray-600">{p.label}</div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="text-xs font-semibold text-gray-700 mb-2">Click "Start Onboarding" above or use the sidebar to walk through the complete E2E journey →</div>
        <div className="flex gap-2 flex-wrap">
          {([["ob-company","Onboarding"],["checker-queue","Approval Queue"],["orders","Order Tracking"],["settlement","Settlement"],["payout","Payout"]] as [Step,string][]).map(([s,l]) => (
            <button key={s} onClick={() => setStep(s)} className="text-xs border border-gray-200 text-gray-600 px-3 py-1 rounded-md hover:bg-gray-50">{l} →</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScreenOBCompany({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Phase 1 — Onboarding</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Brand Onboarding Wizard</div>
      <StepWizard step={0} steps={["Company", "Brand", "Warehouse", "KYB", "Documents", "Commercial", "Review"]} />
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="text-sm font-semibold text-gray-800">Step 1 — Company Details</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Legal Name" value="GreenLeaf Ayurveda Pvt Ltd" required />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Type <span className="text-red-400">*</span></label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-blue-400">
                <option>Private Ltd</option><option>LLP</option><option>Proprietorship</option>
              </select>
            </div>
            <Field label="PAN Number" value="AABCG1234F" required mono hint="10-char alphanumeric · KYB will verify" />
            <Field label="CIN Number" value="U24239MH2020PTC123456" hint="Required for Private/Public Ltd" mono />
            <Field label="Master GSTIN" value="27AABCG1234F1ZK" required mono hint="Primary GSTIN for commission invoicing" />
            <Field label="TAN Number" placeholder="MUMC12345A" hint="Required if TDS credited back" mono />
            <Field label="Bank Account Number" value="50200012345678" required mono />
            <Field label="Bank IFSC" value="HDFC0001234" required mono />
            <Field label="Bank Name" value="HDFC Bank" required />
            <Field label="Registered Address" value="Plot 12, Andheri East, Mumbai, 400069" required />
            <Field label="SPOC Name" value="Priya Sharma" required />
            <Field label="SPOC Email" value="priya@greenleaf.in" required />
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-2">
            <span className="text-blue-400 text-sm">ℹ</span>
            <div className="text-xs text-blue-700">KYB verification (PAN · GST · CIN · Bank) will trigger automatically when you proceed. Document upload is locked until KYB passes.</div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Maker–Checker Rule</div>
            <div className="text-xs text-gray-500 leading-relaxed">You are the <strong className="text-gray-700">Maker</strong>. After KYB passes and all documents are uploaded, this record goes to the Finance Supervisor (Checker) for approval. <br /><br />The Maker cannot approve their own submission.</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Progress</div>
            {["Company","Brand","Warehouse","KYB","Documents","Commercial"].map((s, i) => (
              <div key={s} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-600">{s}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${i === 0 ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-400"}`}>{i === 0 ? "Active" : "Pending"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-5">
        <Btn variant="secondary" onClick={() => setStep("dashboard")}>← Dashboard</Btn>
        <div className="flex gap-2">
          <Btn variant="secondary">Save Draft</Btn>
          <Btn onClick={() => setStep("ob-brand")}>Save & Continue — Brand →</Btn>
        </div>
      </div>
    </div>
  );
}

function ScreenOBBrand({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Phase 1 — Onboarding</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Brand Onboarding Wizard</div>
      <StepWizard step={1} steps={["Company", "Brand", "Warehouse", "KYB", "Documents", "Commercial", "Review"]} />
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="text-sm font-semibold text-gray-800">Step 2 — Brand Details</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Brand Name" value="GreenLeaf Herbs" required hint="Display name on platform" />
            <Field label="Brand Legal Name" value="GreenLeaf Ayurveda Pvt Ltd" required />
            <Field label="Brand Category" value="Ayurveda / Wellness" required hint="e.g. Pharma, OTC, Wellness" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Brand Type <span className="text-red-400">*</span></label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-blue-400">
                <option>MANUFACTURER</option><option>RETAILER</option><option>TRADER</option><option>DISTRIBUTOR</option>
              </select>
            </div>
            <div className="col-span-2">
              <Field label="Brand GSTIN(s)" value='["27AABCG1234F1ZK", "29AABCG1234F1ZP"]' required hint="JSON array — one per active state" mono />
            </div>
            <Field label="SPOC Name" value="Priya Sharma" required />
            <Field label="SPOC Email" value="priya@greenleaf.in" required />
            <Field label="SPOC Mobile" value="+91 98765 43210" required />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">TCS Applicable <span className="text-red-400">*</span></label>
              <div className="flex gap-3 mt-1">
                <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer"><input type="radio" defaultChecked className="accent-blue-600" /> Yes</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer"><input type="radio" className="accent-blue-600" /> No</label>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
            <strong>Note:</strong> A brand can be sold by multiple companies (trading entities). Commission is tracked at company + brand level — the same brand may carry different commission % under different companies.
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 self-start space-y-3">
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Company Linked</div>
          <div className="bg-emerald-50 rounded-lg p-3">
            <div className="text-xs font-semibold text-emerald-800">GreenLeaf Ayurveda Pvt Ltd</div>
            <div className="text-[10px] text-emerald-600 mt-0.5">Private Ltd · AABCG1234F</div>
            <div className="text-[10px] text-emerald-600">GSTIN: 27AABCG1234F1ZK</div>
          </div>
          <div className="text-[10px] text-gray-400">Payment settlement always goes to the <strong className="text-gray-600">company bank account</strong>, never to the brand.</div>
        </div>
      </div>
      <div className="flex justify-between mt-5">
        <Btn variant="secondary" onClick={() => setStep("ob-company")}>← Company</Btn>
        <div className="flex gap-2">
          <Btn variant="secondary">Save Draft</Btn>
          <Btn onClick={() => setStep("ob-warehouse")}>Save & Continue — Warehouse →</Btn>
        </div>
      </div>
    </div>
  );
}

function ScreenOBWarehouse({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Phase 1 — Onboarding</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Brand Onboarding Wizard</div>
      <StepWizard step={2} steps={["Company", "Brand", "Warehouse", "KYB", "Documents", "Commercial", "Review"]} />
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800">Step 3 — Warehouse Details</div>
            <button className="text-xs text-blue-600 font-medium">+ Add another warehouse</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Warehouse Name" value="Mumbai Distribution Hub" required />
            <Field label="State GSTIN" value="27AABCG1234F1ZK" required mono hint="Determines TCS filing state" />
            <Field label="Address Line 1" value="Plot 22, Turbhe MIDC" required />
            <Field label="Address Line 2" value="Navi Mumbai" />
            <Field label="City" value="Navi Mumbai" required />
            <Field label="State" value="Maharashtra" required hint="Drives TCS state determination" />
            <Field label="Pincode" value="400705" required />
            <Field label="State Code" value="27" hint="Auto-derived from GSTIN" mono />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-700">Drug License <span className="text-gray-400">(Required for pharma/scheduled)</span></span>
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-4 bg-blue-600 rounded-full relative"><div className="w-3 h-3 bg-white rounded-full absolute top-0.5 right-0.5" /></div>
                <span className="text-xs text-blue-600 font-medium">Enabled</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Drug License Number" value="MH/DRUG/2024/00841" mono />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Upload Drug License</label>
                <div className="border border-dashed border-gray-200 rounded-lg px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:border-blue-300 bg-emerald-50 border-emerald-200">
                  <span className="text-emerald-500 text-sm">✓</span>
                  <span className="text-xs text-emerald-700">drug_license_MH2024.pdf</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <div className="text-xs font-semibold text-amber-800 mb-1">TCS Filing Note</div>
            <div className="text-xs text-amber-700">The warehouse state GSTIN determines the state for TCS filing. TCS is filed in the state from which goods are dispatched. <br /><br /><strong>State: Maharashtra (27)</strong></div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-2">Hierarchy</div>
            <div className="text-xs text-gray-500 space-y-1">
              <div className="flex items-center gap-1.5"><span className="text-emerald-500 font-bold">✓</span> Company — GreenLeaf Ayurveda</div>
              <div className="flex items-center gap-1.5 pl-3"><span className="text-emerald-500 font-bold">✓</span> Brand — GreenLeaf Herbs</div>
              <div className="flex items-center gap-1.5 pl-6"><span className="text-blue-500 font-bold">→</span> Warehouse — Mumbai Hub</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-1">Next: KYB Verification</div>
            <div className="text-xs text-gray-500">Clicking "Submit & Trigger KYB" will call the KYB API using the PAN. Verifies GST, CIN, and Bank details instantly.</div>
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-5">
        <Btn variant="secondary" onClick={() => setStep("ob-brand")}>← Brand</Btn>
        <div className="flex gap-2">
          <Btn variant="secondary">Save Draft</Btn>
          <Btn onClick={() => setStep("kyb-pending")}>Submit & Trigger KYB →</Btn>
        </div>
      </div>
    </div>
  );
}

function ScreenKYBPending({ setStep }: { setStep: (s: Step) => void }) {
  const [progress, setProgress] = useState(0);
  const [checks, setChecks] = useState<string[]>([]);
  const checkList = ["Verifying PAN — AABCG1234F", "Validating GSTIN — 27AABCG1234F1ZK", "Cross-checking CIN — U24239MH2020PTC123456", "Verifying Bank IFSC — HDFC0001234"];

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < checkList.length) {
        setChecks(c => [...c, checkList[i]]);
        setProgress(((i + 1) / checkList.length) * 100);
        i++;
      } else {
        clearInterval(timer);
        setTimeout(() => setStep("kyb-passed"), 600);
      }
    }, 700);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border border-gray-100 p-10 w-96 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-50 border-4 border-blue-200 flex items-center justify-center mx-auto mb-5">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
        </div>
        <div className="text-lg font-semibold text-gray-900 mb-1">KYB Verification in Progress</div>
        <div className="text-sm text-gray-500 mb-6">Calling KYB API · Verifying 4 of 4 checks</div>
        <div className="w-full bg-gray-100 rounded-full h-2 mb-5">
          <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="space-y-2 text-left">
          {checkList.map((c, i) => (
            <div key={c} className={`flex items-center gap-2.5 text-xs transition-all duration-300 ${checks.includes(c) ? "text-gray-700" : "text-gray-300"}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${checks.includes(c) ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-300"}`}>
                {checks.includes(c) ? "✓" : i + 1}
              </span>
              {c}
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-gray-400">Status: KYB_PENDING → verifying…</div>
      </div>
    </div>
  );
}

function ScreenKYBPassed({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border border-emerald-100 p-10 w-[480px] text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
          <span className="text-emerald-600 text-2xl font-bold">✓</span>
        </div>
        <div className="text-lg font-semibold text-gray-900 mb-1">KYB Verification Passed</div>
        <div className="text-sm text-gray-500 mb-6">All 4 checks verified successfully. Document upload is now unlocked.</div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { label: "PAN", val: "AABCG1234F", status: "Verified" },
            { label: "GSTIN", val: "27AABCG1234F1ZK", status: "Active" },
            { label: "CIN", val: "U24239MH2020PTC123456", status: "Verified" },
            { label: "Bank IFSC", val: "HDFC0001234", status: "Valid" },
          ].map(c => (
            <div key={c.label} className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-left">
              <div className="text-[10px] text-emerald-600 font-semibold uppercase">{c.label} · {c.status}</div>
              <div className="text-xs font-mono text-gray-700 mt-0.5">{c.val}</div>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 mb-5">
          <strong>Status updated:</strong> KYB_PASSED · {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        </div>
        <Btn onClick={() => setStep("ob-docs")}>Continue — Upload Documents →</Btn>
      </div>
    </div>
  );
}

function ScreenOBDocs({ setStep }: { setStep: (s: Step) => void }) {
  const docs = [
    { name: "PAN Copy", key: "pan", uploaded: true, file: "PAN_GreenLeaf_2024.pdf" },
    { name: "GST Certificate", key: "gst", uploaded: true, file: "GST_Cert_27AABCG.pdf" },
    { name: "CIN Certificate", key: "cin", uploaded: true, file: "CIN_Cert_2020.pdf" },
    { name: "Cancelled Cheque", key: "cheque", uploaded: true, file: "Cancelled_Cheque_HDFC.pdf" },
    { name: "Signed Agreement", key: "agreement", uploaded: false, file: "" },
    { name: "Digital Signature", key: "sig", uploaded: false, file: "" },
  ];
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Phase 1 — Onboarding</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Brand Onboarding Wizard</div>
      <StepWizard step={4} steps={["Company", "Brand", "Warehouse", "KYB", "Documents", "Commercial", "Review"]} />
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-gray-800">Step 4 — Upload Supporting Documents</div>
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-semibold">KYB Passed ✓</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {docs.map(doc => (
              <div key={doc.key} className={`border rounded-xl p-4 flex items-start gap-3 ${doc.uploaded ? "border-emerald-200 bg-emerald-50" : "border-dashed border-gray-200 hover:border-blue-300 cursor-pointer"}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${doc.uploaded ? "bg-emerald-500" : "bg-gray-100"}`}>
                  <span className={`text-sm ${doc.uploaded ? "text-white" : "text-gray-400"}`}>{doc.uploaded ? "✓" : "↑"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-700">{doc.name}</div>
                  {doc.uploaded
                    ? <div className="text-[10px] text-emerald-700 mt-0.5 truncate">{doc.file}</div>
                    : <div className="text-[10px] text-gray-400 mt-0.5">Click to upload · PDF/JPG</div>
                  }
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 flex gap-2">
            <span>⚠</span>
            <span>2 documents pending: <strong>Signed Agreement</strong> and <strong>Digital Signature</strong>. All 6 must be uploaded before submitting to Checker.</span>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Upload Progress</div>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2"><div className="bg-emerald-500 h-2 rounded-full" style={{ width: "66.67%" }} /></div>
            <div className="text-xs text-gray-500">4 of 6 documents uploaded</div>
            <div className="mt-3 space-y-1.5">
              {docs.map(d => (
                <div key={d.key} className="flex items-center gap-2 text-xs">
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${d.uploaded ? "bg-emerald-400" : "bg-gray-200"}`} />
                  <span className={d.uploaded ? "text-gray-700" : "text-gray-400"}>{d.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-2">Document Requirements</div>
            <div className="text-xs text-gray-500 space-y-1">
              <div>· Max file size: 5MB per document</div>
              <div>· Accepted: PDF, JPG, PNG</div>
              <div>· All docs must be current and valid</div>
              <div>· Signed agreement must carry company letterhead</div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-5">
        <Btn variant="secondary" onClick={() => setStep("kyb-passed")}>← KYB Result</Btn>
        <div className="flex gap-2">
          <Btn variant="secondary">Save Progress</Btn>
          <Btn onClick={() => setStep("ob-commercial")}>Continue — Commercial Terms →</Btn>
        </div>
      </div>
    </div>
  );
}

function ScreenOBCommercial({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Phase 1 — Onboarding</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Brand Onboarding Wizard</div>
      <StepWizard step={5} steps={["Company", "Brand", "Warehouse", "KYB", "Documents", "Commercial", "Review"]} />
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5 space-y-5">
          <div className="text-sm font-semibold text-gray-800">Step 5 — Commercial Terms</div>
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Commission Structure</div>
            <div className="flex gap-3 mb-4">
              {["FLAT_PERCENT", "TIERED"].map(t => (
                <label key={t} className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 cursor-pointer ${t === "FLAT_PERCENT" ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                  <input type="radio" defaultChecked={t === "FLAT_PERCENT"} name="commtype" className="accent-blue-600" />
                  <span className="text-xs font-medium text-gray-700">{t === "FLAT_PERCENT" ? "Flat Percent" : "Tiered"}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Commission Rate <span className="text-red-400">*</span></label>
                <div className="relative"><input defaultValue="11.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 focus:outline-none focus:border-blue-400" /><span className="absolute right-3 top-2 text-sm text-gray-400">%</span></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Effective From <span className="text-red-400">*</span></label>
                <input defaultValue="2026-05-15" type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400" />
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <div className="text-[10px] text-amber-700 font-semibold">Order-date Rate Lock</div>
                <div className="text-[10px] text-amber-600 mt-0.5">Every order settles at the commission rate effective on its <code>order_created_at</code> date. Rate changes are versioned.</div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-5">
            <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Return Window Policy</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Return Window Days <span className="text-red-400">*</span></label>
                <div className="relative"><input defaultValue="7" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 focus:outline-none focus:border-blue-400" /><span className="absolute right-3 top-2 text-sm text-gray-400">days</span></div>
                <div className="text-[10px] text-gray-400 mt-0.5">Timed from bag's <code>delivery_done</code> timestamp</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
                A bag must have <code>delivery_done</code> AND return window expired (with no active return) before it becomes eligible for settlement.
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Notes</div>
            <textarea defaultValue="Standard marketplace terms apply. Commission reviewed annually." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 h-16 resize-none focus:outline-none focus:border-blue-400" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-3">Commission Preview</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Sample ESP</span><span className="font-mono text-gray-800">₹10,000</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Commission (11%)</span><span className="font-mono text-gray-800">₹1,100</span></div>
              <div className="flex justify-between"><span className="text-gray-500">GST on Comm (18%)</span><span className="font-mono text-gray-800">₹198</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TCS (1%)</span><span className="font-mono text-gray-800">₹100</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TDS (1%)</span><span className="font-mono text-gray-800">₹100</span></div>
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold"><span className="text-gray-700">Approx. Net</span><span className="text-emerald-700">≈ ₹8,502</span></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-xs text-gray-500">
            <div className="font-semibold text-gray-700 mb-1">Versioning</div>
            When this rate changes later, a new Commission Master record is created. The current record's <code>effective_to_date</code> is set. Historic rates are never overwritten.
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-5">
        <Btn variant="secondary" onClick={() => setStep("ob-docs")}>← Documents</Btn>
        <div className="flex gap-2">
          <Btn variant="secondary">Save Draft</Btn>
          <Btn onClick={() => setStep("ob-review")}>Review & Submit →</Btn>
        </div>
      </div>
    </div>
  );
}

function ScreenOBReview({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Phase 1 — Onboarding</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Review & Submit to Checker</div>
      <StepWizard step={6} steps={["Company", "Brand", "Warehouse", "KYB", "Documents", "Commercial", "Review"]} />
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          {[
            { title: "Company", items: [["Legal Name","GreenLeaf Ayurveda Pvt Ltd"],["Type","Private Ltd"],["PAN","AABCG1234F"],["Master GSTIN","27AABCG1234F1ZK"],["Bank","HDFC Bank · ****4521 · HDFC0001234"],["SPOC","priya@greenleaf.in"]] },
            { title: "Brand", items: [["Brand Name","GreenLeaf Herbs"],["Category","Ayurveda / Wellness"],["Type","MANUFACTURER"],["GSTINs","27AABCG1234F1ZK, 29AABCG1234F1ZP"],["TCS Applicable","Yes"]] },
            { title: "Warehouse", items: [["Name","Mumbai Distribution Hub"],["State GSTIN","27AABCG1234F1ZK"],["State","Maharashtra (27)"],["Address","Plot 22, Turbhe MIDC, Navi Mumbai 400705"],["Drug License","MH/DRUG/2024/00841"]] },
            { title: "Commercial Terms", items: [["Commission","11.00% Flat"],["Return Window","7 days from delivery_done"],["Effective From","15 May 2026"],["TCS","1% per warehouse state GSTIN"],["TDS","1% Section 194-O"]] },
          ].map(section => (
            <div key={section.title} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-800">{section.title}</div>
                <span className="text-xs text-emerald-600 font-medium">✓ Complete</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {section.items.map(([k,v]) => (
                  <div key={k}><div className="text-[10px] text-gray-400 uppercase">{k}</div><div className="text-xs font-medium text-gray-700">{v}</div></div>
                ))}
              </div>
            </div>
          ))}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-sm font-semibold text-gray-800 mb-3">Documents (6/6)</div>
            <div className="grid grid-cols-3 gap-2">
              {["PAN Copy","GST Certificate","CIN Certificate","Cancelled Cheque","Signed Agreement","Digital Signature"].map(d => (
                <div key={d} className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-1.5">
                  <span className="text-emerald-500 text-xs">✓</span>
                  <span className="text-[10px] text-emerald-700">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="text-xs font-semibold text-emerald-800 mb-2">Ready to Submit</div>
            <div className="space-y-1.5">
              {["KYB: PASSED","All 6 docs uploaded","Commercial terms set","Bank account verified"].map(c => (
                <div key={c} className="flex items-center gap-1.5 text-xs text-emerald-700"><span className="text-emerald-500">✓</span>{c}</div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-4">
            <div className="text-xs font-semibold text-amber-800 mb-1">Maker Declaration</div>
            <div className="text-xs text-amber-700">I confirm all information is accurate. This will be submitted to the Finance Supervisor for Checker review. I cannot approve my own submission.</div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-blue-600" />
              <span className="text-xs text-gray-700">I confirm the above</span>
            </label>
          </div>
          <button onClick={() => setStep("ob-submitted")} className="w-full bg-emerald-600 text-white text-sm font-bold py-3 rounded-xl hover:bg-emerald-700">Submit to Checker →</button>
          <div className="text-[10px] text-gray-400 text-center">Status: DRAFT → SUBMITTED</div>
        </div>
      </div>
      <div className="flex justify-between mt-4">
        <Btn variant="secondary" onClick={() => setStep("ob-commercial")}>← Commercial</Btn>
        <div />
      </div>
    </div>
  );
}

function ScreenOBSubmitted({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border border-gray-100 p-10 w-[520px] text-center">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-5">
          <span className="text-blue-600 text-2xl">⏳</span>
        </div>
        <div className="text-lg font-semibold text-gray-900 mb-1">Submitted for Checker Review</div>
        <div className="text-sm text-gray-500 mb-2">Reference: OB-2026-049</div>
        <div className="text-sm text-gray-500 mb-6">Finance Supervisor (Checker) has been notified.</div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[["Status","SUBMITTED"],["Submitted By","Anjali Patel · Maker"],["Submitted At","14 May 2026 · 11:24 AM"],["Assigned To","Rahul Kumar · Checker"]].map(([k,v]) => (
            <div key={k} className="bg-gray-50 rounded-lg p-3 text-left">
              <div className="text-[10px] text-gray-400 uppercase">{k}</div>
              <div className="text-xs font-medium text-gray-700 mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 mb-5">
          The Checker will review Company, Brand, Warehouse, KYB result, documents, and commercial terms. On approval, the brand goes ACTIVE and Fynd Sync triggers automatically.
        </div>
        <Btn onClick={() => setStep("checker-queue")}>View Checker Queue →</Btn>
      </div>
    </div>
  );
}

function ScreenCheckerQueue({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Checker Role — Finance Supervisor</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Approval Queue</div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[["Pending Review","2","text-amber-600"],["Approved Today","1","text-emerald-600"],["Rejected","0","text-gray-400"]].map(([l,v,c]) => (
          <div key={l as string} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <div className="text-xs text-gray-400">{l}</div>
            <div className={`text-2xl font-bold mt-1 ${c}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-blue-200 ring-1 ring-blue-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center font-bold text-emerald-700">G</div>
              <div>
                <div className="text-sm font-semibold text-gray-900">GreenLeaf Ayurveda Pvt Ltd</div>
                <div className="text-[11px] text-gray-400">Private Ltd · Ref OB-2026-049 · Submitted by Anjali Patel · 14 May 2026</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">KYB PASSED</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">Docs 6/6</span>
              <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-2 py-1 rounded-md font-medium">Awaiting Review</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[["Company","GreenLeaf Ayurveda Pvt Ltd"],["Brand","GreenLeaf Herbs"],["Warehouse","Mumbai Hub · State 27"],["Commission","11% Flat · 7d return window"]].map(([k,v]) => (
              <div key={k as string} className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-400 uppercase">{k}</div>
                <div className="text-xs font-medium text-gray-700 mt-0.5">{v}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setStep("checker-detail")} className="bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700">Review in Detail →</button>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 opacity-70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center font-bold text-blue-700">H</div>
              <div>
                <div className="text-sm font-semibold text-gray-900">HealthFirst Distributors LLP</div>
                <div className="text-[11px] text-gray-400">LLP · Ref OB-2026-047 · Submitted by Vikram Shah · 11 May 2026</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">KYB PASSED</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">Docs 5/6</span>
              <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-2 py-1 rounded-md font-medium">Awaiting Review</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenCheckerDetail({ setStep }: { setStep: (s: Step) => void }) {
  const [rejected, setRejected] = useState(false);
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Checker Review — OB-2026-049</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">GreenLeaf Ayurveda Pvt Ltd</div>
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-sm font-semibold text-gray-800 mb-3">Verification Checklist</div>
            <div className="space-y-2">
              {[
                { label: "KYB passed — PAN, GST, CIN, Bank verified", done: true },
                { label: "Company type is Private Ltd · CIN uploaded", done: true },
                { label: "Master GSTIN matches company address state", done: true },
                { label: "Bank account number and IFSC format valid", done: true },
                { label: "All 6 mandatory documents uploaded", done: true },
                { label: "Commission rate agreed and effective date set", done: true },
                { label: "Return window configured (7 days)", done: true },
                { label: "SPOC email and mobile confirmed", done: true },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${item.done ? "bg-emerald-500" : "bg-gray-200"}`}>
                    <span className="text-white text-[9px] font-bold">✓</span>
                  </div>
                  <span className="text-xs text-gray-700">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-sm font-semibold text-gray-800 mb-3">Documents</div>
            <div className="grid grid-cols-3 gap-2">
              {["PAN Copy","GST Certificate","CIN Certificate","Cancelled Cheque","Signed Agreement","Digital Signature"].map(d => (
                <div key={d} className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2 cursor-pointer hover:bg-emerald-100">
                  <span className="text-emerald-500 text-xs">✓</span>
                  <span className="text-xs text-emerald-800">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="text-xs font-semibold text-emerald-800 mb-2">All Checks Passed</div>
            <div className="text-xs text-emerald-700">KYB verified · All docs uploaded · Commercial terms complete. Safe to approve.</div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Checker Comments <span className="text-gray-400">(optional)</span></label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 h-16 resize-none focus:outline-none focus:border-blue-300" placeholder="Any comments for the Maker…" />
          </div>
          <div className="space-y-2">
            <button onClick={() => setStep("fynd-syncing")} className="w-full bg-emerald-600 text-white text-sm font-bold py-3 rounded-xl hover:bg-emerald-700">✓ Approve — Activate Brand</button>
            <button onClick={() => setRejected(true)} className="w-full border border-red-200 text-red-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-50">✗ Reject — Send back to Maker</button>
          </div>
          {rejected && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700">
              Rejection will route back to Maker with comments. Record status: REJECTED → re-enters DRAFT on Maker correction.
              <button onClick={() => setStep("checker-queue")} className="mt-2 text-red-600 font-semibold underline">← Back to Queue</button>
            </div>
          )}
          <div className="text-[10px] text-gray-400 text-center">Approval triggers Phase 2 — Fynd Sync automatically</div>
        </div>
      </div>
    </div>
  );
}

function ScreenFyndSyncing({ setStep }: { setStep: (s: Step) => void }) {
  const [steps2, setSteps2] = useState<string[]>([]);
  const syncSteps = ["POST /companies → fynd_company_code: FYN-CO-8801", "POST /brands → fynd_brand_id: FYN-BR-2204", "POST /locations → fynd_location_id: FYN-LOC-5510", "UPSERT mapping table → IDs persisted", "State GSTIN noted: 27 (Maharashtra)"];

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      if (i < syncSteps.length) { setSteps2(s => [...s, syncSteps[i]]); i++; }
      else { clearInterval(t); setTimeout(() => setStep("fynd-done"), 500); }
    }, 650);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border border-gray-100 p-10 w-[500px]">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <div className="text-base font-semibold text-gray-900">Phase 2 — Fynd Sync</div>
            <div className="text-xs text-gray-500">Syncing entities to Fynd platform…</div>
          </div>
        </div>
        <div className="space-y-2.5">
          {syncSteps.map((s, i) => (
            <div key={s} className={`flex items-center gap-3 transition-all duration-300 ${steps2.includes(s) ? "opacity-100" : "opacity-20"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${steps2.includes(s) ? "bg-teal-500 text-white" : "bg-gray-100 text-gray-400"}`}>{steps2.includes(s) ? "✓" : i + 1}</div>
              <code className="text-xs text-gray-700 font-mono">{s}</code>
            </div>
          ))}
        </div>
        <div className="mt-5 bg-gray-50 rounded-lg p-3">
          <div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${(steps2.length / syncSteps.length) * 100}%` }} /></div>
          <div className="text-[10px] text-gray-400 mt-1">{steps2.length}/{syncSteps.length} API calls completed</div>
        </div>
      </div>
    </div>
  );
}

function ScreenFyndDone({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border border-teal-100 p-10 w-[520px] text-center">
        <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-5"><span className="text-teal-600 text-2xl font-bold">⟳</span></div>
        <div className="text-lg font-semibold text-gray-900 mb-1">Fynd Sync Complete</div>
        <div className="text-sm text-gray-500 mb-6">Brand is now ACTIVE on both Swasthera and Fynd platforms.</div>
        <div className="grid grid-cols-3 gap-3 mb-6 text-left">
          {[["fynd_company_code","FYN-CO-8801"],["fynd_brand_id","FYN-BR-2204"],["fynd_location_id","FYN-LOC-5510"]].map(([k,v]) => (
            <div key={k} className="bg-teal-50 border border-teal-100 rounded-lg p-3">
              <div className="text-[10px] text-teal-600 font-semibold">{k}</div>
              <div className="text-xs font-mono text-gray-700 mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mb-6 text-left space-y-1">
          <div className="font-semibold text-gray-700">Gate 2 → 3 cleared</div>
          <div>Fynd IDs persisted in mapping table. Orders will now be captured at checkout. OMS state sync begins.</div>
        </div>
        <Btn onClick={() => setStep("orders")}>Continue — Order Tracking →</Btn>
      </div>
    </div>
  );
}

function ScreenOrders({ setStep }: { setStep: (s: Step) => void }) {
  const bags = [
    { id: "FY-2840192", brand: "GreenLeaf Herbs", esp: "₹3,200", state: "delivery_done", window: "5 days left", elig: "In Window", ec: "text-amber-600 bg-amber-50" },
    { id: "FY-2840188", brand: "GreenLeaf Herbs", esp: "₹1,200", state: "bag_invoiced", window: "—", elig: "Awaiting delivery", ec: "text-blue-600 bg-blue-50" },
    { id: "FY-2840175", brand: "GreenLeaf Herbs", esp: "₹4,800", state: "return_window_expired", window: "Expired", elig: "Eligible ✓", ec: "text-emerald-600 bg-emerald-50" },
    { id: "FY-2840162", brand: "GreenLeaf Herbs", esp: "₹2,100", state: "return_initiated", window: "HOLD", elig: "On Hold", ec: "text-red-600 bg-red-50" },
    { id: "FY-2840150", brand: "GreenLeaf Herbs", esp: "₹5,500", state: "return_window_expired", window: "Expired", elig: "Eligible ✓", ec: "text-emerald-600 bg-emerald-50" },
  ];
  const stateColor: Record<string,string> = {
    bag_invoiced: "text-blue-700 bg-blue-50 border-blue-200",
    delivery_done: "text-amber-700 bg-amber-50 border-amber-200",
    return_window_expired: "text-emerald-700 bg-emerald-50 border-emerald-200",
    return_initiated: "text-red-700 bg-red-50 border-red-200",
  };
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Phase 3 + 4 · Live</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Order & Bag Tracking — GreenLeaf Herbs</div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[["Total Bags","5","text-gray-700"],["Eligible","2","text-emerald-600"],["In Window","1","text-amber-600"],["On Hold","1","text-red-600"]].map(([l,v,c]) => (
          <div key={l as string} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <div className="text-xs text-gray-400">{l}</div>
            <div className={`text-2xl font-bold mt-1 ${c}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <div className="text-sm font-semibold text-gray-800 mb-3">Live Bag Status</div>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-100">{["bag_id","Brand","ESP","OMS State","Return Window","Eligibility"].map(h => <th key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-left py-2 pr-4">{h}</th>)}</tr></thead>
          <tbody>
            {bags.map(b => (
              <tr key={b.id} onClick={() => setStep("orders-detail")} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer">
                <td className="py-2.5 pr-4 font-mono text-blue-600 font-medium">{b.id}</td>
                <td className="py-2.5 pr-4 text-gray-700">{b.brand}</td>
                <td className="py-2.5 pr-4 font-semibold text-gray-800">{b.esp}</td>
                <td className="py-2.5 pr-4"><span className={`font-mono text-[10px] border rounded px-2 py-0.5 ${stateColor[b.state] || ""}`}>{b.state}</span></td>
                <td className="py-2.5 pr-4 text-gray-500">{b.window}</td>
                <td className="py-2.5 pr-4"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${b.ec}`}>{b.elig}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 mb-4">
        <span className="text-blue-500">ℹ</span>
        <div className="text-xs text-blue-700">The system monitors all 77 Fynd OMS states continuously. When a bag reaches <code>return_window_expired</code> (with no active return), it becomes eligible for the next settlement cycle.</div>
      </div>
      <div className="flex justify-between">
        <Btn variant="secondary" onClick={() => setStep("fynd-done")}>← Fynd Sync</Btn>
        <Btn onClick={() => setStep("settlement")}>Proceed to Settlement →</Btn>
      </div>
    </div>
  );
}

function ScreenOrdersDetail({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Bag Detail</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">bag_id: FY-2840192</div>
      <div className="grid grid-cols-3 gap-5 mb-5">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Bag Info</div>
          {[["bag_id","FY-2840192"],["order_id","ORD-48291"],["Brand","GreenLeaf Herbs"],["Customer","Priya Sharma"],["ESP","₹3,200"],["MRP","₹3,800"],["Qty","1"]].map(([k,v]) => (
            <div key={k as string} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-xs">
              <span className="text-gray-400">{k}</span><span className="font-medium text-gray-700">{v}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Compliance Accruals</div>
          {[["TCS Accrued","₹32.00 (@ bag_invoiced)"],["TDS Accrued","₹32.00 (194-O)"],["Invoice Date","5 May 2026"],["Delivery Date","8 May 2026"],["Window Expires","15 May 2026"],["Commission Rate","11% (order date)"],["Warehouse State","Maharashtra (27)"]].map(([k,v]) => (
            <div key={k as string} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-xs">
              <span className="text-gray-400">{k}</span><span className="font-medium text-gray-700">{v}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">OMS Timeline</div>
          {[
            { s: "placed", d: "4 May 10:02", done: true },
            { s: "bag_invoiced ★", d: "4 May 10:06", done: true, crit: true },
            { s: "bag_packed", d: "4 May 14:30", done: true },
            { s: "in_transit", d: "5 May 09:00", done: true },
            { s: "delivery_done ★", d: "8 May 11:42", done: true, crit: true },
            { s: "return_window_expired", d: "15 May 11:42", done: false },
          ].map(e => (
            <div key={e.s} className="flex items-center gap-2 py-1">
              <div className={`w-2 h-2 rounded-full shrink-0 ${e.done ? e.crit ? "bg-amber-500" : "bg-emerald-400" : "bg-gray-200"}`} />
              <span className={`text-[10px] font-mono ${e.done ? e.crit ? "text-amber-700 font-semibold" : "text-gray-600" : "text-gray-300"}`}>{e.s}</span>
              <span className="text-[10px] text-gray-300 ml-auto">{e.d}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        <Btn variant="secondary" onClick={() => setStep("orders")}>← Bag List</Btn>
        <Btn onClick={() => setStep("settlement")}>To Settlement →</Btn>
      </div>
    </div>
  );
}

function ScreenSettlement({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Phase 5 — Bi-monthly</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Settlement Computation — GreenLeaf Ayurveda</div>
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-gray-800">Deduction Waterfall — Cycle MAY-2026-C1</div>
            <span className="text-xs text-gray-400">3 eligible bags · GreenLeaf Herbs</span>
          </div>
          <div className="space-y-0">
            {[
              { n:"1", label:"Gross Merchandise Value (GMV)", val:"₹9,200", note:"SUM(ESP) across 3 bags: ₹3,200 + ₹4,800 + ₹1,200", bold:false },
              { n:"2", label:"− Brand-funded Promotions", val:"− ₹200", note:"Brand discount from Fynd order report", bold:false },
              { n:"3", label:"Marketplace Promotions", val:"₹150", note:"Borne by Swasthera — informational only, not deducted", bold:false, muted:true },
              { n:"4", label:"= Net Payable Before Commission", val:"₹9,000", note:"Step 1 − Step 2", bold:true },
              { n:"5", label:"− Commission (11% @ order date)", val:"− ₹990", note:"11.00% — rate locked at order_created_at per Commission Master", bold:false },
              { n:"6", label:"− GST on Commission (18%)", val:"− ₹178.20", note:"On company Master GSTIN · SAC 9983", bold:false },
              { n:"7", label:"− TCS (1% taxable supply)", val:"− ₹92", note:"Per warehouse state GSTIN — Maharashtra (27) — already accrued", bold:false },
              { n:"8", label:"− TDS (1% gross ESP)", val:"− ₹92", note:"Section 194-O per company GSTIN/TAN", bold:false },
              { n:"9", label:"− MDR (Payment Gateway)", val:"− ₹27.60", note:"Pass-through at actuals per PGW agreement", bold:false },
              { n:"10", label:"= Net Payable to Brand", val:"₹7,620.20", note:"Transfer via NEFT/RTGS to company bank account", bold:true, highlight:true },
            ].map(r => (
              <div key={r.n} className={`flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 ${r.highlight ? "bg-emerald-50 rounded-lg px-3 -mx-3 mt-1" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-300 w-4 font-mono shrink-0">{r.n}</span>
                  <div>
                    <div className={`text-xs ${r.bold ? "font-semibold text-gray-900" : r.muted ? "text-gray-400" : "text-gray-700"}`}>{r.label}</div>
                    <div className="text-[10px] text-gray-400">{r.note}</div>
                  </div>
                </div>
                <div className={`text-sm font-mono shrink-0 ml-4 ${r.highlight ? "font-bold text-emerald-700 text-base" : r.bold ? "font-semibold text-gray-900" : r.muted ? "text-gray-400" : r.val.startsWith("−") ? "text-red-500" : "text-gray-800"}`}>{r.val}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Auto-Generated Outputs</div>
            <div className="space-y-2">
              {[
                { name: "Commission Invoice", sub: "Swasthera GSTIN · SAC 9983 · digital sig" },
                { name: "Statement of Claim (SoC)", sub: "27 fields per bag_id" },
              ].map(d => (
                <div key={d.name} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                  <div className="text-xs font-medium text-amber-800">{d.name}</div>
                  <div className="text-[10px] text-amber-600">{d.sub} · Draft</div>
                </div>
              ))}
              <div className="text-[10px] text-gray-400">Emailed to brand SPOC on Finance approval</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Compliance Gate</div>
            <div className="text-xs text-gray-500 mb-3">All TCS and TDS entries for this cycle are reconciled. Settlement cycle is clear to proceed.</div>
            <div className="space-y-1.5">
              {["TCS accruals reconciled","TDS entries reconciled","No unresolved returns","Compliance lock: CLEARED"].map(c => (
                <div key={c} className="flex items-center gap-1.5 text-xs text-emerald-700"><span className="text-emerald-500">✓</span>{c}</div>
              ))}
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <div className="text-xs font-semibold text-amber-800 mb-1">Finance Approval Required</div>
            <div className="text-xs text-amber-700 mb-3">The Finance Supervisor must approve this settlement statement before payout is released. Per-company approval — independent of other companies.</div>
            <button onClick={() => setStep("settlement-approve")} className="w-full bg-emerald-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-emerald-700">Review & Approve Settlement →</button>
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-4">
        <Btn variant="secondary" onClick={() => setStep("orders")}>← Orders</Btn>
      </div>
    </div>
  );
}

function ScreenSettlementApprove({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border border-gray-100 p-8 w-[520px]">
        <div className="text-base font-semibold text-gray-900 mb-1">Finance Approval — GreenLeaf Ayurveda</div>
        <div className="text-xs text-gray-500 mb-5">Cycle MAY-2026-C1 · Settlement statement review</div>
        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
          {[["Gross GMV","₹9,200"],["Total Deductions","− ₹1,579.80"],["Net Payable to Brand","₹7,620.20"],["Eligible Bags","3"],["Return Window","Cleared — 0 holds"],["Compliance","All reconciled ✓"]].map(([k,v]) => (
            <div key={k as string} className="flex justify-between text-sm">
              <span className="text-gray-500">{k}</span>
              <span className={`font-semibold ${(k as string).includes("Net") ? "text-emerald-700 text-base" : "text-gray-800"}`}>{v}</span>
            </div>
          ))}
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5">
          <div className="text-xs font-semibold text-emerald-800 mb-1">Checker Sign-off Required</div>
          <div className="text-xs text-emerald-700">On approval, the Commission Invoice and Statement of Claim will be auto-emailed to the brand's Finance SPOC (priya@greenleaf.in), and bank transfer will be initiated.</div>
        </div>
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-600 block mb-1">Finance Notes</label>
          <textarea defaultValue="Settlement reviewed. All figures verified against Fynd report." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 h-14 resize-none focus:outline-none focus:border-blue-300" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setStep("settlement")} className="border border-red-200 text-red-600 text-sm font-semibold py-3 rounded-xl hover:bg-red-50">✗ Reject — Recalculate</button>
          <button onClick={() => setStep("payout")} className="bg-emerald-600 text-white text-sm font-bold py-3 rounded-xl hover:bg-emerald-700">✓ Approve — Release Payout</button>
        </div>
      </div>
    </div>
  );
}

function ScreenPayout({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Phase 6 — On Finance Approval</div>
      <div className="text-xl font-semibold text-gray-900 mb-4">Payout — GreenLeaf Ayurveda Pvt Ltd</div>
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center"><span className="text-white text-lg font-bold">✓</span></div>
              <div>
                <div className="text-sm font-semibold text-emerald-800">Settlement Approved · Bank Transfer Initiated</div>
                <div className="text-xs text-emerald-700">NEFT to HDFC Bank · ****4521 · Ref MAY-2026-C1-GREENLEAF</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-emerald-600">Net Payable</div>
              <div className="text-2xl font-bold text-emerald-700">₹7,620.20</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-sm font-semibold text-gray-800 mb-4">Bank Transfer Details</div>
            <div className="grid grid-cols-2 gap-4">
              {[
                ["Beneficiary","GreenLeaf Ayurveda Pvt Ltd"],["Account Number","****4521"],["IFSC","HDFC0001234"],["Bank","HDFC Bank"],["Transfer Mode","NEFT"],["Amount","₹7,620.20"],["Initiated At","14 May 2026 · 04:10 PM"],["Status","Awaiting Bank ACK"],
              ].map(([k,v]) => (
                <div key={k as string} className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="text-[10px] text-gray-400 uppercase">{k}</div>
                  <div className="text-xs font-medium text-gray-700 mt-0.5">{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-sm font-semibold text-gray-800 mb-3">Auto-Generated Outputs</div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: "Commission Invoice", icon: "📄", status: "Emailed ✓" },
                { name: "Statement of Claim (SoC)", icon: "📊", status: "Emailed ✓" },
                { name: "Payout Report", icon: "📬", status: "Pending UTR" },
              ].map(d => (
                <div key={d.name} className="border border-gray-100 rounded-xl p-3 text-center">
                  <div className="text-2xl mb-1">{d.icon}</div>
                  <div className="text-xs font-medium text-gray-700">{d.name}</div>
                  <div className={`text-[10px] mt-1 font-semibold ${d.status.includes("Emailed") ? "text-emerald-600" : "text-amber-600"}`}>{d.status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-amber-200 ring-1 ring-amber-100 p-5">
            <div className="text-sm font-semibold text-gray-800 mb-3">Record UTR Number</div>
            <div className="text-xs text-gray-500 mb-3">Enter the UTR from the bank acknowledgement to complete the payout cycle.</div>
            <label className="text-xs font-medium text-gray-600 block mb-1">UTR Reference <span className="text-red-400">*</span></label>
            <input defaultValue="NEFT2405140082" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 focus:outline-none focus:border-blue-400 mb-3" placeholder="e.g. NEFT2405140082" />
            <button onClick={() => setStep("utr-entry")} className="w-full bg-emerald-600 text-white text-sm font-bold py-2.5 rounded-lg hover:bg-emerald-700">Record UTR & Lock Bags →</button>
            <div className="text-[10px] text-gray-400 mt-2 text-center">This applies SETTLED status to all 3 bag_ids</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-3">Post-Settlement Rules</div>
            <div className="space-y-2 text-xs text-gray-500">
              <div className="flex gap-1.5"><span className="text-blue-500 shrink-0">→</span>Post-settlement return: credit note raised, netted in next cycle</div>
              <div className="flex gap-1.5"><span className="text-blue-500 shrink-0">→</span>No reverse bank transfer for returns after payout</div>
              <div className="flex gap-1.5"><span className="text-blue-500 shrink-0">→</span>Duplicate-payment guard: SETTLED bags permanently locked</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-semibold text-gray-700 mb-2">TCS / TDS Calendar</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">TCS Payment</span><span className="text-amber-600 font-medium">7 Jun 2026</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TDS Payment</span><span className="text-amber-600 font-medium">10 Jun 2026</span></div>
              <div className="flex justify-between"><span className="text-gray-500">GSTR-8 Filing</span><span className="text-gray-500">Monthly</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenUTREntry({ setStep }: { setStep: (s: Step) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border border-emerald-200 p-10 w-[540px] text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5"><span className="text-emerald-600 text-3xl">🎉</span></div>
        <div className="text-xl font-bold text-gray-900 mb-1">Settlement Complete!</div>
        <div className="text-sm text-gray-500 mb-6">UTR recorded · All bags locked · Full cycle closed</div>
        <div className="bg-emerald-600 rounded-xl p-5 text-white mb-5">
          <div className="text-xs text-emerald-200 mb-1">UTR Reference</div>
          <div className="text-2xl font-mono font-bold">NEFT2405140082</div>
          <div className="text-sm text-emerald-100 mt-1">₹7,620.20 · HDFC Bank · 14 May 2026</div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5 text-left">
          {[["Bags Settled","3 · SETTLED status applied"],["Duplicate Guard","Lock applied to all bag_ids"],["Payout Report","Emailed to priya@greenleaf.in"],["Form 16A","Issued quarterly to brand CA"],["TCS Cert","Issued monthly to brand"],["Next Cycle","MAY-2026-C2 · 16–31 May"]].map(([k,v]) => (
            <div key={k as string} className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] text-gray-400 uppercase">{k}</div>
              <div className="text-xs font-medium text-gray-700 mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setStep("dashboard")} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50">← Back to Dashboard</button>
          <button onClick={() => setStep("ob-company")} className="flex-1 bg-blue-600 text-white text-sm font-bold py-2.5 rounded-xl hover:bg-blue-700">+ New Brand Onboarding</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────────────────

export function E2EPrototype() {
  const [step, setStep] = useState<Step>("dashboard");

  const renderScreen = () => {
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
      case "orders-detail": return <ScreenOrdersDetail setStep={setStep} />;
      case "settlement": return <ScreenSettlement setStep={setStep} />;
      case "settlement-approve": return <ScreenSettlementApprove setStep={setStep} />;
      case "payout": return <ScreenPayout setStep={setStep} />;
      case "utr-entry": return <ScreenUTREntry setStep={setStep} />;
      default: return <ScreenDashboard setStep={setStep} />;
    }
  };

  return (
    <div className="h-screen flex flex-col font-sans bg-white overflow-hidden">
      <JourneyBar step={step} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar step={step} setStep={setStep} />
        {renderScreen()}
      </div>
    </div>
  );
}
