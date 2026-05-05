import { useState, useRef } from "react";
import { useListOrders } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, Loader2, Plus, Trash2, RefreshCw, Database, PackageSearch, Pencil, Upload, Download, RefreshCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/contexts/RoleContext";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

function EligibilityBadge({ status }: { status: string }) {
  switch (status) {
    case "eligible":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent">Eligible</Badge>;
    case "in_window":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent">In Window</Badge>;
    case "on_hold":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100/80 border-transparent">On Hold</Badge>;
    case "settled":
      return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100/80 border-transparent">Settled</Badge>;
    case "awaiting_delivery":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent">Awaiting Delivery</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
  }
}

interface ActiveBrand {
  id: number;
  brandName: string;
  commissionRate: number;
  tcsRate: number;
  tdsRate: number;
  stateCode: string | null;
  returnWindowDays: number;
  status: string;
}

interface BagRow {
  id: number;
  bagId: string;
  orderId: string;
  brandName: string;
  brandId: number;
  sku: string;
  esp: number;
  qty: number;
  omsState: string;
  deliveryDate: string;
  windowExpiryDate: string;
  tcsAmount: number;
  tdsAmount: number;
  eligibility: string;
  cycle: string;
}

const OMS_STATES = [
  { value: "delivery_done", label: "Delivery Done" },
  { value: "return_initiated", label: "Return Initiated" },
  { value: "return_delivered", label: "Return Delivered" },
  { value: "invoice_generated", label: "Invoice Generated" },
  { value: "shipped", label: "Shipped" },
  { value: "bag_confirmed", label: "Bag Confirmed" },
];

const ELIGIBILITY_OPTIONS = [
  { value: "eligible", label: "Eligible" },
  { value: "in_window", label: "In Window (Return Period)" },
  { value: "awaiting_delivery", label: "Awaiting Delivery" },
  { value: "on_hold", label: "On Hold" },
];

const currentCycle = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const CSV_TEMPLATE_HEADERS = ["brandId", "cycle", "sku", "esp", "qty", "omsState", "deliveryDate"];
const CSV_TEMPLATE_EXAMPLE = ["1", currentCycle(), "DRESS-RED-M", "2499", "1", "delivery_done", new Date().toISOString().split("T")[0]];

function downloadCsvTemplate() {
  const rows = [CSV_TEMPLATE_HEADERS, CSV_TEMPLATE_EXAMPLE];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "swasthera-bulk-order-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
}

function SimulatorBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <Database className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold text-amber-900">Fynd Data Simulator — Backend Mode</p>
        <p className="text-amber-700 mt-0.5">
          You are simulating the Fynd order feed. Add bag/order entries for any approved brand, set their eligibility, and then switch to Maker role to run a settlement cycle against them.
          Eligibility is <strong>auto-calculated</strong> from each brand's return window — bags within the window are set to <em>In Window</em>, others to <em>Eligible</em>.
        </p>
      </div>
    </div>
  );
}

