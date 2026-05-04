export function Onboarding() {
  return (
    <div className="min-h-screen bg-white flex font-sans">
      <aside className="w-56 border-r border-gray-100 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">S</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 leading-none">Swasthera</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Settlement Module</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {[
            { label: "Dashboard", icon: "▦" },
            { label: "Brand Onboarding", icon: "＋", active: true },
            { label: "Approval Queue", icon: "✓", badge: "3" },
            { label: "Order Tracking", icon: "◎" },
            { label: "Settlement", icon: "◈" },
            { label: "Payout", icon: "↗" },
            { label: "Compliance", icon: "⊞" },
            { label: "Reports", icon: "≡" },
          ].map((item) => (
            <div key={item.label} className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-sm ${item.active ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-500 hover:bg-gray-50"}`}>
              <span className="flex items-center gap-2.5">
                <span className="text-xs w-4 text-center opacity-70">{item.icon}</span>
                {item.label}
              </span>
              {item.badge && <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{item.badge}</span>}
            </div>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">AP</div>
            <div>
              <div className="text-xs font-medium text-gray-800">Anjali Patel</div>
              <div className="text-[10px] text-gray-400">Finance · Maker</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-gray-50">
        <header className="bg-white border-b border-gray-100 px-7 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Phase 1</div>
            <div className="text-lg font-semibold text-gray-900 mt-0.5">Brand Onboarding Wizard</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-md font-medium">Draft</span>
            <span>GreenLeaf Ayurveda Pvt Ltd</span>
          </div>
        </header>

        <div className="px-7 py-5">
          <div className="flex items-center gap-0 mb-6">
            {[
              { step: 1, label: "Company", done: true },
              { step: 2, label: "Brand", done: true },
              { step: 3, label: "Warehouse", active: true },
              { step: 4, label: "KYB & Docs" },
              { step: 5, label: "Commercial" },
              { step: 6, label: "Submit" },
            ].map((s, i) => (
              <div key={s.step} className="flex items-center">
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${s.done ? "bg-emerald-600 text-white" : s.active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                    {s.done ? "✓" : s.step}
                  </div>
                  <span className={`text-xs font-medium ${s.done ? "text-emerald-600" : s.active ? "text-blue-600" : "text-gray-400"}`}>{s.label}</span>
                </div>
                {i < 5 && <div className={`w-8 h-px mx-2 ${s.done ? "bg-emerald-300" : "bg-gray-200"}`} />}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2 space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-gray-800">Warehouse Details</div>
                  <button className="text-xs text-blue-600 font-medium hover:underline">+ Add another warehouse</button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Warehouse Name", placeholder: "Delhi Fulfilment Centre", required: true },
                    { label: "State GSTIN", placeholder: "07AABCG1234F1ZK", required: true, hint: "Drives TCS filing state" },
                    { label: "Address Line 1", placeholder: "Plot 42, Sector 18", required: true, full: true },
                    { label: "Address Line 2", placeholder: "Industrial Area", full: true },
                    { label: "City", placeholder: "New Delhi" },
                    { label: "State", placeholder: "Delhi" },
                    { label: "Pincode", placeholder: "110045" },
                    { label: "State Code", placeholder: "07", hint: "Auto-derived from GSTIN" },
                  ].map((field) => (
                    <div key={field.label} className={field.full ? "col-span-2" : ""}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {field.label} {field.required && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                        placeholder={field.placeholder}
                        defaultValue={field.placeholder === "Delhi Fulfilment Centre" ? "Mumbai Distribution Hub" : field.placeholder === "07AABCG1234F1ZK" ? "27AABCG1234F1ZK" : ""}
                      />
                      {field.hint && <div className="text-[10px] text-gray-400 mt-1">{field.hint}</div>}
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-medium text-gray-600">Drug License <span className="text-gray-400">(Conditional — pharma/scheduled)</span></label>
                    <div className="flex items-center gap-1.5">
                      <div className="w-8 h-4 rounded-full bg-blue-600 relative cursor-pointer">
                        <div className="w-3 h-3 rounded-full bg-white absolute top-0.5 right-0.5"></div>
                      </div>
                      <span className="text-xs text-blue-600 font-medium">Required</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300" placeholder="Drug License No." />
                    </div>
                    <div className="border border-dashed border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer hover:border-blue-300">
                      <span className="text-gray-300 text-sm">↑</span>
                      <span className="text-xs text-gray-400">Upload drug_license.pdf</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
                <span className="text-amber-500 text-sm mt-0.5">⚠</span>
                <div>
                  <div className="text-xs font-semibold text-amber-800">KYB not yet verified</div>
                  <div className="text-xs text-amber-600 mt-0.5">KYB verification will be triggered automatically when you submit company details. Document upload is only unlocked after KYB passes.</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Progress</div>
                <div className="space-y-2.5">
                  {[
                    { label: "Company Master", status: "Complete", color: "text-emerald-600 bg-emerald-50" },
                    { label: "Brand Master", status: "Complete", color: "text-emerald-600 bg-emerald-50" },
                    { label: "Warehouse", status: "In Progress", color: "text-blue-600 bg-blue-50" },
                    { label: "KYB Verification", status: "Pending", color: "text-gray-500 bg-gray-50" },
                    { label: "Documents Upload", status: "Locked", color: "text-gray-400 bg-gray-50" },
                    { label: "Commercial Terms", status: "Locked", color: "text-gray-400 bg-gray-50" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">{item.label}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.color}`}>{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Company Summary</div>
                <div className="space-y-2">
                  {[
                    { key: "Legal Name", val: "GreenLeaf Ayurveda Pvt Ltd" },
                    { key: "Type", val: "Private Ltd" },
                    { key: "PAN", val: "AABCG1234F" },
                    { key: "Master GSTIN", val: "27AABCG1234F1ZK" },
                    { key: "Bank", val: "HDFC Bank · ****4521" },
                    { key: "SPOC", val: "priya@greenleaf.in" },
                  ].map((r) => (
                    <div key={r.key}>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">{r.key}</div>
                      <div className="text-xs text-gray-700 font-medium">{r.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Maker–Checker Rule</div>
                <div className="text-xs text-gray-600 leading-relaxed">You are the <strong>Maker</strong>. After KYB passes and documents are uploaded, this record will be submitted to the Finance Supervisor (Checker) for approval. You cannot approve your own submission.</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-5">
            <button className="text-sm text-gray-500 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50">← Back to Brand</button>
            <div className="flex gap-3">
              <button className="text-sm text-gray-500 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50">Save Draft</button>
              <button className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-700">Save & Continue →</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
