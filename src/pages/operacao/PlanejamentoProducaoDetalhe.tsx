import { useMemo, useState, useEffect, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProductionPlanningDetail, useGenerateProductionOrders, useUpdatePlanningDates } from "@/hooks/useProductionPlanning";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeDisplay, formatDateDisplay } from "@/lib/date-utils";
import { brl } from "@/lib/financial/format";
import { ArrowLeft, Factory, Clock, CheckCircle2, Lock, FlaskConical, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  mensagemErro,
  podeGerarOrdens,
  rotuloStatus,
  validarDatasPlanejamento,
  varianteStatus,
} from "@/lib/planejamento-producao/planejamento";

// Formata a embalagem priorizando o volume real do vasilhame (catalogo_volumes).
function formatVasilhame(volumeMl: number | null | undefined, rotulo: string | null | undefined, unidade: string | null | undefined, quantidade: number): string {
  if (rotulo) return rotulo;
  if (volumeMl != null) {
    const ml = Number(volumeMl);
    if (ml >= 1000) {
      const l = ml / 1000;
      return `${l % 1 === 0 ? l.toFixed(0) : l.toFixed(2)} L`;
    }
    return `${ml.toFixed(0)} ml`;
  }
  const u = (unidade ?? "unidade").toLowerCase();
  if (u === "litro") return `${quantidade % 1 === 0 ? quantidade.toFixed(0) : quantidade.toFixed(2)} L`;
  if (u === "ml") return `${quantidade.toFixed(0)} ml`;
  return "unidade";
}

function formatVolumeL(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  return n % 1 === 0 ? `${n.toFixed(0)} L` : `${n.toFixed(2)} L`;
}

function formatConcentracao(valor: number | null | undefined, unidade: string | null | undefined): string | null {
  if (valor == null) return null;
  const u = unidade?.trim() || "UFC/ml";
  return `${Number(valor).toLocaleString("pt-BR")} ${u}`;
}

const MICRO_TIPO_LABEL: Record<string, string> = {
  bacteria: "Bactéria",
  fungo: "Fungo",
  levedura: "Levedura",
  consorcio: "Consórcio",
  outro: "Outro",
};

const EVENT_LABEL: Record<string, string> = {
  pedido_criado: "Pedido criado",
  pedido_aprovado: "Pedido aprovado",
  planejamento_criado: "Planejamento criado",
  op_gerada: "Ordens de produção geradas",
  producao_iniciada: "Produção iniciada",
  producao_finalizada: "Produção finalizada",
  entrega_realizada: "Entrega realizada",
  status_alterado: "Status atualizado",
};

