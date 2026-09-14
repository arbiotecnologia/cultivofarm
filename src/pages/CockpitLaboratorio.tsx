import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, ClipboardList, FlaskRound, CheckCircle2, Package, Warehouse, 
  Truck, Sprout, AlertCircle, Clock, MoreVertical, Info, History, MapPin, 
  User, Beaker, Box, List, AlertTriangle, Check, ArrowUpRight, Calendar, UserPlus, Star,
  Target
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/date-utils";
import { ptBR } from "date-fns/locale";
import { EsteiraStepper } from "@/components/cockpit/EsteiraStepper";
import { RegistrarCQDialog, type RegistrarCQTarget } from "@/components/cockpit/RegistrarCQDialog";
import { GerarLoteDialog, type GerarLoteTarget } from "@/components/cockpit/GerarLoteDialog";
import { RegistrarEnvaseDialog, type RegistrarEnvaseTarget } from "@/components/cockpit/RegistrarEnvaseDialog";
import { ReservarEstoqueDialog, type ReservarEstoqueTarget } from "@/components/cockpit/ReservarEstoqueDialog";
import { PendenciasInconsistenciasTab } from "@/components/cockpit/PendenciasInconsistenciasTab";
import { FinalizarOSButton } from "@/components/cockpit/FinalizarOSButton";
import { ComposicaoProducaoCard } from "@/components/cockpit/ComposicaoProducaoCard";
import { ProducaoResumoTab } from "@/components/cockpit/ProducaoResumoTab";
import { criarTrava, deduplicarEsteira, filtrarCockpit, formatVolume, podeOperar, somaVolumes, timestampBrasilia, volumeLitros } from "@/lib/cockpit/auditoria";


import { useMetricasOperacionais } from "@/hooks/useMetricasOperacionais";
import { formatMetric, formatIntervalToHours, SEM_DADOS } from "@/lib/metrics-utils";
import { cockpitStage, STAGE_COLUMN, type CockpitStage } from "@/lib/cockpit/stage";



type KanbanStage = 
  | "aguardando"
  | "em_producao"
  | "aguardando_cq"
  | "aprovado_cq"
  | "envase"
  | "estoque_reserva"
  | "entrega"
  | "aplicacao";

interface CockpitItem {
  id: string;
  os_id: string;
  numero_os: string;
  origem: "manual" | "onfarm";
  cliente: string;
  fazenda: string;
  talhao: string;
  produto: string;
  volume_solicitado: number | null;
  data_programada: string;
  prioridade: "alta" | "media" | "baixa";
  lote_id?: string;
  codigo_lote?: string;
  lote_status?: string;
  cq_resultado?: string;
  entrega_status?: string;
  aplicacao_status?: string;
  stage: KanbanStage;
  os_status: string;
  proxima_acao: string;
  atrasado: boolean;
  cliente_id?: string;
  fazenda_id?: string;
  talhao_id?: string;
  produto_id?: string;
  microrganismo_id?: string;
  microrganismo_nome?: string;
  created_at?: string;
  responsavel_id?: string;
  responsavel_nome?: string;
  status_esteira_oficial: string;
  bloqueios: string[];
  pode_finalizar: boolean;
  titular_nome: string;
  titular_tipo: "cliente" | "parceiro" | "desconhecido";
  partner_id?: string;
  partner_nome?: string;
  partner_numero?: string;
}

const STAGES: { id: KanbanStage; title: string; icon: any; color: string; mobileLabel: string }[] = [
  { id: "aguardando", title: "Aguardando", icon: Clock, color: "bg-muted", mobileLabel: "Aguardando" },
  { id: "em_producao", title: "Produção / PCP", icon: FlaskRound, color: "bg-status-producao/10", mobileLabel: "Produção" },
  { id: "aguardando_cq", title: "Aguardando CQ", icon: Clock, color: "bg-status-cq/10", mobileLabel: "CQ" },
  { id: "aprovado_cq", title: "Aprovado CQ", icon: CheckCircle2, color: "bg-status-aprovado/10", mobileLabel: "Aprovados" },
  { id: "envase", title: "Envase", icon: Package, color: "bg-orange-100", mobileLabel: "Envase" },
  { id: "estoque_reserva", title: "Estoque/Reserva", icon: Warehouse, color: "bg-blue-100", mobileLabel: "Estoque" },
  { id: "entrega", title: "Entrega / Finalização", icon: Truck, color: "bg-purple-100", mobileLabel: "Entrega" },
];


