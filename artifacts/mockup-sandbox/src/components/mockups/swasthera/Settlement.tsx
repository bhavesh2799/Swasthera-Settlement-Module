export function Settlement() {
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
            { label: "Brand Onboarding", icon: "＋" },
            { label: "Approval Queue", icon: "✓", badge: "3" },
            { label: "Order Tracking", icon: "◎" },
            { label: "Settlement", icon: "◈", active: true },
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
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">RK</div>
            <div>
              <div className="text-xs font-medium text-gray-800">Rahul Kumar</div>
              <div className="text-[10px] text-gray-400">Finance Supervisor</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-gray-50">
        <header className="bg-white border-b border-gray-100 px-7 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Phase 5 · Bi-monthly</div>
            <div className="text-lg font-semibold text-gray-900 mt-0.5">Settlement Computation</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-md">Cycle MAY-2026-C1 · 1–15 May</span>
            <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-3 py-1.5 rounded-md font-medium">3 pending Finance approval</span>
          </div>
        </header>

        <div className="px-7 py-5 space-y-5">
          <div className="bg-white rounded-xl border border-blue-200 ring-1 ring-blue-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-500">H</div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">HealWell Pharma Pvt Ltd</div>
                  <div className="text-[11px] text-gray-400">3 brands · 2,840 eligible bags · Commission 12%</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-2.5 py-1 rounded-md font-medium">Pending Finance Approval</span>
                <button className="text-xs text-blue-600 font-medium hover:underline">View SoC Draft ↗</button>
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Deduction Waterfall</div>
                  <div className="space-y-0">
                    {[
                      { line: "1", label: "Gross Merchandise Value (GMV)", value: "₹82,40,000", note: "SUM(ESP) · 2,840 bags", bold: false, indent: false },
                      { line: "2", label: "− Brand-funded Promotions", value: "− ₹1,20,000", note: "Deducted from brand payout", bold: false, indent: true },
                      { line: "3", label: "Marketplace-funded Promotions", value: "₹45,000", note: "Borne by Swasthera · informational only", bold: false, indent: true, muted: true },
                      { line: "4", label: "= Net Payable Before Commission", value: "₹81,20,000", note: "Step 1 − Step 2", bold: true, indent: false },
                      { line: "5", label: "− Commission (12% @ order date)", value: "− ₹9,74,400", note: "12.00% · rate locked at order_created_at", bold: false, indent: true },
                      { line: "6", label: "− GST on Commission (18%)", value: "− ₹1,75,392", note: "On company Master GSTIN · SAC 9983", bold: false, indent: true },
                      { line: "7", label: "− TCS (1% of taxable supply)", value: "− ₹70,000", note: "Per warehouse state GSTIN · already accrued", bold: false, indent: true },
                      { line: "8", label: "− TDS (1% of gross ESP)", value: "− ₹82,400", note: "Section 194-O · per company GSTIN", bold: false, indent: true },
                      { line: "9", label: "− MDR (Payment Gateway)", value: "− ₹37,008", note: "Pass-through at actuals", bold: false, indent: true },
                      { line: "10", label: "= Net Payable to Brand", value: "₹68,80,800", note: "NEFT/RTGS to company bank account", bold: true, indent: false, highlight: true },
                    ].map((row) => (
                      <div key={row.line} className={`flex items-center justify-between py-2 border-b border-gray-50 last:border-0 ${row.indent ? "pl-3" : ""} ${row.highlight ? "bg-emerald-50 rounded-lg px-3 -mx-3 mt-1" : ""}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-300 w-4 shrink-0 font-mono">{row.line}</span>
                          <div>
                            <div className={`text-xs ${row.bold ? "font-semibold text-gray-900" : row.muted ? "text-gray-400" : "text-gray-700"}`}>{row.label}</div>
                            <div className="text-[10px] text-gray-400">{row.note}</div>
                          </div>
                        </div>
                        <div className={`text-sm font-mono shrink-0 ${row.highlight ? "font-bold text-emerald-700" : row.bold ? "font-semibold text-gray-900" : row.muted ? "text-gray-400" : row.value.startsWith("−") ? "text-red-500" : "text-gray-800"}`}>
                          {row.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs font-semibold text-gray-700 mb-3">Brand Breakdown</div>
                    <div className="space-y-2.5">
                      {[
                        { brand: "HealWell Cardiac", bags: 1240, gmv: "₹38,40,000", net: "₹31,89,200" },
                        { brand: "HealWell OTC", bags: 980, gmv: "₹28,00,000", net: "₹23,24,100" },
                        { brand: "HealWell Derma", bags: 620, gmv: "₹16,00,000", net: "₹13,67,500" },
                      ].map((b) => (
                        <div key={b.brand} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                          <div>
                            <div className="text-xs font-medium text-gray-700">{b.brand}</div>
                            <div className="text-[11px] text-gray-400">{b.bags} bags</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500">{b.gmv}</div>
                            <div className="text-xs font-semibold text-gray-800">{b.net}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs font-semibold text-gray-700 mb-3">Auto-Generated Outputs</div>
                    <div className="space-y-2">
                      {[
                        { name: "Commission Invoice", sub: "GSTIN · SAC 9983 · digital sig", status: "Draft", color: "text-amber-600 bg-amber-50" },
                        { name: "Statement of Claim (SoC)", sub: "27 fields per bag_id", status: "Draft", color: "text-amber-600 bg-amber-50" },
                      ].map((doc) => (
                        <div key={doc.name} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                          <div>
                            <div className="text-xs font-medium text-gray-700">{doc.name}</div>
                            <div className="text-[10px] text-gray-400">{doc.sub}</div>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${doc.color}`}>{doc.status}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-2">Sent to brand SPOC on Finance approval</div>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <div className="text-xs font-semibold text-amber-800 mb-1">Compliance Gate</div>
                    <div className="text-[11px] text-amber-700">All TCS and TDS entries for this cycle are reconciled. Settlement can proceed.</div>
                    <div className="flex gap-2 mt-3">
                      <button className="flex-1 border border-red-200 text-red-600 text-xs font-semibold py-2 rounded-lg hover:bg-red-50">Reject</button>
                      <button className="flex-1 bg-emerald-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-emerald-700">Approve Settlement</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-800">All Companies · MAY-2026-C1</div>
              <div className="text-xs text-gray-400">Total net payable: <span className="font-semibold text-gray-700">₹2,41,35,780</span></div>
            </div>
            <div className="space-y-0">
              <div className="grid grid-cols-6 text-[10px] font-semibold text-gray-400 uppercase tracking-wide pb-2 border-b border-gray-100">
                <span className="col-span-2">Company</span>
                <span className="text-right">GMV</span>
                <span className="text-right">Commission</span>
                <span className="text-right">Net Payable</span>
                <span className="text-right">Status</span>
              </div>
              {[
                { co: "HealWell Pharma Pvt Ltd", gmv: "₹82,40,000", comm: "₹9,74,400", net: "₹68,80,800", status: "Pending", sc: "bg-amber-50 text-amber-700" },
                { co: "NutriLife Sciences LLP", gmv: "₹54,20,000", comm: "₹5,42,000", net: "₹46,10,540", status: "Approved", sc: "bg-emerald-50 text-emerald-700" },
                { co: "Ayurvedic Roots Co.", gmv: "₹38,50,000", comm: "₹4,23,500", net: "₹32,45,000", status: "Pending", sc: "bg-amber-50 text-amber-700" },
                { co: "MedTech Devices Ltd", gmv: "₹71,30,000", comm: "₹6,77,350", net: "₹60,24,600", status: "Approved", sc: "bg-emerald-50 text-emerald-700" },
                { co: "VitaBoost Wellness", gmv: "₹22,10,000", comm: "₹2,21,000", net: "₹18,64,350", status: "On Hold", sc: "bg-red-50 text-red-600" },
              ].map((row) => (
                <div key={row.co} className="grid grid-cols-6 py-2.5 border-b border-gray-50 last:border-0 items-center">
                  <div className="col-span-2 text-xs font-medium text-gray-800">{row.co}</div>
                  <div className="text-xs text-gray-600 text-right">{row.gmv}</div>
                  <div className="text-xs text-red-500 text-right">− {row.comm}</div>
                  <div className="text-xs font-semibold text-gray-900 text-right">{row.net}</div>
                  <div className="text-right"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${row.sc}`}>{row.status}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
