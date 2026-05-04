import { useState } from "react";
import { 
  useListPayouts, 
  useRecordUtr 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'SETTLED':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent">Settled</Badge>;
    case 'UTR_RECORDED':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent">UTR Recorded</Badge>;
    case 'INITIATED':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent">Initiated</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
  }
}

export function PayoutList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  
  const statusParam = statusFilter === "all" ? undefined : (statusFilter as any);
  const { data: payouts, isLoading, refetch } = useListPayouts({ status: statusParam });
  const utrMutation = useRecordUtr();

  const [activePayoutId, setActivePayoutId] = useState<number | null>(null);
  const [utrValue, setUtrValue] = useState("");

  const handleRecordUtr = () => {
    if (!activePayoutId || !utrValue.trim()) return;
    
    // Find the exact payout to get the amount (needed for the API)
    const payout = payouts?.find(p => p.id === activePayoutId);
    if (!payout) return;

    utrMutation.mutate({ 
      id: activePayoutId, 
      data: { 
        utr: utrValue, 
        amountCredited: payout.amount,
        bankAckAt: new Date().toISOString()
      } 
    }, {
      onSuccess: () => {
        toast({ title: "UTR Recorded Successfully" });
        setActivePayoutId(null);
        setUtrValue("");
        refetch();
      },
      onError: () => {
        toast({ title: "Failed to record UTR", variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payouts</h1>
          <p className="text-slate-500 mt-1">Manage bank transfers and UTR reconciliation</p>
        </div>
        
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-white shadow-sm border-slate-200">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="INITIATED">Initiated</SelectItem>
              <SelectItem value="UTR_RECORDED">UTR Recorded</SelectItem>
              <SelectItem value="SETTLED">Settled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-100">
                <TableHead className="font-medium text-slate-500 h-10 px-6">Payment Ref</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Brand / Cycle</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Beneficiary Info</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-right">Amount</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 text-center">Status</TableHead>
                <TableHead className="font-medium text-slate-500 h-10 px-6">UTR / Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : payouts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                    No payouts found.
                  </TableCell>
                </TableRow>
              ) : (
                payouts?.map((row) => (
                  <TableRow key={row.id} className="border-slate-100/50">
                    <TableCell className="px-6 font-mono text-xs text-slate-700">{row.paymentRef}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.brandName}</div>
                      <div className="text-xs font-mono text-slate-500">{row.cycle}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-slate-700">{row.bankName}</div>
                      <div className="font-mono text-xs text-slate-500">A/C: {row.bankAccount}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-900">{formatCurrency(row.amount)}</TableCell>
                    <TableCell className="text-center"><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="px-6">
                      {row.status === 'INITIATED' ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-xs border-slate-300"
                          onClick={() => setActivePayoutId(row.id)}
                        >
                          Record UTR
                        </Button>
                      ) : (
                        <div className="font-mono text-xs text-slate-700 font-medium">
                          {row.utr || '-'}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={activePayoutId !== null} onOpenChange={(open) => !open && setActivePayoutId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Bank UTR</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Bank Reference Number (UTR)</label>
              <Input 
                placeholder="e.g. CMS1234567890" 
                value={utrValue}
                onChange={e => setUtrValue(e.target.value)}
                className="font-mono"
              />
            </div>
            <p className="text-xs text-slate-500">
              Recording this UTR will mark the payout as completed and notify the brand.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivePayoutId(null)}>Cancel</Button>
            <Button onClick={handleRecordUtr} disabled={utrMutation.isPending || !utrValue.trim()}>
              {utrMutation.isPending ? "Recording..." : "Save UTR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
