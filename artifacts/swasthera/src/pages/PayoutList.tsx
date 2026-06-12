import { useState } from "react";
import { useListPayouts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, CheckCircle2, CircleDot, Clock, BanknoteIcon, Info, ExternalLink, Download, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/contexts/RoleContext";
import { Link } from "wouter";
import { Separator } from "@/components/ui/separator";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

type PayoutStatus = "PENDING_APPROVAL" | "INITIATED" | "UTR_RECORDED" | "SETTLED";

function StatusBadge({ status }: { status: string }) {
  switch (status as PayoutStatus) {
    case "PENDING_APPROVAL":
      return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-transparent"><Clock className="mr-1 h-3 w-3" />Pending Initiation</Badge>;
    case "INITIATED":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent"><Send className="mr-1 h-3 w-3" />Awaiting Approval</Badge>;
    case "UTR_RECORDED":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent"><BanknoteIcon className="mr-1 h-3 w-3" />UTR Recorded</Badge>;
    case "SETTLED":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent"><CheckCircle2 className="mr-1 h-3 w-3" />Settled</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
  }
}

type PayoutRow = {
  id: number;
  settlementId?: number | null;
  brandName: string;
  companyName: string;
  cycle: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  amount: number;
  transferMode: string;
  paymentRef: string;
  status: string;
  utr?: string | null;
  initiatedBy?: string | null;
  initiatedAt: string;
  payoutApprovedBy?: string | null;
  payoutApprovedAt?: string | null;
  payoutNotes?: string | null;
  settledAt?: string | null;
};

type InvoiceData = {
  invoiceNo: string;
  invoiceDate: string;
  cycle: string;
  brand: { name: string; companyName: string; pan: string; gstin: string; bankAccount: string; bankName: string };
  platform: { name: string; gstin: string; address: string };
  waterfall: { grossGmv: number; commission: number; commissionRate: number; gstOnCommission: number; tcsAmount: number; tdsAmount: number; netPayable: number };
  payout: { utr: string | null; transferMode: string; settledAt: string | null } | null;
  eligibleBags: number;
  socUrl: string;
};

export function PayoutList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isMaker, isChecker } = useRole();

  const statusParam = statusFilter === "all" ? undefined : (statusFilter as never);
  const { data: payouts, isLoading, refetch } = useListPayouts({ status: statusParam });

  const [actionPayoutId, setActionPayoutId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"initiate" | "approve" | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [invoiceDialogPayoutId, setInvoiceDialogPayoutId] = useState<number | null>(null);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const activePayoutRow = (payouts as PayoutRow[] | undefined)?.find((p) => p.id === actionPayoutId);
  const invoicePayoutRow = (payouts as PayoutRow[] | undefined)?.find((p) => p.id === invoiceDialogPayoutId);

  const openDialog = (id: number, type: "initiate" | "approve") => {
    setActionPayoutId(id);
    setActionType(type);
    setActionNotes("");
  };

  const closeDialog = () => {
    setActionPayoutId(null);
    setActionType(null);
    setActionNotes("");
  };

  const handleAction = async () => {
    if (!actionPayoutId || !actionType) return;
    setActionLoading(true);
    const endpoint = actionType === "initiate"
      ? `/api/payouts/${actionPayoutId}/initiate`
      : `/api/payouts/${actionPayoutId}/approve`;

    const body = actionType === "initiate"
      ? { initiatedBy: "Anjali Patel" }
      : { approvedBy: "Rajesh Kumar", payoutNotes: actionNotes };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (actionType === "initiate") {
        toast({ title: "Payout Initiated", description: "Sent to Checker for approval." });
      } else {
        toast({
          title: "Payout Approved & Settled",
          description: `UTR auto-generated: ${data.utr}`,
        });
      }
      closeDialog();
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    } catch (err: unknown) {
      toast({ title: "Action failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const openInvoice = async (row: PayoutRow) => {
    if (!row.settlementId) return;
    setInvoiceDialogPayoutId(row.id);
    setInvoiceLoading(true);
    try {
      const r = await fetch(`/api/settlements/${row.settlementId}/invoice`);
      if (r.ok) setInvoiceData(await r.json());
    } finally {
      setInvoiceLoading(false);
    }
  };

  const rows = payouts as PayoutRow[] | undefined;

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payouts</h1>
          <p className="text-slate-500 mt-1">Maker-Checker bank transfer workflow with auto-generated UTR</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-white shadow-sm border-slate-200">
            <SelectValue placeholder="Filter Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="PENDING_APPROVAL">Pending Initiation</SelectItem>
            <SelectItem value="INITIATED">Awaiting Approval</SelectItem>
            <SelectItem value="UTR_RECORDED">UTR Recorded</SelectItem>
            <SelectItem value="SETTLED">Settled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Flow banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-700">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">Payout approval flow: </span>
          Settlement approved by Checker
          <span className="mx-2 text-blue-400">→</span>
          <span className="font-medium">Maker</span> reviews & initiates
          <span className="mx-2 text-blue-400">→</span>
          <span className="font-medium">Checker</span> approves
          <span className="mx-2 text-blue-400">→</span>
          UTR auto-generated by backend → Settled
        </div>
      </div>

      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-100">
                <TableHead className="font-medium text-slate-500 h-10 px-6">Payment Ref</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Brand / Cycle</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Beneficiary</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right">Amount</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">UTR / Action</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right px-4">Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
              ) : rows?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-500">No payouts found.</TableCell></TableRow>
              ) : rows?.map((row) => (
                <TableRow key={row.id} className="border-slate-100/50">
                  <TableCell className="px-6">
                    <div className="font-mono text-xs text-slate-700">{row.paymentRef}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{row.transferMode}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{row.brandName}</div>
                    <div className="text-xs font-mono text-slate-500">{row.cycle}</div>
                    {(row as PayoutRow & { companyId?: string | null }).companyId && (
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5">{(row as PayoutRow & { companyId?: string | null }).companyId}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-700">{row.bankName}</div>
                    <div className="font-mono text-xs text-slate-500">A/C: {row.bankAccount}</div>
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-900">{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="text-center"><StatusBadge status={row.status} /></TableCell>
                  <TableCell className="px-4">
                    {row.status === "PENDING_APPROVAL" && isMaker && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => openDialog(row.id, "initiate")}
                      >
                        <Send className="mr-1.5 h-3 w-3" /> Initiate Payout
                      </Button>
                    )}
                    {row.status === "PENDING_APPROVAL" && !isMaker && (
                      <span className="text-xs text-slate-400 italic">Awaiting Maker</span>
                    )}
                    {row.status === "INITIATED" && isChecker && (
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => openDialog(row.id, "approve")}
                      >
                        <CheckCircle2 className="mr-1.5 h-3 w-3" /> Approve & Release
                      </Button>
                    )}
                    {row.status === "INITIATED" && !isChecker && (
                      <span className="text-xs text-slate-400 italic">Awaiting Checker</span>
                    )}
                    {(row.status === "UTR_RECORDED" || row.status === "SETTLED") && (
                      <div className="space-y-0.5">
                        <div className="font-mono text-xs text-slate-700 font-medium flex items-center gap-1">
                          <CircleDot className="h-3 w-3 text-green-500" />
                          {row.utr || "—"}
                        </div>
                        {row.settledAt && (
                          <div className="text-[10px] text-slate-400">{new Date(row.settledAt).toLocaleDateString()}</div>
                        )}
                        {row.payoutApprovedBy && (
                          <div className="text-[10px] text-slate-400">by {row.payoutApprovedBy}</div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right px-4">
                    <div className="flex flex-col gap-1 items-end">
                      {row.settlementId && (
                        <Button asChild variant="ghost" size="sm" className="h-7 text-[11px] text-slate-500 hover:text-slate-900 px-2">
                          <Link href={`/settlements/${row.settlementId}`}>
                            <ExternalLink className="h-3 w-3 mr-1" /> Settlement
                          </Link>
                        </Button>
                      )}
                      {row.status === "SETTLED" && row.settlementId && (
                        <>
                          <a href={`/api/settlements/${row.settlementId}/soc`} download>
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-blue-600 hover:text-blue-800 px-2">
                              <Download className="h-3 w-3 mr-1" /> SoC CSV
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px] text-purple-600 hover:text-purple-800 px-2"
                            onClick={() => openInvoice(row)}
                          >
                            <FileText className="h-3 w-3 mr-1" /> Invoice
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Action Dialog — Initiate or Approve */}
      <Dialog open={actionPayoutId !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "initiate" ? "Initiate Payout — Maker Review" : "Approve Payout — Checker Sign-off"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "initiate"
                ? "Verify the beneficiary details and amount before submitting this payout to the Checker for approval."
                : "On approval, a UTR will be auto-generated by the backend and the payout will be marked as Settled immediately."}
            </DialogDescription>
          </DialogHeader>

          {activePayoutRow && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Brand</span>
                  <span className="font-medium text-slate-900">{activePayoutRow.brandName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cycle</span>
                  <span className="font-mono text-xs text-slate-700">{activePayoutRow.cycle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bank</span>
                  <span className="text-slate-700">{activePayoutRow.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Account</span>
                  <span className="font-mono text-xs text-slate-700">{activePayoutRow.bankAccount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IFSC</span>
                  <span className="font-mono text-xs text-slate-700">{activePayoutRow.bankIfsc}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                  <span className="font-medium text-slate-700">Amount</span>
                  <span className="font-bold text-slate-900">{formatCurrency(activePayoutRow.amount)}</span>
                </div>
              </div>

              {actionType === "approve" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Checker Notes (optional)</label>
                  <Textarea
                    placeholder="Verified beneficiary details and amount — approved for release..."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    className="min-h-[72px]"
                  />
                </div>
              )}

              {actionType === "approve" && (
                <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-xs text-green-700 space-y-0.5">
                  <p className="font-medium">What happens on approval:</p>
                  <ul className="space-y-0.5 list-disc pl-4">
                    <li>Backend auto-generates a NEFT UTR reference</li>
                    <li>Payout status immediately transitions to <strong>Settled</strong></li>
                    <li>UTR is recorded in the payout audit trail</li>
                    <li>SoC + Commission Invoice become available for download</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            {actionType === "initiate" ? (
              <Button
                onClick={handleAction}
                disabled={actionLoading}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {actionLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</> : <><Send className="mr-2 h-4 w-4" />Submit for Checker Approval</>}
              </Button>
            ) : (
              <Button
                onClick={handleAction}
                disabled={actionLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {actionLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Approve & Release Funds</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commission Invoice Dialog */}
      <Dialog open={invoiceDialogPayoutId !== null} onOpenChange={(o) => { if (!o) { setInvoiceDialogPayoutId(null); setInvoiceData(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Commission Invoice</DialogTitle>
            <DialogDescription>
              {invoicePayoutRow?.brandName} · {invoicePayoutRow?.cycle}
            </DialogDescription>
          </DialogHeader>
          {invoiceLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : invoiceData ? (
            <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Platform</p>
                  <p className="font-medium">{invoiceData.platform.name}</p>
                  <p className="text-xs text-slate-500 font-mono">{invoiceData.platform.gstin}</p>
                  <p className="text-xs text-slate-500">{invoiceData.platform.address}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Brand</p>
                  <p className="font-medium">{invoiceData.brand.name}</p>
                  <p className="text-xs text-slate-500">{invoiceData.brand.companyName}</p>
                  <p className="text-xs font-mono text-slate-500">{invoiceData.brand.gstin || invoiceData.brand.pan}</p>
                </div>
              </div>
              <div className="text-xs font-mono text-slate-400 flex justify-between">
                <span>Invoice: {invoiceData.invoiceNo}</span>
                <span>Date: {invoiceData.invoiceDate}</span>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <p className="font-medium text-slate-700">Settlement Summary — {invoiceData.cycle}</p>
                {[
                  ["Gross GMV", formatCurrency(invoiceData.waterfall.grossGmv), false],
                  [`Commission (${invoiceData.waterfall.commissionRate}%)`, formatCurrency(invoiceData.waterfall.commission), true],
                  ["GST on Commission (18%)", formatCurrency(invoiceData.waterfall.gstOnCommission), true],
                  ["TCS Deducted (Section 52)", formatCurrency(invoiceData.waterfall.tcsAmount), true],
                  ["TDS Deducted (Section 194-O)", formatCurrency(invoiceData.waterfall.tdsAmount), true],
                ].map(([label, val, isDeduction]) => (
                  <div key={String(label)} className="flex justify-between">
                    <span className="text-slate-600">{label}</span>
                    <span className={isDeduction ? "text-red-700" : "font-medium"}>{isDeduction ? `− ${val}` : val}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Net Payable to Brand</span>
                  <span className="text-green-700">{formatCurrency(invoiceData.waterfall.netPayable)}</span>
                </div>
              </div>
              {invoiceData.payout?.utr && (
                <div className="rounded-md bg-green-50 border border-green-100 p-3 text-sm">
                  <p className="font-semibold text-green-800">Payment Settled</p>
                  <p className="text-xs text-green-700 mt-1">UTR: <span className="font-mono">{invoiceData.payout.utr}</span></p>
                  {invoiceData.payout.settledAt && (
                    <p className="text-xs text-green-700">Date: {new Date(invoiceData.payout.settledAt).toLocaleDateString()}</p>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-400">{invoiceData.eligibleBags} bags · {invoiceData.brand.bankName} {invoiceData.brand.bankAccount}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInvoiceDialogPayoutId(null); setInvoiceData(null); }}>Close</Button>
            {invoiceData && (
              <a href={invoiceData.socUrl} download>
                <Button variant="outline"><Download className="h-4 w-4 mr-2" />Download SoC</Button>
              </a>
            )}
            {invoicePayoutRow?.settlementId && (
              <a href={`/api/settlements/${invoicePayoutRow.settlementId}/invoice-pdf`} download target="_blank" rel="noreferrer">
                <Button variant="default"><FileText className="h-4 w-4 mr-2" />Download Invoice PDF</Button>
              </a>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
