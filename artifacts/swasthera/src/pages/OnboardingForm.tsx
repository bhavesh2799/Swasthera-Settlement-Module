import { useLocation } from "wouter";
import { useForm, useFieldArray, type Control, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useCreateOnboarding } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Info, Plus, Trash2, Sparkles, Star, Upload, CheckCircle2 } from "lucide-react";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

const bankAccountSchema = z.object({
  accountNumber: z.string().min(8, "Required"),
  ifsc: z.string().regex(IFSC_RE, "Invalid IFSC e.g. HDFC0001234"),
  bankName: z.string().min(1, "Required"),
  branchName: z.string().optional(),
  accountType: z.enum(["current", "savings"]),
  isPrimary: z.boolean(),
});

const onboardingSchema = z.object({
  companyName: z.string().min(1, "Required"),
  tradeName: z.string().optional(),
  companyType: z.string().min(1, "Required"),
  entityTypeOther: z.string().optional(),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i, "PAN must be 10 chars e.g. AAAPL1234C"),
  cin: z.string().optional(),
  llpCode: z.string().optional(),
  gstAvailable: z.boolean().optional(),
  masterGstin: z.string().optional(),
  tan: z.string().optional(),
  registeredAddress: z.string().min(1, "Required"),
  registrationStatus: z.string().optional(),
  dateOfRegistration: z.string().optional(),
  taxpayerType: z.string().optional(),
  jurisdictionCode: z.string().optional(),
  natureOfBusiness: z.string().optional(),
  bankAccounts: z.array(bankAccountSchema).min(1, "At least one bank account is required"),
  spocName: z.string().min(1, "SPOC name is required"),
  spocEmail: z.string().email("Invalid email"),
  spocMobile: z.string().min(10, "Invalid mobile"),
  brandName: z.string().min(1, "Required"),
  brandCategory: z.string().min(1, "Required"),
  brandType: z.string().min(1, "Required"),
  brandCompanyAgreementUrl: z.string().optional(),
  warehouseName: z.string().min(1, "Required"),
  warehouseState: z.string().min(1, "Required"),
  warehouseGstin: z.string().min(15, "GSTIN must be 15 characters"),
  warehouseAddress: z.string().min(1, "Required"),
  commissionRate: z.coerce.number().min(0).max(100),
  commissionType: z.string().min(1, "Required"),
  returnWindowDays: z.coerce.number().min(0).max(90),
  tcsRate: z.coerce.number().min(0),
  tdsRate: z.coerce.number().min(0),
  mdrRate: z.coerce.number().min(0).max(100),
}).refine((d) => d.companyType !== "OTHER" || (d.entityTypeOther && d.entityTypeOther.trim().length > 0), {
  message: "Specify the entity type",
  path: ["entityTypeOther"],
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

interface TierSlab {
  minGmv: number;
  maxGmv: number | null;
  rate: number;
}

/**
 * Module-scope field component. Defining it OUTSIDE the form body is what keeps
 * inputs from losing focus on every keystroke (a new component identity each
 * render would remount the input). It receives `control` as a prop.
 */
function TextField({
  control,
  name,
  label,
  description,
  placeholder,
  type = "text",
  required,
  disabled,
}: {
  control: Control<OnboardingFormValues>;
  name: Path<OnboardingFormValues>;
  label: string;
  description?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required && <span className="text-red-500"> *</span>}
          </FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              disabled={disabled}
              {...field}
              value={(field.value as string) ?? ""}
            />
          </FormControl>
          {description && <FormDescription className="text-xs">{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function OnboardingForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateOnboarding();

  const [tierSlabs, setTierSlabs] = useState<TierSlab[]>([
    { minGmv: 0, maxGmv: 500000, rate: 15 },
    { minGmv: 500000, maxGmv: null, rate: 12 },
  ]);

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      companyName: "",
      tradeName: "",
      companyType: "",
      entityTypeOther: "",
      pan: "",
      cin: "",
      llpCode: "",
      gstAvailable: true,
      masterGstin: "",
      tan: "",
      registeredAddress: "",
      registrationStatus: "",
      dateOfRegistration: "",
      taxpayerType: "",
      jurisdictionCode: "",
      natureOfBusiness: "",
      bankAccounts: [
        { accountNumber: "", ifsc: "", bankName: "", branchName: "", accountType: "current", isPrimary: true },
      ],
      spocName: "",
      spocEmail: "",
      spocMobile: "",
      brandName: "",
      brandCategory: "",
      brandType: "",
      brandCompanyAgreementUrl: "",
      warehouseName: "",
      warehouseState: "",
      warehouseGstin: "",
      warehouseAddress: "",
      commissionRate: 0,
      commissionType: "FLAT_PERCENT",
      returnWindowDays: 15,
      tcsRate: 1,
      tdsRate: 1,
      mdrRate: 0,
    },
  });

  const { fields: bankFields, append: appendBank, remove: removeBank } = useFieldArray({
    control: form.control,
    name: "bankAccounts",
  });

  const commissionType = form.watch("commissionType");
  const companyType = form.watch("companyType");
  const gstAvailable = form.watch("gstAvailable");
  const brandAgreementUrl = form.watch("brandCompanyAgreementUrl");

  const [ifscLoading, setIfscLoading] = useState<number | null>(null);
  const [gstLoading, setGstLoading] = useState(false);
  const [sameAsCompany, setSameAsCompany] = useState(false);

  const entityRequires = (field: "cin" | "llpCode" | "gstn") => {
    const t = companyType;
    if (field === "cin") return t === "PRIVATE_LIMITED" || t === "PUBLIC_LIMITED";
    if (field === "llpCode") return t === "LLP";
    if (field === "gstn") return gstAvailable !== false;
    return false;
  };

  const lookupIfsc = async (code: string, index: number) => {
    if (!IFSC_RE.test(code)) return;
    setIfscLoading(index);
    try {
      const r = await fetch(`/api/utils/ifsc/${code.toUpperCase()}`);
      if (!r.ok) {
        toast({ title: "IFSC not found", description: "Check the code and try again", variant: "destructive" });
        return;
      }
      const d = await r.json();
      form.setValue(`bankAccounts.${index}.bankName`, d.bank || "");
      if (d.branch) form.setValue(`bankAccounts.${index}.branchName`, d.branch);
      toast({ title: "Bank details fetched", description: `${d.bank} — ${d.branch}` });
    } catch {
      toast({ title: "IFSC lookup failed", variant: "destructive" });
    } finally {
      setIfscLoading(null);
    }
  };

  // GSTIN-first KYB prefill — pulls company details from the (simulated) GSTN registry
  const fetchViaKyb = async () => {
    const code = form.getValues("masterGstin") ?? "";
    if (!code || code.length < 15) {
      toast({ title: "Enter a 15-character GSTIN first", variant: "destructive" });
      return;
    }
    setGstLoading(true);
    try {
      const r = await fetch(`/api/utils/gst-lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstn: code.toUpperCase() }),
      });
      if (!r.ok) {
        toast({ title: "KYB fetch failed", description: "Invalid GSTIN format", variant: "destructive" });
        return;
      }
      const d = await r.json();
      if (d.legalName) form.setValue("companyName", d.legalName);
      if (d.tradeName) form.setValue("tradeName", d.tradeName);
      if (d.pan) form.setValue("pan", d.pan);
      if (d.registeredAddress) form.setValue("registeredAddress", d.registeredAddress);
      if (d.registrationStatus) form.setValue("registrationStatus", d.registrationStatus);
      if (d.dateOfRegistration) form.setValue("dateOfRegistration", d.dateOfRegistration);
      if (d.taxpayerType) form.setValue("taxpayerType", d.taxpayerType);
      if (d.jurisdictionCode) form.setValue("jurisdictionCode", d.jurisdictionCode);
      if (d.natureOfBusiness) form.setValue("natureOfBusiness", d.natureOfBusiness);
      if (d.state) form.setValue("warehouseState", d.state);
      toast({ title: "Details fetched via KYB", description: `${d.state} • Status: ${d.status}` });
    } catch {
      toast({ title: "KYB fetch failed", variant: "destructive" });
    } finally {
      setGstLoading(false);
    }
  };

  const lookupWarehousePin = async (pin: string) => {
    if (!/^\d{6}$/.test(pin)) return;
    try {
      const r = await fetch(`/api/utils/pincode/${pin}`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.state) form.setValue("warehouseState", d.state);
    } catch {
      /* non-blocking */
    }
  };

  const setPrimaryBank = (index: number) => {
    bankFields.forEach((_, i) => form.setValue(`bankAccounts.${i}.isPrimary`, i === index));
  };

  const handleSameAsCompany = (checked: boolean) => {
    setSameAsCompany(checked);
    if (checked) {
      const trade = form.getValues("tradeName");
      const legal = form.getValues("companyName");
      form.setValue("brandName", trade || legal || "");
      const nature = form.getValues("natureOfBusiness");
      if (nature && !form.getValues("brandCategory")) form.setValue("brandCategory", nature);
    }
  };

  const handleAgreementUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    form.setValue("brandCompanyAgreementUrl", `uploaded://${file.name}`);
    toast({ title: "Agreement attached", description: file.name });
  };

  const updateSlab = (i: number, key: keyof TierSlab, value: number | null) => {
    setTierSlabs((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: value };
      if (key === "maxGmv" && value !== null && i + 1 < next.length) {
        next[i + 1] = { ...next[i + 1], minGmv: value };
      }
      return next;
    });
  };

  const addSlab = () => {
    const last = tierSlabs[tierSlabs.length - 1];
    const newMin = last?.maxGmv ?? 0;
    setTierSlabs((prev) => [
      ...prev.slice(0, -1),
      { ...prev[prev.length - 1], maxGmv: newMin },
      { minGmv: newMin, maxGmv: null, rate: 10 },
    ]);
  };

  const removeSlab = (i: number) => {
    if (tierSlabs.length <= 1) return;
    setTierSlabs((prev) => prev.filter((_, idx) => idx !== i));
  };

  const onSubmit = (data: OnboardingFormValues) => {
    const primary = data.bankAccounts.find((b) => b.isPrimary) ?? data.bankAccounts[0];
    const payload: Record<string, unknown> = {
      ...data,
      masterGstin: data.masterGstin ?? "",
      // Denormalized primary bank for backward compatibility
      bankAccount: primary?.accountNumber ?? "",
      bankIfsc: primary?.ifsc ?? "",
      bankName: primary?.bankName ?? "",
      // Brand-level SPOC mirrors the finance SPOC captured here
      brandSpocName: data.spocName,
      brandSpocEmail: data.spocEmail,
      brandSpocMobile: data.spocMobile,
    };
    if (data.commissionType === "TIERED") {
      payload.tierConfig = JSON.stringify(tierSlabs);
      payload.commissionRate = 0;
    }
    createMutation.mutate(
      { data: payload as unknown as Parameters<typeof createMutation.mutate>[0]["data"] },
      {
        onSuccess: (res) => {
          toast({ title: "Draft created — add documents next", description: `Ref: ${res.ref}` });
          setLocation(`/onboarding/${res.id}`);
        },
        onError: () => {
          toast({ title: "Failed to create draft", variant: "destructive" });
        },
      }
    );
  };

  const control = form.control;

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" className="px-0 text-slate-500 hover:text-slate-900 hover:bg-transparent" onClick={() => setLocation("/onboarding")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">New Onboarding</h1>
          <p className="text-slate-500 mt-1">Start with the GSTIN to auto-fill company details, then complete the remaining sections.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* GSTIN-first KYB prefill */}
            <Card className="shadow-sm border-indigo-200/70 bg-indigo-50/40">
              <CardHeader className="border-b border-indigo-100 py-4">
                <CardTitle className="text-base flex items-center gap-2 text-indigo-900">
                  <Sparkles className="h-4 w-4" /> Start with GSTIN
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <FormField control={control} name="gstAvailable" render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-3 rounded-md border border-indigo-200 bg-white px-3 py-2">
                    <FormControl>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-indigo-600"
                        checked={field.value !== false}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0 text-sm font-normal text-slate-600">GST is available for this entity (uncheck to enter company details manually)</FormLabel>
                  </FormItem>
                )} />

                {gstAvailable !== false && (
                  <FormField control={control} name="masterGstin" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Master GSTIN <span className="text-red-500">*</span></FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input placeholder="27AABCZ1234D1Z5" {...field} value={(field.value as string) ?? ""} />
                        </FormControl>
                        <Button type="button" disabled={gstLoading} onClick={fetchViaKyb} className="shrink-0 bg-indigo-600 hover:bg-indigo-700">
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          {gstLoading ? "Fetching..." : "Fetch Details via KYB"}
                        </Button>
                      </div>
                      <FormDescription className="text-xs">Auto-fills legal name, PAN, address, registration status &amp; nature of business (simulated GSTN).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </CardContent>
            </Card>

            {/* Company Details */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Company Details</CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <TextField control={control} name="companyName" label="Company Legal Name" placeholder="Zara Fashions Pvt Ltd" required />
                <TextField control={control} name="tradeName" label="Trade Name" placeholder="Zara" description="Brand/trade name (auto-filled from GST)" />

                <FormField control={control} name="companyType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entity Type <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select entity type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="PRIVATE_LIMITED">Private Limited</SelectItem>
                        <SelectItem value="PUBLIC_LIMITED">Public Limited</SelectItem>
                        <SelectItem value="LLP">LLP</SelectItem>
                        <SelectItem value="PARTNERSHIP">Partnership</SelectItem>
                        <SelectItem value="PROPRIETORSHIP">Proprietorship</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">Constitution of business — determines mandatory identifiers</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                {companyType === "OTHER" && (
                  <TextField control={control} name="entityTypeOther" label="Specify Entity Type" placeholder="e.g. Trust, HUF, Society" required />
                )}

                <TextField control={control} name="pan" label="PAN" placeholder="AAAPL1234C" description="10-char PAN — KYB will verify this" required />

                {entityRequires("cin") && (
                  <TextField control={control} name="cin" label="CIN" placeholder="U74120DL2020PTC123456" description="Corporate Identity Number" required />
                )}
                {entityRequires("llpCode") && (
                  <TextField control={control} name="llpCode" label="LLP Identification No." placeholder="AAB-1234" description="Required for LLP entities" required />
                )}
                <TextField control={control} name="tan" label="TAN" placeholder="DELN00000A" description="Required for TDS credit back to brand" />

                <TextField control={control} name="registrationStatus" label="Registration Status" placeholder="Active" description="From GSTN (auto-filled)" />
                <TextField control={control} name="taxpayerType" label="Taxpayer Type" placeholder="Regular" />
                <TextField control={control} name="dateOfRegistration" label="Date of Registration" placeholder="2019-07-01" type="date" />
                <TextField control={control} name="jurisdictionCode" label="Jurisdiction" placeholder="27-WARD-04" />
                <div className="col-span-2">
                  <TextField control={control} name="natureOfBusiness" label="Nature of Business" placeholder="Wholesale / Retail Trade" />
                </div>
                <div className="col-span-2">
                  <TextField control={control} name="registeredAddress" label="Registered Address" placeholder="123 Business Park, Mumbai, Maharashtra 400001" required />
                </div>
              </CardContent>
            </Card>

            {/* Brand Details */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Primary Brand</CardTitle>
                <label className="flex items-center gap-2 text-xs font-normal text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-slate-900"
                    checked={sameAsCompany}
                    onChange={(e) => handleSameAsCompany(e.target.checked)}
                  />
                  Brand same as company
                </label>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <TextField control={control} name="brandName" label="Brand Display Name" placeholder="Zara India" required disabled={sameAsCompany} />
                <TextField control={control} name="brandCategory" label="Brand Category" placeholder="Fashion, Wellness, OTC..." required />
                <FormField control={control} name="brandType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand Type <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="MANUFACTURER">Manufacturer</SelectItem>
                        <SelectItem value="RETAILER">Retailer</SelectItem>
                        <SelectItem value="TRADER">Trader</SelectItem>
                        <SelectItem value="DISTRIBUTOR">Distributor</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="space-y-2">
                  <Label>Brand–Company Agreement</Label>
                  {brandAgreementUrl ? (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 h-9 text-sm text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">{brandAgreementUrl.replace("uploaded://", "")}</span>
                      <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 px-2 text-emerald-700" onClick={() => form.setValue("brandCompanyAgreementUrl", "")}>
                        Replace
                      </Button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 h-9 text-sm text-slate-500 cursor-pointer hover:border-slate-400">
                      <Upload className="h-4 w-4" /> Upload agreement (PDF)
                      <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleAgreementUpload} />
                    </label>
                  )}
                  <p className="text-xs text-slate-500">Links the brand to the company entity</p>
                </div>
              </CardContent>
            </Card>

            {/* Banking — multiple accounts at brand level */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Bank Accounts</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => appendBank({ accountNumber: "", ifsc: "", bankName: "", branchName: "", accountType: "current", isPrimary: false })}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Account
                </Button>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {bankFields.map((bf, index) => (
                  <div key={bf.id} className="rounded-lg border border-slate-200 p-4 space-y-3 bg-slate-50/30">
                    <div className="flex items-center justify-between">
                      <FormField control={control} name={`bankAccounts.${index}.isPrimary`} render={({ field }) => (
                        <button
                          type="button"
                          onClick={() => setPrimaryBank(index)}
                          className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 transition-colors ${field.value ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                        >
                          <Star className={`h-3.5 w-3.5 ${field.value ? "fill-amber-500 text-amber-500" : ""}`} />
                          {field.value ? "Primary account" : "Set as primary"}
                        </button>
                      )} />
                      {bankFields.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeBank(index)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <TextField control={control} name={`bankAccounts.${index}.accountNumber`} label="Account Number" placeholder="50100123456789" required />
                      <FormField control={control} name={`bankAccounts.${index}.ifsc`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>IFSC Code <span className="text-red-500">*</span></FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input
                                placeholder="HDFC0001234"
                                {...field}
                                value={(field.value as string) ?? ""}
                                onBlur={(e) => { field.onBlur(); lookupIfsc(e.target.value, index); }}
                              />
                            </FormControl>
                            <Button type="button" variant="outline" size="sm" disabled={ifscLoading === index} onClick={() => lookupIfsc(form.getValues(`bankAccounts.${index}.ifsc`), index)}>
                              {ifscLoading === index ? "..." : "Verify"}
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <TextField control={control} name={`bankAccounts.${index}.bankName`} label="Bank Name" placeholder="HDFC Bank" description="Auto-fills from IFSC" required />
                      <FormField control={control} name={`bankAccounts.${index}.accountType`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="current">Current</SelectItem>
                              <SelectItem value="savings">Savings</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>
                ))}
                {form.formState.errors.bankAccounts?.root && (
                  <p className="text-sm text-red-500">{form.formState.errors.bankAccounts.root.message}</p>
                )}
              </CardContent>
            </Card>

            {/* Finance SPOC — brand level */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Finance SPOC (Brand)</CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <TextField control={control} name="spocName" label="SPOC Name" placeholder="Priya Sharma" required />
                <TextField control={control} name="spocEmail" label="SPOC Email" placeholder="priya@brand.com" description="Reports and invoices are emailed here" required />
                <TextField control={control} name="spocMobile" label="SPOC Mobile" placeholder="+91 9876543210" required />
              </CardContent>
            </Card>

            {/* Warehouse */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Primary Warehouse</CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <TextField control={control} name="warehouseName" label="Warehouse Name" placeholder="Mumbai FC" required />
                <div className="space-y-2">
                  <Label>PIN Code</Label>
                  <Input placeholder="400604" maxLength={6} onBlur={(e) => lookupWarehousePin(e.target.value)} />
                  <p className="text-xs text-slate-500">Auto-fills state (India Post lookup)</p>
                </div>
                <TextField control={control} name="warehouseState" label="State" placeholder="Maharashtra" description="Drives TCS state-wise filing" required />
                <TextField control={control} name="warehouseGstin" label="Warehouse GSTIN" placeholder="27AABCZ1234D1Z5" description="State GSTIN for TCS accrual (Section 52)" required />
                <div className="col-span-2">
                  <TextField control={control} name="warehouseAddress" label="Warehouse Address" placeholder="Plot 12, MIDC Industrial Area, Thane 400604" required />
                </div>
              </CardContent>
            </Card>

            {/* Commercial Terms */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Commercial Terms</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-6 gap-4">
                  <FormField control={control} name="commissionType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commission Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="FLAT_PERCENT">Flat %</SelectItem>
                          <SelectItem value="TIERED">Tiered GMV Slabs</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {commissionType !== "TIERED" && (
                    <FormField control={control} name="commissionRate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Commission (%)</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" max="100" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  <FormField control={control} name="returnWindowDays" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Return (days)</FormLabel>
                      <FormControl><Input type="number" min="0" max="90" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={control} name="tcsRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>TCS Rate (%)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormDescription className="text-xs">Section 52 GST</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={control} name="tdsRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>TDS Rate (%)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormDescription className="text-xs">Section 194-O</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={control} name="mdrRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>MDR Rate (%)</FormLabel>
                      <FormControl><Input type="number" step="0.01" min="0" max="100" {...field} /></FormControl>
                      <FormDescription className="text-xs">Payment gateway</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {commissionType === "TIERED" && (
                  <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-amber-900">GMV Tier Slabs</p>
                        <p className="text-xs text-amber-700 mt-0.5">Commission rate applied to orders within each GMV band per settlement cycle</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="border-amber-300 text-amber-800 hover:bg-amber-100" onClick={addSlab}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Tier
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {tierSlabs.map((slab, i) => (
                        <div key={i} className="flex gap-2 items-end bg-white rounded border border-amber-100 p-3">
                          <div className="flex items-center h-9 px-2 bg-amber-100 rounded text-xs font-mono text-amber-800 shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs text-slate-500">Min GMV (₹)</Label>
                            <Input
                              type="number"
                              value={slab.minGmv}
                              onChange={(e) => updateSlab(i, "minGmv", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm"
                              readOnly={i > 0}
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs text-slate-500">Max GMV (₹) {i === tierSlabs.length - 1 ? "(unlimited)" : ""}</Label>
                            <Input
                              type="number"
                              value={slab.maxGmv ?? ""}
                              onChange={(e) => updateSlab(i, "maxGmv", e.target.value ? parseFloat(e.target.value) : null)}
                              placeholder={i === tierSlabs.length - 1 ? "No limit" : ""}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="w-24 space-y-1">
                            <Label className="text-xs text-slate-500">Rate (%)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={slab.rate}
                              onChange={(e) => updateSlab(i, "rate", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                            onClick={() => removeSlab(i)}
                            disabled={tierSlabs.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="rounded bg-amber-100/60 px-3 py-2 text-xs text-amber-800">
                      Example: ₹0–5L @ 15%, ₹5L+ @ 12% means orders in first ₹5L of monthly GMV settle at 15%, above that at 12%.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>After saving this draft, you will run KYB verification (PAN → GST → CIN → Bank). Documents can only be uploaded after KYB passes.</span>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={createMutation.isPending} size="lg">
                {createMutation.isPending ? "Saving Draft..." : "Save Draft & Continue to KYB"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
