import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Truck, X, FileDown, CheckCircle } from "lucide-react";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateDisplay } from "@/lib/date-utils";
import type { Tables } from "@/integrations/supabase/cultivofarm.types";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { gerarDocumentoEntregaPDF, rotuloAcaoDocumento, possuiComprovanteDefinitivo, deveReemitirNoDownload, REEMISSAO_NA_ABERTURA_DO_PREVIEW } from "@/lib/comprovanteEntregaPdf";

const ERROS_COMPROVANTE: Record<string, string> = {
  COMPROVANTE_UNAUTHENTICATED: "Sessão expirada. Entre novamente para emitir o documento.",
  COMPROVANTE_FORBIDDEN: "Seu perfil não tem permissão para emitir documentos de entrega.",
  COMPROVANTE_PARAMS_INVALIDOS: "Não foi possível identificar a entrega. Recarregue a lista e tente novamente.",
  COMPROVANTE_ENTREGA_NAO_ENCONTRADA: "Entrega não encontrada.",
  COMPROVANTE_ENTREGA_CANCELADA: "Entrega cancelada não gera documento.",
  COMPROVANTE_SEM_ITENS: "A entrega não possui itens vinculados.",
  COMPROVANTE_PRODUTO_OBRIGATORIO: "Vincule o produto à entrega antes de emitir o comprovante.",
  COMPROVANTE_LOTE_OBRIGATORIO: "Vincule o lote à entrega antes de emitir o comprovante.",
  COMPROVANTE_QUANTIDADE_OBRIGATORIA: "Informe a quantidade entregue antes de emitir o comprovante.",
  COMPROVANTE_CLIENTE_OBRIGATORIO: "Vincule o cliente à entrega antes de emitir o comprovante.",
  COMPROVANTE_CONFIRMACAO_SEM_DATA: "Confirme o recebimento antes de emitir o comprovante.",
  COMPROVANTE_OS_OBRIGATORIA:
    "Vincule a entrega a uma OS, OS On-Farm ou pedido de parceiro legítimo antes de emitir o comprovante definitivo.",
  COMPROVANTE_VOLUME_OBRIGATORIO:
    "O volume total da entrega precisa estar preenchido e ser maior que zero para emitir o comprovante.",
};

function traduzErroComprovante(msg: string): string {
  const chave = Object.keys(ERROS_COMPROVANTE).find((k) => msg.includes(k));
  return chave ? ERROS_COMPROVANTE[chave] : msg;
}
import { validatePhoneBR } from "@/lib/masks";
import { useAuth } from "@/hooks/useAuth";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmarEntregaFinanceiroDialog } from "@/components/financeiro/ConfirmarEntregaFinanceiroDialog";
import { ConfirmarEntregaDialog } from "@/components/entregas/ConfirmarEntregaDialog";
import { EntregaComprovantePanel } from "@/components/entregas/EntregaComprovantePanel";
import { TermoEntregaPanel } from "@/components/entregas/TermoEntregaPanel";
import { EmbalagensEntregaPanel } from "@/components/estoque/EmbalagensEntregaPanel";
import { operarEstoque, chaveIdempotencia, mensagemErroEstoque } from "@/lib/estoque/motorEstoque";
import { FileText } from "lucide-react";
import { formatOS, formatOSFromId } from "@/lib/osLabel";
import { getClienteLabel, getClienteFullLabel } from "@/lib/clienteLabel";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { SeletorLoteEnvasado } from "@/components/entregas/SeletorLoteEnvasado";
import { RegistrarEntregaDialog, type RegistrarEntregaSubmit } from "@/components/entregas/RegistrarEntregaDialog";
import { PreviewDocumentoEntrega } from "@/components/entregas/PreviewDocumentoEntrega";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  separado: { label: "Separado", variant: "secondary" },
  em_rota: { label: "Em Rota", variant: "default" },
  entregue: { label: "Entregue", variant: "outline" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};


