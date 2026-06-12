import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Plus, Trash2, Loader2 } from "lucide-react";

export const GST_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu & Kashmir" }, { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" }, { code: "04", name: "Chandigarh" }, { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" }, { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" }, { code: "10", name: "Bihar" }, { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" }, { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" }, { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "27", name: "Maharashtra" }, { code: "29", name: "Karnataka" }, { code: "30", name: "Goa" },
  { code: "32", name: "Kerala" }, { code: "33", name: "Tamil Nadu" }, { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
];

interface BankAccountOption {
  id: number;
  bankName: string;
  accountNumber: string;
  status: string;
}

interface Mapping {
  id: number;
  stateCode: string;
  stateName: string;
  bankAccountId: number;
  bankName: string | null;
  accountNumber: string | null;
  accountStatus: string;
}

export function JurisdictionMapping({
  onboardingId,
  accounts,
  canEdit,
}: {
  onboardingId: number;
  accounts: BankAccountOption[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [stateCode, setStateCode] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");

  const { data, refetch } = useQuery<{ mappings: Mapping[] }>({
    queryKey: ["jurisdiction-mappings", onboardingId],
    queryFn: async () => {
      const r = await fetch(`/api/onboardings/${onboardingId}/jurisdiction-mappings`);
      if (!r.ok) return { mappings: [] };
      return r.json();
    },
    enabled: !!onboardingId,
  });
  const mappings = data?.mappings ?? [];

  const handleAdd = async () => {
    if (!stateCode || !bankAccountId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/onboardings/${onboardingId}/jurisdiction-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateCode, bankAccountId: parseInt(bankAccountId) }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      toast({ title: "Jurisdiction routed", description: "State mapped to bank account" });
      setStateCode("");
      setBankAccountId("");
      refetch();
    } catch (err) {
      toast({ title: "Failed to map jurisdiction", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (code: string) => {
    setRemoving(code);
    try {
      const r = await fetch(`/api/onboardings/${onboardingId}/jurisdiction-mappings/${code}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
      refetch();
    } catch {
      toast({ title: "Failed to remove mapping", variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  };

  if (activeAccounts.length === 0) return null;

  const mappedStates = new Set(mappings.map((m) => m.stateCode));
  const availableStates = GST_STATES.filter((s) => !mappedStates.has(s.code));

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="h-4 w-4 text-slate-600" />
        <p className="text-sm font-semibold text-slate-800">Jurisdiction–Bank Account Mapping</p>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Route orders by state to a specific account. Unmapped states fall back to the primary account at settlement time.
      </p>

      {mappings.length > 0 ? (
        <div className="space-y-2 mb-3">
          {mappings.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-mono">{m.stateCode}</Badge>
                <span className="text-sm text-slate-800">{m.stateName}</span>
                <span className="text-slate-300">→</span>
                <span className="text-sm font-medium text-slate-900">{m.bankName ?? "—"}</span>
                {m.accountNumber && <span className="font-mono text-xs text-slate-500">{m.accountNumber}</span>}
                {m.accountStatus !== "ACTIVE" && (
                  <Badge className="text-[10px] bg-amber-100 text-amber-800 border-transparent">{m.accountStatus}</Badge>
                )}
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                  disabled={removing === m.stateCode}
                  onClick={() => handleRemove(m.stateCode)}
                >
                  {removing === m.stateCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic mb-3">No state mappings yet — all orders route to the primary account.</p>
      )}

      {canEdit && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={stateCode} onValueChange={setStateCode}>
            <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Select state…" /></SelectTrigger>
            <SelectContent>
              {availableStates.map((s) => (
                <SelectItem key={s.code} value={s.code}>{s.name} ({s.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bankAccountId} onValueChange={setBankAccountId}>
            <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Select account…" /></SelectTrigger>
            <SelectContent>
              {activeAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.bankName} ••••{a.accountNumber.slice(-4)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" disabled={saving || !stateCode || !bankAccountId} onClick={handleAdd}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> Map</>}
          </Button>
        </div>
      )}
    </div>
  );
}
