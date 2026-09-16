import { Search, Filter, Calendar, X, ChevronDown, CheckCircle2, AlertTriangle, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { BIFiltros } from "@/hooks/useBIOperacional";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BIFilterPresetButton } from "./BIFilterPresetButton";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface BIFiltrosGlobaisProps {
  filtros: BIFiltros;
  onFiltrosChange: (filtros: BIFiltros) => void;
}

export function BIFiltrosGlobais({ filtros, onFiltrosChange }: BIFiltrosGlobaisProps) {

  const [open, setOpen] = useState(false);

  // Queries para popular os selects
  const { data: clientes = [] } = useQuery({
    queryKey: ["bi-filtros-clientes"],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, nome").order("nome");

      return data || [];
    }
  });

  const { data: fazendas = [] } = useQuery({
    queryKey: ["bi-filtros-fazendas", filtros.clienteId],
    enabled: !!filtros.clienteId,
    queryFn: async () => {
      const { data } = await supabase.from("fazendas").select("id, nome").eq("cliente_id", filtros.clienteId).order("nome");
      return data || [];
    }
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["bi-filtros-produtos"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id, nome").order("nome");
      return data || [];
    }
  });

  const { data: microrganismos = [] } = useQuery({
    queryKey: ["bi-filtros-microrganismos"],
    queryFn: async () => {
      const { data } = await supabase.from("microrganismos").select("id, nome").order("nome");
      return data || [];
    }
  });

  const { data: consultores = [] } = useQuery({
    queryKey: ["bi-filtros-consultores"],
    queryFn: async () => {
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["consultor_tecnico", "tecnico_agronomo"]);
      
      const userIds = userRoles?.map(ur => ur.user_id) || [];
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nome")
        .in("user_id", userIds)
        .order("nome");

      return profiles?.map(p => ({ id: p.user_id, nome: p.nome })) || [];
    }
  });

  const { data: culturas = [] } = useQuery({
    queryKey: ["bi-filtros-culturas"],
    queryFn: async () => {
      const { data } = await supabase.from("culturas").select("id, nome").order("nome");
      return data || [];
    }
  });

  const { data: talhoes = [] } = useQuery({
    queryKey: ["bi-filtros-talhoes", filtros.fazendaId],
    enabled: !!filtros.fazendaId,
    queryFn: async () => {
      const { data } = await supabase.from("talhoes").select("id, nome").eq("fazenda_id", filtros.fazendaId).order("nome");
      return data || [];
    }
  });

  const updateFiltro = (key: keyof BIFiltros, value: any) => {
    onFiltrosChange({ ...filtros, [key]: value === "all" ? undefined : value });
  };

  const applyPeriodPreset = (preset: string) => {
    const today = new Date();
    let start = "";
    let end = format(today, "yyyy-MM-dd");

    switch (preset) {
      case "hoje":
        start = end;
        break;
      case "7dias":
        start = format(subDays(today, 7), "yyyy-MM-dd");
        break;
      case "30dias":
        start = format(subDays(today, 30), "yyyy-MM-dd");
        break;
      case "90dias":
        start = format(subDays(today, 90), "yyyy-MM-dd");
        break;
      case "mesAtual":
        start = format(startOfMonth(today), "yyyy-MM-dd");
        end = format(endOfMonth(today), "yyyy-MM-dd");
        break;
      default:
        start = "";
        end = "";
    }

    onFiltrosChange({ ...filtros, periodoInicio: start, periodoFim: end });
  };

  const clearFiltros = () => {
    const today = new Date();
    const thirtyDaysAgo = format(subDays(today, 30), "yyyy-MM-dd");
    onFiltrosChange({
      periodoInicio: thirtyDaysAgo,
      periodoFim: format(today, "yyyy-MM-dd"),
      origemOs: "todas",
      clienteId: undefined,
      fazendaId: undefined,
      talhaoId: undefined,
      produtoId: undefined,
      microrganismoId: undefined,
      consultorId: undefined,
      status_solicitacao: undefined,
      status_visita: undefined,
      status_esteira_oficial: undefined,
      status_entrega: undefined,
      entrega_confirmada: undefined,
      pode_finalizar: undefined,
      tipo_gargalo: undefined,
      gravidade: undefined,
      culturaId: undefined,
    });
  };


  const activeCount = Object.entries(filtros).filter(([key, v]) => {
    if (v === "" || v === undefined || v === "all") return false;
    if (key === "origemOs" && v === "todas") return false;
    // Ignorar datas se forem o padrão (últimos 30 dias)
    const today = format(new Date(), "yyyy-MM-dd");
    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
    if (key === "periodoInicio" && v === thirtyDaysAgo) return false;
    if (key === "periodoFim" && v === today) return false;
    return true;
  }).length;


  const FiltrosContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-1">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Período Rápido</label>
          <div className="flex flex-wrap gap-1">
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => applyPeriodPreset("hoje")}>Hoje</Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => applyPeriodPreset("7dias")}>7d</Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => applyPeriodPreset("30dias")}>30d</Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => applyPeriodPreset("mesAtual")}>Mês</Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Data Personalizada</label>
          <div className="flex gap-2">
            <Input 
              type="date" 
              className="h-9 text-xs"
              value={filtros.periodoInicio} 
              onChange={(e) => updateFiltro("periodoInicio", e.target.value)} 
            />
            <Input 
              type="date" 
              className="h-9 text-xs"
              value={filtros.periodoFim} 
              onChange={(e) => updateFiltro("periodoFim", e.target.value)} 
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Cliente</label>
          <Select value={filtros.clienteId || "all"} onValueChange={(v) => updateFiltro("clienteId", v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todos os Clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Clientes</SelectItem>
              {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Fazenda</label>
          <Select 
            value={filtros.fazendaId || "all"} 
            onValueChange={(v) => updateFiltro("fazendaId", v)}
            disabled={!filtros.clienteId}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todas as Fazendas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Fazendas</SelectItem>
              {fazendas.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Talhão</label>
          <Select 
            value={filtros.talhaoId || "all"} 
            onValueChange={(v) => updateFiltro("talhaoId", v)}
            disabled={!filtros.fazendaId}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todos os Talhões" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Talhões</SelectItem>
              {talhoes.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-1">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Consultor Técnico</label>
          <Select value={filtros.consultorId || "all"} onValueChange={(v) => updateFiltro("consultorId", v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todos os Consultores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Consultores</SelectItem>
              {consultores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Filtro de Cultura ocultado temporariamente por ausência de campo nas views de BI */}
        {/* 
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Cultura</label>
          <Select value={filtros.culturaId || "all"} onValueChange={(v) => updateFiltro("culturaId", v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todas as Culturas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Culturas</SelectItem>
              {culturas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div> 
        */}

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Produto / Microrganismo</label>
          <div className="flex gap-2">
            <Select value={filtros.produtoId || "all"} onValueChange={(v) => updateFiltro("produtoId", v)}>
              <SelectTrigger className="h-9 text-xs flex-1">
                <SelectValue placeholder="Produto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Produtos</SelectItem>
                {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtros.microrganismoId || "all"} onValueChange={(v) => updateFiltro("microrganismoId", v)}>
              <SelectTrigger className="h-9 text-xs flex-1">
                <SelectValue placeholder="Micro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {microrganismos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Status Solicitação</label>
          <Select value={filtros.status_solicitacao || "all"} onValueChange={(v) => updateFiltro("status_solicitacao", v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todos os Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="aberta">Aberta</SelectItem>
              <SelectItem value="agendada">Agendada</SelectItem>
              <SelectItem value="atribuida">Atribuída</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="finalizada">Finalizada</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="reprovada">Reprovada</SelectItem>
              <SelectItem value="convertida_os">Convertida em OS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Status Visita</label>
          <Select value={filtros.status_visita || "all"} onValueChange={(v) => updateFiltro("status_visita", v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todos os Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="agendada">Agendada</SelectItem>
              <SelectItem value="atribuida">Atribuída</SelectItem>
              <SelectItem value="finalizado">Finalizada</SelectItem>
              <SelectItem value="aprovado">Aprovada</SelectItem>
              <SelectItem value="reprovado">Reprovada</SelectItem>
              <SelectItem value="convertido_os">Convertida em OS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-1">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Status Esteira Lab</label>
          <Select value={filtros.status_esteira_oficial || "all"} onValueChange={(v) => updateFiltro("status_esteira_oficial", v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todos os Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="aberta">Aberta</SelectItem>
              <SelectItem value="programada">Programada</SelectItem>
              <SelectItem value="em_producao">Em Produção</SelectItem>
              <SelectItem value="aguardando_cq">Aguardando CQ</SelectItem>
              <SelectItem value="cq_aprovado">CQ Aprovado</SelectItem>
              <SelectItem value="cq_reprovado">CQ Reprovado</SelectItem>
              <SelectItem value="envase">Envase</SelectItem>
              <SelectItem value="pronto_entrega">Pronto Entrega</SelectItem>
              <SelectItem value="entrega_pendente">Entrega Pendente</SelectItem>
              <SelectItem value="entregue">Entregue</SelectItem>
              <SelectItem value="finalizada">Finalizada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Status Entrega</label>
          <Select value={filtros.status_entrega || "all"} onValueChange={(v) => updateFiltro("status_entrega", v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todos os Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_transito">Em Trânsito</SelectItem>
              <SelectItem value="entregue">Entregue</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Flags Técnicas</label>
          <div className="flex gap-2">
            <Select 
              value={filtros.entrega_confirmada === undefined ? "all" : String(filtros.entrega_confirmada)} 
              onValueChange={(v) => updateFiltro("entrega_confirmada", v === "all" ? "all" : v === "true")}
            >
              <SelectTrigger className="h-9 text-xs flex-1">
                <SelectValue placeholder="Entrega Conf.?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Entr. Conf?</SelectItem>
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>
            <Select 
              value={filtros.pode_finalizar === undefined ? "all" : String(filtros.pode_finalizar)} 
              onValueChange={(v) => updateFiltro("pode_finalizar", v === "all" ? "all" : v === "true")}
            >
              <SelectTrigger className="h-9 text-xs flex-1">
                <SelectValue placeholder="Finalizável?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Finalizável?</SelectItem>
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Gargalos</label>
          <div className="flex gap-2">
            <Select value={filtros.tipo_gargalo || "all"} onValueChange={(v) => updateFiltro("tipo_gargalo", v)}>
              <SelectTrigger className="h-9 text-xs flex-1">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tipos</SelectItem>
                <SelectItem value="sem_recomendacao">Sem Recomendação</SelectItem>
                <SelectItem value="cq_reprovado">CQ Reprovado</SelectItem>
                <SelectItem value="sem_estoque">Sem Estoque</SelectItem>
                <SelectItem value="os_em_atraso">OS Atrasada</SelectItem>
                <SelectItem value="sem_programacao">Sem Programação</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtros.gravidade || "all"} onValueChange={(v) => updateFiltro("gravidade", v)}>
              <SelectTrigger className="h-9 text-xs flex-1">
                <SelectValue placeholder="Grav." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Grav.</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="informativa">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Origem OS</label>
          <Select value={filtros.origemOs || "todas"} onValueChange={(v) => updateFiltro("origemOs", v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todas as Origens" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Origens</SelectItem>
              <SelectItem value="manual">Manual (Produção)</SelectItem>
              <SelectItem value="onfarm">Produção (Visita)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );


  return (
    <div className="bg-white rounded-xl shadow-sm border p-3 mb-6">
      <div className="md:hidden">
        <Accordion type="single" collapsible>
          <AccordionItem value="filtros" className="border-none">
            <AccordionTrigger className="hover:no-underline py-0">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Filter className="h-4 w-4 text-primary" />
                Filtros do Dashboard
                {activeCount > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeCount}</Badge>}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              {FiltrosContent}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFiltros}
                className="w-full text-xs text-muted-foreground"
              >
                <X className="h-3 w-3 mr-1" /> Limpar Filtros
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="hidden md:block">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-black text-foreground uppercase tracking-tight">
            <Filter className="h-4 w-4 text-primary" />
            Filtros Globais
          </div>
          <div className="flex items-center gap-3">
            <BIFilterPresetButton currentFilters={filtros} onSelect={onFiltrosChange} />
            {activeCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFiltros}
                className="h-7 text-[10px] text-muted-foreground hover:text-primary"
              >
                <X className="h-3 w-3 mr-1" /> Limpar Filtros
              </Button>
            )}
          </div>

        </div>
        {FiltrosContent}
      </div>
    </div>
  );
}
