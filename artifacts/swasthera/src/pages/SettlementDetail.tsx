import { useLocation, useParams } from "wouter";
import { 
  useGetSettlement, 
  useApproveSettlement,
  getGetSettlementQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, Calculator, Download, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useRole } from "@/contexts/RoleContext";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

function formatPercentage(amount: number) {
  return `${amount.toFixed(2)}%`;
}

export function SettlementDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isChecker } = useRole();

  const { data: settlement, isLoading } = useGetSettlement(id, {
    query: { enabled: !!id, queryKey: getGetSettlementQueryKey(id) }
  });

  const approveMutation = useApproveSettlement();
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [financeNotes, setFinanceNotes] = useState("");

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading waterfall...</div>;
  if (!settlement) return <div className="p-8 text-center text-slate-500">Settlement not found</div>;

  const handleApprove = () => {
    approveMutation.mutate({ id, data: { financeNotes } }, {
      onSuccess: () => {
        toast({ title: "Settlement Approved", description: "Payout queued — Maker must initiate, then Checker approves to auto-generate UTR." });
        queryClient.invalidateQueries({ queryKey: getGetSettlementQueryKey(id) });
        setShowApproveDialog(false);
      },
      onError: () => {
        toast({ title: "Approval Failed", variant: "destructive" });
      }
    });
  };

  const socUrl = `/api/settlements/${id}/soc`;
  const canApprove = isChecker && (settlement.status === "COMPUTED" || settlement.status === "PENDING_APPROVAL");

  // marketplacePromotions may not be present in older seeded settlements
  const marketplacePromotions = (settlement as { marketplacePromotions?: number }).marketplacePromotions ?? 0;

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
          {/* SoC download — BRD §7.1 (27 fields per bag) */}
          <a href={socUrl} download>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" /> Download SoC
            </Button>
          </a>

          {/* BRD §9.1: Only Checker (Finance) can approve settlement */}
          {canApprove && (
            <Button onClick={() => setShowApproveDialog(true)} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="mr-2 h-4 w-4" /> Approve Settlement
            </Button>
          )}
          {!isChecker && (settlement.status === "COMPUTED" || settlement.status === "PENDING_APPROVAL") && (
            <Badge variant="outline" className="px-3 py-1.5 text-amber-700 border-amber-200 bg-amber-50 text-sm">
              Awaiting Finance Checker approval
            </Badge>
          )}
          {settlement.status === "APPROVED" && (
            <Button asChild variant="outline">
              <a href="/payouts">View in Payouts →</a>
            </Button>
          )}
        </div>
      </div>

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

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                  <div className="text-slate-600">9. Less: MDR (Payment Gateway)</div>
                  <div className="text-red-700">− {formatCurrency(settlement.mdrCharges)}</div>
                </div>

                {settlement.penalty > 0 && (
                  <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                    <div className="text-slate-600">Penalty / Adjustments</div>
                    <div className="text-red-700">− {formatCurrency(settlement.penalty)}</div>
                  </div>
                )}

                <Separator className="bg-slate-200 border-2" />

                <div className="flex justify-between items-center p-6 bg-slate-50">
                  <div className="text-lg font-bold text-slate-900">10. Net Payable to Brand</div>
                  <div className="text-2xl font-bold text-green-700">{formatCurrency(settlement.netPayable)}</div>
                </div>

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

          {/* SoC quick info */}
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
    </div>
  );
}
