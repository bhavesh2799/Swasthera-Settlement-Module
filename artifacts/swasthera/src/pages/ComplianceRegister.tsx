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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calendar, FileText, CheckCircle2, AlertCircle } from "lucide-react";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'Filed':
    case 'Deposited':
    case 'Paid':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent">{status}</Badge>;
    case 'Pending':
    case 'Accrued':
    case 'Upcoming':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent">{status}</Badge>;
    case 'Overdue':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100/80 border-transparent">{status}</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
  }
}

export function ComplianceRegister() {
  const [month, setMonth] = useState("May");
  const [year, setYear] = useState("2026");
  
  const { data: summary, isLoading: isLoadingSummary } = useGetTcsTdsSummary({ month, year: parseInt(year) });
  const { data: tcsRecords, isLoading: isLoadingTcs } = useListTcsRecords({ month, year: parseInt(year) });
  const { data: tdsRecords, isLoading: isLoadingTds } = useListTdsRecords({ month, year: parseInt(year) });
  const { data: calendar, isLoading: isLoadingCalendar } = useGetComplianceCalendar();

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Compliance & Tax</h1>
          <p className="text-slate-500 mt-1">TCS/TDS registers and GSTR-8 filing status</p>
        </div>
        <div className="flex gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32 bg-white">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="January">January</SelectItem>
              <SelectItem value="February">February</SelectItem>
              <SelectItem value="March">March</SelectItem>
              <SelectItem value="April">April</SelectItem>
              <SelectItem value="May">May</SelectItem>
              <SelectItem value="June">June</SelectItem>
              <SelectItem value="July">July</SelectItem>
              <SelectItem value="August">August</SelectItem>
              <SelectItem value="September">September</SelectItem>
              <SelectItem value="October">October</SelectItem>
              <SelectItem value="November">November</SelectItem>
              <SelectItem value="December">December</SelectItem>
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 bg-white">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoadingSummary ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">TCS Accrued (State-wise)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(summary.tcsAccrued)}</div>
              <div className="flex items-center mt-1 text-xs text-slate-500">
                Due: <span className="font-medium text-slate-700 ml-1">{new Date(summary.tcsPaymentDue).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">TDS Deducted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(summary.tdsDeducted)}</div>
              <div className="flex items-center mt-1 text-xs text-slate-500">
                Deposit Due: <span className="font-medium text-slate-700 ml-1">{new Date(summary.tdsDepositDue).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">GSTR-8 Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <StatusBadge status={summary.gstr8Status} />
                {summary.gstr8Status === 'Filed' ? 
                  <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                }
              </div>
              <p className="text-xs text-slate-500 mt-2">Due: {new Date(summary.gstr8DueDate).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Tabs defaultValue="tcs" className="w-full">
        <TabsList className="bg-slate-200/50 mb-4">
          <TabsTrigger value="tcs" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">TCS Register (State-wise)</TabsTrigger>
          <TabsTrigger value="tds" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">TDS Register</TabsTrigger>
          <TabsTrigger value="calendar" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Compliance Calendar</TabsTrigger>
        </TabsList>
        
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
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingTcs ? (
                    <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : tcsRecords?.map((row) => (
                    <TableRow key={row.id} className="border-slate-100/50">
                      <TableCell className="px-6 font-medium text-slate-900">{row.stateName} ({row.stateCode})</TableCell>
                      <TableCell className="font-mono text-sm">{row.stateGstin}</TableCell>
                      <TableCell className="text-slate-600">{row.brandName}</TableCell>
                      <TableCell className="text-right text-slate-600">{formatCurrency(row.taxableSupply)}</TableCell>
                      <TableCell className="text-right font-medium text-slate-900">{formatCurrency(row.tcsAmount)} <span className="text-xs text-slate-400 font-normal">@{row.tcsRate}%</span></TableCell>
                      <TableCell className="text-center"><StatusBadge status={row.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

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
                    <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingTds ? (
                    <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : tdsRecords?.map((row) => (
                    <TableRow key={row.id} className="border-slate-100/50">
                      <TableCell className="px-6 font-medium text-slate-900">{row.companyName}</TableCell>
                      <TableCell className="font-mono text-sm">{row.tan}</TableCell>
                      <TableCell className="text-right text-slate-600">{formatCurrency(row.grossPayment)}</TableCell>
                      <TableCell className="text-right font-medium text-slate-900">{formatCurrency(row.tdsAmount)} <span className="text-xs text-slate-400 font-normal">@{row.tdsRate}%</span></TableCell>
                      <TableCell className="text-right text-slate-600">{formatCurrency(row.netPaid)}</TableCell>
                      <TableCell className="text-center"><StatusBadge status={row.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="m-0">
          <Card className="shadow-sm border-slate-200/60 bg-white">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-100">
                    <TableHead className="font-medium text-slate-500 h-10 px-6">Due Date</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Obligation</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Section</TableHead>
                    <TableHead className="font-medium text-slate-500 h-10">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingCalendar ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : calendar?.map((row) => (
                    <TableRow key={row.id} className="border-slate-100/50">
                      <TableCell className="px-6 font-medium text-slate-900 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        {new Date(row.dueDate).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      </TableCell>
                      <TableCell className="text-slate-900">{row.obligation}</TableCell>
                      <TableCell className="font-mono text-sm text-slate-500 flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        {row.section}
                      </TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