export function OrdersList() {
  const [search, setSearch] = useState("");
  const [eligibility, setEligibility] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [editingBag, setEditingBag] = useState<BagRow | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const { isBackend } = useRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const eligibilityParam = eligibility === "all" ? undefined : (eligibility as never);

  const { data, isLoading, refetch } = useListOrders({
    search: search || undefined,
    eligibility: eligibilityParam,
  });

  // Fetch APPROVED + ACTIVE brands for the simulator
  const { data: brands } = useQuery<ActiveBrand[]>({
    queryKey: ["active-brands-simulator"],
    queryFn: async () => {
      const r = await fetch("/api/onboardings");
      const rows = await r.json();
      return rows
        .filter((ob: { status: string }) => ob.status === "APPROVED" || ob.status === "ACTIVE")
        .map((ob: { id: number; brandName: string; commissionRate: number; tcsRate: number; tdsRate: number; stateCode: string | null; returnWindowDays: number; status: string }) => ({
          id: ob.id,
          brandName: ob.brandName,
          commissionRate: ob.commissionRate,
          tcsRate: ob.tcsRate,
          tdsRate: ob.tdsRate,
          stateCode: ob.stateCode,
          returnWindowDays: ob.returnWindowDays ?? 7,
          status: ob.status,
        }));
    },
    enabled: isBackend,
  });

  const createBagMutation = useMutation({
    mutationFn: async (payload: object) => {
      const r = await fetch("/api/bags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Create failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Order simulated", description: "Bag entry added to the Fynd feed" });
      queryClient.invalidateQueries({ queryKey: ["listOrders"] });
      setShowCreateDialog(false);
    },
    onError: (err: Error) => toast({ title: "Failed to create bag", description: err.message, variant: "destructive" }),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (bags: object[]) => {
      const r = await fetch("/api/bags/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bags }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Bulk upload failed");
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Bulk upload complete", description: `${data.created} bag(s) added to the Fynd feed` });
      queryClient.invalidateQueries({ queryKey: ["listOrders"] });
      setShowBulkDialog(false);
    },
    onError: (err: Error) => toast({ title: "Bulk upload failed", description: err.message, variant: "destructive" }),
  });

  const updateEligibilityMutation = useMutation({
    mutationFn: async ({ id, eligibility }: { id: number; eligibility: string }) => {
      const r = await fetch(`/api/bags/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eligibility }),
      });
      if (!r.ok) throw new Error("Update failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Eligibility updated" });
      queryClient.invalidateQueries({ queryKey: ["listOrders"] });
      setEditingBag(null);
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteBagMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/bags/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Bag entry removed" });
      queryClient.invalidateQueries({ queryKey: ["listOrders"] });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleRecalculate = async () => {
    setRecalcLoading(true);
    try {
      const r = await fetch("/api/bags/recalculate-eligibility", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast({ title: "Eligibility recalculated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["listOrders"] });
    } catch (err) {
      toast({ title: "Recalculate failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setRecalcLoading(false);
    }
  };

  const totals = data?.totals;
  const bags = data?.bags as BagRow[] | undefined;

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {isBackend ? "Fynd Data Simulator" : "Order Tracking"}
          </h1>
          <p className="text-slate-500 mt-1">
            {isBackend ? "Simulate bag/order entries from the Fynd platform" : "Bag-level register with settlement eligibility"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          {isBackend && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRecalculate}
                disabled={recalcLoading}
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                {recalcLoading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recalculating...</>
                  : <><RefreshCcw className="h-4 w-4 mr-2" /> Recalculate Eligibility</>}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowBulkDialog(true)}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Upload className="h-4 w-4 mr-2" /> Bulk CSV Upload
              </Button>
              <Button size="sm" onClick={() => setShowCreateDialog(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> Simulate Fynd Order
              </Button>
            </>
          )}
        </div>
      </div>

      {isBackend && <SimulatorBanner />}

      {totals && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Eligible Bags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">{totals.eligibleCount}</div>
              <p className="text-xs text-slate-500 mt-1">Ready for settlement</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">In Window / On Hold</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{totals.inWindowCount} / {totals.onHoldCount}</div>
              <p className="text-xs text-slate-500 mt-1">Pending completion</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Aggregate GMV</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(totals.totalEsp)}</div>
              <p className="text-xs text-slate-500 mt-1">Across {totals.totalBags} total bags</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Aggregate TCS / TDS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-slate-900">{formatCurrency(totals.totalTcs)} / {formatCurrency(totals.totalTds)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 px-6 flex flex-row items-center justify-between gap-4 flex-wrap">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search Bag ID, Order ID, SKU..."
              className="pl-9 bg-white border-slate-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-52">
            <Select value={eligibility} onValueChange={setEligibility}>
              <SelectTrigger className="bg-white border-slate-200">
                <SelectValue placeholder="Filter Eligibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="eligible">Eligible</SelectItem>
                <SelectItem value="in_window">In Window</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="awaiting_delivery">Awaiting Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-100">
                <TableHead className="font-medium text-slate-500 h-10 px-6">Bag ID / Order ID</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Brand</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">SKU / OMS State</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Cycle</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right">GMV</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right">TCS / TDS</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Return Window</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 px-6">Eligibility</TableHead>
                {isBackend && <TableHead className="font-medium text-slate-500 h-10 px-4 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={isBackend ? 9 : 8} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : bags?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isBackend ? 9 : 8} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <PackageSearch className="h-8 w-8" />
                      <p className="text-sm">
                        {isBackend ? 'No orders yet. Click "Simulate Fynd Order" or "Bulk CSV Upload" to add one.' : "No orders found."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                bags?.map((row) => {
                  const today = new Date().toISOString().split("T")[0];
                  const windowExpired = row.windowExpiryDate && row.windowExpiryDate < today;
                  return (
                    <TableRow key={row.id} className="border-slate-100/50">
                      <TableCell className="px-6">
                        <div className="font-mono text-sm font-medium text-slate-900">{row.bagId}</div>
                        <div className="font-mono text-xs text-slate-500 mt-0.5">{row.orderId}</div>
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">{row.brandName}</TableCell>
                      <TableCell>
                        <div className="font-mono text-xs text-slate-700">{row.sku}</div>
                        <div className="text-xs font-medium text-slate-500 mt-0.5">{row.omsState}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{row.cycle}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium text-slate-900">{formatCurrency(row.esp * row.qty)}</div>
                        <div className="text-xs text-slate-500">Qty: {row.qty} × {formatCurrency(row.esp)}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <div className="text-slate-700">{formatCurrency(row.tcsAmount)}</div>
                        <div className="text-slate-500">{formatCurrency(row.tdsAmount)}</div>
                      </TableCell>
                      <TableCell>
                        {row.windowExpiryDate ? (
                          <div>
                            <div className={`text-xs font-medium ${windowExpired ? "text-green-700" : "text-amber-700"}`}>
                              {windowExpired ? "Expired" : "Active"}
                            </div>
                            <div className="text-[10px] text-slate-400">{row.windowExpiryDate}</div>
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="px-6">
                        <EligibilityBadge status={row.eligibility} />
                      </TableCell>
                      {isBackend && (
                        <TableCell className="px-4 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-500 hover:text-slate-900"
                              onClick={() => setEditingBag(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => deleteBagMutation.mutate(row.id)}
                              disabled={deleteBagMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Single-order simulator dialog */}
      {isBackend && (
        <CreateBagDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          brands={brands ?? []}
          onSubmit={(payload) => createBagMutation.mutate(payload)}
          isPending={createBagMutation.isPending}
        />
      )}

      {/* Bulk CSV upload dialog */}
      {isBackend && (
        <BulkUploadDialog
          open={showBulkDialog}
          onOpenChange={setShowBulkDialog}
          brands={brands ?? []}
          onSubmit={(bags) => bulkCreateMutation.mutate(bags)}
          isPending={bulkCreateMutation.isPending}
        />
      )}

      {/* Edit eligibility dialog */}
      {editingBag && (
        <EditEligibilityDialog
          bag={editingBag}
          open={!!editingBag}
          onOpenChange={(open) => !open && setEditingBag(null)}
          onSubmit={(eligibility) => updateEligibilityMutation.mutate({ id: editingBag.id, eligibility })}
          isPending={updateEligibilityMutation.isPending}
        />
      )}
    </div>
  );
}

// ---------- Create Bag Dialog ----------

interface CreateBagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: ActiveBrand[];
  onSubmit: (payload: object) => void;
  isPending: boolean;
}

function CreateBagDialog({ open, onOpenChange, brands, onSubmit, isPending }: CreateBagDialogProps) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    brandId: "",
    cycle: currentCycle(),
    sku: "",
    esp: "",
    qty: "1",
    omsState: "delivery_done",
    deliveryDate: today,
    tcsAmount: "",
    tdsAmount: "",
    autoTax: true,
    autoEligibility: true,
  });

  const selectedBrand = brands.find((b) => String(b.id) === form.brandId);

  const set = (key: string, val: string | boolean) => setForm((f) => ({ ...f, [key]: val }));

  const computedTcs = selectedBrand && form.esp
    ? ((parseFloat(form.esp) * (form.qty ? parseInt(form.qty) : 1)) * selectedBrand.tcsRate / 100).toFixed(2)
    : "0.00";
  const computedTds = selectedBrand && form.esp
    ? ((parseFloat(form.esp) * (form.qty ? parseInt(form.qty) : 1)) * selectedBrand.tdsRate / 100).toFixed(2)
    : "0.00";

  // Preview auto-eligibility
  const returnWindowDays = selectedBrand?.returnWindowDays ?? 7;
  const deliveryDt = new Date(form.deliveryDate || today);
  const windowExpiry = new Date(deliveryDt.getTime() + returnWindowDays * 24 * 3600 * 1000).toISOString().split("T")[0];
  const autoEligibilityValue = windowExpiry < today ? "eligible" : "in_window";

  const handleSubmit = () => {
    if (!form.brandId || !form.sku || !form.esp) return;
    onSubmit({
      brandId: parseInt(form.brandId),
      brandName: selectedBrand?.brandName ?? "",
      cycle: form.cycle,
      sku: form.sku,
      esp: parseFloat(form.esp),
      qty: parseInt(form.qty) || 1,
      omsState: form.omsState,
      deliveryDate: form.deliveryDate,
      tcsAmount: form.autoTax ? parseFloat(computedTcs) : parseFloat(form.tcsAmount || "0"),
      tdsAmount: form.autoTax ? parseFloat(computedTds) : parseFloat(form.tdsAmount || "0"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-amber-600" /> Simulate Fynd Order
          </DialogTitle>
          <DialogDescription>
            Add a bag/order entry exactly as Fynd would send it. Eligibility is auto-calculated from the brand's return window.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Brand <span className="text-red-500">*</span></Label>
              <Select value={form.brandId} onValueChange={(v) => set("brandId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select approved brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.length === 0 && <SelectItem value="__none" disabled>No approved brands — approve an onboarding first</SelectItem>}
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.brandName}
                      <span className="text-slate-400 text-xs ml-1">({b.commissionRate}% comm · {b.returnWindowDays}d window)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Settlement Cycle <span className="text-red-500">*</span></Label>
              <Input placeholder="2026-05" value={form.cycle} onChange={(e) => set("cycle", e.target.value)} />
              <p className="text-[10px] text-slate-400">Format: YYYY-MM</p>
            </div>

            <div className="space-y-1.5">
              <Label>SKU / Item Code <span className="text-red-500">*</span></Label>
              <Input placeholder="DRESS-RED-M" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Effective Selling Price (₹) <span className="text-red-500">*</span></Label>
              <Input type="number" min="0" placeholder="2499" value={form.esp} onChange={(e) => set("esp", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min="1" value={form.qty} onChange={(e) => set("qty", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>OMS State</Label>
              <Select value={form.omsState} onValueChange={(v) => set("omsState", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OMS_STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Date</Label>
              <Input type="date" value={form.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} />
            </div>
          </div>

          {/* Auto eligibility preview */}
          {selectedBrand && (
            <div className="rounded-md bg-green-50 border border-green-100 px-3 py-2 text-xs text-green-700 flex items-center justify-between">
              <span>
                Auto eligibility: return window expires <strong>{windowExpiry}</strong> →
                <strong> {autoEligibilityValue === "eligible" ? "Eligible" : "In Window"}</strong>
              </span>
              <span className="text-green-500 text-[10px]">{returnWindowDays}d window</span>
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-600 text-xs uppercase tracking-wide">Tax Simulation</Label>
              <button className="text-xs text-primary underline" onClick={() => set("autoTax", !form.autoTax)}>
                {form.autoTax ? "Enter manually" : "Auto-calculate"}
              </button>
            </div>
            {form.autoTax ? (
              <div className="bg-slate-50 rounded-md p-3 text-sm text-slate-600 space-y-1">
                {selectedBrand ? (
                  <>
                    <div className="flex justify-between">
                      <span>TCS ({selectedBrand.tcsRate}% of GMV)</span>
                      <span className="font-mono">₹{computedTcs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>TDS ({selectedBrand.tdsRate}% of GMV)</span>
                      <span className="font-mono">₹{computedTds}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-400 text-xs">Select a brand to see calculated tax amounts</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>TCS Amount (₹)</Label>
                  <Input type="number" min="0" placeholder="0.00" value={form.tcsAmount} onChange={(e) => set("tcsAmount", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>TDS Amount (₹)</Label>
                  <Input type="number" min="0" placeholder="0.00" value={form.tdsAmount} onChange={(e) => set("tdsAmount", e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !form.brandId || !form.sku || !form.esp}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add to Fynd Feed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Bulk CSV Upload Dialog ----------

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: ActiveBrand[];
  onSubmit: (bags: object[]) => void;
  isPending: boolean;
}

function BulkUploadDialog({ open, onOpenChange, brands, onSubmit, isPending }: BulkUploadDialogProps) {
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const brandMap = new Map(brands.map((b) => [String(b.id), b]));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCsv(ev.target?.result as string);
        if (rows.length === 0) { setParseError("No data rows found. Please check the template format."); return; }
        setParseError("");
        setParsedRows(rows);
      } catch {
        setParseError("Failed to parse CSV. Please use the provided template.");
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = () => {
    const bags = parsedRows.map((row) => {
      const brand = brandMap.get(row.brandId);
      return {
        brandId: parseInt(row.brandId),
        brandName: brand?.brandName ?? "",
        cycle: row.cycle || currentCycle(),
        sku: row.sku,
        esp: parseFloat(row.esp) || 0,
        qty: parseInt(row.qty) || 1,
        omsState: row.omsState || "delivery_done",
        deliveryDate: row.deliveryDate || new Date().toISOString().split("T")[0],
      };
    }).filter((b) => b.brandId && b.sku && b.esp > 0);
    if (bags.length === 0) return;
    onSubmit(bags);
  };

  const reset = () => {
    setParsedRows([]);
    setParseError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-blue-600" /> Bulk CSV Order Upload
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to add multiple bag entries at once. Eligibility is auto-calculated from each brand's return window.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold">Required CSV columns:</p>
            <p className="font-mono">{CSV_TEMPLATE_HEADERS.join(", ")}</p>
            <p className="text-blue-500">brandId must match an APPROVED brand ID shown in the simulator</p>
          </div>

          <Button variant="outline" size="sm" onClick={downloadCsvTemplate} className="w-full border-blue-200 text-blue-700 hover:bg-blue-50">
            <Download className="h-4 w-4 mr-2" /> Download CSV Template
          </Button>

          {brands.length > 0 && (
            <div className="rounded-md bg-slate-50 border border-slate-100 p-2 text-xs text-slate-600">
              <p className="font-medium mb-1">Available brand IDs:</p>
              <div className="space-y-0.5">
                {brands.map((b) => (
                  <div key={b.id} className="flex justify-between">
                    <span className="font-mono font-semibold">{b.id}</span>
                    <span>{b.brandName} ({b.returnWindowDays}d window)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Select CSV File</Label>
            <Input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="cursor-pointer" />
          </div>

          {parseError && (
            <div className="rounded-md bg-red-50 border border-red-100 p-2 text-xs text-red-700">{parseError}</div>
          )}

          {parsedRows.length > 0 && (
            <div className="rounded-md bg-green-50 border border-green-100 p-3 text-sm text-green-700">
              <p className="font-semibold">{parsedRows.length} row(s) ready to upload</p>
              <p className="text-xs mt-1 text-green-600">Preview: {parsedRows.slice(0, 2).map((r) => `${r.brandId}/${r.sku}`).join(", ")}{parsedRows.length > 2 ? ` +${parsedRows.length - 2} more` : ""}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || parsedRows.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload {parsedRows.length > 0 ? `${parsedRows.length} Bags` : "Bags"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit Eligibility Dialog ----------

interface EditEligibilityDialogProps {
  bag: BagRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (eligibility: string) => void;
  isPending: boolean;
}

function EditEligibilityDialog({ bag, open, onOpenChange, onSubmit, isPending }: EditEligibilityDialogProps) {
  const [eligibility, setEligibility] = useState(bag.eligibility);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Eligibility</DialogTitle>
          <DialogDescription>
            Update the settlement eligibility for bag <span className="font-mono font-semibold">{bag.bagId}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="text-sm text-slate-600 bg-slate-50 rounded p-2">
            <div><span className="font-medium">Brand:</span> {bag.brandName}</div>
            <div><span className="font-medium">SKU:</span> {bag.sku}</div>
            <div><span className="font-medium">GMV:</span> {formatCurrency(bag.esp * bag.qty)}</div>
            {bag.windowExpiryDate && (
              <div><span className="font-medium">Window expiry:</span> {bag.windowExpiryDate}</div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>New Eligibility Status</Label>
            <Select value={eligibility} onValueChange={setEligibility}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ELIGIBILITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                <SelectItem value="settled">Settled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(eligibility)} disabled={isPending || eligibility === bag.eligibility}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
