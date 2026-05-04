export function Payout() {
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
            { label: "Settlement", icon: "◈" },
            { label: "Payout", icon: "↗", active: true },
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
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Phase 6 · On Finance Approval</div>
            <div className="text-lg font-semibold text-gray-900 mt-0.5">Payout Management</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-md">Cycle MAY-2026-C1</span>
            <button className="bg-emerald-600 text-white text-xs font-medium px-3.5 py-1.5 rounded-md hover:bg-emerald-700">Initiate All Payouts</button>
          </div>
        </header>

        <div className="px-7 py-5 space-y-5">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Payout (Cycle)", val: "₹2,41,35,780", color: "text-emerald-600" },
              { label: "Initiated", val: "₹1,14,91,340", color: "text-blue-600" },
              { label: "Completed · UTR Captured", val: "₹68,80,800", color: "text-emerald-600" },
              { label: "Awaiting Finance Approval", val: "₹57,63,640", color: "text-amber-600" },
            ].map((k) => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
                <div className="text-xs text-gray-400">{k.label}</div>
                <div className={`text-xl font-bold mt-1.5 ${k.color}`}>{k.val}</div>
              </div>
            ))}
          </div>

          <div className="bg-emerald-600 rounded-xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-200 uppercase tracking-wide font-medium">Completed · UTR Recorded</div>
                <div className="text-lg font-bold mt-1">HealWell Pharma Pvt Ltd</div>
                <div className="text-sm text-emerald-100 mt-0.5">₹68,80,800 · NEFT · Cycle MAY-2026-C1</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-emerald-200">UTR Reference</div>
                <div className="text-lg font-mono font-bold mt-1">NEFT2405300082</div>
                <div className="text-xs text-emerald-200 mt-0.5">13 May 2026 · 03:42 PM</div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-emerald-500">
              <span className="text-xs text-emerald-200">Bank: HDFC Bank</span>
              <span className="text-emerald-400">·</span>
              <span className="text-xs text-emerald-200">A/C: ****4521</span>
              <span className="text-emerald-400">·</span>
              <span className="text-xs text-emerald-200">IFSC: HDFC0001234</span>
              <span className="ml-auto text-xs bg-emerald-500 px-2.5 py-1 rounded-md font-semibold">SETTLED · All bags locked</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">Payout Queue · All Companies</div>
              <div className="text-xs text-gray-400">Finance Supervisor approval required per company</div>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                {
                  company: "NutriLife Sciences LLP",
                  brands: "2 brands",
                  bags: 1820,
                  net: "₹46,10,540",
                  bank: "ICICI Bank · ****2201",
                  ifsc: "ICIC0002201",
                  status: "Initiated",
                  sc: "text-blue-600 bg-blue-50",
                  utr: "NEFT2405290041",
                  utrDate: "12 May 2026",
                },
                {
                  company: "Ayurvedic Roots Co.",
                  brands: "1 brand",
                  bags: 1240,
                  net: "₹32,45,000",
                  bank: "SBI · ****8812",
                  ifsc: "SBIN0001122",
                  status: "Approved",
                  sc: "text-emerald-600 bg-emerald-50",
                  utr: "",
                  utrDate: "",
                },
                {
                  company: "MedTech Devices Ltd",
                  brands: "3 brands",
                  bags: 2640,
                  net: "₹60,24,600",
                  bank: "Axis Bank · ****5509",
                  ifsc: "UTIB0005509",
                  status: "Approved",
                  sc: "text-emerald-600 bg-emerald-50",
                  utr: "",
                  utrDate: "",
                },
                {
                  company: "ClearSkin Derma",
                  brands: "1 brand",
                  bags: 620,
                  net: "₹14,10,090",
                  bank: "Kotak · ****3304",
                  ifsc: "KKBK0003304",
                  status: "Awaiting Approval",
                  sc: "text-amber-600 bg-amber-50",
                  utr: "",
                  utrDate: "",
                },
              ].map((row) => (
                <div key={row.company} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-500">{row.company[0]}</div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{row.company}</div>
                        <div className="text-[11px] text-gray-400">{row.brands} · {row.bags.toLocaleString()} bags</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Net Payable</div>
                        <div className="text-sm font-bold text-gray-900">{row.net}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400">{row.bank}</div>
                        <div className="text-[10px] text-gray-400">{row.ifsc}</div>
                      </div>
                      {row.utr ? (
                        <div className="text-right">
                          <div className="text-[10px] text-gray-400">UTR</div>
                          <div className="text-xs font-mono font-medium text-gray-700">{row.utr}</div>
                          <div className="text-[10px] text-gray-400">{row.utrDate}</div>
                        </div>
                      ) : (
                        <div className="w-32">
                          {row.status === "Approved" ? (
                            <div className="space-y-1.5">
                              <input className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs placeholder-gray-300 focus:outline-none focus:border-blue-300" placeholder="Enter UTR…" />
                              <button className="w-full bg-emerald-600 text-white text-[11px] font-semibold py-1 rounded-md hover:bg-emerald-700">Record UTR</button>
                            </div>
                          ) : (
                            <div className="text-right">
                              <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${row.sc}`}>{row.status}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {row.utr && <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">{row.status}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="text-sm font-semibold text-gray-800 mb-3">Post-Settlement Handling</div>
              <div className="space-y-2.5">
                {[
                  { scenario: "Post-settlement return", action: "Credit note raised · netted in next cycle", color: "text-blue-700 bg-blue-50 border-blue-200" },
                  { scenario: "TCS/TDS adjustment", action: "Flows through next compliance cycle", color: "text-amber-700 bg-amber-50 border-amber-200" },
                  { scenario: "Duplicate payment guard", action: "SETTLED status locks bag_id permanently", color: "text-gray-600 bg-gray-50 border-gray-200" },
                ].map((item) => (
                  <div key={item.scenario} className={`border rounded-lg px-3 py-2.5 ${item.color}`}>
                    <div className="text-xs font-semibold">{item.scenario}</div>
                    <div className="text-[11px] mt-0.5 opacity-80">{item.action}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="text-sm font-semibold text-gray-800 mb-3">Auto-Emailed Outputs on Payout</div>
              <div className="space-y-2">
                {[
                  { doc: "Final Commission Invoice", to: "Finance SPOC · with digital signature" },
                  { doc: "Statement of Claim (SoC)", to: "Finance SPOC · 27 fields per bag" },
                  { doc: "Payout Report", to: "Brand SPOC · bag_id + UTR + net payable" },
                  { doc: "TCS Certificate (monthly)", to: "Brand compliance team" },
                  { doc: "Form 16A (quarterly)", to: "Brand compliance team" },
                ].map((d) => (
                  <div key={d.doc} className="flex items-start gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-emerald-500 mt-0.5 shrink-0 text-xs">✓</span>
                    <div>
                      <div className="text-xs font-medium text-gray-700">{d.doc}</div>
                      <div className="text-[10px] text-gray-400">{d.to}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
