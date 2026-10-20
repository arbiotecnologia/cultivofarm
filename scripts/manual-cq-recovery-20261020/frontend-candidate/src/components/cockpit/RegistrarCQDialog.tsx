import { useLayoutEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { formatConcentracaoValue } from "@/lib/cqFormat";
import { useCQReferencia } from "@/hooks/useCQReferencia";
import { CQComparativoTable } from "@/components/cockpit/CQComparativoTable";
import { useAuth } from "@/hooks/useAuth";

export interface RegistrarCQTarget {
  programacao_id: string;
  os_id: string;
  origem: string;
  lote_id?: string | null;
  codigo_lote?: string | null;
  produto?: string;
  produto_id?: string | null;
  microrganismo_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RegistrarCQTarget | null;
  phase?: "send" | "record";
  onCompleted?: () => void;
}

const EMPTY = {
  ph: "",
  aparencia: "",
  odor: "",
  concentracao_mantissa: "",
  concentracao_expoente: "",
  contaminacao: "",
  responsavel: "",
  resultado: "",
};

const advance = supabase.rpc.bind(supabase) as unknown as (
  name: "rpc_avancar_esteira_laboratorio", args: { p_os_id: string; p_origem: string; p_etapa_destino: string; p_programacao_id: string; p_cq?: Record<string, string | number | boolean | null> },
) => ReturnType<typeof supabase.rpc>;

export function RegistrarCQDialog({ open, onOpenChange, target, phase = "record", onCompleted }: Props) {
  const { roles = [] } = useAuth();
  const access = useStorageAccessScope(JSON.stringify(["cq", target?.os_id, target?.programacao_id, target?.lote_id, phase, open]));
  const canEditRef = roles.some((role) => ["administrador", "gestor", "producao"].includes(role));
  const refQuery = useCQReferencia(open && access.ready ? target?.microrganismo_id : null, target?.produto_id);
  const referencia = !refQuery.isFetching && !refQuery.isError ? refQuery.data : null;
  const refLoading = refQuery.isFetching;
  const [form, setForm] = useState(EMPTY);
  const [synthetic, setSynthetic] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    pending.current?.abort(); pending.current = null;
    setForm(EMPTY); setSynthetic(false); setSaving(false);
    return () => { pending.current?.abort(); };
  }, [open, target, phase, access.scope]);
  if (!open || !target || target.origem !== "manual" || !access.ready || !canEditRef) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending.current || !access.ready || !target.lote_id || !synthetic) return;
    const ph = Number(form.ph);
    const concentration = formatConcentracaoValue(form.concentracao_mantissa, form.concentracao_expoente);
    if (phase === "record" && (refLoading || refQuery.isError || (form.resultado === "aprovado" && !referencia?.id) || !form.ph.trim() || !Number.isFinite(ph) || ph < 0 || ph > 14 ||
      concentration === null || !Number.isFinite(concentration) || concentration < 0 || concentration > 1e30 ||
      !["aprovado", "reprovado"].includes(form.resultado) || !form.aparencia.trim() || !form.odor.trim() || !form.contaminacao.trim())) {
      toast.error("Confira os dados da análise antes de registrar."); return;
    }
    const current = access.capture(); const controller = new AbortController(); pending.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<null>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(null), { once: true });
      timer = setTimeout(() => controller.abort(), 12_000);
    });
    setSaving(true);
    try {
      const response = await Promise.race([advance("rpc_avancar_esteira_laboratorio", {
        p_os_id: target.os_id, p_origem: "manual", p_programacao_id: target.programacao_id,
        p_etapa_destino: phase === "send" ? "enviar_cq" : "registrar_cq",
        ...(phase === "record" ? { p_cq: {
          lote_id: target.lote_id, resultado: form.resultado, ph, concentracao: concentration,
          aparencia: form.aparencia.trim(), odor: form.odor.trim(), contaminacao: form.contaminacao.trim(),
          referencia_id: referencia?.id ?? null, dados_sinteticos: true,
        }} : {}),
      }).abortSignal(controller.signal), stopped]);
      if (!current()) return;
      if (controller.signal.aborted || !response || response.error || !response.data || typeof response.data !== "object" ||
        Array.isArray(response.data) || !("success" in response.data) || response.data.success !== true ||
        !("lote_id" in response.data) || response.data.lote_id !== target.lote_id ||
        !("status" in response.data) || response.data.status !== "em_cq") {
        toast.error("CQ não confirmado. Consulte a OS antes de tentar novamente."); return;
      }
      setForm(EMPTY); setSynthetic(false); onOpenChange(false); onCompleted?.();
      toast.success(phase === "send" ? "Lote enviado para CQ." : "Análise sintética registrada. Envase não iniciado.");
    } catch {
      if (current()) toast.error("CQ não confirmado. Consulte a OS antes de tentar novamente.");
    } finally {
      clearTimeout(timer);
      if (pending.current === controller) { pending.current = null; if (current()) setSaving(false); }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{phase === "send" ? "Enviar lote para CQ" : "Registrar resultado do CQ"}</DialogTitle>
          <DialogDescription asChild><div className="flex items-center gap-2 flex-wrap">
            {target?.codigo_lote && (
              <Badge variant="outline" className="font-mono">Lote {target.codigo_lote}</Badge>
            )}
            {target?.produto && <span className="text-xs text-muted-foreground">{target.produto}</span>}
          </div></DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <p className="text-sm font-semibold">DADOS FICTÍCIOS SEM VALOR COMERCIAL</p>
          <Label className="flex items-start gap-2"><input type="checkbox" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} disabled={saving} />Análise sintética; sem produção física, venda ou uso agrícola.</Label>
          {phase === "record" && <>
          <CQComparativoTable
            referencia={referencia}
            loading={refLoading}
            medido={{
              ph: form.ph,
              aparencia: form.aparencia,
              odor: form.odor,
              contaminacao: form.contaminacao,
              concentracao_mantissa: form.concentracao_mantissa,
              concentracao_expoente: form.concentracao_expoente,
            }}
            canEdit={canEditRef}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>pH</Label>
              <Input 
                type="number" 
                step="0.1" 
                placeholder="7,0"
                className="h-10 font-mono" 
                value={form.ph} 
                onChange={(e) => setForm({ ...form, ph: e.target.value })} 
              />
            </div>
            <div className="space-y-1.5">
              <Label>Concentração (UFC/mL)</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="text"
                  inputMode="decimal"
                  maxLength={4}
                  placeholder="1,5"
                  className="h-10 w-16 text-center font-mono"
                  value={form.concentracao_mantissa}
                  onChange={(e) => {
                    const v = e.target.value.replace(".", ",").replace(/[^0-9,]/g, "");
                    setForm({ ...form, concentracao_mantissa: v });
                  }}
                />
                <span className="text-sm text-muted-foreground font-medium italic select-none px-0.5">× 10</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="8"
                  className="h-10 w-12 text-center font-mono"
                  value={form.concentracao_expoente}
                  onChange={(e) => setForm({ ...form, concentracao_expoente: e.target.value.replace(/[^0-9]/g, "") })}
                />
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Use vírgula para decimais na mantissa (ex: 1,5).
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Aparência</Label>
              <Input value={form.aparencia} onChange={(e) => setForm({ ...form, aparencia: e.target.value })} placeholder="Normal, turvo..." />
            </div>
            <div className="space-y-1.5">
              <Label>Odor</Label>
              <Input value={form.odor} onChange={(e) => setForm({ ...form, odor: e.target.value })} placeholder="Característico..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Contaminação</Label>
            <Input value={form.contaminacao} onChange={(e) => setForm({ ...form, contaminacao: e.target.value })} placeholder="Ausente / Presente" />
          </div>
          <div className="space-y-1.5">
            <Label>Resultado *</Label>
            <Select value={form.resultado} onValueChange={(v) => setForm({ ...form, resultado: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aprovado">✅ Aprovado</SelectItem>
                <SelectItem value="reprovado">❌ Reprovado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          </>}
          <Button type="submit" className="w-full font-bold" disabled={!canEditRef || saving || !synthetic || (phase === "record" && (!form.resultado || refLoading || refQuery.isError))}>
            {saving ? "Registrando..." : phase === "send" ? "Enviar para CQ" : "Registrar análise sintética"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
