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
import { ArrowLeft, CheckCircle, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
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

  const { data: settlement, isLoading } = useGetSettlement(id, {
    query: { enabled: !!id, queryKey: getGetSettlementQueryKey(id) }
  });

  const approveMutation = useApproveSettlement();

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading waterfall...</div>;
  if (!settlement) return <div className="p-8 text-center text-slate-500">Settlement not found</div>;

  const handleApprove = () => {
    approveMutation.mutate({ id, data: { financeNotes: "Approved waterfall" } }, {
      onSuccess: () => {
        toast({ title: "Settlement Approved", description: "Ready for payout initiation." });
        queryClient.invalidateQueries({ queryKey: getGetSettlementQueryKey(id) });
      },
      onError: () => {
        toast({ title: "Approval Failed", variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <Button variant="ghost" className="px-0 text-slate-500 hover:bg-transparent mb-2" onClick={() => setLocation("/settlements")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Settlements
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{settlement.brandName}</h1>
            <Badge variant={settlement.status === 'APPROVED' || settlement.status === 'PAID' ? 'default' : 'secondary'}>{settlement.status}</Badge>
            <Badge variant="outline" className="font-mono text-xs">{settlement.cycle}</Badge>
          </div>
          <p className="text-slate-500 text-sm">Computed on {new Date(settlement.createdAt).toLocaleDateString()} • {settlement.eligibleBags} Bags</p>
        </div>
        
        <div className="flex gap-2">
          {(settlement.status === 'COMPUTED' || settlement.status === 'PENDING_APPROVAL') && (
            <Button onClick={handleApprove} disabled={approveMutation.isPending} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="mr-2 h-4 w-4" /> Approve Settlement
            </Button>
          )}
          {settlement.status === 'APPROVED' && (
            <Button asChild>
              <a href="/payouts">View in Payouts</a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center gap-2">
              <Calculator className="h-5 w-5 text-slate-500" />
              <CardTitle className="text-base font-semibold text-slate-800">Deduction Waterfall</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col">
                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                  <div className="font-medium text-slate-900">Gross GMV</div>
                  <div className="font-medium text-slate-900">{formatCurrency(settlement.grossGmv)}</div>
                </div>
                
                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50 text-red-700">
                  <div className="text-slate-600">Less: Brand Promotions</div>
                  <div>- {formatCurrency(settlement.brandPromotions)}</div>
                </div>
                
                <Separator className="bg-slate-100" />
                
                <div className="flex justify-between items-center p-4 bg-slate-50/30">
                  <div className="font-medium text-slate-800">Net Before Commission</div>
                  <div className="font-medium text-slate-800">{formatCurrency(settlement.netBeforeCommission)}</div>
                </div>

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50 text-red-700">
                  <div className="text-slate-600 flex items-center gap-2">
                    Commission 
                    <Badge variant="outline" className="text-[10px] h-5">{formatPercentage(settlement.commissionRate)}</Badge>
                  </div>
                  <div>- {formatCurrency(settlement.commission)}</div>
                </div>

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50 text-red-700">
                  <div className="text-slate-600">GST on Commission</div>
                  <div>- {formatCurrency(settlement.gstOnCommission)}</div>
                </div>

                <Separator className="bg-slate-100" />

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50 text-red-700">
                  <div className="text-slate-600">TCS (Tax Collected at Source)</div>
                  <div>- {formatCurrency(settlement.tcsAmount)}</div>
                </div>

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50 text-red-700">
                  <div className="text-slate-600">TDS (Tax Deducted at Source)</div>
                  <div>- {formatCurrency(settlement.tdsAmount)}</div>
                </div>

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50 text-red-700">
                  <div className="text-slate-600">MDR Charges</div>
                  <div>- {formatCurrency(settlement.mdrCharges)}</div>
                </div>

                <div className="flex justify-between items-center p-4 hover:bg-slate-50/50 text-red-700">
                  <div className="text-slate-600">Penalty / Adjustments</div>
                  <div>- {formatCurrency(settlement.penalty)}</div>
                </div>

                <Separator className="bg-slate-200 border-2" />

                <div className="flex justify-between items-center p-6 bg-slate-50">
                  <div className="text-lg font-bold text-slate-900">Net Payable</div>
                  <div className="text-2xl font-bold text-green-700">{formatCurrency(settlement.netPayable)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
              <CardTitle className="text-base font-semibold text-slate-800">Beneficiary Details</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Company</p>
                <p className="font-medium text-slate-900">{settlement.companyName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Bank Name</p>
                <p className="font-medium text-slate-900">{settlement.bankName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Account Number</p>
                <p className="font-mono text-sm text-slate-900">{settlement.bankAccount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">IFSC Code</p>
                <p className="font-mono text-sm text-slate-900">{settlement.bankIfsc}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
              <CardTitle className="text-base font-semibold text-slate-800">Audit Trail</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
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
                <div className="mt-4 p-3 bg-slate-50 rounded text-sm text-slate-700 border border-slate-100">
                  <span className="font-semibold block mb-1">Notes:</span>
                  {settlement.financeNotes}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
