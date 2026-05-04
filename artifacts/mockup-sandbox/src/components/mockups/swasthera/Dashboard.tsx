export function Dashboard() {
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
            { label: "Dashboard", icon: "▦", active: true },
            { label: "Brand Onboarding", icon: "＋" },
            { label: "Approval Queue", icon: "✓", badge: "3" },
            { label: "Order Tracking", icon: "◎" },
            { label: "Settlement", icon: "◈" },
            { label: "Payout", icon: "↗" },
            { label: "Compliance", icon: "⊞" },
            { label: "Reports", icon: "≡" },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-sm ${item.active ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-xs w-4 text-center opacity-70">{item.icon}</span>
                {item.label}
              </span>
              {item.badge && (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{item.badge}</span>
              )}
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
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Settlement Module</div>
            <div className="text-lg font-semibold text-gray-900 mt-0.5">Dashboard</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-md">Cycle: MAY-2026-C1 &nbsp;·&nbsp; 1–15 May</div>
            <button className="bg-emerald-600 text-white text-xs font-medium px-3.5 py-1.5 rounded-md hover:bg-emerald-700">Run Settlement</button>
          </div>
        </header>

        <div className="px-7 py-6 space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Gross GMV (Cycle)", value: "₹2,84,60,450", sub: "+12.4% vs last cycle", color: "text-emerald-600" },
              { label: "Net Payable", value: "₹2,41,35,780", sub: "After all deductions", color: "text-blue-600" },
              { label: "Pending Approvals", value: "3", sub: "Brands awaiting sign-off", color: "text-amber-600" },
              { label: "Bags Eligible", value: "14,820", sub: "Return window cleared", color: "text-gray-700" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
                <div className="text-xs text-gray-400 font-medium">{kpi.label}</div>
                <div className={`text-2xl font-bold mt-1.5 ${kpi.color}`}>{kpi.value}</div>
                <div className="text-[11px] text-gray-400 mt-1">{kpi.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-gray-800">Settlement by Brand</div>
                <span className="text-xs text-gray-400">Current cycle · 6 brands</span>
              </div>
              <div className="space-y-3">
                {[
                  { brand: "HealWell Pharma Pvt Ltd", gmv: "₹82,40,000", net: "₹69,80,200", comm: "12%", status: "Approved", statusColor: "bg-emerald-50 text-emerald-700" },
                  { brand: "NutriLife Sciences LLP", gmv: "₹54,20,000", net: "₹46,10,540", comm: "10%", status: "Pending", statusColor: "bg-amber-50 text-amber-700" },
                  { brand: "Ayurvedic Roots Co.", gmv: "₹38,50,000", net: "₹32,45,000", comm: "11%", status: "Pending", statusColor: "bg-amber-50 text-amber-700" },
                  { brand: "MedTech Devices Ltd", gmv: "₹71,30,000", net: "₹60,24,600", comm: "9.5%", status: "Approved", statusColor: "bg-emerald-50 text-emerald-700" },
                  { brand: "VitaBoost Wellness", gmv: "₹22,10,000", net: "₹18,64,350", comm: "10%", status: "On Hold", statusColor: "bg-red-50 text-red-600" },
                  { brand: "ClearSkin Derma", gmv: "₹16,10,450", net: "₹14,10,090", comm: "12%", status: "Pending", statusColor: "bg-amber-50 text-amber-700" },
                ].map((row) => (
                  <div key={row.brand} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">{row.brand[0]}</div>
                      <div>
                        <div className="text-sm font-medium text-gray-800">{row.brand}</div>
                        <div className="text-[11px] text-gray-400">Commission {row.comm}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-8 text-right">
                      <div>
                        <div className="text-xs text-gray-400">GMV</div>
                        <div className="text-sm font-medium text-gray-700">{row.gmv}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Net Payable</div>
                        <div className="text-sm font-semibold text-gray-900">{row.net}</div>
                      </div>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${row.statusColor}`}>{row.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="text-sm font-semibold text-gray-800 mb-3">Compliance Calendar</div>
                <div className="space-y-2.5">
                  {[
                    { label: "TCS Payment Due", date: "7 Jun 2026", status: "Upcoming", color: "text-amber-600 bg-amber-50" },
                    { label: "TDS Payment Due", date: "10 Jun 2026", status: "Upcoming", color: "text-amber-600 bg-amber-50" },
                    { label: "GSTR-8 Filing", date: "Monthly", status: "Scheduled", color: "text-blue-600 bg-blue-50" },
                    { label: "Form 26Q (TDS)", date: "31 Jul 2026", status: "Q2", color: "text-gray-500 bg-gray-50" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-xs font-medium text-gray-700">{item.label}</div>
                        <div className="text-[11px] text-gray-400">{item.date}</div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.color}`}>{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="text-sm font-semibold text-gray-800 mb-3">Phase Status</div>
                <div className="space-y-2">
                  {[
                    { phase: "Onboarding", count: "2 in review", color: "bg-amber-400" },
                    { phase: "Fynd Sync", count: "All synced", color: "bg-emerald-400" },
                    { phase: "Order Tracking", count: "Live · 77 states", color: "bg-blue-400" },
                    { phase: "Return Window", count: "840 on hold", color: "bg-orange-400" },
                    { phase: "Settlement", count: "3 pending approval", color: "bg-amber-400" },
                    { phase: "Payout", count: "4 completed", color: "bg-emerald-400" },
                  ].map((p) => (
                    <div key={p.phase} className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${p.color}`}></div>
                      <div className="flex-1 text-xs text-gray-700">{p.phase}</div>
                      <div className="text-[11px] text-gray-400">{p.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-sm font-semibold text-gray-800 mb-3">Recent Activity</div>
            <div className="space-y-0">
              {[
                { time: "2 min ago", event: "Settlement approved", detail: "HealWell Pharma · ₹69,80,200 · by Rahul Kumar", dot: "bg-emerald-400" },
                { time: "18 min ago", event: "KYB passed", detail: "GreenLeaf Ayurveda Pvt Ltd · PAN verified · docs upload unlocked", dot: "bg-blue-400" },
                { time: "1 hr ago", event: "Return reversal", detail: "Bag #FY-2840192 · TCS + TDS reversed · VitaBoost Wellness", dot: "bg-red-400" },
                { time: "3 hrs ago", event: "Cycle opened", detail: "MAY-2026-C1 · 14,820 eligible bags collected", dot: "bg-gray-300" },
                { time: "Yesterday", event: "Payout completed", detail: "NutriLife Sciences · ₹46,10,540 · UTR: NEFT2405300082", dot: "bg-emerald-400" },
              ].map((a, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.dot}`}></div>
                  <div className="flex-1">
                    <span className="text-xs font-medium text-gray-800">{a.event}</span>
                    <span className="text-xs text-gray-400 ml-2">{a.detail}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 shrink-0">{a.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
