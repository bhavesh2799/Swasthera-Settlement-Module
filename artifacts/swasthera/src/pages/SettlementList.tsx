import { useState } from "react";
import { Link } from "wouter";
import { useListSettlements, useCreateSettlement } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Loader2, ArrowUpRight, Ban } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPUTED':
      return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100/80 border-transparent">Computed</Badge>;
    case 'PENDING_APPROVAL':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent">Pending Approval</Badge>;
    case 'APPROVED':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent">Approved</Badge>;
    case 'PAID':
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
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 2; i >= -1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    options.push({ value: val, label });
  }
  return options;
}

export function SettlementList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const cycleOptions = generateCycleOptions();
  const defaultCycle = cycleOptions.find((_o, i) => i === 1)?.value ?? cycleOptions[0]?.value ?? "";

  const statusParam = statusFilter === "all" ? undefined : (statusFilter as never);
  const { data: settlements, isLoading, refetch } = useListSettlements({ status: statusParam });
  const createMutation = useCreateSettlement();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCycle, setNewCycle] = useState(defaultCycle);
  const [onboardingId, setOnboardingId] = useState("");

  // Fetch approved brands dynamically
  const { data: brands } = useQuery<ActiveBrand[]>({
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
    createMutation.mutate({ data: { cycle: newCycle, onboardingId: parseInt(onboardingId) } }, {
      onSuccess: () => {
        toast({ title: "Settlement Computed", description: `Cycle ${newCycle} ready for review` });
        setCreateDialogOpen(false);
        refetch();
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Computation failed";
        toast({ title: "Computation Failed", description: msg, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settlements</h1>
          <p className="text-slate-500 mt-1">Compute deductions and review net payables</p>
        </div>
        
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-white shadow-sm border-slate-200">
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
                      {!brands && <SelectItem value="__loading" disabled>Loading brands…</SelectItem>}
                      {brands?.length === 0 && <SelectItem value="__none" disabled>No approved brands found</SelectItem>}
                      {brands?.map((b) => (
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
                  {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Computing…</> : "Run Engine"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
                        <div className="text-[10px] font-normal text-amber-700">c/f {formatCurrency((row as { carryForward?: number }).carryForward ?? 0)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <StatusBadge status={row.status} />
                        {(row as { onHold?: boolean }).onHold && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700"><Ban className="h-3 w-3" />On Hold</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-6">
                      <Button asChild variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary hover:bg-primary/5">
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
    </div>
  );
}
