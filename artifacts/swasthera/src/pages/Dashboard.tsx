import { Link } from "wouter";
import { 
  useGetDashboardSummary, 
  useGetBrandSettlements, 
  useGetActivity 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Activity, Clock, CheckCircle2, AlertCircle } from "lucide-react";

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

export function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: settlements, isLoading: isLoadingSettlements } = useGetBrandSettlements();
  const { data: activities, isLoading: isLoadingActivity } = useGetActivity({ limit: 10 });

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
    </div>
  );
}
