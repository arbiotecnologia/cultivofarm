import { useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { COCKPIT_LIST_RPC, useCockpitQuery } from "@/hooks/useCockpitQuery";
import { COCKPIT_STAGES } from "@/lib/cockpit/stage";
import { cockpitReaderStatus } from "@/lib/cockpit/readerStatus";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface ListItem { os_id: string; origem_os: string; numero_os?: string | null; produto_nome?: string | null; microrganismo_nome?: string | null; cliente_nome?: string | null; titular_nome?: string | null; fazenda_nome?: string | null; talhao_nome?: string | null; responsavel_nome?: string | null; status_os?: string | null; status_esteira_oficial?: string | null; volume_solicitado_l?: number | null }
interface ListResponse { items: ListItem[]; total_count: number }
const PAGE_SIZE = 50;
const label = (value: string) => value.replace(/_/g, " ");

/** Consulta isolada: sem hooks operacionais, filhos, fontes secundárias ou fallback. */
export function CockpitConsulta() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [priority, setPriority] = useState("all");
  const [page, setPage] = useState(0);
  const filters = { p_busca: search.trim() || null, p_stages: stage === "all" ? null : [stage], p_origens: origin === "all" ? null : [origin], p_prioridades: priority === "all" ? null : [priority], p_incluir_finalizadas: stage === "finalizada" || stage === "cancelada", p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE };
  const query = useCockpitQuery<ListResponse>({
    queryKey: ["cockpit-laboratorio", COCKPIT_LIST_RPC, filters], reader: "listRPC",
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc(COCKPIT_LIST_RPC as never, filters as never).abortSignal(signal);
      if (error) throw error;
      const result = data as unknown as ListResponse | null;
      if (!result || !Array.isArray(result.items) || !Number.isSafeInteger(result.total_count) || result.total_count < 0) throw new Error("cockpit_list_invalid_response");
      return { ...result, items: result.items.map(item => ({ ...item, status_esteira_oficial: cockpitReaderStatus(item.status_os, item.status_esteira_oficial) })) };
    }, refetchInterval: false,
  });
  const data = query.available && !query.isError ? query.data : undefined;
  const change = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(0); };
  return <div className="space-y-6 pb-8">
    <PageHeader title="Cockpit Operacional" description="" />
    <p role="status" className="border-l-4 border-primary pl-4 text-sm">Consulta disponível; operações do laboratório temporariamente indisponíveis.</p>
    <div className="flex flex-wrap items-center gap-3">
      <Input aria-label="Buscar OS" placeholder="Buscar OS" value={search} onChange={event => change(setSearch)(event.target.value)} className="w-full sm:w-64" />
      {[{ name: "Estágio", value: stage, setter: setStage, options: COCKPIT_STAGES.map(value => [value, label(value)]) }, { name: "Origem", value: origin, setter: setOrigin, options: [["manual", "Manual"], ["onfarm", "Onfarm"]] }, { name: "Prioridade", value: priority, setter: setPriority, options: [["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]] }].map(filter => <Select key={filter.name} value={filter.value} onValueChange={change(filter.setter)}><SelectTrigger aria-label={filter.name} className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{filter.name}: todos</SelectItem>{filter.options.map(([value, title]) => <SelectItem key={value} value={value}>{title}</SelectItem>)}</SelectContent></Select>)}
      <Button variant="outline" aria-label="Atualizar consulta" disabled={!query.available || query.isFetching} onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" /></Button>
    </div>
    {!query.available ? <p role="alert">Consulta indisponível para o contexto atual.</p> : query.isError ? <p role="alert">Não foi possível consultar a esteira. O acesso permanece sujeito à liberação de leitura.</p> : query.isPending ? <p role="status">Carregando esteira...</p> : <><p className="text-sm text-muted-foreground">{data?.total_count ?? 0} ordens de serviço</p><div role="list" aria-label="Ordens de serviço" className="divide-y divide-border">{data?.items.map(item => <article role="listitem" key={`${item.origem_os}:${item.os_id}`} className="py-4 space-y-2"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.numero_os || "Não informado"}</h2><Badge variant="outline">{item.status_esteira_oficial ? label(item.status_esteira_oficial) : "Não informado"}</Badge><Badge variant="secondary">{item.origem_os}</Badge></div><p>{item.produto_nome || item.microrganismo_nome || "Não informado"}</p><p className="text-sm text-muted-foreground">{item.titular_nome || item.cliente_nome || "Não informado"} · {item.fazenda_nome || "Não informado"} · {item.talhao_nome || "Não informado"}</p><p className="text-sm">Volume: {typeof item.volume_solicitado_l === "number" && Number.isFinite(item.volume_solicitado_l) ? `${item.volume_solicitado_l.toLocaleString("pt-BR")} L` : "Não informado"} · Responsável: {item.responsavel_nome || "Não informado"}</p></article>)}</div>{data?.items.length === 0 && <p>Nenhuma OS com os filtros atuais.</p>}</>}
    <div className="flex items-center justify-end gap-3"><Button variant="outline" aria-label="Página anterior" disabled={!data || page === 0 || query.isFetching} onClick={() => setPage(value => value - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm">Página {page + 1}</span><Button variant="outline" aria-label="Próxima página" disabled={!data || (page + 1) * PAGE_SIZE >= data.total_count || query.isFetching} onClick={() => setPage(value => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
  </div>;
}