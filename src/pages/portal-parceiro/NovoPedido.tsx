import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePartnerCatalog, CatalogItem, CatalogItemTipo } from "@/hooks/usePartnerCatalog";
import { usePartnerCatalogTecnico, useRealtimePartnerCatalogTecnico } from "@/hooks/usePartnerCatalogTecnico";
import { useCreatePartnerOrder, CartItem } from "@/hooks/useCreatePartnerOrder";
import { useCreatePartnerSimulation } from "@/hooks/usePartnerSimulations";
import { useSaveOrderTemplate } from "@/hooks/useCommercial";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, ShoppingCart, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { CatalogoCardsGrid } from "@/components/catalogo/CatalogoCardsGrid";
import { AddToCartDialog } from "@/components/catalogo/AddToCartDialog";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";
import { brl as fmt } from "@/lib/financial/format";
import { PrecoComDesconto } from "@/components/comercial/PrecoComDesconto";
import { TotaisCarrinho } from "@/components/comercial/TotaisCarrinho";
import {
  minDeliveryDateISO,
  isDeliveryDateValid,
  MIN_DELIVERY_HINT,
  MIN_DELIVERY_ERROR,
} from "@/lib/b2bDeliveryDate";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCommercialPaymentPlans } from "@/hooks/useCommercialPaymentPlans";
import { useSimulateB2BPaymentPlan, type SimulateResult } from "@/hooks/useSimulateB2BPaymentPlan";
import { PaymentPlanSelector } from "@/components/comercial/PaymentPlanSelector";
import { PaymentSimulationSummary } from "@/components/comercial/PaymentSimulationSummary";

import {
  labelUnidadeCurta,
  resolverUnidadePreco,
  valorDaUnidade,
  SOB_CONSULTA_LABEL,
} from "@/lib/catalogo/unidades";
import { DOSES_POR_LITRO, resolverCustoHa } from "@/lib/catalogo/pricing";
import { round2 } from "@/lib/catalogo/formatUnidades";

const nfmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

const precoPrincipalFor = (
  p: CatalogItem,
): { valor: number; valorCheio: number; usedFallback: boolean; unidade: ReturnType<typeof resolverUnidadePreco> } => {
  const unidade = resolverUnidadePreco({
    tipo: p.item_tipo,
    unidadeBackend: p.unidade_preco_principal,
    valorHa: p.valor_ha_brl,
    valorLitro: p.valor_litro_brl,
    valorDose: p.valor_dose_brl,
  });
  const valor = valorDaUnidade(unidade, {
    valorHa: p.valor_ha_brl,
    valorLitro: p.valor_litro_brl,
    valorDose: p.valor_dose_brl,
  });
  const cheio = valorDaUnidade(unidade, {
    valorHa: p.preco_tabela_ha,
    valorLitro: p.preco_tabela_litro,
    valorDose: p.preco_tabela_dose,
  });
  if (valor != null && valor > 0) {
    return { valor, valorCheio: cheio ?? valor, usedFallback: false, unidade };
  }
  // Sem preço resolvido pelo motor canônico: NUNCA exibir/enviar 0 como preço válido.
  // `valor: 0` aqui é sentinela de "sem preço" (bloqueia checkout) e a unidade vira sob_consulta.
  const fallback = p.preco_parceiro ?? 0;
  return {
    valor: fallback,
    valorCheio: (p.preco_tabela ?? 0) || fallback,
    usedFallback: fallback > 0,
    unidade: fallback > 0 ? unidade : "sob_consulta",
  };
};

/** Calcula dose referencial em L/ha quando possível, derivando de valor_ha / valor_litro. */
const doseLitroHaFor = (p: CatalogItem | undefined): number | null => {
  if (!p) return null;
  if (
    p.item_tipo === "produto" &&
    p.valor_ha_brl != null && p.valor_ha_brl > 0 &&
    p.valor_litro_brl != null && p.valor_litro_brl > 0
  ) {
    return p.valor_ha_brl / p.valor_litro_brl;
  }
  // Microrganismo: padrão comercial Cultivo Farm = 1 dose de 100 mL por ha (1 L = 10 doses)
  if (p.item_tipo === "microrganismo" && (p.valor_dose_brl ?? 0) > 0) {
    return 1 / DOSES_POR_LITRO;
  }
  return null;
};

