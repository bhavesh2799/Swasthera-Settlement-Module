import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateOnboarding } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Info } from "lucide-react";

const onboardingSchema = z.object({
  companyName: z.string().min(1, "Required"),
  companyType: z.string().min(1, "Required"),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i, "PAN must be 10 chars e.g. AAAPL1234C"),
  cin: z.string().optional(),
  masterGstin: z.string().min(15, "GSTIN must be 15 characters"),
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

export function OnboardingForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateOnboarding();

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      companyName: "",
      companyType: "",
      pan: "",
      cin: "",
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

  const onSubmit = (data: OnboardingFormValues) => {
    createMutation.mutate({ data }, {
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
                    <FormMessage />
                  </FormItem>
                )} />
                <Field name="pan" label="PAN" placeholder="AAAPL1234C" description="10-char PAN — KYB will verify this" />
                <Field name="masterGstin" label="Master GSTIN" placeholder="27AABCZ1234D1Z5" description="Primary GSTIN for commission invoicing" />
                <Field name="cin" label="CIN" placeholder="U74120DL2020PTC123456" description="Optional for LLP / Proprietorship" />
                <Field name="tan" label="TAN" placeholder="DELN00000A" description="Required for TDS credit back to brand" />
                <div className="col-span-2">
                  <Field name="registeredAddress" label="Registered Address" placeholder="123 Business Park, Mumbai, Maharashtra 400001" />
                </div>
              </CardContent>
            </Card>

            {/* Brand Details */}
            <Card className="shadow-sm border-slate-200/60 bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-base">Brand Details</CardTitle>
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
                <Field name="bankName" label="Bank Name" placeholder="HDFC Bank" />
                <Field name="bankAccount" label="Account Number" placeholder="50100123456789" />
                <Field name="bankIfsc" label="IFSC Code" placeholder="HDFC0001234" />
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
              <CardContent className="p-6 grid grid-cols-4 gap-4">
                <FormField control={form.control} name="commissionType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commission Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="FLAT_PERCENT">Flat %</SelectItem>
                        <SelectItem value="TIERED">Tiered</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="commissionRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commission Rate (%)</FormLabel>
                    <FormControl><Input type="number" step="0.01" min="0" max="100" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
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
