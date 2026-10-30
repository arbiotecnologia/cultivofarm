import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { embalagemLabels, embalagemVolumes, fmtL, defaultValidade } from "@/lib/envaseFormat";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { probeEnvaseAvailability } from "@/lib/envase/envaseAvailability";
import type { EnvaseRpc } from "@/lib/envase/envaseFlow";

export interface RegistrarEnvaseTarget {
  programacao_id: string;
  os_id: string;
  origem: string;
  lote_id: string;
  codigo_lote?: string | null;
  produto?: string;
  produto_id?: string | null;
  microrganismo_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RegistrarEnvaseTarget | null;
}

interface Linha {
  tipo_embalagem: string;
  quantidade: string;
}

const novaLinha = (tipo = "frasco_1L"): Linha => ({ tipo_embalagem: tipo, quantidade: "" });

const volumeDaLinha = (l: Linha) =>
  (embalagemVolumes[l.tipo_embalagem] || 0) * Number(l.quantidade || 0);

export function RegistrarEnvaseDialog({ open, onOpenChange, target }: Props) {
  const { registrarEnvaseTransacional } = useEsteiraLaboratorio();
  const { user, profile } = useAuth();
  const scope = useStorageAccessScope("envase-dialog");
  const contextKey = JSON.stringify([open, scope.scope, target?.lote_id, target?.os_id, target?.programacao_id, target?.origem]);
  const context = useRef({ key: contextKey, generation: 0 });
  if (context.current.key !== contextKey) {
    context.current = { key: contextKey, generation: context.current.generation + 1 };
  }
  const generation = context.current.generation;
  const currentKey = `${generation}:${contextKey}`;
  const [availableScope, setAvailableScope] = useState<string | null>(null);
  useEffect(() => {
    setAvailableScope(null);
    if (!open || !target || !scope.ready || !user?.id || !profile?.organization_id) return;
    let active = true;
    const captured = scope.capture();
    const fence = () => { if (!active || !captured()) throw new Error("ENVASE_SCOPE_CHANGED"); };
    void probeEnvaseAvailability(supabase.rpc.bind(supabase) as unknown as EnvaseRpc, {
      actorId: user.id, orgId: profile.organization_id,
      args: { p_lote_id: target.lote_id, p_os_id: target.os_id, p_programacao_id: target.programacao_id, p_origem: target.origem,
        p_linhas: [], p_validade: "", p_operador: null, p_idempotency_key: "availability", p_permitir_parcial: false, p_motivo_parcial: null },
    }, fence).then(ok => { if (active && captured() && context.current.generation === generation && ok) setAvailableScope(currentKey); });
    return () => { active = false; };
  }, [currentKey]);
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()]);
  const [operador, setOperador] = useState("");
  const [validade, setValidade] = useState(defaultValidade());
  const [saving, setSaving] = useState(false);
  const [read, setRead] = useState<{
    key: string; status: "ready" | "error";
    saldo?: { produzido: number; envasado: number; saldo: number };
    demanda?: { solicitadoL: number; reservadoL: number; pendenteL: number };
  } | null>(null);
  const leituraAtual = open && scope.ready && read?.key === currentKey;
  const leituraPronta = leituraAtual && read.status === "ready";
  const saldo = leituraPronta ? read.saldo : null;
  const demanda = leituraPronta ? read.demanda : null;
  // Chave de idempotência por abertura do diálogo: duplo clique/retry não
  // gera envase duplicado — o servidor responde replay.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    setRead(null);
    setLinhas([novaLinha()]);
    setOperador("");
    setValidade(defaultValidade());
    if (!open || !target?.lote_id || !scope.ready) return;
    idempotencyKey.current = crypto.randomUUID();
    let active = true;
    const captured = scope.capture();
    const fresh = () => active && captured() && context.current.generation === generation && context.current.key === contextKey;
    const carregarSaldo = async () => {
    try {
    const responses = await Promise.all([
      supabase.from("lotes").select("volume_produzido").eq("id", target.lote_id).maybeSingle(),
      supabase.from("envase").select("volume_por_unidade, quantidade").eq("lote_id", target.lote_id),
      supabase
        .from("programacao_producao")
        .select("volume_necessario")
        .eq("id", target.programacao_id)
        .maybeSingle(),
      supabase
        .from("estoque_produto")
        .select("volume_total")
        .eq("lote_id", target.lote_id)
        .eq("reservado_para_os_id", target.os_id),
    ]);
    if (!fresh()) return;
    const [{ data: lote }, { data: envases }, { data: prog }, { data: reservas }] = responses;
    if (responses.some(r => r.error) || !lote || !prog || !Array.isArray(envases) || !Array.isArray(reservas)) throw new Error("ENVASE_READ_FAILED");
    const produzido = Number(lote.volume_produzido);
    const envasado = envases.reduce(
      (s: number, ev: any) => s + Number(ev.volume_por_unidade || 0) * Number(ev.quantidade || 0),
      0
    );
    const solicitadoL = Number(prog.volume_necessario) / 1000;
    const reservadoL = reservas.reduce(
      (s: number, r: any) => s + Number(r.volume_total),
      0,
    );
    const pendenteL = Math.max(0, solicitadoL - reservadoL);
    if (![produzido, envasado, solicitadoL, reservadoL].every(v => Number.isFinite(v) && v >= 0)) throw new Error("ENVASE_READ_FAILED");
    if (fresh()) setRead({ key: currentKey, status: "ready", saldo: { produzido, envasado, saldo: produzido - envasado }, demanda: { solicitadoL, reservadoL, pendenteL } });
    } catch {
      if (fresh()) setRead({ key: currentKey, status: "error" });
    }
    };
    void carregarSaldo();
    return () => { active = false; };
  }, [currentKey]);

  // Produção NÃO é editável aqui: alterar lotes.volume_produzido direto da tela
  // criaria mudança de produção sem trilha transacional. Sem produção registrada,
  // o envase é bloqueado e o operador volta à etapa de produção do Cockpit.




  const volSolicitado = linhas.reduce((s, l) => s + volumeDaLinha(l), 0);
  const excedeSaldo = !!saldo && volSolicitado > saldo.saldo;
  const loteSemProducao = !!saldo && saldo.produzido <= 0;
  const saldoRestante = (saldo?.saldo ?? 0) - volSolicitado;
  const menorVolume = Math.min(...Object.values(embalagemVolumes));
  const podeAdicionar = !!saldo && saldoRestante >= menorVolume;

  // Divide unidades de cada linha entre "reservado para a OS" (até cobrir a
  // demanda pendente sem fracionar embalagem) e "estoque livre" (excedente).
  const alocacao = (() => {
    let restanteMl = (demanda?.pendenteL ?? 0) * 1000;
    return linhas.map((l) => {
      const unitMl = embalagemVolumes[l.tipo_embalagem] || 0;
      const qtd = Number(l.quantidade || 0);
      if (!qtd || !unitMl) return { reservadas: 0, livres: qtd };
      const cabeReserva = restanteMl > 0 ? Math.min(qtd, Math.floor(restanteMl / unitMl)) : 0;
      restanteMl -= cabeReserva * unitMl;
      return { reservadas: cabeReserva, livres: qtd - cabeReserva };
    });
  })();

  const totReservadasMl = alocacao.reduce(
    (s, a, i) => s + a.reservadas * (embalagemVolumes[linhas[i].tipo_embalagem] || 0),
    0,
  );
  const totLivresMl = alocacao.reduce(
    (s, a, i) => s + a.livres * (embalagemVolumes[linhas[i].tipo_embalagem] || 0),
    0,
  );


  const updateLinha = (i: number, patch: Partial<Linha>) => {
    setLinhas((curr) => curr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const removerLinha = (i: number) => {
    setLinhas((curr) => curr.filter((_, idx) => idx !== i));
  };

  const adicionarLinha = () => {
    // Sugere embalagem que melhor aproveita o saldo restante
    const restante = saldoRestante;
    const candidatos = Object.entries(embalagemVolumes)
      .filter(([, v]) => v <= restante)
      .sort((a, b) => b[1] - a[1]);
    const tipo = candidatos[0]?.[0] ?? "frasco_1L";
    const vol = embalagemVolumes[tipo];
    const qtd = vol > 0 ? Math.floor(restante / vol) : 0;
    setLinhas((curr) => [...curr, { tipo_embalagem: tipo, quantidade: qtd > 0 ? String(qtd) : "" }]);
  };

  const qtdMaximaLinha = (i: number) => {
    const outras = linhas.reduce((s, l, idx) => (idx === i ? s : s + volumeDaLinha(l)), 0);
    const restante = (saldo?.saldo ?? 0) - outras;
    const vol = embalagemVolumes[linhas[i].tipo_embalagem] || 0;
    return vol > 0 ? Math.max(0, Math.floor(restante / vol)) : 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !open || saving || !leituraPronta || !scope.ready || availableScope !== currentKey) return;
    const captured = scope.capture();
    const submitGeneration = generation;
    if (loteSemProducao) {
      toast.error("O lote não possui volume produzido informado.");
      return;
    }
    if (linhas.some((l) => !l.tipo_embalagem || !Number(l.quantidade))) {
      toast.error("Preencha embalagem e quantidade em todas as linhas.");
      return;
    }
    if (excedeSaldo) {
      toast.error(`Volume (${fmtL(volSolicitado)}) excede o saldo disponível (${fmtL(saldo?.saldo ?? 0)}).`);
      return;
    }
    if (!validade) {
      toast.error("Informe a validade.");
      return;
    }

    setSaving(true);
    try {
      // Uma única chamada transacional: envase + estoque reservado/livre +
      // movimentações + auditoria + avanço da esteira. A divisão entre
      // reservado e excedente é decidida no servidor.
      const result = await registrarEnvaseTransacional({
        loteId: target.lote_id,
        osId: target.os_id,
        origem: target.origem,
        programacaoId: target.programacao_id,
        linhas: linhas.map((l) => ({
          tipo_embalagem: l.tipo_embalagem,
          quantidade: Number(l.quantidade),
        })),
        validade,
        operador: operador || null,
        idempotencyKey: idempotencyKey.current,
      });

      if (!result || !captured() || context.current.generation !== submitGeneration) return;
      if (result.estado === "partial") {
        toast.warning("Envase registrado. A demanda da OS ainda não foi coberta; a OS não avançou.");
      } else if ((result.estado === "completed" || result.estado === "completed_override") && result.avanco?.success === true && result.avanco?.status === "pronto_entrega") {
        toast.success("Envase registrado. OS pronta para entrega.");
      }

      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar envase</DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            {target?.codigo_lote && (
              <Badge variant="outline" className="font-mono">Lote {target.codigo_lote}</Badge>
            )}
            {target?.produto && <span className="text-xs text-muted-foreground">{target.produto}</span>}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {!leituraPronta && (leituraAtual && read.status === "error"
            ? <p role="alert" className="text-sm text-destructive">Não foi possível consultar o saldo e a demanda atuais. O envio está bloqueado.</p>
            : <p role="status" className="text-sm text-muted-foreground">Consultando saldo e demanda…</p>)}
          {saldo && (
            <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Produzido</p>
                <p className="text-sm font-mono-data font-semibold">{fmtL(saldo.produzido)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Já envasado</p>
                <p className="text-sm font-mono-data font-semibold">{fmtL(saldo.envasado)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Disponível</p>
                <p className={`text-sm font-mono-data font-semibold ${saldo.saldo <= 0 ? "text-destructive" : "text-primary"}`}>
                  {fmtL(saldo.saldo)}
                </p>
              </div>
            </div>
          )}
          {loteSemProducao && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3" role="alert">
              <p className="text-xs text-destructive">
                Este lote não tem volume produzido registrado. O envase fica bloqueado: volte à etapa de
                produção no Cockpit Laboratório e registre a produção do lote por lá. A produção não pode
                ser alterada nesta tela.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {linhas.map((linha, i) => {
              const maxL = qtdMaximaLinha(i);
              const volLinha = volumeDaLinha(linha);
              return (
                <div key={i} className="rounded-lg border p-3 space-y-2 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Embalagem #{i + 1}</p>
                    {linhas.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive"
                        onClick={() => removerLinha(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Embalagem *</Label>
                      <Select
                        value={linha.tipo_embalagem}
                        onValueChange={(v) => updateLinha(i, { tipo_embalagem: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(embalagemLabels).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Quantidade *</Label>
                      <Input
                        type="number"
                        min={1}
                        value={linha.quantidade}
                        onChange={(e) => updateLinha(i, { quantidade: e.target.value })}
                        required
                      />
                      {saldo && (
                        <p className="text-xs text-muted-foreground">
                          Máx.: <span className="font-mono-data font-semibold">{maxL}</span> un. · Subtotal{" "}
                          <span className="font-mono-data font-semibold">{fmtL(volLinha)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={adicionarLinha}
              disabled={!podeAdicionar}
            >
              <Plus className="h-4 w-4 mr-1" /> Adicionar embalagem
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Operador</Label>
              <Input value={operador} onChange={(e) => setOperador(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Validade *</Label>
              <Input
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                required
              />
            </div>
          </div>

          {volSolicitado > 0 && (
            <div className={`rounded-lg border p-3 ${excedeSaldo ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium ${excedeSaldo ? "text-destructive" : "text-primary"}`}>Volume total</p>
                  <p className={`text-lg font-mono-data font-bold ${excedeSaldo ? "text-destructive" : "text-primary"}`}>
                    {fmtL(volSolicitado)}
                  </p>
                </div>
                {saldo && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Saldo após envase</p>
                    <p className={`text-sm font-mono-data font-semibold ${saldoRestante < 0 ? "text-destructive" : saldoRestante === 0 ? "text-primary" : "text-foreground"}`}>
                      {fmtL(Math.max(0, saldoRestante))}
                    </p>
                  </div>
                )}
              </div>
              {excedeSaldo && saldo && (
                <p className="text-xs text-destructive mt-1">
                  Excede o saldo em {fmtL(volSolicitado - saldo.saldo)}.
                </p>
              )}
            </div>
          )}

          {demanda && demanda.solicitadoL > 0 && volSolicitado > 0 && (
            <div className="rounded-lg border border-dashed p-3 space-y-1 text-xs">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide">
                Destino do envase
              </p>
              <div className="flex justify-between">
                <span>Reservado para esta OS</span>
                <span className="font-mono-data font-semibold text-primary">
                  {fmtL(totReservadasMl)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Estoque livre (excedente)</span>
                <span className="font-mono-data font-semibold">{fmtL(totLivresMl)}</span>
              </div>
              {demanda.pendenteL * 1000 > totReservadasMl && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500 pt-1">
                  Ainda faltam {fmtL(demanda.pendenteL * 1000 - totReservadasMl)} para cobrir a
                  demanda da OS ({fmtL(demanda.solicitadoL * 1000)}).
                </p>
              )}
            </div>
          )}



          <Button
            type="submit"
            className="w-full font-bold"
            disabled={saving || !leituraPronta || !scope.ready || availableScope !== currentKey}
          >
            {saving ? "Registrando..." : "Registrar envase e avançar esteira"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
