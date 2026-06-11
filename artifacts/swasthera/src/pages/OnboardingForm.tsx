import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
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
import { ArrowLeft, Info, Plus, Trash2 } from "lucide-react";

const onboardingSchema = z.object({
  companyName: z.string().min(1, "Required"),
  tradeName: z.string().optional(),
  companyType: z.string().min(1, "Required"),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i, "PAN must be 10 chars e.g. AAAPL1234C"),
  cin: z.string().optional(),
  llpCode: z.string().optional(),
  gstAvailable: z.boolean().optional(),
  masterGstin: z.string().optional(),
  tan: z.string().optional(),
  registeredAddress: z.string().min(1, "Required"),
  bankAccount: z.string().min(8, "Required"),
  bankIfsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, "Invalid IFSC format e.g. HDFC0001234"),
  bankName: z.string().min(1, "Required"),
  spocName: z.string().min(1, "SPOC name is required"),
  spocEmail: z.string().email("Invalid email"),
  spocMobile: z.string().min(10, "Invalid mobile"),
  brandName: z.string().min(1, "Required"),
  brandLegalName: z.string().min(1, "Required"),
  brandCategory: z.string().min(1, "Required"),
  brandType: z.string().min(1, "Required"),
  warehouseName: z.string().min(1, "Required"),
  warehouseState: z.string().min(1, "Required"),
  warehouseGstin: z.string().min(15, "GSTIN must be 15 characters"),
  warehouseAddress: z.string().min(1, "Required"),
  commissionRate: z.coerce.number().min(0).max(100),
  commissionType: z.string().min(1, "Required"),
  returnWindowDays: z.coerce.number().min(0).max(90),
  tcsRate: z.coerce.number().min(0),
  tdsRate: z.coerce.number().min(0),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

