export function ApprovalQueue() {
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
            { label: "Approval Queue", icon: "✓", active: true, badge: "3" },
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
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Checker Role</div>
            <div className="text-lg font-semibold text-gray-900 mt-0.5">Approval Queue</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-3 py-1.5 rounded-md font-medium">3 pending review</span>
          </div>
        </header>

        <div className="px-7 py-5 space-y-4">
          {[
            {
              id: "OB-2026-048",
              company: "GreenLeaf Ayurveda Pvt Ltd",
              type: "Private Ltd",
              pan: "AABCG1234F",
              brand: "GreenLeaf Herbs",
              submittedBy: "Anjali Patel",
              submittedAt: "12 May 2026, 2:34 PM",
              kyb: "PASSED",
              docs: 5,
              docsTotal: 5,
              open: true,
            },
            {
              id: "OB-2026-047",
              company: "HealthFirst Distributors LLP",
              type: "LLP",
              pan: "AAFCD5678K",
              brand: "HealthFirst OTC",
              submittedBy: "Vikram Shah",
              submittedAt: "11 May 2026, 10:12 AM",
              kyb: "PASSED",
              docs: 5,
              docsTotal: 5,
              open: false,
            },
            {
              id: "OB-2026-046",
              company: "NatureCure Wellness Pvt Ltd",
              type: "Private Ltd",
              pan: "AABHC9900M",
              brand: "NatureCure Plus",
              submittedBy: "Meera Iyer",
              submittedAt: "10 May 2026, 4:52 PM",
              kyb: "PASSED",
              docs: 4,
              docsTotal: 5,
              open: false,
            },
          ].map((item, idx) => (
            <div key={item.id} className={`bg-white rounded-xl border ${item.open ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-100"} overflow-hidden`}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500">{item.company[0]}</div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{item.company}</div>
                    <div className="text-[11px] text-gray-400">{item.type} · Brand: {item.brand} · Ref {item.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400">Submitted by {item.submittedBy}</div>
                    <div className="text-[10px] text-gray-400">{item.submittedAt}</div>
                  </div>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold border border-emerald-100">KYB {item.kyb}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${item.docs === item.docsTotal ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"}`}>
                    Docs {item.docs}/{item.docsTotal}
                  </span>
                  {idx === 0
                    ? <button className="text-xs text-blue-600 font-medium hover:underline">Collapse ↑</button>
                    : <button className="text-xs text-gray-500 font-medium hover:underline">Review ↓</button>
                  }
                </div>
              </div>

              {item.open && (
                <div className="border-t border-gray-50 px-5 py-4">
                  <div className="grid grid-cols-3 gap-5">
                    <div className="col-span-2 space-y-4">
                      <div>
                        <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Company Details</div>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { k: "Legal Name", v: "GreenLeaf Ayurveda Pvt Ltd" },
                            { k: "PAN", v: "AABCG1234F" },
                            { k: "Master GSTIN", v: "27AABCG1234F1ZK" },
                            { k: "CIN", v: "U24239MH2020PTC123456" },
                            { k: "Bank Account", v: "HDFC ****4521 · HDFC0001234" },
                            { k: "SPOC Email", v: "priya@greenleaf.in" },
                          ].map((r) => (
                            <div key={r.k} className="bg-gray-50 rounded-lg px-3 py-2">
                              <div className="text-[10px] text-gray-400 uppercase">{r.k}</div>
                              <div className="text-xs font-medium text-gray-700 mt-0.5">{r.v}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Uploaded Documents</div>
                        <div className="grid grid-cols-5 gap-2">
                          {[
                            { name: "PAN Copy", ok: true },
                            { name: "GST Certificate", ok: true },
                            { name: "CIN Certificate", ok: true },
                            { name: "Cancelled Cheque", ok: true },
                            { name: "Signed Agreement", ok: true },
                          ].map((doc) => (
                            <div key={doc.name} className={`border rounded-lg px-3 py-2.5 text-center ${doc.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                              <div className={`text-sm ${doc.ok ? "text-emerald-500" : "text-red-400"}`}>{doc.ok ? "✓" : "✗"}</div>
                              <div className="text-[10px] text-gray-600 mt-1 leading-tight">{doc.name}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Commercial Terms</div>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { k: "Commission Type", v: "FLAT_PERCENT" },
                            { k: "Commission Rate", v: "11.00%" },
                            { k: "Return Window", v: "7 days" },
                            { k: "TCS Applicable", v: "Yes" },
                            { k: "Effective From", v: "15 May 2026" },
                            { k: "Agreed By", v: "Anjali Patel" },
                          ].map((r) => (
                            <div key={r.k} className="bg-gray-50 rounded-lg px-3 py-2">
                              <div className="text-[10px] text-gray-400 uppercase">{r.k}</div>
                              <div className="text-xs font-medium text-gray-700 mt-0.5">{r.v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                        <div className="text-xs font-semibold text-emerald-800 mb-3">All checks passed</div>
                        <div className="space-y-2">
                          {[
                            "KYB verified · 4/4",
                            "PAN validated",
                            "GST active",
                            "Bank IFSC valid",
                            "All 5 docs uploaded",
                            "Commission entered",
                          ].map((c) => (
                            <div key={c} className="flex items-center gap-2 text-xs text-emerald-700">
                              <span className="text-emerald-500">✓</span> {c}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Checker Comments</label>
                        <textarea
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 placeholder-gray-300 h-16 resize-none focus:outline-none focus:border-blue-300"
                          placeholder="Optional comments for the Maker…"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button className="border border-red-200 text-red-600 text-xs font-semibold py-2.5 rounded-lg hover:bg-red-50 flex items-center justify-center gap-1.5">
                          ✗ Reject
                        </button>
                        <button className="bg-emerald-600 text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-1.5">
                          ✓ Approve
                        </button>
                      </div>
                      <div className="text-[10px] text-gray-400 text-center">Approval triggers Fynd Sync (Phase 2)</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