export default function Entregas() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { config: brandingConfig, defaults: brandingDefaults } = useSystemConfig();
  const { role } = useAuth();
  const canCancel = role === "administrador" || role === "gestor" || role === "administrativo";
  const [open, setOpen] = useState(false);
  const [osInicial, setOsInicial] = useState<string | undefined>(undefined);
  const [searchParams, setSearchParams] = useSearchParams();

  // Ao chegar via cockpit (/entregas?os=<id>), abre o dialog já pré-selecionando a OS.
  // Só limpa o parâmetro quando o dialog é fechado (evita perder contexto se o usuário fechar por engano).
  useEffect(() => {
    const osParam = searchParams.get("os");
    if (!osParam) return;
    setOsInicial(osParam);
    setOpen(true);
  }, [searchParams]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [comprovanteEntrega, setComprovanteEntrega] = useState<any>(null);
  const [previewPayload, setPreviewPayload] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSnapshotAntes, setPreviewSnapshotAntes] = useState(false);
  const [previewEntregaId, setPreviewEntregaId] = useState<string | null>(null);
  // Guarda contra duplo clique no download: impede contabilizar duas reemissões.
  const [downloadingPreview, setDownloadingPreview] = useState(false);
  const [financialConfirmOpen, setFinancialConfirmOpen] = useState(false);
  const [confirmEntregaOpen, setConfirmEntregaOpen] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("");
  const { criarEntrega, reservarEstoque: hookReservarEstoque, cancelarReservaEstoque } = useEsteiraLaboratorio();
  const [form, setForm] = useState({
    estoque_produto_id: "",
    ordem_servico_id: "",
    motorista: "",
    veiculo: "",
    data_saida: "",
    quantidade_entregue: "",
  });


  // Filtros BI
  const [filtroInicio, setFiltroInicio] = useState("");
  const [filtroFim, setFiltroFim] = useState("");
  const [filtroProduto, setFiltroProduto] = useState("todos");

  const {
    data: entregas = [],
    isLoading: entregasLoading,
    isError: entregasErro,
    refetch: recarregarEntregas,
    isFetching: entregasFetching,
  } = useQuery({
    queryKey: ["entregas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entregas")
        .select(`
          *,
          clientes(nome, codigo_cliente),
          ordens_servico(id, numero_os),
          ordens_servico_onfarm(id, numero_os),
          produtos(id, nome),
          lotes(
            id,
            codigo_lote,
            envase(volume_por_unidade, data_envase)
          ),
          entrega_comprovantes!entrega_comprovantes_entrega_id_fkey(
            id,
            tipo,
            numero_formulario,
            metadata,
            gerado_em
          )
        `)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  // Catálogo de produtos para filtro (com entregas existentes)
  const produtosFiltro = useMemo(() => {
    const map = new Map<string, string>();
    (entregas as any[]).forEach((e) => {
      if (e.produto_id && e.produtos?.nome) map.set(e.produto_id, e.produtos.nome);
    });
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
  }, [entregas]);

  // Aplica filtros
  const entregasFiltradas = useMemo(() => {
    return (entregas as any[]).filter((e) => {
      const ref = e.data_saida || e.created_at?.split("T")[0];
      if (filtroInicio && ref < filtroInicio) return false;
      if (filtroFim && ref > filtroFim) return false;
      if (filtroProduto !== "todos" && e.produto_id !== filtroProduto) return false;
      return true;
    });
  }, [entregas, filtroInicio, filtroFim, filtroProduto]);

  // Mapa de grupos de entrega (qtde de itens por grupo)
  const gruposMap = useMemo(() => {
    const m = new Map<string, number>();
    (entregas as any[]).forEach((e) => {
      if (e.grupo_entrega_id) m.set(e.grupo_entrega_id, (m.get(e.grupo_entrega_id) || 0) + 1);
    });
    return m;
  }, [entregas]);

  // KPIs (apenas entregas concluídas para volume realizado)
  const kpis = useMemo(() => {
    const total = entregasFiltradas.length;
    const concluidas = entregasFiltradas.filter((e) => e.status === "entregue");
    const volumeL =
      concluidas.reduce((acc, e) => acc + (Number(e.volume_entregue_ml) || 0), 0) / 1000;
    const osDistintas = new Set(concluidas.map((e) => e.ordem_servico_id)).size;
    return { total, volumeL, osDistintas };
  }, [entregasFiltradas]);

  // Itens de estoque já envasados, prontos para entrega
  const {
    data: itensProntos = [],
    isLoading: estoqueLoading,
    isError: estoqueErro,
    refetch: recarregarEstoque,
    isFetching: estoqueFetching,
  } = useQuery({
    queryKey: ["estoque-prontos-entrega"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estoque_produto")
        .select(`
          id, status, quantidade, quantidade_reservada, volume_total, validade,
          reservado_para_os_id, reservado_para_os_tipo, reservado_para_cliente_id,
          produto_id, microrganismo_id, lote_id,
          produtos(id, nome),
          microrganismos(id, nome, nome_cientifico),
          lotes(id, codigo_lote, programacao_id, programacao_producao:programacao_id(ordem_servico_id, ordem_servico_onfarm_id), envase(id, data_envase, quantidade, tipo_embalagem)),
          cliente_reservado:clientes!estoque_produto_reservado_para_cliente_id_fkey(id, nome)
        `)
        .in("status", ["disponivel", "reservado"])
        .order("created_at", { ascending: false });

      if (error) {
        // Tentativa sem o vínculo de cliente reservado (relação opcional).
        // Se também falhar, o erro sobe: lista vazia jamais mascara falha.
        const { data: d2, error: e2 } = await supabase
          .from("estoque_produto")
          .select(`
            id, status, quantidade, quantidade_reservada, volume_total, validade,
            reservado_para_os_id, reservado_para_os_tipo, reservado_para_cliente_id,
            produto_id, microrganismo_id, lote_id,
            produtos(id, nome),
            microrganismos(id, nome, nome_cientifico),
            lotes(id, codigo_lote, programacao_id, programacao_producao:programacao_id(ordem_servico_id, ordem_servico_onfarm_id), envase(id, data_envase, quantidade, tipo_embalagem))
          `)
          .in("status", ["disponivel", "reservado"])
          .order("created_at", { ascending: false });
        if (e2) throw e2;
        return d2 || [];
      }
      return data || [];
    },
  });


  const { data: todasOS = [] } = useQuery({
    queryKey: ["todas-os-disponiveis"],
    queryFn: async () => {
      const [osPadrone, osOnFarm] = await Promise.all([
        supabase.from("ordens_servico").select("id, numero_os, status, cliente_id, origem, partner_order_id, clientes(nome, codigo_cliente), produtos(nome), data_programada, partner_orders:partner_order_id(numero, partner_id, partner_accounts:partner_id(codigo, nome_fantasia, razao_social))"),
        supabase.from("ordens_servico_onfarm").select("id, numero_os, status, cliente_id, clientes(nome, codigo_cliente), produtos(nome), data_recomendada"),
      ]);
      const p = (osPadrone.data || []).map((o) => ({ ...o, type: "padrao", data: o.data_programada }));
      const f = (osOnFarm.data || []).map((o) => ({ ...o, type: "onfarm", data: o.data_recomendada }));
      return [...p, ...f];
    },
  });

  const clienteIdsExtra = useMemo(() => {
    const ids = new Set<string>();
    (itensProntos as any[]).forEach((it) => {
      if (it.reservado_para_cliente_id && !it.cliente_reservado) ids.add(it.reservado_para_cliente_id);
    });
    return Array.from(ids);
  }, [itensProntos]);

  const { data: clientesExtra = [] } = useQuery({
    queryKey: ["entregas-clientes-extra", clienteIdsExtra],
    enabled: clienteIdsExtra.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, nome, codigo_cliente").in("id", clienteIdsExtra);
      return data || [];
    },
  });

  // Busca dados amigáveis das OS reservadas (numero_os, cliente, produto)
  const osReservadasIds = useMemo(() => {
    const padrao = new Set<string>();
    const onfarm = new Set<string>();
    (itensProntos as any[]).forEach((it) => {
      if (!it.reservado_para_os_id) return;
      if (it.reservado_para_os_tipo === "onfarm") onfarm.add(it.reservado_para_os_id);
      else padrao.add(it.reservado_para_os_id);
    });
    return { padrao: Array.from(padrao), onfarm: Array.from(onfarm) };
  }, [itensProntos]);

  const { data: osReservadasMap = {} } = useQuery({
    queryKey: ["entregas-os-reservadas", osReservadasIds],
    enabled: osReservadasIds.padrao.length + osReservadasIds.onfarm.length > 0,
    queryFn: async () => {
      const map: Record<string, { numero_os?: string | null; cliente?: any; produto?: any; partner_orders?: any; type: string }> = {};
      if (osReservadasIds.padrao.length) {
        const { data } = await supabase
          .from("ordens_servico")
          .select("id, numero_os, clientes(id, nome, codigo_cliente), produtos(id, nome), partner_order_id, partner_orders:partner_order_id(numero, partner_id, partner_accounts:partner_id(codigo, nome_fantasia, razao_social))")
          .in("id", osReservadasIds.padrao);
        (data || []).forEach((o: any) => { map[o.id] = { numero_os: o.numero_os, cliente: o.clientes, produto: o.produtos, partner_orders: o.partner_orders, type: "padrao" }; });
      }
      if (osReservadasIds.onfarm.length) {
        const { data } = await supabase
          .from("ordens_servico_onfarm")
          .select("id, numero_os, clientes(id, nome, codigo_cliente), produtos(id, nome)")
          .in("id", osReservadasIds.onfarm);
        (data || []).forEach((o: any) => { map[o.id] = { numero_os: o.numero_os, cliente: o.clientes, produto: o.produtos, type: "onfarm" }; });
      }
      return map;
    },
  });


  // Soma de quantidade já entregue/em entrega por item de estoque
  // Agrupamento de entregas por item para calcular saldos
  const entregasResumo = useMemo(() => {
    const pendentes = new Map<string, number>();
    const total = new Map<string, number>();
    
    (entregas as any[]).forEach((e) => {
      if (!e.estoque_produto_id || e.status === "cancelada") return;
      
      const qtd = Number(e.quantidade_entregue) || 0;
      total.set(e.estoque_produto_id, (total.get(e.estoque_produto_id) || 0) + qtd);
      
      if (e.status !== "entregue") {
        pendentes.set(e.estoque_produto_id, (pendentes.get(e.estoque_produto_id) || 0) + qtd);
      }
    });
    
    return { pendentes, total };
  }, [entregas]);

  const itensSelecionaveis = useMemo(() => {
    return (itensProntos as any[])
      .map((it) => {
        const env = it.lotes?.envase;
        const hasEnvase = Array.isArray(env) ? env.length > 0 : !!env;
        if (!hasEnvase) return null;
        const envase = Array.isArray(env)
          ? env.sort((a: any, b: any) => (b.data_envase || "").localeCompare(a.data_envase || ""))[0]
          : env;
        const qtdTotal = Number(it.quantidade ?? envase?.quantidade ?? 0);
        const jaEntreguePendente = entregasResumo.pendentes.get(it.id) || 0;
        const jaEntregueTotal = entregasResumo.total.get(it.id) || 0;
        
        // Saldo físico: quantidade atual no banco - o que já está em entregas pendentes
        const saldoFisico = Math.max(0, qtdTotal - jaEntreguePendente);
        if (saldoFisico <= 0) return null;
        
        // Saldo da reserva: quantidade_reservada original - o que já foi/está sendo entregue
        const qtdReservada = Number(it.quantidade_reservada || 0);
        const saldoReserva = it.status === "reservado" && qtdReservada > 0 
          ? Math.max(0, qtdReservada - jaEntregueTotal) 
          : saldoFisico;

        const osInfo = it.reservado_para_os_id ? (osReservadasMap as any)[it.reservado_para_os_id] : null;
        const microNome = it.microrganismos
          ? (it.microrganismos.nome_cientifico
              ? `${it.microrganismos.nome_cientifico}${it.microrganismos.nome ? ` — ${it.microrganismos.nome}` : ""}`
              : it.microrganismos.nome)
          : null;
        const produtoLabel = it.produtos?.nome || osInfo?.produto?.nome || microNome || "—";

        const clienteNome =
          getClienteLabel(it.cliente_reservado) ||
          getClienteLabel((clientesExtra as any[]).find((c) => c.id === it.reservado_para_cliente_id)) ||
          getClienteLabel(osInfo?.cliente) ||
          null;

        const osLabel = it.reservado_para_os_id
          ? formatOS({ numero_os: osInfo?.numero_os, id: it.reservado_para_os_id })
          : null;

        const prog = it.lotes?.programacao_producao;
        const osOrigemId = prog?.ordem_servico_id ?? prog?.ordem_servico_onfarm_id ?? null;
        const osOrigemTipo = prog?.ordem_servico_id
          ? "padrao"
          : prog?.ordem_servico_onfarm_id
          ? "onfarm"
          : null;

        return {
          ...it,
          _envase: envase,
          _cliente_nome: clienteNome,
          _produto_label: produtoLabel,
          _os_label: osLabel,
          _os_origem_id: osOrigemId,
          _os_origem_tipo: osOrigemTipo,
          _saldo: saldoFisico,
          _saldo_reserva: saldoReserva,
          _ja_entregue: jaEntregueTotal,
          _qtd_total: qtdTotal
        };
      })
      .filter(Boolean);
  }, [itensProntos, clientesExtra, entregasResumo, osReservadasMap]);


  const itemSelecionado: any = itensSelecionaveis.find((i: any) => i.id === form.estoque_produto_id);
  const qtdParaEntregar = Number(form.quantidade_entregue) || 0;
  const volumePorUnidade = itemSelecionado?._envase?.volume_por_unidade ?? null;

  // Realtime: invalida lista de itens ao receber updates do estoque (reservas concorrentes refletem na hora)
  useEffect(() => {
    let timerEstoque: ReturnType<typeof setTimeout> | null = null;
    let timerEntregas: ReturnType<typeof setTimeout> | null = null;
    const invalidateEstoque = () => {
      if (timerEstoque) clearTimeout(timerEstoque);
      timerEstoque = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["estoque-prontos-entrega"] });
      }, 1200);
    };
    const invalidateEntregas = () => {
      if (timerEntregas) clearTimeout(timerEntregas);
      timerEntregas = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["entregas"] });
        queryClient.invalidateQueries({ queryKey: ["estoque-prontos-entrega"] });
      }, 1200);
    };
    const channel = supabase
      .channel("entregas-estoque-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "estoque_produto" }, invalidateEstoque)
      .on("postgres_changes", { event: "*", schema: "public", table: "entregas" }, invalidateEntregas)
      .subscribe();
    return () => {
      if (timerEstoque) clearTimeout(timerEstoque);
      if (timerEntregas) clearTimeout(timerEntregas);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);


  // Helper: registra tentativa de reserva em auditoria (best-effort, nunca bloqueia o fluxo)
  const auditarReserva = async (payload: {
    item: any;
    osId: string | null;
    osTipo: string | null;
    clienteId: string | null;
    resultado: "sucesso" | "conflito_concorrencia" | "saldo_insuficiente" | "erro";
    motivo: string;
    entregaId?: string | null;
    snapshot?: { status?: string; reservado_para_os_id?: string | null; reservado_por?: string | null };
  }) => {
    try {
      await supabase.from("reservas_auditoria" as any).insert({
        estoque_produto_id: payload.item?.id ?? null,
        lote_id: payload.item?.lote_id ?? null,
        envase_id: payload.item?._envase?.id ?? null,
        ordem_servico_id: payload.osId,
        os_tipo: payload.osTipo,
        cliente_id: payload.clienteId,
        entrega_id: payload.entregaId ?? null,
        quantidade_solicitada: qtdParaEntregar || null,
        resultado: payload.resultado,
        motivo: payload.motivo,
        status_estoque_no_momento: payload.snapshot?.status ?? payload.item?.status ?? null,
        reservado_para_os_id_existente: payload.snapshot?.reservado_para_os_id ?? null,
        reservado_por_existente: payload.snapshot?.reservado_por ?? null,
      });
    } catch (err) {
      console.warn("[auditarReserva] falha ao gravar auditoria:", err);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (payload: RegistrarEntregaSubmit) => {
      const { grupoId, itens, osId, osTipo, tipo_entrega, motorista, veiculo, data_saida,
        motorista_telefone, motorista_documento, veiculo_placa, veiculo_tipo,
        hora_saida_prevista, data_chegada_prevista, hora_chegada_prevista,
        destinatario_nome, destinatario_telefone, destinatario_whatsapp,
        endereco_origem, endereco_logradouro, endereco_numero, endereco_complemento,
        endereco_bairro, endereco_cidade, endereco_uf, endereco_cep, endereco_referencia } = payload;
      if (itens.length === 0) throw new Error("Nenhum item selecionado.");

      // Validação/normalização de telefones antes da persistência.
      const motCheck = validatePhoneBR(motorista_telefone, { fieldLabel: "Telefone do motorista" });
      if (!motCheck.ok) throw new Error(motCheck.error);
      const destCheck = validatePhoneBR(destinatario_telefone, { fieldLabel: "Telefone do destinatário" });
      if (!destCheck.ok) throw new Error(destCheck.error);
      const waCheck = validatePhoneBR(destinatario_whatsapp, { fieldLabel: "WhatsApp do destinatário" });
      if (!waCheck.ok) throw new Error(waCheck.error);

      const osRef = (todasOS as any[]).find((o) => o.id === osId);
      const criadas: string[] = [];
      const reservasFeitas: { item: any; osId: string; osTipo: string }[] = [];

      try {
        for (const { item, quantidade } of itens) {
          if (quantidade <= 0) throw new Error(`Quantidade inválida para o lote ${item.lotes?.codigo_lote || item.id}.`);
          if (quantidade > item._saldo) throw new Error(`Lote ${item.lotes?.codigo_lote || ""}: quantidade ${quantidade} excede o saldo físico (${item._saldo}).`);
          if (item.status === "reservado" && quantidade > item._saldo_reserva) {
            throw new Error(`Lote ${item.lotes?.codigo_lote || ""}: reserva remanescente é de ${item._saldo_reserva} un.`);
          }

          let itemOsId = item.reservado_para_os_id;
          let itemOsTipo = item.reservado_para_os_tipo;
          let itemClienteId = item.reservado_para_cliente_id;

          if (!itemOsId) {
            if (!osRef) throw new Error("OS de destino não localizada.");
            const ok = await hookReservarEstoque(
              item,
              { cliente_id: osRef.cliente_id, quantidade_reservada: quantidade },
              osRef.id,
              osRef.type,
              true, // override: usuário já confirmou origem no diálogo de entrega
            );
            if (!ok) throw new Error(`Falha ao reservar o lote ${item.lotes?.codigo_lote || ""}.`);
            itemOsId = osRef.id;
            itemOsTipo = osRef.type;
            itemClienteId = osRef.cliente_id;
            reservasFeitas.push({ item, osId: itemOsId, osTipo: itemOsTipo });
          }

          // O volume entregue é calculado e gravado pelo servidor a partir do
          // item de estoque. O frontend não envia volume como autoridade.
          const entregaData = {
            ordem_servico_id: itemOsTipo !== "onfarm" ? itemOsId : null,
            ordem_servico_onfarm_id: itemOsTipo === "onfarm" ? itemOsId : null,
            cliente_id: itemClienteId,
            estoque_produto_id: item.id,
            lote_id: item.lote_id,
            produto_id: item.produto_id,
            quantidade_entregue: quantidade,
            
            tipo_entrega: tipo_entrega || 'motorista',
            motorista: motorista || null,
            veiculo: veiculo || null,
            data_saida: data_saida || null,
            motorista_telefone: motCheck.value,
            motorista_documento: motorista_documento || null,
            veiculo_placa: veiculo_placa || null,
            veiculo_tipo: veiculo_tipo || null,
            hora_saida_prevista: hora_saida_prevista || null,
            data_chegada_prevista: data_chegada_prevista || null,
            hora_chegada_prevista: hora_chegada_prevista || null,
            destinatario_nome: destinatario_nome || null,
            destinatario_telefone: destCheck.value,
            destinatario_whatsapp: waCheck.value,
            endereco_origem: endereco_origem || 'cadastro',
            endereco_logradouro: endereco_logradouro || null,
            endereco_numero: endereco_numero || null,
            endereco_complemento: endereco_complemento || null,
            endereco_bairro: endereco_bairro || null,
            endereco_cidade: endereco_cidade || null,
            endereco_uf: endereco_uf || null,
            endereco_cep: endereco_cep || null,
            endereco_referencia: endereco_referencia || null,
            grupo_entrega_id: grupoId,
          };

          const created = await criarEntrega(entregaData, itemOsId, itemOsTipo);
          if (!created || !(created as any).id) throw new Error("Falha ao gravar entrega.");
          criadas.push((created as any).id);

          // Integração com estoque: se a reserva zerou, expede pelo motor canônico.
          // Nenhum UPDATE direto: `rpc_estoque_operar_v1` grava saldo + livro atomicamente.
          try {
            const { data: entregasAtivas } = await supabase
              .from("entregas")
              .select("quantidade_entregue")
              .eq("estoque_produto_id", item.id)
              .neq("status", "cancelada");
            const totalEntregue = (entregasAtivas || []).reduce(
              (s: number, e: any) => s + (Number(e.quantidade_entregue) || 0),
              0,
            );
            const qtdReservada = Number(item.quantidade_reservada || 0);
            if (item.status === "reservado" && qtdReservada > 0 && totalEntregue >= qtdReservada) {
              await operarEstoque(
                "expedicao",
                item.id,
                qtdReservada,
                chaveIdempotencia("entrega-expedicao", (created as any).id),
                {
                  origem: "entregas.registrarEntrega",
                  referencia_tipo: "entrega",
                  referencia_id: (created as any).id,
                  os_id: itemOsId,
                  cliente_id: itemClienteId,
                  observacao: `Expedição automática pela entrega ${(created as any).id}`,
                },
              );
            }
          } catch (autoExpErr) {
            console.warn("[auto-expedir] falha ao expedir pelo motor canônico:", mensagemErroEstoque(autoExpErr));
          }

        }

        return { grupoId, total: criadas.length };
      } catch (err: any) {
        // Rollback best-effort
        for (const id of criadas) {
          await supabase.from("entregas").update({ status: "cancelada" as any, motivo_cancelamento: `Rollback de entrega múltipla: ${err.message}` } as any).eq("id", id);
        }
        for (const r of reservasFeitas) {
          try {
            await cancelarReservaEstoque(
              r.item,
              r.osId,
              r.osTipo,
              `Rollback de entrega múltipla: ${err.message}`,
            );
          } catch {}

        }
        throw err;
      }
    },
    onSuccess: ({ total }) => {
      queryClient.invalidateQueries({ queryKey: ["entregas"] });
      queryClient.invalidateQueries({ queryKey: ["estoque-prontos-entrega"] });
      toast.success(`${total} entrega(s) registradas em grupo`);
      setOpen(false);
    },
    onError: (e: Error) =>
      toast.error(`Não foi possível registrar a entrega: ${e.message}`),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // A confirmação física ("entregue") NÃO passa por aqui: ela exige
      // recebedor identificado e é feita exclusivamente pelo
      // ConfirmarEntregaDialog. Nenhum caminho pode confirmar em silêncio.
      if (status === "entregue") {
        throw new Error(
          "Use o diálogo de confirmação de entrega para registrar o recebedor.",
        );
      }

      const { error } = await supabase.from("entregas").update({ status: status as Tables<"entregas">["status"] }).eq("id", id);
      if (error) throw error;
      return true;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entregas"] });
      queryClient.invalidateQueries({ queryKey: ["estoque-prontos-entrega"] });
      toast.success("Status atualizado");
    },
  });

  const cancelarEntrega = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { data: entrega, error: fetchErr } = await supabase
        .from("entregas")
        .select("status, estoque_produto_id, quantidade_entregue, ordem_servico_id")
        .eq("id", id)
        .single();
      
      if (fetchErr) throw fetchErr;

      if (entrega.status === "entregue" && entrega.estoque_produto_id) {
        const { data: itemEstoque } = await supabase
          .from("estoque_produto")
          .select("id, quantidade, status, lote_id")
          .eq("id", entrega.estoque_produto_id)
          .single();
        
        if (itemEstoque) {
          const osId = entrega.ordem_servico_id;
          const { data: osOnFarm } = await supabase.from("ordens_servico_onfarm").select("id").eq("id", osId).maybeSingle();
          const origem = osOnFarm ? "onfarm" : "manual";
          
          await cancelarReservaEstoque(
            itemEstoque,
            osId,
            origem,
            `Estorno por cancelamento de entrega: ${motivo}`,
          );

        }
      }

      const { error } = await supabase
        .from("entregas")
        .update({
          status: "cancelada" as any,
          motivo_cancelamento: motivo || null,
        } as any)
        .eq("id", id);
      if (error) throw error;

      // Estorno da expedição automática pelo motor canônico: reverte exatamente
      // a movimentação de expedição desta entrega, uma única vez (índice único
      // em movimentacao_origem_id impede estorno duplicado).
      try {
        if (entrega.estoque_produto_id) {
          const { data: movExpedicao } = await supabase
            .from("estoque_movimentacoes")
            .select("id, acao")
            .eq("estoque_produto_id", entrega.estoque_produto_id)
            .eq("referencia_tipo", "entrega")
            .eq("referencia_id", id)
            .in("acao", ["expedicao", "entrega"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (movExpedicao?.id) {
            await operarEstoque(
              "estorno_expedicao",
              entrega.estoque_produto_id,
              null,
              chaveIdempotencia("entrega-estorno", id),
              {
                origem: "entregas.cancelarEntrega",
                referencia_tipo: "entrega",
                referencia_id: id,
                movimentacao_origem_id: movExpedicao.id,
                motivo: `Estorno por cancelamento de entrega: ${motivo || "sem motivo informado"}`,
              },
            );
          }
        }
      } catch (rollbackErr) {
        console.warn("[estorno-expedicao] falha ao estornar:", mensagemErroEstoque(rollbackErr));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entregas"] });
      queryClient.invalidateQueries({ queryKey: ["estoque-prontos-entrega"] });
      toast.success("Entrega cancelada");
      setCancelTarget(null);
      setMotivoCancel("");
    },
  });

  /**
   * Ponto único de confirmação de entrega: abre o ConfirmarEntregaDialog,
   * que coleta o recebedor físico (nome obrigatório). Não existe fluxo
   * paralelo nem fallback do nome do operador como recebedor.
   */
  const handleConfirmarEntrega = (id: string) => {
    const entrega: any = (entregas as any[]).find((e) => e.id === id);
    if (!entrega) return;
    setSelectedEntrega(entrega);
    setConfirmEntregaOpen(true);
  };




  const brandingDocumento = () => ({
    nome_empresa: brandingConfig?.nome_empresa || brandingDefaults.nome_empresa,
    logo_url: brandingConfig?.logo_url || brandingDefaults.logo_url,
    cor_primaria: brandingConfig?.cor_primaria || brandingDefaults.cor_primaria,
  });

  const buscarPayloadDocumento = async (entregaId: string, reemissao: boolean) => {
    const { data, error } = await supabase.rpc("rpc_get_comprovante_entrega_data" as any, {
      p_entrega_id: entregaId,
      p_reemissao: reemissao,
    });
    if (error) throw error;
    return data as any;
  };

  /**
   * Abertura do preview: SEMPRE `p_reemissao=false`, inclusive quando ja existe
   * snapshot. Nenhum contador de reemissao e incrementado por visualizar,
   * fechar/cancelar o dialog, refresh ou mount.
   */
  const handleGerarDocumento = async (e: any, preview = true) => {
    try {
      const possuiSnapshotAntes = possuiComprovanteDefinitivo(e);
      const payload = await buscarPayloadDocumento(e.id, REEMISSAO_NA_ABERTURA_DO_PREVIEW);

      // Primeira emissão definitiva congela o snapshot no servidor: refaz o fetch
      // para que a próxima ação passe corretamente a "Reemitir comprovante".
      if (!possuiSnapshotAntes && payload?.doc_tipo === "comprovante") {
        queryClient.invalidateQueries({ queryKey: ["entregas"] });
      }

      if (preview) {
        setPreviewPayload(payload);
        setPreviewSnapshotAntes(possuiSnapshotAntes);
        setPreviewEntregaId(e.id);
        setPreviewOpen(true);
      } else {
        await gerarDocumentoEntregaPDF(payload, brandingDocumento());
      }
    } catch (err: any) {
      toast.error(`Erro ao gerar documento de entrega: ${traduzErroComprovante(err?.message || String(err))}`);
    }
  };

  /**
   * Download a partir do preview. Só aqui uma reemissão pode ser contabilizada,
   * e apenas quando já existia snapshot definitivo antes da abertura do preview.
   */
  const handleDownloadPreview = async () => {
    if (!previewPayload || !previewEntregaId) return;
    if (downloadingPreview) return;
    setDownloadingPreview(true);
    try {
      const reemitir = deveReemitirNoDownload({
        docTipo: previewPayload?.doc_tipo,
        eraComprovanteExistente: previewSnapshotAntes,
      });
      const payload = reemitir ? await buscarPayloadDocumento(previewEntregaId, true) : previewPayload;
      await gerarDocumentoEntregaPDF(payload, brandingDocumento());
      queryClient.invalidateQueries({ queryKey: ["entregas"] });
      setPreviewOpen(false);
      setPreviewPayload(null);
      setPreviewEntregaId(null);
      setPreviewSnapshotAntes(false);
    } catch (err: any) {
      toast.error(`Erro ao gerar documento de entrega: ${traduzErroComprovante(err?.message || String(err))}`);
    } finally {
      setDownloadingPreview(false);
    }
  };

  const handleBaixarRecibo = (e: any) => handleGerarDocumento(e, true);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Entregas"
        description="Expedição e logística de entrega"
        action={
          <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Nova Entrega
          </Button>
        }
      />

      <RegistrarEntregaDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setOsInicial(undefined);
            if (searchParams.get("os")) {
              const next = new URLSearchParams(searchParams);
              next.delete("os");
              setSearchParams(next, { replace: true });
            }
          }
        }}
        itensSelecionaveis={itensSelecionaveis as any[]}
        todasOS={todasOS as any[]}
        osInicial={osInicial}
        onSubmit={async (payload) => { await createMutation.mutateAsync(payload); }}
        submitting={createMutation.isPending}
      />


      {/* Filtros BI */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Data início</Label>
              <Input type="date" value={filtroInicio} onChange={(e) => setFiltroInicio(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data fim</Label>
              <Input type="date" value={filtroFim} onChange={(e) => setFiltroFim(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Produto</Label>
              <Select value={filtroProduto} onValueChange={setFiltroProduto}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os produtos</SelectItem>
                  {produtosFiltro.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => { setFiltroInicio(""); setFiltroFim(""); setFiltroProduto("todos"); }}
            >
              <X className="h-4 w-4 mr-2" />Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {estoqueErro && (
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <span className="text-sm text-destructive">
              Não foi possível carregar os lotes disponíveis para entrega.
            </span>
            <Button variant="outline" size="sm" disabled={estoqueFetching} onClick={() => recarregarEstoque()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Entregas no período</div>
          <div className="text-2xl font-semibold">{entregasErro ? "—" : kpis.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Volume entregue (L)</div>
          <div className="text-2xl font-semibold">{entregasErro ? "—" : kpis.volumeL.toFixed(1)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">OS atendidas</div>
          <div className="text-2xl font-semibold">{entregasErro ? "—" : kpis.osDistintas}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />Entregas</CardTitle></CardHeader>
        <CardContent className={isMobile ? "p-4" : "p-0 sm:p-6 sm:pt-0"}>
          {entregasErro ? (
            <div className="py-10 text-center space-y-3" data-testid="entregas-erro">
              <p className="text-sm text-destructive">
                Não foi possível carregar as entregas.
              </p>
              <Button variant="outline" size="sm" disabled={entregasFetching} onClick={() => recarregarEntregas()}>
                Tentar novamente
              </Button>
            </div>
          ) : entregasLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground" data-testid="entregas-carregando">
              Carregando entregas...
            </div>
          ) : (
          <ResponsiveTable
            mobileCards={
              entregasFiltradas.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">Nenhuma entrega no período</div>
              ) : (
                entregasFiltradas.map((e: any) => (
                  <MobileCard
                    key={e.id}
                    title={getClienteLabel(e.clientes)}
                    subtitle={`${e.produtos?.nome || "—"} · Lote ${e.lotes?.codigo_lote || "—"}`}
                    status={<Badge variant={STATUS_LABELS[e.status]?.variant || "outline"}>{STATUS_LABELS[e.status]?.label || e.status}</Badge>}
                    content={[
                      { label: "Qtd entregue", value: e.quantidade_entregue ? `${e.quantidade_entregue} un` : "—" },
                      { label: "Volume", value: e.volume_entregue_ml ? `${(e.volume_entregue_ml / 1000).toFixed(1)} L` : "—" },
                      { label: "Modalidade", value: labelModalidade(e.tipo_entrega) },
                      { label: labelResponsavelCurto(e.tipo_entrega), value: e.motorista || "—" },
                      { label: "Saída", value: e.data_saida ? formatDateDisplay(e.data_saida) : "—" },
                      { label: "OS", value: (e.ordem_servico_id || e.ordem_servico_onfarm_id) ? formatOSFromId(e.ordem_servico_id || e.ordem_servico_onfarm_id) : "—" },
                    ]}
                    actions={
                      <>
                        {e.status === "separado" && <Button size="sm" variant="outline" className="flex-1" onClick={() => updateStatus.mutate({ id: e.id, status: "em_rota" })}>Enviar</Button>}
                        {e.status === "em_rota" && (
                          <div className="flex gap-1 w-full">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => { setSelectedEntrega(e); setConfirmEntregaOpen(true); }}>Apenas Confirmar</Button>
                            <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => { setSelectedEntrega(e); setFinancialConfirmOpen(true); }}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Entregue/Faturar
                            </Button>
                          </div>
                        )}
                        {canCancel && e.status !== "entregue" && e.status !== "cancelada" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancelTarget(e); setMotivoCancel(""); }}>Cancelar</Button>
                        )}
                        {(() => {
                          const confirmada = e.status === "entregue";
                          const definitivo = possuiComprovanteDefinitivo(e);
                          const label = rotuloAcaoDocumento({ confirmada, possuiSnapshot: definitivo });
                          return (
                            <Button size="sm" variant="ghost" onClick={() => handleBaixarRecibo(e)} title={label}>
                              <FileDown className="h-4 w-4 mr-1" /> {label}
                            </Button>
                          );
                        })()}
                        <Button size="sm" variant="outline" onClick={() => setComprovanteEntrega(e)} title="Evidências e termos da entrega (assinatura, embalagens e checklist)">

                          <FileText className="h-4 w-4 mr-1" /> Evidências
                        </Button>
                      </>
                    }
                  />
                ))
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Cód.</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Volume (L)</TableHead>
                  <TableHead>Modalidade</TableHead>
                  <TableHead>Motorista / Retirado por</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entregasFiltradas.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Nenhuma entrega no período</TableCell></TableRow>
                ) : entregasFiltradas.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.clientes?.codigo_cliente || "—"}</TableCell>
                    <TableCell className="font-medium">{e.clientes?.nome}</TableCell>
                    <TableCell>{e.produtos?.nome || "—"}</TableCell>
                    <TableCell className="font-mono-data text-xs">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span>{e.lotes?.codigo_lote || "—"}</span>
                        {e.grupo_entrega_id && gruposMap.get(e.grupo_entrega_id)! > 1 && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1" title="Entrega em grupo">
                            Grupo · {gruposMap.get(e.grupo_entrega_id)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{e.quantidade_entregue ?? "—"}</TableCell>
                    <TableCell>{e.volume_entregue_ml ? (e.volume_entregue_ml / 1000).toFixed(1) : "—"}</TableCell>
                    <TableCell>{labelModalidade(e.tipo_entrega)}</TableCell>
                    <TableCell>{e.motorista || "—"}</TableCell>
                    <TableCell>{e.data_saida ? formatDateDisplay(e.data_saida) : "—"}</TableCell>
                    <TableCell><Badge variant={STATUS_LABELS[e.status]?.variant || "outline"}>{STATUS_LABELS[e.status]?.label || e.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {e.status === "separado" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: e.id, status: "em_rota" })}>Enviar</Button>}
                        {e.status === "em_rota" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => { setSelectedEntrega(e); setConfirmEntregaOpen(true); }}>Confirmar</Button>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { setSelectedEntrega(e); setFinancialConfirmOpen(true); }}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Entregue/Faturar
                            </Button>
                          </>
                        )}
                        {canCancel && e.status !== "entregue" && e.status !== "cancelada" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancelTarget(e); setMotivoCancel(""); }}>Cancelar</Button>
                        )}
                        {(() => {
                          const confirmada = e.status === "entregue";
                          const definitivo = possuiComprovanteDefinitivo(e);
                          const label = rotuloAcaoDocumento({ confirmada, possuiSnapshot: definitivo });
                          return (
                            <Button size="sm" variant="ghost" onClick={() => handleBaixarRecibo(e)} title={label}>
                              <FileDown className="h-4 w-4 mr-1" /> {label}
                            </Button>
                          );
                        })()}
                        <Button size="sm" variant="outline" onClick={() => setComprovanteEntrega(e)} title="Evidências e termos da entrega (assinatura, embalagens e checklist)">
                          <FileText className="h-4 w-4 mr-1" /> Evidências
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ResponsiveTable>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setMotivoCancel(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar entrega?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta entrega ficará marcada como <strong>Cancelada</strong>, não afetará o estoque
              nem o fechamento da OS, mas permanecerá no histórico para rastreabilidade.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-cancel">Motivo (opcional)</Label>
            <Textarea
              id="motivo-cancel"
              value={motivoCancel}
              onChange={(e) => setMotivoCancel(e.target.value)}
              placeholder="Ex.: Cliente recusou no recebimento"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelTarget && cancelarEntrega.mutate({ id: cancelTarget.id, motivo: motivoCancel.trim() })}
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmarEntregaFinanceiroDialog
        open={financialConfirmOpen}
        onClose={() => { setFinancialConfirmOpen(false); setSelectedEntrega(null); }}
        entrega={selectedEntrega}
      />

      <ConfirmarEntregaDialog
        open={confirmEntregaOpen}
        onClose={() => { setConfirmEntregaOpen(false); }}
        entrega={selectedEntrega}
        onConfirmed={(mode) => {
          if (mode === "bill_now") {
            // Recarrega entrega e abre o passo financeiro
            setFinancialConfirmOpen(true);
          } else {
            setSelectedEntrega(null);
          }
        }}
      />

      <Dialog open={!!comprovanteEntrega} onOpenChange={(o) => !o && setComprovanteEntrega(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Evidências e termos da entrega</DialogTitle></DialogHeader>
          {comprovanteEntrega && <EntregaComprovantePanel entrega={comprovanteEntrega} />}
          {comprovanteEntrega && <div className="mt-4"><EmbalagensEntregaPanel entregaId={comprovanteEntrega.id} /></div>}
          {comprovanteEntrega && <div className="mt-4"><TermoEntregaPanel entregaId={comprovanteEntrega.id} /></div>}
        </DialogContent>
      </Dialog>

      <PreviewDocumentoEntrega
        open={previewOpen}
        onOpenChange={(o) => {
          if (!o && downloadingPreview) return;
          setPreviewOpen(o);
          if (!o) {
            // Fechar/cancelar o preview nunca contabiliza reemissao.
            setPreviewPayload(null);
            setPreviewEntregaId(null);
            setPreviewSnapshotAntes(false);
          }
        }}
        payload={previewPayload}
        branding={brandingDocumento()}
        onDownload={handleDownloadPreview}
        downloading={downloadingPreview}
      />
    </div>
  );
}
