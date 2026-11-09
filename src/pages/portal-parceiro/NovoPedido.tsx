import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { partnerCatalogRows } from "@/lib/catalogo/partnerCatalogRows";
import { CatalogoCardsGrid } from "@/components/catalogo/CatalogoCardsGrid";
import { AddToCartDialog } from "@/components/catalogo/AddToCartDialog";
import { AddPackagingToCartDialog } from "@/components/catalogo/AddPackagingToCartDialog";
import { usePartnerPackagingOffers } from "@/hooks/usePartnerPackagingOffers";
import { isWholePackagingQty, orderLineFor, packagingLabel, type PackagingOffer } from "@/lib/comercial/packagingOrder";
import { loadPartnerOrderDraft, savePartnerOrderDraft, type PartnerOrderDraftScope } from "@/lib/authz/partnerOrderDraftStore";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";
import { brl as fmt } from "@/lib/financial/format";
import { formatDateDisplay } from "@/lib/date-utils";
import { PrecoComDesconto } from "@/components/comercial/PrecoComDesconto";
import { TotaisCarrinho } from "@/components/comercial/TotaisCarrinho";
import {
  minDeliveryDateISO,
  isDeliveryDateValid,
  minDeliveryHint,
  MIN_DELIVERY_ERROR,
} from "@/lib/b2bDeliveryDate";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCommercialPaymentPlans } from "@/hooks/useCommercialPaymentPlans";
import { useSimulateB2BPaymentPlan, type SimulateResult } from "@/hooks/useSimulateB2BPaymentPlan";
import { useFencedB2BSimulation, type MethodSimulateResult } from "@/hooks/useFencedB2BSimulation";
import { useB2BPaymentMethodOptions, METHOD_KIND_LABEL, sameChoice, type PaymentMethodChoice } from "@/hooks/useB2BPaymentMethodOptions";
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
import { useCatalogoVolumes } from "@/hooks/useCatalogoVolumes";
import { usePartnerCatalogVolumes } from "@/hooks/usePartnerCatalogVolumes";
import { supplierLabel } from "@/lib/comercial/supplierName";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useCloseOrderAttempt } from "@/hooks/useCloseOrderAttempt";
import { useOrderJournal } from '@/hooks/useOrderJournal';
import { closeAttemptFeedback } from "@/lib/authz/closeAttemptFeedback";
import { markOrderAttemptSending, orderAttemptFingerprint, prepareOrderAttempt, readOrderAttempt, settleOrderAttempt, subscribeOrderAttempts } from "@/lib/authz/pendingOrderAttempt";

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
  const { partner, afterCreatePath } = useOutletContext<{ partner: any; afterCreatePath?: string }>();
  const { role, user, profile, checkAuthzAccess, setSafePartnerOrderDraft, takeSafePartnerOrderDraft } = useAuth();
  const location = useLocation();
  const isRoleTecnico = role === "parceiro_b2b_tecnico";
  const isSimuladorRoute = location.pathname.includes("/portal-parceiro/simulador");
  const isCatalogoRoute = location.pathname.includes("/portal-parceiro/catalogo");
  // Modo simulação: técnico B2B (sempre) ou qualquer usuário na rota /simulador.
  // Nesse modo usamos valores de tabela sem desconto e criamos partner_simulations,
  // nunca pedidos oficiais.
  const isSimulationMode = isRoleTecnico || isSimuladorRoute;
  const catalogGestor = usePartnerCatalog(isSimulationMode ? null : partner?.id);
  const catalogTecnico = usePartnerCatalogTecnico(isSimulationMode);
  useRealtimePartnerCatalogTecnico();
  const catalog: CatalogItem[] = isSimulationMode
    ? (catalogTecnico.data ?? [])
    : (catalogGestor.data ?? []);
  // Comprador: leitor escopado pelo guard canônico do vendedor; técnico/simulação mantém a leitura existente.
  const legacyVolumes = useCatalogoVolumes(isSimulationMode);
  const partnerVolumes = usePartnerCatalogVolumes(isSimulationMode ? null : partner?.id);
  const volumes = isSimulationMode ? legacyVolumes : partnerVolumes;
  const supplierName = isSimulationMode ? null : partnerVolumes.data?.sellerName ?? partner?.sellerName ?? null;
  const createOrder = useCreatePartnerOrder(supplierName);
  // Embalagens inteiras: só comprador e só com o contrato confirmado pelo leitor (ausente/erro => fechado).
  const packagingOffers = usePartnerPackagingOffers(isSimulationMode ? null : partner?.id);
  const offersFor = (itemId: string) =>
    packagingOffers.data?.state === "available" ? packagingOffers.data.offers.get(itemId) ?? [] : [];
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
  const renewalApplied = useRef(false);
  // Escolhas de embalagem ainda NÃO confirmadas por uma leitura fresca (erro transitório do leitor):
  // ficam retidas só como identidade + quantidade, sem preço/autoridade, e bloqueiam simulação/envio.
  const [pendingPackaging, setPendingPackaging] = useState<Array<{ itemId: string; packagingId: string; quantity: number }>>([]);
  const [draftRestored, setDraftRestored] = useState(false);
  const draftScope = useMemo<PartnerOrderDraftScope | null>(() =>
    !isSimulationMode && user?.id && profile?.organization_id && partner?.id
      ? { userId: user.id, tenantId: profile.organization_id, partnerId: partner.id } : null,
    [isSimulationMode, user?.id, profile?.organization_id, partner?.id]);
  const packagingCartLine = (item: CatalogItem, offer: PackagingOffer, quantidade: number): CartItem => ({
    item_id: item.item_id, item_tipo: "produto", product_id: item.product_id, nome: item.nome,
    quantidade, preco_unitario: offer.preco_tabela_brl, desconto_percentual: 0, subtotal: round2(offer.preco_tabela_brl * quantidade),
    preco_unitario_cheio: offer.preco_tabela_brl, subtotal_cheio: round2(offer.preco_tabela_brl * quantidade),
    unidade_pedido: "embalagem", volume_id: null, volume_ml: null, volume_rotulo: packagingLabel(offer),
    area_ha: null, packaging_id: offer.packaging_id, peso_liquido_kg: offer.peso_liquido_kg,
    unidade_conteudo: offer.unidade_conteudo,
  });
  // Natural renewal never restores prices/hash/plan/text or a submit receipt.
  // Rebuild only choices present in the freshly authorized catalogue/volumes.
  // Origem: recibo de renovação natural (memória) ou, após recarregar, a retenção mínima escopada
  // (usuário+tenant+parceiro, expirável) — só com o monitor confirmando o acesso atual.
  useEffect(() => {
    if (renewalApplied.current || !catalogGestor.isSuccess || !volumes.isSuccess || isSimulationMode) return;
    // Embalagens do rascunho só se restauram contra o leitor de embalagens já resolvido (dados ou erro).
    if (!packagingOffers.data && !packagingOffers.isError) return;
    renewalApplied.current = true;
    setDraftRestored(true);
    const draft = takeSafePartnerOrderDraft?.() ??
      (draftScope && (checkAuthzAccess?.() ?? false) ? loadPartnerOrderDraft(draftScope) : null);
    if (!draft || draft.partnerId !== partner?.id) return;
    const next: Record<string, CartItem> = {};
    const pending: Array<{ itemId: string; packagingId: string; quantity: number }> = [];
    let droppedPackaging = 0;
    const readerFailed = packagingOffers.isError;
    for (const choice of draft.items) {
      if ("packagingId" in choice) {
        const item = catalogMap.get(choice.itemId);
        if (!item || item.item_tipo !== "produto" || !isWholePackagingQty(choice.quantity)) { droppedPackaging++; continue; }
        // Leitura com erro: NÃO descarta; retém para nova leitura e bloqueia envio até revalidar.
        if (readerFailed) { pending.push(choice); continue; }
        // Revalida tenant/contrato/preço: só volta se a MESMA embalagem segue ofertada agora pelo vendedor autorizado.
        const offer = packagingOffers.data?.state === "available"
          ? packagingOffers.data.offers.get(choice.itemId)?.find((o) => o.packaging_id === choice.packagingId) : undefined;
        if (!offer) { droppedPackaging++; continue; }
        next[`${choice.itemId}::pk::${offer.packaging_id}`] = packagingCartLine(item, offer, choice.quantity);
        continue;
      }
      const item = catalogMap.get(choice.itemId);
      const volume = volumes.data.porProdutoId.get(choice.itemId)?.find(v => v.id === choice.volumeId) ??
        volumes.data.porMicrorganismoId.get(choice.itemId)?.find(v => v.id === choice.volumeId);
      if (!item || !volume || !volume.ativo || volume.item_tipo !== item.item_tipo || volume.volume_ml <= 0) continue;
      const price = round2(Number(item.valor_litro_brl ?? 0) * volume.volume_ml / 1000);
      if (!Number.isFinite(price) || price <= 0) continue;
      const full = round2(Number(item.preco_tabela_litro || item.valor_litro_brl) * volume.volume_ml / 1000);
      next[`${choice.itemId}::${choice.volumeId}`] = {
        item_id: item.item_id, item_tipo: item.item_tipo, product_id: item.product_id, nome: item.nome,
        quantidade: choice.quantity, preco_unitario: price, subtotal: round2(price * choice.quantity),
        preco_unitario_cheio: full, subtotal_cheio: round2(full * choice.quantity),
        desconto_percentual: item.desconto_percentual, unidade_pedido: "volume_comercial",
        volume_id: volume.id, volume_ml: volume.volume_ml, volume_rotulo: volume.rotulo, area_ha: null,
      };
    }
    setCart(next);
    setPendingPackaging(pending);
    if (droppedPackaging > 0) {
      toast.warning(`${droppedPackaging} embalagem(ns) do rascunho não estão mais disponíveis com preço vigente e não foram restauradas.`);
    }
    // A data desejada é escolha volátil do usuário: restaura só se ainda válida;
    // uma data vencida/inválida é descartada em vez de enviada silenciosamente.
    if (draft.requestedDeliveryDate && isDeliveryDateValid(draft.requestedDeliveryDate)) {
      setRequestedDate(draft.requestedDeliveryDate);
    }
    if (draft.addItemId) setAddRow(partnerCatalogRows(catalog).find(row => row.id === draft.addItemId) ?? null);
  }, [catalogGestor.isSuccess, catalog, catalogMap, volumes.isSuccess, volumes.data, isSimulationMode, partner?.id, takeSafePartnerOrderDraft,
      packagingOffers.data, packagingOffers.isError, draftScope, checkAuthzAccess]);
  // Nova leitura BEM-SUCEDIDA do leitor confirma (ou descarta por ausência confirmada) as embalagens pendentes,
  // sempre com preço/peso/identidade dessa leitura — nunca os de antes.
  useEffect(() => {
    if (pendingPackaging.length === 0 || packagingOffers.isError || !packagingOffers.isSuccess || !packagingOffers.data) return;
    const pk = packagingOffers.data;
    let dropped = 0;
    setCart((c) => {
      const next = { ...c };
      for (const choice of pendingPackaging) {
        const item = catalogMap.get(choice.itemId);
        const offer = pk.state === "available" ? pk.offers.get(choice.itemId)?.find((o) => o.packaging_id === choice.packagingId) : undefined;
        if (!item || !offer) { dropped++; continue; }
        const key = `${choice.itemId}::pk::${offer.packaging_id}`;
        next[key] = packagingCartLine(item, offer, (next[key]?.quantidade ?? 0) + choice.quantity);
      }
      return next;
    });
    setPendingPackaging([]);
    if (dropped > 0) toast.warning(`${dropped} embalagem(ns) do rascunho não estão mais disponíveis com preço vigente e não foram restauradas.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPackaging, packagingOffers.isError, packagingOffers.isSuccess, packagingOffers.data, catalogMap]);
  useEffect(() => {
    const draft = !isSimulationMode && partner?.id ? {
      partnerId: partner.id, addItemId: addRow?.id ?? null,
      requestedDeliveryDate: requestedDate || null,
      items: [
        ...Object.values(cart).filter(item => item.quantidade > 0 && (item.volume_id || item.packaging_id)).map(item =>
          item.unidade_pedido === "embalagem" && item.packaging_id
            ? { itemId: item.item_id, packagingId: item.packaging_id, quantity: item.quantidade }
            : { itemId: item.item_id, volumeId: item.volume_id ?? "", quantity: item.quantidade }),
        ...pendingPackaging,
      ],
    } : null;
    setSafePartnerOrderDraft?.(draft);
    // Retenção após recarregar: só depois da restauração (nunca apaga o retido com o carrinho inicial vazio).
    if (draftRestored && draftScope) savePartnerOrderDraft(draftScope, draft);
    return () => setSafePartnerOrderDraft?.(null);
  }, [cart, pendingPackaging, addRow?.id, requestedDate, isSimulationMode, partner?.id, setSafePartnerOrderDraft, draftRestored, draftScope]);
  // Favoritos / modelos de pedido
  const saveTemplate = useSaveOrderTemplate();
  const cartHasPackaging = Object.values(cart).some((i) => i.unidade_pedido === "embalagem");
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
  // Escolha do meio amarrada a parceiro+condição: ao trocar a condição a escolha anterior deixa de valer NO MESMO render
  // (sem janela em que o meio de B é aplicado a A).
  const [methodChoice, setMethodChoice] = useState<(PaymentMethodChoice & { planId: string; partnerId: string }) | null>(null);
  // Tentativa de envio: chave/estado vivem fora do componente (memória volátil
  // por ator+empresa+papéis+parceiro) para sobreviver a remontagem do boundary.
  const pageScope = useStorageAccessScope("partner-order-page");
  const attemptSlot = !isSimulationMode ? createOrder.slotFor(partner?.id) : null;
  const attempt = useSyncExternalStore(subscribeOrderAttempts, () => readOrderAttempt(attemptSlot));
  const closeAttempt = useCloseOrderAttempt();
  const durableAttempt=useOrderJournal(isSimulationMode?undefined:partner?.id);
  const submitLock=useRef(false);
  const [submitPending,setSubmitPending]=useState(false);
  useEffect(()=>{
    // Terminal server receipt is shown on the same catalogue, including empty carts.
    // Do not clear user edits or authorize a next generation.
    if(durableAttempt.mode==='durable' && !durableAttempt.next && ['committed','closed'].includes(durableAttempt.journal?.state??'')) setConfirmOpen(false);
  },[durableAttempt.mode,durableAttempt.journal?.state,durableAttempt.next]);
  // Confirmação explícita do pedido existente (diálogo React; nunca window.confirm).
  // Captura key/geração/pedido/slot/escopo ao abrir; confirmar só avança se tudo
  // ainda coincide. Cancelar/fechar não chama RPC nem altera o carrinho.
  const [ackTarget,setAckTarget]=useState<{journal:import('@/lib/authz/orderJournal').Journal;slot:string|null;scope:string;fence:()=>boolean}|null>(null);
  const ackLock=useRef(false);
  const ackStillValid=(t:NonNullable<typeof ackTarget>)=>{
    const j=durableAttempt.journal;
    return t.fence() && pageScope.ready && pageScope.scope===t.scope && attemptSlot===t.slot && durableAttempt.mode==='durable' &&
      !!j && j.state==='committed' && t.journal.state==='committed' && j.key===t.journal.key && j.generation===t.journal.generation &&
      j.order_id===t.journal.order_id && j.numero===t.journal.numero;
  };
  useEffect(()=>{ if(ackTarget && !ackStillValid(ackTarget)) setAckTarget(null); });
  const confirmAck=()=>{
    const t=ackTarget; setAckTarget(null);
    if(!t || ackLock.current || durableAttempt.pending) return;
    if(!ackStillValid(t)){ toast.error("O pedido ou o contexto mudou. Nada foi confirmado; verifique novamente."); return; }
    ackLock.current=true;
    void durableAttempt.recover(t.journal).finally(()=>{ackLock.current=false;});
  };
  // Aviso do último resultado de verificação, preso ao slot+chave que o produziu.
  const [closeNote, setCloseNote] = useState<{ slot: string | null; key: string | null; text: string } | null>(null);


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
  const cartInvalid = pendingPackaging.length > 0 || cartList.some((i) => i.quantidade <= 0 || i.preco_unitario <= 0 ||
    (i.unidade_pedido === "embalagem" && (!i.packaging_id || !isWholePackagingQty(i.quantidade))));

  // Payload de itens para a RPC de simulação (mesmo shape do create)
  const simulationItems = useMemo(
    () =>
      cartInvalid ? [] : cartList.map(orderLineFor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartInvalid, JSON.stringify(cartList.map((i) => [i.item_id, i.quantidade, i.unidade_pedido, i.volume_ml, i.packaging_id ?? null]))],
  );

  const cashPlan = useMemo(() => paymentPlans.find((p) => p.plan_type === "cash") ?? null, [paymentPlans]);
  const selectedPlan = useMemo(
    () => paymentPlans.find((p) => p.id === selectedPlanId) ?? null,
    [paymentPlans, selectedPlanId],
  );

  // Simulações cercadas: estado atômico por chave (contexto+escopo canônico+itens+plano), seq por disparo
  // e fence capturado. Diálogo fechado/carrinho inválido => chave nula, o que aposenta respostas em voo.
  const simEnabled = !isSimulationMode && confirmOpen && !cartInvalid;
  // (o modo do meio de pagamento também precisa estar confirmado; ver methodMode abaixo)
  // B2B_PAYMENT_CONDITION_V1: meios permitidos pelo vendedor para a condição; escolha reiniciada a cada condição/parceiro.
  const methodOptions = useB2BPaymentMethodOptions(partner?.id, selectedPlanId, !isSimulationMode && confirmOpen);
  const methodList = methodOptions.data?.status === "ok" ? methodOptions.data.options : [];
  // Modo vem do servidor por empresa vendedora/parceiro. Pré-instalação exata = contrato atual (o servidor não exige meio).
  // Carregando/erro/escopo ausente => null: nenhuma simulação nem envio (falha fechada).
  const methodMode: "required" | "legacy" | null = methodOptions.isError || methodOptions.isFetching ? null
    : methodOptions.data?.status === "ok" ? methodOptions.data.mode
    : methodOptions.data?.status === "not_installed" ? "legacy" : null;
  const requireMethod = methodMode === "required";
  const selectedMethod: PaymentMethodChoice | null = useMemo(() => {
    if (!methodChoice || methodChoice.planId !== selectedPlanId || methodChoice.partnerId !== partner?.id) return null;
    if (methodOptions.data?.status !== "ok") return null;
    const live = methodOptions.data.options.some((o) => o.available && sameChoice(o, methodChoice));
    return live ? { payment_method: methodChoice.payment_method, payment_condition_version: methodChoice.payment_condition_version,
      payment_deadline_days: methodChoice.payment_deadline_days } : null;
  }, [methodChoice, selectedPlanId, partner?.id, methodOptions.data]);
  const setSelectedMethod = (m: PaymentMethodChoice | null) =>
    setMethodChoice(m && selectedPlanId && partner?.id ? { ...m, planId: selectedPlanId, partnerId: partner.id } : null);
  const selSim = useFencedB2BSimulation({ enabled: simEnabled && methodMode !== null, scope: pageScope, userId: user?.id,
    organizationId: profile?.organization_id, partnerId: partner?.id, planId: selectedPlanId, items: simulationItems,
    requireMethod, method: requireMethod ? selectedMethod : null });
  const cashSim = useFencedB2BSimulation({ enabled: simEnabled && methodMode !== null, scope: pageScope, userId: user?.id,
    organizationId: profile?.organization_id, partnerId: partner?.id, planId: cashPlan?.id, items: simulationItems });
  const simulation = selSim.result;
  const cashSimulation = cashSim.result;
  const visibleSimulation = simulation;
  const visibleSimFailure = selSim.pending ? null : selSim.failure;
  const setSimRetryTick = (_: unknown) => selSim.retry();


  const liveInputRef = useRef<Parameters<typeof orderAttemptFingerprint>[0]>({ partner_id: "", items: [] });
  liveInputRef.current = {
    partner_id: partner?.id ?? "", observacoes: obs || undefined, requested_delivery_date: requestedDate || null,
    items: cartList.map(({ key, ...rest }) => rest), payment_plan_id: selectedPlanId,
    // Com meio: parcelas e vencimento são do servidor (estimados, base NF); o cliente não os envia.
    first_due_date: null, installment_count: null, payment_method: requireMethod ? selectedMethod : null,
  };
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
    if (methodMode === null) {
      toast.error("Não foi possível confirmar os meios de pagamento desta condição.");
      return;
    }
    if (requireMethod && !selectedMethod) {
      toast.error("Selecione um meio de pagamento permitido pela empresa fornecedora.");
      return;
    }
    // Revalida no clique: só o resultado da chave/seq/fence atuais autoriza o envio.
    const currentSim = selSim.take();
    if (!currentSim?.cart_hash) {
      toast.error("Aguarde a validação de preços pelo servidor antes de enviar o pedido.");
      return;
    }
    if (!attemptSlot) {
      toast.error("Contexto de acesso indisponível. Aguarde a confirmação e tente novamente.");
      return;
    }
    const dispatch=durableAttempt.takeDispatch();
    if(submitLock.current || createOrder.isPending || attempt?.inflight || closeAttempt.pending)return;
    if(!dispatch) {
      toast.error('Verifique o envio anterior antes de continuar.');return;
    }
    const items = cartList.map(({ key, ...rest }) => rest);
    const input = {
      partner_id: partner.id,
      observacoes: obs || undefined,
      requested_delivery_date: requestedDate || null,
      items,
      payment_plan_id: selectedPlanId,
      first_due_date: null,
      installment_count: null,
      payment_method: requireMethod ? selectedMethod : null,
      expected_cart_hash: currentSim.cart_hash,
    };
    const fingerprint = orderAttemptFingerprint(input);
    // Mesmo payload => mesma chave (servidor deduplica). Payload alterado após
    // resultado incerto NÃO gera chave nova: exige confirmar o envio anterior.
    // Durable: the server key comes from prepareDurableOrder (reserved right before dispatch when `next`);
    // the value below is never dispatched in durable mode.
    const prepared = dispatch.kind==='durable'
      ? {ok:true as const,key:dispatch.next ? 'durable-next' : dispatch.expected?.key ?? ''}
      : prepareOrderAttempt(attemptSlot, fingerprint, () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    if (!prepared.ok) {
      if ("reason" in prepared && prepared.reason === "closing") { toast.error("Aguarde a verificação do envio anterior terminar."); return; }
      toast.error("O envio anterior ainda não foi confirmado. Reenvie o mesmo carrinho para confirmar (não duplica) ou consulte Meus Pedidos.");
      return;
    }
    const fence = pageScope.capture();
    const slot = attemptSlot;
    // Reserva síncrona antes de qualquer await: dois cliques no mesmo tick ou
    // remontagens contam envios em voo e nenhum desfecho apaga o outro.
    submitLock.current=true;setSubmitPending(true);
    if(dispatch.kind==='legacy')markOrderAttemptSending(slot, prepared.key);
    createOrder.mutate(
      { ...input, idempotency_key: prepared.key, attempt_slot: slot,
        journal_expected:dispatch.kind==='durable'?dispatch.expected:undefined,
        journal_next:dispatch.kind==='durable'?dispatch.next:undefined,
        current_payload:()=>fence() && orderAttemptFingerprint(liveInputRef.current)===fingerprint },
      {
        onSettled:()=>{submitLock.current=false;setSubmitPending(false);},
        onSuccess: () => {
          // Callback por chamada também é cercado: resposta tardia de outro
          // ator/empresa/época não limpa carrinho nem navega.
          if (!fence()) return;
          if(dispatch.kind==='legacy')settleOrderAttempt(slot, prepared.key);
          // Payload COMPLETO atual (itens, obs, data, plano, parcelas, vencimento):
          // qualquer edição após o envio é preservada — sem fechar/limpar/navegar.
          if (orderAttemptFingerprint(liveInputRef.current) !== fingerprint) return;
          setConfirmOpen(false);
          setCart({});
          setObs("");
          setRequestedDate("");
          setSelectedPlanId(null);
          setSelectedMethod(null);
          navigate(afterCreatePath ?? "/portal-parceiro/pedidos");
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
        <Plus className="h-4 w-4 mr-1" /> {isSimulationMode ? "Adicionar à simulação" : "Adicionar ao pedido"}
      </Button>
    );
  };

  const addRowCatalogItem = addRow ? catalogMap.get(addRow.id) : null;
  const addRowOffers = addRow && addRowCatalogItem?.item_tipo === "produto" ? offersFor(addRow.id) : [];
  // Modo do item aberto. Líquido só quando o leitor de embalagens confirmou que NÃO é sólido, ou na ausência
  // exata do endpoint (pré-instalação). Carregando/erro/contrato inválido nunca abrem o modo líquido nem dizem "sem volume".
  const addRowMode: "none" | "liquid" | "packaging" | "packaging_loading" | "packaging_error" | "solid_unavailable" = (() => {
    if (!addRow) return "none";
    if (isSimulationMode || addRowCatalogItem?.item_tipo !== "produto") return "liquid";
    const pk = packagingOffers.data;
    if (packagingOffers.isError) return "packaging_error";
    if (!pk) return "packaging_loading";
    if (pk.state === "not_installed") return "liquid";
    if (addRowOffers.length > 0) return "packaging";
    return pk.solidProducts.has(addRow.id) ? "solid_unavailable" : "liquid";
  })();
  const packagingContractInvalid = packagingOffers.error instanceof Error && packagingOffers.error.message === "packaging_contract_unavailable";
  const doseRefHa = doseLitroHaFor(addRowCatalogItem ?? undefined);

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-32 md:pb-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">
          {isCatalogoRoute ? "Selecionar produtos para o pedido" : isSimulationMode ? "Simulador B2B" : "Novo Pedido"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isCatalogoRoute
            ? "Pedido para a empresa vinculada ao seu acesso. O envio depende da validação de preços e da autorização do servidor."
            : isSimulationMode
            ? "Esta simulação utiliza valores de tabela, sem desconto. Condições comerciais finais são aplicadas apenas em pedido oficial."
            : "Selecione produtos e/ou microrganismos. Condição comercial B2B aplicada."}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Escolha o volume comercial desejado, informe a área (ha) se aplicável e confirme a quantidade.
        </p>
      </div>

          {!isSimulationMode && durableAttempt.mode!=='legacy' && !durableAttempt.next && durableAttempt.journal?.state!=='reserved' && <Alert role="status" data-journal={durableAttempt.mode}>
            <AlertDescription className="space-y-2">
              {durableAttempt.journal?.state==='committed' ? <>
                <span className="block">Pedido {durableAttempt.journal.numero} já registrado. Consulte-o antes de iniciar outro pedido.</span>
                <Button size="sm" variant="outline" onClick={()=>navigate(afterCreatePath??'/portal-parceiro/pedidos')}>Ver meus pedidos</Button>
                <Button size="sm" variant="outline" disabled={durableAttempt.pending || !!ackTarget} onClick={()=>{
                  const j=durableAttempt.journal;
                  if(j?.state==='committed' && pageScope.ready) setAckTarget({journal:j,slot:attemptSlot,scope:pageScope.scope,fence:pageScope.capture()});
                }}>Confirmar pedido existente e iniciar novo</Button>
              </> : durableAttempt.journal?.state==='closed' ? <>
                <span className="block">Tentativa encerrada sem pedido. Seu carrinho foi mantido.</span>
                <Button size="sm" variant="outline" disabled={durableAttempt.pending} onClick={()=>void durableAttempt.recover(durableAttempt.journal??undefined)}>Iniciar nova tentativa</Button>
              </> : durableAttempt.journal?.state==='uncertain' ? <>
                <span className="block">O resultado de uma tentativa de envio ainda não foi confirmado. Verifique antes de iniciar outro pedido.</span>
                <span className="block text-xs text-muted-foreground">Se nenhum pedido aparece em Meus Pedidos, use "Verificar e encerrar envio anterior": o servidor confirma se houve pedido e só encerra a tentativa se não houver. Nenhum pedido é cancelado ou reenviado.</span>
                <Button size="sm" disabled={closeAttempt.pending || durableAttempt.pending} onClick={()=>{void closeAttempt.close(partner?.id).then(r=>{const f=closeAttemptFeedback(r);(f.tone==='success'?toast.success:f.tone==='info'?toast.info:toast.error)(f.text);});}}>{closeAttempt.pending?'Verificando…':'Verificar e encerrar envio anterior'}</Button>
                <Button size="sm" variant="outline" disabled={durableAttempt.pending} onClick={()=>void durableAttempt.recover()}>Consultar situação novamente</Button>
              </> : <>
                <span className="block">{durableAttempt.mode==='checking'?'Verificando disponibilidade para o pedido…':'Não foi possível verificar a continuidade do pedido. Nada foi liberado.'}</span>
                {durableAttempt.mode!=='checking' && <Button size="sm" variant="outline" disabled={durableAttempt.pending} onClick={()=>void durableAttempt.recover()}>Verificar novamente</Button>}
              </>}
            </AlertDescription>
          </Alert>}
          <AlertDialog open={!!ackTarget} onOpenChange={o=>{if(!o)setAckTarget(null);}}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar pedido existente</AlertDialogTitle>
                <AlertDialogDescription>
                  Confirmo que consultei o pedido {ackTarget?.journal.numero} e desejo iniciar um novo pedido. O pedido existente não é alterado e seu carrinho é mantido.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction disabled={durableAttempt.pending} onClick={confirmAck}>Confirmar e iniciar novo</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Catálogo</CardTitle>
          </CardHeader>
          <CardContent>
            <CatalogoCardsGrid
              scope="b2b"
              source={{ ...(isSimulationMode ? catalogTecnico : catalogGestor), data: partnerCatalogRows(catalog) }}
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
            {pendingPackaging.length > 0 && (
              <div role="alert" data-testid="pending-packaging" className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p>
                  {pendingPackaging.length} embalagem(ns) do seu rascunho aguardam confirmação: a leitura das apresentações falhou.
                  Elas não foram descartadas, mas simulação e envio ficam bloqueados até confirmar preço e disponibilidade atuais.
                </p>
                <Button size="sm" variant="outline" className="mt-2" disabled={packagingOffers.isFetching}
                        onClick={() => void packagingOffers.refetch()}>
                  {packagingOffers.isFetching ? "Confirmando…" : "Tentar confirmar agora"}
                </Button>
              </div>
            )}
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
                      {i.unidade_pedido === "embalagem" && i.peso_liquido_kg && i.quantidade > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Peso para frete: {nfmt.format(i.peso_liquido_kg * i.quantidade)} kg
                        </div>
                      )}
                      {totalLitros !== null && i.quantidade > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Total: {nfmt.format(totalLitros)} L
                          {i.area_ha ? ` · Área-alvo: ${nfmt.format(i.area_ha)} ha` : ""}
                        </div>
                      )}
                      {semPreco && (
                        <p className="text-[11px] text-destructive">
                          Item sem preço configurado. Remova do carrinho ou solicite preço à {supplierLabel(supplierName)}.
                        </p>
                      )}

                    </div>
                  );
                })}
              </div>
            )}

            {!isSimulationMode && (
              <div className="space-y-1">
                <label htmlFor="requested-delivery-date" className="text-xs text-muted-foreground">Data desejada de entrega</label>
                <Input
                  id="requested-delivery-date"
                  type="date"
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  min={minDeliveryDateISO()}
                />
                <p className="text-[10px] text-muted-foreground italic">
                  {minDeliveryHint(supplierName)}
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
      {(cartList.length > 0 || pendingPackaging.length > 0) && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t bg-background p-3 z-20 space-y-2 shadow-lg">
          {pendingPackaging.length > 0 && (
            <p role="status" className="text-xs text-destructive">
              {pendingPackaging.length} embalagem(ns) aguardam confirmação; envio bloqueado.{" "}
              <button type="button" className="underline" onClick={() => void packagingOffers.refetch()}>Tentar confirmar</button>
            </p>
          )}
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

      {/* Sólido/indefinido sem modo líquido: estado explícito, sem ação de compra */}
      <Dialog open={addRowMode === "packaging_loading" || addRowMode === "packaging_error" || addRowMode === "solid_unavailable"}
              onOpenChange={(v) => !v && setAddRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{addRow?.nome ?? "Produto"}</DialogTitle></DialogHeader>
          <p role="status" data-testid="packaging-state" className="text-sm text-muted-foreground">
            {addRowMode === "packaging_loading"
              ? "Confirmando as apresentações disponíveis deste produto…"
              : addRowMode === "packaging_error"
                ? (packagingContractInvalid
                    ? "A resposta de apresentações do fornecedor veio em formato não reconhecido. Nada foi adicionado; tente novamente mais tarde."
                    : "Não foi possível confirmar as apresentações deste produto agora. Nada foi adicionado; tente novamente.")
                : `Este produto é vendido em embalagem inteira, mas ${supplierName ?? "a empresa fornecedora"} ainda não tem embalagem ativa com preço vigente para ele.`}
          </p>
          <DialogFooter><Button variant="outline" onClick={() => setAddRow(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Add to cart dialog */}
      <AddPackagingToCartDialog
        open={addRowMode === "packaging"}
        onOpenChange={(v) => !v && setAddRow(null)}
        nome={addRow?.nome ?? null}
        offers={addRowOffers}
        onConfirm={({ offer, quantidade: q }) => {
          if (!addRow || !addRowCatalogItem) return;
          setCart((c) => {
            const key = `${addRow.id}::pk::${offer.packaging_id}`;
            const quantidade = (c[key]?.quantidade ?? 0) + q;
            const preco = offer.preco_tabela_brl;
            return { ...c, [key]: {
              item_id: addRow.id, item_tipo: "produto", product_id: addRowCatalogItem.product_id, nome: addRow.nome,
              quantidade, preco_unitario: preco, desconto_percentual: 0, subtotal: round2(preco * quantidade),
              preco_unitario_cheio: preco, subtotal_cheio: round2(preco * quantidade),
              unidade_pedido: "embalagem", volume_id: null, volume_ml: null, volume_rotulo: packagingLabel(offer),
              area_ha: null, packaging_id: offer.packaging_id, peso_liquido_kg: offer.peso_liquido_kg,
              unidade_conteudo: offer.unidade_conteudo,
            } };
          });
          toast.success("Embalagem adicionada ao carrinho");
        }}
      />
      <AddToCartDialog
        volumesCat={volumes.data ?? null}
        volumesStatus={volumes.isError ? "error" : volumes.isSuccess ? "success" : "pending"}
        supplierName={supplierName}
        open={addRowMode === "liquid"}
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
            {!isSimulationMode && (
              <div>
                <div className="text-xs text-muted-foreground">Data desejada de entrega</div>
                <div className="font-medium" data-testid="resumo-requested-delivery-date">
                  {requestedDate ? formatDateDisplay(requestedDate) : "Não informada"}
                </div>
              </div>
            )}
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
                  loading={selSim.pending}
                  conditionRequired={methodMode !== "legacy"}
                  selectedCondition={requireMethod && selectedMethod
                    ? (simulation as Partial<MethodSimulateResult> | null)?.payment_condition
                      ?? methodList.find((o) => o.available && sameChoice(o, selectedMethod))
                    : null}
                  selectedSchedule={requireMethod ? simulation?.schedule : undefined}
                />

                {selectedPlanId && methodMode !== "legacy" && (
                  <div className="space-y-1" data-testid="b2b-payment-method">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Meio de pagamento</div>
                     {methodOptions.isFetching ? (
                      <p className="text-xs text-muted-foreground">Carregando meios permitidos…</p>
                    ) : methodOptions.isError || methodOptions.data?.status !== "ok" ? (
                      <Alert variant="destructive" className="py-2" role="alert" data-testid="b2b-payment-method-error">
                        <AlertDescription className="text-xs space-y-2">
                          <p>Não foi possível confirmar os meios de pagamento desta condição. O pedido não pode ser enviado agora.</p>
                          <Button type="button" size="sm" variant="outline" onClick={() => void methodOptions.refetch()}>
                            Tentar carregar novamente
                          </Button>
                        </AlertDescription>
                      </Alert>
                    ) : methodList.filter((o) => o.available).length === 0 ? (
                      <p className="text-xs text-muted-foreground" data-testid="b2b-payment-method-empty">
                        A empresa fornecedora ainda não configurou meios de pagamento para esta condição.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Meio de pagamento">
                        {methodList.filter((o) => o.available).map((o) => {
                          const on = sameChoice(selectedMethod, o);
                          return (
                            <Button key={`${o.payment_method}:${o.payment_condition_version}`} type="button" size="sm" role="radio" aria-checked={on}
                              variant={on ? "default" : "outline"}
                              onClick={() => setSelectedMethod({ payment_method: o.payment_method, payment_condition_version: o.payment_condition_version,
                                payment_deadline_days: o.payment_deadline_days })}>
                              {METHOD_KIND_LABEL[o.payment_method]}
                              {o.installment_count ? ` · ${o.installment_count}x` : ""}
                              {o.monthly_rate !== null ? ` · ${o.monthly_rate.toLocaleString("pt-BR")}% a.m.` : ""}
                              {o.payment_deadline_days >= 0 ? ` · ${o.payment_deadline_days} dias após a NF` : ""}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {visibleSimFailure && (
                  <Alert variant="destructive" className="py-2" role="alert" data-testid="b2b-simulation-error">
                    <AlertDescription className="text-xs space-y-2">
                      <p className="font-medium">{visibleSimFailure.title}</p>
                      <p>{visibleSimFailure.detail}</p>
                      {visibleSimFailure.code && <p className="opacity-80">Código: {visibleSimFailure.code}</p>}
                      {visibleSimFailure.retryable && (
                        <Button type="button" size="sm" variant="outline"
                          onClick={() => setSimRetryTick((n) => n + 1)}>
                          Tentar calcular novamente
                        </Button>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                {visibleSimulation && (
                  <PaymentSimulationSummary
                    simulation={visibleSimulation}
                    cashReferenceAmount={cashSimulation?.amounts.final_amount ?? null}
                    responsavelNome={supplierName}
                    estimatedMethodLabel={(visibleSimulation as Partial<MethodSimulateResult>).schedule_estimated
                      ? (visibleSimulation as MethodSimulateResult).payment_condition.payment_method_name : null}
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
          {!isSimulationMode && durableAttempt.mode==='legacy' && attempt && (attempt.order ? (
            <Alert role="status" data-attempt="committed">
              <AlertDescription className="space-y-2">
                <span className="block">Pedido{attempt.order.numero ? ` ${attempt.order.numero}` : ""} já foi registrado por um envio anterior. Reenviar o mesmo carrinho não cria outro pedido.</span>
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigate(afterCreatePath ?? "/portal-parceiro/pedidos")}>Ver meus pedidos</Button>
                  <Button size="sm" variant="outline" onClick={() => settleOrderAttempt(attemptSlot, attempt.key)}>Iniciar um novo pedido</Button>
                </span>
              </AlertDescription>
            </Alert>
          ) : attempt.ambiguous ? (
            <Alert role="alert" data-attempt="ambiguous">
              <AlertDescription className="space-y-2">
                <span className="block">{attempt.inflight
                  ? "Envio anterior ainda em andamento. Aguarde a resposta antes de enviar novamente."
                  : "Não foi possível confirmar o envio anterior. Reenvie exatamente o mesmo carrinho para confirmar (não duplica) ou consulte Meus Pedidos. Alterações ficam bloqueadas até a confirmação."}</span>
                {!attempt.inflight && (
                  <>
                    <span className="block text-xs">
                      Você também pode pedir ao servidor para verificar o envio anterior. Se ele virou pedido, mostramos o número.
                      Se não chegou, aquela tentativa é encerrada de vez (nenhum pedido é cancelado) e o carrinho atual pode ser enviado.
                    </span>
                    <Button size="sm" variant="outline"
                      disabled={!!attempt.closing || closeAttempt.pending || createOrder.isPending}
                      onClick={async () => {
                        const slot = attemptSlot, key = attempt.key;
                        const r = await closeAttempt.close(partner?.id);
                        const text = r.kind === "closed" ? "Envio anterior encerrado sem pedido. Seu carrinho foi mantido; você pode enviá-lo agora."
                          : r.kind === "committed" ? `O envio anterior virou o pedido ${r.numero}.`
                          : r.kind === "in_progress" ? "O envio anterior ainda está sendo processado. Verifique de novo em instantes; o bloqueio continua."
                          : r.kind === "context_changed" ? "Seu acesso mudou durante a verificação. Nada foi liberado; verifique novamente."
                          : r.kind === "not_eligible" ? "Não há envio anterior para verificar agora."
                          : "Não foi possível verificar agora. Nada foi liberado; tente novamente.";
                        setCloseNote({ slot, key, text });
                      }}>
                      {attempt.closing || closeAttempt.pending ? "Verificando…" : "Verificar e encerrar envio anterior"}
                    </Button>
                  </>
                )}
              </AlertDescription>
            </Alert>
          ) : null)}
          {!isSimulationMode && closeNote && closeNote.slot === attemptSlot && (!attempt || attempt.key === closeNote.key || attempt.order) && (
            <p role="status" data-attempt-note className="text-xs text-muted-foreground">{closeNote.text}</p>
          )}
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
                disabled={submitPending || createOrder.isPending || !!attempt?.inflight || closeAttempt.pending || !durableAttempt.canSubmit ||
                  !selectedPlanId || methodMode === null || (requireMethod && !selectedMethod) || selSim.pending || !visibleSimulation || !!visibleSimFailure}
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
            {cartHasPackaging ? (
              <p role="alert" data-testid="template-packaging-blocked" className="text-xs text-destructive">
                Este carrinho tem embalagem inteira. Modelos ainda não guardam embalagens, por isso nada será salvo:
                remova as embalagens para salvar um modelo só com os demais itens, ou faça o pedido sem modelo.
              </p>
            ) : (
              <div className="text-xs text-muted-foreground">{cartList.length} item(ns) serão salvos.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFavOpen(false)}>Cancelar</Button>
            <Button
              disabled={!favNome.trim() || cartList.length === 0 || cartHasPackaging || saveTemplate.isPending || !partner?.id}
              onClick={() => {
                // Nunca grava modelo parcial (sem as embalagens) nem vazio.
                if (!partner?.id || cartHasPackaging || cartList.length === 0) return;
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

