import { useState } from "react";
import { useListOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2 } from "lucide-react";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

function EligibilityBadge({ status }: { status: string }) {
  switch (status) {
    case 'eligible':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent">Eligible</Badge>;
    case 'in_window':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent">In Window</Badge>;
    case 'on_hold':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100/80 border-transparent">On Hold</Badge>;
    case 'settled':
      return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100/80 border-transparent">Settled</Badge>;
    case 'awaiting_delivery':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent">Awaiting Delivery</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
  }
}

export function OrdersList() {
  const [search, setSearch] = useState("");
  const [eligibility, setEligibility] = useState<string>("all");
  
  // We explicitly cast the eligibility state to the type expected by the hook or undefined
  const eligibilityParam = eligibility === "all" ? undefined : (eligibility as any);

  const { data, isLoading } = useListOrders({ 
    search: search || undefined,
    eligibility: eligibilityParam
  });

  const totals = data?.totals;
  const bags = data?.bags;

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Order Tracking</h1>
          <p className="text-slate-500 mt-1">Bag-level register with settlement eligibility</p>
        </div>
      </div>

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
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(totals.totalTcs)} / {formatCurrency(totals.totalTds)}</div>
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
          <div className="w-48">
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
                <TableHead className="font-medium text-slate-500 h-10">SKU / State</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Dates</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right">GMV</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right">TCS / TDS</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 px-6">Eligibility</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : bags?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                    No orders found.
                  </TableCell>
                </TableRow>
              ) : (
                bags?.map((row) => (
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
                    <TableCell className="text-xs text-slate-600">
                      <div>Del: {row.deliveryDate ? new Date(row.deliveryDate).toLocaleDateString() : '-'}</div>
                      <div className="text-slate-400">Exp: {row.windowExpiryDate ? new Date(row.windowExpiryDate).toLocaleDateString() : '-'}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium text-slate-900">{formatCurrency(row.esp)}</div>
                      <div className="text-xs text-slate-500">Qty: {row.qty}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <div className="text-slate-700">{formatCurrency(row.tcsAmount)}</div>
                      <div className="text-slate-700">{formatCurrency(row.tdsAmount)}</div>
                    </TableCell>
                    <TableCell className="px-6">
                      <EligibilityBadge status={row.eligibility} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
