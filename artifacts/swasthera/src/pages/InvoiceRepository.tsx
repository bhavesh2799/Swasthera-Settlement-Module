import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Loader2, FileText, Download, FileArchive, FileSpreadsheet, Receipt, ChevronDown, RefreshCw, Building2,
} from "lucide-react";

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  invoiceDate: string | null;
  orderId: string;
  bagId: string | null;
  brandId: number;
  brandName: string | null;
  customerName: string | null;
  customerState: string | null;
  customerStateCode: string | null;
  warehouseName: string | null;
  warehouseState: string | null;
  productName: string | null;
  hsnCode: string | null;
  quantity: number | null;
  unitPrice: string | null;
  taxableValue: string | null;
  gstType: string | null;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  tcsCollected: string;
  totalInvoiceValue: string;
  paymentMethod: string | null;
  orderStatus: string | null;
  settlementCycle: string | null;
  // ---- Brand commission-invoice snapshot ----
  gmv: string;
  commissionAmount: string;
  gstOnCommission: string;
  tdsDeducted: string;
  netPayable: string;
  sellerGstin: string | null;
}

function inr(v: string | number | null | undefined) {
  const n = typeof v === "number" ? v : parseFloat(v ?? "0") || 0;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

const ORDER_STATUSES = [
  { value: "delivered", label: "Delivered" },
  { value: "returned", label: "Returned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "in_transit", label: "In Transit" },
];

function StatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "delivered":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent">Delivered</Badge>;
    case "returned":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent">Returned</Badge>;
    case "cancelled":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100/80 border-transparent">Cancelled</Badge>;
    case "in_transit":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent">In Transit</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status ?? "—"}</Badge>;
  }
}