interface TierSlab {
  minGmv: number;
  maxGmv: number | null;
  rate: number;
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
      pan: "",
      cin: "",
      llpCode: "",
      gstAvailable: true,
      masterGstin: "",
      tan: "",
      registeredAddress: "",
      bankAccount: "",
      bankIfsc: "",
      bankName: "",
      spocName: "",
      spocEmail: "",
      spocMobile: "",
      brandName: "",
      brandLegalName: "",
      brandCategory: "",
      brandType: "",
      warehouseName: "",
      warehouseState: "",
      warehouseGstin: "",
      warehouseAddress: "",
      commissionRate: 0,
      commissionType: "FLAT_PERCENT",
      returnWindowDays: 15,
      tcsRate: 1,
      tdsRate: 1,
    }
  });

  const commissionType = form.watch("commissionType");
  const companyType = form.watch("companyType");
  const gstAvailable = form.watch("gstAvailable");

  const [ifscLoading, setIfscLoading] = useState(false);
  const [gstLoading, setGstLoading] = useState(false);

  // Entity-type-driven mandatory field hints (mirrors backend validationRules)
  const entityRequires = (field: "cin" | "llpCode" | "gstn") => {
    const t = companyType;
    if (field === "cin") return t === "PRIVATE_LIMITED" || t === "PUBLIC_LIMITED" || t === "LLP";
    if (field === "llpCode") return t === "LLP";
    if (field === "gstn") return !(t === "PROPRIETORSHIP" && gstAvailable === false);
    return false;
  };

  const lookupIfsc = async (code: string) => {
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(code)) return;
    setIfscLoading(true);
    try {
      const r = await fetch(`/api/utils/ifsc/${code.toUpperCase()}`);
      if (!r.ok) {
        toast({ title: "IFSC not found", description: "Check the code and try again", variant: "destructive" });
        return;
      }
      const d = await r.json();
      form.setValue("bankName", d.bank || "");
      toast({ title: "Bank details fetched", description: `${d.bank} — ${d.branch}` });
    } catch {
      toast({ title: "IFSC lookup failed", variant: "destructive" });
    } finally {
      setIfscLoading(false);
    }
  };

  const lookupGst = async (code: string) => {
    if (!code || code.length < 15) return;
    setGstLoading(true);
    try {
      const r = await fetch(`/api/utils/gst-lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstn: code.toUpperCase() }),
      });
      if (!r.ok) {
        toast({ title: "GST lookup failed", description: "Invalid GSTIN format", variant: "destructive" });
        return;
      }
      const d = await r.json();
      if (!form.getValues("tradeName")) form.setValue("tradeName", d.tradeName || "");
      if (!form.getValues("registeredAddress")) form.setValue("registeredAddress", d.registeredAddress || "");
      toast({ title: "GST verified (simulated)", description: `${d.state} • Status: ${d.status}` });
    } catch {
      toast({ title: "GST lookup failed", variant: "destructive" });
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

  const updateSlab = (i: number, key: keyof TierSlab, value: number | null) => {
    setTierSlabs((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: value };
      // Auto-update next slab's minGmv when maxGmv changes
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
    const payload: Record<string, unknown> = { ...data, masterGstin: data.masterGstin ?? "" };
    if (data.commissionType === "TIERED") {
      payload.tierConfig = JSON.stringify(tierSlabs);
      payload.commissionRate = 0;
    }
    createMutation.mutate({ data: payload as unknown as Parameters<typeof createMutation.mutate>[0]["data"] }, {
      onSuccess: (res) => {
        toast({ title: "Draft created — run KYB verification next", description: `Ref: ${res.ref}` });
        setLocation(`/onboarding/${res.id}`);
      },
      onError: () => {
        toast({ title: "Failed to create draft", variant: "destructive" });
      }
    });
  };

  const Field = ({ name, label, description, placeholder, type = "text" }: {
    name: keyof OnboardingFormValues; label: string; description?: string; placeholder?: string; type?: string;
  }) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl><Input type={type} placeholder={placeholder} {...field} value={field.value as string} /></FormControl>
        {description && <FormDescription className="text-xs">{description}</FormDescription>}
        <FormMessage />
      </FormItem>
    )} />
  );

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" className="px-0 text-slate-500 hover:text-slate-900 hover:bg-transparent" onClick={() => setLocation("/onboarding")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">New Onboarding</h1>
          <p className="text-slate-500 mt-1">Create a draft — KYB verification and documents are completed in the next step.</p>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>After saving this draft, you will be prompted to run KYB verification (PAN → GST → CIN → Bank). Documents can only be uploaded after KYB passes.</span>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* Company Details */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Company Details</CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <Field name="companyName" label="Company Legal Name" placeholder="Zara Fashions Pvt Ltd" />
                <Field name="tradeName" label="Trade Name" placeholder="Zara" description="Brand/trade name (auto-filled from GST)" />
                <FormField control={form.control} name="companyType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="PRIVATE_LIMITED">Private Limited</SelectItem>
                        <SelectItem value="PUBLIC_LIMITED">Public Limited</SelectItem>
                        <SelectItem value="LLP">LLP</SelectItem>
                        <SelectItem value="PARTNERSHIP">Partnership</SelectItem>
                        <SelectItem value="PROPRIETORSHIP">Proprietorship</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">Determines mandatory documents &amp; identifiers</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <Field name="pan" label="PAN" placeholder="AAAPL1234C" description="10-char PAN — KYB will verify this" />

                {/* GSTIN with auto-fetch */}
                <FormField control={form.control} name="masterGstin" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Master GSTIN {entityRequires("gstn") ? <span className="text-red-500">*</span> : <span className="text-slate-400 text-xs">(optional)</span>}</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="27AABCZ1234D1Z5"
                          {...field}
                          value={field.value as string}
                          onBlur={(e) => { field.onBlur(); lookupGst(e.target.value); }}
                        />
                      </FormControl>
                      <Button type="button" variant="outline" size="sm" disabled={gstLoading} onClick={() => lookupGst(form.getValues("masterGstin") ?? "")}>
                        {gstLoading ? "..." : "Fetch"}
                      </Button>
                    </div>
                    <FormDescription className="text-xs">Auto-fills trade name &amp; address (simulated GSTN)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                {entityRequires("cin") && (
                  <Field name="cin" label="CIN" placeholder="U74120DL2020PTC123456" description="Corporate Identity Number" />
                )}
                {entityRequires("llpCode") && (
                  <Field name="llpCode" label="LLP Identification No." placeholder="AAB-1234" description="Required for LLP entities" />
                )}
                <Field name="tan" label="TAN" placeholder="DELN00000A" description="Required for TDS credit back to brand" />

                {companyType === "PROPRIETORSHIP" && (
                  <FormField control={form.control} name="gstAvailable" render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-3 rounded-md border border-slate-200 px-3 py-2 col-span-2 bg-slate-50/50">
                      <FormControl>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-slate-900"
                          checked={field.value ?? true}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 text-sm font-normal text-slate-600">GST registered (uncheck if proprietorship is below the GST threshold)</FormLabel>
                    </FormItem>
                  )} />
                )}

                <div className="col-span-2">
                  <Field name="registeredAddress" label="Registered Address" placeholder="123 Business Park, Mumbai, Maharashtra 400001" />
                </div>
              </CardContent>
            </Card>

            {/* Brand Details */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Primary Brand</CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <Field name="brandName" label="Brand Display Name" placeholder="Zara India" />
                <Field name="brandLegalName" label="Brand Legal Name" placeholder="Zara Fashions Pvt Ltd" description="Legal entity owning this brand" />
                <Field name="brandCategory" label="Brand Category" placeholder="Fashion, Wellness, OTC..." />
                <FormField control={form.control} name="brandType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              </CardContent>
            </Card>

            {/* Banking */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Banking Information</CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <Field name="bankAccount" label="Account Number" placeholder="50100123456789" />
                {/* IFSC with auto-populate */}
                <FormField control={form.control} name="bankIfsc" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IFSC Code</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="HDFC0001234"
                          {...field}
                          value={field.value as string}
                          onBlur={(e) => { field.onBlur(); lookupIfsc(e.target.value); }}
                        />
                      </FormControl>
                      <Button type="button" variant="outline" size="sm" disabled={ifscLoading} onClick={() => lookupIfsc(form.getValues("bankIfsc"))}>
                        {ifscLoading ? "..." : "Verify"}
                      </Button>
                    </div>
                    <FormDescription className="text-xs">Bank name auto-fills from IFSC (live lookup)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="col-span-2">
                  <Field name="bankName" label="Bank Name" placeholder="HDFC Bank" description="Auto-populated from IFSC verification" />
                </div>
              </CardContent>
            </Card>

            {/* SPOC */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Finance SPOC</CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <Field name="spocName" label="SPOC Name" placeholder="Priya Sharma" />
                <Field name="spocEmail" label="SPOC Email" placeholder="priya@brand.com" description="Reports and invoices are emailed here" />
                <Field name="spocMobile" label="SPOC Mobile" placeholder="+91 9876543210" />
              </CardContent>
            </Card>

            {/* Warehouse */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Primary Warehouse</CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <Field name="warehouseName" label="Warehouse Name" placeholder="Mumbai FC" />
                <div className="space-y-2">
                  <Label>PIN Code</Label>
                  <Input
                    placeholder="400604"
                    maxLength={6}
                    onBlur={(e) => lookupWarehousePin(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">Auto-fills state (India Post lookup)</p>
                </div>
                <Field name="warehouseState" label="State" placeholder="Maharashtra" description="Drives TCS state-wise filing" />
                <Field name="warehouseGstin" label="Warehouse GSTIN" placeholder="27AABCZ1234D1Z5" description="State GSTIN for TCS accrual (Section 52)" />
                <div className="col-span-2">
                  <Field name="warehouseAddress" label="Warehouse Address" placeholder="Plot 12, MIDC Industrial Area, Thane 400604" />
                </div>
              </CardContent>
            </Card>

            {/* Commercial Terms */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Commercial Terms</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <FormField control={form.control} name="commissionType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commission Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <FormField control={form.control} name="commissionRate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Commission Rate (%)</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" max="100" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  <FormField control={form.control} name="returnWindowDays" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Return Window (days)</FormLabel>
                      <FormControl><Input type="number" min="0" max="90" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="tcsRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>TCS Rate (%)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormDescription className="text-xs">Section 52 GST</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Tiered GMV slab builder */}
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
