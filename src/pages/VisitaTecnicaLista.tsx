import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { Plus, Search, Eye, Filter, Calendar, MapPin, User, X, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { STATUS_LABEL_REGISTRO } from "@/lib/registroTransitions";
import { formatDateDisplay } from "@/lib/date-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { InconsistenciasVisita } from "@/components/visita/InconsistenciasVisita";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";
import { useVisitasTecnicasLista, periodoParaIntervalo } from "@/hooks/useVisitasTecnicasLista";

const PAGE_SIZE = 25;

export default function VisitaTecnicaLista() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { corrigirCheckinsOrfaos } = useFluxoVisitaTecnica();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [clienteFilter, setClienteFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, dateFilter, clienteFilter]);

  useEffect(() => {
    if (role === "admin" || role === "gestor") {
      corrigirCheckinsOrfaos().then(res => {
        if (res.success && res.data?.corrigidos > 0) {
          console.log(`Correção automática: ${res.data.corrigidos} check-ins vinculados.`);
        }
      });
    }
  }, [role]);

  const intervaloDatas = useMemo(() => periodoParaIntervalo(dateFilter), [dateFilter]);

  const { data: listaVisitas, isLoading } = useVisitasTecnicasLista({
    search: search.trim() || null,
    status: statusFilter === "all" ? null : [statusFilter],
    de: intervaloDatas.de,
    ate: intervaloDatas.ate,
    clienteId: clienteFilter === "all" ? null : clienteFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  // Shape compatível com o restante da tela (tabela e cards mobile).
  const filteredVisitas = useMemo(
    () =>
      (listaVisitas?.items ?? []).map((v) => ({
        ...v,
        clientes: { id: v.cliente_id, nome: v.cliente_nome },
        fazendas: { id: v.fazenda_id, nome: v.fazenda_nome },
        talhoes: { nome: v.talhao_nome },
        culturas: { nome: null as string | null },
        data_proxima_visita: null as string | null,
      })),
    [listaVisitas],
  );
  const visitas = filteredVisitas;

  const uniqueClientes = Array.from(new Set(visitas.map(v => (v.clientes as any)?.nome).filter(Boolean)));
  const clienteOptions = Array.from(new Map(visitas.map(v => [(v.clientes as any)?.id || (v.clientes as any)?.nome, (v.clientes as any)?.nome])).entries())
    .filter(([id, name]) => id && name);

  const getStatusBadge = (status: string, necessidadeIntervencao?: string, dataProximaVisita?: string) => {
    const label = STATUS_LABEL_REGISTRO[status as any] || status;
    
    if (status === "finalizado" && necessidadeIntervencao === "monitorar") {
      const isOverdue = dataProximaVisita && new Date(dataProximaVisita) < new Date();
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="default" className="bg-emerald-600">Em monitoramento</Badge>
          {isOverdue && <Badge variant="destructive" className="text-[10px] py-0 h-4">Reavaliação vencida</Badge>}
        </div>
      );
    }

    switch (status) {
      case "rascunho": return <Badge variant="outline">{label}</Badge>;
      case "finalizado": return <Badge variant="secondary">{label}</Badge>;
      case "aprovado": return <Badge variant="default" className="bg-green-600">{label}</Badge>;
      case "enviado_aprovacao": return <Badge variant="default" className="bg-blue-600">{label}</Badge>;
      case "convertido_os": return <Badge variant="default" className="bg-purple-600">{label}</Badge>;
      default: return <Badge variant="outline">{label}</Badge>;
    }
  };

  const getRiscoBadge = (risco: string) => {
    if (!risco) return null;
    switch (risco) {
      case "alto": return <Badge variant="destructive" className="text-[10px]">Alto Risco</Badge>;
      case "medio": return <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Médio Risco</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">Baixo Risco</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visitas Técnicas"
        description="Listagem de acompanhamentos e recomendações de campo"
        action={
          <Button onClick={() => navigate("/visita-tecnica/nova")} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Visita
          </Button>
        }
      />

      {(role === "admin" || role === "gestor") && <InconsistenciasVisita />}

      <Card>
        <CardHeader className="pb-3 border-b mb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar código, visita, cliente ou fazenda..." 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <Badge 
                  variant={statusFilter === "all" && dateFilter === "all" && clienteFilter === "all" ? "default" : "outline"}
                  className="cursor-pointer whitespace-nowrap"
                  onClick={() => { setStatusFilter("all"); setDateFilter("all"); setClienteFilter("all"); }}
                >
                  Todos
                </Badge>
                {dateFilter === "today" && <Badge variant="secondary" className="whitespace-nowrap">Hoje <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setDateFilter("all")} /></Badge>}
                {statusFilter !== "all" && <Badge variant="secondary" className="whitespace-nowrap">{STATUS_LABEL_REGISTRO[statusFilter as any] || statusFilter} <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setStatusFilter("all")} /></Badge>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(STATUS_LABEL_REGISTRO).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-full h-9 text-xs">
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
                <SelectTrigger className="w-full h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Cliente" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {clienteOptions.map(([id, name]) => (
                    <SelectItem key={String(id)} value={String(id)}>{String(name)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className={isMobile ? "p-4" : ""}>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <ResponsiveTable
              mobileCards={
                filteredVisitas.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Nenhuma visita técnica encontrada</p>
                  </div>
                ) : (
                  filteredVisitas.map((v) => (
                    <MobileCard
                      key={v.id}
                      title={v.objetivo_visita || "Visita Técnica"}
                      subtitle={[
                        (v.clientes as any)?.nome,
                        (v.fazendas as any)?.nome,
                        (v.talhoes as any)?.nome
                      ].filter(Boolean).join(" • ")}
                      status={getStatusBadge(v.status, v.necessidade_intervencao, (v as any).data_proxima_visita)}
                      onClick={() => navigate(`/visita-tecnica/${v.id}`)}
                      content={[
                        { label: "Data", value: v.data_vistoria ? formatDateDisplay(v.data_vistoria) : "—" },
                        { label: "Cultura", value: (v.culturas as any)?.nome || "—" },
                        { label: "Risco", value: getRiscoBadge(v.risco_produtivo) },
                        { label: "Código", value: (v as any).codigo_visita || "—" },
                      ]}
                      actions={
                        <div className="flex gap-2 w-full">
                          <Button
                            className="flex-1 h-12"
                            size="sm"
                            onClick={() => navigate(`/visita-tecnica/${v.id}`)}
                            aria-label={`Visualizar detalhes da visita ${(v as any).codigo_visita || v.objetivo_visita || v.id.slice(0, 8)}`}
                          >
                            <Eye className="h-4 w-4 mr-2" /> Detalhes
                          </Button>
                          {v.status && v.status !== "rascunho" && (
                            <Button
                              variant="outline"
                              className="flex-1 h-12"
                              size="sm"
                              onClick={() => navigate(`/visita-tecnica/${v.id}?tab=roteiro`)}
                            >
                              <History className="h-4 w-4 mr-2" /> Roteiro
                            </Button>
                          )}
                        </div>
                      }
                      ariaLabel={`Visita técnica ${v.objetivo_visita || ""}, Cliente ${ (v.clientes as any)?.nome || ""}`}
                    />
                  ))
                )
              }
            >
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[130px]">Código</TableHead>
                      <TableHead className="w-[120px]">Data</TableHead>
                      <TableHead>Título / Cliente • Fazenda</TableHead>
                      <TableHead>Cultura</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Risco</TableHead>
                      <TableHead className="w-[80px] text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVisitas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <Calendar className="h-8 w-8 opacity-20" />
                            <p>Nenhuma visita técnica encontrada</p>
                            <Button 
                              variant="link" 
                              onClick={() => navigate("/visita-tecnica/nova")}
                            >
                              Registrar primeira visita
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredVisitas.map((v) => (
                        <TableRow key={v.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/visita-tecnica/${v.id}`)}>
                          <TableCell className="font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                            {(v as any).codigo_visita || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {v.data_vistoria ? formatDateDisplay(v.data_vistoria) : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-semibold text-sm">{v.objetivo_visita || "Visita Técnica"}</span>
                              <span className="text-[11px] text-muted-foreground truncate max-w-[250px]">
                                {[
                                  (v.clientes as any)?.nome,
                                  (v.fazendas as any)?.nome,
                                  (v.talhoes as any)?.nome
                                ].filter(Boolean).join(" • ")}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{(v.culturas as any)?.nome || "—"}</TableCell>
                          <TableCell>{getStatusBadge(v.status, v.necessidade_intervencao, (v as any).data_proxima_visita)}</TableCell>
                          <TableCell>{getRiscoBadge(v.risco_produtivo)}</TableCell>
                          <TableCell className="text-center">
                            <div className="inline-flex items-center gap-1">
                              <Button variant="ghost" size="icon" title="Detalhes" onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/visita-tecnica/${v.id}`);
                              }}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {v.status && v.status !== "rascunho" && (
                                <Button variant="ghost" size="icon" title="Roteiro da visita" onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/visita-tecnica/${v.id}?tab=roteiro`);
                                }}>
                                  <History className="h-4 w-4 text-primary" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}