import { useLocation, useParams } from "wouter";
import { 
  useGetOnboarding, 
  useSubmitOnboarding,
  useApproveOnboarding,
  useRejectOnboarding,
  getGetOnboardingQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export function OnboardingDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: onboarding, isLoading } = useGetOnboarding(id, {
    query: { enabled: !!id, queryKey: getGetOnboardingQueryKey(id) }
  });

  const submitMutation = useSubmitOnboarding();
  const approveMutation = useApproveOnboarding();
  const rejectMutation = useRejectOnboarding();

  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (!onboarding) {
    return <div className="p-8 text-center text-slate-500">Onboarding not found</div>;
  }

  const handleSubmit = () => {
    submitMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Submitted for review" });
        queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey(id) });
      }
    });
  };

  const handleApprove = () => {
    approveMutation.mutate({ id, data: { notes: "Approved by finance ops" } }, {
      onSuccess: () => {
        toast({ title: "Onboarding approved" });
        queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey(id) });
      }
    });
  };

  const handleReject = () => {
    rejectMutation.mutate({ id, data: { rejectionReason: rejectNotes } }, {
      onSuccess: () => {
        toast({ title: "Onboarding rejected", variant: "destructive" });
        setShowRejectDialog(false);
        queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey(id) });
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <Button variant="ghost" className="px-0 text-slate-500 hover:bg-transparent mb-2" onClick={() => setLocation("/onboarding")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{onboarding.brandName}</h1>
            <Badge variant={onboarding.status === 'ACTIVE' ? 'default' : 'secondary'}>{onboarding.status}</Badge>
            <Badge variant="outline" className="font-mono text-xs">{onboarding.ref}</Badge>
          </div>
          <p className="text-slate-500">{onboarding.companyName}</p>
        </div>
        
        <div className="flex gap-2">
          {onboarding.status === 'DRAFT' && (
            <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
              <Send className="mr-2 h-4 w-4" /> Submit for Review
            </Button>
          )}
          {onboarding.status === 'SUBMITTED' && (
            <>
              <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
              <Button onClick={handleApprove} disabled={approveMutation.isPending} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="mr-2 h-4 w-4" /> Approve
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">Company & Tax Details</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-y-4">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Company Type</p>
              <p className="font-medium text-slate-900">{onboarding.companyType}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">PAN</p>
              <p className="font-mono text-sm text-slate-900">{onboarding.pan}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Master GSTIN</p>
              <p className="font-mono text-sm text-slate-900">{onboarding.masterGstin}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">KYB Status</p>
              <Badge variant="outline" className="bg-slate-50">{onboarding.kybStatus}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">Banking Information</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-y-4">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Bank Name</p>
              <p className="font-medium text-slate-900">{onboarding.bankName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Account Number</p>
              <p className="font-mono text-sm text-slate-900">{onboarding.bankAccount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">IFSC Code</p>
              <p className="font-mono text-sm text-slate-900">{onboarding.bankIfsc}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">Commercial Terms</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-y-4">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Commission Rate</p>
              <p className="font-medium text-slate-900">{onboarding.commissionRate}% ({onboarding.commissionType})</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Return Window</p>
              <p className="font-medium text-slate-900">{onboarding.returnWindowDays} Days</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">TCS Rate</p>
              <p className="font-medium text-slate-900">{onboarding.tcsRate}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">TDS Rate</p>
              <p className="font-medium text-slate-900">{onboarding.tdsRate}%</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">Warehouse Details</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-y-4">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Warehouse Name</p>
              <p className="font-medium text-slate-900">{onboarding.warehouseName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">State</p>
              <p className="font-medium text-slate-900">{onboarding.warehouseState}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Warehouse GSTIN</p>
              <p className="font-mono text-sm text-slate-900">{onboarding.warehouseGstin}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Address</p>
              <p className="text-sm text-slate-900">{onboarding.warehouseAddress}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Onboarding</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm text-slate-500">Provide a reason for rejection. This will be visible to the submitter.</p>
              <Textarea 
                placeholder="Missing documents, incorrect GSTIN, etc..." 
                value={rejectNotes} 
                onChange={e => setRejectNotes(e.target.value)} 
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectMutation.isPending || !rejectNotes.trim()}>
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
