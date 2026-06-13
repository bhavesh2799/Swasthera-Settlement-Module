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
import { ArrowLeft, CheckCircle, XCircle, Send, ShieldCheck, FileText, Upload, Plus, RefreshCw, Building2, ExternalLink, Warehouse, Store, MapPin, Tag, ChevronDown, ChevronRight, Percent, Pencil, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useRole } from "@/contexts/RoleContext";
import { JurisdictionMapping } from "@/components/JurisdictionMapping";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  spocName: string | null;
  spocEmail: string | null;
  spocMobile: string | null;
  opsSpocName: string | null;
  opsSpocEmail: string | null;
  opsSpocMobile: string | null;
  pendingChanges?: Record<string, unknown> | null;
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
  status: string;
  stateCode: string | null;
  fyndLocationId: string | null;
  pendingChanges?: Record<string, unknown> | null;
}

interface ExtraDoc {
  label: string;
  url: string;
  level: string;
  brandId?: number;
  brandName?: string;
  warehouseId?: number;
  warehouseName?: string;
}

interface BankAccountItem {
  id: number;
  brandId: number | null;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branchName: string | null;
  accountType: string;
  isPrimary: boolean;
  status: string;
  pendingChanges?: Record<string, unknown> | null;
}

interface CommissionVersion {
  id: number;
  version?: number;
  commissionType: string;
  commissionPercent: number | null;
  tierConfig?: string | null;
  gmvTierType?: string | null;
  addendumDocUrl?: string | null;
  effectiveFromDate: string;
  effectiveToDate: string | null;
  isCurrent: boolean;
  notes: string | null;
  agreedByMakerId: string | null;
  approvedByCheckerId: string | null;
  createdAt: string;
}

type DocKey =
  | "panDocUrl"
  | "gstCertUrl"
  | "cinDocUrl"
  | "tanCopyUrl"
  | "msmeCertUrl"
  | "digitalSignatureUrl"
  | "signedAgreementUrl"
  | "cancelledChequeUrl";

interface DocDef { key: DocKey; label: string; required: boolean; hint: string; }
interface DocSection { level: string; title: string; docs: DocDef[]; }

const SPOC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPOC_MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * Both the Finance and Operations SPOC are mandatory for every brand. Returns
 * true only when all six contact fields are present and well-formed.
 */
function brandSpocsValid(f: {
  spocName: string; spocEmail: string; spocMobile: string;
  opsSpocName: string; opsSpocEmail: string; opsSpocMobile: string;
}): boolean {
  const okBlock = (name: string, email: string, mobile: string) =>
    name.trim().length > 0 &&
    SPOC_EMAIL_RE.test(email.trim()) &&
    SPOC_MOBILE_RE.test(mobile.trim());
  return (
    okBlock(f.spocName, f.spocEmail, f.spocMobile) &&
    okBlock(f.opsSpocName, f.opsSpocEmail, f.opsSpocMobile)
  );
}

const DOC_SECTIONS: DocSection[] = [
  {
    level: "company",
    title: "Company Documents",
    docs: [
      { key: "panDocUrl", label: "PAN Copy", required: true, hint: "Scanned PAN card" },
      { key: "gstCertUrl", label: "GST Certificate", required: true, hint: "GST registration certificate" },
      { key: "cinDocUrl", label: "CIN Certificate", required: false, hint: "Required for Private/Public Ltd" },
      { key: "tanCopyUrl", label: "TAN Copy", required: true, hint: "TAN allotment letter — required for TDS credit" },
      { key: "msmeCertUrl", label: "MSME Certificate", required: false, hint: "Udyam registration (optional)" },
      { key: "digitalSignatureUrl", label: "Digital Signature", required: true, hint: "Authorised signatory digital signature" },
    ],
  },
  {
    level: "brand",
    title: "Brand Documents",
    docs: [
      { key: "signedAgreementUrl", label: "Signed Agreement", required: true, hint: "Signed commercial agreement with Swasthera" },
      { key: "cancelledChequeUrl", label: "Cancelled Cheque", required: true, hint: "Bank account verification" },
    ],
  },
  {
    level: "warehouse",
    title: "Warehouse Documents",
    docs: [],
  },
];

const DOC_FIELDS = DOC_SECTIONS.flatMap((s) => s.docs);

function statusLabel(status: string): { text: string; cls: string } {
  switch (status) {
    case "SUBMITTED": return { text: "Pending Review", cls: "bg-amber-100 text-amber-800 border-transparent" };
    case "REJECTED": return { text: "Rejected — Awaiting Maker Edit", cls: "bg-red-100 text-red-800 border-transparent" };
    case "APPROVED": return { text: "Approved", cls: "bg-green-100 text-green-800 border-transparent" };
    case "ACTIVE": return { text: "Active", cls: "bg-green-600 text-white border-transparent" };
    case "DRAFT": return { text: "Draft", cls: "bg-slate-100 text-slate-700 border-transparent" };
    default: return { text: status, cls: "bg-slate-100 text-slate-700 border-transparent" };
  }
}

function entityStatusBadge(status: string): { text: string; cls: string } {
  switch (status) {
    case "ACTIVE": return { text: "Active", cls: "bg-green-100 text-green-800 hover:bg-green-100" };
    case "INACTIVE": return { text: "Inactive", cls: "bg-slate-100 text-slate-600 hover:bg-slate-100" };
    case "PENDING_APPROVAL": return { text: "Pending Approval", cls: "bg-amber-100 text-amber-800 hover:bg-amber-100" };
    case "REJECTED": return { text: "Rejected", cls: "bg-red-100 text-red-800 hover:bg-red-100" };
    default: return { text: status, cls: "bg-amber-100 text-amber-800 hover:bg-amber-100" };
  }
}

// Human-readable labels for fields that appear in a pendingChanges diff panel.
const FIELD_LABELS: Record<string, string> = {
  brandName: "Brand Name",
  brandLegalName: "Brand Legal Name",
  brandCategory: "Category",
  brandType: "Brand Type",
  commissionRate: "Commission Rate (%)",
  commissionType: "Commission Type",
  returnWindowDays: "Return Window (days)",
  tcsRate: "TCS Rate (%)",
  tdsRate: "TDS Rate (%)",
  tcsApplicable: "TCS Applicable",
  warehouseName: "Warehouse Name",
  warehouseState: "State",
  warehouseGstin: "Warehouse GSTIN",
  warehouseAddress: "Address",
  isPrimary: "Primary",
  bankName: "Bank Name",
  accountNumber: "Account Number",
  ifsc: "IFSC Code",
  branchName: "Branch",
  accountType: "Account Type",
  brandId: "Tagged Brand",
};

function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

