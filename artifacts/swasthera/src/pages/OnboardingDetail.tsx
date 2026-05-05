import { useLocation, useParams } from "wouter";
import { 
  useGetOnboarding, 
  useSubmitOnboarding,
  useApproveOnboarding,
  useRejectOnboarding,
  getGetOnboardingQueryKey
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, Send, Shield, ShieldCheck, ShieldAlert, FileText, Upload, Plus, RefreshCw, Building2, ExternalLink, Warehouse, Store, MapPin, Tag, ChevronDown, ChevronRight, Percent } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useRole } from "@/contexts/RoleContext";
import { Separator } from "@/components/ui/separator";

interface BrandItem {
  id: number;
  brandCode: string;
  companyId: string;
  onboardingId: number;
  brandName: string;
  brandLegalName: string | null;
  brandCategory: string;
  brandType: string;
  status: string;
  commissionRate: number;
  commissionType: string;
  tierConfig: Array<{ minGmv: number; maxGmv: number | null; rate: number }> | null;
  returnWindowDays: number;
  tcsRate: number;
  tdsRate: number;
  tcsApplicable: boolean;
  fyndBrandId: string | null;
}

interface WarehouseItem {
  id: number;
  warehouseCode: string;
  brandId: number;
  warehouseName: string;
  warehouseState: string;
  warehouseGstin: string;
  warehouseAddress: string;
  isPrimary: boolean;
  isActive: boolean;
  stateCode: string | null;
  fyndLocationId: string | null;
}

interface CommissionVersion {
  id: number;
  commissionType: string;
  commissionPercent: number | null;
  effectiveFromDate: string;
  effectiveToDate: string | null;
  isCurrent: boolean;
  notes: string | null;
  agreedByMakerId: string | null;
  approvedByCheckerId: string | null;
  createdAt: string;
}

const DOC_FIELDS = [
  { key: "panDocUrl", label: "PAN Copy", required: true, hint: "Scanned PAN card" },
  { key: "gstCertUrl", label: "GST Certificate", required: true, hint: "GST registration certificate" },
  { key: "cancelledChequeUrl", label: "Cancelled Cheque", required: true, hint: "Bank account verification" },
  { key: "signedAgreementUrl", label: "Signed Agreement", required: true, hint: "Signed commercial agreement with Swasthera" },
  { key: "digitalSignatureUrl", label: "Digital Signature", required: true, hint: "Authorised signatory digital signature" },
  { key: "cinDocUrl", label: "CIN Certificate", required: false, hint: "Required for Private/Public Ltd" },
] as const;

type DocKey = typeof DOC_FIELDS[number]["key"];

function kybBadge(status: string) {
  if (status === "PASSED") return <Badge className="bg-green-100 text-green-800 border-transparent hover:bg-green-100"><ShieldCheck className="mr-1 h-3 w-3" />KYB Passed</Badge>;
  if (status === "FAILED") return <Badge className="bg-red-100 text-red-800 border-transparent hover:bg-red-100"><ShieldAlert className="mr-1 h-3 w-3" />KYB Failed</Badge>;
  if (status === "PENDING") return <Badge className="bg-amber-100 text-amber-800 border-transparent hover:bg-amber-100"><RefreshCw className="mr-1 h-3 w-3" />KYB Pending</Badge>;
  return <Badge variant="outline"><Shield className="mr-1 h-3 w-3" />KYB Not Started</Badge>;
}

