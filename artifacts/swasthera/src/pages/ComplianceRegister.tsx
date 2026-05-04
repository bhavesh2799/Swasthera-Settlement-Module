import { useState } from "react";
import { 
  useGetTcsTdsSummary, 
  useListTcsRecords, 
  useListTdsRecords,
  useGetComplianceCalendar
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Calendar, FileText, CheckCircle2, AlertCircle, RotateCcw, ArrowDownUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function formatCurrency(amount: number) {
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

export function ComplianceRegister() {
  const [month, setMonth] = useState("May");
  const [year, setYear] = useState("2026");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reversal dialog state
  const [showReversalDialog, setShowReversalDialog] = useState(false);
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalForm, setReversalForm] = useState({ bagId: "", reason: "" });

  const params = { month, year: parseInt(year) };
  const summaryKey = ["/api/compliance/tcs-tds", params];
  const tcsKey = ["/api/compliance/tcs-records", params];
  const tdsKey = ["/api/compliance/tds-records", params];

  const { data: summary, isLoading: isLoadingSummary } = useGetTcsTdsSummary(params);
  const { data: tcsRecords, isLoading: isLoadingTcs } = useListTcsRecords(params);
  const { data: tdsRecords, isLoading: isLoadingTds } = useListTdsRecords(params);
  const { data: calendar, isLoading: isLoadingCalendar } = useGetComplianceCalendar();

  const s = summary as (typeof summary & {
    tcsReversed?: number; tcsNet?: number;
    tdsReversed?: number; tdsNet?: number;
  }) | undefined;

  const handleReversal = async () => {
    if (!reversalForm.bagId.trim() || !reversalForm.reason.trim()) return;
    setReversalLoading(true);
    try {
      const res = await fetch("/api/compliance/reversal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bagId: reversalForm.bagId.trim(), reason: reversalForm.reason.trim(), month, year: parseInt(year) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Reversal logged", description: data.message });
      setShowReversalDialog(false);
      setReversalForm({ bagId: "", reason: "" });
      queryClient.invalidateQueries({ queryKey: summaryKey });
      queryClient.invalidateQueries({ queryKey: tcsKey });
      queryClient.invalidateQueries({ queryKey: tdsKey });
    } catch (err: unknown) {
      toast({ title: "Reversal failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setReversalLoading(false);
    }
  };

  const tcsEntries = tcsRecords ?? [];
  const tdsEntries = tdsRecords ?? [];
  const tcsReversals = tcsEntries.filter((r) => (r as { isReversal?: boolean }).isReversal);
  const tdsReversals = tdsEntries.filter((r) => (r as { isReversal?: boolean }).isReversal);

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Compliance & Tax</h1>
          <p className="text-slate-500 mt-1">TCS/TDS registers, reversal entries, and GSTR-8 filing status</p>
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
            <RotateCcw className="mr-2 h-4 w-4" /> Log Reversal
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoadingSummary ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : s ? (
        <div className="grid gap-4 md:grid-cols-4">
          {/* TCS Accrued */}
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">TCS Accrued (Section 52)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(s.tcsAccrued)}</div>
              {(s.tcsReversed ?? 0) > 0 && (
                <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                  <TrendingDown className="h-3 w-3" />
                  Reversals: −{formatCurrency(s.tcsReversed ?? 0)}
                </div>
              )}
              {(s.tcsNet ?? 0) !== s.tcsAccrued && (
                <div className="text-sm font-semibold text-green-700 mt-1">Net: {formatCurrency(s.tcsNet ?? s.tcsAccrued)}</div>
              )}
              <div className="text-xs text-slate-500 mt-1">Due: <span className="font-medium text-slate-700">{new Date(s.tcsPaymentDue).toLocaleDateString()}</span></div>
            </CardContent>
          </Card>

          {/* TCS Paid */}
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">TCS Paid to Govt.</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(s.tcsPaid)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Liability: <span className={`font-medium ${(s.tcsNet ?? s.tcsAccrued) > s.tcsPaid ? "text-amber-700" : "text-green-700"}`}>
                  {formatCurrency(Math.max(0, (s.tcsNet ?? s.tcsAccrued) - s.tcsPaid))} remaining
                </span>
              </div>
            </CardContent>
          </Card>

          {/* TDS */}
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">TDS Deducted (Section 194-O)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(s.tdsDeducted)}</div>
              {(s.tdsReversed ?? 0) > 0 && (
                <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                  <TrendingDown className="h-3 w-3" />
                  Reversals: −{formatCurrency(s.tdsReversed ?? 0)}
                </div>
              )}
              {(s.tdsNet ?? 0) !== s.tdsDeducted && (
                <div className="text-sm font-semibold text-green-700 mt-1">Net: {formatCurrency(s.tdsNet ?? s.tdsDeducted)}</div>
              )}
              <div className="text-xs text-slate-500 mt-1">Deposit Due: <span className="font-medium text-slate-700">{new Date(s.tdsDepositDue).toLocaleDateString()}</span></div>
            </CardContent>
          </Card>

          {/* GSTR-8 */}
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
            {tcsReversals.length > 0 && (
              <Badge className="ml-2 text-[10px] h-4 bg-amber-100 text-amber-700 border-transparent hover:bg-amber-100">{tcsReversals.length} reversal{tcsReversals.length !== 1 ? "s" : ""}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tds" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            TDS Register
            {tdsReversals.length > 0 && (
              <Badge className="ml-2 text-[10px] h-4 bg-amber-100 text-amber-700 border-transparent hover:bg-amber-100">{tdsReversals.length} reversal{tdsReversals.length !== 1 ? "s" : ""}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Compliance Calendar</TabsTrigger>
        </TabsList>

        {/* TCS Register */}
        <TabsContent value="tcs" className="m-0">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-100">
                    <TableHead className="font-medium text-slate-500 h-10 px-6">State</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">GSTIN</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Brand</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Taxable Supply</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">TCS Amount</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Type</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingTcs ? (
                    <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : tcsEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="h-24 text-center text-slate-400 text-sm">No TCS records for {month} {year}</TableCell></TableRow>
                  ) : tcsEntries.map((row) => {
                    const isReversal = (row as { isReversal?: boolean }).isReversal;
                    const originalBagId = (row as { originalBagId?: string }).originalBagId;
                    const reversalReason = (row as { reversalReason?: string }).reversalReason;
                    return (
                      <TableRow key={row.id} className={`border-slate-100/50 ${isReversal ? "bg-amber-50/50" : ""}`}>
                        <TableCell className="px-6 font-medium text-slate-900">{row.stateName} ({row.stateCode})</TableCell>
                        <TableCell className="font-mono text-sm">{row.stateGstin}</TableCell>
                        <TableCell className="text-slate-600">
                          {row.brandName}
                          {originalBagId && <p className="text-[10px] text-slate-400">Bag: {originalBagId}</p>}
                          {reversalReason && <p className="text-[10px] text-amber-600 italic">{reversalReason}</p>}
                        </TableCell>
                        <TableCell className={`text-right ${isReversal ? "text-red-600" : "text-slate-600"}`}>
                          {formatCurrency(row.taxableSupply)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${isReversal ? "text-red-700" : "text-slate-900"}`}>
                          {isReversal && "−"}{formatCurrency(Math.abs(row.tcsAmount))}
                          <span className="text-xs text-slate-400 font-normal ml-1">@{row.tcsRate}%</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {isReversal ? (
                            <Badge className="bg-amber-100 text-amber-700 border-transparent hover:bg-amber-100 text-xs">
                              <RotateCcw className="mr-1 h-3 w-3" />Reversal
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-700 border-transparent hover:bg-blue-100 text-xs">
                              <ArrowDownUp className="mr-1 h-3 w-3" />Entry
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center"><StatusBadge status={row.status} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {tcsReversals.length > 0 && (
                <div className="px-6 py-3 bg-amber-50/50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-2">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {tcsReversals.length} reversal entr{tcsReversals.length !== 1 ? "ies" : "y"} — per BRD §5.4, reversal entries reduce the net TCS liability for this month.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TDS Register */}
        <TabsContent value="tds" className="m-0">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-100">
                    <TableHead className="font-medium text-slate-500 h-10 px-6">Company</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">TAN</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Gross Payment</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">TDS Amount</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-right">Net Paid</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Type</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingTds ? (
                    <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : tdsEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="h-24 text-center text-slate-400 text-sm">No TDS records for {month} {year}</TableCell></TableRow>
                  ) : tdsEntries.map((row) => {
                    const isReversal = (row as { isReversal?: boolean }).isReversal;
                    const originalBagId = (row as { originalBagId?: string }).originalBagId;
                    const reversalReason = (row as { reversalReason?: string }).reversalReason;
                    return (
                      <TableRow key={row.id} className={`border-slate-100/50 ${isReversal ? "bg-amber-50/50" : ""}`}>
                        <TableCell className="px-6 font-medium text-slate-900">
                          {row.companyName}
                          {originalBagId && <p className="text-[10px] text-slate-400">Bag: {originalBagId}</p>}
                          {reversalReason && <p className="text-[10px] text-amber-600 italic">{reversalReason}</p>}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.tan}</TableCell>
                        <TableCell className={`text-right ${isReversal ? "text-red-600" : "text-slate-600"}`}>
                          {formatCurrency(row.grossPayment)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${isReversal ? "text-red-700" : "text-slate-900"}`}>
                          {isReversal && "−"}{formatCurrency(Math.abs(row.tdsAmount))}
                          <span className="text-xs text-slate-400 font-normal ml-1">@{row.tdsRate}%</span>
                        </TableCell>
                        <TableCell className="text-right text-slate-600">{formatCurrency(row.netPaid)}</TableCell>
                        <TableCell className="text-center">
                          {isReversal ? (
                            <Badge className="bg-amber-100 text-amber-700 border-transparent hover:bg-amber-100 text-xs">
                              <RotateCcw className="mr-1 h-3 w-3" />Reversal
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-700 border-transparent hover:bg-blue-100 text-xs">
                              <ArrowDownUp className="mr-1 h-3 w-3" />Entry
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center"><StatusBadge status={row.status} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {tdsReversals.length > 0 && (
                <div className="px-6 py-3 bg-amber-50/50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-2">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {tdsReversals.length} reversal entr{tdsReversals.length !== 1 ? "ies" : "y"} — TDS credit will be restored to brand on next payout cycle.
                </div>
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
                    <TableHead className="font-medium text-slate-500 h-10 px-6">Due Date</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Obligation</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Legal Section</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingCalendar ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : calendar?.map((row) => {
                    const isOverdue = row.status === "Upcoming" && new Date(row.dueDate) < new Date();
                    return (
                      <TableRow key={row.id} className={`border-slate-100/50 ${isOverdue ? "bg-red-50/30" : ""}`}>
                        <TableCell className="px-6 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            {new Date(row.dueDate).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-900">{row.obligation}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
                            <FileText className="h-3 w-3 shrink-0" />
                            {row.section}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={isOverdue ? "Overdue" : row.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reversal Dialog */}
      <Dialog open={showReversalDialog} onOpenChange={setShowReversalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log TCS/TDS Reversal — BRD §5.4</DialogTitle>
            <DialogDescription>
              Triggered by: return_bag_delivered, RTO, or post-invoice cancellation. Inserts a negative TCS/TDS entry that reduces the net liability for {month} {year}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bag ID <span className="text-red-500">*</span></label>
              <Input
                placeholder="B2026050012345"
                value={reversalForm.bagId}
                onChange={(e) => setReversalForm((p) => ({ ...p, bagId: e.target.value }))}
              />
              <p className="text-xs text-slate-500">Enter the Bag ID from the Orders register that was returned or cancelled.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reversal Reason <span className="text-red-500">*</span></label>
              <Input
                placeholder="Customer return — return_bag_delivered"
                value={reversalForm.reason}
                onChange={(e) => setReversalForm((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700 space-y-1">
              <p className="font-medium">What happens on reversal:</p>
              <ul className="space-y-0.5 list-disc pl-4">
                <li>Negative TCS entry inserted against this bag in {month} {year}</li>
                <li>Negative TDS entry inserted against this bag</li>
                <li>Bag marked as <strong>on_hold</strong> — excluded from next settlement</li>
                <li>Net TCS/TDS liability for {month} reduces accordingly</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReversalDialog(false)}>Cancel</Button>
            <Button
              onClick={handleReversal}
              disabled={reversalLoading || !reversalForm.bagId.trim() || !reversalForm.reason.trim()}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {reversalLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : <><RotateCcw className="mr-2 h-4 w-4" />Log Reversal</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