export default function CockpitLaboratorio() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, role } = useAuth();
  const isProducaoRole = role === "producao";
  const canEditResponsavel = role === "administrador" || role === "gestor";

  const {
    profiles,
    assumirProducao,
    enviarParaCQ,
    enviarParaEnvase,
    concluirEnvase,
    finalizarOS,
    atualizarPrioridade,
    atualizarDataProgramada,
    programarProducao,

    vincularResponsavel,
    executarProximaAcao,
  } = useEsteiraLaboratorio();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const trava = useRef(criarTrava());
  const [busy, setBusy] = useState(false);
  const [filterPrioridade, setFilterPrioridade] = useState("all");
  const [filterOrigem, setFilterOrigem] = useState("all");
  const [filterCliente, setFilterCliente] = useState("all");
  const [filterFazenda, setFilterFazenda] = useState("all");
  const [filterProduto, setFilterProduto] = useState("all");
  const [selectedItem, setSelectedItem] = useState<CockpitItem | null>(null);
  const [cqTarget, setCqTarget] = useState<RegistrarCQTarget | null>(null);
  const [loteTarget, setLoteTarget] = useState<GerarLoteTarget | null>(null);
  const [envaseTarget, setEnvaseTarget] = useState<RegistrarEnvaseTarget | null>(null);
  const [reservaTarget, setReservaTarget] = useState<ReservarEstoqueTarget | null>(null);
  const [limit, setLimit] = useState(100);
  // Alertas reconhecidos são persistidos por usuário no banco: marcar como
  // "analisado" sobrevive ao recarregamento da página.
  const { data: analyzedAlerts = [] } = useQuery({
    queryKey: ["cockpit-alertas-reconhecidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cockpit_alertas_reconhecidos" as any)
        .select("alerta_key");
      if (error) throw error;
      return (data ?? []).map((r: any) => r.alerta_key as string);
    },
  });

  const reconhecerAlerta = async (alertaKey: string, osId?: string) => {
    const { error } = await supabase
      .from("cockpit_alertas_reconhecidos" as any)
      .insert({ alerta_key: alertaKey, usuario_id: profile?.user_id ?? undefined, os_id: osId ?? null } as any);
    if (error && !String(error.message).includes("duplicate")) {
      toast.error("Não foi possível registrar o alerta como analisado.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["cockpit-alertas-reconhecidos"] });
  };

  // Filtros/paginação server-side: a busca, prioridade e origem são aplicadas
  // na RPC (sobre TODO o universo autorizado), não apenas na página carregada.
  const listaFiltros = useMemo(
    () => ({
      p_busca: search.trim() || null,
      p_origens: filterOrigem !== "all" ? [filterOrigem] : null,
      p_prioridades: filterPrioridade !== "all" ? [filterPrioridade] : null,
    }),
    [search, filterOrigem, filterPrioridade],
  );

  const { data: listaEsteira, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["cockpit-laboratorio", listaFiltros, limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("rpc_cockpit_listar_esteira_v1", {
        ...listaFiltros,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      if (!data || !Array.isArray(data.items)) throw new Error("Resposta inválida da esteira.");
      return { items: deduplicarEsteira<any>(data.items), total_count: data.total_count };
    },
    refetchInterval: 300000,
  });

  const items = useMemo(() => {
    const data = listaEsteira?.items ?? [];


      return (data as any[]).map(item => {
        // Fonte única: o estágio vem do mapa canônico espelhado de
        // public.fn_cockpit_stage. Sem inferência divergente no frontend.
        const stage = STAGE_COLUMN[cockpitStage(item.status_esteira_oficial)] as KanbanStage;



        return {
          id: item.programacao_id,
          os_id: item.os_id,
          numero_os: item.numero_os || "—",
          origem: item.origem_os,
          cliente: item.cliente_nome || "—",
          fazenda: item.fazenda_nome || "—",
          talhao: item.talhao_nome || "—",
          produto: item.produto_nome || item.microrganismo_nome || "—",
          volume_solicitado: volumeLitros(item.volume_solicitado_l),
          data_programada: item.data_programada,
          prioridade: item.prioridade || "media",
          lote_id: item.lote_id,
          codigo_lote: item.codigo_lote,
          lote_status: item.status_lote,
          cq_resultado: item.cq_resultado,
          entrega_status: item.entrega_status,
          aplicacao_status: item.aplicacao_status,
          stage,
          os_status: item.status_os,
          proxima_acao: item.proxima_acao,
          atrasado: item.atrasado,
          created_at: item.created_at,
          cliente_id: item.cliente_id,
          fazenda_id: item.fazenda_id,
          talhao_id: item.talhao_id,
          produto_id: item.produto_id,
          microrganismo_id: item.microrganismo_id,
          microrganismo_nome: item.microrganismo_nome,
          responsavel_id: item.responsavel_id,
          responsavel_nome: item.responsavel_nome,
          status_esteira_oficial: item.status_esteira_oficial,
          bloqueios: item.bloqueios || [],
          pode_finalizar: item.pode_finalizar,
          titular_nome: item.titular_nome || item.cliente_nome || "—",
          titular_tipo: (item.titular_tipo as any) || (item.cliente_id ? "cliente" : "desconhecido"),
          partner_id: item.partner_id || undefined,
          partner_nome: item.partner_nome || undefined,
          partner_numero: item.partner_numero || undefined,


        } as CockpitItem;
      });
  }, [listaEsteira]);

  const totalFiltrado = Number(listaEsteira?.total_count ?? items.length);


  const { data: history = [], isLoading: historyLoading, isError: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ["esteira-history", selectedItem?.os_id, selectedItem?.status_esteira_oficial],
    enabled: !!selectedItem,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laboratorio_esteira_eventos")
        .select("*")
        .eq("os_id", selectedItem?.os_id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const { laboratorio: metricasReal } = useMetricasOperacionais();
  const performance = metricasReal.data?.temposMedios || { 
    osAteProgramacao: null, 
    programacaoAteLote: null, 
    loteAteCQ: null, 
    envaseAteEntrega: null 
  };


  const totalUniverso = totalFiltrado;
  const filteredItems = useMemo(() => filtrarCockpit(items, {
    cliente: filterCliente, fazenda: filterFazenda, produto: filterProduto, status: filterStatus,
  }), [items, filterCliente, filterFazenda, filterProduto, filterStatus]);

  const { uniqueClientes, uniqueFazendas, uniqueProdutos } = useMemo(() => {
    const clientesMap = new Map();
    const fazendasMap = new Map();
    const produtosMap = new Map();

    items.forEach(item => {
      if (item.cliente_id) clientesMap.set(item.cliente_id, item.cliente);
      // Fazendas e produtos são dependentes do cliente selecionado: evita
      // combinações de filtro que nunca retornam resultado.
      const clienteOk = filterCliente === "all" || item.cliente_id === filterCliente;
      if (clienteOk && item.fazenda_id) fazendasMap.set(item.fazenda_id, item.fazenda);
      if (clienteOk && item.produto_id) produtosMap.set(item.produto_id, item.produto);
      else if (clienteOk && item.microrganismo_id) produtosMap.set(item.microrganismo_id, item.microrganismo_nome || item.produto);
    });

    return {
      uniqueClientes: Array.from(clientesMap.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      uniqueFazendas: Array.from(fazendasMap.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      uniqueProdutos: Array.from(produtosMap.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }, [items, filterCliente]);

  const alerts = useMemo(() => {
    const list: { id: string; type: string; message: string; item?: CockpitItem }[] = [];
    
    filteredItems.forEach(item => {
      if (item.stage === "aguardando" && item.created_at && (new Date().getTime() - new Date(item.created_at).getTime()) > 24 * 60 * 60 * 1000) {
        list.push({ id: `wait-prod-${item.id}`, type: "Produção Lenta", message: `OS ${item.numero_os} aguarda início de produção há mais de 24h.`, item });
      }
      if (item.stage === "em_producao" && item.lote_id && item.lote_status === "em_producao") {
        list.push({ id: `lote-prod-${item.id}`, type: "Lote em Produção", message: `Lote ${item.codigo_lote} (OS ${item.numero_os}) não foi enviado para CQ.`, item });
      }
      if (item.stage === "aguardando_cq") {
        list.push({ id: `cq-${item.id}`, type: "CQ Pendente", message: `OS ${item.numero_os} aguarda resultado laboratorial.`, item });
      }
      if (item.lote_status === "reprovado") {
        list.push({ id: `lote-rep-${item.id}`, type: "Lote Reprovado", message: `OS ${item.numero_os} teve lote reprovado no controle de qualidade.`, item });
      }
      if (item.stage === "aprovado_cq") {
        list.push({ id: `aprov-no-env-${item.id}`, type: "Aguardando Envase", message: `OS ${item.numero_os} aprovada, aguardando envase.`, item });
      }
    });
    return list.filter(a => !analyzedAlerts.includes(a.id));
  }, [filteredItems, analyzedAlerts]);

  // Cards: valores do agregado server-side quando disponível; a contagem local
  // é apenas fallback enquanto a RPC não responde.
  const stats = useMemo(() => {
    const local = {
      demandas: 0, producao: 0, vol_producao: 0, aguardando_cq: 0, vol_cq: 0,
      aprovados: 0, reprovados: 0, envase_pendente: 0, estoque_disp: 0,
      entregas: 0, aplicacoes: 0, atrasadas: 0,
    };
    filteredItems.forEach(item => {
      if (item.stage === "aguardando") local.demandas++;
      if (item.stage === "em_producao") { local.producao++; local.vol_producao += item.volume_solicitado ?? 0; }
      if (item.stage === "aguardando_cq") { local.aguardando_cq += 1; local.vol_cq += item.volume_solicitado ?? 0; }
      if (item.stage === "aprovado_cq") local.aprovados++;
      if (item.lote_status === "reprovado") local.reprovados++;
      if (item.stage === "envase") local.envase_pendente++;
      if (item.stage === "estoque_reserva") local.estoque_disp++;
      if (item.stage === "entrega") local.entregas++;
      if (item.atrasado) local.atrasadas++;
    });

    return { ...local,
      vol_producao: somaVolumes(filteredItems.filter(i => i.stage === "em_producao").map(i => i.volume_solicitado)),
      vol_cq: somaVolumes(filteredItems.filter(i => i.stage === "aguardando_cq").map(i => i.volume_solicitado)),
    };
  }, [filteredItems]);

  // Abrir sheet diretamente quando recebemos ?os=<id>
  useEffect(() => {
    const osParam = searchParams.get("os");
    if (!osParam || items.length === 0) return;
    if (selectedItem?.os_id === osParam) return;
    const found = items.find((i) => i.os_id === osParam);
    if (found) setSelectedItem(found);
  }, [searchParams, items, selectedItem?.os_id]);

  useEffect(() => {
    if (!selectedItem) return;
    const updatedItem = items.find((item) => item.os_id === selectedItem.os_id);
    if (updatedItem) {
      setSelectedItem(updatedItem);
      return;
    }

    if (!isLoading) {
      setSelectedItem(null);
    }
  }, [items, selectedItem?.os_id, isLoading]);

  const refetchCockpit = async () => {
    await qc.invalidateQueries({ queryKey: ["cockpit-laboratorio"] });
  };

  const runStepperAction = async (action: () => Promise<boolean>) => {
    if (!selectedItem || !podeOperar(selectedItem) || isFetching || isError) return;
    await trava.current(async () => {
      setBusy(true);
      try { const success = await action(); await refetchCockpit(); return success; }
      catch { toast.error("Não foi possível concluir. Atualize a esteira antes de tentar novamente."); return false; }
      finally { setBusy(false); }
    });
  };

  const handleAvancarEsteira = async (item: CockpitItem) => {
    if (item.stage === "em_producao" && !item.lote_id) {
      abrirGerarLote(item);
      return;
    }
    if (item.stage === "aguardando_cq") {
      abrirRegistroCQ(item);
      return;
    }
    await executarProximaAcao({
      id: item.id,
      os_id: item.os_id,
      origem: item.origem,
      stage: item.stage === "entrega" && item.status_esteira_oficial === 'entregue' ? "entrega" : item.stage,
    });
  };


  const abrirGerarLote = (item: CockpitItem) => {
    if (item.volume_solicitado === null || item.volume_solicitado <= 0) { toast.error("Volume solicitado indisponível ou inválido."); return; }
    if (item.lote_id) {
      toast.error(`Lote já gerado para esta OS (${item.codigo_lote ?? "—"}).`);
      return;
    }
    if (item.stage !== "em_producao") {
      toast.info("Assuma a produção antes de gerar o lote.");
      return;
    }
    setLoteTarget({
      programacao_id: item.id,
      os_id: item.os_id,
      origem: item.origem,
      numero_os: item.numero_os,
      cliente: item.cliente,
      produto_id: item.produto_id || null,
      microrganismo_id: item.microrganismo_id || null,
      produto_nome: item.microrganismo_nome || item.produto,
      volume_solicitado: item.volume_solicitado,
    });
  };


  const abrirRegistroCQ = (item: CockpitItem) => {
    if (item.stage !== "aguardando_cq" || !podeOperar(item)) return;
    if (!item.lote_id) {
      toast.error("Gere o lote antes de registrar o CQ.");
      return;
    }
    setCqTarget({
      programacao_id: item.id,
      os_id: item.os_id,
      origem: item.origem,
      lote_id: item.lote_id,
      codigo_lote: item.codigo_lote,
      produto: item.produto,
      produto_id: item.produto_id || null,
      microrganismo_id: item.microrganismo_id || null,
    });
  };

  const abrirRegistroEnvase = (item: CockpitItem) => {
    if (!item.lote_id) {
      toast.error("Gere o lote antes de registrar o envase.");
      return;
    }
    if (item.stage !== "envase") {
      toast.info("A OS precisa estar liberada para envase.");
      return;
    }
    setEnvaseTarget({
      programacao_id: item.id,
      os_id: item.os_id,
      origem: item.origem,
      lote_id: item.lote_id,
      codigo_lote: item.codigo_lote,
      produto: item.produto,
      produto_id: item.produto_id || null,
      microrganismo_id: item.microrganismo_id || null,
    });
  };

  const abrirReservaEstoque = async (item: CockpitItem) => {
    if (!item.lote_id) {
      toast.error("Gere o lote antes de reservar estoque.");
      return;
    }
    if (item.stage !== "estoque_reserva") {
      toast.info("Conclua o envase antes de reservar estoque.");
      return;
    }

    // Para OS B2B, busca o partner_order_id real (FK em estoque_produto).
    // Usar item.os_id como partner_order_id quebra a FK
    // estoque_produto_reservado_para_partner_order_id_fkey.
    let partner_order_id: string | undefined;
    if (item.titular_tipo === "parceiro") {
      const { data: osRow } = await supabase
        .from("ordens_servico")
        .select("partner_order_id")
        .eq("id", item.os_id)
        .maybeSingle();
      partner_order_id = (osRow as any)?.partner_order_id ?? undefined;
      if (!partner_order_id) {
        toast.error("Pedido B2B desta OS não encontrado.");
        return;
      }
    }

    setReservaTarget({
      programacao_id: item.id,
      os_id: item.os_id,
      origem: item.origem,
      lote_id: item.lote_id,
      codigo_lote: item.codigo_lote,
      produto: item.produto,
      cliente_id: item.cliente_id,
      cliente_nome: item.titular_tipo === "cliente" ? item.titular_nome : undefined,
      titular_nome: item.titular_nome,
      titular_tipo: item.titular_tipo,
      numero_os: item.numero_os,
      partner_id: item.partner_id,
      partner_order_id,
    });
  };




  const copySummary = async (item: CockpitItem) => {
    const summary = `OS: ${item.numero_os}\nCliente: ${item.cliente}\nProduto: ${item.produto}\nVolume: ${formatVolume(item.volume_solicitado)}\nLote: ${item.codigo_lote || 'N/A'}\nStatus: ${item.stage.replace('_', ' ')}`;
    try { await navigator.clipboard.writeText(summary); toast.success("Resumo copiado!"); }
    catch { toast.error("Não foi possível copiar o resumo."); }
  };

  const renderCard = (item: CockpitItem) => (
    <Card
      key={item.id}
      className="mb-2 border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      role="button" tabIndex={0} aria-label={`Abrir OS ${item.numero_os}`}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedItem(item); } }}
      onClick={() => setSelectedItem(item)}
      style={{ borderLeftColor: item.prioridade === "alta" ? "#ef4444" : item.prioridade === "media" ? "#f59e0b" : "#10b981" }}
    >
      <CardContent className="p-2">
        <div className="flex justify-between items-center mb-1 gap-1">
          <span className="text-[9px] font-bold text-muted-foreground uppercase truncate">{item.numero_os}</span>
          <Badge variant={item.origem === "onfarm" ? "secondary" : "outline"} className="text-[8px] px-1 h-3.5 uppercase shrink-0">{item.origem}</Badge>
        </div>
        <p className="text-xs font-bold leading-tight mb-0.5 truncate text-foreground">{item.produto}</p>
        <p className="text-[10px] text-muted-foreground truncate mb-1.5">{item.titular_nome}</p>
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold">{formatVolume(item.volume_solicitado)}</span>
          <span className={cn("flex items-center gap-1", item.atrasado ? "text-red-500 font-bold" : "text-muted-foreground")}>
            <Calendar className="h-2.5 w-2.5" />
            {item.data_programada ? formatDateDisplay(item.data_programada) : "S/D"}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[8px] h-3.5 bg-primary/5 text-primary border-primary/20 px-1 font-bold">
            {item.status_esteira_oficial?.replace(/_/g, ' ').toUpperCase()}
          </Badge>
          {item.pode_finalizar && (
            <Badge className="text-[8px] h-3.5 bg-emerald-500 text-white border-none px-1">
              PRONTO
            </Badge>
          )}
        </div>
        {item.responsavel_nome && (
          <div className="mt-1 flex items-center gap-1 text-[9px] text-primary truncate">
            <User className="h-2.5 w-2.5 shrink-0" /> <span className="truncate">{item.responsavel_nome.split(' ')[0]}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <PageHeader title="Cockpit Operacional" description="Gestão em tempo real da esteira do laboratório." />
        <Button variant="outline" disabled={isFetching} onClick={() => { void refetch(); void qc.invalidateQueries({ queryKey: ["cockpit-producao-resumo"] }); }}>Atualizar</Button>
      </div>


      {isLoading && <p role="status">Carregando esteira...</p>}
      {isError && <div role="alert">Não foi possível carregar a esteira. <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button></div>}
      <p className="text-xs text-muted-foreground">Indicadores e alertas: OS carregadas no recorte atual. Tempos médios: visão geral.</p>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Demandas", val: formatMetric(stats.demandas, "", 0), icon: ClipboardList, color: "text-slate-600" },
            { label: "Produção", val: `${stats.producao} (${formatMetric(stats.vol_producao, "L")})`, icon: FlaskRound, color: "text-status-producao" },
            { label: "Aguardando CQ", val: formatMetric(stats.vol_cq, "L"), icon: Clock, color: "text-status-cq" },
            { label: "Lotes Reprov.", val: formatMetric(stats.reprovados, "", 0), icon: AlertCircle, color: "text-red-500" },
            { label: "Envases", val: formatMetric(stats.envase_pendente, "", 0), icon: Package, color: "text-orange-500" },
            { label: "Estoque", val: formatMetric(stats.estoque_disp, "", 0), icon: Warehouse, color: "text-blue-500" },
            { label: "Entregas", val: formatMetric(stats.entregas, "", 0), icon: Truck, color: "text-purple-500" },
            { label: "Atrasadas", val: formatMetric(stats.atrasadas, "", 0), icon: AlertTriangle, color: "text-red-600" },

            { label: "OS → Prod", val: formatIntervalToHours(performance.osAteProgramacao), icon: Clock, color: "text-slate-400" },
            { label: "Prod → CQ", val: formatIntervalToHours(performance.programacaoAteLote), icon: Clock, color: "text-slate-400" },
            { label: "CQ → Env", val: formatIntervalToHours(performance.loteAteCQ), icon: Clock, color: "text-slate-400" },
            { label: "Env → Ent", val: formatIntervalToHours(performance.envaseAteEntrega), icon: Clock, color: "text-slate-400" },

          ].map((kpi, i) => (
            <Card key={i} className="border-none shadow-sm"><CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={cn("h-3 w-3", kpi.color)} />
                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">{kpi.label}</p>
              </div>
              <p className="text-xl font-bold">{isLoading || isError ? "—" : kpi.val}</p>
            </CardContent></Card>
          ))}
        </div>
        
        <Card className="bg-orange-50/50 border-orange-100 shadow-none">
          <CardContent className="p-4">
            <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2 text-orange-800 mb-3"><AlertTriangle className="h-3.5 w-3.5" /> Alertas Operacionais</h3>
            <ScrollArea className="h-[120px]">
              {isLoading || isError ? <p>Alertas indisponíveis.</p> : alerts.length > 0 ? alerts.map(a => (
                <div key={a.id} className="flex justify-between items-center text-[10px] bg-background p-2 rounded mb-2 border border-orange-100 shadow-sm group">
                  <div className="flex flex-col flex-1 cursor-pointer" onClick={() => a.item && setSelectedItem(a.item)}>
                    <span className="font-bold text-orange-900">{a.type}</span>
                    <span className="text-muted-foreground line-clamp-1">{a.message}</span>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:bg-green-50" onClick={() => reconhecerAlerta(a.id, a.item?.os_id)}><Check className="h-3 w-3" /></Button>
                </div>
              )) : <div className="text-center py-6 text-orange-600 italic text-[10px]">Nenhum alerta no recorte.</div>}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-center p-3 border rounded-lg bg-background">
        <div className="relative w-full lg:w-1/3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Buscar OS, cliente ou lote" placeholder="Buscar OS, cliente, lote..." className="pl-9 h-9 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <p className="text-[11px] text-muted-foreground whitespace-nowrap" aria-live="polite">
          Mostrando <span className="font-semibold">{filteredItems.length}</span> de{" "}
          <span className="font-semibold">{totalUniverso || items.length}</span> OS
        </p>
        <div className="flex flex-wrap gap-2 w-full lg:flex-1 justify-end">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger aria-label="Filtrar por status" className="h-9 min-w-0 flex-1 basis-[145px] sm:flex-none sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os status</SelectItem>{Array.from(new Set(items.map(i => i.status_esteira_oficial).filter(Boolean))).sort().map(status => <SelectItem key={status} value={status}>{status.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterOrigem} onValueChange={setFilterOrigem}>
            <SelectTrigger aria-label="Filtrar por origem" className="h-9 min-w-0 flex-1 basis-[145px] text-xs sm:flex-none sm:w-[170px]"><SelectValue placeholder="Origem" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todas as origens</SelectItem><SelectItem value="manual">Manual</SelectItem><SelectItem value="onfarm">On-Farm</SelectItem></SelectContent>
          </Select>
          <Select value={filterPrioridade} onValueChange={setFilterPrioridade}>
            <SelectTrigger aria-label="Filtrar por prioridade" className="h-9 min-w-0 flex-1 basis-[145px] text-xs sm:flex-none sm:w-[180px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todas as prioridades</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="baixa">Baixa</SelectItem></SelectContent>
          </Select>
          <Select value={filterCliente} onValueChange={value => { setFilterCliente(value); setFilterFazenda("all"); setFilterProduto("all"); }}>
            <SelectTrigger aria-label="Filtrar por cliente" className="h-9 min-w-0 flex-1 basis-[145px] text-xs truncate sm:flex-none sm:w-[150px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Clientes</SelectItem>
              {uniqueClientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterFazenda} onValueChange={setFilterFazenda}>
            <SelectTrigger aria-label="Filtrar por fazenda" className="h-9 min-w-0 flex-1 basis-[145px] text-xs truncate sm:flex-none sm:w-[150px]"><SelectValue placeholder="Fazenda" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Fazendas</SelectItem>
              {uniqueFazendas.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterProduto} onValueChange={setFilterProduto}>
            <SelectTrigger aria-label="Filtrar por produto" className="h-9 min-w-0 flex-1 basis-[145px] text-xs truncate sm:flex-none sm:w-[150px]"><SelectValue placeholder="Produto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Produtos</SelectItem>
              {uniqueProdutos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => { 
            setFilterStatus("all"); setSearch(""); setFilterPrioridade("all"); setFilterOrigem("all"); 
            setFilterCliente("all"); setFilterFazenda("all"); setFilterProduto("all"); 
          }}>Limpar</Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden mt-2">
        <Tabs defaultValue="fluxo" className="h-full flex flex-col">
          <div className="px-4 border-b bg-background">
            <TabsList className="h-auto w-full flex flex-wrap justify-start bg-muted/50 mb-[-1px]">
              <TabsTrigger value="fluxo" className="flex items-center gap-2 py-2">
                <Target className="h-4 w-4" /> <span>Fluxo de Produção</span>
              </TabsTrigger>
              <TabsTrigger value="pendencias" className="flex items-center gap-2 py-2">
                <AlertTriangle className="h-4 w-4" /> 
                <span>Pendências</span>
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                  {isLoading || isError ? "—" : alerts.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="producao" className="flex items-center gap-2 py-2">
                <Warehouse className="h-4 w-4" /> <span>Produção & Estoque</span>
              </TabsTrigger>
            </TabsList>

          </div>

          <TabsContent value="fluxo" className="flex-1 overflow-hidden m-0 p-0">
            <div className="flex flex-col h-full">
              <div className="hidden lg:flex flex-1 overflow-x-auto gap-3 p-4 scrollbar-thin bg-slate-50/50">
                {STAGES.map(s => {
                  const stageItems = filteredItems.filter(i => i.stage === s.id);
                  return (
                    <div key={s.id} className="min-w-[200px] w-[200px] shrink-0 flex flex-col h-full">
                      <div className={cn("p-2 rounded-t-lg border-b-2 font-bold text-[10px] uppercase mb-2 flex justify-between items-center gap-1", s.color)}>
                        <div className="flex items-center gap-1.5 min-w-0"><s.icon className="h-3 w-3 shrink-0" /> <span className="truncate">{s.title}</span></div>
                        <Badge variant="secondary" className="bg-white/50 text-[9px] h-4 shrink-0">{stageItems.length}</Badge>
                      </div>
                      <ScrollArea className="flex-1">
                        <div className="space-y-2 pb-4">
                          {stageItems.map(i => renderCard(i))}
                          {stageItems.length === 0 && <div className="min-h-14 border-2 border-dashed rounded-lg flex items-center justify-center p-2 text-center text-muted-foreground text-[9px] italic">Nenhuma OS nesta etapa com os filtros atuais</div>}
                        </div>
                      </ScrollArea>
                    </div>
                  );
                })}
              </div>

              <div className="lg:hidden p-4 overflow-y-auto h-full">
                <Tabs defaultValue="aguardando" className="w-full">
                  <TabsList aria-label="Etapas da produção" className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/50 p-1 mb-4 sm:grid-cols-3">
                    {STAGES.map(s => (
                      <TabsTrigger key={s.id} value={s.id} className="min-h-11 whitespace-normal px-2 py-2 text-[10px] leading-tight uppercase font-bold">
                        {s.mobileLabel} ({filteredItems.filter(i => i.stage === s.id).length})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {STAGES.map(s => (
                    <TabsContent key={s.id} value={s.id} className="space-y-3 pb-20">
                      {filteredItems.filter(i => i.stage === s.id).map(item => renderCard(item))}
                      {filteredItems.filter(i => i.stage === s.id).length === 0 && <div className="text-center p-10 text-muted-foreground italic text-sm">Nenhuma OS nesta etapa com os filtros atuais</div>}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pendencias" className="flex-1 overflow-auto bg-slate-50 p-4 m-0">
            <PendenciasInconsistenciasTab />
          </TabsContent>

          <TabsContent value="producao" className="flex-1 overflow-auto bg-slate-50 p-4 m-0">
            <ProducaoResumoTab />
          </TabsContent>

        </Tabs>
      </div>

      {(listaEsteira?.items.length ?? 0) < totalFiltrado && (
        <div className="flex justify-center mt-6"><Button variant="outline" disabled={isFetching} onClick={() => setLimit(prev => prev + 100)}>Carregar Mais</Button></div>
      )}

      <Sheet open={!!selectedItem} onOpenChange={(o) => {
        if (!o) {
          setSelectedItem(null);
          if (searchParams.get("os")) {
            const next = new URLSearchParams(searchParams);
            next.delete("os");
            setSearchParams(next, { replace: true });
          }
        }
      }}>
        <SheetContent className="sm:max-w-xl w-full p-0">
          {selectedItem && (
            <div className="flex flex-col h-full bg-slate-50/30">
              <SheetHeader className="p-6 border-b bg-white">
                <div className="flex justify-between items-start mb-2">
                  <Badge className={cn("text-[9px] font-bold uppercase tracking-wider px-2", selectedItem.prioridade === 'alta' ? 'bg-red-500' : 'bg-blue-500')}>Prioridade {selectedItem.prioridade}</Badge>
                  <button
                    onClick={() => navigate(`/ordens-servico?id=${selectedItem.os_id}`)}
                    className="text-[10px] font-mono font-bold text-slate-400 hover:text-primary inline-flex items-center gap-1 transition-colors"
                  >
                    {selectedItem.numero_os} <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
                <SheetTitle className="text-2xl font-bold tracking-tight">{selectedItem.produto}</SheetTitle>
                <SheetDescription className="flex items-center gap-3 text-xs font-medium">
                  <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-primary" /> {selectedItem.titular_nome}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" /> {selectedItem.fazenda}</span>
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="flex-1 p-6">
                <Tabs defaultValue="esteira" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6 h-11 bg-slate-100/50 p-1">
                    <TabsTrigger value="esteira" className="flex items-center gap-2 text-xs"><ClipboardList className="h-3.5 w-3.5" /> Esteira</TabsTrigger>
                    <TabsTrigger value="history" className="flex items-center gap-2 text-xs"><History className="h-3.5 w-3.5" /> Timeline</TabsTrigger>
                  </TabsList>
                  <TabsContent value="esteira" className="space-y-4">
                    {/* Resumo de produção — "O que produzir" */}
                    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Resumo de produção</p>

                      {/* Linha 1: volume + produto + lote/CQ */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-lg font-bold text-foreground">{formatVolume(selectedItem.volume_solicitado)}</span>
                        <span className="text-sm text-muted-foreground">·</span>
                        <span className="text-sm font-semibold text-foreground truncate">
                          {selectedItem.microrganismo_nome || selectedItem.produto}
                        </span>
                        <div className="ml-auto flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            Lote: {selectedItem.codigo_lote || "—"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold uppercase",
                              selectedItem.cq_resultado === "aprovado" && "border-green-500 text-green-600",
                              selectedItem.cq_resultado === "reprovado" && "border-red-500 text-red-600",
                            )}
                          >
                            CQ {selectedItem.cq_resultado || "—"}
                          </Badge>
                        </div>
                      </div>

                      {selectedItem.volume_solicitado !== null && <ComposicaoProducaoCard
                        osId={selectedItem.os_id}
                        produtoId={selectedItem.produto_id}
                        microrganismoFallback={selectedItem.microrganismo_id ? { id: selectedItem.microrganismo_id, nome: selectedItem.microrganismo_nome ?? selectedItem.produto } : null}
                        volumeTotalL={selectedItem.volume_solicitado}
                      />}

                      {/* Linha 2: meta inline editável */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5 text-[11px] font-semibold">
                              <Calendar className="h-3 w-3 text-primary" />
                              {selectedItem.data_programada ? formatDateDisplay(selectedItem.data_programada) : 'Definir data'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={selectedItem.data_programada ? new Date(`${selectedItem.data_programada.slice(0, 10)}T12:00:00`) : undefined}
                              onSelect={(date) => {
                                if (!date) return;
                                const dataISO = format(date, 'yyyy-MM-dd');
                                // Antes da produção, definir a data também programa a OS
                                // (aberta → aprovada → programada) via motor transacional.
                                if (selectedItem.stage === "aguardando") {
                                  programarProducao(selectedItem.os_id, selectedItem.origem, dataISO);
                                } else {
                                  atualizarDataProgramada(selectedItem.id, dataISO);
                                }
                              }}

                              locale={ptBR}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>

                        <span className="text-muted-foreground">·</span>

                        <Select
                          value={selectedItem.prioridade}
                          onValueChange={(val) => atualizarPrioridade(selectedItem.os_id, selectedItem.origem, val)}
                        >
                          <SelectTrigger aria-label="Alterar prioridade da OS" className="h-7 w-auto gap-1.5 px-2 text-[11px] font-bold border-none bg-transparent shadow-none focus:ring-0">
                            <Star className="h-3 w-3" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="alta" className="text-red-600 font-bold">ALTA</SelectItem>
                            <SelectItem value="media" className="text-amber-600 font-bold">MÉDIA</SelectItem>
                            <SelectItem value="baixa" className="text-green-600 font-bold">BAIXA</SelectItem>
                          </SelectContent>
                        </Select>

                        <span className="text-muted-foreground">·</span>

                        <Select
                          value={selectedItem.responsavel_id || "none"}
                          onValueChange={(val) => val !== "none" && vincularResponsavel(selectedItem.id, val)}
                          disabled={!canEditResponsavel || busy}
                        >
                          <SelectTrigger aria-label="Alterar responsável pela produção" className="h-7 w-auto gap-1.5 px-2 text-[11px] font-semibold border-none bg-transparent shadow-none focus:ring-0 disabled:opacity-100">
                            <UserPlus className="h-3 w-3" />
                            <SelectValue placeholder="Não atribuído" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Não atribuído</SelectItem>
                            {profiles.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.nome || p.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>


                        <span className="text-muted-foreground">·</span>

                        <span className="inline-flex items-center gap-1 px-2 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {selectedItem.talhao}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-white p-4">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-3">Passo a passo da esteira</p>
                      <EsteiraStepper
                        disabled={busy || isFetching || isError || !podeOperar(selectedItem)}
                        item={{
                          id: selectedItem.id,
                          os_id: selectedItem.os_id,
                          numero_os: selectedItem.numero_os,
                          origem: selectedItem.origem,
                          stage: selectedItem.stage,
                          os_status: selectedItem.os_status,
                          lote_id: selectedItem.lote_id,
                          codigo_lote: selectedItem.codigo_lote,
                          cq_resultado: selectedItem.cq_resultado,
                          entrega_status: selectedItem.entrega_status,
                          aplicacao_status: selectedItem.aplicacao_status,
                        }}
                        handlers={{
                          onAssumirProducao: () => runStepperAction(() => assumirProducao(selectedItem.id, selectedItem.os_id, selectedItem.origem)),
                          onGerarLote: () => abrirGerarLote(selectedItem),
                          onEnviarParaCQ: () => runStepperAction(() => enviarParaCQ(selectedItem.id, selectedItem.os_id, selectedItem.origem)),
                          onRegistrarCQ: () => abrirRegistroCQ(selectedItem),
                          onEnviarParaEnvase: () => runStepperAction(() => enviarParaEnvase(selectedItem.id, selectedItem.os_id, selectedItem.origem)),
                          onConcluirEnvase: () => abrirRegistroEnvase(selectedItem),
                          onReservarEstoque: () => abrirReservaEstoque(selectedItem),
                        }}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="history" className="space-y-6">
                    <div className="relative pl-6 border-l-2 border-slate-200 space-y-8 ml-3 py-2">
                       {historyLoading ? <p role="status">Carregando histórico...</p> : historyError ? <div role="alert">Histórico indisponível. <Button onClick={() => void refetchHistory()}>Tentar novamente</Button></div> : history.length > 0 ? history.map((event: any) => (
                        <div key={event.id} className="relative">
                          <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-primary border-4 border-background" />
                          <div>
                            <p className="text-sm font-bold text-foreground">{(event.acao || '—').replace(/_/g, ' ').toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground mb-1">{timestampBrasilia(event.created_at)}</p>
                            {event.observacao && <p className="text-[11px] bg-muted/50 p-2 rounded italic text-muted-foreground">"{event.observacao}"</p>}
                          </div>
                        </div>
                      )) : (
                        <div className="text-center p-10 text-muted-foreground text-sm italic">Nenhum evento registrado.</div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </ScrollArea>
              
              {selectedItem && (
                <div className="p-6 border-t bg-white mt-auto">
                  <FinalizarOSButton 
                    osId={selectedItem.os_id}
                    origem={selectedItem.origem}
                    podeFinalizar={selectedItem.pode_finalizar && podeOperar(selectedItem) && !busy && !isFetching && !isError}
                    bloqueios={selectedItem.bloqueios}
                    className="w-full h-12 text-base"
                    onSuccess={() => {
                      setSelectedItem(null);
                      qc.invalidateQueries({ queryKey: ["cockpit-laboratorio"] });
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <RegistrarCQDialog
        open={!!cqTarget}
        onOpenChange={(o) => !o && setCqTarget(null)}
        target={cqTarget}
      />

      <GerarLoteDialog
        open={!!loteTarget}
        onOpenChange={(o) => !o && setLoteTarget(null)}
        target={loteTarget}
        onCreated={() => qc.invalidateQueries({ queryKey: ["cockpit-laboratorio"] })}
      />

      <RegistrarEnvaseDialog
        open={!!envaseTarget}
        onOpenChange={(o) => !o && setEnvaseTarget(null)}
        target={envaseTarget}
      />

      <ReservarEstoqueDialog
        open={!!reservaTarget}
        onOpenChange={(o) => !o && setReservaTarget(null)}
        target={reservaTarget}
      />
    </div>
  );
}