import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Layers, Loader2, ArrowRight, Building2, Landmark, AlertTriangle } from "lucide-react";

interface OnboardingRow {
  id: number;
  companyName: string;
  brandName: string;
  status: string;
}

interface GroupSummary {
  bankAccountId: number | null;
  bankName: string;
  accountMasked: string;
  ifsc: string;
  isPrimaryDestination: boolean;
  stateCodes: string[];
  stateNames: string[];
  eligibleBags: number;
  grossGmv: number;
  netPayable: number;
  carryForward: number;
}

interface BrandPreview {
  onboardingId: number;
  companyName?: string;
  brandName?: string;
  eligibleBags?: number;
  warning?: string;
  error?: string;
  groups: GroupSummary[];
}

interface PreviewResponse {
  cycle: string;
  brandCount: number;
  settlementCount: number;
  totalNetPayable: number;
  brands: BrandPreview[];
}

function generateCycleOptions() {
  const options: { value: string; label: string }[] = [{ value: "MAY-2026-C1", label: "May 2026 — Cycle 1 (seed)" }];
  const now = new Date();
  for (let i = 2; i >= -1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    options.push({ value: val, label });
  }
  return options;
}

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function BulkSettlement() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const cycleOptions = generateCycleOptions();
  const [cycle, setCycle] = useState(cycleOptions[0].value);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data: brands } = useQuery<OnboardingRow[]>({
    queryKey: ["bulk-onboardings"],
    queryFn: async () => {
      const r = await fetch("/api/onboardings");
      const rows = await r.json();
      return rows.filter((ob: OnboardingRow) => ob.status === "APPROVED" || ob.status === "ACTIVE");
    },
  });

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
  };

  const toggleAll = () => {
    if (!brands) return;
    setSelected((prev) => (prev.size === brands.length ? new Set() : new Set(brands.map((b) => b.id))));
    setPreview(null);
  };

  const runPreview = async () => {
    if (selected.size === 0) {
      toast({ title: "Select at least one brand", variant: "destructive" });
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const r = await fetch("/api/settlements/bulk/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingIds: Array.from(selected), cycle }),
      });
      if (!r.ok) throw new Error("Preview failed");
      setPreview(await r.json());
    } catch (err) {
      toast({ title: "Preview failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const confirmBatch = async () => {
    setConfirming(true);
    try {
      const r = await fetch("/api/settlements/bulk/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingIds: Array.from(selected), cycle }),
      });
      if (!r.ok) throw new Error("Batch failed");
      const data = await r.json();
      toast({
        title: "Batch initiated",
        description: `${data.settlementCount} settlement(s) created across ${selected.size} brand(s).`,
      });
      navigate("/settlements");
    } catch (err) {
      toast({ title: "Batch failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const hasGroups = preview && preview.settlementCount > 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-600 p-2">
          <Layers className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bulk Settlement</h1>
          <p className="text-sm text-slate-500">
            Route each brand's eligible orders by jurisdiction and settle into the mapped bank accounts.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selection */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200/60">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">1 · Select brands & period</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Settlement Cycle</label>
              <Select value={cycle} onValueChange={(v) => { setCycle(v); setPreview(null); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cycleOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Brands</label>
              <button onClick={toggleAll} className="text-xs text-indigo-600 hover:underline">
                {brands && selected.size === brands.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {(brands ?? []).map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50"
                >
                  <Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggle(b.id)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{b.brandName}</p>
                    <p className="text-xs text-slate-500 truncate">{b.companyName}</p>
                  </div>
                </label>
              ))}
              {brands && brands.length === 0 && (
                <p className="text-xs text-slate-400 italic">No approved/active brands available.</p>
              )}
            </div>

            <Button className="w-full" onClick={runPreview} disabled={previewing || selected.size === 0}>
              {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Preview batch ({selected.size})
            </Button>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200/60">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">2 · Pre-confirmation summary</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {!preview ? (
              <div className="text-center py-16 text-slate-400">
                <Layers className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select brands and run a preview to see routed settlements.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Brands</p>
                    <p className="text-lg font-bold text-slate-900">{preview.brandCount}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Settlements</p>
                    <p className="text-lg font-bold text-slate-900">{preview.settlementCount}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                    <p className="text-xs text-emerald-700">Total Net Payable</p>
                    <p className="text-lg font-bold text-emerald-800">{inr(preview.totalNetPayable)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {preview.brands.map((brand) => (
                    <div key={brand.onboardingId} className="rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-4 py-2">
                        <Building2 className="h-4 w-4 text-slate-500" />
                        <span className="text-sm font-semibold text-slate-800">{brand.brandName ?? `#${brand.onboardingId}`}</span>
                        {brand.companyName && <span className="text-xs text-slate-400">· {brand.companyName}</span>}
                        <span className="ml-auto text-xs text-slate-500">{brand.eligibleBags ?? 0} eligible bags</span>
                      </div>
                      {brand.error || brand.warning ? (
                        <div className="flex items-center gap-2 px-4 py-3 text-xs text-amber-700 bg-amber-50">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {brand.error ?? brand.warning}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {brand.groups.map((g, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3">
                              <Landmark className="h-4 w-4 text-slate-400 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-slate-900">{g.bankName || "Primary account"}</span>
                                  <span className="font-mono text-xs text-slate-500">{g.accountMasked}</span>
                                  {g.isPrimaryDestination && (
                                    <Badge variant="outline" className="text-[10px]">Primary / fallback</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {g.stateNames.length > 0 ? g.stateNames.join(", ") : "Unmapped states"} · {g.eligibleBags} bags
                                  {g.carryForward < 0 && (
                                    <span className="text-amber-600"> · carry-forward {inr(g.carryForward)}</span>
                                  )}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs text-slate-400">Net payable</p>
                                <p className="text-sm font-semibold text-slate-900">{inr(g.netPayable)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <Button variant="outline" onClick={() => setPreview(null)} disabled={confirming}>Cancel</Button>
                  <Button onClick={confirmBatch} disabled={confirming || !hasGroups}>
                    {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                    Initiate batch ({preview.settlementCount})
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
