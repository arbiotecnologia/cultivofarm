import { useState, useEffect, useCallback, useMemo } from "react";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Search, User, Mail, Phone,
  MapPin, ClipboardCheck, MoreVertical,
  Users, Map, Calendar, IdCard, Briefcase, ChevronRight, Camera, Eye, ChevronLeft, X, Edit2, Check, Download,
  ImageOff, Loader2
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatTelefone } from "@/lib/masks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatDateDisplay } from "@/lib/date-utils";
import { useMetricasOperacionais } from "@/hooks/useMetricasOperacionais";
import { formatMetric } from "@/lib/metrics-utils";
import {
  ROLES_EQUIPE_TECNICA,
  mapConsultores,
  rolesOrfaos,
  emailsDuplicados,
  filtrarConsultores,
  isConsultorAtivo,
} from "@/lib/equipe-tecnica/consultores";
import {
  PROFILE_FIELDS,
  temAcessoAmploClientes,
  idsUnicos,
  resolverUrlEvidencia,
  nomeDownloadEvidencia,
  normalizarLegenda,
  conferirLinhaUnica,
  deveIgnorarAtalho,
  type EvidenciaVistoria,
  type UrlEvidencia,
} from "@/lib/equipe-tecnica/evidencias";

export default function ConsultorTecnico() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [showVistorias, setShowVistorias] = useState(false);
  const [selectedVistoria, setSelectedVistoria] = useState<any | null>(null);
  const [selectedClienteFilter, setSelectedClienteFilter] = useState<string>("todos");
  const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionValue, setCaptionValue] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [focusedPhotoIndex, setFocusedPhotoIndex] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { visitas: metricasVisitas } = useMetricasOperacionais();

  /** Reinicia todo o estado dependente do consultor/vistoria selecionados. */
  const resetEstadoConsultor = useCallback(() => {
    setShowVistorias(false);
    setSelectedVistoria(null);
    setSelectedClienteFilter("todos");
    setZoomedImageIndex(null);
    setSelectedPhotos([]);
    setFocusedPhotoIndex(null);
    setEditingCaption(null);
    setCaptionValue("");
  }, []);

  const selecionarConsultor = useCallback((consultor: any) => {
    resetEstadoConsultor();
    setSelected(consultor);
  }, [resetEstadoConsultor]);

  const fecharConsultor = useCallback(() => {
    resetEstadoConsultor();
    setSelected(null);
  }, [resetEstadoConsultor]);

  // Evidências da vistoria aberta (contrato: registros_consultor_arquivos).
  const arquivosVistoria: EvidenciaVistoria[] = useMemo(
    () => (selectedVistoria?.arquivos ?? []) as EvidenciaVistoria[],
    [selectedVistoria],
  );
  const filePaths = useMemo(
    () => arquivosVistoria.map((a) => a.arquivo_path).filter(Boolean) as string[],
    [arquivosVistoria],
  );
  const {
    urls: signedUrls,
    loading: signedLoading,
    error: signedError,
    refresh: refreshSignedUrls,
  } = useSignedUrls(filePaths);

  /** Fonte única da URL efetiva para grade, ampliação, miniatura e download. */
  const urlDaEvidencia = useCallback(
    (arquivo: EvidenciaVistoria | null | undefined): UrlEvidencia =>
      resolverUrlEvidencia(arquivo, signedUrls, { loading: signedLoading, error: signedError }),
    [signedUrls, signedLoading, signedError],
  );

  const updateCaptionMutation = useMutation({
    mutationFn: async ({ id, legenda, registroId }: { id: string; legenda: string; registroId: string }) => {
      // Escopo completo: a evidência precisa pertencer à vistoria aberta.
      const { data, error } = await supabase
        .from("registros_consultor_arquivos")
        .update({ legenda })
        .eq("id", id)
        .eq("registro_consultor_id", registroId)
        .select("id");
      if (error) throw error;
      const conferencia = conferirLinhaUnica(data);
      if (!conferencia.ok) throw new Error(conferencia.mensagem);
      return { id, legenda };
    },
    onSuccess: ({ id, legenda }) => {
      // Mantém a UI coerente sem recarregar tudo.
      setSelectedVistoria((atual: any) =>
        atual
          ? {
              ...atual,
              arquivos: (atual.arquivos ?? []).map((a: any) => (a.id === id ? { ...a, legenda } : a)),
            }
          : atual,
      );
      void queryClient.invalidateQueries({ queryKey: ["consultor-kpis"] });
      toast.success("Legenda atualizada!");
      setEditingCaption(null);
      setCaptionValue("");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Erro ao atualizar legenda");
    }
  });

  const handleUpdateCaption = (id: string) => {
    if (updateCaptionMutation.isPending) return;
    if (!selectedVistoria?.id) return;
    const normalizada = normalizarLegenda(captionValue);
    if (!normalizada.valida) {
      toast.error(normalizada.mensagem ?? "Legenda inválida");
      return;
    }
    updateCaptionMutation.mutate({ id, legenda: normalizada.valor, registroId: selectedVistoria.id });
  };

  /** Download seguro: URL efetiva já resolvida, extensão real e blob revogado. */
  const handleDownloadImage = useCallback(async (arquivo: EvidenciaVistoria, indice: number) => {
    const { url, estado } = urlDaEvidencia(arquivo);
    if (!url || estado !== "pronta") {
      toast.error("A imagem ainda não está disponível para download.");
      return;
    }
    let blobUrl: string | null = null;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Falha no download (${response.status})`);
      const blob = await response.blob();
      blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = nomeDownloadEvidencia(arquivo, selectedVistoria?.id ?? "visita", indice);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // Não abrimos a URL assinada em nova aba: é privada e pode estar expirada.
      toast.error("Não foi possível baixar a imagem. Tente novamente.");
    } finally {
      if (blobUrl) window.URL.revokeObjectURL(blobUrl);
    }
  }, [urlDaEvidencia, selectedVistoria]);

  const handleNextImage = useCallback(() => {
    if (arquivosVistoria.length && zoomedImageIndex !== null) {
      setZoomedImageIndex((prev) => (prev !== null && prev < arquivosVistoria.length - 1 ? prev + 1 : 0));
      setEditingCaption(null);
    }
  }, [arquivosVistoria, zoomedImageIndex]);

  const handlePrevImage = useCallback(() => {
    if (arquivosVistoria.length && zoomedImageIndex !== null) {
      setZoomedImageIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : arquivosVistoria.length - 1));
      setEditingCaption(null);
    }
  }, [arquivosVistoria, zoomedImageIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (zoomedImageIndex === null) return;
      if (deveIgnorarAtalho(e.target)) return;
      if (e.key === "ArrowRight") handleNextImage();
      if (e.key === "ArrowLeft") handlePrevImage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomedImageIndex, handleNextImage, handlePrevImage]);

  useEffect(() => {
    if (!selectedVistoria || zoomedImageIndex !== null) return;

    const handleGridKeyDown = (e: KeyboardEvent) => {
      if (deveIgnorarAtalho(e.target)) return;
      const files = arquivosVistoria;
      if (files.length === 0) return;

      if (focusedPhotoIndex === null) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "ArrowUp") {
          setFocusedPhotoIndex(0);
        }
        return;
      }

      let newIndex = focusedPhotoIndex;
      if (e.key === "ArrowRight") newIndex = Math.min(files.length - 1, focusedPhotoIndex + 1);
      if (e.key === "ArrowLeft") newIndex = Math.max(0, focusedPhotoIndex - 1);
      if (e.key === "ArrowDown") newIndex = Math.min(files.length - 1, focusedPhotoIndex + 3);
      if (e.key === "ArrowUp") newIndex = Math.max(0, focusedPhotoIndex - 3);

      if (e.key === " ") { // Barra de espaço seleciona
        e.preventDefault();
        const file = files[focusedPhotoIndex];
        setSelectedPhotos(prev =>
          prev.includes(file.id) ? prev.filter(id => id !== file.id) : [...prev, file.id]
        );
      }

      if (e.key === "Enter") { // Enter abre zoom
        setZoomedImageIndex(focusedPhotoIndex);
      }

      if (newIndex !== focusedPhotoIndex) {
        e.preventDefault();
        setFocusedPhotoIndex(newIndex);
      }
    };

    window.addEventListener("keydown", handleGridKeyDown);
    return () => window.removeEventListener("keydown", handleGridKeyDown);
  }, [selectedVistoria, arquivosVistoria, focusedPhotoIndex, zoomedImageIndex]);

  const {
    data: kpis,
    isLoading: loadingKpis,
    isError: erroKpis,
    refetch: refetchKpis,
    isFetching: fetchingKpis,
  } = useQuery({
    queryKey: ["consultor-kpis", selected?.user_id, selectedClienteFilter],
    enabled: !!selected?.user_id,
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      let query = supabase
        .from("registros_consultor")
        .select(`
          id,
          area_hectares,
          data_vistoria,
          status,
          observacoes_tecnicas,
          problema_principal,
          cliente_id,
          fazenda:fazendas(nome),
          talhao:talhoes(nome),
          arquivos:registros_consultor_arquivos(id, arquivo_url, arquivo_path, legenda, nome_arquivo)
        `)
        .eq("consultor_responsavel", selected.user_id)
        .gte("data_vistoria", start.toISOString().slice(0, 10));

      if (selectedClienteFilter !== "todos") {
        query = query.eq("cliente_id", selectedClienteFilter);
      }

      const { data, error } = await query.order('data_vistoria', { ascending: false });
      if (error) throw error;

      const vistorias = data?.length ?? 0;
      const area = (data ?? []).reduce((s: number, r: any) => s + Number(r.area_hectares ?? 0), 0);
      return { vistorias, area, list: data ?? [] };
    },
  });

  const {
    data: clientesVinc,
    isLoading: loadingClientes,
    isError: erroClientes,
    refetch: refetchClientes,
    isFetching: fetchingClientes,
  } = useQuery({
    queryKey: ["consultor-clientes", selected?.user_id],
    enabled: !!selected?.user_id,
    queryFn: async () => {
      const { data: vinc, error: erroVinc } = await supabase
        .from("user_clientes")
        .select("cliente_id, principal")
        .eq("user_id", selected.user_id)
        .eq("is_active", true);
      if (erroVinc) throw erroVinc;
      if (!vinc || vinc.length === 0) return [];
      const ids = idsUnicos(vinc.map((v: any) => v.cliente_id));
      if (ids.length === 0) return [];
      const { data: clientes, error: erroClientesQuery } = await supabase
        .from("clientes")
        .select("id, nome, nome_fantasia")
        .in("id", ids)
        .order("nome");
      if (erroClientesQuery) throw erroClientesQuery;
      return (clientes ?? []).map((c: any) => ({
        id: c.id,
        nome: c.nome_fantasia || c.nome,
        principal: vinc.find((v: any) => v.cliente_id === c.id)?.principal ?? false,
      }));
    },
  });

  const hasAmploAcesso = !!selected && temAcessoAmploClientes(selected.role);




  // Consultores são usuários com roles específicas (tecnico_agronomo, consultor_tecnico)
  const {
    data: consultoresData,
    isLoading,
    isError,
    error: consultoresError,
    refetch: refetchConsultores,
    isFetching,
  } = useQuery({
    queryKey: ["consultores-tecnicos"],
    queryFn: async () => {
      // 1. Buscar perfis que possuem roles de consultor/agrônomo
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", [...ROLES_EQUIPE_TECNICA]);
      if (rolesError) throw rolesError;

      if (!roles || roles.length === 0) return { consultores: [], orfaos: [] as string[] };

      const userIds = idsUnicos(roles.map(r => r.user_id));

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select(PROFILE_FIELDS)
        .in("user_id", userIds)
        .order("nome");
      if (profilesError) throw profilesError;

      return {
        consultores: mapConsultores(roles, profiles as any[]),
        orfaos: rolesOrfaos(roles, profiles as any[]),
      };
    }
  });

  const consultores = consultoresData?.consultores ?? [];
  const orfaos = consultoresData?.orfaos ?? [];
  const duplicados = useMemo(() => emailsDuplicados(consultores), [consultores]);
  const filtered = useMemo(() => filtrarConsultores(consultores, search), [consultores, search]);


  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Início</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Equipe Técnica</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipe Técnica</h1>
          <p className="text-sm text-muted-foreground">Gestão de agrônomos, consultores e responsáveis técnicos</p>
        </div>
      </div>


      {/* KPIs Rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Consultores</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono-data">
              {isLoading ? "…" : isError ? "—" : consultores.length}
            </div>

          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em Campo (Hoje)</CardTitle>
            <MapPin className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
             <div className="text-2xl font-bold font-mono-data">
               {metricasVisitas.isLoading
                 ? "…"
                 : metricasVisitas.error
                   ? "—"
                   : formatMetric(metricasVisitas.data?.totalCheckinsRealizados, "", 0)}
             </div>
             {!metricasVisitas.isLoading && metricasVisitas.error && (
               <p className="text-[11px] text-destructive mt-1">Indisponível no momento.</p>
             )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vistorias no Mês</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
             <div className="text-2xl font-bold font-mono-data">
               {metricasVisitas.isLoading
                 ? "…"
                 : metricasVisitas.error
                   ? "—"
                   : formatMetric(metricasVisitas.data?.totalVisitasRealizadas, "", 0)}
             </div>
             {!metricasVisitas.isLoading && metricasVisitas.error && (
               <p className="text-[11px] text-destructive mt-1">Indisponível no momento.</p>
             )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Área Coberta (ha)</CardTitle>
            <Map className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
             <div className="text-2xl font-bold font-mono-data">
               {metricasVisitas.isLoading ? "…" : "Sem dados suficientes"}
             </div>

          </CardContent>
        </Card>
      </div>

      {!isLoading && !isError && (orfaos.length > 0 || duplicados.length > 0) && (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {orfaos.length > 0 && (
            <p>{orfaos.length} usuário(s) com papel técnico sem cadastro de perfil correspondente.</p>
          )}
          {duplicados.length > 0 && (
            <p>{duplicados.length} e-mail(s) repetido(s) entre perfis técnicos — verifique cadastros duplicados.</p>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input 
              placeholder="Buscar por nome, e-mail ou CREA..." 
              aria-label="Buscar consultor por nome, e-mail ou CREA"
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />

          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Consultor / Agrônomo</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Cargo / Função</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <p className="text-sm text-destructive">
                      Não foi possível carregar a equipe técnica.
                      {(consultoresError as any)?.message ? ` (${(consultoresError as any).message})` : ""}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => { void refetchConsultores(); }}
                      disabled={isFetching}
                    >
                      {isFetching ? "Tentando..." : "Tentar novamente"}
                    </Button>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {search.trim()
                      ? "Nenhum consultor corresponde à busca"
                      : "Nenhum consultor cadastrado. O cadastro é feito em Configurações > Usuários."}
                  </TableCell>
                </TableRow>
              ) : (

                filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => selecionarConsultor(c)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium text-sm">{c.nome}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> {c.email || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal text-[10px] uppercase tracking-wider">
                        {ROLE_LABELS[c.role] || c.role || 'Consultor'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isConsultorAtivo(c as any) ? (
                        <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-200 text-[10px] uppercase tracking-wider">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Inativo</Badge>
                      )}
                    </TableCell>

                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações de ${c.nome ?? "consultor"}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-xs" onClick={() => selecionarConsultor(c)}>Ver Perfil Completo</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs" onClick={() => toast.info("Edição de cadastro disponível via Configurações > Usuários.")}>Editar Cadastro</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))

              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) fecharConsultor(); }}>



        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Consultor</DialogTitle>
            <DialogDescription>Informações do cadastro profissional</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {!showVistorias ? (
                <>
                  <div className="flex items-center gap-3 pb-3 border-b">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-base">{selected.nome}</span>
                      <Badge variant="secondary" className="w-fit mt-1 font-normal text-[10px] uppercase tracking-wider">
                        {ROLE_LABELS[selected.role] || selected.role || 'Consultor'}
                      </Badge>
                    </div>
                    {isConsultorAtivo(selected) ? (
                      <Badge variant="default" className="ml-auto bg-green-500/10 text-green-600 border-green-200 text-[10px] uppercase tracking-wider">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-auto text-[10px] uppercase tracking-wider">Inativo</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground">E-mail</div>
                        <div className="break-all">{selected.email || '—'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Atividade Recente (Mês Atual)</div>

                      {clientesVinc && clientesVinc.length > 0 && (
                        <select
                          id="filtro-cliente-consultor"
                          aria-label="Filtrar atividade por cliente"
                          value={selectedClienteFilter}
                          onChange={(e) => setSelectedClienteFilter(e.target.value)}
                          className="text-[10px] bg-muted border rounded px-2 py-1 outline-none focus:ring-1 ring-primary/30"
                        >
                          <option value="todos">Todos os Clientes</option>
                          {clientesVinc.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {erroKpis ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
                        <p className="text-xs text-destructive">Não foi possível carregar a atividade deste consultor.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 text-[11px]"
                          onClick={() => { void refetchKpis(); }}
                          disabled={fetchingKpis}
                        >
                          {fetchingKpis ? "Tentando..." : "Tentar novamente"}
                        </Button>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setShowVistorias(true)}
                        className="rounded-lg border p-3 text-left hover:border-primary/50 transition-colors group flex flex-col justify-between"
                        disabled={loadingKpis || (kpis?.vistorias ?? 0) === 0}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ClipboardCheck className="h-3 w-3" /> Vistorias / mês</div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="text-lg font-bold font-mono-data mt-1 group-hover:text-primary transition-colors">
                          {loadingKpis ? "…" : (kpis?.vistorias ?? 0)}
                        </div>
                      </button>
                      <div className="rounded-lg border p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> Área coberta (ha)</div>
                        <div className="text-lg font-bold font-mono-data mt-1">
                          {loadingKpis ? "…" : (kpis?.area ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                </>
              ) : !selectedVistoria ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <button 
                      onClick={() => setShowVistorias(false)}
                      className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      ← Voltar ao perfil
                    </button>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Relação de Visitas do Mês</span>
                  </div>

                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-3">
                      {kpis?.list && kpis.list.length > 0 ? (
                        kpis.list.map((v: any, idx: number) => (
                          <div 
                            key={v.id} 
                            className="space-y-2 cursor-pointer group"
                            onClick={() => setSelectedVistoria(v)}
                          >
                            <div className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm font-medium group-hover:text-primary transition-colors">{formatDateDisplay(v.data_vistoria)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span>
                                    {v.fazenda?.nome || 'Fazenda não informada'} 
                                    {v.talhao?.nome && ` • Talhão ${v.talhao.nome}`}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <Badge variant="outline" className="font-mono-data text-[10px]">
                                  {Number(v.area_hectares || 0).toLocaleString("pt-BR")} ha
                                </Badge>
                                <Badge variant="secondary" className="text-[9px] uppercase tracking-tighter h-4">
                                  {v.status || 'Finalizado'}
                                </Badge>
                              </div>
                            </div>
                            {idx < kpis.list.length - 1 && <Separator className="opacity-50" />}
                          </div>
                        ))
                      ) : erroKpis ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-destructive">Não foi possível carregar as visitas.</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 text-[11px]"
                            onClick={() => { void refetchKpis(); }}
                            disabled={fetchingKpis}
                          >
                            {fetchingKpis ? "Tentando..." : "Tentar novamente"}
                          </Button>
                        </div>
                      ) : loadingKpis ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">Carregando visitas…</div>
                      ) : (
                        <div className="text-center py-8 text-sm text-muted-foreground">Nenhuma visita registrada neste mês.</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
                  <div className="flex items-center justify-between border-b pb-2">
                    <button
                      onClick={() => {
                        setSelectedVistoria(null);
                        setSelectedPhotos([]);
                        setFocusedPhotoIndex(null);
                        setZoomedImageIndex(null);
                        setEditingCaption(null);
                        setCaptionValue("");
                      }}
                      className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      ← Voltar à lista
                    </button>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Detalhes da Visita</span>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground">Data da Visita</span>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-primary" />
                          {formatDateDisplay(selectedVistoria.data_vistoria)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground">Status</span>
                        <div>
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                            {selectedVistoria.status || 'Finalizado'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">Localização</span>
                      <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/30">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <span>
                          {selectedVistoria.fazenda?.nome || 'Fazenda não informada'} 
                          {selectedVistoria.talhao?.nome && ` • Talhão ${selectedVistoria.talhao.nome}`}
                        </span>
                      </div>
                    </div>

                    {selectedVistoria.problema_principal && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground">Problema Principal</span>
                        <div className="text-sm p-3 rounded-md bg-red-500/5 border border-red-500/10 text-red-700 dark:text-red-400">
                          {selectedVistoria.problema_principal}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">Observações Técnicas</span>
                      <div className="text-sm p-3 rounded-md bg-muted/50 border min-h-[80px] leading-relaxed italic">
                        {selectedVistoria.observacoes_tecnicas || "Nenhuma observação técnica registrada."}
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                          <Camera className="h-3 w-3" /> Evidências e Fotos
                        </span>

                        {arquivosVistoria.length > 0 && (
                          <VistoriaFilesHeader
                            arquivos={arquivosVistoria}
                            selectedPhotos={selectedPhotos}
                            onSelectAll={() => setSelectedPhotos(arquivosVistoria.map((f) => f.id))}
                            onClear={() => setSelectedPhotos([])}
                            onDownload={handleDownloadImage}
                            urlDaEvidencia={urlDaEvidencia}
                          />
                        )}
                      </div>

                      {signedError && filePaths.length > 0 && (
                        <div
                          role="alert"
                          className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                        >
                          <span>Não foi possível gerar os links seguros das evidências.</span>
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => refreshSignedUrls()}>
                            Tentar novamente
                          </Button>
                        </div>
                      )}

                      {arquivosVistoria.length > 0 ? (
                        <VistoriaFilesGrid
                          arquivos={arquivosVistoria}
                          selectedPhotos={selectedPhotos}
                          onTogglePhoto={(id) => setSelectedPhotos(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])}
                          focusedPhotoIndex={focusedPhotoIndex}
                          onFocusPhoto={setFocusedPhotoIndex}
                          onZoomPhoto={setZoomedImageIndex}
                          urlDaEvidencia={urlDaEvidencia}
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground bg-muted/20 p-4 rounded-md border border-dashed text-center">
                          Nenhuma foto anexada a esta visita.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}




              {!showVistorias && (
                <div className="pt-3 border-t">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Clientes Atendidos
                  </div>
                  {loadingClientes ? (
                    <div className="text-xs text-muted-foreground">Carregando…</div>
                  ) : erroClientes ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                      <p className="text-xs text-destructive">Não foi possível carregar os clientes vinculados.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-[11px]"
                        onClick={() => { void refetchClientes(); }}
                        disabled={fetchingClientes}
                      >
                        {fetchingClientes ? "Tentando..." : "Tentar novamente"}
                      </Button>
                    </div>
                  ) : clientesVinc && clientesVinc.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {clientesVinc.map((c: any) => (
                        <Badge
                          key={c.id}
                          variant={c.principal ? "default" : "secondary"}
                          className="font-normal text-xs"
                        >
                          {c.nome}{c.principal ? " • Principal" : ""}
                        </Badge>
                      ))}
                    </div>
                  ) : hasAmploAcesso ? (
                    <div className="text-xs text-muted-foreground italic">
                      Acesso a todos os clientes (perfil {ROLE_LABELS[selected.role] || selected.role})
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground italic">Nenhum cliente vinculado</div>
                  )}
                </div>
              )}



            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={fecharConsultor}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={zoomedImageIndex !== null} onOpenChange={(o) => {
        if (!o) {
          setZoomedImageIndex(null);
          setEditingCaption(null);
          setCaptionValue("");
        }
      }}>

        <DialogContent
          className="max-w-4xl p-0 overflow-visible bg-transparent border-none shadow-none flex flex-col items-center justify-center h-[90vh] outline-none"
          onClick={() => setZoomedImageIndex(null)}
        >
          {zoomedImageIndex !== null && arquivosVistoria[zoomedImageIndex] && (() => {
            const atual = arquivosVistoria[zoomedImageIndex];
            const { url: urlAtual, estado: estadoAtual } = urlDaEvidencia(atual);
            const pronta = estadoAtual === "pronta" && !!urlAtual;
            return (
            <>
              <div
                className="relative w-full h-full flex flex-col items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >

                {/* Imagem principal */}
                <div className="relative group/main">
                  {pronta ? (
                    <img
                      src={urlAtual!}
                      alt={atual.legenda || `Evidência ${zoomedImageIndex + 1}`}
                      className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
                    />
                  ) : (
                    <div className="w-[60vw] max-w-xl h-[50vh] rounded-lg bg-black/60 border border-white/10 flex flex-col items-center justify-center gap-3 text-white/80">
                      {estadoAtual === "carregando" ? (
                        <>
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <span className="text-xs">Gerando link seguro…</span>
                        </>
                      ) : (
                        <>
                          <ImageOff className="h-6 w-6" />
                          <span className="text-xs">Não foi possível carregar a evidência.</span>
                          <Button variant="secondary" size="sm" className="h-7 text-[11px]" onClick={() => refreshSignedUrls()}>
                            Tentar novamente
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Botão de download no topo da imagem */}
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    <Badge variant="secondary" className="bg-black/50 text-white border-white/10 backdrop-blur-sm px-3 py-1 font-mono-data">
                      {zoomedImageIndex + 1} / {arquivosVistoria.length}
                    </Badge>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="rounded-full bg-black/50 hover:bg-black/80 text-white border-white/10 backdrop-blur-sm transition-all hover:scale-110 active:scale-95 shadow-xl"
                      disabled={!pronta}
                      aria-label="Baixar imagem"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDownloadImage(atual, zoomedImageIndex);
                      }}
                      title="Baixar imagem"
                    >
                      <Download className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* Legenda na imagem ampliada */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-md">
                    {editingCaption === atual.id ? (
                      <div className="flex gap-2 bg-black/80 p-2 rounded-lg backdrop-blur-sm border border-white/10 shadow-xl">
                        <Input
                          value={captionValue}
                          onChange={(e) => setCaptionValue(e.target.value)}
                          placeholder="Digite a legenda..."
                          aria-label="Legenda da evidência"
                          className="h-8 bg-white/10 border-white/20 text-white text-xs placeholder:text-white/40"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateCaption(atual.id); }}
                        />
                        <Button
                          size="icon"
                          className="h-8 w-8 shrink-0 bg-primary hover:bg-primary/80"
                          aria-label="Salvar legenda"
                          onClick={() => handleUpdateCaption(atual.id)}
                          disabled={updateCaptionMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-white hover:bg-white/10"
                          aria-label="Cancelar edição da legenda"
                          onClick={() => { setEditingCaption(null); setCaptionValue(""); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="bg-black/60 hover:bg-black/80 backdrop-blur-sm p-3 rounded-lg border border-white/10 text-center transition-all group/caption shadow-xl">
                        <p className="text-white text-sm">
                          {atual.legenda || "Sem legenda"}
                        </p>
                        <button
                          onClick={() => {
                            setEditingCaption(atual.id);
                            setCaptionValue(atual.legenda || "");
                          }}
                          className="mt-1 text-[10px] text-primary hover:underline flex items-center gap-1 mx-auto opacity-0 group-hover/caption:opacity-100 transition-opacity"
                        >
                          <Edit2 className="h-3 w-3" /> Editar legenda
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Setas de navegação */}
                {arquivosVistoria.length > 1 && (
                  <>
                    <button
                      aria-label="Imagem anterior"
                      onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                      className="absolute left-[-60px] top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full transition-all hover:scale-110 active:scale-95 shadow-xl border border-white/10"
                    >
                      <ChevronLeft className="h-8 w-8" />
                    </button>
                    <button
                      aria-label="Próxima imagem"
                      onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                      className="absolute right-[-60px] top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full transition-all hover:scale-110 active:scale-95 shadow-xl border border-white/10"
                    >
                      <ChevronRight className="h-8 w-8" />
                    </button>
                  </>
                )}

              </div>

              {/* Miniaturas */}
              {arquivosVistoria.length > 1 && (
                <div className="mt-8 flex gap-2 overflow-x-auto p-4 max-w-full scrollbar-hide bg-black/20 rounded-xl backdrop-blur-sm border border-white/5">
                  {arquivosVistoria.map((file, idx) => {
                    const mini = urlDaEvidencia(file);
                    return (
                      <button
                        key={file.id}
                        aria-label={`Abrir evidência ${idx + 1}`}
                        onClick={() => { setZoomedImageIndex(idx); setEditingCaption(null); setCaptionValue(""); }}
                        className={cn(
                          "relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all shrink-0",
                          zoomedImageIndex === idx
                            ? "border-primary scale-110 shadow-[0_0_15px_rgba(var(--primary),0.5)] z-10"
                            : "border-transparent opacity-40 hover:opacity-100 hover:scale-105"
                        )}
                      >
                        {mini.estado === "pronta" && mini.url ? (
                          <img src={mini.url} className="w-full h-full object-cover" alt={`Miniatura ${idx + 1}`} />
                        ) : (
                          <div className="w-full h-full bg-black/50 flex items-center justify-center">
                            {mini.estado === "carregando"
                              ? <Loader2 className="h-4 w-4 animate-spin text-white/70" />
                              : <ImageOff className="h-4 w-4 text-white/70" />}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

            </>
            );
          })()}
        </DialogContent>
      </Dialog>

    </div>
  );
}

// --- Sub-componentes auxiliares ---

function VistoriaFilesHeader({
  arquivos,
  selectedPhotos,
  onSelectAll,
  onClear,
  onDownload,
  urlDaEvidencia,
}: {
  arquivos: EvidenciaVistoria[];
  selectedPhotos: string[];
  onSelectAll: () => void;
  onClear: () => void;
  onDownload: (arquivo: EvidenciaVistoria, indice: number) => void | Promise<void>;
  urlDaEvidencia: (a: EvidenciaVistoria) => UrlEvidencia;
}) {
  const selecionadas = arquivos
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => selectedPhotos.includes(f.id));
  const prontas = selecionadas.filter(({ f }) => urlDaEvidencia(f).estado === "pronta");

  return (
    <div className="flex items-center gap-2">
      {selectedPhotos.length > 0 ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px] gap-1.5"
          disabled={prontas.length === 0}
          onClick={() => {
            prontas.forEach(({ f, idx }, ordem) => {
              setTimeout(() => { void onDownload(f, idx); }, ordem * 300);
            });
          }}
        >
          <Download className="h-3 w-3" /> Baixar Selecionadas ({prontas.length})
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px] gap-1.5 text-muted-foreground hover:text-primary"
          onClick={onSelectAll}
        >
          Selecionar Todas
        </Button>
      )}
      {selectedPhotos.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px] text-muted-foreground"
          onClick={onClear}
        >
          Limpar
        </Button>
      )}
    </div>
  );
}

function VistoriaFilesGrid({
  arquivos,
  selectedPhotos,
  onTogglePhoto,
  focusedPhotoIndex,
  onFocusPhoto,
  onZoomPhoto,
  urlDaEvidencia,
}: {
  arquivos: EvidenciaVistoria[];
  selectedPhotos: string[];
  onTogglePhoto: (id: string) => void;
  focusedPhotoIndex: number | null;
  onFocusPhoto: (idx: number | null) => void;
  onZoomPhoto: (idx: number) => void;
  urlDaEvidencia: (a: EvidenciaVistoria) => UrlEvidencia;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {arquivos.map((file, idx) => {
        const isSelected = selectedPhotos.includes(file.id);
        const isFocused = focusedPhotoIndex === idx;
        const { url, estado } = urlDaEvidencia(file);
        const pronta = estado === "pronta" && !!url;

        return (
          <div
            key={file.id}
            className={cn(
              "relative aspect-square rounded-md overflow-hidden bg-muted group transition-all ring-offset-background outline-none",
              isSelected ? "ring-2 ring-primary scale-[0.98]" : "hover:ring-1 hover:ring-primary/50",
              isFocused && "ring-2 ring-primary ring-offset-2 z-10"
            )}
            tabIndex={0}
            onFocus={() => onFocusPhoto(idx)}
            onBlur={() => onFocusPhoto(null)}
          >
            {pronta ? (
              <img
                src={url!}
                alt={file.legenda || `Evidência ${idx + 1}`}
                className="w-full h-full object-cover cursor-zoom-in"
                onClick={() => onZoomPhoto(idx)}
              />
            ) : (
              <div
                className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground"
                aria-label={estado === "carregando" ? "Carregando evidência" : "Evidência indisponível"}
              >
                {estado === "carregando"
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ImageOff className="h-4 w-4" />}
                <span className="text-[9px] px-1 text-center leading-tight">
                  {estado === "carregando" ? "Carregando…" : "Indisponível"}
                </span>
              </div>
            )}

            <div
              className={cn(
                "absolute top-1.5 left-1.5 h-4 w-4 rounded-sm border flex items-center justify-center cursor-pointer transition-all z-20",
                isSelected ? "bg-primary border-primary text-white" : "bg-black/20 border-white/40 opacity-0 group-hover:opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePhoto(file.id);
              }}
            >
              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
            </div>

            {pronta && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex flex-col items-center justify-center p-2 text-center">
                <Eye className="h-5 w-5 text-white mb-1" />
                {file.legenda && (
                  <span className="text-[10px] text-white font-medium line-clamp-2 leading-tight px-1">
                    {file.legenda}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
