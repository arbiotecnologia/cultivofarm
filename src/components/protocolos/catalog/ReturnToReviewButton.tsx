import { GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { Undo2 } from "lucide-react";

interface Props {
  kind: "micro" | "produto";
  profileId: string | null | undefined;
  onDone?: () => void;
}

export function ReturnToReviewButton({ kind, profileId, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);




  const submit = async () => {
    toast.error(GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE);
    return;
    if (!profileId) return;
    if (motivo.trim().length < 5) {
      toast.error("Descreva o motivo do retorno (mín. 5 caracteres).");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("return_catalog_profile_to_review" as any, {
        p_kind: kind,
        p_profile_id: profileId,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      toast.success("Ficha retornada para ajustes");
      setOpen(false);
      setMotivo("");
      onDone?.();
    } catch (e: any) {
      toast.error(e.message || "Erro ao retornar ficha");
    } finally {
      setSaving(false);
    }
  };

  if (!profileId) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Undo2 className="h-3.5 w-3.5 mr-1" /> Retornar para ajustes
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retornar ficha para ajustes</AlertDialogTitle>
            <AlertDialogDescription>
              A ficha voltará ao status “em revisão”. Informe o motivo — ele ficará registrado na auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo do retorno</Label>
            <Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: revisar mecanismo de ação e adicionar fonte recente." />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); submit(); }}>
              Confirmar retorno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
