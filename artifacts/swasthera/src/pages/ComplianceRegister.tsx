import React, { useState } from "react";
import {
  useGetTcsTdsSummary,
  useGetComplianceCalendar,
  useListOnboardings,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Calendar, CheckCircle2, AlertCircle, RotateCcw, TrendingDown, CreditCard, Layers, BookOpen, Download, AlertTriangle, Info, Receipt, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmt(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "Filed":
    case "Deposited":
    case "Paid":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent">{status}</Badge>;
    case "Pending":
    case "Accrued":
    case "Upcoming":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent">{status}</Badge>;
    case "Overdue":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100/80 border-transparent">{status}</Badge>;
    case "Future":
      return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-transparent">{status}</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
  }
}

// Bag-level row inside an expandable TCS group
interface TcsBag {
  bagId: string;
  orderId: string;
  esp: number;
  tcsAmount: number;
  gstType: string;
  stateCode: string;
  customerStateCode: string;
  omsState: string;
}

// Brand + state group — one row per brand × state per month
interface TcsRecord {
  brandId: number;
  brandName: string;
  companyName: string;
  stateCode: string;
  stateName: string;
  stateGstin: string;
  bagCount: number;
  igstBagCount: number;
  intrastateBagCount: number;
  grossGmv: number;
  tcsRate: number;
  totalTcsAmount: number;
  igstTcsAmount: number;
  intrastateTcsAmount: number;
  tcsRecordId: number | null;
  status: string;
  paymentRef?: string | null;
  paymentDate?: string | null;
  bags: TcsBag[];
}

// Bag-level row inside an expandable TDS group
interface TdsBag {
  bagId: string;
  orderId: string;
  esp: number;
  tdsAmount: number;
  omsState: string;
  reversalDeadline?: string | null;
  reversalDeadlinePast?: boolean;
}

interface TdsReversal {
  tdsAmount: number;
  bagId?: string | null;
  reason?: string | null;
}

// Brand group — one row per brand per month with reversal aggregation
interface TdsRecord {
  brandId: number;
  tdsRecordId: number | null;
  brandName: string;
  companyName: string;
  tan: string;
  bagCount: number;
  grossPayment: number;
  tdsRate: number;
  tdsAmount: number;
  tdsReversed: number;
  reversalCount: number;
  netTds: number;
  status: string;
  depositRef?: string | null;
  depositDate?: string | null;
  bags: TdsBag[];
  reversals: TdsReversal[];
}

// GST Register
interface GstEntry {
  bagId: string;
  orderId: string;
  brandId: number;
  brandName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  customerName: string;
  customerState: string;
  gstType: string;
  sellerGstin: string;
  taxableValue: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalGstAmount: number;
  totalInvoiceValue: number;
  eligibility: string;
  hasCreditNote: boolean;
  creditNoteNumber: string | null;
  creditNoteValue: number | null;
  cycle: string;
}

interface GstSummary {
  totalTaxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalGst: number;
  totalInvoiceValue: number;
  bagCount: number;
}

interface GstRegisterData {
  summary: GstSummary;
  entries: GstEntry[];
}

interface OrderBreakdownRow {
  bagId: string;
  orderId: string;
  brandName: string;
  sku: string;
  esp: number;
  deliveryDate: string;
  windowExpiryDate: string;
  tcsAmount: number;
  tdsAmount: number;
  eligibility: string;
  omsState: string;
  isReturned: boolean;
  cycle: string;
  reversalStatus?: string | null;
  reversalDeadline?: string;
  reversalDeadlinePast?: boolean;
}

interface LedgerEntry {
  date: string;
  type: "SETTLEMENT" | "PAYOUT";
  cycle: string;
  ref: string;
  description: string;
  amount: number;
  runningBalance: number;
}

interface LedgerResponse {
  brand: { onboardingId: number; companyName: string; brandName: string } | null;
  entries: LedgerEntry[];
  closingBalance: number;
}

