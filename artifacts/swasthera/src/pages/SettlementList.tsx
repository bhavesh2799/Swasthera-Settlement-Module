import { useState } from "react";
import { Link } from "wouter";
import { useListSettlements, useCreateSettlement } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Plus, Loader2, ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPUTED':
      return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100/80 border-transparent">Computed</Badge>;
    case 'PENDING_APPROVAL':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent">Pending Approval</Badge>;
    case 'APPROVED':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent">Approved</Badge>;
    case 'PAID':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent">Paid</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
  }
}

export function SettlementList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  
  const statusParam = statusFilter === "all" ? undefined : (statusFilter as any);
  const { data: settlements, isLoading, refetch } = useListSettlements({ status: statusParam });
  const createMutation = useCreateSettlement();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCycle, setNewCycle] = useState("2023-10-W1");
  const [onboardingId, setOnboardingId] = useState("1"); // Mock selection

  const handleCreate = () => {
    createMutation.mutate({ data: { cycle: newCycle, onboardingId: parseInt(onboardingId) } }, {
      onSuccess: () => {
        toast({ title: "Settlement Computed" });
        setCreateDialogOpen(false);
        refetch();
      },
      onError: () => {
        toast({ title: "Computation Failed", variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settlements</h1>
          <p className="text-slate-500 mt-1">Compute deductions and review net payables</p>
        </div>
        
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-white shadow-sm border-slate-200">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="COMPUTED">Computed</SelectItem>
              <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
            </SelectContent>
          </Select>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-sm">
                <Calculator className="mr-2 h-4 w-4" /> Compute Run
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Run Settlement Computation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Settlement Cycle</label>
                  <Select value={newCycle} onValueChange={setNewCycle}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2023-10-W1">Oct 2023 - Week 1</SelectItem>
                      <SelectItem value="2023-10-W2">Oct 2023 - Week 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Brand (Onboarding ID)</label>
                  <Select value={onboardingId} onValueChange={setOnboardingId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Acme Corp (Brand A)</SelectItem>
                      <SelectItem value="2">Beta Ltd (Brand B)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Computing..." : "Run Engine"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-100">
                <TableHead className="font-medium text-slate-500 h-10 px-6">Cycle</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Brand</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right">Bags</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right">Gross GMV</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right">Net Payable</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right px-6"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : settlements?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                    No settlements found.
                  </TableCell>
                </TableRow>
              ) : (
                settlements?.map((row) => (
                  <TableRow key={row.id} className="border-slate-100/50 group">
                    <TableCell className="px-6 font-mono text-sm text-slate-700">{row.cycle}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.brandName}</div>
                      <div className="text-xs text-slate-500">{row.companyName}</div>
                    </TableCell>
                    <TableCell className="text-right text-slate-600">{row.eligibleBags}</TableCell>
                    <TableCell className="text-right text-slate-600">{formatCurrency(row.grossGmv)}</TableCell>
                    <TableCell className="text-right font-medium text-slate-900">{formatCurrency(row.netPayable)}</TableCell>
                    <TableCell className="text-center"><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="text-right px-6">
                      <Button asChild variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary hover:bg-primary/5">
                        <Link href={`/settlements/${row.id}`}>Review <ArrowUpRight className="ml-1 h-3 w-3" /></Link>
                      </Button>
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
