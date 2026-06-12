import { useLocation, useParams } from "wouter";
import { 
  useGetSettlement, 
  useApproveSettlement,
  getGetSettlementQueryKey
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, Calculator, Download, Info, BanknoteIcon, Send, Clock, ExternalLink, FileText, Ban, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useRole } from "@/contexts/RoleContext";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Link } from "wouter";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

function formatPercentage(amount: number) {
  return `${amount.toFixed(2)}%`;
}

type PayoutStatus = "PENDING_APPROVAL" | "INITIATED" | "UTR_RECORDED" | "SETTLED";

interface LinkedPayout {
  id: number;
  settlementId: number;
  status: PayoutStatus;
  amount: number;
  paymentRef: string;
  transferMode: string;
  utr: string | null;
  bankName: string;
  bankAccount: string;
  initiatedBy: string | null;
  initiatedAt: string;
  payoutApprovedBy: string | null;
  payoutApprovedAt: string | null;
  settledAt: string | null;
  payoutNotes: string | null;
}

function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  switch (status) {
    case "PENDING_APPROVAL":
      return <Badge className="bg-slate-100 text-slate-700 border-transparent"><Clock className="mr-1 h-3 w-3" />Awaiting Maker</Badge>;
    case "INITIATED":
      return <Badge className="bg-amber-100 text-amber-800 border-transparent"><Send className="mr-1 h-3 w-3" />Submitted to Checker</Badge>;
    case "UTR_RECORDED":
    case "SETTLED":
      return <Badge className="bg-green-100 text-green-800 border-transparent"><BanknoteIcon className="mr-1 h-3 w-3" />Settled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function SettlementDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isChecker, isAdmin } = useRole();
  const canSignOff = isChecker || isAdmin;

  const { data: settlement, isLoading } = useGetSettlement(id, {
    query: { enabled: !!id, queryKey: getGetSettlementQueryKey(id) }
  });

  const { data: linkedPayout } = useQuery<LinkedPayout>({
    queryKey: [`/api/settlements/${id}/payout`],
    queryFn: async () => {
      const r = await fetch(`/api/settlements/${id}/payout`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!id && (settlement?.status === "APPROVED" || settlement?.status === "PAID"),
    retry: false,
  });

  const approveMutation = useApproveSettlement();
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [financeNotes, setFinanceNotes] = useState("");

  const [invoiceData, setInvoiceData] = useState<{
    invoiceNo: string; invoiceDate: string; cycle: string;
    brand: { name: string; companyName: string; pan: string; gstin: string; bankAccount: string; bankName: string };
    platform: { name: string; gstin: string; address: string };
    waterfall: { grossGmv: number; commission: number; commissionRate: number; gstOnCommission: number; tcsAmount: number; tdsAmount: number; netPayable: number };
    payout: { utr: string | null; transferMode: string; settledAt: string | null } | null;
    eligibleBags: number;
  } | null>(null);

  const openInvoice = async () => {
    const r = await fetch(`/api/settlements/${id}/invoice`);
    if (r.ok) {
      setInvoiceData(await r.json());
      setShowInvoiceDialog(true);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading waterfall...</div>;
  if (!settlement) return <div className="p-8 text-center text-slate-500">Settlement not found</div>;

  const handleApprove = () => {
    approveMutation.mutate({ id, data: { financeNotes } }, {
      onSuccess: () => {
        toast({ title: "Settlement Approved", description: "Payout queued — Maker must initiate, then Checker approves to auto-generate UTR." });
        queryClient.invalidateQueries({ queryKey: getGetSettlementQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: [`/api/settlements/${id}/payout`] });
        setShowApproveDialog(false);
      },
      onError: () => {
        toast({ title: "Approval Failed", variant: "destructive" });
      }
    });
  };

  const socUrl = `/api/settlements/${id}/soc`;
  const pdfUrl = `/api/settlements/${id}/invoice-pdf`;
  const settlementExtra = settlement as { marketplacePromotions?: number; carryForward?: number; onHold?: boolean; holdReason?: string | null };
  const carryForward = settlementExtra.carryForward ?? 0;
  const onHold = settlementExtra.onHold ?? false;
  const holdReason = settlementExtra.holdReason ?? null;
  const canApprove = canSignOff && !onHold && (settlement.status === "COMPUTED" || settlement.status === "PENDING_APPROVAL");
  const canHold = canSignOff && (settlement.status === "COMPUTED" || settlement.status === "PENDING_APPROVAL");

  const marketplacePromotions = settlementExtra.marketplacePromotions ?? 0;

  const handleHold = async (hold: boolean) => {
    const reason = hold ? window.prompt("Reason for stopping this payout?") : undefined;
    if (hold && reason === null) return;
    const r = await fetch(`/api/settlements/${id}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hold, reason }),
    });
    if (r.ok) {
      toast({ title: hold ? "Payout Stopped" : "Payout Resumed", description: hold ? "This settlement is on hold and cannot be approved until resumed." : "This settlement can now be approved." });
      queryClient.invalidateQueries({ queryKey: getGetSettlementQueryKey(id) });
    } else {
      const err = await r.json().catch(() => ({}));
      toast({ title: "Action Failed", description: err.error ?? "Could not update payout hold.", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <Button variant="ghost" className="px-0 text-slate-500 hover:bg-transparent mb-2" onClick={() => setLocation("/settlements")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Settlements
          </Button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{settlement.brandName}</h1>
            <Badge variant={settlement.status === "APPROVED" || settlement.status === "PAID" ? "default" : "secondary"}>{settlement.status}</Badge>
            <Badge variant="outline" className="font-mono text-xs">{settlement.cycle}</Badge>
          </div>
          <p className="text-slate-500 text-sm">Computed on {new Date(settlement.createdAt).toLocaleDateString()} · {settlement.eligibleBags} bags</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <a href={socUrl} download>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" /> Download SoC
            </Button>
          </a>

          <a href={pdfUrl} download>
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </a>

          {(settlement.status === "APPROVED" || settlement.status === "PAID") && (
            <Button variant="outline" onClick={openInvoice}>
              <FileText className="mr-2 h-4 w-4" /> Commission Invoice
            </Button>
          )}

          {canHold && !onHold && (
            <Button variant="outline" onClick={() => handleHold(true)} className="text-red-700 border-red-200 hover:bg-red-50">
              <Ban className="mr-2 h-4 w-4" /> Stop Payout
            </Button>
          )}
          {canHold && onHold && (
            <Button variant="outline" onClick={() => handleHold(false)} className="text-green-700 border-green-200 hover:bg-green-50">
              <PlayCircle className="mr-2 h-4 w-4" /> Resume Payout
            </Button>
          )}
          {canApprove && (
            <Button onClick={() => setShowApproveDialog(true)} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="mr-2 h-4 w-4" /> Approve Settlement
            </Button>
          )}
          {!canSignOff && (settlement.status === "COMPUTED" || settlement.status === "PENDING_APPROVAL") && (
            <Badge variant="outline" className="px-3 py-1.5 text-amber-700 border-amber-200 bg-amber-50 text-sm">
              Awaiting Finance Checker approval
            </Badge>
          )}
        </div>
      </div>

      {onHold && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <Ban className="mt-0.5 h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="font-semibold text-red-800">Payout stopped</p>
            <p className="text-sm text-red-700">{holdReason ?? "This settlement is on hold and cannot be approved until resumed."}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Deduction Waterfall */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center gap-2">
              <Calculator className="h-5 w-5 text-slate-500" />
              <CardTitle className="text-base font-semibold text-slate-800">Deduction Waterfall — BRD §7</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col">
                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                  <div className="font-semibold text-slate-900">1. Gross Merchandise Value (GMV)</div>
                  <div className="font-semibold text-slate-900">{formatCurrency(settlement.grossGmv)}</div>
                </div>

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                  <div className="text-slate-600 flex items-center gap-2">
                    2. Less: Brand-funded Promotions
                    <Badge variant="outline" className="text-[10px] h-4">Deducted</Badge>
                  </div>
                  <div className="text-red-700">− {formatCurrency(settlement.brandPromotions)}</div>
                </div>

                {marketplacePromotions > 0 && (
                  <div className="flex justify-between items-center p-4 bg-blue-50/30 hover:bg-blue-50/50">
                    <div className="text-slate-600 flex items-center gap-2">
                      <Info className="h-3.5 w-3.5 text-blue-500" />
                      3. Marketplace-funded Promotions
                      <Badge className="text-[10px] h-4 bg-blue-100 text-blue-700 border-transparent hover:bg-blue-100">Borne by Swasthera</Badge>
                    </div>
                    <div className="text-blue-600 text-sm">{formatCurrency(marketplacePromotions)} (not deducted)</div>
                  </div>
                )}

                <Separator className="bg-slate-100" />

                <div className="flex justify-between items-center p-4 bg-slate-50/30">
                  <div className="font-medium text-slate-800">4. Net Before Commission</div>
                  <div className="font-medium text-slate-800">{formatCurrency(settlement.netBeforeCommission)}</div>
                </div>

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                  <div className="text-slate-600 flex items-center gap-2">
                    5. Less: Commission
                    <Badge variant="outline" className="text-[10px] h-4">{formatPercentage(settlement.commissionRate)} on order date</Badge>
                  </div>
                  <div className="text-red-700">− {formatCurrency(settlement.commission)}</div>
                </div>

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                  <div className="text-slate-600">6. Less: GST on Commission (18%)</div>
                  <div className="text-red-700">− {formatCurrency(settlement.gstOnCommission)}</div>
                </div>

                <Separator className="bg-slate-100" />

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                  <div className="text-slate-600 flex items-center gap-2">
                    7. Less: TCS (Tax Collected at Source)
                    <Badge variant="outline" className="text-[10px] h-4 text-amber-700 border-amber-200">Section 52 GST</Badge>
                  </div>
                  <div className="text-red-700">− {formatCurrency(settlement.tcsAmount)}</div>
                </div>

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                  <div className="text-slate-600 flex items-center gap-2">
                    8. Less: TDS (Tax Deducted at Source)
                    <Badge variant="outline" className="text-[10px] h-4 text-amber-700 border-amber-200">Section 194-O</Badge>
                  </div>
                  <div className="text-red-700">− {formatCurrency(settlement.tdsAmount)}</div>
                </div>

                {settlement.penalty > 0 && (
                  <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                    <div className="text-slate-600">Penalty / Adjustments</div>
                    <div className="text-red-700">− {formatCurrency(settlement.penalty)}</div>
                  </div>
                )}

                <Separator className="bg-slate-200 border-2" />

                {carryForward < 0 && (
                  <div className="flex justify-between items-center p-4 bg-amber-50 border-y border-amber-100">
                    <div className="text-amber-800 text-sm font-medium">Net negative — deficit carried to next cycle</div>
                    <div className="text-amber-800 font-semibold">{formatCurrency(carryForward)}</div>
                  </div>
                )}

                <div className="flex justify-between items-center p-6 bg-slate-50">
                  <div className="text-lg font-bold text-slate-900">9. Net Payable to Brand</div>
                  <div className="text-2xl font-bold text-green-700">{formatCurrency(settlement.netPayable)}</div>
                </div>

                {carryForward < 0 && (
                  <div className="px-6 pb-2 text-xs text-amber-700 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Deductions exceeded GMV. Brand is never paid a negative amount — {formatCurrency(Math.abs(carryForward))} will be adjusted against the next cycle.
                  </div>
                )}

                <div className="px-6 pb-4 text-xs text-slate-400 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Transferred via NEFT/RTGS to company bank account · Commission Invoice + SoC emailed to brand SPOC on approval
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Linked Payout Status — only shown after approval */}
          {linkedPayout && (
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold text-slate-800">Payout Status</CardTitle>
                <PayoutStatusBadge status={linkedPayout.status} />
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Payment Ref</p>
                  <p className="font-mono text-sm text-slate-900">{linkedPayout.paymentRef}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Amount</p>
                  <p className="font-bold text-green-700">{formatCurrency(linkedPayout.amount)}</p>
                </div>
                {linkedPayout.utr && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">UTR</p>
                    <p className="font-mono text-sm text-green-700">{linkedPayout.utr}</p>
                  </div>
                )}
                {linkedPayout.initiatedBy && (
                  <div className="text-xs text-slate-500">Initiated by <span className="font-medium text-slate-700">{linkedPayout.initiatedBy}</span></div>
                )}
                {linkedPayout.payoutApprovedBy && (
                  <div className="text-xs text-slate-500">Approved by <span className="font-medium text-slate-700">{linkedPayout.payoutApprovedBy}</span></div>
                )}
                {linkedPayout.settledAt && (
                  <div className="text-xs text-slate-500">Settled: <span className="font-medium text-slate-700">{new Date(linkedPayout.settledAt).toLocaleDateString()}</span></div>
                )}
                <Button asChild variant="outline" size="sm" className="w-full mt-2">
                  <Link href="/payouts">
                    <ExternalLink className="h-3.5 w-3.5 mr-2" /> View in Payouts
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Beneficiary */}
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
              <CardTitle className="text-base font-semibold text-slate-800">Beneficiary Details</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {[
                ["Company", settlement.companyName],
                ["Bank Name", settlement.bankName],
                ["Account Number", settlement.bankAccount],
                ["IFSC Code", settlement.bankIfsc],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                  <p className="font-mono text-sm text-slate-900">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Audit Trail */}
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
              <CardTitle className="text-base font-semibold text-slate-800">Audit Trail</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Computed</span>
                <span className="font-medium text-slate-900">{new Date(settlement.createdAt).toLocaleDateString()}</span>
              </div>
              {settlement.approvedAt && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Approved</span>
                  <span className="font-medium text-green-700">{new Date(settlement.approvedAt).toLocaleDateString()}</span>
                </div>
              )}
              {settlement.approvedBy && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Checker</span>
                  <span className="font-medium text-slate-900">{settlement.approvedBy}</span>
                </div>
              )}
              {settlement.financeNotes && (
                <div className="mt-2 p-3 bg-slate-50 rounded text-sm text-slate-700 border border-slate-100">
                  <span className="font-semibold block mb-1">Notes:</span>
                  {settlement.financeNotes}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SoC */}
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
              <CardTitle className="text-base font-semibold text-slate-800">Statement of Claim</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <p className="text-xs text-slate-500">BRD §7.1 — 27 fields per bag including Order ID, Invoice Date, ESP, brand/marketplace discounts, commission, TCS, TDS, MDR, net payable, and UTR.</p>
              <a href={socUrl} download>
                <Button variant="outline" size="sm" className="w-full">
                  <Download className="mr-2 h-3.5 w-3.5" /> Download SoC CSV
                </Button>
              </a>
              <a href={pdfUrl} download>
                <Button variant="outline" size="sm" className="w-full">
                  <FileText className="mr-2 h-3.5 w-3.5" /> Download Settlement Invoice PDF
                </Button>
              </a>
              <p className="text-xs text-slate-400 text-center">{settlement.eligibleBags} bag{settlement.eligibleBags !== 1 ? "s" : ""} · {settlement.cycle}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Finance Approval Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Settlement</DialogTitle>
            <DialogDescription>
              On approval: Commission Invoice + SoC will be emailed to the brand SPOC. Bank transfer of {formatCurrency(settlement.netPayable)} will be initiated to {settlement.bankName} ({settlement.bankAccount}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Finance Notes (optional)</label>
            <Textarea
              placeholder="Verified waterfall — all deductions correct..."
              value={financeNotes}
              onChange={(e) => setFinanceNotes(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={approveMutation.isPending} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="mr-2 h-4 w-4" />
              {approveMutation.isPending ? "Approving..." : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commission Invoice Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Commission Invoice</DialogTitle>
            <DialogDescription>{invoiceData?.invoiceNo} · {invoiceData?.invoiceDate}</DialogDescription>
          </DialogHeader>
          {invoiceData && (
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
                  <p className="text-xs font-mono text-slate-500">{invoiceData.brand.gstin}</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <p className="font-medium text-slate-700">Settlement Summary — {invoiceData.cycle}</p>
                {[
                  ["Gross GMV", formatCurrency(invoiceData.waterfall.grossGmv), false],
                  [`Commission (${invoiceData.waterfall.commissionRate}%)`, formatCurrency(invoiceData.waterfall.commission), true],
                  ["GST on Commission (18%)", formatCurrency(invoiceData.waterfall.gstOnCommission), true],
                  ["TCS Deducted (Sec 52)", formatCurrency(invoiceData.waterfall.tcsAmount), true],
                  ["TDS Deducted (Sec 194-O)", formatCurrency(invoiceData.waterfall.tdsAmount), true],
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
              <p className="text-xs text-slate-400">{invoiceData.eligibleBags} bags · Beneficiary: {invoiceData.brand.bankName} {invoiceData.brand.bankAccount}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>Close</Button>
            <a href={socUrl} download>
              <Button variant="outline"><Download className="h-4 w-4 mr-2" />Download SoC</Button>
            </a>
            <a href={`/api/settlements/${settlement?.id}/invoice-pdf`} target="_blank" rel="noreferrer">
              <Button variant="outline"><Download className="h-4 w-4 mr-2" />Download Invoice PDF</Button>
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
