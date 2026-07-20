import { useState } from "react";
import { Beaker, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Botão admin-only que popula o cockpit com 5 OSs de borda:
 * FIXT-001 (falta) · FIXT-002 (múltiplos lotes) · FIXT-003 (vencimento parcial)
 * FIXT-004 (excedente) · FIXT-005 (aguardando envase).
 * A RPC é idempotente — recria as OSs FIXT-* toda vez.
 */
export function SeedFixturesButton() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (role !== "administrador") return null;

  const executar = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("seed_cockpit_fixtures" as any, {
        p_prefix: "FIXT",
      });
      if (error) throw error;
      const summary = (data ?? {}) as Record<string, number | string>;
      toast.success("Fixtures do cockpit recriadas", {
        description: `OS: ${summary.os ?? 0} · Lotes: ${summary.lotes ?? 0} · Envase: ${summary.envase ?? 0} · Estoque: ${summary.estoque ?? 0}`,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cockpit-laboratorio"] }),
        qc.invalidateQueries({ queryKey: ["lotes"] }),
        qc.invalidateQueries({ queryKey: ["envase"] }),
        qc.invalidateQueries({ queryKey: ["estoque_produto"] }),
        qc.invalidateQueries({ queryKey: ["disponibilidade-os"] }),
      ]);
      setOpen(false);
    } catch (e: any) {
      toast.error("Falha ao gerar fixtures", { description: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Beaker className="h-3.5 w-3.5" />
          Gerar fixtures
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Gerar dados de teste do cockpit?</AlertDialogTitle>
          <AlertDialogDescription>
            Isto vai <strong>apagar e recriar</strong> as OSs FIXT-001 a FIXT-005 (e seus lotes,
            envases e estoque). Cobre os cenários de falta parcial, múltiplos lotes por
            microrganismo, vencimento parcial, excedente e aguardando envase. Nenhum outro dado é
            afetado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); executar(); }} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Recriar fixtures
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