export default function PlanejamentoProducaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data, isLoading, isError, error, refetch, isFetching } = useProductionPlanningDetail(id ?? null);
  const [gerando, setGerando] = useState(false);
  const generate = useGenerateProductionOrders();
  const updateDates = useUpdatePlanningDates();

  const canManageProduction =
    role === "administrador" || role === "gestor" || role === "producao";
  const isReadOnly = role === "gestor_comercial";

  const [startDate, setStartDate] = useState("");
  const [finishDate, setFinishDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (data?.planning) {
      setStartDate(data.planning.planned_start_date ?? "");
      setFinishDate(data.planning.planned_finish_date ?? "");
      setNotes(data.planning.production_notes ?? "");
    }
  }, [data]);

  const itemsRaw: any[] = (data?.items as any[]) ?? [];
  const groupedItems = useMemo(() => {
    const groups = new Map<string, { product_id: string; produto_nome: string; codigo: string | null; produto_tipo: string | null; microrganismos: any[]; dose_ml_ha: number | null; modo_aplicacao: string | null; total_qtd: number; total_volume_l: number | null; linhas: any[] }>();
    for (const it of itemsRaw) {
      const key = it.product_id ?? it.id;
      const existing = groups.get(key);
      if (existing) {
        existing.total_qtd += Number(it.quantidade) || 0;
        if (it.volume_total_l != null) {
          existing.total_volume_l = (existing.total_volume_l ?? 0) + Number(it.volume_total_l);
        }
        existing.linhas.push(it);
      } else {
        groups.set(key, {
          product_id: key,
          produto_nome: it.produto_nome,
          codigo: it.codigo ?? null,
          produto_tipo: it.produto_tipo ?? null,
          microrganismos: Array.isArray(it.microrganismos) ? it.microrganismos : [],
          dose_ml_ha: it.dose_ml_ha ?? null,
          modo_aplicacao: it.modo_aplicacao ?? null,
          total_qtd: Number(it.quantidade) || 0,
          total_volume_l: it.volume_total_l != null ? Number(it.volume_total_l) : null,
          linhas: [it],
        });
      }
    }
    const arr = Array.from(groups.values());
    arr.forEach((g) => g.linhas.sort((a, b) => (Number(b.quantidade) || 0) - (Number(a.quantidade) || 0)));
    return arr;
  }, [itemsRaw]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground" role="status">Carregando…</div>;

  if (isError || !data?.planning || !data?.order) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/operacao/planejamento")}>
          <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" /> Voltar
        </Button>
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {isError
              ? mensagemErro(error, "Não foi possível carregar este planejamento.")
              : "Planejamento não encontrado ou indisponível para o seu perfil."}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const { planning, partner: partnerRaw, order, timeline, has_orders } = data as any;
  const partner = partnerRaw ?? {};

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/operacao/planejamento")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Factory className="h-5 w-5" /> Planejamento — {order.numero}
        </h1>
        <Badge variant={varianteStatus(planning.status)} className="ml-2">{rotuloStatus(planning.status)}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Parceiro</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-medium">{partner.nome_fantasia ?? partner.razao_social}</div>
            <div className="text-muted-foreground">{partner.razao_social}</div>
            <div className="text-muted-foreground">CNPJ: {partner.cnpj ?? "—"}</div>
            <div className="text-muted-foreground">Email: {partner.email ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Pedido</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Aprovado em: {order.approved_at ? formatDateTimeDisplay(order.approved_at) : "—"}</div>
            <div>Data desejada: {order.requested_delivery_date ? formatDateDisplay(order.requested_delivery_date) : "—"}</div>
            <div>Previsão: {order.estimated_delivery_date ? formatDateDisplay(order.estimated_delivery_date) : "—"}</div>
            <div className="font-semibold">Total: {order.total != null ? brl(order.total) : "—"}</div>
            
            {order.commercial_notes && <div className="text-muted-foreground">Obs comercial: {order.commercial_notes}</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">Itens / Ordens de Produção</CardTitle>
          {canManageProduction ? (
            <Button
              size="sm"
              disabled={has_orders || generate.isPending || gerando}
              onClick={async () => {
                if (gerando || generate.isPending) return; // trava clique repetido
                setGerando(true);
                try {
                  // Garante estado fresco antes de chamar o RPC — evita
                  // "ainda não está aprovado" quando a aprovação acabou de propagar.
                  const fresh = await refetch();
                  const freshData: any = fresh.data;
                  const freshOrder = freshData?.order;
                  const freshPlanning = freshData?.planning;
                  if (!freshOrder || !freshPlanning) {
                    toast.error("Não foi possível confirmar o estado atual do pedido. Tente novamente.");
                    return;
                  }
                  const validacao = podeGerarOrdens({
                    status: freshPlanning.status,
                    hasOrders: freshData?.has_orders,
                    readyForProduction: freshOrder.ready_for_production,
                    itens: (freshData?.items ?? []) as any[],
                  });
                  if (!validacao.ok) {
                    toast.error(validacao.erro ?? "Não é possível gerar ordens de produção agora.");
                    return;
                  }
                  await new Promise<void>((resolve) =>
                    generate.mutate(
                      { partner_order_id: freshOrder.id, planning_id: freshPlanning.id, numero: freshOrder.numero },
                      { onSettled: () => { refetch(); resolve(); } },
                    ),
                  );
                } finally {
                  setGerando(false);
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" aria-hidden="true" />
              {has_orders ? "OPs já geradas" : generate.isPending || gerando ? "Gerando…" : "Gerar Ordem de Produção"}
            </Button>
          ) : (
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Somente leitura</Badge>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto / Microrganismo</TableHead>
                <TableHead>Embalagem</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>Status OS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    Sem itens.
                  </TableCell>
                </TableRow>
              )}
              {groupedItems.map((g) => {
                const micros = g.microrganismos ?? [];
                const isConsorcio = micros.length > 1;
                const techBits = [
                  g.dose_ml_ha != null ? `Dose: ${Number(g.dose_ml_ha).toLocaleString("pt-BR")} ml/ha` : null,
                  g.modo_aplicacao ? `Modo: ${g.modo_aplicacao}` : null,
                ].filter(Boolean);
                const osNumeros = Array.from(
                  new Set(g.linhas.map((it: any) => it.os_numero).filter(Boolean)),
                );
                const osStatuses = Array.from(
                  new Set(g.linhas.map((it: any) => it.os_status).filter(Boolean)),
                );
                const osLabel =
                  osNumeros.length === 0
                    ? "—"
                    : osNumeros.length === 1
                      ? osNumeros[0]
                      : `${osNumeros.length} OS`;
                const tamanhosUnicos = new Set(
                  g.linhas.map((it: any) => it.vasilhame_volume_ml ?? it.vasilhame_rotulo ?? it.unidade_medida),
                );
                const embalagemLabel =
                  tamanhosUnicos.size === 1
                    ? formatVasilhame(
                        g.linhas[0].vasilhame_volume_ml,
                        g.linhas[0].vasilhame_rotulo,
                        g.linhas[0].unidade_medida,
                        Number(g.linhas[0].quantidade) || 0,
                      )
                    : `${tamanhosUnicos.size} tamanhos`;
                return (
                  <Fragment key={g.product_id}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell className="py-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{g.produto_nome}</span>
                            {g.codigo && (
                              <span className="font-mono text-xs text-muted-foreground">{g.codigo}</span>
                            )}
                            {isConsorcio && (
                              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                Consórcio · {micros.length}
                              </Badge>
                            )}
                          </div>
                          {micros.length > 0 ? (
                            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                              {micros.map((m: any) => {
                                const tipoLabel = m.tipo
                                  ? MICRO_TIPO_LABEL[String(m.tipo).toLowerCase()] ?? m.tipo
                                  : null;
                                const concLabel = formatConcentracao(m.concentracao, m.concentracao_unidade);
                                return (
                                  <div key={m.id} className="flex items-center gap-1.5 flex-wrap">
                                    <FlaskConical className="h-3 w-3" />
                                    <span>{m.nome}</span>
                                    {m.codigo && <span className="font-mono">· {m.codigo}</span>}
                                    {tipoLabel && (
                                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                                        {tipoLabel}
                                      </Badge>
                                    )}
                                    {concLabel && <span className="font-mono">· {concLabel}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <FlaskConical className="h-3 w-3" />
                              <span>— microrganismo não informado</span>
                            </div>
                          )}
                          {techBits.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {techBits.join(" · ")}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">{embalagemLabel}</TableCell>
                      <TableCell className="text-right py-2">
                        {g.total_qtd}
                        <span className="text-xs text-muted-foreground ml-1">
                          {g.total_qtd === 1 ? "vasilhame" : "vasilhames"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold py-2">
                        {formatVolumeL(g.total_volume_l)}
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2">{osLabel}</TableCell>
                      <TableCell className="py-2">
                        {osStatuses.length === 1 ? (
                          <Badge variant="outline">{osStatuses[0]}</Badge>
                        ) : osStatuses.length > 1 ? (
                          <Badge variant="outline">múltiplos</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                    {g.linhas.map((it: any) => {
                      const qtd = Number(it.quantidade) || 0;
                      const totalL = it.volume_total_l != null ? Number(it.volume_total_l) : null;
                      return (
                        <TableRow key={it.id}>
                          <TableCell className="pl-8 text-xs text-muted-foreground">↳ vasilhame</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {formatVasilhame(it.vasilhame_volume_ml, it.vasilhame_rotulo, it.unidade_medida, qtd)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">×&nbsp;{qtd}</TableCell>
                          <TableCell className="text-right font-mono">{formatVolumeL(totalL)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">—</TableCell>
                          <TableCell className="text-xs text-muted-foreground">—</TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Datas previstas / Observações</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Início previsto</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!canManageProduction} />
          </div>
          <div>
            <Label>Término previsto</Label>
            <Input type="date" value={finishDate} onChange={(e) => setFinishDate(e.target.value)} disabled={!canManageProduction} />
          </div>
          <div className="md:col-span-3">
            <Label>Observações de produção</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={!canManageProduction} />
          </div>
          <div className="md:col-span-3 flex justify-end">
            {canManageProduction ? (
              <Button
                onClick={() =>
                  updateDates.mutate({
                    id: planning.id,
                    planned_start_date: startDate || null,
                    planned_finish_date: finishDate || null,
                    production_notes: notes || null,
                  })
                }
                disabled={updateDates.isPending}
              >
                Salvar
              </Button>
            ) : isReadOnly ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Visualização comercial</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Timeline</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative border-l border-border ml-2 space-y-3">
            {(timeline ?? []).map((ev: any) => (
              <li key={ev.id} className="ml-4">
                <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary"></div>
                <div className="text-sm font-medium">{EVENT_LABEL[ev.event_type] ?? ev.event_type}</div>
                <div className="text-xs text-muted-foreground">{formatDateTimeDisplay(ev.event_at)}</div>
              </li>
            ))}
            {(timeline ?? []).length === 0 && <li className="text-sm text-muted-foreground ml-4">Sem eventos.</li>}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