export function InvoiceRepository() {
  const [brandIds, setBrandIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cycle, setCycle] = useState("all");
  const [orderStatus, setOrderStatus] = useState("all");
  const [stateCode, setStateCode] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [docKind, setDocKind] = useState<"customer" | "brand">("customer");

  // Unfiltered list — used to populate filter option lists (brands, cycles, states).
  const { data: allRows } = useQuery<InvoiceRow[]>({
    queryKey: ["invoices", "all"],
    queryFn: async () => {
      const r = await fetch("/api/invoices");
      if (!r.ok) throw new Error("failed to load invoices");
      return r.json();
    },
  });

  const buildQuery = () => {
    const p = new URLSearchParams();
    if (brandIds.length) p.set("brandIds", brandIds.join(","));
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (cycle !== "all") p.set("cycle", cycle);
    if (orderStatus !== "all") p.set("orderStatus", orderStatus);
    if (stateCode !== "all") p.set("stateCode", stateCode);
    if (type !== "all") p.set("type", type);
    return p;
  };
  const qs = buildQuery().toString();

  const { data: rows, isLoading, isFetching, refetch } = useQuery<InvoiceRow[]>({
    queryKey: ["invoices", "filtered", qs],
    queryFn: async () => {
      const r = await fetch(`/api/invoices${qs ? `?${qs}` : ""}`);
      if (!r.ok) throw new Error("failed to load invoices");
      return r.json();
    },
  });

  const brandOptions = useMemo(() => {
    const m = new Map<number, string>();
    (allRows ?? []).forEach((r) => m.set(r.brandId, r.brandName ?? `Brand ${r.brandId}`));
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows]);

  const cycleOptions = useMemo(
    () => [...new Set((allRows ?? []).map((r) => r.settlementCycle).filter(Boolean))] as string[],
    [allRows],
  );
  const stateOptions = useMemo(() => {
    const m = new Map<string, string>();
    (allRows ?? []).forEach((r) => {
      if (r.customerStateCode) m.set(r.customerStateCode, r.customerState ?? r.customerStateCode);
    });
    return [...m.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows ?? [];
    return (rows ?? []).filter((r) =>
      [r.invoiceNumber, r.orderId, r.customerName, r.productName, r.brandName]
        .some((f) => (f ?? "").toLowerCase().includes(term)),
    );
  }, [rows, search]);

  const toggleBrand = (id: number) =>
    setBrandIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));

  const totals = useMemo(() => {
    const list = rows ?? [];
    const taxable = list.reduce((s, r) => s + (parseFloat(r.taxableValue ?? "0") || 0), 0);
    const total = list.reduce((s, r) => s + (parseFloat(r.totalInvoiceValue) || 0), 0);
    const credits = list.filter((r) => r.invoiceType === "CREDIT_NOTE").length;
    const gmv = list.reduce((s, r) => s + (parseFloat(r.gmv ?? "0") || 0), 0);
    const commission = list.reduce((s, r) => s + (parseFloat(r.commissionAmount ?? "0") || 0), 0);
    const gstOnComm = list.reduce((s, r) => s + (parseFloat(r.gstOnCommission ?? "0") || 0), 0);
    const netPayable = list.reduce((s, r) => s + (parseFloat(r.netPayable ?? "0") || 0), 0);
    return { count: list.length, taxable, total, credits, gmv, commission, gstOnComm, netPayable };
  }, [rows]);

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someSelected = !allSelected && filtered.some((r) => selectedIds.has(r.id));
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const bulkZipHref = (kind: "customer" | "brand") =>
    `/api/invoices/bulk.zip?ids=${[...selectedIds].join(",")}&docType=${kind}`;
  const bulkCsvHref = () =>
    `/api/invoices/bulk.csv?ids=${[...selectedIds].join(",")}`;

  const resetFilters = () => {
    setBrandIds([]); setDateFrom(""); setDateTo(""); setCycle("all");
    setOrderStatus("all"); setStateCode("all"); setType("all"); setSearch("");
    clearSelection();
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Invoice Repository</h1>
          <p className="text-slate-500 mt-1">
            {docKind === "customer"
              ? "Customer tax invoices & credit notes — filter, download PDFs & export"
              : "Brand commission invoices — marketplace commission charged per order"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <a href={`/api/invoices/export.csv${qs ? `?${qs}` : ""}`}>
            <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </a>
          <a href={`/api/invoices/export.zip?docType=${docKind}${qs ? `&${qs}` : ""}`}>
            <Button size="sm" className={docKind === "brand" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}>
              <FileArchive className="h-4 w-4 mr-2" /> {docKind === "brand" ? "Download Commission ZIP" : "Download Customer ZIP"}
            </Button>
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {docKind === "customer" ? (
          <>
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Invoices (filtered)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-slate-900">{totals.count}</div><p className="text-xs text-slate-500 mt-1">{totals.credits} credit note(s)</p></CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Taxable Value</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-slate-900">{inr(totals.taxable)}</div></CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Total Invoice Value</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-700">{inr(totals.total)}</div></CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Brands</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-slate-900">{brandOptions.length}</div><p className="text-xs text-slate-500 mt-1">in repository</p></CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Commission Invoices</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-slate-900">{totals.count}</div><p className="text-xs text-slate-500 mt-1">{brandOptions.length} brand(s)</p></CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Total GMV</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-slate-900">{inr(totals.gmv)}</div></CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Total Commission</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-blue-700">{inr(totals.commission)}</div><p className="text-xs text-slate-500 mt-1">+ {inr(totals.gstOnComm)} GST</p></CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Net Payable to Brands</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-700">{inr(totals.netPayable)}</div></CardContent>
            </Card>
          </>
        )}
      </div>

      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 px-6 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search invoice #, order, customer, product..."
                className="pl-9 bg-white border-slate-200"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="ghost" size="sm" className="text-slate-500" onClick={resetFilters}>Clear filters</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Brand</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between bg-white border-slate-200 font-normal">
                    <span className="truncate">{brandIds.length ? `${brandIds.length} selected` : "All brands"}</span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="max-h-60 overflow-auto space-y-1">
                    {brandOptions.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                        <Checkbox checked={brandIds.includes(b.id)} onCheckedChange={() => toggleBrand(b.id)} />
                        <span className="text-sm">{b.name}</span>
                      </label>
                    ))}
                    {brandOptions.length === 0 && <p className="text-xs text-slate-400 px-2 py-1">No brands</p>}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Settlement Period</Label>
              <Select value={cycle} onValueChange={setCycle}>
                <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All periods</SelectItem>
                  {cycleOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Order Status</Label>
              <Select value={orderStatus} onValueChange={setOrderStatus}>
                <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {ORDER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Jurisdiction (State)</Label>
              <Select value={stateCode} onValueChange={setStateCode}>
                <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All states</SelectItem>
                  {stateOptions.map((s) => <SelectItem key={s.code} value={s.code}>{s.name} ({s.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Invoices &amp; Credit Notes</SelectItem>
                  <SelectItem value="INVOICE">Tax Invoices</SelectItem>
                  <SelectItem value="CREDIT_NOTE">Credit Notes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Document Type</Label>
              <Select value={docKind} onValueChange={(v) => { setDocKind(v as "customer" | "brand"); clearSelection(); }}>
                <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer Tax Invoice</SelectItem>
                  <SelectItem value="brand">Brand Commission Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">From</Label>
                <Input type="date" className="bg-white border-slate-200" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">To</Label>
                <Input type="date" className="bg-white border-slate-200" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-100">
                <TableHead className="w-10 px-4">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="font-medium text-slate-500 h-10 px-6">Invoice # / Date</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Brand / Order</TableHead>
                {docKind === "customer" ? (
                  <>
                    <TableHead className="font-medium text-slate-500 h-10">Customer / Place of Supply</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Product / HSN</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Taxable</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">GST</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Total</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">GMV</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Commission</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">GST on Comm.</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">TDS</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Net Payable</TableHead>
                  </>
                )}
                <TableHead className="font-medium text-slate-500 h-10">Status</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 px-4 text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Receipt className="h-8 w-8" />
                      <p className="text-sm">No invoices match the current filters.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const isCn = r.invoiceType === "CREDIT_NOTE";
                  const gstAmt = r.gstType === "INTRA"
                    ? (parseFloat(r.cgstAmount) || 0) + (parseFloat(r.sgstAmount) || 0)
                    : (parseFloat(r.igstAmount) || 0);
                  return (
                    <TableRow key={r.id} className={`border-slate-100/50 ${selectedIds.has(r.id) ? "bg-amber-50/40" : ""}`}>
                      <TableCell className="px-4">
                        <Checkbox
                          checked={selectedIds.has(r.id)}
                          onCheckedChange={() => toggleSelect(r.id)}
                          aria-label={`Select ${r.invoiceNumber}`}
                        />
                      </TableCell>
                      <TableCell className="px-6">
                        <div className="flex items-center gap-2">
                          <FileText className={`h-3.5 w-3.5 shrink-0 ${isCn ? "text-red-500" : "text-slate-400"}`} />
                          <div>
                            <div className="font-mono text-sm font-medium text-slate-900">{r.invoiceNumber}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{r.invoiceDate ?? "—"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{r.brandName}</div>
                        <div className="font-mono text-xs text-slate-500 mt-0.5">{r.orderId}</div>
                      </TableCell>
                      {docKind === "customer" ? (
                        <>
                          <TableCell>
                            <div className="text-sm text-slate-800">{r.customerName ?? "—"}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{r.customerState ?? "—"} ({r.customerStateCode ?? "—"})</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-slate-800 truncate max-w-[180px]">{r.productName ?? "—"}</div>
                            <div className="font-mono text-xs text-slate-500 mt-0.5">HSN {r.hsnCode ?? "—"} · Qty {r.quantity ?? "—"}</div>
                          </TableCell>
                          <TableCell className="text-right text-sm text-slate-900">{inr(r.taxableValue)}</TableCell>
                          <TableCell className="text-right text-sm">
                            <div className="text-slate-900">{inr(gstAmt)}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{r.gstType === "INTRA" ? "CGST+SGST" : "IGST"}</div>
                          </TableCell>
                          <TableCell className={`text-right text-sm font-medium ${isCn ? "text-red-600" : "text-slate-900"}`}>{inr(r.totalInvoiceValue)}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-right text-sm text-slate-900">{inr(r.gmv)}</TableCell>
                          <TableCell className={`text-right text-sm font-medium ${isCn ? "text-red-600" : "text-blue-700"}`}>{inr(r.commissionAmount)}</TableCell>
                          <TableCell className="text-right text-sm text-slate-900">{inr(r.gstOnCommission)}</TableCell>
                          <TableCell className="text-right text-sm text-slate-900">{inr(r.tdsDeducted)}</TableCell>
                          <TableCell className={`text-right text-sm font-medium ${isCn ? "text-red-600" : "text-green-700"}`}>{inr(r.netPayable)}</TableCell>
                        </>
                      )}
                      <TableCell><StatusBadge status={r.orderStatus} /></TableCell>
                      <TableCell className="px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {docKind === "customer" ? (
                            <a href={`/api/invoices/${r.id}/pdf`} title="Download customer tax invoice (PDF)">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-amber-700">
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          ) : (
                            <a href={`/api/invoices/${r.id}/brand-pdf`} title="Download brand commission invoice (PDF)">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-700">
                                <Building2 className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {isFetching && !isLoading && (
            <div className="px-6 py-2 text-xs text-slate-400 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</div>
          )}
        </CardContent>
      </Card>

      {/* Floating bulk action bar — appears when rows are selected */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-3 text-sm whitespace-nowrap">
          <span className="text-slate-300 text-xs font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-slate-600" />
          {docKind === "customer" ? (
            <a href={bulkZipHref("customer")} download>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white rounded-full text-xs h-7 px-3">
                <FileArchive className="h-3.5 w-3.5 mr-1.5" /> Customer Invoice ZIP
              </Button>
            </a>
          ) : (
            <a href={bulkZipHref("brand")} download>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs h-7 px-3">
                <Building2 className="h-3.5 w-3.5 mr-1.5" /> Commission Invoice ZIP
              </Button>
            </a>
          )}
          <a href={bulkCsvHref()} download>
            <Button size="sm" variant="outline" className="border-slate-600 text-slate-200 hover:bg-slate-800 rounded-full text-xs h-7 px-3">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
          </a>
          <button onClick={clearSelection} className="ml-1 text-slate-400 hover:text-white text-base leading-none">✕</button>
        </div>
      )}
    </div>
  );
}
