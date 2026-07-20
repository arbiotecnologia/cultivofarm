import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useExecutivoGerarRelatorio } from "@/hooks/useExecutivoGerarRelatorio";
import type { ExecutivoFiltros } from "@/hooks/useExecutivoResumo";

const TIPOS = [
  { value: "resumo_geral", label: "Resumo Geral" },
  { value: "operacional", label: "Operacional" },
  { value: "financeiro", label: "Financeiro" },
  { value: "clientes_fazendas", label: "Clientes & Fazendas" },
  { value: "alertas_acoes", label: "Alertas & Ações" },
  { value: "completo", label: "Completo" },
  { value: "diretoria", label: "Diretoria" },
  { value: "reuniao_semanal", label: "Reunião Semanal" },
  { value: "reuniao_mensal", label: "Reunião Mensal" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filtrosBase: ExecutivoFiltros;
  onCreated: (id: string) => void;
}

export function ExecutivoRelatorioGerarDialog({ open, onOpenChange, filtrosBase, onCreated }: Props) {
  const [tipo, setTipo] = useState("resumo_geral");
  const [titulo, setTitulo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [periodo, setPeriodo] = useState(filtrosBase.periodo ?? "30_dias");
  const [incluirPlano, setIncluirPlano] = useState(true);
  const [incluirRankings, setIncluirRankings] = useState(true);
  const [incluirAlertas, setIncluirAlertas] = useState(true);

  const gerar = useExecutivoGerarRelatorio();

  const submit = async () => {
    const filtros = {
      ...filtrosBase,
      periodo,
      observacoes: observacoes || undefined,
      incluir_plano_acao: incluirPlano,
      incluir_rankings: incluirRankings,
      incluir_alertas_criticos: incluirAlertas,
    };
    try {
      const res = await gerar.mutateAsync({
        tipo,
        filtros,
        titulo: titulo.trim() || null,
      });
      if (res?.id) onCreated(res.id);
    } catch {
      /* toast tratado no hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar relatório executivo</DialogTitle>
          <DialogDescription>
            Selecione o tipo, período e o que deseja consolidar. Apenas dados gerenciais agregados serão incluídos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tipo de relatório</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Período</Label>
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7_dias">Últimos 7 dias</SelectItem>
                <SelectItem value="30_dias">Últimos 30 dias</SelectItem>
                <SelectItem value="90_dias">Últimos 90 dias</SelectItem>
                <SelectItem value="180_dias">Últimos 180 dias</SelectItem>
                <SelectItem value="365_dias">Último ano</SelectItem>
              </SelectContent>
            </Select>
            {(tipo === "reuniao_semanal" || tipo === "reuniao_mensal") && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Período padrão deste tipo: {tipo === "reuniao_semanal" ? "7 dias" : "30 dias"}.
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Título (opcional)</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título personalizado" />
          </div>

          <div>
            <Label className="text-xs">Observações (opcional)</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Notas internas..."
            />
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Incluir plano de ação</Label>
              <Switch checked={incluirPlano} onCheckedChange={setIncluirPlano} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Incluir rankings</Label>
              <Switch checked={incluirRankings} onCheckedChange={setIncluirRankings} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Incluir alertas críticos</Label>
              <Switch checked={incluirAlertas} onCheckedChange={setIncluirAlertas} />
            </div>
          </div>

          {filtrosBase.cliente_id && (
            <p className="text-[11px] text-muted-foreground">
              Filtro de cliente do Portal será aplicado.
            </p>
          )}
          {filtrosBase.fazenda_id && (
            <p className="text-[11px] text-muted-foreground">
              Filtro de fazenda do Portal será aplicado.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerar.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={gerar.isPending}>
            {gerar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Gerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