export function ComplianceRegister() {
  const [month, setMonth] = useState("May");
  const [year, setYear] = useState("2026");
  const [ledgerBrandId, setLedgerBrandId] = useState<string>("");
  const [ledgerType, setLedgerType] = useState<string>("ALL");
  const [ledgerFrom, setLedgerFrom] = useState<string>("");
  const [ledgerTo, setLedgerTo] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // TDS/TCS reversal dialog (compliance-page manual entry for already-cancelled/returned bags)
  const [showReversalDialog, setShowReversalDialog] = useState(false);
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalForm, setReversalForm] = useState({ bagId: "", reason: "" });

  // Mark paid / deposited dialogs
  const [tcsMarkDialog, setTcsMarkDialog] = useState<TcsRecord | null>(null);
  const [tdsMarkDialog, setTdsMarkDialog] = useState<TdsRecord | null>(null);
  const [markForm, setMarkForm] = useState({ ref: "", date: new Date().toISOString().split("T")[0] });
  const [markLoading, setMarkLoading] = useState(false);

  // Expandable drill-down state
  const [expandedTcs, setExpandedTcs] = useState<Set<string>>(new Set());
  const [expandedTds, setExpandedTds] = useState<Set<number>>(new Set());
  const [gstBrandFilter, setGstBrandFilter] = useState<string>("all");

  const toggleTcs = (key: string) => setExpandedTcs((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleTds = (id: number) => setExpandedTds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const params = { month, year: parseInt(year) };
  const summaryKey = ["/api/compliance/tcs-tds", params];
  const tcsKey = ["/api/compliance/tcs-records", params];
  const tdsKey = ["/api/compliance/tds-records", params];
  const breakdownKey = ["/api/compliance/order-breakdown", params];

  const { data: summary, isLoading: isLoadingSummary } = useGetTcsTdsSummary(params);

  const { data: tcsRecordsRaw, isLoading: isLoadingTcs } = useQuery<TcsRecord[]>({
    queryKey: tcsKey,
    queryFn: async () => {
      const r = await fetch(`/api/compliance/tcs-records?month=${month}&year=${year}`);
      if (!r.ok) throw new Error("Failed to load TCS records");
      return r.json();
    },
  });

  const { data: tdsRecordsRaw, isLoading: isLoadingTds } = useQuery<TdsRecord[]>({
    queryKey: tdsKey,
    queryFn: async () => {
      const r = await fetch(`/api/compliance/tds-records?month=${month}&year=${year}`);
      if (!r.ok) throw new Error("Failed to load TDS records");
      return r.json();
    },
  });

  const { data: calendar, isLoading: isLoadingCalendar } = useGetComplianceCalendar();

  const { data: gstRegister, isLoading: isLoadingGst } = useQuery<GstRegisterData>({
    queryKey: ["/api/compliance/gst-register", month, year, gstBrandFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ month, year });
      if (gstBrandFilter !== "all") p.set("brandId", gstBrandFilter);
      const r = await fetch(`/api/compliance/gst-register?${p}`);
      if (!r.ok) throw new Error("Failed to load GST register");
      return r.json();
    },
  });

  const { data: orderBreakdown, isLoading: isLoadingBreakdown } = useQuery<OrderBreakdownRow[]>({
    queryKey: breakdownKey,
    queryFn: async () => {
      const r = await fetch(`/api/compliance/order-breakdown?month=${month}&year=${year}`);
      return r.json();
    },
  });

  // Only show ACTIVE / APPROVED brands in the ledger dropdown
  const { data: allOnboardings } = useListOnboardings();
  const activeOnboardings = (allOnboardings ?? []).filter(
    (o) => o.status === "ACTIVE" || o.status === "APPROVED",
  );

  const ledgerQuery = new URLSearchParams();
  if (ledgerType !== "ALL") ledgerQuery.set("type", ledgerType);
  if (ledgerFrom) ledgerQuery.set("from", ledgerFrom);
  if (ledgerTo) ledgerQuery.set("to", ledgerTo);
  const ledgerQs = ledgerQuery.toString();

  const { data: ledger, isLoading: isLoadingLedger } = useQuery<LedgerResponse>({
    queryKey: ["/api/compliance/ledger", ledgerBrandId, ledgerType, ledgerFrom, ledgerTo],
    queryFn: async () => {
      const r = await fetch(`/api/compliance/ledger/${ledgerBrandId}${ledgerQs ? `?${ledgerQs}` : ""}`);
      if (!r.ok) throw new Error("Failed to load ledger");
      return r.json();
    },
    enabled: !!ledgerBrandId,
  });

  const downloadLedger = () => {
    if (!ledgerBrandId) return;
    window.open(`/api/compliance/ledger/${ledgerBrandId}/export${ledgerQs ? `?${ledgerQs}` : ""}`, "_blank");
  };

  // Handle 422 carry-forward gracefully (not as an error)
  const handleReversal = async () => {
    if (!reversalForm.bagId.trim() || !reversalForm.reason.trim()) return;
    setReversalLoading(true);
    try {
      const res = await fetch("/api/compliance/reversal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bagId: reversalForm.bagId.trim(),
          reason: reversalForm.reason.trim(),
          month,
          year: parseInt(year),
        }),
      });
      const data = await res.json();

      if (res.status === 422 && !data.reversalEligible) {
        // Deposit deadline passed — carry-forward recorded; show info, not error
        toast({
          title: "Carry-Forward Recorded",
          description: data.message,
        });
        setShowReversalDialog(false);
        setReversalForm({ bagId: "", reason: "" });
        queryClient.invalidateQueries({ queryKey: summaryKey });
        queryClient.invalidateQueries({ queryKey: tdsKey });
        queryClient.invalidateQueries({ queryKey: breakdownKey });
        return;
      }

      if (!res.ok) throw new Error(data.error ?? "Reversal failed");

      toast({ title: "TDS/TCS Reversal logged", description: data.message });
      setShowReversalDialog(false);
      setReversalForm({ bagId: "", reason: "" });
      queryClient.invalidateQueries({ queryKey: summaryKey });
      queryClient.invalidateQueries({ queryKey: tdsKey });
      queryClient.invalidateQueries({ queryKey: breakdownKey });
    } catch (err: unknown) {
      toast({ title: "Reversal failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setReversalLoading(false);
    }
  };

  const handleMarkTcsPaid = async () => {
    if (!tcsMarkDialog) return;
    if (!tcsMarkDialog.tcsRecordId) {
      toast({ title: "No TCS record to update", description: "A TCS record row must exist before marking paid.", variant: "destructive" });
      return;
    }
    setMarkLoading(true);
    try {
      const res = await fetch(`/api/compliance/tcs-records/${tcsMarkDialog.tcsRecordId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Paid", paymentRef: markForm.ref, paymentDate: markForm.date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "TCS marked as Paid", description: markForm.ref ? `Ref: ${markForm.ref}` : undefined });
      setTcsMarkDialog(null);
      setMarkForm({ ref: "", date: new Date().toISOString().split("T")[0] });
      queryClient.invalidateQueries({ queryKey: tcsKey });
      queryClient.invalidateQueries({ queryKey: summaryKey });
    } catch (err: unknown) {
      toast({ title: "Update failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setMarkLoading(false);
    }
  };

  const handleMarkTdsDeposited = async () => {
    if (!tdsMarkDialog) return;
    if (!tdsMarkDialog.tdsRecordId) {
      toast({ title: "No TDS record to update", description: "A TDS deposit record must exist before marking deposited.", variant: "destructive" });
      return;
    }
    setMarkLoading(true);
    try {
      const res = await fetch(`/api/compliance/tds-records/${tdsMarkDialog.tdsRecordId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Deposited", depositRef: markForm.ref, depositDate: markForm.date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "TDS marked as Deposited", description: markForm.ref ? `Ref: ${markForm.ref}` : undefined });
      setTdsMarkDialog(null);
      setMarkForm({ ref: "", date: new Date().toISOString().split("T")[0] });
      queryClient.invalidateQueries({ queryKey: tdsKey });
      queryClient.invalidateQueries({ queryKey: summaryKey });
    } catch (err: unknown) {
      toast({ title: "Update failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setMarkLoading(false);
    }
  };

  const tcsEntries = (tcsRecordsRaw ?? []) as TcsRecord[];
  const tdsEntries = (tdsRecordsRaw ?? []) as TdsRecord[];
  const totalTdsReversals = tdsEntries.reduce((s, r) => s + r.reversalCount, 0);
  const gstEntries = gstRegister?.entries ?? [];
  const gstSummary = gstRegister?.summary;
  const breakdownRows = (orderBreakdown ?? []) as OrderBreakdownRow[];
  const returnedBags = breakdownRows.filter((r) => r.isReturned);

  const s = summary as (typeof summary & {
    tcsReversed?: number; tcsNet?: number;
    tdsReversed?: number; tdsNet?: number; tdsDeposited?: number;
  }) | undefined;

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Compliance & Tax</h1>
          <p className="text-slate-500 mt-1">TCS/TDS registers at brand & bank level, order breakdown, and GSTR-8 filing status</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32 bg-white"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 bg-white"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setShowReversalDialog(true)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Log TDS/TCS Reversal
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoadingSummary ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : s ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">TCS Accrued (Section 52)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{fmt(s.tcsAccrued)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Paid: <span className={`font-medium ${s.tcsPaid < s.tcsAccrued ? "text-amber-700" : "text-green-700"}`}>{fmt(s.tcsPaid)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Due: <span className="font-medium text-slate-700">{new Date(s.tcsPaymentDue).toLocaleDateString()}</span></div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">TCS Liability</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{fmt(Math.max(0, s.tcsAccrued - s.tcsPaid))}</div>
              <div className="text-xs text-slate-500 mt-1">
                <span className={`font-medium ${s.tcsAccrued > s.tcsPaid ? "text-amber-700" : "text-green-700"}`}>
                  {s.tcsAccrued > s.tcsPaid ? "Unpaid — remit to govt" : "Fully paid"}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 italic">Reversible via GSTR-8 amendment within deadline</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">TDS Deducted (Section 194-O)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{fmt(s.tdsDeducted)}</div>
              {(s.tdsReversed ?? 0) > 0 && (
                <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                  <TrendingDown className="h-3 w-3" />
                  Reversed: −{fmt(s.tdsReversed ?? 0)}
                </div>
              )}
              {(s.tdsNet ?? 0) !== s.tdsDeducted && (
                <div className="text-sm font-semibold text-green-700 mt-0.5">Net: {fmt(s.tdsNet ?? s.tdsDeducted)}</div>
              )}
              <div className="text-xs text-slate-500 mt-0.5">Deposit Due: <span className="font-medium text-slate-700">{new Date(s.tdsDepositDue).toLocaleDateString()}</span></div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">GSTR-8 Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <StatusBadge status={s.gstr8Status} />
                {s.gstr8Status === "Filed" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-2">Due: {new Date(s.gstr8DueDate).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Tabs defaultValue="tcs" className="w-full">
        <TabsList className="bg-slate-200/50 mb-4">
          <TabsTrigger value="tcs" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            TCS Register
          </TabsTrigger>
          <TabsTrigger value="tds" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            TDS Register
            {totalTdsReversals > 0 && (
              <Badge className="ml-2 text-[10px] h-4 bg-amber-100 text-amber-700 border-transparent hover:bg-amber-100">
                {totalTdsReversals} rev
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="gst" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Receipt className="mr-1.5 h-3.5 w-3.5" />
            GST Register
          </TabsTrigger>
          <TabsTrigger value="breakdown" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            Order Breakdown
            {returnedBags.length > 0 && (
              <Badge className="ml-2 text-[10px] h-4 bg-red-100 text-red-700 border-transparent hover:bg-red-100">
                {returnedBags.length} returned
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ledger" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <BookOpen className="mr-1.5 h-4 w-4" /> Brand Ledger
          </TabsTrigger>
          <TabsTrigger value="calendar" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Compliance Calendar
          </TabsTrigger>
        </TabsList>

        {/* TCS Register — brand + state groups with per-bag drill-down */}
        <TabsContent value="tcs" className="m-0">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <div className="px-6 py-3 border-b border-slate-100 bg-blue-50/40 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                TCS is remitted directly to the government by the marketplace operator under Section 52 GST.
                Grouped by brand × state. IGST applies to inter-state bags; intrastate for same-state delivery.
              </p>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-100">
                    <TableHead className="w-8 px-3" />
                    <TableHead className="font-medium text-slate-500 h-10 px-4">Brand / State</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Total Bags</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">IGST Bags</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Intra Bags</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Gross GMV</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">IGST TCS</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Intra TCS</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Total TCS</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingTcs ? (
                    <TableRow><TableCell colSpan={11} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : tcsEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="h-24 text-center text-slate-400 text-sm">No TCS records for {month} {year}</TableCell></TableRow>
                  ) : tcsEntries.map((row) => {
                    const key = `${row.brandId}-${row.stateCode}`;
                    const isOpen = expandedTcs.has(key);
                    return (
                      <React.Fragment key={key}>
                        <TableRow className="border-slate-100/50 cursor-pointer hover:bg-slate-50/60" onClick={() => toggleTcs(key)}>
                          <TableCell className="px-3 text-slate-400">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="px-4">
                            <div className="font-medium text-slate-900">{row.brandName}</div>
                            <div className="text-xs text-slate-500">{row.stateName} <span className="font-mono text-slate-400">({row.stateCode})</span></div>
                            {row.paymentRef && (
                              <div className="text-[10px] text-green-600 mt-0.5">Ref: {row.paymentRef} · {row.paymentDate}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm font-medium text-slate-700">{row.bagCount}</TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs font-medium bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{row.igstBagCount}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs font-medium bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">{row.intrastateBagCount}</span>
                          </TableCell>
                          <TableCell className="text-right text-slate-600 text-sm">{fmt(row.grossGmv)}</TableCell>
                          <TableCell className="text-right text-purple-700 text-sm font-medium">{fmt(row.igstTcsAmount)}</TableCell>
                          <TableCell className="text-right text-sky-700 text-sm font-medium">{fmt(row.intrastateTcsAmount)}</TableCell>
                          <TableCell className="text-right">
                            <span className="font-semibold text-slate-900">{fmt(row.totalTcsAmount)}</span>
                            <span className="text-xs text-slate-400 font-normal ml-1">@{row.tcsRate}%</span>
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}><StatusBadge status={row.status} /></TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            {row.status === "Accrued" ? (
                              <Button size="sm" variant="outline" className="h-7 text-[11px] border-green-300 text-green-700 hover:bg-green-50"
                                onClick={() => { setTcsMarkDialog(row); setMarkForm({ ref: "", date: new Date().toISOString().split("T")[0] }); }}>
                                <CreditCard className="h-3 w-3 mr-1" /> Mark Paid
                              </Button>
                            ) : <span className="text-xs text-green-600">✓ {row.status}</span>}
                          </TableCell>
                        </TableRow>
                        {isOpen && row.bags?.map((bag) => (
                          <TableRow key={bag.bagId} className="bg-slate-50/50 border-slate-100/30">
                            <TableCell />
                            <TableCell colSpan={2} className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-slate-700">{bag.bagId}</span>
                                <Badge className={`text-[10px] h-4 border-transparent ${bag.gstType === "INTER" ? "bg-purple-100 text-purple-700" : "bg-sky-100 text-sky-700"}`}>
                                  {bag.gstType === "INTER" ? "IGST" : "Intra"}
                                </Badge>
                              </div>
                              <div className="font-mono text-[10px] text-slate-400">{bag.orderId}</div>
                            </TableCell>
                            <TableCell colSpan={3} className="text-xs text-slate-500 py-2">
                              ESP: <span className="text-slate-700 font-medium">{fmt(bag.esp)}</span>
                              <span className="mx-2 text-slate-300">|</span>
                              Wh: {bag.stateCode} → Cust: {bag.customerStateCode}
                            </TableCell>
                            <TableCell colSpan={2} className="text-right py-2" />
                            <TableCell className="text-right py-2 font-medium text-slate-900 text-sm">{fmt(bag.tcsAmount)}</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              {tcsEntries.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>{tcsEntries.length} brand-state group(s) · {tcsEntries.reduce((s, r) => s + r.bagCount, 0)} bags total</span>
                  <span className="font-medium text-slate-700">
                    Total TCS: {fmt(tcsEntries.reduce((s, r) => s + r.totalTcsAmount, 0))}
                    <span className="ml-3 text-purple-600">IGST: {fmt(tcsEntries.reduce((s, r) => s + r.igstTcsAmount, 0))}</span>
                    <span className="ml-2 text-sky-600">Intra: {fmt(tcsEntries.reduce((s, r) => s + r.intrastateTcsAmount, 0))}</span>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TDS Register — brand groups with per-bag drill-down and reversals */}
        <TabsContent value="tds" className="m-0">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-100">
                    <TableHead className="w-8 px-3" />
                    <TableHead className="font-medium text-slate-500 h-10 px-4">Brand</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Company / TAN</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Bags</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Gross Payment</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">TDS Deducted</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Reversed</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Net TDS</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingTds ? (
                    <TableRow><TableCell colSpan={10} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : tdsEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="h-24 text-center text-slate-400 text-sm">No TDS records for {month} {year}</TableCell></TableRow>
                  ) : tdsEntries.map((row) => {
                    const isOpen = expandedTds.has(row.brandId);
                    return (
                      <React.Fragment key={row.brandId}>
                        <TableRow className={`border-slate-100/50 cursor-pointer hover:bg-slate-50/60 ${row.reversalCount > 0 ? "bg-amber-50/20" : ""}`} onClick={() => toggleTds(row.brandId)}>
                          <TableCell className="px-3 text-slate-400">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="px-4">
                            <div className="font-medium text-slate-900">{row.brandName}</div>
                            {row.depositRef && (
                              <div className="text-[10px] text-green-600 mt-0.5">Ref: {row.depositRef} · {row.depositDate}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-slate-600">{row.companyName}</div>
                            <div className="font-mono text-[10px] text-slate-400">{row.tan}</div>
                          </TableCell>
                          <TableCell className="text-center text-sm font-medium text-slate-700">{row.bagCount}</TableCell>
                          <TableCell className="text-right text-slate-600 text-sm">{fmt(row.grossPayment)}</TableCell>
                          <TableCell className="text-right">
                            <span className="font-semibold text-slate-900">{fmt(row.tdsAmount)}</span>
                            <span className="text-xs text-slate-400 font-normal ml-1">@{row.tdsRate}%</span>
                          </TableCell>
                          <TableCell className="text-right">
                            {row.tdsReversed > 0 ? (
                              <span className="text-red-600 font-medium flex items-center justify-end gap-1">
                                <RotateCcw className="h-3 w-3" />−{fmt(row.tdsReversed)}
                              </span>
                            ) : <span className="text-slate-400 text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-semibold ${row.tdsReversed > 0 ? "text-green-700" : "text-slate-900"}`}>{fmt(row.netTds)}</span>
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}><StatusBadge status={row.status} /></TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            {row.status === "Pending" ? (
                              <Button size="sm" variant="outline" className="h-7 text-[11px] border-green-300 text-green-700 hover:bg-green-50"
                                onClick={() => { setTdsMarkDialog(row); setMarkForm({ ref: "", date: new Date().toISOString().split("T")[0] }); }}>
                                <CreditCard className="h-3 w-3 mr-1" /> Mark Deposited
                              </Button>
                            ) : <span className="text-xs text-green-600">✓ {row.status}</span>}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <>
                            {row.bags?.map((bag) => (
                              <TableRow key={bag.bagId} className="bg-slate-50/50 border-slate-100/30">
                                <TableCell />
                                <TableCell colSpan={2} className="px-4 py-2">
                                  <div className="font-mono text-xs text-slate-700">{bag.bagId}</div>
                                  <div className="font-mono text-[10px] text-slate-400">{bag.orderId}</div>
                                </TableCell>
                                <TableCell className="text-center text-xs text-slate-500 py-2">1</TableCell>
                                <TableCell className="text-right text-xs text-slate-600 py-2">{fmt(bag.esp)}</TableCell>
                                <TableCell className="text-right text-xs font-medium text-slate-900 py-2">{fmt(bag.tdsAmount)}</TableCell>
                                <TableCell className="py-2" />
                                <TableCell className="text-right text-xs font-medium text-slate-900 py-2">{fmt(bag.tdsAmount)}</TableCell>
                                <TableCell colSpan={2} className="py-2">
                                  {bag.reversalDeadline && (
                                    <span className={`text-[10px] flex items-center gap-1 ${bag.reversalDeadlinePast ? "text-red-600" : "text-slate-400"}`}>
                                      {bag.reversalDeadlinePast && <AlertTriangle className="h-3 w-3" />}
                                      Rev by {bag.reversalDeadline}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                            {row.reversals?.map((rev, i) => (
                              <TableRow key={`rev-${i}`} className="bg-red-50/40 border-slate-100/30">
                                <TableCell />
                                <TableCell colSpan={2} className="px-4 py-2">
                                  <div className="flex items-center gap-1.5 text-red-700 text-xs">
                                    <RotateCcw className="h-3 w-3" />
                                    Reversal {rev.bagId ? `· Bag ${rev.bagId}` : "(manual)"}
                                  </div>
                                  {rev.reason && <div className="text-[10px] text-slate-400 mt-0.5">{rev.reason}</div>}
                                </TableCell>
                                <TableCell className="text-center text-xs py-2">—</TableCell>
                                <TableCell className="py-2" />
                                <TableCell className="text-right text-xs py-2" />
                                <TableCell className="text-right text-xs text-red-600 font-medium py-2">−{fmt(Math.abs(rev.tdsAmount))}</TableCell>
                                <TableCell className="py-2" />
                                <TableCell colSpan={2} className="py-2" />
                              </TableRow>
                            ))}
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              {tdsEntries.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>{tdsEntries.length} brand(s) · {tdsEntries.reduce((s, r) => s + r.bagCount, 0)} bags · {totalTdsReversals} reversal(s)</span>
                  <span className="font-medium text-slate-700">
                    Net TDS payable: {fmt(tdsEntries.reduce((s, r) => s + r.netTds, 0))}
                  </span>
                </div>
              )}
              {totalTdsReversals > 0 && (
                <div className="px-6 py-3 bg-amber-50/50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-2">
                  <RotateCcw className="h-3.5 w-3.5 flex-shrink-0" />
                  {totalTdsReversals} TDS reversal(s) this month — credit restored to brand in the next payout cycle.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GST Register — per-bag invoice with CGST/SGST/IGST split */}
        <TabsContent value="gst" className="m-0">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-3 px-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-sm font-medium text-slate-700">
                  GST Sales Register — {month} {year}
                </CardTitle>
                <Select value={gstBrandFilter} onValueChange={setGstBrandFilter}>
                  <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="All brands" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All brands</SelectItem>
                    {activeOnboardings.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.brandName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            {gstSummary && (
              <div className="grid grid-cols-3 md:grid-cols-6 border-b border-slate-100 divide-x divide-slate-100">
                {[
                  { label: "Taxable Value", value: gstSummary.totalTaxableValue },
                  { label: "CGST", value: gstSummary.totalCgst, cls: "text-sky-700" },
                  { label: "SGST", value: gstSummary.totalSgst, cls: "text-sky-700" },
                  { label: "IGST", value: gstSummary.totalIgst, cls: "text-purple-700" },
                  { label: "Total GST", value: gstSummary.totalGst, cls: "font-semibold" },
                  { label: "Invoice Value", value: gstSummary.totalInvoiceValue, cls: "font-semibold text-slate-900" },
                ].map((card) => (
                  <div key={card.label} className="px-4 py-2.5">
                    <p className="text-[10px] text-slate-500">{card.label}</p>
                    <p className={`text-sm mt-0.5 ${card.cls ?? "text-slate-800"}`}>{fmt(card.value)}</p>
                  </div>
                ))}
              </div>
            )}
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-100">
                    <TableHead className="font-medium text-slate-500 h-10 px-6">Invoice #</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Bag / Brand</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Customer</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">GST Type</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Taxable</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">CGST</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">SGST</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">IGST</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Invoice Value</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Credit Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingGst ? (
                    <TableRow><TableCell colSpan={10} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : gstEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="h-24 text-center text-slate-400 text-sm">No GST entries for {month} {year}</TableCell></TableRow>
                  ) : gstEntries.map((row) => (
                    <TableRow key={row.bagId} className="border-slate-100/50">
                      <TableCell className="px-6">
                        <div className="font-mono text-xs text-slate-700">{row.invoiceNumber ?? "—"}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{row.invoiceDate ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs text-slate-700">{row.bagId}</div>
                        <div className="text-xs text-slate-500">{row.brandName}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-slate-700">{row.customerName || "—"}</div>
                        <div className="text-[10px] text-slate-400">{row.customerState}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`text-[10px] h-4 border-transparent ${row.gstType === "INTER" ? "bg-purple-100 text-purple-700" : "bg-sky-100 text-sky-700"}`}>
                          {row.gstType === "INTER" ? "IGST" : "Intra-state"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-700">{fmt(row.taxableValue)}</TableCell>
                      <TableCell className="text-right text-xs text-sky-700">
                        {row.cgstAmount > 0 ? `${fmt(row.cgstAmount)} (${row.cgstRate}%)` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-sky-700">
                        {row.sgstAmount > 0 ? `${fmt(row.sgstAmount)} (${row.sgstRate}%)` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-purple-700">
                        {row.igstAmount > 0 ? `${fmt(row.igstAmount)} (${row.igstRate}%)` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium text-slate-900">{fmt(row.totalInvoiceValue)}</TableCell>
                      <TableCell className="text-center">
                        {row.hasCreditNote ? (
                          <div className="text-[10px] text-red-600 font-mono">{row.creditNoteNumber}</div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {gstEntries.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>{gstEntries.length} invoice(s) · {gstEntries.filter((e) => e.hasCreditNote).length} credit note(s)</span>
                  <span className="font-medium text-slate-700">
                    Total GST: {fmt(gstEntries.reduce((s, e) => s + e.totalGstAmount, 0))}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Order-Level Breakdown */}
        <TabsContent value="breakdown" className="m-0">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-3 px-6">
              <CardTitle className="text-sm font-medium text-slate-700">
                Per-Bag TCS/TDS Breakdown — {month} {year}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-100">
                    <TableHead className="font-medium text-slate-500 h-10 px-6">Bag ID</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Brand / SKU</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Cycle</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">ESP</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">TCS</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">TDS</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Delivery</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">TDS Reversal Deadline</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingBreakdown ? (
                    <TableRow><TableCell colSpan={9} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : breakdownRows.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="h-24 text-center text-slate-400 text-sm">No bags delivered in {month} {year}</TableCell></TableRow>
                  ) : breakdownRows.map((row) => (
                    <TableRow key={row.bagId} className={`border-slate-100/50 ${row.isReturned ? "bg-red-50/40" : ""}`}>
                      <TableCell className="px-6">
                        <div className="font-mono text-xs font-medium text-slate-900">{row.bagId}</div>
                        <div className="font-mono text-[10px] text-slate-400">{row.orderId}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm text-slate-900">{row.brandName}</div>
                        <div className="font-mono text-xs text-slate-400">{row.sku}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{row.cycle}</span>
                      </TableCell>
                      <TableCell className="text-right text-slate-700">{fmt(row.esp)}</TableCell>
                      <TableCell className={`text-right font-medium ${row.isReturned ? "text-red-600 line-through" : "text-slate-900"}`}>
                        {fmt(row.tcsAmount)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${row.isReturned ? "text-red-600 line-through" : "text-slate-900"}`}>
                        {fmt(row.tdsAmount)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{row.deliveryDate || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {row.reversalDeadline ? (
                          <span className={`flex items-center gap-1 ${row.reversalDeadlinePast ? "text-red-600 font-medium" : "text-slate-500"}`}>
                            {row.reversalDeadlinePast && <AlertTriangle className="h-3 w-3 flex-shrink-0" />}
                            {row.reversalDeadline}
                            {row.reversalDeadlinePast && <span className="text-[10px] text-red-500">(past)</span>}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.reversalStatus === "CARRY_FORWARD" ? (
                          <Badge className="bg-orange-100 text-orange-700 border-transparent hover:bg-orange-100 text-xs">
                            Carry-Forward
                          </Badge>
                        ) : row.isReturned ? (
                          <Badge className="bg-red-100 text-red-700 border-transparent hover:bg-red-100 text-xs">
                            <RotateCcw className="mr-1 h-3 w-3" />Returned
                          </Badge>
                        ) : (
                          <Badge className={`border-transparent text-xs ${
                            row.eligibility === "eligible" ? "bg-green-100 text-green-800" :
                            row.eligibility === "in_window" ? "bg-amber-100 text-amber-800" :
                            "bg-slate-100 text-slate-600"
                          }`}>
                            {row.eligibility.replace("_", " ")}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {breakdownRows.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>{breakdownRows.length} bag(s) · {returnedBags.length} returned</span>
                  <span className="font-medium text-slate-700">
                    TCS: {fmt(breakdownRows.reduce((s, r) => s + (r.isReturned ? 0 : r.tcsAmount), 0))} ·
                    TDS: {fmt(breakdownRows.reduce((s, r) => s + (r.isReturned ? 0 : r.tdsAmount), 0))}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Brand Ledger — filtered to ACTIVE/APPROVED brands only */}
        <TabsContent value="ledger" className="m-0 space-y-4">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 py-4">
              <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:justify-between">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Brand</label>
                    <Select value={ledgerBrandId} onValueChange={setLedgerBrandId}>
                      <SelectTrigger className="w-64 h-9"><SelectValue placeholder="Select an active brand" /></SelectTrigger>
                      <SelectContent>
                        {activeOnboardings.map((o) => (
                          <SelectItem key={o.id} value={String(o.id)}>
                            {o.brandName} — {o.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Type</label>
                    <Select value={ledgerType} onValueChange={setLedgerType}>
                      <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All types</SelectItem>
                        <SelectItem value="SETTLEMENT">Settlement (credit)</SelectItem>
                        <SelectItem value="PAYOUT">Payout (debit)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">From</label>
                    <Input type="date" value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)} className="w-40 h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">To</label>
                    <Input type="date" value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)} className="w-40 h-9" />
                  </div>
                </div>
                <Button variant="outline" onClick={downloadLedger} disabled={!ledgerBrandId || !ledger?.entries?.length}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!ledgerBrandId ? (
                <div className="h-40 flex items-center justify-center text-slate-500 text-sm gap-2">
                  <BookOpen className="h-4 w-4" /> Select a brand above to view its running ledger.
                </div>
              ) : isLoadingLedger ? (
                <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : (
                <>
                  {ledger?.brand && (
                    <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-900">{ledger.brand.brandName}</span>
                        <span className="text-slate-500 text-sm ml-2">— {ledger.brand.companyName}</span>
                      </div>
                      <div className="text-sm">
                        Closing Balance:{" "}
                        <span className={`font-semibold ${ledger.closingBalance > 0 ? "text-amber-700" : "text-green-700"}`}>
                          {fmt(ledger.closingBalance)}
                        </span>
                        {ledger.closingBalance > 0 && (
                          <span className="text-xs text-amber-600 ml-1">(outstanding to brand)</span>
                        )}
                      </div>
                    </div>
                  )}
                  <Table>
                    <TableHeader className="bg-slate-50/80">
                      <TableRow className="border-slate-100">
                        <TableHead className="font-medium text-slate-500 h-10 px-6">Date</TableHead>
                        <TableHead className="font-medium text-slate-500 h-10">Type</TableHead>
                        <TableHead className="font-medium text-slate-500 h-10">Cycle</TableHead>
                        <TableHead className="font-medium text-slate-500 h-10">Reference</TableHead>
                        <TableHead className="font-medium text-slate-500 h-10">Description</TableHead>
                        <TableHead className="font-medium text-slate-500 h-10 text-right">Amount</TableHead>
                        <TableHead className="font-medium text-slate-500 h-10 text-right">Running Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!ledger?.entries?.length ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-slate-400 text-sm">
                            No ledger entries found for this brand.
                          </TableCell>
                        </TableRow>
                      ) : ledger.entries.map((entry, i) => (
                        <TableRow key={i} className="border-slate-100/50">
                          <TableCell className="px-6 text-xs text-slate-600">
                            {new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs border-transparent ${entry.type === "SETTLEMENT" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-700"}`}>
                              {entry.type === "SETTLEMENT" ? "Settlement" : "Payout"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{entry.cycle}</span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">{entry.ref}</TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-xs truncate">{entry.description}</TableCell>
                          <TableCell className={`text-right font-medium text-sm ${entry.amount >= 0 ? "text-green-700" : "text-red-600"}`}>
                            {entry.amount >= 0 ? "+" : ""}{fmt(entry.amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-semibold text-sm ${entry.runningBalance > 0 ? "text-amber-700" : entry.runningBalance < 0 ? "text-red-600" : "text-slate-500"}`}>
                              {fmt(entry.runningBalance)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Calendar */}
        <TabsContent value="calendar" className="m-0">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-100">
                    <TableHead className="font-medium text-slate-500 h-10 px-6">Obligation</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Section</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Due Date</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingCalendar ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : (calendar ?? []).map((item) => (
                    <TableRow key={item.id} className={`border-slate-100/50 ${item.status === "Filed" ? "opacity-60" : ""}`}>
                      <TableCell className="px-6 font-medium text-slate-900">{item.obligation}</TableCell>
                      <TableCell className="text-sm text-slate-500">{item.section}</TableCell>
                      <TableCell className="text-sm text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {new Date(item.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </TableCell>
                      <TableCell className="text-center"><StatusBadge status={item.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* TDS/TCS Reversal Dialog */}
      <Dialog open={showReversalDialog} onOpenChange={setShowReversalDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log TDS/TCS Reversal</DialogTitle>
            <DialogDescription>
              For bags already cancelled or returned through the Orders page. Both TDS (§194-O IT Act)
              and TCS (§52 GST / GSTR-8 amendment) are reversed together using the same deadline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-700 space-y-1">
              <p className="font-medium flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Bag must already be cancelled or returned</p>
              <p>Use the Orders page to cancel or return active orders first — it enforces credit-note generation and scenario rules. The 7th-of-following-month deadline is enforced server-side. Past the deadline, amounts are recorded as carry-forward adjustments for the next settlement cycle.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Bag ID</label>
              <Input
                placeholder="e.g. BAG-2026-00001"
                value={reversalForm.bagId}
                onChange={(e) => setReversalForm({ ...reversalForm, bagId: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Reason</label>
              <Input
                placeholder="e.g. Order cancelled, return accepted"
                value={reversalForm.reason}
                onChange={(e) => setReversalForm({ ...reversalForm, reason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReversalDialog(false)}>Cancel</Button>
            <Button
              onClick={handleReversal}
              disabled={reversalLoading || !reversalForm.bagId.trim() || !reversalForm.reason.trim()}
            >
              {reversalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark TCS Paid Dialog */}
      <Dialog open={!!tcsMarkDialog} onOpenChange={(open) => !open && setTcsMarkDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark TCS as Paid</DialogTitle>
            <DialogDescription>
              {tcsMarkDialog?.brandName} ({tcsMarkDialog?.stateName}) — {fmt(tcsMarkDialog?.totalTcsAmount ?? 0)} to govt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Payment Reference</label>
              <Input placeholder="Challan / BSR reference" value={markForm.ref} onChange={(e) => setMarkForm({ ...markForm, ref: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Payment Date</label>
              <Input type="date" value={markForm.date} onChange={(e) => setMarkForm({ ...markForm, date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTcsMarkDialog(null)}>Cancel</Button>
            <Button onClick={handleMarkTcsPaid} disabled={markLoading}>
              {markLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark TDS Deposited Dialog */}
      <Dialog open={!!tdsMarkDialog} onOpenChange={(open) => !open && setTdsMarkDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark TDS as Deposited</DialogTitle>
            <DialogDescription>
              {tdsMarkDialog?.brandName} — Net TDS {fmt(tdsMarkDialog?.netTds ?? 0)} to be deposited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Deposit Reference</label>
              <Input placeholder="Challan / NSDL reference" value={markForm.ref} onChange={(e) => setMarkForm({ ...markForm, ref: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Deposit Date</label>
              <Input type="date" value={markForm.date} onChange={(e) => setMarkForm({ ...markForm, date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTdsMarkDialog(null)}>Cancel</Button>
            <Button onClick={handleMarkTdsDeposited} disabled={markLoading}>
              {markLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
