import { GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "micro" | "produto";
  profileId: string | null;
  items: ChecklistItem[];
  approvedWithoutSource?: boolean;
  onConfirm: () => Promise<void>;
}

export function ApprovalChecklistDialog({ open, onOpenChange, kind, profileId, items, approvedWithoutSource = false, onConfirm }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setChecked({});
  }, [open]);

  const allRequiredChecked = useMemo(
    () => items.filter((i) => i.required).every((i) => checked[i.key]),
    [items, checked],
  );

  const confirm = async () => {
    if (!allRequiredChecked) return;
    toast.error(GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE);
    return;
    if (!profileId) {
      toast.error("Ficha ainda não persistida. Salve antes de aprovar.");
      return;
    }
    setBusy(true);
    try {
      const rpcName = kind === "micro"
        ? "approve_microorganism_profile_with_audit"
        : "approve_product_profile_with_audit";
      const { error } = await supabase.rpc(rpcName as any, {
        p_profile_id: profileId,
        p_checklist: checked as any,
        p_aprovado_sem_fonte: approvedWithoutSource,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["catalogo-tecnico"] }),
        qc.invalidateQueries({ queryKey: kind === "micro" ? ["micro-profile"] : ["product-profile"] }),
      ]);
      onOpenChange(false);
      toast.success("Ficha aprovada");
      await onConfirm();
    } catch (e: any) {
      const code: string = e?.message || "";
      const map: Record<string, string> = {
        approval_checklist_empty: "Checklist de aprovação vazio. Revise os itens obrigatórios.",
        approval_checklist_missing_resumo: "Checklist incompleto: resumo técnico não confirmado.",
        approval_checklist_missing_fontes: "Checklist incompleto: fontes técnicas não confirmadas.",
        approval_checklist_missing_sem_fonte: "Checklist incompleto: confirme ciência de aprovação sem fonte.",
        approval_missing_fontes: "A ficha não possui fonte técnica vinculada.",
        approval_checklist_missing_b2b: "Checklist incompleto: confirme o texto comercial B2B.",
        approval_checklist_missing_composicao: "Checklist incompleto: composição do produto não confirmada.",
        approval_checklist_missing_mecanismo: "Checklist incompleto: mecanismo de ação não confirmado.",
        approval_checklist_missing_beneficios: "Checklist incompleto: benefícios não confirmados.",
        approval_checklist_missing_beneficio: "Checklist incompleto: benefício não confirmado.",
        approval_checklist_missing_tecnica: "Checklist incompleto: descrição técnica não confirmada.",
        approval_checklist_missing_produtor: "Checklist incompleto: texto para produtor não confirmado.",
        approval_checklist_missing_alvos: "Checklist incompleto: alvos não confirmados.",
        approval_checklist_missing_cuidados: "Checklist incompleto: cuidados não confirmados.",
        approval_checklist_missing_regulatorias: "Checklist incompleto: informações regulatórias não confirmadas.",
      };
      toast.error(map[code] || "Erro ao aprovar ficha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar aprovação técnica</AlertDialogTitle>
          <AlertDialogDescription>
            Marque cada item revisado. A aprovação libera a ficha para produtor e parceiro B2B (se habilitado) e fica registrada em auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!profileId && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Ficha ainda não persistida. Salve antes de aprovar.
          </p>
        )}

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {items.map((it) => (
            <label key={it.key} className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={!!checked[it.key]}
                onCheckedChange={(v) => setChecked((s) => ({ ...s, [it.key]: !!v }))}
              />
              <span>
                {it.label}
                {!it.required && <span className="text-[10px] text-muted-foreground ml-1">(opcional)</span>}
              </span>
            </label>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={!profileId || !allRequiredChecked || busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirmar aprovação
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
