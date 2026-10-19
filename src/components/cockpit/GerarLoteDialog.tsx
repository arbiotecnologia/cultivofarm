import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Package } from "lucide-react";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

export interface GerarLoteTarget {
  programacao_id: string;
  os_id: string;
  origem: "manual" | "onfarm" | string;
  numero_os?: string;
  cliente?: string;
  produto_id?: string | null;
  microrganismo_id?: string | null;
  produto_nome?: string;
  /** Demanda da OS em LITROS (o banco guarda mL). */
  volume_solicitado?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: GerarLoteTarget | null;
  onCreated?: () => void;
}

const EMPTY = { volume_produzido: "", responsavel_producao: "", tanque: "", observacoes_tecnicas: "" };

/** Litros digitados (vírgula ou ponto) -> mL; null se inválido. */
export function litrosParaMl(value: string): number | null {
  const raw = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) return null;
  const ml = Math.round(Number(raw) * 1000 * 1000) / 1000;
  return Number.isFinite(ml) && ml > 0 ? ml : null;
}

export function GerarLoteDialog({ open, onOpenChange, target, onCreated }: Props) {
  const { gerarLote } = useEsteiraLaboratorio();
  const access = useStorageAccessScope(JSON.stringify(["gerar-lote", target?.programacao_id, target?.os_id, open]));
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  // Nova sessão/época/tenant/alvo: descarta rascunho e trava.
  useEffect(() => {
    pending.current = false;
    setSaving(false);
    setForm(open && target ? { ...EMPTY, volume_produzido: target.volume_solicitado ? String(target.volume_solicitado) : "" } : EMPTY);
  }, [open, target, access.scope]);

  if (!target) return null;
  const isMicro = !!target.microrganismo_id && !target.produto_id;
  const volumeMl = litrosParaMl(form.volume_produzido);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending.current || !access.ready || volumeMl === null) return;
    const current = access.capture();
    pending.current = true;
    setSaving(true);
    try {
      // Código, produto, microrganismo, tenant e data são definidos pelo servidor.
      const result = await gerarLote({
        programacao_id: target.programacao_id,
        volume_produzido: volumeMl,
        responsavel_producao: form.responsavel_producao,
        tanque: form.tanque,
        observacoes_tecnicas: form.observacoes_tecnicas,
      }, target.os_id, target.origem, current);
      if (!current() || !result) return;
      setForm(EMPTY);
      onOpenChange(false);
      onCreated?.();
    } finally {
      pending.current = false;
      if (current()) setSaving(false);
    }
  };

  const demanda = Number(target.volume_solicitado || 0);
  const produzidoL = volumeMl === null ? 0 : volumeMl / 1000;

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
              Registrar o lote não inicia controle de qualidade, envase nem estoque.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lote-volume">Volume Produzido (L)</Label>
              <Input
                id="lote-volume"
                inputMode="decimal"
                value={form.volume_produzido}
                disabled={saving}
                onChange={(e) => setForm({ ...form, volume_produzido: e.target.value })}
              />
              {form.volume_produzido && volumeMl === null ? (
                <p className="text-xs text-destructive">Informe um volume em litros maior que zero.</p>
              ) : demanda > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Demanda da OS: <span className="font-mono-data font-semibold">{demanda.toLocaleString("pt-BR")} L</span>
                  {produzidoL > 0 && produzidoL !== demanda ? ` · informado ${produzidoL.toLocaleString("pt-BR")} L` : ""}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lote-tanque">Tanque</Label>
              <Input id="lote-tanque" maxLength={60} value={form.tanque} disabled={saving} onChange={(e) => setForm({ ...form, tanque: e.target.value })} placeholder="Ex: TQ-01" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lote-responsavel">Responsável</Label>
            <Input id="lote-responsavel" maxLength={200} value={form.responsavel_producao} disabled={saving}
              onChange={(e) => setForm({ ...form, responsavel_producao: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lote-obs">Observações Técnicas</Label>
            <Input id="lote-obs" maxLength={2000} value={form.observacoes_tecnicas} disabled={saving}
              onChange={(e) => setForm({ ...form, observacoes_tecnicas: e.target.value })}
              placeholder="Notas sobre a inoculação, etc." />
          </div>

          <Button type="submit" className="w-full h-11 font-bold" disabled={saving || !access.ready || volumeMl === null}>
            {saving ? "Gerando..." : "Registrar Lote"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