export default function NovoPedido() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { role } = useAuth();
  const location = useLocation();
  const isRoleTecnico = role === "parceiro_b2b_tecnico";
  const isSimuladorRoute = location.pathname.includes("/portal-parceiro/simulador");
  const isCatalogoRoute = location.pathname.includes("/portal-parceiro/catalogo");
  // Modo simulação: técnico B2B (sempre) ou qualquer usuário na rota /simulador.
  // Nesse modo usamos valores de tabela sem desconto e criamos partner_simulations,
  // nunca pedidos oficiais.
  const isSimulationMode = isRoleTecnico || isSimuladorRoute;
  const catalogGestor = usePartnerCatalog(isSimulationMode ? null : partner?.id);
  const catalogTecnico = usePartnerCatalogTecnico();
  useRealtimePartnerCatalogTecnico();
  const catalog: CatalogItem[] = isSimulationMode
    ? (catalogTecnico.data ?? [])
    : (catalogGestor.data ?? []);
  const createOrder = useCreatePartnerOrder();
  const createSimulation = useCreatePartnerSimulation();
  const navigate = useNavigate();

  const catalogMap = useMemo(() => {
    const m = new Map<string, CatalogItem>();
    catalog.forEach((c) => m.set(c.item_id, c));
    return m;
  }, [catalog]);

  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [obs, setObs] = useState("");
  
  const [requestedDate, setRequestedDate] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addRow, setAddRow] = useState<CatalogoUnificadoRow | null>(null);
  // Favoritos / modelos de pedido
  const saveTemplate = useSaveOrderTemplate();
  const [favOpen, setFavOpen] = useState(false);
  const [favNome, setFavNome] = useState("");
  const [favDescricao, setFavDescricao] = useState("");
  const [favMarcarFavorito, setFavMarcarFavorito] = useState(true);
  const [templateHydrated, setTemplateHydrated] = useState(false);
  // Simulação técnica — metadados agronômicos
  const [simTitulo, setSimTitulo] = useState("");
  const [simCultura, setSimCultura] = useState("");
  const [simArea, setSimArea] = useState<string>("");
  const [simObjetivo, setSimObjetivo] = useState("");
  const [simValidUntil, setSimValidUntil] = useState<string>("");
  const [simClienteId, setSimClienteId] = useState<string>("");

  // Fase 5 — condição comercial
  const { data: paymentPlans = [], isLoading: paymentPlansLoading } =
    useCommercialPaymentPlans(!isSimulationMode);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<SimulateResult | null>(null);
  const [cashSimulation, setCashSimulation] = useState<SimulateResult | null>(null);
  const simulateSelectedPlan = useSimulateB2BPaymentPlan();
  const simulateCashReference = useSimulateB2BPaymentPlan();
  /** Chave de idempotência do checkout corrente (server-side dedupe). */
  const checkoutKeyRef = useRef<string | null>(null);


  // Lista de produtores vinculados ao usuário B2B (técnico ou gestor)
  const { data: meusProdutores = [] } = useQuery({
    queryKey: ["b2b-user-clientes-simulador"],
    enabled: isSimulationMode,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_b2b_user_clients_secure", {
        p_user_id: null,
        p_search: null,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        cliente_id: string;
        nome: string | null;
        razao_social: string | null;
        nome_fantasia: string | null;
        cidade: string | null;
        estado: string | null;
      }>;
    },
  });

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const cid = searchParams.get("clienteId");
    if (!cid || !isSimulationMode) return;
    // Só selecionar se o cliente estiver na lista de vínculos do usuário
    if (meusProdutores.some((c) => c.cliente_id === cid)) {
      setSimClienteId(cid);
    }
  }, [searchParams, isSimulationMode, meusProdutores]);

  const cartKey = (itemId: string, volumeId: string | null | undefined) =>
    `${itemId}::${volumeId ?? "default"}`;

  // Hidrata carrinho a partir de um modelo/favorito salvo em sessionStorage
  useEffect(() => {
    if (templateHydrated || isSimulationMode) return;
    if (catalog.length === 0) return; // aguarda catálogo
    const raw = sessionStorage.getItem("partner-order-template");
    if (!raw) { setTemplateHydrated(true); return; }
    try {
      const tpl = JSON.parse(raw);
      const itens: any[] = Array.isArray(tpl?.itens) ? tpl.itens : [];
      let missing = 0;
      const next: Record<string, CartItem> = {};
      for (const it of itens) {
        const p = catalogMap.get(it.item_id);
        if (!p) { missing++; continue; }
        const volumeMl = Number(it.volume_ml ?? 0);
        const litros = volumeMl > 0 ? volumeMl / 1000 : 0;
        const valorLitro = Number(p.valor_litro_brl ?? 0);
        const valorLitroCheio = Number(p.preco_tabela_litro ?? valorLitro);
        const preco = litros > 0 && valorLitro > 0 ? round2(litros * valorLitro) : 0;
        const precoCheio = litros > 0 && valorLitroCheio > 0 ? round2(litros * valorLitroCheio) : preco;
        const qtd = Math.max(1, Number(it.quantidade ?? 1));
        const key = cartKey(it.item_id, it.volume_id ?? null);
        next[key] = {
          item_id: it.item_id,
          item_tipo: p.item_tipo,
          product_id: p.product_id,
          nome: it.nome ?? p.nome,
          quantidade: qtd,
          preco_unitario: preco,
          desconto_percentual: Number(p.desconto_percentual ?? 0),
          subtotal: round2(preco * qtd),
          preco_unitario_cheio: precoCheio,
          subtotal_cheio: round2(precoCheio * qtd),
          unidade_pedido: (it.unidade_pedido ?? "volume_comercial"),
          volume_id: it.volume_id ?? null,
          volume_ml: volumeMl || null,
          volume_rotulo: it.volume_rotulo ?? (volumeMl ? `${volumeMl} mL` : null),
          area_ha: it.area_ha ?? null,
        };
      }
      if (Object.keys(next).length > 0) {
        setCart((prev) => ({ ...prev, ...next }));
        toast.success(`Favorito "${tpl.nome ?? ""}" carregado no carrinho`);
      }
      if (missing > 0) {
        toast.warning(`${missing} item(ns) do favorito não estão mais disponíveis e foram ignorados.`);
      }
    } catch (e) {
      // ignora payload inválido
    } finally {
      sessionStorage.removeItem("partner-order-template");
      setTemplateHydrated(true);
    }
  }, [catalog, catalogMap, isSimulationMode, templateHydrated]);


  const removeItem = (key: string) => {
    setCart((c) => {
      const { [key]: _, ...rest } = c;
      return rest;
    });
  };

  const updateQty = (key: string, qty: number) => {
    setCart((c) => {
      const item = c[key];
      if (!item) return c;
      const valid = Number.isFinite(qty) && qty > 0;
      const safeQty = valid ? qty : 0;
      return {
        ...c,
        [key]: {
          ...item,
          quantidade: safeQty,
          subtotal: round2(safeQty * item.preco_unitario),
          subtotal_cheio: round2(safeQty * (item.preco_unitario_cheio ?? item.preco_unitario)),
        },
      };
    });
  };


  const cartList = Object.entries(cart).map(([key, item]) => ({ key, ...item }));
  const total = cartList.reduce((s, i) => s + i.subtotal, 0);
  const totalCheio = cartList.reduce((s, i) => s + (i.subtotal_cheio ?? i.subtotal), 0);
  const cartInvalid = cartList.some((i) => i.quantidade <= 0 || i.preco_unitario <= 0);

  // Payload de itens para a RPC de simulação (mesmo shape do create)
  const simulationItems = useMemo(
    () =>
      cartList.map((i) => ({
        item_id: i.item_id,
        item_tipo: i.item_tipo,
        quantidade: Number(i.quantidade),
        unidade_medida: (i.unidade_pedido === "hectare"
          ? "hectare"
          : i.unidade_pedido === "dose_100ml"
          ? "dose"
          : i.unidade_pedido === "litro"
          ? "litro"
          : "unidade") as "hectare" | "litro" | "dose" | "unidade",
        volume_ml: i.unidade_pedido === "volume_comercial" ? i.volume_ml ?? null : null,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(cartList.map((i) => [i.item_id, i.quantidade, i.unidade_pedido, i.volume_ml]))],
  );

  const cashPlan = useMemo(() => paymentPlans.find((p) => p.plan_type === "cash") ?? null, [paymentPlans]);
  const selectedPlan = useMemo(
    () => paymentPlans.find((p) => p.id === selectedPlanId) ?? null,
    [paymentPlans, selectedPlanId],
  );

  // Dispara simulação sempre que plano/itens mudam
  useEffect(() => {
    if (isSimulationMode || !confirmOpen) return;
    if (!partner?.id || !selectedPlanId || simulationItems.length === 0 || cartInvalid) {
      setSimulation(null);
      return;
    }
    simulateSelectedPlan.mutate(
      { partner_id: partner.id, payment_plan_id: selectedPlanId, items: simulationItems },
      { onSuccess: (res) => setSimulation(res), onError: () => setSimulation(null) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId, simulationItems, partner?.id, confirmOpen, isSimulationMode, cartInvalid]);

  // Referência à vista (para diferença) — recalcula sempre que carrinho/parceiro/plano mudam
  useEffect(() => {
    if (isSimulationMode || !confirmOpen || !cashPlan || !partner?.id || simulationItems.length === 0 || cartInvalid) {
      setCashSimulation(null);
      return;
    }
    const t = setTimeout(() => {
      simulateCashReference.mutate(
        { partner_id: partner.id, payment_plan_id: cashPlan.id, items: simulationItems },
        { onSuccess: (res) => setCashSimulation(res), onError: () => setCashSimulation(null) },
      );
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashPlan?.id, simulationItems, partner?.id, confirmOpen, isSimulationMode, cartInvalid]);

  // Limpa simulações quando o modal fecha ou o carrinho esvazia
  useEffect(() => {
    if (!confirmOpen || simulationItems.length === 0) {
      setSimulation(null);
      setCashSimulation(null);
    }
  }, [confirmOpen, simulationItems.length]);


  const handleSubmit = (opts?: { simStatus?: "rascunho" | "enviada_gestor" }) => {
    if (!partner?.id || cartList.length === 0 || cartInvalid) return;
    if (isSimulationMode) {
      const areaNum = simArea.trim() === "" ? null : Number(simArea);
      const clienteSel = meusProdutores.find((c) => c.cliente_id === simClienteId) ?? null;
      createSimulation.mutate(
        {
          partner_id: partner.id,
          titulo: simTitulo || undefined,
          observacoes: obs || undefined,
          cultura: simCultura || null,
          area_total_ha: areaNum != null && Number.isFinite(areaNum) ? areaNum : null,
          objetivo_tecnico: simObjetivo || null,
          valid_until: simValidUntil || null,
          status: opts?.simStatus ?? "rascunho",
          cliente_id: simClienteId || null,
          cliente_nome_snapshot: clienteSel
            ? (clienteSel.nome_fantasia || clienteSel.razao_social || clienteSel.nome || null)
            : null,
          cliente_cidade_snapshot: clienteSel?.cidade ?? null,
          cliente_uf_snapshot: clienteSel?.estado ?? null,
          items: cartList.map((i) => {
            const catItem = catalogMap.get(i.item_id);
            const unidadeMedida =
              i.unidade_pedido === "hectare" ? "hectare" :
              i.unidade_pedido === "dose_100ml" ? "dose" :
              i.unidade_pedido === "litro" ? "litro" :
              "unidade";
            return {
              item_tipo: i.item_tipo,
              item_id: i.item_id,
              nome: i.nome,
              quantidade: i.quantidade,
              valor_unitario_cheio: i.preco_unitario_cheio ?? i.preco_unitario,
              subtotal: i.subtotal_cheio ?? i.subtotal,
              // Snapshots comerciais para o detalhe formal
              product_id: i.item_tipo === "produto" ? (i.product_id ?? i.item_id) : null,
              microrganismo_id: i.item_tipo === "microrganismo" ? i.item_id : null,
              unidade_medida: unidadeMedida,
              volume_ml: i.volume_ml ?? null,
              volume_id: i.volume_id ?? null,
              volume_rotulo: i.volume_rotulo ?? null,
              produto_codigo_snapshot: (catItem as any)?.codigo ?? null,
              produto_nome_snapshot: i.nome,
              preco_tabela_snapshot: i.preco_unitario_cheio ?? i.preco_unitario,
              preco_unitario: i.preco_unitario,
              desconto_percentual: i.desconto_percentual ?? 0,
              area_ha: i.area_ha ?? null,
            };
          }),
        },
        {
          onSuccess: () => {
            setCart({});
            setObs("");
            setRequestedDate("");
            setSimTitulo("");
            setSimCultura("");
            setSimArea("");
            setSimObjetivo("");
            setSimValidUntil("");
            setSimClienteId("");
            setConfirmOpen(false);
            navigate("/portal-parceiro/simulacoes");
          },
        },
      );
      return;
    }
    if (!selectedPlanId) {
      toast.error("Selecione uma condição de pagamento antes de finalizar o pedido.");
      return;
    }
    if (!simulation?.cart_hash) {
      toast.error("Aguarde a validação de preços pelo servidor antes de enviar o pedido.");
      return;
    }
    // Chave de idempotência do checkout: mantida entre reenvios/cliques repetidos
    // e descartada apenas quando o pedido é efetivamente criado.
    if (!checkoutKeyRef.current) {
      checkoutKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    createOrder.mutate(
      {
        partner_id: partner.id,
        observacoes: obs || undefined,
        requested_delivery_date: requestedDate || null,
        items: cartList.map(({ key, ...rest }) => rest),
        payment_plan_id: selectedPlanId,
        first_due_date: simulation?.schedule?.[0]?.due_date ?? null,
        installment_count: selectedPlan?.installment_count ?? null,
        expected_cart_hash: simulation.cart_hash,
        idempotency_key: checkoutKeyRef.current,
      },
      {
        onSuccess: () => {
          checkoutKeyRef.current = null;
          setCart({});
          setObs("");
          setRequestedDate("");
          setSelectedPlanId(null);
          setSimulation(null);
          setCashSimulation(null);
          setConfirmOpen(false);
          navigate("/portal-parceiro/pedidos");
        },
      },
    );

  };

  const renderTipoBadge = (tipo: CatalogItemTipo) =>
    tipo === "microrganismo" ? (
      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Microrganismo</Badge>
    ) : (
      <Badge variant="outline" className="text-[10px] h-4 px-1.5">Produto</Badge>
    );

  const pricingSlot = (row: CatalogoUnificadoRow) => {
    const p = catalogMap.get(row.id);
    if (!p) {
      return <div className="text-[11px] text-muted-foreground italic">Sem preço configurado para este parceiro.</div>;
    }
    const { valor, valorCheio, unidade } = precoPrincipalFor(p);
    const unitLabel = labelUnidadeCurta(unidade);
    if (valor <= 0 || unidade === "sob_consulta") {
      return <div className="text-[11px] text-muted-foreground italic">{SOB_CONSULTA_LABEL}</div>;
    }
    const custoHa = resolverCustoHa({
      tipo: p.item_tipo,
      doseMlHa: null,
      valorHa: p.valor_ha_brl,
      valorDose: p.valor_dose_brl,
      valorLitro: p.valor_litro_brl,
    });
    return (
      <div className="text-xs space-y-0.5">
        <PrecoComDesconto
          valorCheio={isSimulationMode ? undefined : valorCheio}
          valorFinal={isSimulationMode ? (valorCheio > 0 ? valorCheio : valor) : valor}
          descontoPct={isSimulationMode ? 0 : p.desconto_percentual}
          unidadeLabel={unitLabel}
          size="sm"
          mostrarChip={!isSimulationMode}
        />
        {p.item_tipo === "produto" && (p.preco_tabela_dose > 0 || p.valor_dose_brl > 0) && (
          <div className="text-muted-foreground">
            Dose 100 mL: {fmt(isSimulationMode ? p.preco_tabela_dose : p.valor_dose_brl)} · Litro: {fmt(isSimulationMode ? p.preco_tabela_litro : p.valor_litro_brl)}
          </div>
        )}
        {p.item_tipo === "microrganismo" && (p.preco_tabela_litro > 0 || p.valor_litro_brl > 0) && (
          <div className="text-muted-foreground">
            Litro: {fmt(isSimulationMode ? p.preco_tabela_litro : p.valor_litro_brl)} · 1 L = {DOSES_POR_LITRO} doses
          </div>
        )}
        {unidade !== "hectare" && custoHa != null && custoHa > 0 && (
          <div className="text-muted-foreground">
            Custo estimado {fmt(custoHa)}/ha (dose referencial)
          </div>
        )}
      </div>
    );
  };

  const actionSlot = (row: CatalogoUnificadoRow) => {
    const p = catalogMap.get(row.id);
    return (
      <Button size="sm" onClick={() => setAddRow(row)} disabled={!p}>
        <Plus className="h-4 w-4 mr-1" /> Adicionar
      </Button>
    );
  };

  const addRowCatalogItem = addRow ? catalogMap.get(addRow.id) : null;
  const doseRefHa = doseLitroHaFor(addRowCatalogItem ?? undefined);

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-32 md:pb-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">
          {isCatalogoRoute ? "Catálogo" : isSimulationMode ? "Simulador B2B" : "Novo Pedido"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isCatalogoRoute
            ? "Consulte produtos e microrganismos, monte uma simulação ou efetive um pedido."
            : isSimulationMode
            ? "Esta simulação utiliza valores de tabela, sem desconto. Condições comerciais finais são aplicadas apenas em pedido oficial."
            : "Selecione produtos e/ou microrganismos. Condição comercial B2B aplicada."}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Escolha o volume comercial desejado, informe a área (ha) se aplicável e confirme a quantidade.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Catálogo</CardTitle>
          </CardHeader>
          <CardContent>
            <CatalogoCardsGrid
              scope="b2b"
              showStatusFilter={false}
              showB2BFilter={false}
              showInternalBadges={false}
              hideApprovedBadge
              pricingSlot={pricingSlot}
              actionSlot={actionSlot}
            />
          </CardContent>
        </Card>

        {/* Cart desktop */}
        <Card className="hidden lg:block">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Carrinho ({cartList.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cartList.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Carrinho vazio</div>
            ) : (
              <div className="space-y-2">
                {cartList.map((i) => {
                  const semPreco = i.preco_unitario <= 0;
                  const totalLitros = i.volume_ml ? (i.quantidade * i.volume_ml) / 1000 : null;
                  return (
                    <div key={i.key} className={`border rounded-md p-2 space-y-1 ${semPreco ? "border-destructive/60 bg-destructive/5" : ""}`}>
                      <div className="flex justify-between gap-2">
                        <div className="text-sm font-medium truncate flex items-center gap-2">
                          {i.nome}
                          {renderTipoBadge(i.item_tipo)}
                        </div>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeItem(i.key)} aria-label={`Remover ${i.nome}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          type="number"
                          min={1}
                          step="1"
                          value={i.quantidade > 0 ? i.quantidade : ""}
                          aria-invalid={i.quantidade <= 0}
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateQty(i.key, raw === "" ? NaN : Number(raw));
                          }}
                          className={`h-8 w-20 ${i.quantidade <= 0 ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        />
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          × {i.volume_rotulo ?? "un"} ·
                          <PrecoComDesconto
                            valorCheio={i.preco_unitario_cheio}
                            valorFinal={i.preco_unitario}
                            descontoPct={i.desconto_percentual}
                            unidadeLabel="/un"
                            size="sm"
                            mostrarChip={false}
                          />
                        </div>
                        <PrecoComDesconto
                          className="ml-auto"
                          valorCheio={i.subtotal_cheio}
                          valorFinal={i.subtotal}
                          descontoPct={i.desconto_percentual}
                          size="sm"
                          align="end"
                          mostrarChip={false}
                        />
                      </div>
                      {i.quantidade <= 0 && (
                        <p className="text-[11px] text-destructive">
                          Informe uma quantidade maior que zero.
                        </p>
                      )}
                      {totalLitros !== null && i.quantidade > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Total: {nfmt.format(totalLitros)} L
                          {i.area_ha ? ` · Área-alvo: ${nfmt.format(i.area_ha)} ha` : ""}
                        </div>
                      )}
                      {semPreco && (
                        <p className="text-[11px] text-destructive">
                          Item sem preço configurado. Remova do carrinho ou solicite preço à Cultivo Farm.
                        </p>
                      )}

                    </div>
                  );
                })}
              </div>
            )}

            {!isSimulationMode && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Data desejada de entrega</label>
                <Input
                  type="date"
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  min={minDeliveryDateISO()}
                />
                <p className="text-[10px] text-muted-foreground italic">
                  {MIN_DELIVERY_HINT}
                </p>
                {requestedDate && !isDeliveryDateValid(requestedDate) && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription className="text-xs">{MIN_DELIVERY_ERROR}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}


            <Textarea
              placeholder={isSimulationMode ? "Observações da simulação (opcional)" : "Observações internas do pedido (opcional)"}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={isSimulationMode ? 3 : 2}
            />

            <TotaisCarrinho
              subtotalCheio={totalCheio}
              totalFinal={isSimulationMode ? totalCheio : total}
              labelTotal={isSimulationMode ? "Total estimado" : "Subtotal do carrinho"}
            />

            <Button
              className="w-full"
              disabled={
                cartList.length === 0 ||
                cartInvalid ||
                (!isSimulationMode && !isDeliveryDateValid(requestedDate))
              }
              onClick={() => setConfirmOpen(true)}
            >
              {isSimulationMode ? "Revisar e Salvar Simulação" : "Continuar para condição de pagamento"}
            </Button>

            {!isSimulationMode && (
              <Button
                variant="outline"
                className="w-full"
                disabled={cartList.length === 0}
                onClick={() => { setFavNome(""); setFavDescricao(""); setFavMarcarFavorito(true); setFavOpen(true); }}
              >
                <Star className="h-4 w-4 mr-1" /> Salvar como favorito
              </Button>
            )}

          </CardContent>
        </Card>
      </div>

      {/* Sticky resumo mobile */}
      {cartList.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t bg-background p-3 z-20 space-y-2 shadow-lg">
          <div className="flex justify-between text-sm items-end gap-2">
            <span className="text-muted-foreground">{cartList.length} item(s)</span>
            <PrecoComDesconto
              valorCheio={isSimulationMode ? undefined : totalCheio}
              valorFinal={isSimulationMode ? totalCheio : total}
              descontoPct={isSimulationMode ? 0 : undefined}
              size="md"
              align="end"
              mostrarChip={!isSimulationMode}
            />
          </div>
          <div className="flex gap-2">
            {!isSimulationMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFavNome(""); setFavDescricao(""); setFavMarcarFavorito(true); setFavOpen(true); }}
                aria-label="Salvar como favorito"
              >
                <Star className="h-4 w-4" />
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={() => setConfirmOpen(true)}
              disabled={cartInvalid || (!isSimulationMode && !isDeliveryDateValid(requestedDate))}
            >
              {isSimulationMode ? "Revisar e Salvar Simulação" : "Continuar para condição de pagamento"}
            </Button>
          </div>
        </div>
      )}

      {/* Add to cart dialog */}
      <AddToCartDialog
        open={!!addRow}
        onOpenChange={(v) => !v && setAddRow(null)}
        row={addRow}
        doseRecomendadaLitroHa={doseRefHa}
        valorLitroBase={
          addRowCatalogItem
            ? (addRowCatalogItem.item_tipo === "produto"
                ? (addRowCatalogItem.valor_litro_brl > 0 ? addRowCatalogItem.valor_litro_brl : null)
                : (addRowCatalogItem.valor_litro_brl > 0 ? addRowCatalogItem.valor_litro_brl : null))
            : null
        }
        valorLitroCheio={
          addRowCatalogItem
            ? (addRowCatalogItem.preco_tabela_litro > 0 ? addRowCatalogItem.preco_tabela_litro : null)
            : null
        }
        descontoPct={addRowCatalogItem?.desconto_percentual ?? 0}
        onConfirm={(payloads) => {
          if (!addRow || !addRowCatalogItem || payloads.length === 0) return;
          setCart((c) => {
            const next = { ...c };
            for (const payload of payloads) {
              const key = cartKey(addRow.id, payload.volume.id);
              const existing = next[key];
              const quantidade = (existing?.quantidade ?? 0) + payload.quantidade;
              const subtotal = round2(payload.preco_unitario * quantidade);
              const subtotalCheio = round2(payload.preco_unitario_cheio * quantidade);
              next[key] = {
                item_id: addRow.id,
                item_tipo: addRowCatalogItem.item_tipo,
                product_id: addRowCatalogItem.product_id,
                nome: addRow.nome,
                quantidade,
                preco_unitario: payload.preco_unitario,
                desconto_percentual: payload.desconto_percentual,
                subtotal,
                preco_unitario_cheio: payload.preco_unitario_cheio,
                subtotal_cheio: subtotalCheio,
                unidade_pedido: "volume_comercial",
                volume_id: payload.volume.id,
                volume_ml: payload.volume.volume_ml,
                volume_rotulo: payload.volume.rotulo ?? `${payload.volume.volume_ml} mL`,
                area_ha: payload.area_ha,
              };
            }
            return next;
          });
          toast.success(payloads.length > 1 ? `${payloads.length} vasilhames adicionados ao carrinho` : "Item adicionado ao carrinho");
        }}
      />

      {/* Confirmation modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isSimulationMode ? "Revisar Simulação" : "Resumo do Pedido B2B"}</DialogTitle>
            <DialogDescription>
              {isSimulationMode ? "Confira os dados antes de salvar a simulação." : "Confira os dados antes de enviar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Parceiro</div>
              <div className="font-medium">{partner?.razao_social}</div>
            </div>
            <div className="border rounded-md divide-y">
              {cartList.map((i) => (
                <div key={i.key} className="p-2 flex justify-between gap-2 items-start">
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-medium truncate flex items-center gap-2">
                      {i.nome}
                      {renderTipoBadge(i.item_tipo)}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                      {i.quantidade} × {i.volume_rotulo ?? "un"} ·
                      <PrecoComDesconto
                        valorCheio={isSimulationMode ? undefined : i.preco_unitario_cheio}
                        valorFinal={isSimulationMode ? (i.preco_unitario_cheio ?? i.preco_unitario) : i.preco_unitario}
                        descontoPct={isSimulationMode ? 0 : i.desconto_percentual}
                        unidadeLabel="/un"
                        size="sm"
                        mostrarChip={false}
                      />
                      {i.area_ha ? <span>· {nfmt.format(i.area_ha)} ha</span> : null}
                    </div>
                  </div>
                  <PrecoComDesconto
                    className="whitespace-nowrap"
                    valorCheio={isSimulationMode ? undefined : i.subtotal_cheio}
                    valorFinal={isSimulationMode ? (i.subtotal_cheio ?? i.subtotal) : i.subtotal}
                    descontoPct={isSimulationMode ? 0 : i.desconto_percentual}
                    size="sm"
                    align="end"
                    mostrarChip={false}
                  />
                </div>
              ))}
            </div>
            {obs && (
              <div>
                <div className="text-xs text-muted-foreground">Observações</div>
                <div className="whitespace-pre-wrap">{obs}</div>
              </div>
            )}
            {isSimulationMode && (
              <TotaisCarrinho subtotalCheio={totalCheio} totalFinal={totalCheio} labelTotal="Total estimado" />
            )}
            {isSimulationMode && (
              <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Dados agronômicos</div>
                <div>
                  <label className="text-xs text-muted-foreground">Produtor/Cliente vinculado</label>
                  <select
                    className="w-full border rounded-md px-2 py-1 text-sm bg-background"
                    value={simClienteId}
                    onChange={(e) => setSimClienteId(e.target.value)}
                  >
                    <option value="">— Simulação avulsa (sem produtor) —</option>
                    {meusProdutores.map((c) => (
                      <option key={c.cliente_id} value={c.cliente_id}>
                        {(c.nome_fantasia || c.razao_social || c.nome || "—") +
                          (c.cidade ? ` · ${c.cidade}${c.estado ? "/" + c.estado : ""}` : "")}
                      </option>
                    ))}
                  </select>
                  {meusProdutores.length === 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Nenhum produtor vinculado. Você pode salvar como simulação avulsa.
                    </p>
                  )}
                </div>
                <input
                  className="w-full border rounded-md px-2 py-1 text-sm bg-background"
                  placeholder="Título da simulação"
                  value={simTitulo}
                  onChange={(e) => setSimTitulo(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="border rounded-md px-2 py-1 text-sm bg-background"
                    placeholder="Cultura"
                    value={simCultura}
                    onChange={(e) => setSimCultura(e.target.value)}
                  />
                  <input
                    className="border rounded-md px-2 py-1 text-sm bg-background"
                    placeholder="Área total (ha)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={simArea}
                    onChange={(e) => setSimArea(e.target.value)}
                  />
                </div>
                <textarea
                  className="w-full border rounded-md px-2 py-1 text-sm bg-background"
                  placeholder="Objetivo técnico"
                  rows={2}
                  value={simObjetivo}
                  onChange={(e) => setSimObjetivo(e.target.value)}
                />
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Validade do orçamento
                  </label>
                  <input
                    className="w-full border rounded-md px-2 py-1 text-sm bg-background"
                    type="date"
                    value={simValidUntil}
                    onChange={(e) => setSimValidUntil(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Se em branco, expira em 30 dias a partir da emissão.
                  </p>
                </div>
              </div>
            )}
            {!isSimulationMode && (
              <div className="space-y-2 border rounded-md p-3 bg-background">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Condição de pagamento
                </div>
                <PaymentPlanSelector
                  plans={paymentPlans}
                  plansLoading={paymentPlansLoading}
                  selectedPlanId={selectedPlanId}
                  onSelect={setSelectedPlanId}
                  finalAmountByPlan={
                    simulation ? { [simulation.payment_plan.id]: simulation.amounts.final_amount } : {}
                  }
                  loading={simulateSelectedPlan.isPending}
                />

                {simulation && (
                  <PaymentSimulationSummary
                    simulation={simulation}
                    cashReferenceAmount={cashSimulation?.amounts.final_amount ?? null}
                  />
                )}
                {!selectedPlanId && (
                  <p className="text-xs text-muted-foreground">
                    Selecione uma condição para continuar.
                  </p>
                )}
              </div>
            )}

            {/* Total único e autoritativo: em modo pedido vem do motor comercial (RPC). */}
            {!isSimulationMode &&
              (simulation?.quote_required ? (
                <Alert className="py-2">
                  <AlertDescription className="text-xs">
                    Itens sob consulta — o valor final será definido pela equipe comercial após a cotação.
                  </AlertDescription>
                </Alert>
              ) : (
                <TotaisCarrinho
                  subtotalCheio={simulation?.amounts.table_amount ?? totalCheio}
                  totalFinal={simulation?.amounts.final_amount ?? total}
                  jurosValor={simulation?.amounts.financial_interest_amount}
                  labelTotal={simulation ? "Total a pagar" : "Subtotal do carrinho"}
                  condicaoLabel={simulation?.payment_plan.name}
                />
              ))}
            {isSimulationMode ? (
              <div className="rounded-md border border-dashed p-2 text-xs bg-muted/40">
                <strong>Simulação</strong> — não gera pedido. O envio efetivo é feito pelo gestor B2B do parceiro.
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Condição comercial B2B aplicada conforme plano selecionado.</p>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={createOrder.isPending || createSimulation.isPending}
            >
              Cancelar
            </Button>
            {isSimulationMode ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => handleSubmit({ simStatus: "rascunho" })}
                  disabled={createSimulation.isPending}
                >
                  {createSimulation.isPending ? "Salvando..." : "Salvar simulação técnica"}
                </Button>
                <Button
                  onClick={() => handleSubmit({ simStatus: "enviada_gestor" })}
                  disabled={createSimulation.isPending}
                >
                  Enviar ao gestor
                </Button>
              </>
            ) : (
              <Button
                onClick={() => handleSubmit()}
                disabled={createOrder.isPending || !selectedPlanId || simulateSelectedPlan.isPending || !simulation}
              >
                {createOrder.isPending
                  ? "Enviando..."
                  : simulation?.quote_required
                  ? "Enviar solicitação de cotação"
                  : "Enviar pedido para análise"}
              </Button>

            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salvar como favorito */}
      <Dialog open={favOpen} onOpenChange={setFavOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar como favorito</DialogTitle>
            <DialogDescription>
              O modelo guarda os itens (produto, volume, quantidade e área). Os preços serão recalculados sempre que você reutilizá-lo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="fav-nome" className="text-xs">Nome do modelo</Label>
              <Input id="fav-nome" value={favNome} onChange={(e) => setFavNome(e.target.value)} placeholder="Ex.: Pacote soja 2ª safra" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fav-desc" className="text-xs">Descrição (opcional)</Label>
              <Textarea id="fav-desc" value={favDescricao} onChange={(e) => setFavDescricao(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fav-star" checked={favMarcarFavorito} onCheckedChange={setFavMarcarFavorito} />
              <Label htmlFor="fav-star" className="text-xs">Marcar como favorito (aparece primeiro)</Label>
            </div>
            <div className="text-xs text-muted-foreground">
              {cartList.length} item(ns) serão salvos.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFavOpen(false)}>Cancelar</Button>
            <Button
              disabled={!favNome.trim() || cartList.length === 0 || saveTemplate.isPending || !partner?.id}
              onClick={() => {
                if (!partner?.id) return;
                const itens = cartList.map((i) => ({
                  item_id: i.item_id,
                  item_tipo: i.item_tipo,
                  nome: i.nome,
                  quantidade: i.quantidade,
                  unidade_pedido: i.unidade_pedido,
                  volume_id: i.volume_id ?? null,
                  volume_ml: i.volume_ml ?? null,
                  volume_rotulo: i.volume_rotulo ?? null,
                  area_ha: i.area_ha ?? null,
                }));
                saveTemplate.mutate(
                  {
                    partner_id: partner.id,
                    nome: favNome.trim(),
                    descricao: favDescricao.trim() || undefined,
                    itens,
                    favorito: favMarcarFavorito,
                  },
                  { onSuccess: () => setFavOpen(false) },
                );
              }}
            >
              {saveTemplate.isPending ? "Salvando..." : "Salvar favorito"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