export function OnboardingDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role, isMaker, isChecker } = useRole();

  const { data: onboarding, isLoading } = useGetOnboarding(id, {
    query: { enabled: !!id, queryKey: getGetOnboardingQueryKey(id) }
  });

  // Commission history
  const { data: commissionHistory, refetch: refetchCommission } = useQuery<CommissionVersion[]>({
    queryKey: ["commission-master", id],
    queryFn: async () => {
      const r = await fetch(`/api/commission-master/${id}`);
      return r.json();
    },
    enabled: !!id,
  });

  const submitMutation = useSubmitOnboarding();
  const approveMutation = useApproveOnboarding();
  const rejectMutation = useRejectOnboarding();

  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showCommissionDialog, setShowCommissionDialog] = useState(false);
  const [kybLoading, setKybLoading] = useState(false);
  const [kybResult, setKybResult] = useState<{ kybStatus: string; message: string } | null>(null);
  const [newCommission, setNewCommission] = useState({ commissionPercent: "", effectiveFromDate: new Date().toISOString().split("T")[0], notes: "" });
  const [updatingDoc, setUpdatingDoc] = useState<DocKey | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Brands & Warehouses
  const { data: brands, refetch: refetchBrands } = useQuery<BrandItem[]>({
    queryKey: ["brands", id],
    queryFn: async () => {
      const r = await fetch(`/api/onboardings/${id}/brands`);
      if (!r.ok) throw new Error("Failed to load brands");
      return r.json();
    },
    enabled: !!id,
  });

  const [expandedBrands, setExpandedBrands] = useState<Set<number>>(new Set());
  const toggleBrand = (brandId: number) =>
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      next.has(brandId) ? next.delete(brandId) : next.add(brandId);
      return next;
    });

  const [showAddBrand, setShowAddBrand] = useState(false);
  const [addBrandForm, setAddBrandForm] = useState({
    brandName: "", brandLegalName: "", brandCategory: "", brandType: "RETAILER",
    commissionType: "FLAT_PERCENT", commissionRate: "", returnWindowDays: "15",
    tcsRate: "1", tdsRate: "1",
  });
  const [addBrandLoading, setAddBrandLoading] = useState(false);

  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [addWarehouseBrandId, setAddWarehouseBrandId] = useState<number | null>(null);
  const [addWarehouseForm, setAddWarehouseForm] = useState({
    warehouseName: "", warehouseState: "", warehouseGstin: "", warehouseAddress: "", isPrimary: false,
  });
  const [addWarehouseLoading, setAddWarehouseLoading] = useState(false);

  const [warehousesByBrand, setWarehousesByBrand] = useState<Record<number, WarehouseItem[]>>({});

  const loadWarehouses = async (brandId: number) => {
    const r = await fetch(`/api/brands/${brandId}/warehouses`);
    if (!r.ok) return;
    const data: WarehouseItem[] = await r.json();
    setWarehousesByBrand((prev) => ({ ...prev, [brandId]: data }));
  };

  const handleExpandBrand = (brandId: number) => {
    toggleBrand(brandId);
    if (!expandedBrands.has(brandId)) {
      loadWarehouses(brandId);
    }
  };

  const handleAddBrand = async () => {
    if (!addBrandForm.brandName || !addBrandForm.brandCategory || !addBrandForm.brandType) return;
    setAddBrandLoading(true);
    try {
      const r = await fetch(`/api/onboardings/${id}/brands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addBrandForm,
          commissionRate: parseFloat(addBrandForm.commissionRate) || 0,
          returnWindowDays: parseInt(addBrandForm.returnWindowDays) || 15,
          tcsRate: parseFloat(addBrandForm.tcsRate) || 1,
          tdsRate: parseFloat(addBrandForm.tdsRate) || 1,
        }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Brand added successfully" });
      setShowAddBrand(false);
      setAddBrandForm({ brandName: "", brandLegalName: "", brandCategory: "", brandType: "RETAILER", commissionType: "FLAT_PERCENT", commissionRate: "", returnWindowDays: "15", tcsRate: "1", tdsRate: "1" });
      refetchBrands();
    } catch {
      toast({ title: "Failed to add brand", variant: "destructive" });
    } finally {
      setAddBrandLoading(false);
    }
  };

  const handleAddWarehouse = async () => {
    if (!addWarehouseBrandId || !addWarehouseForm.warehouseName || !addWarehouseForm.warehouseGstin) return;
    setAddWarehouseLoading(true);
    try {
      const r = await fetch(`/api/brands/${addWarehouseBrandId}/warehouses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addWarehouseForm),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Warehouse added successfully" });
      setShowAddWarehouse(false);
      setAddWarehouseForm({ warehouseName: "", warehouseState: "", warehouseGstin: "", warehouseAddress: "", isPrimary: false });
      loadWarehouses(addWarehouseBrandId);
    } catch {
      toast({ title: "Failed to add warehouse", variant: "destructive" });
    } finally {
      setAddWarehouseLoading(false);
    }
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey(id) });

  const handleKyb = async () => {
    setKybLoading(true);
    setKybResult(null);
    try {
      const r = await fetch(`/api/onboardings/${id}/kyb-check`, { method: "POST" });
      const data = await r.json();
      setKybResult(data);
      toast({
        title: data.kybStatus === "PASSED" ? "KYB Verification Passed" : "KYB Verification Failed",
        description: data.message,
        variant: data.kybStatus === "PASSED" ? "default" : "destructive",
      });
      invalidate();
    } catch {
      toast({ title: "KYB check failed", variant: "destructive" });
    } finally {
      setKybLoading(false);
    }
  };

  const handleDocUpload = (docKey: DocKey) => {
    setUpdatingDoc(docKey);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !updatingDoc) return;
    const filename = e.target.files[0].name;
    const fakeUrl = `https://docs.swasthera.in/kyb/${id}/${updatingDoc}/${filename}`;
    try {
      await fetch(`/api/onboardings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [updatingDoc]: fakeUrl }),
      });
      toast({ title: `${filename} uploaded successfully` });
      invalidate();
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    e.target.value = "";
    setUpdatingDoc(null);
  };

  const handleAddCommissionVersion = async () => {
    if (!newCommission.commissionPercent || !newCommission.effectiveFromDate) return;
    try {
      await fetch(`/api/commission-master/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionType: "FLAT_PERCENT",
          commissionPercent: parseFloat(newCommission.commissionPercent),
          effectiveFromDate: newCommission.effectiveFromDate,
          notes: newCommission.notes,
        }),
      });
      toast({ title: "Commission rate updated and versioned" });
      setShowCommissionDialog(false);
      setNewCommission({ commissionPercent: "", effectiveFromDate: new Date().toISOString().split("T")[0], notes: "" });
      refetchCommission();
      invalidate();
    } catch {
      toast({ title: "Failed to update commission", variant: "destructive" });
    }
  };

  const handleSubmit = () => {
    submitMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Submitted for Checker review" }); invalidate(); },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Submission failed";
        toast({ title: msg.includes("KYB") ? "KYB required before submission" : "Submission failed", description: msg, variant: "destructive" });
      }
    });
  };

  const handleApprove = () => {
    approveMutation.mutate({ id, data: { notes: "Approved — all documents verified" } }, {
      onSuccess: () => { toast({ title: "Onboarding approved — Fynd sync initiated" }); invalidate(); }
    });
  };

  const handleReject = () => {
    rejectMutation.mutate({ id, data: { rejectionReason: rejectNotes } }, {
      onSuccess: () => { toast({ title: "Onboarding rejected", variant: "destructive" }); setShowRejectDialog(false); invalidate(); }
    });
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (!onboarding) return <div className="p-8 text-center text-slate-500">Onboarding not found</div>;

  const kybPassed = onboarding.kybStatus === "PASSED";
  const docsComplete = (onboarding.docsUploaded ?? 0) >= 5;

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <Button variant="ghost" className="px-0 text-slate-500 hover:bg-transparent mb-1" onClick={() => setLocation("/onboarding")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{onboarding.brandName}</h1>
            <Badge variant={onboarding.status === "ACTIVE" || onboarding.status === "APPROVED" ? "default" : "secondary"}>{onboarding.status}</Badge>
            <Badge variant="outline" className="font-mono text-xs">{onboarding.ref}</Badge>
            {kybBadge(onboarding.kybStatus ?? "NOT_STARTED")}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <p className="text-slate-500">{onboarding.companyName}</p>
            <span className="text-slate-300">·</span>
            <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
              CO-{String(id).padStart(5, "0")}
            </span>
            {brands && brands.length > 0 && (
              <span className="text-xs text-slate-500">{brands.length} brand{brands.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* BRD §3.1: Maker sees Submit; cannot Approve/Reject. Checker sees Approve/Reject; cannot Submit */}
          {isMaker && onboarding.status === "DRAFT" && (
            <Button onClick={handleSubmit} disabled={submitMutation.isPending || !kybPassed}>
              <Send className="mr-2 h-4 w-4" />
              {kybPassed ? "Submit for Review" : "KYB Required First"}
            </Button>
          )}
          {isChecker && onboarding.status === "SUBMITTED" && (
            <>
              <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
              <Button onClick={handleApprove} disabled={approveMutation.isPending} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="mr-2 h-4 w-4" /> Approve
              </Button>
            </>
          )}
          {isMaker && onboarding.status === "SUBMITTED" && (
            <Badge variant="outline" className="px-3 py-1.5 text-amber-700 border-amber-200 bg-amber-50">
              Awaiting Checker review
            </Badge>
          )}
          {isChecker && (onboarding.status === "DRAFT" || onboarding.status === "REJECTED") && (
            <Badge variant="outline" className="px-3 py-1.5 text-slate-500">
              Maker must submit first
            </Badge>
          )}
        </div>
      </div>

      {/* KYB Panel */}
      <Card className={`shadow-sm border ${kybPassed ? "border-green-200 bg-green-50/30" : onboarding.kybStatus === "FAILED" ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30"}`}>
        <CardHeader className="py-4 border-b border-inherit">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4" />
            KYB Verification — BRD Phase Gate
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <p className="text-sm text-slate-600">
              KYB verifies <strong>PAN, GST registration, CIN, and Bank account</strong> via the KYB API. This must pass before document upload or Checker submission.
            </p>
            {!!(onboarding as unknown as Record<string, unknown>).kybVerifiedAt && (
              <p className="text-xs text-slate-500">Last checked: {new Date((onboarding as unknown as Record<string, unknown>).kybVerifiedAt as string).toLocaleString()} · Attempts: {(onboarding as unknown as Record<string, unknown>).kybAttempts as number}</p>
            )}
            {kybResult && (
              <p className={`text-sm font-medium mt-1 ${kybResult.kybStatus === "PASSED" ? "text-green-700" : "text-red-700"}`}>
                {kybResult.message}
              </p>
            )}
          </div>
          {isMaker && onboarding.status === "DRAFT" && (
            <Button
              variant={kybPassed ? "outline" : "default"}
              onClick={handleKyb}
              disabled={kybLoading}
              className="shrink-0"
            >
              {kybLoading ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : kybPassed ? <><ShieldCheck className="mr-2 h-4 w-4" />Re-run KYB</> : <><Shield className="mr-2 h-4 w-4" />Run KYB Check</>}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Company & Tax */}
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">Company & Tax Details</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-y-4 gap-x-6">
            {[
              ["Company Type", onboarding.companyType],
              ["PAN", onboarding.pan],
              ["Master GSTIN", onboarding.masterGstin],
              ["TAN", onboarding.tan || "—"],
              ["CIN", onboarding.cin || "—"],
              ["State Code", (onboarding as unknown as Record<string, unknown>).stateCode as string || onboarding.masterGstin?.substring(0, 2) || "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className="font-mono text-sm text-slate-900">{value}</p>
              </div>
            ))}
            {!!(onboarding as unknown as Record<string, unknown>).registeredAddress && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Registered Address</p>
                <p className="text-sm text-slate-900">{(onboarding as unknown as Record<string, unknown>).registeredAddress as string}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Brand Details */}
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">Brand Details</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-y-4 gap-x-6">
            {[
              ["Brand Name", onboarding.brandName],
              ["Brand Legal Name", (onboarding as { brandLegalName?: string }).brandLegalName || "—"],
              ["Category", onboarding.brandCategory],
              ["Brand Type", onboarding.brandType],
              ["TCS Applicable", (onboarding as { tcsApplicable?: boolean }).tcsApplicable !== false ? "Yes" : "No"],
              ["Return Window", `${onboarding.returnWindowDays} days`],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className="text-sm font-medium text-slate-900">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Banking */}
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">Banking Information</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-y-4 gap-x-6">
            {[
              ["Bank Name", onboarding.bankName],
              ["IFSC Code", onboarding.bankIfsc],
              ["Account Number", onboarding.bankAccount],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className="font-mono text-sm text-slate-900">{value}</p>
              </div>
            ))}
            {onboarding.spocName && (
              <div className="col-span-2 pt-2 border-t border-slate-100 mt-2">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Finance SPOC</p>
                <div className="text-sm text-slate-900 space-y-1">
                  <p className="font-medium">{onboarding.spocName}</p>
                  <p className="text-slate-500">{onboarding.spocEmail}</p>
                  <p className="text-slate-500">{onboarding.spocMobile}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Warehouse */}
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold text-slate-800">Warehouse Details</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-y-4 gap-x-6">
            {[
              ["Warehouse Name", onboarding.warehouseName],
              ["State", onboarding.warehouseState],
              ["Warehouse GSTIN", onboarding.warehouseGstin],
              ["TCS Filing State", onboarding.warehouseGstin?.substring(0, 2) || "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className="font-mono text-sm text-slate-900">{value}</p>
              </div>
            ))}
            <div className="col-span-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Address</p>
              <p className="text-sm text-slate-900">{onboarding.warehouseAddress}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document Checklist — BRD §3.1 */}
      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Document Checklist
            <span className="text-xs font-normal text-slate-500 ml-1">({onboarding.docsUploaded ?? 0} of {onboarding.docsRequired ?? 6} uploaded)</span>
          </CardTitle>
          {!kybPassed && (
            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">KYB must pass before uploads</Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {DOC_FIELDS.map(({ key, label, required, hint }) => {
              const uploaded = !!(onboarding as unknown as Record<string, unknown>)[key];
              const url = (onboarding as unknown as Record<string, unknown>)[key] as string | undefined;
              return (
                <div key={key} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    {uploaded
                      ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      : <div className="h-4 w-4 rounded-full border-2 border-slate-300 shrink-0" />
                    }
                    <div>
                      <p className="text-sm font-medium text-slate-900">{label} {required && <span className="text-red-500">*</span>}</p>
                      <p className="text-xs text-slate-500">{hint}</p>
                      {uploaded && url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                          {url.split("/").pop()} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {isMaker && kybPassed && (onboarding.status === "DRAFT" || onboarding.status === "REJECTED") && (
                    <Button size="sm" variant={uploaded ? "outline" : "default"} onClick={() => handleDocUpload(key)} className="text-xs">
                      <Upload className="mr-1.5 h-3.5 w-3.5" />{uploaded ? "Replace" : "Upload"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Commission Master — Versioned Rates — BRD §3.4 */}
      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Commission Master — Versioned History
          </CardTitle>
          {isMaker && onboarding.status !== "SUBMITTED" && (
            <Button size="sm" variant="outline" onClick={() => setShowCommissionDialog(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Rate Version
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!commissionHistory || commissionHistory.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-400">No commission history recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {[...commissionHistory].reverse().map((v) => (
                <div key={v.id} className={`flex items-center justify-between px-6 py-3.5 ${v.isCurrent ? "bg-green-50/30" : ""}`}>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{v.commissionPercent}% {v.commissionType === "FLAT_PERCENT" ? "Flat" : "Tiered"}</span>
                      {v.isCurrent && <Badge className="bg-green-100 text-green-800 border-transparent text-xs hover:bg-green-100">Current</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">
                      Effective: {v.effectiveFromDate}{v.effectiveToDate ? ` → ${v.effectiveToDate}` : " (no end date)"}
                    </p>
                    {v.notes && <p className="text-xs text-slate-400 italic">{v.notes}</p>}
                    {v.approvedByCheckerId && <p className="text-xs text-slate-400">Approved by {v.approvedByCheckerId}</p>}
                  </div>
                  <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brands & Warehouses */}
      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Store className="h-4 w-4" />
            Brands & Warehouses
            <span className="text-xs font-normal text-slate-500 ml-1">({brands?.length ?? 0} brand{(brands?.length ?? 0) !== 1 ? "s" : ""})</span>
          </CardTitle>
          {isMaker && onboarding.status !== "SUBMITTED" && (
            <Button size="sm" variant="outline" onClick={() => setShowAddBrand(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Brand
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!brands || brands.length === 0 ? (
            <div className="px-6 py-10 text-center space-y-2">
              <Store className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-400">No additional brands registered yet.</p>
              {isMaker && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowAddBrand(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add First Brand
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {brands.map((brand) => {
                const isExpanded = expandedBrands.has(brand.id);
                const warehouses = warehousesByBrand[brand.id];
                return (
                  <div key={brand.id}>
                    {/* Brand Row */}
                    <div
                      className="flex items-center gap-3 px-6 py-4 cursor-pointer hover:bg-slate-50/60 transition-colors"
                      onClick={() => handleExpandBrand(brand.id)}
                    >
                      <div className="shrink-0 text-slate-400">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">{brand.brandName}</span>
                          <Badge
                            className={`text-[10px] border-transparent ${
                              brand.status === "ACTIVE" ? "bg-green-100 text-green-800 hover:bg-green-100" :
                              brand.status === "INACTIVE" ? "bg-slate-100 text-slate-600 hover:bg-slate-100" :
                              "bg-amber-100 text-amber-800 hover:bg-amber-100"
                            }`}
                          >
                            {brand.status}
                          </Badge>
                          <span className="font-mono text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                            {brand.brandCode}
                          </span>
                          <span className="text-xs text-slate-400">{brand.brandCategory} · {brand.brandType}</span>
                        </div>
                        {brand.brandLegalName && (
                          <p className="text-xs text-slate-500 mt-0.5">{brand.brandLegalName}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right space-y-0.5">
                        {brand.commissionType === "TIERED" ? (
                          <div className="flex items-center gap-1 text-xs font-medium text-amber-700">
                            <Percent className="h-3 w-3" />
                            Tiered ({brand.tierConfig?.length ?? 0} slabs)
                          </div>
                        ) : (
                          <div className="text-xs font-medium text-slate-700">
                            {brand.commissionRate}% commission
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400">{brand.returnWindowDays}d return window</div>
                      </div>
                    </div>

                    {/* Expanded: Warehouses + commercial detail */}
                    {isExpanded && (
                      <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 space-y-4">
                        {/* Brand IDs row */}
                        <div className="flex flex-wrap gap-4 text-xs">
                          <div>
                            <span className="text-slate-400 uppercase tracking-wider font-medium mr-1.5">Brand ID</span>
                            <span className="font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700">{brand.brandCode}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 uppercase tracking-wider font-medium mr-1.5">Company ID</span>
                            <span className="font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700">{brand.companyId}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 uppercase tracking-wider font-medium mr-1.5">TCS</span>
                            <span className="text-slate-700">{brand.tcsRate}%</span>
                          </div>
                          <div>
                            <span className="text-slate-400 uppercase tracking-wider font-medium mr-1.5">TDS</span>
                            <span className="text-slate-700">{brand.tdsRate}%</span>
                          </div>
                        </div>

                        {/* Tier slabs if TIERED */}
                        {brand.commissionType === "TIERED" && brand.tierConfig && brand.tierConfig.length > 0 && (
                          <div className="rounded border border-amber-200 bg-amber-50/60 p-3">
                            <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                              <Percent className="h-3 w-3" /> GMV Tier Slabs
                            </p>
                            <div className="grid grid-cols-3 gap-px bg-amber-200/50 rounded overflow-hidden text-xs">
                              <div className="bg-amber-50 px-2 py-1 font-medium text-amber-700">Min GMV (₹)</div>
                              <div className="bg-amber-50 px-2 py-1 font-medium text-amber-700">Max GMV (₹)</div>
                              <div className="bg-amber-50 px-2 py-1 font-medium text-amber-700">Rate (%)</div>
                              {brand.tierConfig.map((slab, i) => (
                                <>
                                  <div key={`min-${i}`} className="bg-white px-2 py-1 font-mono">{slab.minGmv.toLocaleString("en-IN")}</div>
                                  <div key={`max-${i}`} className="bg-white px-2 py-1 font-mono">{slab.maxGmv != null ? slab.maxGmv.toLocaleString("en-IN") : "Unlimited"}</div>
                                  <div key={`rate-${i}`} className="bg-white px-2 py-1 font-mono">{slab.rate}%</div>
                                </>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Warehouses */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                              <Warehouse className="h-3.5 w-3.5" />
                              Warehouses ({warehouses?.length ?? "..."})
                            </p>
                            {isMaker && onboarding.status !== "SUBMITTED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddWarehouseBrandId(brand.id);
                                  setShowAddWarehouse(true);
                                }}
                              >
                                <Plus className="mr-1 h-3 w-3" /> Add Warehouse
                              </Button>
                            )}
                          </div>
                          {!warehouses ? (
                            <p className="text-xs text-slate-400 pl-1">Loading...</p>
                          ) : warehouses.length === 0 ? (
                            <p className="text-xs text-slate-400 pl-1">No warehouses registered for this brand.</p>
                          ) : (
                            <div className="space-y-2">
                              {warehouses.map((wh) => (
                                <div key={wh.id} className="bg-white rounded border border-slate-200 px-4 py-3 flex items-start gap-3">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium text-slate-900">{wh.warehouseName}</span>
                                      {wh.isPrimary && (
                                        <Badge className="text-[10px] bg-blue-100 text-blue-800 border-transparent hover:bg-blue-100">Primary</Badge>
                                      )}
                                      <span className="font-mono text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">{wh.warehouseCode}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                                      <span>{wh.warehouseState}</span>
                                      <span className="font-mono">{wh.warehouseGstin}</span>
                                      {wh.stateCode && <span>State: {wh.stateCode}</span>}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">{wh.warehouseAddress}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fynd Sync IDs — post-approval */}
      {onboarding.fyndCompanyCode && (
        <Card className="shadow-sm border-blue-100 bg-blue-50/30">
          <CardHeader className="border-b border-blue-100 py-4">
            <CardTitle className="text-base font-semibold text-blue-900">Fynd Sync Complete — Phase 2</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-3 gap-4">
            {[
              ["Fynd Company Code", onboarding.fyndCompanyCode],
              ["Fynd Brand ID", onboarding.fyndBrandId],
              ["Fynd Location ID", onboarding.fyndLocationId],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-blue-600 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className="font-mono text-sm text-blue-900">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Checker Notes (if reviewed) */}
      {onboarding.checkerNotes && (
        <Card className={`shadow-sm ${onboarding.status === "REJECTED" ? "border-red-200 bg-red-50/30" : "border-green-200 bg-green-50/30"}`}>
          <CardContent className="p-5 flex gap-3 items-start">
            {onboarding.status === "REJECTED" ? <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" /> : <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />}
            <div>
              <p className="text-sm font-medium text-slate-900">{onboarding.checkerName} — {new Date(onboarding.reviewedAt!).toLocaleDateString()}</p>
              <p className="text-sm text-slate-600 mt-1">{onboarding.checkerNotes}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Brand Dialog */}
      <Dialog open={showAddBrand} onOpenChange={setShowAddBrand}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Brand</DialogTitle>
            <DialogDescription>Register a new brand under <strong>CO-{String(id).padStart(5, "0")}</strong>. You can add warehouses after.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Brand Display Name <span className="text-red-500">*</span></Label>
                <Input value={addBrandForm.brandName} onChange={(e) => setAddBrandForm((p) => ({ ...p, brandName: e.target.value }))} placeholder="Zara India" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Brand Legal Name</Label>
                <Input value={addBrandForm.brandLegalName} onChange={(e) => setAddBrandForm((p) => ({ ...p, brandLegalName: e.target.value }))} placeholder="Zara Fashions Pvt Ltd" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Category <span className="text-red-500">*</span></Label>
                <Input value={addBrandForm.brandCategory} onChange={(e) => setAddBrandForm((p) => ({ ...p, brandCategory: e.target.value }))} placeholder="Fashion, Wellness..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Brand Type <span className="text-red-500">*</span></Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={addBrandForm.brandType}
                  onChange={(e) => setAddBrandForm((p) => ({ ...p, brandType: e.target.value }))}
                >
                  <option value="MANUFACTURER">Manufacturer</option>
                  <option value="RETAILER">Retailer</option>
                  <option value="TRADER">Trader</option>
                  <option value="DISTRIBUTOR">Distributor</option>
                </select>
              </div>
            </div>
            <Separator />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Commercial Terms</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Commission Type</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={addBrandForm.commissionType}
                  onChange={(e) => setAddBrandForm((p) => ({ ...p, commissionType: e.target.value }))}
                >
                  <option value="FLAT_PERCENT">Flat %</option>
                  <option value="TIERED">Tiered GMV</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Commission Rate (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={addBrandForm.commissionRate} onChange={(e) => setAddBrandForm((p) => ({ ...p, commissionRate: e.target.value }))} placeholder="12.50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Return Window (days)</Label>
                <Input type="number" min="0" max="90" value={addBrandForm.returnWindowDays} onChange={(e) => setAddBrandForm((p) => ({ ...p, returnWindowDays: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">TCS Rate (%)</Label>
                <Input type="number" step="0.01" min="0" value={addBrandForm.tcsRate} onChange={(e) => setAddBrandForm((p) => ({ ...p, tcsRate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBrand(false)}>Cancel</Button>
            <Button onClick={handleAddBrand} disabled={addBrandLoading || !addBrandForm.brandName || !addBrandForm.brandCategory}>
              {addBrandLoading ? "Adding..." : "Add Brand"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Warehouse Dialog */}
      <Dialog open={showAddWarehouse} onOpenChange={(open) => { setShowAddWarehouse(open); if (!open) setAddWarehouseBrandId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Warehouse</DialogTitle>
            <DialogDescription>
              Add a warehouse for{" "}
              <strong>{brands?.find((b) => b.id === addWarehouseBrandId)?.brandName ?? "brand"}</strong>
              {addWarehouseBrandId && (
                <span className="font-mono text-xs ml-1 bg-slate-100 px-1 rounded">
                  {brands?.find((b) => b.id === addWarehouseBrandId)?.brandCode}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Warehouse Name <span className="text-red-500">*</span></Label>
                <Input value={addWarehouseForm.warehouseName} onChange={(e) => setAddWarehouseForm((p) => ({ ...p, warehouseName: e.target.value }))} placeholder="Mumbai FC" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">State <span className="text-red-500">*</span></Label>
                <Input value={addWarehouseForm.warehouseState} onChange={(e) => setAddWarehouseForm((p) => ({ ...p, warehouseState: e.target.value }))} placeholder="Maharashtra" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm">Warehouse GSTIN <span className="text-red-500">*</span></Label>
                <Input value={addWarehouseForm.warehouseGstin} onChange={(e) => setAddWarehouseForm((p) => ({ ...p, warehouseGstin: e.target.value }))} placeholder="27AABCZ1234D1Z5" className="font-mono" />
                <p className="text-[10px] text-slate-400">First 2 digits = state code for TCS Section 52 accrual</p>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm">Warehouse Address <span className="text-red-500">*</span></Label>
                <Input value={addWarehouseForm.warehouseAddress} onChange={(e) => setAddWarehouseForm((p) => ({ ...p, warehouseAddress: e.target.value }))} placeholder="Plot 12, MIDC Industrial Area, Thane 400604" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPrimary"
                  checked={addWarehouseForm.isPrimary}
                  onChange={(e) => setAddWarehouseForm((p) => ({ ...p, isPrimary: e.target.checked }))}
                  className="h-4 w-4"
                />
                <Label htmlFor="isPrimary" className="text-sm cursor-pointer">Mark as primary warehouse (unsets current primary)</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWarehouse(false)}>Cancel</Button>
            <Button onClick={handleAddWarehouse} disabled={addWarehouseLoading || !addWarehouseForm.warehouseName || !addWarehouseForm.warehouseGstin || !addWarehouseForm.warehouseAddress}>
              {addWarehouseLoading ? "Adding..." : "Add Warehouse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Onboarding</DialogTitle>
            <DialogDescription>Provide rejection reason — visible to the Maker for resubmission.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Missing cancelled cheque, incorrect warehouse GSTIN..."
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectMutation.isPending || !rejectNotes.trim()}>
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commission Version Dialog */}
      <Dialog open={showCommissionDialog} onOpenChange={setShowCommissionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Commission Rate Version</DialogTitle>
            <DialogDescription>A new version archives the current rate. All orders are settled at the rate effective on their order date (BRD §3.4).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New Rate (%)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={newCommission.commissionPercent}
                onChange={(e) => setNewCommission((p) => ({ ...p, commissionPercent: e.target.value }))}
                placeholder="e.g. 12.50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Effective From Date</label>
              <Input
                type="date"
                value={newCommission.effectiveFromDate}
                onChange={(e) => setNewCommission((p) => ({ ...p, effectiveFromDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Input
                value={newCommission.notes}
                onChange={(e) => setNewCommission((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Rate revision for FY 2026-27"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCommissionDialog(false)}>Cancel</Button>
            <Button onClick={handleAddCommissionVersion} disabled={!newCommission.commissionPercent}>
              Save Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
