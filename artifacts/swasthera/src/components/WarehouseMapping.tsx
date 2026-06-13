import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Warehouse, Plus, Trash2, Loader2 } from "lucide-react";

interface BankAccountOption {
  id: number;
  bankName: string;
  accountNumber: string;
  status: string;
}

interface Mapping {
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  warehouseState: string | null;
  brandId: number | null;
  isMapped: boolean;
  bankAccountId: number | null;
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  usingPrimaryFallback: boolean;
}

export function WarehouseMapping({
  onboardingId,
  accounts,
  canEdit,
}: {
  onboardingId: number;
  accounts: BankAccountOption[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [warehouseId, setWarehouseId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");

  const { data, refetch } = useQuery<{ mappings: Mapping[] }>({
    queryKey: ["warehouse-mappings", onboardingId],
    queryFn: async () => {
      const r = await fetch(`/api/onboardings/${onboardingId}/warehouse-mappings`);
      if (!r.ok) return { mappings: [] };
      return r.json();
    },
    enabled: !!onboardingId,
  });
  const mappings = data?.mappings ?? [];

  const handleAdd = async () => {
    if (!warehouseId || !bankAccountId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/onboardings/${onboardingId}/warehouse-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: parseInt(warehouseId), bankAccountId: parseInt(bankAccountId) }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      toast({ title: "Warehouse routed", description: "Warehouse mapped to bank account" });
      setWarehouseId("");
      setBankAccountId("");
      refetch();
    } catch (err) {
      toast({ title: "Failed to map warehouse", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: number) => {
    setRemoving(id);
    try {
      const r = await fetch(`/api/onboardings/${onboardingId}/warehouse-mappings/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
      refetch();
    } catch {
      toast({ title: "Failed to remove mapping", variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  };

  if (activeAccounts.length === 0) return null;

  const unmappedWarehouses = mappings.filter((m) => !m.isMapped);

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Warehouse className="h-4 w-4 text-slate-600" />
        <p className="text-sm font-semibold text-slate-800">Warehouse–Bank Account Routing</p>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Route each warehouse's settlements to a specific account. One settlement record is created per
        destination account. Unmapped warehouses fall back to the primary account at settlement time.
      </p>

      {mappings.length > 0 ? (
        <div className="space-y-2 mb-3">
          {mappings.map((m) => (
            <div key={m.warehouseId} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-mono">{m.warehouseCode}</Badge>
                <span className="text-sm text-slate-800">{m.warehouseName}</span>
                {m.warehouseState && <span className="text-xs text-slate-400">({m.warehouseState})</span>}
                <span className="text-slate-300">→</span>
                <span className="text-sm font-medium text-slate-900">{m.bankName ?? "—"}</span>
                {m.accountNumber && <span className="font-mono text-xs text-slate-500">{m.accountNumber}</span>}
                {m.usingPrimaryFallback && (
                  <Badge className="text-[10px] bg-amber-100 text-amber-800 border-transparent">Primary fallback</Badge>
                )}
              </div>
              {canEdit && m.isMapped && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                  disabled={removing === m.warehouseId}
                  onClick={() => handleRemove(m.warehouseId)}
                >
                  {removing === m.warehouseId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic mb-3">No warehouses found — all orders route to the primary account.</p>
      )}

      {canEdit && unmappedWarehouses.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
            <SelectContent>
              {unmappedWarehouses.map((w) => (
                <SelectItem key={w.warehouseId} value={String(w.warehouseId)}>
                  {w.warehouseName} ({w.warehouseCode})
                </SelectItem>
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
          <Button size="sm" className="h-8 text-xs" disabled={saving || !warehouseId || !bankAccountId} onClick={handleAdd}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> Map</>}
          </Button>
        </div>
      )}
    </div>
  );
}
