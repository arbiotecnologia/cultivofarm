import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { formatConcentracaoValue, parseConcentracao } from "@/lib/cqFormat";
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

export function RegistrarCQDialog({ open, onOpenChange, target }: Props) {
  const { aprovarCQ, reprovarCQ } = useEsteiraLaboratorio();
  const { role } = useAuth();
  const canEditRef = role === "administrador" || role === "gestor" || role === "producao";
  const { data: referencia, isLoading: refLoading } = useCQReferencia(
    target?.microrganismo_id,
    target?.produto_id,
  );
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditRef) {
      toast.error("Seu perfil possui acesso somente para consulta nesta etapa.");
      return;
    }
    if (!target) return;
    if (!target.lote_id) {
      toast.error("Gere o lote antes de registrar o CQ.");
      return;
    }
    if (!form.resultado) {
      toast.error("Selecione o resultado.");
      return;
    }

    setSaving(true);
    try {
      const { error: cqError } = await supabase.from("controle_qualidade").insert([{
        lote_id: target.lote_id,
        ph: form.ph ? Number(form.ph) : null,
        aparencia: form.aparencia || null,
        odor: form.odor || null,
        concentracao: formatConcentracaoValue(form.concentracao_mantissa, form.concentracao_expoente),
        contaminacao: form.contaminacao || null,
        responsavel: form.responsavel || null,
        resultado: form.resultado as any,
      }]);

      if (cqError) {
        toast.error(cqError.message);
        return;
      }

      const ok = form.resultado === "aprovado"
        ? await aprovarCQ(target.programacao_id, target.os_id, target.origem)
        : await reprovarCQ(target.programacao_id, target.os_id, target.origem);

      if (ok) {
        toast.success(`Laudo registrado — ${form.resultado === "aprovado" ? "APROVADO" : "REPROVADO"}`);
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar resultado do CQ</DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            {target?.codigo_lote && (
              <Badge variant="outline" className="font-mono">Lote {target.codigo_lote}</Badge>
            )}
            {target?.produto && <span className="text-xs text-muted-foreground">{target.produto}</span>}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
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
            <Label>Responsável</Label>
            <Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
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
          <Button type="submit" className="w-full font-bold" disabled={!canEditRef || saving || !form.resultado}>
            {saving ? "Registrando..." : "Registrar análise e avançar esteira"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
