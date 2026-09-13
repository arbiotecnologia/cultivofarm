import { useEffect, useState, useRef, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ArrowRight, Filter, Calendar, User, X, LayoutGrid, ArrowUpDown, RefreshCw, Beaker, History, Eye, Info, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BaseFaturamentoSection } from "@/components/faturamento/BaseFaturamentoSection";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { AuxiliaryScreenBanner } from "@/components/AuxiliaryScreenBanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateDisplay, formatDateToISO, applyDateMask } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { formatOS } from "@/lib/osLabel";
import { getClienteLabel } from "@/lib/clienteLabel";
import { useAuth } from "@/hooks/useAuth";
import { buscaOS, correspondePeriodo, diaSP, volumeOS, unificarOS, validarOS, erroOS } from "@/lib/ordens-servico/validacao";
import { OSDetalhesDialog } from "@/components/ordens-servico/OSDetalhesDialog";

const getPartnerFromOS = (o: any) => {
  const p = o?.partner_orders?.partner_accounts;
  if (!p) return null;
  return { nome: p.nome_fantasia || p.razao_social || "Parceiro", numero: o?.partner_orders?.numero as string | undefined };
};

const getOSTitularLabel = (o: any): string => {
  if (o?.clientes) return getClienteLabel(o.clientes);
  const p = getPartnerFromOS(o);
  if (p) return `B2B · ${p.nome}`;
  return "—";
};

const getOSTitularLink = (o: any): { to: string; label: string } | null => {
  const partnerId = o?.partner_orders?.partner_accounts?.id;
  if (partnerId) {
    const p = getPartnerFromOS(o);
    return { to: `/parceiros/${partnerId}`, label: `B2B · ${p?.nome ?? "Parceiro"}` };
  }
  const clienteId = o?.clientes?.id;
  if (clienteId) return { to: `/clientes/${clienteId}`, label: getClienteLabel(o.clientes) };
  return null;
};

