import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { formatOS } from "@/lib/osLabel";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { z } from "zod";
import { toast } from "sonner";

export interface ReservaPreset {
  cliente_id?: string;
  os_id: string;
  os_tipo: "onfarm" | "padrao" | "b2b";
  cliente_nome?: string;
  numero_os?: string;
  titular_tipo?: "cliente" | "parceiro";
  partner_id?: string;
  partner_order_id?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: any;
  preset?: ReservaPreset;
  onReserved?: () => void;
}

const baseSchema = {
  os_id: z.string().uuid("Selecione uma OS"),
  os_tipo: z.enum(["onfarm", "padrao", "b2b"]),
  quantidade_reservada: z.number().positive("Quantidade deve ser maior que zero"),
  observacao: z.string().max(500).optional(),
};
const schemaCliente = z.object({ ...baseSchema, cliente_id: z.string().uuid("Selecione um cliente") });
const schemaParceiro = z.object({ ...baseSchema, partner_id: z.string().uuid("Parceiro inválido"), partner_order_id: z.string().uuid("Pedido do parceiro inválido") });

type Titular = "cliente" | "parceiro";

export function ReservaDialog({ open, onOpenChange, item, preset, onReserved }: Props) {
  const { reservarEstoque } = useEsteiraLaboratorio();
  const presetParceiro = preset?.titular_tipo === "parceiro";
  const [titular, setTitular] = useState<Titular>(presetParceiro ? "parceiro" : "cliente");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verTodasOS, setVerTodasOS] = useState(false);
  const [confirmOverrideOpen, setConfirmOverrideOpen] = useState(false);
  const [overrideConfirmado, setOverrideConfirmado] = useState(false);

  // Origem do lote: OS que produziu este item
  const { data: origemLote } = useQuery({
    queryKey: ["reserva-origem-lote", item?.lote_id],
    enabled: !!item?.lote_id && open,
    queryFn: async () => {
      const { data: loteRow } = await supabase
        .from("lotes")
        .select("programacao_id, codigo_lote")
        .eq("id", item.lote_id)
        .maybeSingle();
      const programacaoId = (loteRow as any)?.programacao_id;
      if (!programacaoId) return { osId: null, osTipo: null, numero: null, titular: null };
      const { data: progRow } = await supabase
        .from("programacao_producao")
        .select("ordem_servico_id, ordem_servico_onfarm_id")
        .eq("id", programacaoId)
        .maybeSingle();
      const osId = (progRow as any)?.ordem_servico_id ?? (progRow as any)?.ordem_servico_onfarm_id ?? null;
      const osTipo: "padrao" | "onfarm" | null = (progRow as any)?.ordem_servico_id
        ? "padrao"
        : (progRow as any)?.ordem_servico_onfarm_id
          ? "onfarm"
          : null;
      if (!osId || !osTipo) return { osId: null, osTipo: null, numero: null, titular: null };
      if (osTipo === "padrao") {
        const { data: os } = await supabase
          .from("ordens_servico")
          .select("id, numero_os, cliente_id, partner_order_id, clientes(nome), partner_orders(numero, partner_accounts(nome_fantasia, razao_social))")
          .eq("id", osId)
          .maybeSingle();
        const anyOs: any = os;
        const isB2B = !!anyOs?.partner_order_id;
        const titular = isB2B
          ? `OP ${anyOs?.partner_orders?.numero ?? "?"} · ${anyOs?.partner_orders?.partner_accounts?.nome_fantasia ?? anyOs?.partner_orders?.partner_accounts?.razao_social ?? "Parceiro"}`
          : anyOs?.clientes?.nome ?? "Cliente";
        return { osId, osTipo: isB2B ? ("b2b" as const) : ("padrao" as const), numero: anyOs?.numero_os ?? null, titular };
      }
      const { data: osOn } = await supabase
        .from("ordens_servico_onfarm")
        .select("id, numero_os, cliente_id, clientes(nome)")
        .eq("id", osId)
        .maybeSingle();
      const anyOs: any = osOn;
      return { osId, osTipo: "onfarm" as const, numero: anyOs?.numero_os ?? null, titular: anyOs?.clientes?.nome ?? "Cliente" };
    },
  });
  const [form, setForm] = useState({
    cliente_id: preset?.cliente_id ?? "",
    os_compound: preset ? `${preset.os_tipo}:${preset.os_id}` : "",
    partner_id: preset?.partner_id ?? "",
    partner_order_id: preset?.partner_order_id ?? "",
    partner_os_id: preset?.titular_tipo === "parceiro" ? preset.os_id : "",
    quantidade_reservada: "",
    observacao: "",
  });

  // Saldo em tempo real
  const { data: latestStock } = useQuery({
    queryKey: ["estoque-item-atual", item?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("estoque_produto")
        .select("quantidade")
        .eq("id", item.id)
        .single();
      return data;
    },
    enabled: !!item?.id && open,
    refetchInterval: 5000,
  });

  const saldoDisponivel = latestStock?.quantidade ?? item?.quantidade ?? 0;

  useEffect(() => {
    if (open) {
      setTitular(presetParceiro ? "parceiro" : "cliente");
      setForm({
        cliente_id: preset?.cliente_id ?? "",
        os_compound: preset ? `${preset.os_tipo}:${preset.os_id}` : "",
        partner_id: preset?.partner_id ?? "",
        partner_order_id: preset?.partner_order_id ?? "",
        partner_os_id: preset?.titular_tipo === "parceiro" ? preset.os_id : "",
        quantidade_reservada: String(item?.quantidade ?? ""),
        observacao: "",
      });
      setVerTodasOS(false);
      setOverrideConfirmado(false);
      setConfirmOverrideOpen(false);
    }
  }, [open, item, preset, presetParceiro]);

  /* ============ CLIENTE ============ */
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-select"],
    enabled: !preset && titular === "cliente",
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, nome").order("nome");
      return data || [];
    },
  });

  const { data: ordensOnfarm = [] } = useQuery({
    queryKey: ["os-onfarm-reserva", form.cliente_id],
    enabled: !preset && titular === "cliente" && !!form.cliente_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_servico_onfarm")
        .select("id, numero_os, status, data_recomendada, produto_id")
        .eq("cliente_id", form.cliente_id)
        .not("status", "in", "(entregue,cancelada,finalizada)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: ordensPadrao = [] } = useQuery({
    queryKey: ["os-padrao-reserva", form.cliente_id],
    enabled: !preset && titular === "cliente" && !!form.cliente_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status, data_programada, produto_id")
        .eq("cliente_id", form.cliente_id)
        .not("status", "in", "(entregue,cancelada,finalizada)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  /* ============ PARCEIRO B2B ============ */
  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros-select-reserva"],
    enabled: !preset && titular === "parceiro" && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("partner_accounts")
        .select("id, razao_social, nome_fantasia")
        .order("razao_social");
      return data || [];
    },
  });

  const { data: partnerOrders = [] } = useQuery({
    queryKey: ["partner-orders-reserva", form.partner_id, item?.produto_id, item?.microrganismo_id],
    enabled: !preset && titular === "parceiro" && !!form.partner_id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("partner_orders")
        .select(`
          id, numero, status, requested_delivery_date, created_at,
          partner_order_items ( id, product_id, microrganismo_id, quantidade, unidade_medida, produto_nome_snapshot )
        `)
        .eq("partner_id", form.partner_id)
        .in("status", ["aprovado", "em_producao", "pronto", "em_separacao"] as any)
        .order("created_at", { ascending: false });
      // Prioriza pedidos com itens que casam com o produto/microrganismo do estoque
      const list = (data || []).map((o: any) => ({
        ...o,
        _matches: (o.partner_order_items || []).some((it: any) =>
          (item?.produto_id && it.product_id === item.produto_id) ||
          (item?.microrganismo_id && it.microrganismo_id === item.microrganismo_id),
        ),
      }));
      list.sort((a: any, b: any) => Number(b._matches) - Number(a._matches));
      return list;
    },
  });

  const selectedOrder = useMemo(
    () => partnerOrders.find((o: any) => o.id === form.partner_order_id),
    [partnerOrders, form.partner_order_id],
  );

  // OS B2B já geradas a partir desse pedido
  const { data: osB2B = [] } = useQuery({
    queryKey: ["os-b2b-pedido", form.partner_order_id, item?.produto_id, item?.microrganismo_id],
    enabled: !preset && titular === "parceiro" && !!form.partner_order_id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status, produto_id, microrganismo_id, partner_order_item_id")
        .eq("partner_order_id", form.partner_order_id)
        .not("status", "in", "(entregue,cancelada,finalizada)")
        .order("created_at", { ascending: false });
      const list = (data || []).map((o: any) => ({
        ...o,
        _matches: (item?.produto_id && o.produto_id === item.produto_id) ||
          (item?.microrganismo_id && o.microrganismo_id === item.microrganismo_id),
      }));
      list.sort((a: any, b: any) => Number(b._matches) - Number(a._matches));
      return list;
    },
  });

  // Auto-seleciona OS B2B compatível quando há apenas uma opção que case
  useEffect(() => {
    if (titular !== "parceiro" || preset) return;
    if (form.partner_os_id) return;
    const matches = osB2B.filter((o: any) => o._matches);
    if (matches.length === 1) {
      setForm((f) => ({ ...f, partner_os_id: matches[0].id }));
    }
  }, [osB2B, titular, preset, form.partner_os_id]);

  /* ============ RASTREABILIDADE OS↔LOTE ============ */
  const origemOsId = origemLote?.osId ?? null;

  const marcarMatch = (list: any[], idKey: string = "id") =>
    (list || []).map((o: any) => ({ ...o, _matchesLote: origemOsId ? o[idKey] === origemOsId : true }));

  const ordensOnfarmMarcadas = useMemo(() => marcarMatch(ordensOnfarm), [ordensOnfarm, origemOsId]);
  const ordensPadraoMarcadas = useMemo(() => marcarMatch(ordensPadrao), [ordensPadrao, origemOsId]);
  const osB2BMarcadas = useMemo(() => marcarMatch(osB2B), [osB2B, origemOsId]);

  const ordensOnfarmVis = useMemo(
    () => (verTodasOS || !origemOsId ? ordensOnfarmMarcadas : ordensOnfarmMarcadas.filter((o) => o._matchesLote)),
    [ordensOnfarmMarcadas, verTodasOS, origemOsId],
  );
  const ordensPadraoVis = useMemo(
    () => (verTodasOS || !origemOsId ? ordensPadraoMarcadas : ordensPadraoMarcadas.filter((o) => o._matchesLote)),
    [ordensPadraoMarcadas, verTodasOS, origemOsId],
  );
  const osB2BVis = useMemo(
    () => (verTodasOS || !origemOsId ? osB2BMarcadas : osB2BMarcadas.filter((o) => o._matchesLote)),
    [osB2BMarcadas, verTodasOS, origemOsId],
  );

  const nenhumMatchCliente = !!origemOsId && (ordensOnfarmMarcadas.some((o) => o._matchesLote) || ordensPadraoMarcadas.some((o) => o._matchesLote)) === false && (ordensOnfarm.length + ordensPadrao.length) > 0;
  const nenhumMatchB2B = !!origemOsId && osB2BMarcadas.some((o) => o._matchesLote) === false && osB2B.length > 0;

  const osSelecionadaId = titular === "parceiro"
    ? (preset?.os_id ?? form.partner_os_id ?? "")
    : (form.os_compound ? form.os_compound.split(":")[1] : "");
  const osSelecionadaDivergente = !!origemOsId && !!osSelecionadaId && osSelecionadaId !== origemOsId;

  // Reseta confirmação se o usuário trocar a OS
  useEffect(() => {
    setOverrideConfirmado(false);
  }, [osSelecionadaId]);


  const handleConfirmarReserva = async () => {
    // Gatekeep divergência OS↔lote: pede confirmação explícita antes de submeter
    if (osSelecionadaDivergente && !overrideConfirmado) {
      setConfirmOverrideOpen(true);
      return;
    }
    setIsSubmitting(true);
    try {
      const qtyToReserve = Number(form.quantidade_reservada);

      if (isNaN(qtyToReserve) || qtyToReserve <= 0) {
        toast.error("Informe uma quantidade válida maior que zero");
        return;
      }

      if (qtyToReserve > saldoDisponivel) {
        toast.error(`Quantidade superior ao saldo disponível (${saldoDisponivel})`);
        return;
      }

      let titular_nome: string | undefined;
      let reservaData: any;
      let osIdFinal: string;
      let osTipoFinal: string;

      if (titular === "parceiro") {
        const partner_id = preset?.partner_id ?? form.partner_id;
        const partner_order_id = preset?.partner_order_id ?? form.partner_order_id;
        const os_id = preset?.os_id ?? form.partner_os_id;
        const parsed = schemaParceiro.parse({
          partner_id,
          partner_order_id,
          os_id,
          os_tipo: "b2b",
          quantidade_reservada: qtyToReserve,
          observacao: form.observacao || undefined,
        });
        titular_nome =
          preset?.cliente_nome ||
          (() => {
            const p = parceiros.find((x: any) => x.id === parsed.partner_id) as any;
            return p?.razao_social || p?.nome_fantasia;
          })();
        reservaData = {
          partner_id: parsed.partner_id,
          partner_order_id: parsed.partner_order_id,
          quantidade_reservada: parsed.quantidade_reservada,
          observacao: parsed.observacao,
          titular_nome,
        };
        osIdFinal = parsed.os_id;
        osTipoFinal = parsed.os_tipo;
      } else {
        const [os_tipo, os_id] = form.os_compound.split(":");
        const parsed = schemaCliente.parse({
          cliente_id: form.cliente_id,
          os_id,
          os_tipo,
          quantidade_reservada: qtyToReserve,
          observacao: form.observacao || undefined,
        });
        titular_nome =
          preset?.cliente_nome ||
          (clientes.find((c: any) => c.id === parsed.cliente_id) as any)?.nome;
        reservaData = {
          cliente_id: parsed.cliente_id,
          quantidade_reservada: parsed.quantidade_reservada,
          observacao: parsed.observacao,
          titular_nome,
        };
        osIdFinal = parsed.os_id;
        osTipoFinal = parsed.os_tipo;
      }

      const success = await reservarEstoque(item, reservaData, osIdFinal, osTipoFinal, osSelecionadaDivergente);

      if (success) {
        onReserved?.();
        onOpenChange(false);
      }
    } catch (e: any) {
      console.error("Erro na reserva:", e);
      if (e instanceof z.ZodError) {
        toast.error(e.errors[0]?.message || "Erro de validação");
      } else {
        toast.error(e.message || "Erro ao processar reserva");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = (() => {
    if (!form.quantidade_reservada || isSubmitting) return false;
    if (titular === "parceiro") {
      if (preset) return true;
      return !!form.partner_id && !!form.partner_order_id && !!form.partner_os_id;
    }
    return !!form.cliente_id && !!form.os_compound;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reservar item — {item?.lotes?.codigo_lote}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {origemLote?.osId && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="uppercase text-[10px]">Origem do lote</Badge>
                <span className="truncate">
                  <span className="font-medium">{origemLote.numero ?? origemLote.osId.slice(0, 8)}</span>
                  <span className="text-muted-foreground"> · {origemLote.titular}</span>
                </span>
              </div>
              <Badge variant="secondary" className="text-[10px] uppercase">{origemLote.osTipo}</Badge>
            </div>
          )}
          {preset ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">{presetParceiro ? "Parceiro" : "Cliente"}:</span> <span className="font-medium">{preset.cliente_nome ?? "—"}</span></div>
              <div><span className="text-muted-foreground">OS:</span> <span className="font-medium">{preset.numero_os ?? preset.os_id.slice(0, 8)}</span> <span className="text-[10px] uppercase text-muted-foreground">({preset.os_tipo})</span></div>
            </div>
          ) : (
            <>
              <Tabs value={titular} onValueChange={(v) => setTitular(v as Titular)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="cliente">Cliente</TabsTrigger>
                  <TabsTrigger value="parceiro">Parceiro B2B</TabsTrigger>
                </TabsList>
              </Tabs>

              {titular === "cliente" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Cliente</Label>
                    <Select value={form.cliente_id} onValueChange={(v) => setForm((f) => ({ ...f, cliente_id: v, os_compound: "" }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                      <SelectContent>
                        {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Ordem de Serviço</Label>
                      {origemOsId && (ordensOnfarm.length + ordensPadrao.length) > 0 && (
                        <button
                          type="button"
                          className="text-[11px] text-primary hover:underline"
                          onClick={() => {
                            const next = !verTodasOS;
                            setVerTodasOS(next);
                            if (next) toast.warning("Exibindo OSs fora da origem do lote — pode gerar divergência de rastreabilidade.");
                          }}
                        >
                          {verTodasOS ? "Ver só desta origem" : "Ver todas as OSs do cliente"}
                        </button>
                      )}
                    </div>
                    <Select value={form.os_compound} onValueChange={(v) => setForm((f) => ({ ...f, os_compound: v }))} disabled={!form.cliente_id}>
                      <SelectTrigger><SelectValue placeholder={form.cliente_id ? "Selecione a OS" : "Selecione o cliente primeiro"} /></SelectTrigger>
                      <SelectContent>
                        {ordensOnfarmVis.map((o: any) => (
                          <SelectItem key={`onfarm:${o.id}`} value={`onfarm:${o.id}`}>
                            Produção · {formatOS(o)} · {o.status}{o._matchesLote ? " · ✓ origem" : ""}
                          </SelectItem>
                        ))}
                        {ordensPadraoVis.map((o: any) => (
                          <SelectItem key={`padrao:${o.id}`} value={`padrao:${o.id}`}>
                            Padrão · {formatOS(o)} · {o.status}{o._matchesLote ? " · ✓ origem" : ""}
                          </SelectItem>
                        ))}
                        {ordensOnfarmVis.length === 0 && ordensPadraoVis.length === 0 && form.cliente_id && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            {nenhumMatchCliente
                              ? "Nenhuma OS deste cliente corresponde à origem do lote."
                              : "Nenhuma OS ativa para este cliente"}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    {nenhumMatchCliente && !verTodasOS && (
                      <p className="text-[11px] text-amber-600">
                        Este lote foi produzido para outra OS. Use "Ver todas as OSs do cliente" apenas se realmente precisar redirecionar.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Parceiro</Label>
                    <Select value={form.partner_id} onValueChange={(v) => setForm((f) => ({ ...f, partner_id: v, partner_order_id: "", partner_os_id: "" }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger>
                      <SelectContent>
                        {parceiros.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.razao_social || p.nome_fantasia}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Pedido B2B (OP)</Label>
                    <Select
                      value={form.partner_order_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, partner_order_id: v, partner_os_id: "" }))}
                      disabled={!form.partner_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={form.partner_id ? "Selecione o pedido" : "Selecione o parceiro primeiro"} />
                      </SelectTrigger>
                      <SelectContent>
                        {partnerOrders.map((o: any) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.numero} · {o.status}{o._matches ? " · ✓ casa com este lote" : ""}
                          </SelectItem>
                        ))}
                        {partnerOrders.length === 0 && form.partner_id && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum pedido ativo para este parceiro</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedOrder && (
                    <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2">
                      <div className="font-medium text-sm">Demanda do pedido {selectedOrder.numero}</div>
                      <div className="space-y-1">
                        {(selectedOrder.partner_order_items || []).map((it: any) => {
                          const matches =
                            (item?.produto_id && it.product_id === item.produto_id) ||
                            (item?.microrganismo_id && it.microrganismo_id === item.microrganismo_id);
                          return (
                            <div
                              key={it.id}
                              className={`flex justify-between gap-2 rounded px-2 py-1 ${matches ? "bg-primary/10 border border-primary/30" : ""}`}
                            >
                              <span className={matches ? "font-medium" : ""}>{it.produto_nome_snapshot || "Item"}</span>
                              <span className="text-muted-foreground">{Number(it.quantidade)} {it.unidade_medida}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {form.partner_order_id && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>OS B2B vinculada</Label>
                        {origemOsId && osB2B.length > 0 && (
                          <button
                            type="button"
                            className="text-[11px] text-primary hover:underline"
                            onClick={() => {
                              const next = !verTodasOS;
                              setVerTodasOS(next);
                              if (next) toast.warning("Exibindo OSs fora da origem do lote — pode gerar divergência de rastreabilidade.");
                            }}
                          >
                            {verTodasOS ? "Ver só desta origem" : "Ver todas as OSs do pedido"}
                          </button>
                        )}
                      </div>
                      <Select
                        value={form.partner_os_id}
                        onValueChange={(v) => setForm((f) => ({ ...f, partner_os_id: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={osB2BVis.length ? "Selecione a OS B2B" : "Nenhuma OS B2B encontrada"} />
                        </SelectTrigger>
                        <SelectContent>
                          {osB2BVis.map((o: any) => (
                            <SelectItem key={o.id} value={o.id}>
                              {formatOS(o)} · {o.status}{o._matchesLote ? " · ✓ origem" : o._matches ? " · ✓" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {osB2B.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          O pedido ainda não gerou OS B2B. Aprove/gere a OS antes de reservar.
                        </p>
                      )}
                      {nenhumMatchB2B && !verTodasOS && (
                        <p className="text-[11px] text-amber-600">
                          Este lote foi produzido para outra OS B2B deste pedido.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label className="flex justify-between items-center">
              <span>Quantidade a reservar</span>
              <span className={`text-xs ${saldoDisponivel <= 0 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                disponível: {saldoDisponivel}
              </span>
            </Label>
            <Input
              type="number"
              min={1}
              max={saldoDisponivel}
              value={form.quantidade_reservada}
              onChange={(e) => setForm((f) => ({ ...f, quantidade_reservada: e.target.value }))}
              className={Number(form.quantidade_reservada) > saldoDisponivel ? "border-destructive text-destructive" : ""}
            />
            {Number(form.quantidade_reservada) > saldoDisponivel && (
              <p className="text-[10px] text-destructive font-medium">Quantidade excede o saldo disponível atual.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={form.observacao}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              maxLength={500}
              placeholder="Detalhes da reserva..."
            />
          </div>

          {osSelecionadaDivergente && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-medium text-amber-700">OS divergente da origem do lote</div>
                <div className="text-amber-700/90">
                  O lote foi produzido para {origemLote?.numero ?? origemLote?.osId?.slice(0, 8)}. Confirme o override ao salvar.
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirmarReserva} disabled={!canSubmit}>
            {osSelecionadaDivergente ? "Reservar com override…" : "Confirmar reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmOverrideOpen} onOpenChange={setConfirmOverrideOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Confirmar override de rastreabilidade
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Este lote foi produzido para a OS <span className="font-semibold">{origemLote?.numero ?? origemLote?.osId?.slice(0, 8)}</span>
                  {origemLote?.titular ? ` (${origemLote.titular})` : ""}.
                </p>
                <p>
                  Você está reservando para uma OS diferente. Isso quebra a rastreabilidade automática lote → OS. O override será registrado em auditoria.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOverrideConfirmado(true);
                setConfirmOverrideOpen(false);
                // reexecuta submit já com override liberado
                setTimeout(() => handleConfirmarReserva(), 0);
              }}
            >
              Confirmar override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