// Friendly label/value for an onboarding pendingChanges diff (covers doc fields).
function pendingFieldLabel(k: string): string {
  return FIELD_LABELS[k] ?? DOC_FIELDS.find((d) => d.key === k)?.label ?? k;
}
function pendingFieldValue(k: string, v: unknown): string {
  if (k === "extraDocuments") {
    const arr = Array.isArray(v) ? v : [];
    return `${arr.length} document${arr.length === 1 ? "" : "s"}`;
  }
  if (typeof v === "string" && v.startsWith("http")) return v.split("/").pop() ?? v;
  return formatFieldValue(v);
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
  const [editNotes, setEditNotes] = useState("");
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [showCommissionDialog, setShowCommissionDialog] = useState(false);
  const [newCommission, setNewCommission] = useState<{
    commissionType: "FLAT_PERCENT" | "SLAB" | "GMV_TIER";
    commissionPercent: string;
    gmvTierType: "THRESHOLD" | "CUMULATIVE";
    slabs: Array<{ minGmv: string; maxGmv: string; rate: string }>;
    addendumDocUrl: string;
    effectiveFromDate: string;
    notes: string;
  }>({
    commissionType: "FLAT_PERCENT",
    commissionPercent: "",
    gmvTierType: "THRESHOLD",
    slabs: [{ minGmv: "0", maxGmv: "", rate: "" }],
    addendumDocUrl: "",
    effectiveFromDate: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [updatingDoc, setUpdatingDoc] = useState<DocKey | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [addDocFileName, setAddDocFileName] = useState("");
  const [addDocForm, setAddDocForm] = useState<{ level: string; label: string; brandId: string; warehouseId: string }>({ level: "company", label: "", brandId: "", warehouseId: "" });

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

  const { data: bankAccountsData, refetch: refetchBank } = useQuery<{ bankAccounts: BankAccountItem[] }>({
    queryKey: ["bank-accounts", id],
    queryFn: async () => {
      const r = await fetch(`/api/onboardings/${id}/bank-accounts`);
      if (!r.ok) return { bankAccounts: [] };
      return r.json();
    },
    enabled: !!id,
  });
  const bankAccounts = bankAccountsData?.bankAccounts ?? [];
  const brandNameById = (bid: number | null | undefined) =>
    bid == null ? undefined : brands?.find((b) => b.id === bid)?.brandName;

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
    spocName: "", spocEmail: "", spocMobile: "",
    opsSpocName: "", opsSpocEmail: "", opsSpocMobile: "",
  });
  const [addBrandLoading, setAddBrandLoading] = useState(false);

  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [addWarehouseBrandId, setAddWarehouseBrandId] = useState<number | null>(null);
  const [addWarehouseForm, setAddWarehouseForm] = useState({
    warehouseName: "", warehouseState: "", warehouseGstin: "", warehouseAddress: "", isPrimary: false,
  });
  const [addWarehouseLoading, setAddWarehouseLoading] = useState(false);
  const [addWarehouseGstLoading, setAddWarehouseGstLoading] = useState(false);
  const [editWarehouseGstLoading, setEditWarehouseGstLoading] = useState(false);

  const [warehousesByBrand, setWarehousesByBrand] = useState<Record<number, WarehouseItem[]>>({});

  // Edit Brand (maker proposes; requires checker approval)
  const [showEditBrand, setShowEditBrand] = useState(false);
  const [editBrandId, setEditBrandId] = useState<number | null>(null);
  const [editBrandForm, setEditBrandForm] = useState({
    brandName: "", brandLegalName: "", brandCategory: "", brandType: "RETAILER",
    commissionType: "FLAT_PERCENT", commissionRate: "", returnWindowDays: "15",
    tcsRate: "1", tdsRate: "1",
    spocName: "", spocEmail: "", spocMobile: "",
    opsSpocName: "", opsSpocEmail: "", opsSpocMobile: "",
  });
  const [editBrandLoading, setEditBrandLoading] = useState(false);

  // Edit Warehouse (maker proposes; requires checker approval)
  const [showEditWarehouse, setShowEditWarehouse] = useState(false);
  const [editWarehouseId, setEditWarehouseId] = useState<number | null>(null);
  const [editWarehouseBrandId, setEditWarehouseBrandId] = useState<number | null>(null);
  const [editWarehouseForm, setEditWarehouseForm] = useState({
    warehouseName: "", warehouseState: "", warehouseGstin: "", warehouseAddress: "", isPrimary: false,
  });
  const [editWarehouseLoading, setEditWarehouseLoading] = useState(false);

  // Edit Company (rides the onboarding submit → checker approval flow)
  const [showEditCompany, setShowEditCompany] = useState(false);
  const [editCompanyForm, setEditCompanyForm] = useState({
    companyName: "", tradeName: "", companyType: "PRIVATE_LIMITED", pan: "", masterGstin: "", tan: "", cin: "", registeredAddress: "",
  });
  const [editCompanyLoading, setEditCompanyLoading] = useState(false);

  // Bank accounts (maker proposes add/edit; checker approves)
  const [showAddBank, setShowAddBank] = useState(false);
  const [addBankForm, setAddBankForm] = useState({
    brandId: "", bankName: "", accountNumber: "", ifsc: "", branchName: "", accountType: "current", isPrimary: false,
  });
  const [addBankLoading, setAddBankLoading] = useState(false);

  const [showEditBank, setShowEditBank] = useState(false);
  const [editBankId, setEditBankId] = useState<number | null>(null);
  const [editBankForm, setEditBankForm] = useState({
    brandId: "", bankName: "", accountNumber: "", ifsc: "", branchName: "", accountType: "current", isPrimary: false,
  });
  const [editBankLoading, setEditBankLoading] = useState(false);

  // Locks the document-name field when uploading a fixed brand/warehouse doc through the tagging dialog
  const [lockDocLabel, setLockDocLabel] = useState(false);

  // Shared reject dialog for pending brand/warehouse/bank entities
  const [rejectEntity, setRejectEntity] = useState<{ kind: "brand" | "warehouse" | "bank"; id: number; name: string; brandId?: number; isEdit: boolean } | null>(null);
  const [entityRejectNotes, setEntityRejectNotes] = useState("");
  const [entityActionLoading, setEntityActionLoading] = useState(false);

  const fetchGstinForAddWarehouse = async () => {
    const code = addWarehouseForm.warehouseGstin;
    if (!code || code.length < 15) { toast({ title: "Enter a 15-character GSTIN first", variant: "destructive" }); return; }
    setAddWarehouseGstLoading(true);
    try {
      const r = await fetch("/api/utils/gst-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gstn: code.toUpperCase() }) });
      if (!r.ok) throw new Error("GST lookup failed");
      const d = await r.json();
      setAddWarehouseForm((p) => ({
        ...p,
        warehouseName: d.legalName ?? d.tradeName ?? p.warehouseName,
        warehouseState: d.state ?? p.warehouseState,
        warehouseAddress: d.registeredAddress ?? p.warehouseAddress,
      }));
      toast({ title: "Warehouse details fetched", description: d.legalName ?? d.tradeName });
    } catch (err) {
      toast({ title: "GST lookup failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAddWarehouseGstLoading(false);
    }
  };

  const fetchGstinForEditWarehouse = async () => {
    const code = editWarehouseForm.warehouseGstin;
    if (!code || code.length < 15) { toast({ title: "Enter a 15-character GSTIN first", variant: "destructive" }); return; }
    setEditWarehouseGstLoading(true);
    try {
      const r = await fetch("/api/utils/gst-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gstn: code.toUpperCase() }) });
      if (!r.ok) throw new Error("GST lookup failed");
      const d = await r.json();
      setEditWarehouseForm((p) => ({
        ...p,
        warehouseName: d.legalName ?? d.tradeName ?? p.warehouseName,
        warehouseState: d.state ?? p.warehouseState,
        warehouseAddress: d.registeredAddress ?? p.warehouseAddress,
      }));
      toast({ title: "Warehouse details fetched", description: d.legalName ?? d.tradeName });
    } catch (err) {
      toast({ title: "GST lookup failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setEditWarehouseGstLoading(false);
    }
  };

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
    if (!brandSpocsValid(addBrandForm)) {
      toast({ title: "Both Finance and Operations SPOC details are required", variant: "destructive" });
      return;
    }
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
      setAddBrandForm({ brandName: "", brandLegalName: "", brandCategory: "", brandType: "RETAILER", commissionType: "FLAT_PERCENT", commissionRate: "", returnWindowDays: "15", tcsRate: "1", tdsRate: "1", spocName: "", spocEmail: "", spocMobile: "", opsSpocName: "", opsSpocEmail: "", opsSpocMobile: "" });
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

  const openEditBrand = (brand: BrandItem) => {
    setEditBrandId(brand.id);
    setEditBrandForm({
      brandName: brand.brandName ?? "",
      brandLegalName: brand.brandLegalName ?? "",
      brandCategory: brand.brandCategory ?? "",
      brandType: brand.brandType ?? "RETAILER",
      commissionType: brand.commissionType ?? "FLAT_PERCENT",
      commissionRate: String(brand.commissionRate ?? ""),
      returnWindowDays: String(brand.returnWindowDays ?? "15"),
      tcsRate: String(brand.tcsRate ?? "1"),
      tdsRate: String(brand.tdsRate ?? "1"),
      spocName: brand.spocName ?? "",
      spocEmail: brand.spocEmail ?? "",
      spocMobile: brand.spocMobile ?? "",
      opsSpocName: brand.opsSpocName ?? "",
      opsSpocEmail: brand.opsSpocEmail ?? "",
      opsSpocMobile: brand.opsSpocMobile ?? "",
    });
    setShowEditBrand(true);
  };

  const handleEditBrand = async () => {
    if (!editBrandId || !editBrandForm.brandName || !editBrandForm.brandCategory) return;
    if (!brandSpocsValid(editBrandForm)) {
      toast({ title: "Both Finance and Operations SPOC details are required", variant: "destructive" });
      return;
    }
    setEditBrandLoading(true);
    try {
      const r = await fetch(`/api/brands/${editBrandId}/propose-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editBrandForm,
          commissionRate: parseFloat(editBrandForm.commissionRate) || 0,
          returnWindowDays: parseInt(editBrandForm.returnWindowDays) || 15,
          tcsRate: parseFloat(editBrandForm.tcsRate) || 1,
          tdsRate: parseFloat(editBrandForm.tdsRate) || 1,
        }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Edit submitted — awaiting Checker approval" });
      setShowEditBrand(false);
      setEditBrandId(null);
      refetchBrands();
    } catch {
      toast({ title: "Failed to submit edit", variant: "destructive" });
    } finally {
      setEditBrandLoading(false);
    }
  };

  const openEditWarehouse = (wh: WarehouseItem) => {
    setEditWarehouseId(wh.id);
    setEditWarehouseBrandId(wh.brandId);
    setEditWarehouseForm({
      warehouseName: wh.warehouseName ?? "",
      warehouseState: wh.warehouseState ?? "",
      warehouseGstin: wh.warehouseGstin ?? "",
      warehouseAddress: wh.warehouseAddress ?? "",
      isPrimary: !!wh.isPrimary,
    });
    setShowEditWarehouse(true);
  };

  const handleEditWarehouse = async () => {
    if (!editWarehouseId || !editWarehouseForm.warehouseName || !editWarehouseForm.warehouseGstin) return;
    setEditWarehouseLoading(true);
    try {
      const r = await fetch(`/api/warehouses/${editWarehouseId}/propose-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editWarehouseForm),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Edit submitted — awaiting Checker approval" });
      setShowEditWarehouse(false);
      if (editWarehouseBrandId) loadWarehouses(editWarehouseBrandId);
      setEditWarehouseId(null);
    } catch {
      toast({ title: "Failed to submit edit", variant: "destructive" });
    } finally {
      setEditWarehouseLoading(false);
    }
  };

  const handleApproveBrand = async (brand: BrandItem) => {
    setEntityActionLoading(true);
    try {
      const r = await fetch(`/api/brands/${brand.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error("Failed");
      toast({ title: `${brand.brandName} approved` });
      refetchBrands();
    } catch {
      toast({ title: "Approval failed", variant: "destructive" });
    } finally {
      setEntityActionLoading(false);
    }
  };

  const handleApproveWarehouse = async (wh: WarehouseItem) => {
    setEntityActionLoading(true);
    try {
      const r = await fetch(`/api/warehouses/${wh.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error("Failed");
      toast({ title: `${wh.warehouseName} approved` });
      loadWarehouses(wh.brandId);
    } catch {
      toast({ title: "Approval failed", variant: "destructive" });
    } finally {
      setEntityActionLoading(false);
    }
  };

  const handleRejectEntity = async () => {
    if (!rejectEntity) return;
    setEntityActionLoading(true);
    try {
      const url = rejectEntity.kind === "bank"
        ? `/api/onboarding/bank-account/${rejectEntity.id}/reject`
        : `/api/${rejectEntity.kind === "brand" ? "brands" : "warehouses"}/${rejectEntity.id}/reject`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: entityRejectNotes }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: `${rejectEntity.name} ${rejectEntity.isEdit ? "edit rejected" : "rejected"}`, variant: "destructive" });
      if (rejectEntity.kind === "brand") refetchBrands();
      else if (rejectEntity.kind === "warehouse" && rejectEntity.brandId) loadWarehouses(rejectEntity.brandId);
      else if (rejectEntity.kind === "bank") refetchBank();
      setRejectEntity(null);
      setEntityRejectNotes("");
    } catch {
      toast({ title: "Rejection failed", variant: "destructive" });
    } finally {
      setEntityActionLoading(false);
    }
  };

  // ---- Bank account governance (maker proposes; checker approves) ----
  const handleAddBank = async () => {
    if (!addBankForm.brandId || !addBankForm.bankName || !addBankForm.accountNumber || !addBankForm.ifsc) return;
    setAddBankLoading(true);
    try {
      const r = await fetch(`/api/onboarding/bank-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addBankForm, brandId: Number(addBankForm.brandId) }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Bank account added — awaiting Checker approval" });
      setShowAddBank(false);
      setAddBankForm({ brandId: "", bankName: "", accountNumber: "", ifsc: "", branchName: "", accountType: "current", isPrimary: false });
      refetchBank();
    } catch {
      toast({ title: "Failed to add bank account", variant: "destructive" });
    } finally {
      setAddBankLoading(false);
    }
  };

  const openEditBank = (acc: BankAccountItem) => {
    setEditBankId(acc.id);
    setEditBankForm({
      brandId: acc.brandId != null ? String(acc.brandId) : "",
      bankName: acc.bankName ?? "",
      accountNumber: acc.accountNumber ?? "",
      ifsc: acc.ifsc ?? "",
      branchName: acc.branchName ?? "",
      accountType: acc.accountType ?? "current",
      isPrimary: !!acc.isPrimary,
    });
    setShowEditBank(true);
  };

  const handleEditBank = async () => {
    if (!editBankId || !editBankForm.bankName || !editBankForm.accountNumber || !editBankForm.ifsc) return;
    setEditBankLoading(true);
    try {
      const r = await fetch(`/api/onboarding/bank-account/${editBankId}/propose-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editBankForm, brandId: Number(editBankForm.brandId) }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Edit submitted — awaiting Checker approval" });
      setShowEditBank(false);
      setEditBankId(null);
      refetchBank();
    } catch {
      toast({ title: "Failed to submit edit", variant: "destructive" });
    } finally {
      setEditBankLoading(false);
    }
  };

  const handleApproveBank = async (acc: BankAccountItem) => {
    setEntityActionLoading(true);
    try {
      const r = await fetch(`/api/onboarding/bank-account/${acc.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error("Failed");
      toast({ title: `${acc.bankName} approved` });
      refetchBank();
    } catch {
      toast({ title: "Approval failed", variant: "destructive" });
    } finally {
      setEntityActionLoading(false);
    }
  };

  // ---- Company / document change governance ----
  const handleApproveCompanyChanges = async () => {
    setEntityActionLoading(true);
    try {
      const r = await fetch(`/api/onboardings/${id}/approve-changes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Company changes approved" });
      invalidate();
    } catch {
      toast({ title: "Approval failed", variant: "destructive" });
    } finally {
      setEntityActionLoading(false);
    }
  };

  const handleRejectCompanyChanges = async () => {
    setEntityActionLoading(true);
    try {
      const r = await fetch(`/api/onboardings/${id}/reject-changes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Company changes rejected", variant: "destructive" });
      invalidate();
    } catch {
      toast({ title: "Rejection failed", variant: "destructive" });
    } finally {
      setEntityActionLoading(false);
    }
  };

  const openEditCompany = () => {
    setEditCompanyForm({
      companyName: onboarding?.companyName ?? "",
      tradeName: (ob.tradeName as string) ?? "",
      companyType: onboarding?.companyType ?? "PRIVATE_LIMITED",
      pan: onboarding?.pan ?? "",
      masterGstin: onboarding?.masterGstin ?? "",
      tan: onboarding?.tan ?? "",
      cin: onboarding?.cin ?? "",
      registeredAddress: (ob.registeredAddress as string) ?? "",
    });
    setShowEditCompany(true);
  };

  const handleEditCompany = async () => {
    if (!editCompanyForm.companyName) return;
    setEditCompanyLoading(true);
    const postApproval = onboarding?.status === "APPROVED" || onboarding?.status === "ACTIVE";
    try {
      const r = await fetch(
        postApproval ? `/api/onboardings/${id}/propose-changes` : `/api/onboardings/${id}`,
        {
          method: postApproval ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editCompanyForm),
        },
      );
      if (!r.ok) throw new Error("Failed");
      toast({ title: postApproval ? "Changes submitted — awaiting Checker approval" : "Company details updated" });
      setShowEditCompany(false);
      invalidate();
    } catch {
      toast({ title: "Failed to update company details", variant: "destructive" });
    } finally {
      setEditCompanyLoading(false);
    }
  };

  const openTagDoc = (label: string) => {
    setAddDocForm({ level: "brand", label, brandId: brands?.[0] ? String(brands[0].id) : "", warehouseId: "" });
    setAddDocFileName("");
    setLockDocLabel(true);
    setShowAddDoc(true);
  };

  const handleDocUpload = (docKey: DocKey) => {
    setUpdatingDoc(docKey);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !updatingDoc) return;
    const filename = e.target.files[0].name;
    const fakeUrl = `https://docs.swasthera.in/kyb/${id}/${updatingDoc}/${filename}`;
    const postApproval = onboarding?.status === "APPROVED" || onboarding?.status === "ACTIVE";
    try {
      await fetch(
        postApproval ? `/api/onboardings/${id}/propose-changes` : `/api/onboardings/${id}`,
        {
          method: postApproval ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [updatingDoc]: fakeUrl }),
        },
      );
      toast({ title: postApproval ? `${filename} submitted — awaiting Checker approval` : `${filename} uploaded successfully` });
      invalidate();
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    e.target.value = "";
    setUpdatingDoc(null);
  };

  const openAddDoc = (level: string) => {
    setAddDocForm({ level, label: "", brandId: brands?.[0] ? String(brands[0].id) : "", warehouseId: "" });
    setAddDocFileName("");
    setLockDocLabel(false);
    if (level === "warehouse" && brands?.[0]) loadWarehouses(brands[0].id);
    setShowAddDoc(true);
  };

  const handleExtraFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setAddDocFileName(e.target.files[0].name);
    e.target.value = "";
  };

  const handleSaveExtraDoc = async () => {
    const { level, label, brandId, warehouseId } = addDocForm;
    if (!label.trim()) { toast({ title: "Enter a document name", variant: "destructive" }); return; }
    if (!addDocFileName) { toast({ title: "Choose a file to upload", variant: "destructive" }); return; }
    if (level === "brand" && !brandId) { toast({ title: "Select which brand this document is for", variant: "destructive" }); return; }
    if (level === "warehouse" && (!brandId || !warehouseId)) { toast({ title: "Select the brand and warehouse this document is for", variant: "destructive" }); return; }

    const url = `https://docs.swasthera.in/extra/${id}/${encodeURIComponent(addDocFileName)}`;
    const entry: ExtraDoc = { label: label.trim(), url, level };
    if (level === "brand" || level === "warehouse") {
      const b = brands?.find((x) => String(x.id) === brandId);
      entry.brandId = Number(brandId);
      entry.brandName = b?.brandName;
    }
    if (level === "warehouse") {
      const w = (warehousesByBrand[Number(brandId)] ?? []).find((x) => String(x.id) === warehouseId);
      entry.warehouseId = Number(warehouseId);
      entry.warehouseName = w?.warehouseName;
    }
    const existing = ((onboarding as unknown as Record<string, unknown>).extraDocuments as ExtraDoc[]) ?? [];
    const postApproval = onboarding?.status === "APPROVED" || onboarding?.status === "ACTIVE";
    try {
      const r = await fetch(
        postApproval ? `/api/onboardings/${id}/propose-changes` : `/api/onboardings/${id}`,
        {
          method: postApproval ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extraDocuments: [...existing, entry] }),
        },
      );
      if (!r.ok) throw new Error("save failed");
      toast({ title: postApproval ? `${entry.label} submitted — awaiting Checker approval` : `${entry.label} added` });
      setShowAddDoc(false);
      invalidate();
    } catch {
      toast({ title: "Could not save document — please try again", variant: "destructive" });
    }
  };

  const handleRemoveExtraDoc = async (idx: number) => {
    const existing = ((onboarding as unknown as Record<string, unknown>).extraDocuments as Array<{ label: string; url: string; level: string }>) ?? [];
    const next = existing.filter((_, i) => i !== idx);
    const postApproval = onboarding?.status === "APPROVED" || onboarding?.status === "ACTIVE";
    try {
      await fetch(
        postApproval ? `/api/onboardings/${id}/propose-changes` : `/api/onboardings/${id}`,
        {
          method: postApproval ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extraDocuments: next }),
        },
      );
      if (postApproval) toast({ title: "Removal submitted — awaiting Checker approval" });
      invalidate();
    } catch {
      toast({ title: "Could not remove document", variant: "destructive" });
    }
  };

  const handleAddCommissionVersion = async () => {
    if (!newCommission.effectiveFromDate) return;
    const { commissionType, slabs } = newCommission;
    type CommissionPayload = {
      commissionType: string;
      effectiveFromDate: string;
      notes: string;
      addendumDocUrl?: string;
      commissionPercent?: number;
      tierConfig?: string;
      gmvTierType?: string;
    };
    const payload: CommissionPayload = {
      commissionType,
      effectiveFromDate: newCommission.effectiveFromDate,
      notes: newCommission.notes,
    };
    if (newCommission.addendumDocUrl) payload.addendumDocUrl = newCommission.addendumDocUrl;

    if (commissionType === "FLAT_PERCENT") {
      if (!newCommission.commissionPercent) return;
      payload.commissionPercent = parseFloat(newCommission.commissionPercent);
    } else {
      // SLAB or GMV_TIER — validate contiguous, non-overlapping rows
      const parsed = slabs.map((s) => ({ minGmv: parseFloat(s.minGmv), maxGmv: s.maxGmv === "" ? null : parseFloat(s.maxGmv), rate: parseFloat(s.rate) }));
      for (let i = 0; i < parsed.length; i++) {
        const s = parsed[i];
        if (Number.isNaN(s.minGmv) || Number.isNaN(s.rate)) { toast({ title: "Each slab needs a 'from' value and a rate", variant: "destructive" }); return; }
        if (s.maxGmv !== null && s.maxGmv <= s.minGmv) { toast({ title: `Slab ${i + 1}: 'to' must be greater than 'from'`, variant: "destructive" }); return; }
        if (i > 0) {
          const prev = parsed[i - 1];
          if (prev.maxGmv === null || prev.maxGmv !== s.minGmv) { toast({ title: `Slab ${i + 1} must start where slab ${i} ends (contiguous)`, variant: "destructive" }); return; }
        }
      }
      payload.tierConfig = JSON.stringify(parsed);
      if (commissionType === "GMV_TIER") payload.gmvTierType = newCommission.gmvTierType;
    }

    try {
      const r = await fetch(`/api/commission-master/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      toast({ title: "Commercial terms versioned" });
      setShowCommissionDialog(false);
      setNewCommission({ commissionType: "FLAT_PERCENT", commissionPercent: "", gmvTierType: "THRESHOLD", slabs: [{ minGmv: "0", maxGmv: "", rate: "" }], addendumDocUrl: "", effectiveFromDate: new Date().toISOString().split("T")[0], notes: "" });
      refetchCommission();
      invalidate();
    } catch (err) {
      toast({ title: "Failed to update commercial terms", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const handleSubmit = () => {
    submitMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Submitted for Checker review" }); invalidate(); },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Submission failed";
        toast({ title: "Submission failed", description: msg, variant: "destructive" });
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

  const handleRequestEdit = async () => {
    setEditLoading(true);
    try {
      const r = await fetch(`/api/onboardings/${id}/request-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editNotes }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Request failed");
      }
      toast({ title: "Sent back to Maker for edits" });
      setShowEditDialog(false);
      setEditNotes("");
      invalidate();
    } catch (err) {
      toast({ title: "Could not request edits", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (!onboarding) return <div className="p-8 text-center text-slate-500">Onboarding not found</div>;

  const ob = onboarding as unknown as Record<string, unknown>;
  const extraDocs = (ob.extraDocuments as ExtraDoc[]) ?? [];

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
      <input ref={extraFileInputRef} type="file" className="hidden" onChange={handleExtraFileSelected} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <Button variant="ghost" className="px-0 text-slate-500 hover:bg-transparent mb-1" onClick={() => setLocation("/onboarding")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{onboarding.brandName}</h1>
            <Badge className={statusLabel(onboarding.status ?? "DRAFT").cls}>{statusLabel(onboarding.status ?? "DRAFT").text}</Badge>
            <Badge variant="outline" className="font-mono text-xs">{onboarding.ref}</Badge>
            <Badge variant="outline" className="text-xs">v{(onboarding as unknown as Record<string, unknown>).version as number ?? 1}</Badge>
            {onboarding.kybStatus === "PASSED" && (
              <Badge className="bg-green-100 text-green-800 border-transparent hover:bg-green-100"><ShieldCheck className="mr-1 h-3 w-3" />KYB Verified via GSTIN</Badge>
            )}
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
            <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              Submit for Review
            </Button>
          )}
          {isChecker && onboarding.status === "SUBMITTED" && (
            <>
              <Button variant="outline" onClick={() => setShowEditDialog(true)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Request Edits
              </Button>
              <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
              <Button onClick={handleApprove} disabled={approveMutation.isPending} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="mr-2 h-4 w-4" /> Approve
              </Button>
            </>
          )}
          {isMaker && onboarding.status === "REJECTED" && (
            <Button onClick={handleSubmit} disabled={submitMutation.isPending} className="bg-amber-600 hover:bg-amber-700">
              <Send className="mr-2 h-4 w-4" />
              Re-submit for Review
            </Button>
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* Company & Tax */}
        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold text-slate-800">Company & Tax Details</CardTitle>
            {isMaker && onboarding.status !== "SUBMITTED" && !ob.pendingChanges && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openEditCompany}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            )}
            {isChecker && !!ob.pendingChanges && (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" disabled={entityActionLoading}
                  onClick={handleRejectCompanyChanges}>
                  <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                </Button>
                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" disabled={entityActionLoading}
                  onClick={handleApproveCompanyChanges}>
                  <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-y-4 gap-x-6">
            {!!ob.pendingChanges && (
              <div className="col-span-2 rounded border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                  <Pencil className="h-3 w-3" /> Proposed changes awaiting Checker approval
                </p>
                <div className="space-y-1">
                  {Object.entries(ob.pendingChanges as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[160px_1fr] gap-2 text-xs">
                      <span className="text-slate-500">{pendingFieldLabel(k)}</span>
                      <span className="text-slate-800">
                        <span className="line-through text-slate-400 mr-2">{pendingFieldValue(k, ob[k])}</span>
                        <span className="font-medium">{pendingFieldValue(k, v)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {([
              ["Company Legal Name", onboarding.companyName || "—"],
              ["Trade Name", (ob.tradeName as string) || "—"],
              ["Company Type", onboarding.companyType === "OTHER" ? ((ob.entityTypeOther as string) || "Other") : onboarding.companyType],
              ["PAN", onboarding.pan],
              ["Master GSTIN", onboarding.masterGstin],
              ["TAN", onboarding.tan || "—"],
              ["CIN", onboarding.cin || "—"],
              ...(ob.llpCode ? [["LLP Code", ob.llpCode as string]] : []),
              ["State Code", (ob.stateCode as string) || onboarding.masterGstin?.substring(0, 2) || "—"],
              ["Registration Status", (ob.registrationStatus as string) || "—"],
              ["Taxpayer Type", (ob.taxpayerType as string) || "—"],
              ["Date of Registration", (ob.dateOfRegistration as string) || "—"],
              ["Jurisdiction", (ob.jurisdictionCode as string) || "—"],
            ] as Array<[string, string]>).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className="font-mono text-sm text-slate-900">{value}</p>
              </div>
            ))}
            {!!ob.natureOfBusiness && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Nature of Business</p>
                <p className="text-sm text-slate-900">{ob.natureOfBusiness as string}</p>
              </div>
            )}
            {!!ob.registeredAddress && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Registered Address</p>
                <p className="text-sm text-slate-900">{ob.registeredAddress as string}</p>
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
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold text-slate-800">Banking Information</CardTitle>
            {isMaker && onboarding.status !== "SUBMITTED" && (brands?.length ?? 0) > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAddBankForm({ brandId: brands?.[0] ? String(brands[0].id) : "", bankName: "", accountNumber: "", ifsc: "", branchName: "", accountType: "current", isPrimary: false }); setShowAddBank(true); }}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Account
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {bankAccounts.length > 0 ? (
              <div className="space-y-3">
                {bankAccounts.map((acc) => (
                  <div key={acc.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900">{acc.bankName}</p>
                        {brandNameById(acc.brandId) && (
                          <Badge variant="outline" className="text-[10px] font-normal"><Tag className="mr-1 h-2.5 w-2.5" />{brandNameById(acc.brandId)}</Badge>
                        )}
                        <Badge className={`text-[10px] border-transparent ${entityStatusBadge(acc.status).cls}`}>{entityStatusBadge(acc.status).text}</Badge>
                        {acc.pendingChanges && (
                          <Badge className="text-[10px] border-transparent bg-amber-50 text-amber-700 hover:bg-amber-50"><Pencil className="mr-1 h-2.5 w-2.5" /> Edit pending</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-normal capitalize">{acc.accountType?.toLowerCase()}</Badge>
                        {acc.isPrimary && <Badge className="bg-blue-100 text-blue-800 border-transparent text-[10px]">Primary</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-6">
                      <div>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Account Number</p>
                        <p className="font-mono text-sm text-slate-900">{acc.accountNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">IFSC Code</p>
                        <p className="font-mono text-sm text-slate-900">{acc.ifsc}</p>
                      </div>
                      {acc.branchName && (
                        <div className="col-span-2">
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Branch</p>
                          <p className="text-sm text-slate-900">{acc.branchName}</p>
                        </div>
                      )}
                    </div>
                    {/* Pending edit diff */}
                    {acc.pendingChanges && (
                      <div className="mt-3 rounded border border-amber-200 bg-amber-50/60 p-3">
                        <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                          <Pencil className="h-3 w-3" /> Proposed changes awaiting Checker approval
                        </p>
                        <div className="space-y-1">
                          {Object.entries(acc.pendingChanges).map(([k, v]) => (
                            <div key={k} className="grid grid-cols-[120px_1fr] gap-2 text-xs">
                              <span className="text-slate-500">{k === "brandId" ? "Tagged Brand" : (FIELD_LABELS[k] ?? k)}</span>
                              <span className="text-slate-800">
                                <span className="line-through text-slate-400 mr-2">
                                  {k === "brandId" ? (brandNameById(acc.brandId) ?? "—") : formatFieldValue((acc as unknown as Record<string, unknown>)[k])}
                                </span>
                                <span className="font-medium">
                                  {k === "brandId" ? (brandNameById(Number(v)) ?? String(v)) : formatFieldValue(v)}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Actions */}
                    <div className="mt-3 flex items-center justify-end gap-1.5">
                      {isChecker && acc.status === "PENDING_APPROVAL" && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => { setRejectEntity({ kind: "bank", id: acc.id, name: acc.bankName, brandId: acc.brandId ?? undefined, isEdit: !!acc.pendingChanges }); setEntityRejectNotes(""); }}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" disabled={entityActionLoading}
                            onClick={() => handleApproveBank(acc)}>
                            <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                        </>
                      )}
                      {isMaker && onboarding.status !== "SUBMITTED" && acc.status !== "PENDING_APPROVAL" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditBank(acc)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                {[
                  ["Bank Name", onboarding.bankName],
                  ["IFSC Code", onboarding.bankIfsc],
                  ["Account Number", onboarding.bankAccount],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                    <p className="font-mono text-sm text-slate-900">{value || "—"}</p>
                  </div>
                ))}
              </div>
            )}
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
            {onboarding.opsSpocName && (
              <div className="col-span-2 pt-2 border-t border-slate-100 mt-2">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Operations SPOC</p>
                <div className="text-sm text-slate-900 space-y-1">
                  <p className="font-medium">{onboarding.opsSpocName}</p>
                  <p className="text-slate-500">{onboarding.opsSpocEmail}</p>
                  <p className="text-slate-500">{onboarding.opsSpocMobile}</p>
                </div>
              </div>
            )}
            <div className="col-span-2">
              <JurisdictionMapping
                onboardingId={Number(id)}
                accounts={bankAccounts}
                canEdit={isMaker && onboarding.status !== "SUBMITTED"}
              />
            </div>
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

      {/* Document Checklist — BRD §3.1 — grouped Company / Brand / Warehouse */}
      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Document Checklist
            <span className="text-xs font-normal text-slate-500 ml-1">({onboarding.docsUploaded ?? 0} of {onboarding.docsRequired ?? 6} required uploaded)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {DOC_SECTIONS.map((section) => {
            const isBrandLevel = section.level === "brand";
            // Company docs only editable while draft/rejected; brand & warehouse docs can be
            // tagged any time the onboarding is not under checker review.
            const canEdit = isBrandLevel || section.level === "warehouse"
              ? isMaker && onboarding.status !== "SUBMITTED"
              : isMaker && (onboarding.status === "DRAFT" || onboarding.status === "REJECTED");
            const fixedLabels = section.docs.map((d) => d.label);
            const extras = extraDocs
              .map((d, i) => ({ ...d, _idx: i }))
              .filter((d) => d.level === section.level)
              // Brand fixed docs (Signed Agreement / Cancelled Cheque) are rendered in their
              // own fixed rows below — don't duplicate them in the "additional" list.
              .filter((d) => !(isBrandLevel && fixedLabels.includes(d.label)));
            return (
              <div key={section.level} className="border-b border-slate-100 last:border-b-0">
                <div className="flex items-center justify-between px-6 py-2.5 bg-slate-50/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600" onClick={() => openAddDoc(section.level)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add Document
                    </Button>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  {section.docs.map(({ key, label, required, hint }) => {
                    // A brand fixed doc is satisfied either by the legacy onboarding field
                    // OR by a brand-tagged extra document with the matching label.
                    const tagged = isBrandLevel
                      ? extraDocs.find((d) => d.level === "brand" && d.label === label)
                      : undefined;
                    const fieldUrl = (onboarding as unknown as Record<string, unknown>)[key] as string | undefined;
                    const url = tagged?.url ?? fieldUrl;
                    const uploaded = !!url;
                    return (
                      <div key={key} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          {uploaded
                            ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                            : <div className="h-4 w-4 rounded-full border-2 border-slate-300 shrink-0" />
                          }
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-slate-900">{label} {required && <span className="text-red-500">*</span>}</p>
                              {tagged?.brandName && (
                                <Badge variant="outline" className="text-[10px] font-normal">{tagged.brandName}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">{hint}</p>
                            {uploaded && url && (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                                {url.split("/").pop()} <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant={uploaded ? "outline" : "default"}
                            onClick={() => isBrandLevel ? openTagDoc(label) : handleDocUpload(key)}
                            className="text-xs"
                          >
                            {isBrandLevel
                              ? <><Tag className="mr-1.5 h-3.5 w-3.5" />{uploaded ? "Re-tag" : "Tag to Brand"}</>
                              : <><Upload className="mr-1.5 h-3.5 w-3.5" />{uploaded ? "Replace" : "Upload"}</>
                            }
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {extras.map((d) => (
                    <div key={d._idx} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">{d.label} <span className="text-xs font-normal text-slate-400">(additional)</span></p>
                            {(d.brandName || d.warehouseName) && (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                {d.warehouseName ? `${d.brandName} · ${d.warehouseName}` : d.brandName}
                              </Badge>
                            )}
                          </div>
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                            {d.url.split("/").pop()} <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                      {canEdit && (
                        <Button size="sm" variant="ghost" className="text-xs text-red-400 hover:text-red-600" onClick={() => handleRemoveExtraDoc(d._idx)}>
                          <XCircle className="mr-1.5 h-3.5 w-3.5" /> Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  {section.docs.length === 0 && extras.length === 0 && (
                    <div className="px-6 py-4 text-xs text-slate-400">No documents added{canEdit ? " — use “Add Document” above" : ""}.</div>
                  )}
                </div>
              </div>
            );
          })}
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
                      {typeof v.version === "number" && <Badge variant="outline" className="text-xs">v{v.version}</Badge>}
                      <span className="font-semibold text-slate-900">
                        {v.commissionType === "FLAT_PERCENT"
                          ? `${v.commissionPercent}% Flat`
                          : v.commissionType === "SLAB"
                            ? "Slab Based"
                            : v.commissionType === "GMV_TIER"
                              ? `GMV Tier${v.gmvTierType ? ` · ${v.gmvTierType.charAt(0) + v.gmvTierType.slice(1).toLowerCase()}` : ""}`
                              : "Tiered"}
                      </span>
                      {v.isCurrent && <Badge className="bg-green-100 text-green-800 border-transparent text-xs hover:bg-green-100">Current</Badge>}
                    </div>
                    {v.commissionType !== "FLAT_PERCENT" && v.tierConfig && (
                      <p className="text-xs text-slate-500 font-mono">
                        {(() => { try { return (JSON.parse(v.tierConfig) as Array<{ minGmv: number; maxGmv: number | null; rate: number }>).map((b) => `₹${b.minGmv.toLocaleString("en-IN")}–${b.maxGmv != null ? `₹${b.maxGmv.toLocaleString("en-IN")}` : "∞"} @ ${b.rate}%`).join("  ·  "); } catch { return null; } })()}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">
                      Effective: {v.effectiveFromDate}{v.effectiveToDate ? ` → ${v.effectiveToDate}` : " (no end date)"}
                    </p>
                    {v.notes && <p className="text-xs text-slate-400 italic">{v.notes}</p>}
                    {v.addendumDocUrl && <a href={v.addendumDocUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View addendum →</a>}
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
                          <Badge className={`text-[10px] border-transparent ${entityStatusBadge(brand.status).cls}`}>
                            {entityStatusBadge(brand.status).text}
                          </Badge>
                          {brand.pendingChanges && (
                            <Badge className="text-[10px] border-transparent bg-amber-50 text-amber-700 hover:bg-amber-50">
                              <Pencil className="mr-1 h-2.5 w-2.5" /> Edit pending
                            </Badge>
                          )}
                          <span className="font-mono text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                            {brand.brandCode}
                          </span>
                          <span className="text-xs text-slate-400">{brand.brandCategory} · {brand.brandType}</span>
                        </div>
                        {brand.brandLegalName && (
                          <p className="text-xs text-slate-500 mt-0.5">{brand.brandLegalName}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <div className="text-right space-y-0.5">
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
                        {isChecker && brand.status === "PENDING_APPROVAL" && (
                          <div className="flex items-center gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => { setRejectEntity({ kind: "brand", id: brand.id, name: brand.brandName, isEdit: !!brand.pendingChanges }); setEntityRejectNotes(""); }}>
                              <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                            </Button>
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" disabled={entityActionLoading}
                              onClick={() => handleApproveBrand(brand)}>
                              <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                            </Button>
                          </div>
                        )}
                        {isMaker && onboarding.status !== "SUBMITTED" && brand.status !== "PENDING_APPROVAL" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditBrand(brand)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded: Warehouses + commercial detail */}
                    {isExpanded && (
                      <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 space-y-4">
                        {/* Pending edit diff */}
                        {brand.pendingChanges && (
                          <div className="rounded border border-amber-200 bg-amber-50/60 p-3">
                            <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                              <Pencil className="h-3 w-3" /> Proposed changes awaiting Checker approval
                            </p>
                            <div className="space-y-1">
                              {Object.entries(brand.pendingChanges).map(([k, v]) => (
                                <div key={k} className="grid grid-cols-[140px_1fr] gap-2 text-xs">
                                  <span className="text-slate-500">{FIELD_LABELS[k] ?? k}</span>
                                  <span className="text-slate-800">
                                    <span className="line-through text-slate-400 mr-2">{formatFieldValue((brand as unknown as Record<string, unknown>)[k])}</span>
                                    <span className="font-medium">{formatFieldValue(v)}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
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

                        {/* Brand SPOCs */}
                        {(brand.spocName || brand.opsSpocName) && (
                          <div className="grid grid-cols-2 gap-3">
                            {brand.spocName && (
                              <div className="rounded border border-slate-200 bg-white p-3">
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Finance SPOC</p>
                                <p className="text-xs font-medium text-slate-800">{brand.spocName}</p>
                                <p className="text-xs text-slate-500">{brand.spocEmail}</p>
                                <p className="text-xs text-slate-500">{brand.spocMobile}</p>
                              </div>
                            )}
                            {brand.opsSpocName && (
                              <div className="rounded border border-slate-200 bg-white p-3">
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Operations SPOC</p>
                                <p className="text-xs font-medium text-slate-800">{brand.opsSpocName}</p>
                                <p className="text-xs text-slate-500">{brand.opsSpocEmail}</p>
                                <p className="text-xs text-slate-500">{brand.opsSpocMobile}</p>
                              </div>
                            )}
                          </div>
                        )}

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
                                      {wh.status && wh.status !== "ACTIVE" && (
                                        <Badge className={`text-[10px] border-transparent ${entityStatusBadge(wh.status).cls}`}>
                                          {entityStatusBadge(wh.status).text}
                                        </Badge>
                                      )}
                                      {wh.pendingChanges && (
                                        <Badge className="text-[10px] border-transparent bg-amber-50 text-amber-700 hover:bg-amber-50">
                                          <Pencil className="mr-1 h-2.5 w-2.5" /> Edit pending
                                        </Badge>
                                      )}
                                      <span className="font-mono text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">{wh.warehouseCode}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                                      <span>{wh.warehouseState}</span>
                                      <span className="font-mono">{wh.warehouseGstin}</span>
                                      {wh.stateCode && <span>State: {wh.stateCode}</span>}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">{wh.warehouseAddress}</p>
                                    {wh.pendingChanges && (
                                      <div className="mt-2 rounded border border-amber-200 bg-amber-50/60 p-2 space-y-1">
                                        <p className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                                          <Pencil className="h-2.5 w-2.5" /> Proposed changes awaiting approval
                                        </p>
                                        {Object.entries(wh.pendingChanges).map(([k, v]) => (
                                          <div key={k} className="grid grid-cols-[120px_1fr] gap-2 text-[11px]">
                                            <span className="text-slate-500">{FIELD_LABELS[k] ?? k}</span>
                                            <span>
                                              <span className="line-through text-slate-400 mr-2">{formatFieldValue((wh as unknown as Record<string, unknown>)[k])}</span>
                                              <span className="font-medium text-slate-800">{formatFieldValue(v)}</span>
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="shrink-0 flex items-center gap-1.5">
                                    {isChecker && wh.status === "PENDING_APPROVAL" && (
                                      <>
                                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                          onClick={() => { setRejectEntity({ kind: "warehouse", id: wh.id, name: wh.warehouseName, brandId: wh.brandId, isEdit: !!wh.pendingChanges }); setEntityRejectNotes(""); }}>
                                          <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                                        </Button>
                                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" disabled={entityActionLoading}
                                          onClick={() => handleApproveWarehouse(wh)}>
                                          <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                                        </Button>
                                      </>
                                    )}
                                    {isMaker && onboarding.status !== "SUBMITTED" && wh.status !== "PENDING_APPROVAL" && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditWarehouse(wh)}>
                                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                                      </Button>
                                    )}
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
              <div className="space-y-1.5">
                <Label className="text-sm">TDS Rate (%)</Label>
                <Input type="number" step="0.01" min="0" value={addBrandForm.tdsRate} onChange={(e) => setAddBrandForm((p) => ({ ...p, tdsRate: e.target.value }))} />
              </div>
            </div>
            <Separator />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Finance SPOC <span className="text-red-500">*</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">SPOC Name</Label>
                <Input value={addBrandForm.spocName} onChange={(e) => setAddBrandForm((p) => ({ ...p, spocName: e.target.value }))} placeholder="Priya Sharma" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">SPOC Email</Label>
                <Input value={addBrandForm.spocEmail} onChange={(e) => setAddBrandForm((p) => ({ ...p, spocEmail: e.target.value }))} placeholder="priya@brand.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">SPOC Mobile</Label>
                <Input value={addBrandForm.spocMobile} onChange={(e) => setAddBrandForm((p) => ({ ...p, spocMobile: e.target.value }))} placeholder="+91 9876543210" />
              </div>
            </div>
            <Separator />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Operations SPOC <span className="text-red-500">*</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">SPOC Name</Label>
                <Input value={addBrandForm.opsSpocName} onChange={(e) => setAddBrandForm((p) => ({ ...p, opsSpocName: e.target.value }))} placeholder="Rohan Mehta" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">SPOC Email</Label>
                <Input value={addBrandForm.opsSpocEmail} onChange={(e) => setAddBrandForm((p) => ({ ...p, opsSpocEmail: e.target.value }))} placeholder="rohan@brand.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">SPOC Mobile</Label>
                <Input value={addBrandForm.opsSpocMobile} onChange={(e) => setAddBrandForm((p) => ({ ...p, opsSpocMobile: e.target.value }))} placeholder="+91 9876501234" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBrand(false)}>Cancel</Button>
            <Button onClick={handleAddBrand} disabled={addBrandLoading || !addBrandForm.brandName || !addBrandForm.brandCategory || !brandSpocsValid(addBrandForm)}>
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
                <div className="flex gap-2">
                  <Input value={addWarehouseForm.warehouseGstin} onChange={(e) => setAddWarehouseForm((p) => ({ ...p, warehouseGstin: e.target.value }))} placeholder="27AABCZ1234D1Z5" className="font-mono flex-1" />
                  <Button type="button" variant="outline" size="sm" disabled={addWarehouseGstLoading} onClick={fetchGstinForAddWarehouse} className="shrink-0">
                    {addWarehouseGstLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fetch"}
                  </Button>
                </div>
                <p className="text-[10px] text-slate-400">First 2 digits = state code for TCS Section 52 accrual. Click Fetch to auto-fill name, state & address.</p>
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

      {/* Add Document Dialog */}
      <Dialog open={showAddDoc} onOpenChange={setShowAddDoc}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
            <DialogDescription>
              Attach a document at the{" "}
              <strong className="capitalize">{addDocForm.level}</strong> level
              {addDocForm.level !== "company" && " and choose which it belongs to"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Document Name <span className="text-red-500">*</span></Label>
              <Input
                value={addDocForm.label}
                onChange={(e) => setAddDocForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Lease Agreement, Utility Bill, Brand Authorization"
                disabled={lockDocLabel}
                className={lockDocLabel ? "bg-slate-50 text-slate-500" : ""}
              />
              {lockDocLabel && (
                <p className="text-[10px] text-slate-400">Tagging the required “{addDocForm.label}” document to the selected brand.</p>
              )}
            </div>

            {(addDocForm.level === "brand" || addDocForm.level === "warehouse") && (
              <div className="space-y-1.5">
                <Label className="text-sm">Brand <span className="text-red-500">*</span></Label>
                <Select
                  value={addDocForm.brandId}
                  onValueChange={(v) => {
                    setAddDocForm((p) => ({ ...p, brandId: v, warehouseId: "" }));
                    if (addDocForm.level === "warehouse") loadWarehouses(Number(v));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {(brands ?? []).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.brandName} <span className="text-xs text-slate-400">({b.brandCode})</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {addDocForm.level === "warehouse" && (
              <div className="space-y-1.5">
                <Label className="text-sm">Warehouse <span className="text-red-500">*</span></Label>
                <Select
                  value={addDocForm.warehouseId}
                  onValueChange={(v) => setAddDocForm((p) => ({ ...p, warehouseId: v }))}
                  disabled={!addDocForm.brandId}
                >
                  <SelectTrigger><SelectValue placeholder={addDocForm.brandId ? "Select warehouse" : "Select a brand first"} /></SelectTrigger>
                  <SelectContent>
                    {(warehousesByBrand[Number(addDocForm.brandId)] ?? []).map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.warehouseName} <span className="text-xs text-slate-400">({w.warehouseCode})</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {addDocForm.brandId && (warehousesByBrand[Number(addDocForm.brandId)] ?? []).length === 0 && (
                  <p className="text-[10px] text-amber-500">No warehouses for this brand yet — add one first.</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm">File <span className="text-red-500">*</span></Label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => extraFileInputRef.current?.click()}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Choose File
                </Button>
                <span className="text-sm text-slate-500 truncate">{addDocFileName || "No file chosen"}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDoc(false)}>Cancel</Button>
            <Button onClick={handleSaveExtraDoc}>{lockDocLabel ? "Tag Document" : "Add Document"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Brand Dialog */}
      <Dialog open={showEditBrand} onOpenChange={setShowEditBrand}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
            <DialogDescription>Changes are submitted for Checker approval before they take effect.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Brand Name <span className="text-red-500">*</span></Label>
              <Input value={editBrandForm.brandName} onChange={(e) => setEditBrandForm((p) => ({ ...p, brandName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Legal Name</Label>
              <Input value={editBrandForm.brandLegalName} onChange={(e) => setEditBrandForm((p) => ({ ...p, brandLegalName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Category <span className="text-red-500">*</span></Label>
              <Input value={editBrandForm.brandCategory} onChange={(e) => setEditBrandForm((p) => ({ ...p, brandCategory: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Brand Type</Label>
              <Select value={editBrandForm.brandType} onValueChange={(v) => setEditBrandForm((p) => ({ ...p, brandType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RETAILER">Retailer</SelectItem>
                  <SelectItem value="DISTRIBUTOR">Distributor</SelectItem>
                  <SelectItem value="MANUFACTURER">Manufacturer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Commission Type</Label>
              <Select value={editBrandForm.commissionType} onValueChange={(v) => setEditBrandForm((p) => ({ ...p, commissionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLAT_PERCENT">Flat Percent</SelectItem>
                  <SelectItem value="TIERED">Tiered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Commission Rate (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" value={editBrandForm.commissionRate} onChange={(e) => setEditBrandForm((p) => ({ ...p, commissionRate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Return Window (days)</Label>
              <Input type="number" min="0" max="90" value={editBrandForm.returnWindowDays} onChange={(e) => setEditBrandForm((p) => ({ ...p, returnWindowDays: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">TCS Rate (%)</Label>
              <Input type="number" step="0.01" min="0" value={editBrandForm.tcsRate} onChange={(e) => setEditBrandForm((p) => ({ ...p, tcsRate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">TDS Rate (%)</Label>
              <Input type="number" step="0.01" min="0" value={editBrandForm.tdsRate} onChange={(e) => setEditBrandForm((p) => ({ ...p, tdsRate: e.target.value }))} />
            </div>
            <div className="col-span-2"><Separator /></div>
            <div className="col-span-2"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Finance SPOC <span className="text-red-500">*</span></p></div>
            <div className="space-y-1.5">
              <Label className="text-sm">SPOC Name</Label>
              <Input value={editBrandForm.spocName} onChange={(e) => setEditBrandForm((p) => ({ ...p, spocName: e.target.value }))} placeholder="Priya Sharma" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">SPOC Email</Label>
              <Input value={editBrandForm.spocEmail} onChange={(e) => setEditBrandForm((p) => ({ ...p, spocEmail: e.target.value }))} placeholder="priya@brand.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">SPOC Mobile</Label>
              <Input value={editBrandForm.spocMobile} onChange={(e) => setEditBrandForm((p) => ({ ...p, spocMobile: e.target.value }))} placeholder="+91 9876543210" />
            </div>
            <div className="col-span-2"><Separator /></div>
            <div className="col-span-2"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Operations SPOC <span className="text-red-500">*</span></p></div>
            <div className="space-y-1.5">
              <Label className="text-sm">SPOC Name</Label>
              <Input value={editBrandForm.opsSpocName} onChange={(e) => setEditBrandForm((p) => ({ ...p, opsSpocName: e.target.value }))} placeholder="Rohan Mehta" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">SPOC Email</Label>
              <Input value={editBrandForm.opsSpocEmail} onChange={(e) => setEditBrandForm((p) => ({ ...p, opsSpocEmail: e.target.value }))} placeholder="rohan@brand.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">SPOC Mobile</Label>
              <Input value={editBrandForm.opsSpocMobile} onChange={(e) => setEditBrandForm((p) => ({ ...p, opsSpocMobile: e.target.value }))} placeholder="+91 9876501234" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditBrand(false)}>Cancel</Button>
            <Button onClick={handleEditBrand} disabled={editBrandLoading || !editBrandForm.brandName || !editBrandForm.brandCategory || !brandSpocsValid(editBrandForm)}>
              {editBrandLoading ? "Submitting..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Warehouse Dialog */}
      <Dialog open={showEditWarehouse} onOpenChange={setShowEditWarehouse}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Warehouse</DialogTitle>
            <DialogDescription>Changes are submitted for Checker approval before they take effect.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Warehouse Name <span className="text-red-500">*</span></Label>
              <Input value={editWarehouseForm.warehouseName} onChange={(e) => setEditWarehouseForm((p) => ({ ...p, warehouseName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">State</Label>
                <Input value={editWarehouseForm.warehouseState} onChange={(e) => setEditWarehouseForm((p) => ({ ...p, warehouseState: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">GSTIN <span className="text-red-500">*</span></Label>
                <div className="flex gap-2">
                  <Input value={editWarehouseForm.warehouseGstin} onChange={(e) => setEditWarehouseForm((p) => ({ ...p, warehouseGstin: e.target.value }))} className="font-mono flex-1" />
                  <Button type="button" variant="outline" size="sm" disabled={editWarehouseGstLoading} onClick={fetchGstinForEditWarehouse} className="shrink-0">
                    {editWarehouseGstLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fetch"}
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Address</Label>
              <Textarea value={editWarehouseForm.warehouseAddress} onChange={(e) => setEditWarehouseForm((p) => ({ ...p, warehouseAddress: e.target.value }))} className="min-h-[70px]" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={editWarehouseForm.isPrimary} onChange={(e) => setEditWarehouseForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
              Primary warehouse
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditWarehouse(false)}>Cancel</Button>
            <Button onClick={handleEditWarehouse} disabled={editWarehouseLoading || !editWarehouseForm.warehouseName || !editWarehouseForm.warehouseGstin}>
              {editWarehouseLoading ? "Submitting..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={showEditCompany} onOpenChange={setShowEditCompany}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Company Details</DialogTitle>
            <DialogDescription>Update company &amp; tax identifiers. Saved to the draft; submitted to the Checker with the onboarding.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Company Legal Name <span className="text-red-500">*</span></Label>
              <Input value={editCompanyForm.companyName} onChange={(e) => setEditCompanyForm((p) => ({ ...p, companyName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Trade Name</Label>
              <Input value={editCompanyForm.tradeName} onChange={(e) => setEditCompanyForm((p) => ({ ...p, tradeName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Company Type</Label>
              <Select value={editCompanyForm.companyType} onValueChange={(v) => setEditCompanyForm((p) => ({ ...p, companyType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE_LIMITED">Private Limited</SelectItem>
                  <SelectItem value="PUBLIC_LIMITED">Public Limited</SelectItem>
                  <SelectItem value="LLP">LLP</SelectItem>
                  <SelectItem value="PARTNERSHIP">Partnership</SelectItem>
                  <SelectItem value="PROPRIETORSHIP">Proprietorship</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">PAN</Label>
              <Input value={editCompanyForm.pan} onChange={(e) => setEditCompanyForm((p) => ({ ...p, pan: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Master GSTIN</Label>
              <Input value={editCompanyForm.masterGstin} onChange={(e) => setEditCompanyForm((p) => ({ ...p, masterGstin: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">TAN</Label>
              <Input value={editCompanyForm.tan} onChange={(e) => setEditCompanyForm((p) => ({ ...p, tan: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">CIN</Label>
              <Input value={editCompanyForm.cin} onChange={(e) => setEditCompanyForm((p) => ({ ...p, cin: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-sm">Registered Address</Label>
              <Textarea value={editCompanyForm.registeredAddress} onChange={(e) => setEditCompanyForm((p) => ({ ...p, registeredAddress: e.target.value }))} className="min-h-[70px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditCompany(false)}>Cancel</Button>
            <Button onClick={handleEditCompany} disabled={editCompanyLoading || !editCompanyForm.companyName}>
              {editCompanyLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Bank Account Dialog */}
      <Dialog open={showAddBank} onOpenChange={setShowAddBank}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
            <DialogDescription>The account is submitted for Checker approval before it becomes active.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Tag to Brand <span className="text-red-500">*</span></Label>
              <Select value={addBankForm.brandId} onValueChange={(v) => setAddBankForm((p) => ({ ...p, brandId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger>
                <SelectContent>
                  {brands?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.brandName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Bank Name <span className="text-red-500">*</span></Label>
              <Input value={addBankForm.bankName} onChange={(e) => setAddBankForm((p) => ({ ...p, bankName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Account Number <span className="text-red-500">*</span></Label>
                <Input value={addBankForm.accountNumber} onChange={(e) => setAddBankForm((p) => ({ ...p, accountNumber: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">IFSC <span className="text-red-500">*</span></Label>
                <Input value={addBankForm.ifsc} onChange={(e) => setAddBankForm((p) => ({ ...p, ifsc: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Branch</Label>
                <Input value={addBankForm.branchName} onChange={(e) => setAddBankForm((p) => ({ ...p, branchName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Account Type</Label>
                <Select value={addBankForm.accountType} onValueChange={(v) => setAddBankForm((p) => ({ ...p, accountType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={addBankForm.isPrimary} onChange={(e) => setAddBankForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
              Primary account for this brand
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBank(false)}>Cancel</Button>
            <Button onClick={handleAddBank} disabled={addBankLoading || !addBankForm.brandId || !addBankForm.bankName || !addBankForm.accountNumber || !addBankForm.ifsc}>
              {addBankLoading ? "Submitting..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bank Account Dialog */}
      <Dialog open={showEditBank} onOpenChange={setShowEditBank}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Bank Account</DialogTitle>
            <DialogDescription>Changes are submitted for Checker approval before they take effect.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Tag to Brand</Label>
              <Select value={editBankForm.brandId} onValueChange={(v) => setEditBankForm((p) => ({ ...p, brandId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger>
                <SelectContent>
                  {brands?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.brandName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Bank Name <span className="text-red-500">*</span></Label>
              <Input value={editBankForm.bankName} onChange={(e) => setEditBankForm((p) => ({ ...p, bankName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Account Number <span className="text-red-500">*</span></Label>
                <Input value={editBankForm.accountNumber} onChange={(e) => setEditBankForm((p) => ({ ...p, accountNumber: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">IFSC <span className="text-red-500">*</span></Label>
                <Input value={editBankForm.ifsc} onChange={(e) => setEditBankForm((p) => ({ ...p, ifsc: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Branch</Label>
                <Input value={editBankForm.branchName} onChange={(e) => setEditBankForm((p) => ({ ...p, branchName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Account Type</Label>
                <Select value={editBankForm.accountType} onValueChange={(v) => setEditBankForm((p) => ({ ...p, accountType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={editBankForm.isPrimary} onChange={(e) => setEditBankForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
              Primary account for this brand
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditBank(false)}>Cancel</Button>
            <Button onClick={handleEditBank} disabled={editBankLoading || !editBankForm.bankName || !editBankForm.accountNumber || !editBankForm.ifsc}>
              {editBankLoading ? "Submitting..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entity Reject Dialog (brand / warehouse) */}
      <Dialog open={!!rejectEntity} onOpenChange={(o) => { if (!o) setRejectEntity(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejectEntity?.kind === "brand" ? "Brand" : rejectEntity?.kind === "warehouse" ? "Warehouse" : "Bank Account"}{rejectEntity?.isEdit ? " Edit" : ""}</DialogTitle>
            <DialogDescription>
              {rejectEntity?.isEdit
                ? `Reject the proposed changes to ${rejectEntity?.name}. The entity reverts to its last approved state.`
                : `Reject ${rejectEntity?.name}. A newly added entity will be marked rejected.`}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection (visible to the Maker)..."
            value={entityRejectNotes}
            onChange={(e) => setEntityRejectNotes(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectEntity(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRejectEntity} disabled={entityActionLoading || !entityRejectNotes.trim()}>
              {entityActionLoading ? "Rejecting..." : "Confirm Rejection"}
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

      {/* Request Edits Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Edits</DialogTitle>
            <DialogDescription>Send this submission back to the Maker as a draft with notes on what needs correcting.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Update GSTIN to match PAN state, re-upload signed agreement..."
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleRequestEdit} disabled={editLoading || !editNotes.trim()}>
              {editLoading ? "Sending..." : "Send Back to Maker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commission Version Dialog */}
      <Dialog open={showCommissionDialog} onOpenChange={setShowCommissionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Commercial Terms</DialogTitle>
            <DialogDescription>A new version archives the current terms. Orders settle at the rate effective on their order date (BRD §3.4). An addendum document is required from version 2 onward.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            {/* Commission model selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Commission Model</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "FLAT_PERCENT", label: "Flat Rate" },
                  { key: "SLAB", label: "Slab Based" },
                  { key: "GMV_TIER", label: "GMV Tier" },
                ] as const).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setNewCommission((p) => ({ ...p, commissionType: m.key }))}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition ${newCommission.commissionType === m.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {newCommission.commissionType === "FLAT_PERCENT" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Commission Rate (%)</label>
                <Input
                  type="number" step="0.01" min="0" max="100"
                  value={newCommission.commissionPercent}
                  onChange={(e) => setNewCommission((p) => ({ ...p, commissionPercent: e.target.value }))}
                  placeholder="e.g. 12.50"
                />
              </div>
            )}

            {newCommission.commissionType === "GMV_TIER" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tier Model</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: "THRESHOLD", label: "Threshold", hint: "Whole GMV charged at the band it lands in" },
                    { key: "CUMULATIVE", label: "Cumulative", hint: "Each band charged on the GMV within it" },
                  ] as const).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setNewCommission((p) => ({ ...p, gmvTierType: t.key }))}
                      className={`rounded-md border p-2.5 text-left transition ${newCommission.gmvTierType === t.key ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    >
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(newCommission.commissionType === "SLAB" || newCommission.commissionType === "GMV_TIER") && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{newCommission.commissionType === "SLAB" ? "Slabs" : "GMV Bands"}</label>
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-slate-500 font-medium px-1">
                    <span>GMV From (₹)</span><span>GMV To (₹)</span><span>Rate %</span><span></span>
                  </div>
                  {newCommission.slabs.map((s, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                      <Input type="number" min="0" value={s.minGmv} onChange={(e) => setNewCommission((p) => ({ ...p, slabs: p.slabs.map((x, j) => j === i ? { ...x, minGmv: e.target.value } : x) }))} />
                      <Input type="number" min="0" placeholder="∞" value={s.maxGmv} onChange={(e) => setNewCommission((p) => ({ ...p, slabs: p.slabs.map((x, j) => j === i ? { ...x, maxGmv: e.target.value } : x) }))} />
                      <Input type="number" step="0.01" min="0" max="100" value={s.rate} onChange={(e) => setNewCommission((p) => ({ ...p, slabs: p.slabs.map((x, j) => j === i ? { ...x, rate: e.target.value } : x) }))} />
                      <Button type="button" variant="ghost" size="icon" disabled={newCommission.slabs.length === 1} onClick={() => setNewCommission((p) => ({ ...p, slabs: p.slabs.filter((_, j) => j !== i) }))}>
                        <XCircle className="h-4 w-4 text-slate-400" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setNewCommission((p) => {
                    const last = p.slabs[p.slabs.length - 1];
                    return { ...p, slabs: [...p.slabs, { minGmv: last?.maxGmv || "", maxGmv: "", rate: "" }] };
                  })}
                >
                  + Add {newCommission.commissionType === "SLAB" ? "slab" : "band"}
                </Button>
                <p className="text-xs text-slate-400">Bands must be contiguous (each starts where the previous ends). Leave the final "to" blank for ∞.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Effective From Date</label>
              <Input type="date" value={newCommission.effectiveFromDate} onChange={(e) => setNewCommission((p) => ({ ...p, effectiveFromDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Addendum Document URL {(commissionHistory?.length ?? 0) >= 1 && <span className="text-red-500">*</span>}</label>
              <Input value={newCommission.addendumDocUrl} onChange={(e) => setNewCommission((p) => ({ ...p, addendumDocUrl: e.target.value }))} placeholder="https://docs.../addendum.pdf" />
              {(commissionHistory?.length ?? 0) >= 1 && <p className="text-xs text-slate-400">Required when revising existing commercial terms.</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Input value={newCommission.notes} onChange={(e) => setNewCommission((p) => ({ ...p, notes: e.target.value }))} placeholder="Rate revision for FY 2026-27" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCommissionDialog(false)}>Cancel</Button>
            <Button onClick={handleAddCommissionVersion}>
              Save Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
