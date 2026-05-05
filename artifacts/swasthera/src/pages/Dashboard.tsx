import { useState } from "react";
import { Link } from "wouter";
import { 
  useGetDashboardSummary, 
  useGetBrandSettlements, 
  useGetActivity 
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Activity, Clock, CheckCircle2, AlertCircle, BanknoteIcon, Download, FileText, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'APPROVED':
    case 'SETTLED':
      return <Badge variant="default" className="bg-green-500/10 text-green-700 hover:bg-green-500/20">{status}</Badge>;
    case 'PENDING_APPROVAL':
    case 'ON_HOLD':
      return <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20">{status}</Badge>;
    case 'PAYOUT_INITIATED':
      return <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/20">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function ActivityIcon({ level }: { level: string }) {
  switch (level) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-amber-600" />;
    default:
      return <Activity className="h-4 w-4 text-blue-600" />;
  }
}

type SettledPayout = {
  id: number;
  settlementId?: number | null;
  brandName: string;
  cycle: string;
  amount: number;
  utr: string | null;
  settledAt: string | null;
  payoutApprovedBy: string | null;
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

export function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: settlements, isLoading: isLoadingSettlements } = useGetBrandSettlements();
  const { data: activities, isLoading: isLoadingActivity } = useGetActivity({ limit: 10 });

  const { data: settledPayouts } = useQuery<SettledPayout[]>({
    queryKey: ["/api/payouts", { status: "SETTLED" }],
    queryFn: async () => {
      const r = await fetch("/api/payouts?status=SETTLED");
      return r.json();
    },
  });

  const [invoiceDialogId, setInvoiceDialogId] = useState<number | null>(null);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const invoiceRow = settledPayouts?.find((p) => p.id === invoiceDialogId);

  const openInvoice = async (payout: SettledPayout) => {
    if (!payout.settlementId) return;
    setInvoiceDialogId(payout.id);
    setInvoiceLoading(true);
    try {
      const r = await fetch(`/api/settlements/${payout.settlementId}/invoice`);
      if (r.ok) setInvoiceData(await r.json());
    } finally {
      setInvoiceLoading(false);
    }
  };

  if (isLoadingSummary || isLoadingSettlements || isLoadingActivity) {
    return <div className="p-8 flex justify-center"><Activity className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Active Cycle: <span className="font-semibold text-slate-700">{summary?.cycleLabel}</span></p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-9 border-slate-200">
            <Link href="/onboarding/new">New Onboarding</Link>
          </Button>
          <Button asChild className="h-9 shadow-sm">
            <Link href="/settlements">Compute Settlements</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Gross GMV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(summary?.grossGmv || 0)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Net Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(summary?.netPayable || 0)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Commission Earned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 text-green-700">{formatCurrency(summary?.commissionEarned || 0)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active Brands</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{summary?.activeBrands || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-5 shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-800">Brand Settlement Status</CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-slate-500 hover:text-slate-900">
                <Link href="/settlements">View All <ArrowUpRight className="ml-1 h-3 w-3" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="font-medium text-slate-500 h-10">Brand</TableHead>
                  <TableHead className="font-medium text-slate-500 h-10 text-right">GMV</TableHead>
                  <TableHead className="font-medium text-slate-500 h-10 text-right">Net Payable</TableHead>
                  <TableHead className="font-medium text-slate-500 h-10 text-right">Bags</TableHead>
                  <TableHead className="font-medium text-slate-500 h-10">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements?.slice(0, 8).map((row) => (
                  <TableRow key={row.id} className="border-slate-100/50">
                    <TableCell className="font-medium text-slate-900">{row.brandName}</TableCell>
                    <TableCell className="text-right text-slate-600">{formatCurrency(row.gmv)}</TableCell>
                    <TableCell className="text-right font-medium text-slate-900">{formatCurrency(row.netPayable)}</TableCell>
                    <TableCell className="text-right text-slate-600">{row.eligibleBags}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {(!settlements || settlements.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                      No active settlements found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-4">
              {activities?.map((activity) => (
                <div key={activity.id} className="flex gap-3 items-start">
                  <div className="mt-0.5 bg-slate-50 p-1.5 rounded-full border border-slate-100">
                    <ActivityIcon level={activity.level} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-slate-700 leading-tight">
                      <span className="font-medium text-slate-900">{activity.user}</span> {activity.action} <span className="font-medium text-slate-900">{activity.entityRef}</span>
                    </p>
                    <div className="flex items-center text-xs text-slate-400">
                      <Clock className="mr-1 h-3 w-3" />
                      {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {(!activities || activities.length === 0) && (
                <div className="text-center text-sm text-slate-500 py-4">No recent activity</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Completed Payouts — Post-payout documents */}
      {settledPayouts && settledPayouts.length > 0 && (
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BanknoteIcon className="h-4 w-4 text-green-600" />
                <CardTitle className="text-base font-semibold text-slate-800">Completed Payouts</CardTitle>
                <Badge className="bg-green-100 text-green-700 border-transparent hover:bg-green-100 text-xs">{settledPayouts.length} settled</Badge>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-slate-500 hover:text-slate-900">
                <Link href="/payouts">View All <ArrowUpRight className="ml-1 h-3 w-3" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="font-medium text-slate-500 h-10 px-6">Brand</TableHead>
                  <TableHead className="font-medium text-slate-500 h-10">Cycle</TableHead>
                  <TableHead className="font-medium text-slate-500 h-10 text-right">Amount</TableHead>
                  <TableHead className="font-medium text-slate-500 h-10">UTR</TableHead>
                  <TableHead className="font-medium text-slate-500 h-10">Settled On</TableHead>
                  <TableHead className="font-medium text-slate-500 h-10 text-right px-4">Documents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settledPayouts.slice(0, 5).map((payout) => (
                  <TableRow key={payout.id} className="border-slate-100/50">
                    <TableCell className="px-6 font-medium text-slate-900">{payout.brandName}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{payout.cycle}</TableCell>
                    <TableCell className="text-right font-medium text-green-700">{formatCurrency(payout.amount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span className="font-mono text-xs text-slate-700">{payout.utr ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {payout.settledAt ? new Date(payout.settledAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right px-4">
                      <div className="flex gap-1 justify-end">
                        {payout.settlementId && (
                          <>
                            <a href={`/api/settlements/${payout.settlementId}/soc`} download>
                              <Button variant="ghost" size="sm" className="h-7 text-[11px] text-blue-600 hover:text-blue-800 px-2">
                                <Download className="h-3 w-3 mr-1" /> SoC
                              </Button>
                            </a>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] text-purple-600 hover:text-purple-800 px-2"
                              onClick={() => openInvoice(payout)}
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
      )}

      {/* Invoice Dialog */}
      <Dialog open={invoiceDialogId !== null} onOpenChange={(o) => { if (!o) { setInvoiceDialogId(null); setInvoiceData(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Commission Invoice</DialogTitle>
            <DialogDescription>{invoiceRow?.brandName} · {invoiceRow?.cycle}</DialogDescription>
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
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Brand</p>
                  <p className="font-medium">{invoiceData.brand.name}</p>
                  <p className="text-xs text-slate-500">{invoiceData.brand.companyName}</p>
                </div>
              </div>
              <div className="text-xs font-mono text-slate-400 flex justify-between">
                <span>Invoice: {invoiceData.invoiceNo}</span>
                <span>Date: {invoiceData.invoiceDate}</span>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                {[
                  ["Gross GMV", formatCurrency(invoiceData.waterfall.grossGmv), false],
                  [`Commission (${invoiceData.waterfall.commissionRate}%)`, formatCurrency(invoiceData.waterfall.commission), true],
                  ["GST on Commission (18%)", formatCurrency(invoiceData.waterfall.gstOnCommission), true],
                  ["TCS Deducted", formatCurrency(invoiceData.waterfall.tcsAmount), true],
                  ["TDS Deducted", formatCurrency(invoiceData.waterfall.tdsAmount), true],
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
                    <p className="text-xs text-green-700">Settled: {new Date(invoiceData.payout.settledAt).toLocaleDateString()}</p>
                  )}
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInvoiceDialogId(null); setInvoiceData(null); }}>Close</Button>
            {invoiceData && (
              <a href={invoiceData.socUrl} download>
                <Button variant="outline"><Download className="h-4 w-4 mr-2" />Download SoC</Button>
              </a>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