const OSTitular = ({ o, className = "" }: { o: any; className?: string }) => {
  const link = getOSTitularLink(o);
  if (!link) return <span className={className}>{getOSTitularLabel(o)}</span>;
  return (
    <Link
      to={link.to}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 hover:text-primary hover:underline ${className}`}
    >
      {link.label}
      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
    </Link>
  );
};

const getOSSubLocal = (o: any): string => {
  const fz = (o?.fazendas as any)?.nome;
  const tl = (o?.talhoes as any)?.nome;
  if (fz || tl) return `${fz || ""}${fz && tl ? " • " : ""}${tl || ""}`;
  const p = getPartnerFromOS(o);
  if (p?.numero) return `Pedido: ${p.numero}`;
  return "";
};



type OrigemOS = "manual" | "onfarm";

interface OS {
  id: string;
  numero_os?: string | null;
  origem: OrigemOS;
  volume_total_ml: number | null;
  area_hectares: number | null;
  data_programada: string | null;
  prioridade: string;
  status: string;
  created_at: string;
  registro_consultor_id?: string | null;
  clientes?: { id?: string; nome: string; codigo_cliente?: string } | null;
  fazendas?: { nome: string } | null;
  talhoes?: { nome: string } | null;
  produtos?: { nome: string } | null;
  microrganismos?: { nome: string; nome_cientifico?: string | null } | null;
  tipo_item?: string | null;
}

const STATUS_PIPELINE = [
  { key: "aberta", label: "Aberta", color: "bg-muted text-muted-foreground" },
  { key: "aprovada", label: "Aprovada", color: "bg-status-producao/10 text-status-producao" },
  { key: "programada", label: "Programada", color: "bg-status-producao/20 text-status-producao" },
  { key: "em_producao", label: "Em Produção", color: "bg-status-producao/30 text-status-producao" },
  { key: "em_cq", label: "Em CQ", color: "bg-status-cq/20 text-status-cq" },
  { key: "envase", label: "Envase", color: "bg-status-entrega/10 text-status-entrega" },
  { key: "pronto_entrega", label: "Pronto Entrega", color: "bg-status-aprovado/10 text-status-aprovado" },
  { key: "entregue", label: "Entregue", color: "bg-status-aprovado/20 text-status-aprovado" },
  { key: "finalizada", label: "Finalizada", color: "bg-primary/10 text-primary" },
];

const prioridadeMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  baixa: { label: "Baixa", variant: "secondary" },
  media: { label: "Média", variant: "default" },
  alta: { label: "Alta", variant: "destructive" },
};

interface SimpleRef { id: string; nome: string; codigo_cliente?: string; }
interface Fazenda extends SimpleRef { cliente_id: string; }
interface Talhao extends SimpleRef { fazenda_id: string; area_hectares: number | null; }
interface Produto extends SimpleRef { dose_ml_ha: number | null; }
interface Microrganismo extends SimpleRef { nome_cientifico: string | null; dose_ml_ha: number | null; }

export default function OrdensServico() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const canCreate = roles.some(r => ["administrador", "gestor", "producao"].includes(r));
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const loadVersion = useRef(0);
  const [page, setPage] = useState(1);
  const isMobile = useIsMobile();
  const [ordens, setOrdens] = useState<OS[]>([]);
  const [clientes, setClientes] = useState<SimpleRef[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fazendas, setFazendas] = useState<Fazenda[]>([]);
  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [microrganismos, setMicrorganismos] = useState<Microrganismo[]>([]);
  const [search, setSearch] = useState("");
  // Drill-down: /ordens-servico?status=<status_os_onfarm> (ex.: vindo da Visão Geral)
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const s = searchParams.get("status");
    return s && STATUS_PIPELINE.some((p) => p.key === s) ? s : "all";
  });
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [clienteFilter, setClienteFilter] = useState<string>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [origemFilter, setOrigemFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"date" | "status">("date");
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOS, setSelectedOS] = useState<OS | null>(null);


  const [form, setForm] = useState({
    cliente_id: "", fazenda_id: "", talhao_id: "",
    tipo_item: "produto" as "produto" | "microrganismo",
    produto_id: "", microrganismo_id: "",
    modo_aplicacao: "foliar",
    area_hectares: "", data_programada: "", prioridade: "media",
  });

  const [volumeCalc, setVolumeCalc] = useState<number>(0);

  const fetchAll = async () => {
    const version = ++loadVersion.current;
    setIsRefreshing(true);
    try {
      // Filtro padrão: últimos 90 dias (reduz leitura sem impactar operação corrente)
      const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const results = await Promise.all([
        supabase.from("ordens_servico").select("*, clientes(id, nome, codigo_cliente), fazendas(nome), talhoes(nome), produtos(nome), microrganismos(nome, nome_cientifico), partner_orders:partner_order_id(numero, partner_accounts:partner_id(id, razao_social, nome_fantasia, codigo))").gte("created_at", since90).order("created_at", { ascending: false }).limit(200),
        supabase.from("ordens_servico_onfarm").select("*, clientes(id, nome, codigo_cliente), fazendas(nome), talhoes(nome), produtos(nome)").gte("created_at", since90).order("created_at", { ascending: false }).limit(200),
        supabase.from("clientes").select("id, nome, codigo_cliente").order("nome"),
        supabase.from("fazendas").select("id, nome, cliente_id").order("nome"),
        supabase.from("talhoes").select("id, nome, fazenda_id, area_hectares").order("nome"),
        supabase.from("produtos").select("id, nome, dose_ml_ha").order("nome"),
        supabase.from("microrganismos").select("id, nome, nome_cientifico, dose_ml_ha").order("nome"),
      ]);

      if (version !== loadVersion.current) return;
      if (results.some(result => result.error)) throw new Error("partial_load");
      const [{ data: oManual }, { data: oOnfarm }, { data: c }, { data: f }, { data: t }, { data: p }, { data: m }] = results;
      setLoadError(false);
      setLoaded(true);
      const manuais: OS[] = (oManual || []).map((r: any) => ({ ...r, origem: "manual" as const }));
      const onfarm: OS[] = (oOnfarm || []).map((r: any) => ({ ...r, origem: "onfarm" as const, data_programada: r.data_programada ?? r.data_recomendada ?? null }));
      const unified = [...manuais, ...onfarm].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setOrdens(unificarOS(unified));
      if (c) setClientes(c);
      if (f) setFazendas(f as Fazenda[]);
      if (t) setTalhoes(t as Talhao[]);
      if (p) setProdutos(p as Produto[]);
      if (m) setMicrorganismos(m as Microrganismo[]);
    } catch (error) {
      if (version === loadVersion.current) setLoadError(true);
    } finally {
      if (version === loadVersion.current) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAll();

    // Debounce: agrupa rajadas de eventos realtime em uma única recarga
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { fetchAll(); }, 1200);
    };

    const channelManual = supabase
      .channel('os-manual-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, debouncedFetch)
      .subscribe();

    const channelOnfarm = supabase
      .channel('os-onfarm-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico_onfarm' }, debouncedFetch)
      .subscribe();

    return () => {
      loadVersion.current++;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channelManual);
      supabase.removeChannel(channelOnfarm);
    };
  }, []);


  // Auto-calc volume (a partir do produto ou microrganismo selecionado)
  useEffect(() => {
    const item = form.tipo_item === "microrganismo"
      ? microrganismos.find((m) => m.id === form.microrganismo_id)
      : produtos.find((p) => p.id === form.produto_id);
    const area = Number(form.area_hectares) || 0;
    const dose = item?.dose_ml_ha || 0;
    setVolumeCalc(dose * area);
  }, [form.tipo_item, form.produto_id, form.microrganismo_id, form.area_hectares, produtos, microrganismos]);

  // Auto-fill area from talhao
  useEffect(() => {
    if (form.talhao_id) {
      const talhao = talhoes.find((t) => t.id === form.talhao_id);
      if (talhao?.area_hectares) {
        setForm((prev) => ({ ...prev, area_hectares: String(talhao.area_hectares) }));
      }
    }
  }, [form.talhao_id, talhoes]);

  const filteredFazendas = fazendas.filter((f) => f.cliente_id === form.cliente_id);
  const filteredTalhoes = talhoes.filter((t) => t.fazenda_id === form.fazenda_id);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current || !canCreate || loadError || !loaded) return;
    const validation = validarOS(form, { clientes, fazendas, talhoes, produtos, microrganismos });
    if (validation) { toast.error(validation); return; }
    savingRef.current = true;
    setSaving(true);
    try {
    const isMicro = form.tipo_item === "microrganismo";
    if (isMicro ? !form.microrganismo_id : !form.produto_id) {
      toast.error(isMicro ? "Selecione um microrganismo." : "Selecione um produto.");
      return;
    }
    const { error } = await supabase.from("ordens_servico").insert([{
      cliente_id: form.cliente_id,
      fazenda_id: form.fazenda_id,
      talhao_id: form.talhao_id,
      tipo_item: form.tipo_item,
      produto_id: isMicro ? null : form.produto_id,
      microrganismo_id: isMicro ? form.microrganismo_id : null,
      modo_aplicacao: form.modo_aplicacao || null,
      area_hectares: Number(form.area_hectares) || null,
      volume_total_ml: volumeCalc || null,
      data_programada: formatDateToISO(form.data_programada) || null,
      prioridade: form.prioridade as any,
    }] as any);
    if (error) throw error;
    toast.success("Ordem de serviço registrada.");
    setOpen(false);
    setForm({
      cliente_id: "", fazenda_id: "", talhao_id: "",
      tipo_item: "produto", produto_id: "", microrganismo_id: "",
      modo_aplicacao: "foliar",
      area_hectares: "", data_programada: "", prioridade: "media",
    });
    await fetchAll();
    } catch (error) { toast.error(erroOS(error)); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const openDetails = (os: OS) => {
    setSelectedOS(os);
    setDetailsOpen(true);
  };

  const openInCockpit = (id: string) => navigate(`/cockpit-laboratorio?os=${id}`);


  // Mapeia status da OS → etapa visível da esteira (somente leitura)
  const etapaFromStatus = (status: string): { key: string; label: string; color: string } => {
    switch (status) {
      case "aberta":
      case "aprovada":
      case "programada":
        return { key: "pcp", label: "PCP / Programação", color: "bg-muted text-muted-foreground" };
      case "em_producao":
        return { key: "producao", label: "Em Produção", color: "bg-status-producao/15 text-status-producao" };
      case "em_cq":
        return { key: "cq", label: "Controle de Qualidade", color: "bg-status-cq/15 text-status-cq" };
      case "envase":
        return { key: "envase", label: "Envase", color: "bg-orange-100 text-orange-700" };
      case "pronto_entrega":
        return { key: "estoque", label: "Estoque / Reserva", color: "bg-blue-100 text-blue-700" };
      case "entregue":
        return { key: "entrega", label: "Entrega", color: "bg-purple-100 text-purple-700" };
      case "finalizada":
        return { key: "finalizada", label: "Finalizada", color: "bg-primary/10 text-primary" };
      default:
        return { key: "desconhecido", label: status, color: "bg-muted text-muted-foreground" };
    }
  };

  const partnersFromOS = Array.from(
    new Map(
      ordens
        .map((o: any) => o?.partner_orders?.partner_accounts)
        .filter((p: any) => p?.id)
        .map((p: any) => [p.id, { id: p.id as string, nome: (p.nome_fantasia || p.razao_social || "Parceiro") as string }])
    ).values()
  ).sort((a, b) => a.nome.localeCompare(b.nome));

  const filtered = ordens.filter((o) => {
    const matchesSearch = buscaOS(search, [o.numero_os, formatOS(o), o.clientes?.nome, o.clientes?.codigo_cliente, o.produtos?.nome, o.microrganismos?.nome, o.fazendas?.nome, o.talhoes?.nome, getPartnerFromOS(o)?.nome, getPartnerFromOS(o)?.numero]);

    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    const matchesCliente = clienteFilter === "all" || (o.clientes as any)?.id === clienteFilter;
    const partnerId = (o as any)?.partner_orders?.partner_accounts?.id || "";
    const matchesPartner =
      partnerFilter === "all" ||
      (partnerFilter === "__b2b__" ? !!partnerId : partnerId === partnerFilter);
    const matchesOrigem = origemFilter === "all" || o.origem === origemFilter;

    const matchesDate = correspondePeriodo(o.data_programada || o.created_at, dateFilter);

    return matchesSearch && matchesStatus && matchesDate && matchesCliente && matchesPartner && matchesOrigem;
  }).sort((a, b) => {
    if (sortOrder === "status") {
      const idxA = STATUS_PIPELINE.findIndex(s => s.key === a.status);
      const idxB = STATUS_PIPELINE.findIndex(s => s.key === b.status);
      if (idxA !== idxB) return idxA - idxB;
    }
    // Default or secondary sort by date (newest first)
    const dateA = new Date(a.data_programada || a.created_at).getTime();
    const dateB = new Date(b.data_programada || b.created_at).getTime();
    return (Number.isFinite(dateB - dateA) ? dateB - dateA : 0) || `${a.origem}:${a.id}`.localeCompare(`${b.origem}:${b.id}`);
  });

  useEffect(() => { setPage(1); }, [search, statusFilter, dateFilter, clienteFilter, partnerFilter, origemFilter, sortOrder]);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const emptyLabel = ordens.length ? "Nenhuma OS corresponde aos filtros" : "Nenhuma OS registrada nos últimos 90 dias";

  return (
    <>
    <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-0">
      <AuxiliaryScreenBanner
        title="Cadastro e histórico de OS"
        description="Use esta tela para criar e consultar dados de OS. O avanço da esteira (produção, lote, CQ, envase, reserva, entrega, aplicação) deve ser conduzido pelo Cockpit Laboratório."
        ctaLabel="Abrir Cockpit Laboratório"
      />
      <PageHeader 
        title="Ordens de Serviço" 
        description="Histórico e registro das solicitações. Para avançar etapas, abra a OS no Cockpit Laboratório."
        action={
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => void fetchAll()}
              aria-label="Sincronizar ordens de serviço"
              className="h-12 sm:h-10 w-12 sm:w-10"
              title="Sincronizar agora"
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-5 w-5 sm:h-4 sm:w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <Dialog open={open} onOpenChange={(value) => { if (!savingRef.current) setOpen(value); }}>
            <DialogTrigger asChild>
              <Button disabled={!canCreate || !loaded || loadError} title={!canCreate ? "Cadastro disponível para administração, gestão e produção" : undefined} className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm font-bold sm:font-medium shadow-md">
                <Plus className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />Nova OS
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nova Ordem de Serviço</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="pt-2"><fieldset disabled={saving} className="space-y-5">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select value={form.cliente_id} onValueChange={(v) => setForm({...form, cliente_id: v, fazenda_id: "", talhao_id: "", area_hectares: ""})}>
                    <SelectTrigger className="h-11 sm:h-10 text-base sm:text-sm"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                    <SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{getClienteLabel(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fazenda *</Label>
                    <Select value={form.fazenda_id} onValueChange={(v) => setForm({...form, fazenda_id: v, talhao_id: "", area_hectares: ""})} disabled={saving || !canCreate || !!validarOS(form, { clientes, fazendas, talhoes, produtos, microrganismos }) || !form.cliente_id}>
                      <SelectTrigger className="h-11 sm:h-10 text-base sm:text-sm"><SelectValue placeholder="Fazenda" /></SelectTrigger>
                      <SelectContent>{filteredFazendas.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Talhão *</Label>
                    <Select value={form.talhao_id} onValueChange={(v) => setForm({...form, talhao_id: v})} disabled={!form.fazenda_id}>
                      <SelectTrigger className="h-11 sm:h-10 text-base sm:text-sm"><SelectValue placeholder="Talhão" /></SelectTrigger>
                      <SelectContent>{filteredTalhoes.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className={cn(
                  "space-y-3 rounded-lg border-2 p-3",
                  form.tipo_item === "microrganismo" ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"
                )}>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "flex-1 h-9 text-xs font-semibold border-2 transition-all",
                        "border-amber-200 hover:bg-amber-50",
                        form.tipo_item === "produto" && "bg-amber-100 text-amber-700 border-amber-500"
                      )}
                      onClick={() => setForm({ ...form, tipo_item: "produto", microrganismo_id: "" })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Produto Biológico
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "flex-1 h-9 text-xs font-semibold border-2 transition-all",
                        "border-emerald-200 hover:bg-emerald-50",
                        form.tipo_item === "microrganismo" && "bg-emerald-100 text-emerald-700 border-emerald-500"
                      )}
                      onClick={() => setForm({ ...form, tipo_item: "microrganismo", produto_id: "" })}
                    >
                      <Beaker className="h-3.5 w-3.5 mr-1.5" /> Microrganismo
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>{form.tipo_item === "microrganismo" ? "Microrganismo *" : "Produto Biológico *"}</Label>
                    {form.tipo_item === "microrganismo" ? (
                      <Select value={form.microrganismo_id} onValueChange={(v) => setForm({ ...form, microrganismo_id: v })}>
                        <SelectTrigger className="h-11 sm:h-10 text-base sm:text-sm bg-background">
                          <SelectValue placeholder="Selecione o microrganismo" />
                        </SelectTrigger>
                        <SelectContent>
                          {microrganismos.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.nome}{m.nome_cientifico ? ` — ${m.nome_cientifico}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={form.produto_id} onValueChange={(v) => setForm({ ...form, produto_id: v })}>
                        <SelectTrigger className="h-11 sm:h-10 text-base sm:text-sm bg-background">
                          <SelectValue placeholder="Selecione o produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {produtos.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome} ({p.dose_ml_ha || 0} mL/ha)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Modo de Aplicação</Label>
                    <Select value={form.modo_aplicacao} onValueChange={(v) => setForm({ ...form, modo_aplicacao: v })}>
                      <SelectTrigger className="h-11 sm:h-10 text-base sm:text-sm bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="foliar">Foliar</SelectItem>
                        <SelectItem value="solo">Solo / Sulco</SelectItem>
                        <SelectItem value="fertirrigacao">Fertirrigação</SelectItem>
                        <SelectItem value="tratamento_semente">Tratamento de Semente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Área (ha)</Label>
                    <Input aria-label="Área em hectares" required min="0.01" type="number" step="0.01" value={form.area_hectares} onChange={(e) => setForm({...form, area_hectares: e.target.value})} className="h-11 sm:h-10 text-base sm:text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Programada</Label>
                    <Input 
                      aria-label="Data programada" type="date"
                      value={form.data_programada} 
                      onChange={(e) => setForm({...form, data_programada: e.target.value})} 
                      className="h-11 sm:h-10 text-base sm:text-sm" 
                    />
                  </div>
                </div>
                {volumeCalc > 0 && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="text-sm font-medium text-primary">Volume Calculado</p>
                    <p className="text-lg font-mono-data font-bold text-primary">
                      {volumeCalc.toLocaleString("pt-BR")} mL ({(volumeCalc / 1000).toFixed(1)} L)
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={form.prioridade} onValueChange={(v) => setForm({...form, prioridade: v})}>
                    <SelectTrigger className="h-11 sm:h-10 text-base sm:text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                  <Button type="submit" className="w-full h-12 text-base font-bold shadow-lg" disabled={saving || !canCreate || !!validarOS(form, { clientes, fazendas, talhoes, produtos, microrganismos }) || !form.cliente_id || !form.fazenda_id || !form.talhao_id || (form.tipo_item === "microrganismo" ? !form.microrganismo_id : !form.produto_id)}>
                    {saving ? "Registrando…" : "Criar Ordem de Serviço"}
                  </Button>
              </fieldset></form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      {/* Status Pipeline Summary */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {STATUS_PIPELINE.map((s) => {
          const count = ordens.filter((o) => o.status === s.key).length;
          return (
            <div key={s.key} className={`flex-shrink-0 rounded-lg px-3 py-2 text-center min-w-[80px] sm:min-w-[100px] ${s.color}`}>
              <div className="text-lg font-bold">{loaded && !loadError ? count : "—"}</div>
              <div className="text-[10px] font-medium">{s.label}</div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader className="p-3 sm:pb-3 border-b mb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input aria-label="Buscar ordem, cliente, parceiro ou produto" placeholder="Buscar OS, cliente ou produto…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-full h-11 sm:h-10 text-base sm:text-sm" />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <Button type="button" variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); setDateFilter("all"); setClienteFilter("all"); setPartnerFilter("all"); setOrigemFilter("all"); setSortOrder("date"); }}>Limpar filtros</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-6 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Status" className="w-full h-11 sm:h-9 text-sm sm:text-xs">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {STATUS_PIPELINE.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={origemFilter} onValueChange={setOrigemFilter}>
                <SelectTrigger aria-label="Origem" className="w-full h-11 sm:h-9 text-sm sm:text-xs">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Origem" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  <SelectItem value="onfarm">Visita Técnica</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger aria-label="Período" className="w-full h-11 sm:h-9 text-sm sm:text-xs">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Período" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo o período</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="week">Últimos 7 dias</SelectItem>
                  <SelectItem value="month">Este mês</SelectItem>
                </SelectContent>
              </Select>

              <Select value={clienteFilter} onValueChange={setClienteFilter}>
                <SelectTrigger aria-label="Cliente" className="w-full h-11 sm:h-9 text-sm sm:text-xs">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Cliente" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{getClienteLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={partnerFilter} onValueChange={setPartnerFilter}>
                <SelectTrigger aria-label="Parceiro B2B" className="w-full h-11 sm:h-9 text-sm sm:text-xs">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Parceiro B2B" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os parceiros</SelectItem>
                  <SelectItem value="__b2b__">Somente OS B2B</SelectItem>
                  {partnersFromOS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>


              <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
                <SelectTrigger className="w-full h-11 sm:h-9 text-sm sm:text-xs">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Ordenar" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Data (Mais recente)</SelectItem>
                  <SelectItem value="status">Pipeline (Status)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className={isMobile ? "p-3" : "p-0 sm:p-6 sm:pt-0"}>
          {loadError ? <div role="alert" className="space-y-3 p-4"><p>Não foi possível carregar todas as informações. Nenhum resultado parcial é exibido.</p><Button disabled={isRefreshing} onClick={() => void fetchAll()}>Tentar novamente</Button></div> : !loaded ? <p role="status" className="p-4">Carregando ordens de serviço…</p> : <>
          <p role="status" className="text-sm text-muted-foreground pb-3">{filtered.length} de {ordens.length} OS carregadas · últimos 90 dias · até 200 por origem{isRefreshing ? " · Atualizando…" : ""}</p>
          <ResponsiveTable
            mobileCards={
              filtered.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">{emptyLabel}</div>
              ) : (
                visible.map((o) => {
                  const prio = prioridadeMap[o.prioridade] || { label: o.prioridade, variant: "secondary" as const };
                  const statusInfo = STATUS_PIPELINE.find((s) => s.key === o.status);
                  const etapa = etapaFromStatus(o.status);
                  return (
                    <div key={`${o.origem}-${o.id}`} className="space-y-3">
                      <MobileCard
                        title={<span className="inline-flex items-center gap-1.5 flex-wrap">{formatOS(o)} <span className="text-muted-foreground">·</span> <OSTitular o={o} /></span>}
                        subtitle={getOSSubLocal(o)}
                        status={
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant={prio.variant} className="text-[10px]">{prio.label}</Badge>
                            <Badge variant="outline" className={`text-[9px] ${o.origem === "onfarm" ? "border-status-producao text-status-producao" : ""}`}>
                              {o.origem === "onfarm" ? "Visita Técnica" : "Manual"}
                            </Badge>
                          </div>
                        }
                        content={[
                          { label: (o as any).tipo_item === "microrganismo" ? "Microrganismo" : "Produto", value: (o.produtos as any)?.nome || (o.microrganismos as any)?.nome || "—" },
                          { label: "Volume", value: volumeOS(o.volume_total_ml) },
                          { label: "Data", value: formatDateDisplay(diaSP(o.data_programada || o.created_at)) },
                          { label: "Status", value: (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo?.color || ""}`}>
                              {statusInfo?.label || o.status}
                            </span>
                          )},
                          { label: "Etapa", value: (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${etapa.color}`}>
                              {etapa.label}
                            </span>
                          )},
                        ]}
                        actions={
                          <div className="flex gap-2 w-full">
                            {o.origem === "onfarm" && o.registro_consultor_id && (
                              <Button
                                className="flex-1"
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/visita-tecnica/${o.registro_consultor_id}?tab=roteiro`)}
                              >
                                <History className="h-3 w-3 mr-1.5" /> Roteiro
                              </Button>
                            )}
                            <Button 
                              className="flex-1 h-9" 
                              size="sm" 
                              variant="outline"
                              onClick={() => openDetails(o)}
                            >
                              <Info className="h-3.5 w-3.5 mr-1.5" /> Rastrear
                            </Button>
                            <Button className="flex-1 h-9" size="sm" onClick={() => openInCockpit(o.id)}>
                              Cockpit <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          </div>
                        }
                      />

                      <BaseFaturamentoSection 
                        osId={o.id} 
                        osTipo={o.origem === 'onfarm' ? 'ON_FARM' : 'TRADICIONAL'} 
                      />
                    </div>
                  );
                })
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº OS</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente / Parceiro</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Etapa atual</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">{emptyLabel}</TableCell></TableRow>
                ) : visible.map((o) => {
                  const prio = prioridadeMap[o.prioridade] || { label: o.prioridade, variant: "secondary" as const };
                  const statusInfo = STATUS_PIPELINE.find((s) => s.key === o.status);
                  const etapa = etapaFromStatus(o.status);
                  return (
                    <Fragment key={`${o.origem}-${o.id}`}>
                      <TableRow>
                        <TableCell className="font-mono-data text-xs font-semibold">{formatOS(o)}</TableCell>
                        <TableCell className="text-sm">{formatDateDisplay(diaSP(o.data_programada || o.created_at))}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <OSTitular o={o} />
                            {getOSSubLocal(o) && (
                              <span className="text-[10px] text-muted-foreground">{getOSSubLocal(o)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${o.origem === "onfarm" ? "border-status-producao text-status-producao" : ""}`}>
                            {o.origem === "onfarm" ? "Visita Técnica" : "Manual"}
                          </Badge>
                        </TableCell>
                        <TableCell>{(o.produtos as any)?.nome || (o.microrganismos as any)?.nome || "—"}</TableCell>
                        <TableCell className="font-mono-data text-sm">{volumeOS(o.volume_total_ml)}</TableCell>
                        <TableCell><Badge variant={prio.variant}>{prio.label}</Badge></TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo?.color || ""}`}>
                            {statusInfo?.label || o.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${etapa.color}`}>
                            {etapa.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="inline-flex items-center gap-1">
                            {o.origem === "onfarm" && o.registro_consultor_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Roteiro da visita de origem"
                                onClick={() => navigate(`/visita-tecnica/${o.registro_consultor_id}?tab=roteiro`)}
                              >
                                <History className="h-4 w-4 text-primary" />
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              title="Rastreabilidade da Produção"
                              onClick={() => openDetails(o)}
                            >
                              <Info className="h-4 w-4 text-primary" />
                            </Button>
                            <Button size="sm" onClick={() => openInCockpit(o.id)}>
                              Cockpit <ArrowRight className="ml-1 h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-muted/30 hover:bg-muted/30 border-b-2">
                        <TableCell colSpan={10} className="py-2 px-6">
                          <BaseFaturamentoSection 
                            osId={o.id} 
                            osTipo={o.origem === 'onfarm' ? 'ON_FARM' : 'TRADICIONAL'} 
                          />
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </ResponsiveTable>
          <nav aria-label="Páginas de ordens" className="flex flex-wrap items-center justify-between gap-2 pt-4"><Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span>Página {currentPage} de {pages}</span><Button variant="outline" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Próxima</Button></nav></>
        </CardContent>
      </Card>
      <OSDetalhesDialog 
        os={selectedOS} 
        open={detailsOpen} 
        onOpenChange={setDetailsOpen} 
      />
    </div>
    </>
  );
}
