import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListSettlements, useCreateSettlement } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Calculator,
  Loader2,
  ArrowUpRight,
  Ban,
  Layers,
  ArrowRight,
  Building2,
  Landmark,
  AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "COMPUTED":
      return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100/80 border-transparent">Computed</Badge>;
    case "PENDING_APPROVAL":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent">Pending Approval</Badge>;
    case "APPROVED":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent">Approved</Badge>;
    case "PAID":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent">Paid</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
  }
}

interface ActiveBrand {
  id: number;
  brandName: string;
  companyName: string;
  status: string;
}

function generateCycleOptions() {
  const options: { value: string; label: string }[] = [
    { value: "MAY-2026-C1", label: "May 2026 — Cycle 1 (seed)" },
  ];
  const now = new Date();
  for (let i = 2; i >= -1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    options.push({ value: val, label });
  }
  return options;
}

// ---------- Types for Bulk Settlement ----------

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

// ---------- Main Page ----------

export function SettlementList() {
  const [activeTab, setActiveTab] = useState("register");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const cycleOptions = generateCycleOptions();
  const defaultCycle = cycleOptions.find((_o, i) => i === 1)?.value ?? cycleOptions[0]?.value ?? "";

  // ── Settlement Register state ──
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const statusParam = statusFilter === "all" ? undefined : (statusFilter as never);
  const { data: settlements, isLoading, refetch } = useListSettlements({ status: statusParam });
  const createMutation = useCreateSettlement();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCycle, setNewCycle] = useState(defaultCycle);
  const [onboardingId, setOnboardingId] = useState("");

  const { data: computeBrands } = useQuery<ActiveBrand[]>({
    queryKey: ["settlement-brands"],
    queryFn: async () => {
      const r = await fetch("/api/onboardings");
      const rows = await r.json();
      return rows.filter((ob: { status: string }) => ob.status === "APPROVED" || ob.status === "ACTIVE");
    },
    enabled: createDialogOpen,
  });

  const handleCreate = () => {
    if (!onboardingId) { toast({ title: "Select a brand first", variant: "destructive" }); return; }
    createMutation.mutate(
      { data: { cycle: newCycle, onboardingId: parseInt(onboardingId) } },
      {
        onSuccess: () => {
          toast({ title: "Settlement Computed", description: `Cycle ${newCycle} ready for review` });
          setCreateDialogOpen(false);
          refetch();
        },
        onError: (err) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Computation failed";
          toast({ title: "Computation Failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  // ── Bulk Settlement state ──
  const [bulkCycle, setBulkCycle] = useState(cycleOptions[0].value);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data: bulkBrands } = useQuery<OnboardingRow[]>({
    queryKey: ["bulk-onboardings"],
    queryFn: async () => {
      const r = await fetch("/api/onboardings");
      const rows = await r.json();
      return rows.filter((ob: OnboardingRow) => ob.status === "APPROVED" || ob.status === "ACTIVE");
    },
    enabled: activeTab === "bulk",
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
    if (!bulkBrands) return;
    setSelected((prev) =>
      prev.size === bulkBrands.length ? new Set() : new Set(bulkBrands.map((b) => b.id))
    );
    setPreview(null);
  };

  const runPreview = async () => {
    if (selected.size === 0) { toast({ title: "Select at least one brand", variant: "destructive" }); return; }
    setPreviewing(true);
    setPreview(null);
    try {
      const r = await fetch("/api/settlements/bulk/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingIds: Array.from(selected), cycle: bulkCycle }),
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
        body: JSON.stringify({ onboardingIds: Array.from(selected), cycle: bulkCycle }),
      });
      if (!r.ok) throw new Error("Batch failed");
      const data = await r.json();
      toast({
        title: "Batch initiated",
        description: `${data.settlementCount} settlement(s) created across ${selected.size} brand(s).`,
      });
      setPreview(null);
      setSelected(new Set());
      setActiveTab("register");
      refetch();
      navigate("/settlements");
    } catch (err) {
      toast({ title: "Batch failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const hasGroups = preview && preview.settlementCount > 0;

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settlements</h1>
          <p className="text-slate-500 mt-1">Compute deductions, run bulk batches, and review net payables</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="bg-white border border-slate-200 shadow-sm">
          <TabsTrigger value="register" className="gap-2">
            <Calculator className="h-4 w-4" />
            Settlement Register
          </TabsTrigger>
          <TabsTrigger value="bulk" className="gap-2">
            <Layers className="h-4 w-4" />
            Bulk Settlement
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Settlement Register ── */}
        <TabsContent value="register" className="space-y-4 mt-0">
          <div className="flex gap-2 justify-end">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 bg-white shadow-sm border-slate-200">
                <SelectValue placeholder="Filter Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="COMPUTED">Computed</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-sm">
                  <Calculator className="mr-2 h-4 w-4" /> Compute Run
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Run Settlement Computation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Settlement Cycle</label>
                    <Select value={newCycle} onValueChange={setNewCycle}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {cycleOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label} ({o.value})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">Only bags with matching cycle and "Eligible" status will be included.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Brand</label>
                    <Select value={onboardingId} onValueChange={setOnboardingId}>
                      <SelectTrigger><SelectValue placeholder="Select an approved brand…" /></SelectTrigger>
                      <SelectContent>
                        {!computeBrands && <SelectItem value="__loading" disabled>Loading brands…</SelectItem>}
                        {computeBrands?.length === 0 && <SelectItem value="__none" disabled>No approved brands found</SelectItem>}
                        {computeBrands?.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.brandName} — {b.companyName}
                            <span className="ml-1 text-xs text-slate-400">({b.status})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-md bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
                    The engine will pick up all bags for this brand and cycle with eligibility = <strong>Eligible</strong>.
                    Bags still in their return window (In Window) are excluded.
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending || !onboardingId}>
                    {createMutation.isPending
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Computing…</>
                      : "Run Engine"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-100">
                    <TableHead className="font-medium text-slate-500 h-10 px-6">Cycle</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Brand</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Bags</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Gross GMV</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Net Payable</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right px-6"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ) : settlements?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                        No settlements found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    settlements?.map((row) => (
                      <TableRow key={row.id} className="border-slate-100/50 group">
                        <TableCell className="px-6 font-mono text-sm text-slate-700">{row.cycle}</TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900">{row.brandName}</div>
                          <div className="text-xs text-slate-500">{row.companyName}</div>
                          {(row as { companyId?: string }).companyId && (
                            <div className="font-mono text-[10px] text-slate-400 mt-0.5">{(row as { companyId?: string }).companyId}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-slate-600">{row.eligibleBags}</TableCell>
                        <TableCell className="text-right text-slate-600">{formatCurrency(row.grossGmv)}</TableCell>
                        <TableCell className="text-right font-medium text-slate-900">
                          {formatCurrency(row.netPayable)}
                          {((row as { carryForward?: number }).carryForward ?? 0) < 0 && (
                            <div className="text-[10px] font-normal text-amber-700">
                              c/f {formatCurrency((row as { carryForward?: number }).carryForward ?? 0)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <StatusBadge status={row.status} />
                            {(row as { onHold?: boolean }).onHold && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700">
                                <Ban className="h-3 w-3" />On Hold
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary hover:bg-primary/5"
                          >
                            <Link href={`/settlements/${row.id}`}>Review <ArrowUpRight className="ml-1 h-3 w-3" /></Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Bulk Settlement ── */}
        <TabsContent value="bulk" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Step 1: brand + cycle selection */}
            <Card className="lg:col-span-1 shadow-sm border-slate-200/60">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                <CardTitle className="text-base font-semibold text-slate-800">1 · Select brands &amp; period</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Settlement Cycle</label>
                  <Select value={bulkCycle} onValueChange={(v) => { setBulkCycle(v); setPreview(null); }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cycleOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Brands</label>
                  <button onClick={toggleAll} className="text-xs text-indigo-600 hover:underline">
                    {bulkBrands && selected.size === bulkBrands.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {(bulkBrands ?? []).map((b) => (
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
                  {bulkBrands && bulkBrands.length === 0 && (
                    <p className="text-xs text-slate-400 italic">No approved/active brands available.</p>
                  )}
                </div>

                <Button className="w-full" onClick={runPreview} disabled={previewing || selected.size === 0}>
                  {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Preview batch ({selected.size})
                </Button>
              </CardContent>
            </Card>

            {/* Step 2: preview + confirm */}
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
                            <span className="text-sm font-semibold text-slate-800">
                              {brand.brandName ?? `#${brand.onboardingId}`}
                            </span>
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
                                      <span className="text-sm font-medium text-slate-900">
                                        {g.bankName || "Primary account"}
                                      </span>
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
                        {confirming
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <ArrowRight className="mr-2 h-4 w-4" />}
                        Initiate batch ({preview.settlementCount})
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
