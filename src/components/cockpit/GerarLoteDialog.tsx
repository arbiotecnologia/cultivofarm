import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Package } from "lucide-react";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { MoneyInput } from "@/components/ui/money-input";

export interface GerarLoteTarget {
  programacao_id: string;
  os_id: string;
  origem: "manual" | "onfarm" | string;
  numero_os?: string;
  cliente?: string;
  produto_id?: string | null;
  microrganismo_id?: string | null;
  produto_nome?: string;
  volume_solicitado?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: GerarLoteTarget | null;
  onCreated?: () => void;
}

export function GerarLoteDialog({ open, onOpenChange, target, onCreated }: Props) {
  const { gerarLote } = useEsteiraLaboratorio();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    volume_produzido: "",
    responsavel_producao: "",
    tanque: "",
    custo_producao_estimado: "",
    observacoes_tecnicas: "",
  });

  useEffect(() => {
    if (open && target) {
      setForm({
        volume_produzido: target.volume_solicitado ? String(target.volume_solicitado) : "",
        responsavel_producao: "",
        tanque: "",
        custo_producao_estimado: "",
        observacoes_tecnicas: "",
      });
    }
  }, [open, target]);

  if (!target) return null;
  const isMicro = !!target.microrganismo_id && !target.produto_id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      // O código do lote, o produto e o microrganismo são definidos
      // exclusivamente pelo servidor a partir da programação bloqueada.
      const loteData = {
        programacao_id: target.programacao_id,
        volume_produzido: form.volume_produzido ? Number(form.volume_produzido) * 1000 : null,
        responsavel_producao: form.responsavel_producao || null,
        tanque: form.tanque || null,
        custo_producao_estimado: form.custo_producao_estimado ? Number(form.custo_producao_estimado) : 0,
        observacoes_tecnicas: form.observacoes_tecnicas || null,
      };
      const result = await gerarLote(loteData, target.os_id, target.origem);
      if (result) {
        setForm({
          volume_produzido: "",
          responsavel_producao: "",
          tanque: "",
          custo_producao_estimado: "",
          observacoes_tecnicas: "",
        });
        onOpenChange(false);
        onCreated?.();
      }
    } finally {
      setSaving(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Lote de Produção</DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap text-xs">
            <Badge variant="outline" className="font-mono text-[10px]">{target.numero_os || "—"}</Badge>
            <Badge variant={isMicro ? "secondary" : "outline"} className="gap-1 text-[10px]">
              {isMicro ? <FlaskConical className="h-3 w-3" /> : <Package className="h-3 w-3" />}
              {isMicro ? "Microrganismo" : "Produto"}
            </Badge>
            <span className="text-muted-foreground truncate">{target.produto_nome}</span>
            {target.cliente && <span className="text-muted-foreground">· {target.cliente}</span>}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="rounded-md border border-dashed p-3">
            <p className="text-xs text-muted-foreground">
              O código do lote é gerado automaticamente pelo sistema no momento do registro,
              no padrão <span className="font-mono">LT-AAAA-0000</span>. Ele será exibido após a confirmação.
            </p>
          </div>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Volume Produzido (L)</Label>
              <Input
                type="number"
                value={form.volume_produzido}
                onChange={(e) => setForm({ ...form, volume_produzido: e.target.value })}
              />
              {(() => {
                const demanda = Number(target.volume_solicitado || 0);
                const produzido = Number(form.volume_produzido || 0);
                if (!demanda) return null;
                const delta = produzido - demanda;
                if (!produzido) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      Demanda da OS: <span className="font-mono-data font-semibold">{demanda} L</span>
                    </p>
                  );
                }
                if (delta === 0) {
                  return (
                    <p className="text-xs text-primary">
                      Produção conforme demanda ({demanda} L).
                    </p>
                  );
                }
                if (delta > 0) {
                  return (
                    <p className="text-xs text-primary">
                      Excedente: <span className="font-mono-data font-semibold">+{delta} L</span> irão
                      para estoque livre (demanda {demanda} L).
                    </p>
                  );
                }
                return (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    Faltam <span className="font-mono-data font-semibold">{Math.abs(delta)} L</span> para
                    atender a demanda de {demanda} L.
                  </p>
                );
              })()}
            </div>
            <div className="space-y-1.5">
              <Label>Tanque</Label>
              <Input value={form.tanque} onChange={(e) => setForm({ ...form, tanque: e.target.value })} placeholder="Ex: TQ-01" />
            </div>
          </div>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Input
                value={form.responsavel_producao}
                onChange={(e) => setForm({ ...form, responsavel_producao: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Custo Estimado</Label>
              <MoneyInput
                value={form.custo_producao_estimado}
                onValueChange={(v) => setForm({ ...form, custo_producao_estimado: String(v) })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações Técnicas</Label>
            <Input
              value={form.observacoes_tecnicas}
              onChange={(e) => setForm({ ...form, observacoes_tecnicas: e.target.value })}
              placeholder="Notas sobre a inoculação, etc."
            />
          </div>

          <Button type="submit" className="w-full h-11 font-bold" disabled={saving}>
            {saving ? "Gerando..." : "Registrar Lote"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
