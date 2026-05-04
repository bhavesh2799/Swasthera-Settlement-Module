export function OrderTracking() {
  const bags = [
    { id: "FY-2840192", brand: "HealWell Cardiac", order: "ORD-48291", customer: "Priya Sharma", esp: "₹4,200", state: "delivery_done", returnWindow: "5 days left", eligibility: "In Window", ec: "text-amber-600 bg-amber-50" },
    { id: "FY-2840185", brand: "NutriLife Sciences", order: "ORD-48284", customer: "Arjun Mehta", esp: "₹1,850", state: "return_window_expired", returnWindow: "Expired", eligibility: "Eligible", ec: "text-emerald-600 bg-emerald-50" },
    { id: "FY-2840178", brand: "VitaBoost Wellness", order: "ORD-48271", customer: "Sunita Rao", esp: "₹3,400", state: "return_initiated", returnWindow: "HOLD", eligibility: "On Hold", ec: "text-red-600 bg-red-50" },
    { id: "FY-2840164", brand: "GreenLeaf Herbs", order: "ORD-48258", customer: "Ravi Kumar", esp: "₹2,100", state: "bag_invoiced", returnWindow: "—", eligibility: "Awaiting Delivery", ec: "text-blue-600 bg-blue-50" },
    { id: "FY-2840156", brand: "MedTech Devices", order: "ORD-48249", customer: "Meera Joshi", esp: "₹8,900", state: "return_bag_delivered", returnWindow: "Returned", eligibility: "Excluded", ec: "text-red-600 bg-red-50" },
    { id: "FY-2840140", brand: "HealWell OTC", order: "ORD-48232", customer: "Deepak Singh", esp: "₹990", state: "return_window_expired", returnWindow: "Expired", eligibility: "Eligible", ec: "text-emerald-600 bg-emerald-50" },
    { id: "FY-2840128", brand: "Ayurvedic Roots", order: "ORD-48219", customer: "Kavita Bose", esp: "₹6,200", state: "cancelled_customer", returnWindow: "Cancelled", eligibility: "Excluded", ec: "text-gray-400 bg-gray-50" },
  ];

  const stateColors: Record<string, string> = {
    bag_invoiced: "text-blue-700 bg-blue-50 border-blue-200",
    delivery_done: "text-amber-700 bg-amber-50 border-amber-200",
    return_window_expired: "text-emerald-700 bg-emerald-50 border-emerald-200",
    return_initiated: "text-red-700 bg-red-50 border-red-200",
    return_bag_delivered: "text-red-700 bg-red-50 border-red-200",
    cancelled_customer: "text-gray-500 bg-gray-50 border-gray-200",
  };

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
            { label: "Order Tracking", icon: "◎", active: true },
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
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Phase 3 + 4 · Live</div>
            <div className="text-lg font-semibold text-gray-900 mt-0.5">Order & Bag Tracking</div>
          </div>
          <div className="flex items-center gap-2">
            <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs placeholder-gray-400 w-52 focus:outline-none focus:border-blue-300" placeholder="Search bag_id or order_id…" />
            <select className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-blue-300 bg-white">
              <option>All brands</option>
            </select>
            <select className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-blue-300 bg-white">
              <option>All states</option>
            </select>
          </div>
        </header>

        <div className="px-7 py-5 space-y-5">
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Total Bags Tracked", val: "32,480", color: "text-gray-800" },
              { label: "Eligible for Settlement", val: "14,820", color: "text-emerald-600" },
              { label: "In Return Window", val: "8,400", color: "text-amber-600" },
              { label: "On Hold (Returns)", val: "840", color: "text-red-600" },
              { label: "Permanently Excluded", val: "2,180", color: "text-gray-400" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                <div className="text-xs text-gray-400">{s.label}</div>
                <div className={`text-xl font-bold mt-1 ${s.color}`}>{s.val}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-sm font-semibold text-gray-800 mb-1">OMS State Legend</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { state: "★ bag_invoiced", desc: "TCS+TDS accrued", color: "text-blue-700 bg-blue-50 border-blue-200" },
                { state: "★ delivery_done", desc: "Return window starts", color: "text-amber-700 bg-amber-50 border-amber-200" },
                { state: "return_window_expired", desc: "Eligible", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                { state: "return_initiated", desc: "Settlement HOLD", color: "text-red-700 bg-red-50 border-red-200" },
                { state: "★ return_bag_delivered", desc: "Excluded · TCS/TDS reversed", color: "text-red-700 bg-red-50 border-red-200" },
                { state: "cancelled_*", desc: "Excluded", color: "text-gray-500 bg-gray-50 border-gray-200" },
              ].map((l) => (
                <div key={l.state} className={`text-[10px] font-mono border rounded px-2 py-1 flex items-center gap-1.5 ${l.color}`}>
                  <span className="font-semibold">{l.state}</span>
                  <span className="opacity-60">·</span>
                  <span>{l.desc}</span>
                </div>
              ))}
            </div>

            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["bag_id", "Order", "Brand", "Customer", "ESP", "OMS State", "Return Window", "Settlement"].map((h) => (
                      <th key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-left py-2 pr-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bags.map((bag) => (
                    <tr key={bag.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                      <td className="py-2.5 pr-4 font-mono text-xs font-medium text-blue-600">{bag.id}</td>
                      <td className="py-2.5 pr-4 text-gray-500 font-mono text-[11px]">{bag.order}</td>
                      <td className="py-2.5 pr-4 font-medium text-gray-700">{bag.brand}</td>
                      <td className="py-2.5 pr-4 text-gray-500">{bag.customer}</td>
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{bag.esp}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`font-mono text-[10px] border rounded px-2 py-0.5 ${stateColors[bag.state] || "text-gray-500 bg-gray-50 border-gray-200"}`}>
                          {bag.state}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 text-[11px]">{bag.returnWindow}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bag.ec}`}>{bag.eligibility}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
              <div className="text-[11px] text-gray-400">Showing 7 of 32,480 bags · sorted by last updated</div>
              <div className="flex gap-1">
                {["←", "1", "2", "3", "…", "→"].map((p, i) => (
                  <button key={i} className={`w-6 h-6 text-[11px] rounded ${p === "1" ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-100"}`}>{p}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-sm font-semibold text-gray-800 mb-3">Bag Detail · FY-2840192</div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-3">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Bag Info</div>
                {[
                  { k: "bag_id", v: "FY-2840192" },
                  { k: "order_id", v: "ORD-48291" },
                  { k: "Brand", v: "HealWell Cardiac" },
                  { k: "ESP", v: "₹4,200" },
                  { k: "MRP", v: "₹5,000" },
                  { k: "Qty Delivered", v: "1" },
                ].map((r) => (
                  <div key={r.k} className="flex justify-between">
                    <span className="text-[11px] text-gray-400">{r.k}</span>
                    <span className="text-[11px] font-medium text-gray-700">{r.v}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Compliance</div>
                {[
                  { k: "TCS Accrued", v: "₹42.00", note: "@ bag_invoiced" },
                  { k: "TDS Accrued", v: "₹42.00", note: "194-O" },
                  { k: "Invoice Date", v: "5 May 2026" },
                  { k: "Delivery Date", v: "8 May 2026" },
                  { k: "Window Expires", v: "15 May 2026" },
                  { k: "Commission Rate", v: "12% (order date)" },
                ].map((r) => (
                  <div key={r.k} className="flex justify-between">
                    <span className="text-[11px] text-gray-400">{r.k}</span>
                    <span className="text-[11px] font-medium text-gray-700">{r.v}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">OMS Timeline</div>
                <div className="space-y-1.5">
                  {[
                    { state: "placed", date: "4 May 10:02", done: true },
                    { state: "bag_confirmed", date: "4 May 10:05", done: true },
                    { state: "bag_invoiced ★", date: "4 May 10:06", done: true, critical: true },
                    { state: "bag_packed", date: "4 May 14:30", done: true },
                    { state: "in_transit", date: "5 May 09:00", done: true },
                    { state: "delivery_done ★", date: "8 May 11:42", done: true, critical: true },
                    { state: "return_window_expired", date: "15 May 11:42", done: false, future: true },
                  ].map((ev) => (
                    <div key={ev.state} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${ev.done ? (ev.critical ? "bg-amber-500" : "bg-emerald-400") : "bg-gray-200"}`}></div>
                      <div className={`text-[10px] font-mono ${ev.done ? (ev.critical ? "text-amber-700 font-semibold" : "text-gray-600") : "text-gray-300"}`}>{ev.state}</div>
                      <div className="text-[10px] text-gray-300 ml-auto">{ev.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
