import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateOnboarding } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ArrowLeft } from "lucide-react";

const onboardingSchema = z.object({
  companyName: z.string().min(1, "Required"),
  companyType: z.string().min(1, "Required"),
  pan: z.string().min(10, "Invalid PAN"),
  cin: z.string().optional(),
  masterGstin: z.string().min(15, "Invalid GSTIN"),
  tan: z.string().optional(),
  bankAccount: z.string().min(1, "Required"),
  bankIfsc: z.string().min(1, "Required"),
  bankName: z.string().min(1, "Required"),
  spocName: z.string().optional(),
  spocEmail: z.string().email("Invalid Email").optional(),
  spocMobile: z.string().optional(),
  brandName: z.string().min(1, "Required"),
  brandCategory: z.string().min(1, "Required"),
  brandType: z.string().min(1, "Required"),
  warehouseName: z.string().min(1, "Required"),
  warehouseState: z.string().min(1, "Required"),
  warehouseGstin: z.string().min(15, "Invalid GSTIN"),
  warehouseAddress: z.string().min(1, "Required"),
  commissionRate: z.coerce.number().min(0),
  commissionType: z.string().min(1, "Required"),
  returnWindowDays: z.coerce.number().min(0),
  tcsRate: z.coerce.number().min(0),
  tdsRate: z.coerce.number().min(0),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export function OnboardingForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateOnboarding();
  const [step, setStep] = useState(1);

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      companyName: "",
      companyType: "",
      pan: "",
      cin: "",
      masterGstin: "",
      tan: "",
      bankAccount: "",
      bankIfsc: "",
      bankName: "",
      spocName: "",
      spocEmail: "",
      spocMobile: "",
      brandName: "",
      brandCategory: "",
      brandType: "",
      warehouseName: "",
      warehouseState: "",
      warehouseGstin: "",
      warehouseAddress: "",
      commissionRate: 0,
      commissionType: "PERCENTAGE",
      returnWindowDays: 15,
      tcsRate: 1,
      tdsRate: 1,
    }
  });

  const onSubmit = (data: OnboardingFormValues) => {
    createMutation.mutate({ data }, {
      onSuccess: (res) => {
        toast({ title: "Draft created successfully" });
        setLocation(`/onboarding/${res.id}`);
      },
      onError: (err) => {
        toast({ title: "Failed to create draft", variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" className="px-0 text-slate-500 hover:text-slate-900 hover:bg-transparent" onClick={() => setLocation("/onboarding")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
        </Button>
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">New Onboarding</h1>
          <p className="text-slate-500 mt-1">Create a new brand onboarding draft</p>
        </div>

        <Card className="shadow-sm border-slate-200/60 bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <CardTitle className="text-lg">Company Details</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="companyType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="PRIVATE_LIMITED">Private Limited</SelectItem>
                            <SelectItem value="PUBLIC_LIMITED">Public Limited</SelectItem>
                            <SelectItem value="LLP">LLP</SelectItem>
                            <SelectItem value="PROPRIETORSHIP">Proprietorship</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pan"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PAN</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="masterGstin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Master GSTIN</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="brandName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="brandCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand Category</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="brandType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand Type</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bankAccount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Number</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bankIfsc"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IFSC Code</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <FormField
                    control={form.control}
                    name="warehouseName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warehouse Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="warehouseState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warehouse State</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="warehouseGstin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warehouse GSTIN</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="warehouseAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warehouse Address</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-4 gap-4">
                   <FormField
                    control={form.control}
                    name="commissionRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comm. Rate (%)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="returnWindowDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Return Window</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tcsRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TCS Rate (%)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tdsRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TDS Rate (%)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Draft"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
