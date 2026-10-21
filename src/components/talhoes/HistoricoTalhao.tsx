import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AttachmentPager } from "@/components/shared/AttachmentPager";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  FileText,
  Droplets,
  Camera,
  Calendar,
  Inbox,
  TrendingUp,
  Repeat,
  Clock,
  MapPin,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateDisplay } from "@/lib/date-utils";

interface TimelineItem {
  id: string;
  date: string;
  type: "solicitacao" | "ocorrencia" | "recomendacao" | "aplicacao" | "os";
  title: string;
  subtitle: string;
  status?: string;
  fotos?: string[];
  fotosPaths?: string[];
  latitude?: number | null;
  longitude?: number | null;
  registroId?: string;
}

interface Props {
  talhaoId: string;
  /** Limita a altura do scroll (modo embutido). Padrão: usa altura natural. */
  maxHeight?: string;
}

export function HistoricoTalhao({ talhaoId, maxHeight }: Props) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isProdutor = role === "cliente_produtor";
  const roteiroBaseHref = (registroId: string) =>
    isProdutor ? `/portal/registros/${registroId}` : `/visita-tecnica/${registroId}?tab=roteiro`;

  // Solicitações que apontam para esse talhão
  const { data: solicitacoes } = useQuery({
    queryKey: ["historico-talhao-solicitacoes", talhaoId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("portal_solicitacoes")
        .select("id, created_at, tipo_demanda, urgencia, status, descricao")
        .eq("talhao_id", talhaoId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  // Registros do consultor (visitas)
  const { data: registros } = useQuery({
    queryKey: ["historico-talhao-registros", talhaoId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("registros_consultor")
        .select(
          "id, data_vistoria, objetivo_visita, problema_principal, categoria_problema, nivel_pressao, status, latitude, longitude"
        )
        .eq("talhao_id", talhaoId)
        .order("data_vistoria", { ascending: false });
      return data || [];
    },
  });

  // Recomendações vinculadas aos registros
  const { data: recomendacoes } = useQuery({
    queryKey: ["historico-talhao-recomendacoes", talhaoId, registros?.length],
    queryFn: async () => {
      if (!registros?.length) return [];
      const ids = registros.map((r) => r.id);
      const { data } = await (supabase as any)
        .from("registros_consultor_recomendacoes")
        .select(
          "id, registro_consultor_id, recomendacao_tecnica, dose_recomendada_valor, dose_recomendada_unidade, created_at, produtos:produto_biologico_sugerido_id(nome)"
        )
        .in("registro_consultor_id", ids);
      return data || [];
    },
    enabled: !!registros?.length,
  });

  // Fotos por registro
  const { data: arquivos } = useQuery({
    queryKey: ["historico-talhao-arquivos", talhaoId, registros?.length],
    queryFn: async () => {
      if (!registros?.length) return [];
      const ids = registros.map((r) => r.id);
      const { data } = await (supabase as any)
        .from("registros_consultor_arquivos")
        .select("registro_consultor_id, arquivo_url, arquivo_path")
        .in("registro_consultor_id", ids);
      return data || [];
    },
    enabled: !!registros?.length,
  });

  // OS de Produção (recomendações operacionalizadas)
  const { data: ordens } = useQuery({
    queryKey: ["historico-talhao-os", talhaoId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ordens_servico_onfarm")
        .select(
          "id, numero_os, created_at, data_recomendada, status, dose_ml_ha, area_hectares, produtos:produto_id(nome)"
        )
        .eq("talhao_id", talhaoId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  // Aplicações (vinculadas via OS clássica)
  const { data: aplicacoes } = useQuery({
    queryKey: ["historico-talhao-aplicacoes", talhaoId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("aplicacoes")
        .select(
          "id, data_aplicacao, dose_aplicada, resultado_inicial, ordens_servico!inner(talhao_id, produtos(nome))"
        )
        .eq("ordens_servico.talhao_id", talhaoId)
        .order("data_aplicacao", { ascending: false });
      return data || [];
    },
  });

  const isLoading = !registros || !solicitacoes || !ordens || !aplicacoes;

  // Build timeline
  const timeline: TimelineItem[] = [];

  (solicitacoes as any[])?.forEach((s) => {
    timeline.push({
      id: `sol-${s.id}`,
      date: s.created_at,
      type: "solicitacao",
      title: s.tipo_demanda || "Solicitação",
      subtitle: s.descricao?.slice(0, 80) || "",
      status: s.urgencia,
    });
  });

  (registros as any[])?.forEach((r) => {
    const rArquivos = (arquivos as any[])?.filter((a) => a.registro_consultor_id === r.id) || [];
    const fotos = rArquivos.map((a) => a.arquivo_url);
    const fotosPaths = rArquivos.map((a) => a.arquivo_path).filter(Boolean) as string[];

    timeline.push({
      id: `reg-${r.id}`,
      date: r.data_vistoria,
      type: "ocorrencia",
      title: r.objetivo_visita || r.problema_principal || "Vistoria",
      subtitle: r.categoria_problema?.replace(/_/g, " ") || "",
      status: r.nivel_pressao || undefined,
      fotos,
      fotosPaths,
      latitude: r.latitude,
      longitude: r.longitude,
      registroId: r.id,
    });
  });

  recomendacoes?.forEach((rec: any) => {
    timeline.push({
      id: `rec-${rec.id}`,
      date: rec.created_at,
      type: "recomendacao",
      title: rec.produtos?.nome || "Recomendação técnica",
      subtitle: rec.dose_recomendada_valor
        ? `${rec.dose_recomendada_valor} ${rec.dose_recomendada_unidade || "mL/ha"}`
        : rec.recomendacao_tecnica?.slice(0, 80) || "",
    });
  });

  ordens?.forEach((o: any) => {
    timeline.push({
      id: `os-${o.id}`,
      date: o.created_at,
      type: "os",
      title: `${o.numero_os || `OS-${o.id.slice(0, 8).toUpperCase()}`} — ${o.produtos?.nome || "Produto"}`,
      subtitle: `${o.dose_ml_ha ? `${o.dose_ml_ha} mL/ha` : ""} ${o.area_hectares ? `• ${o.area_hectares}ha` : ""}`.trim(),
      status: o.status,
    });
  });

  aplicacoes?.forEach((a: any) => {
    timeline.push({
      id: `apl-${a.id}`,
      date: a.data_aplicacao,
      type: "aplicacao",
      title: a.ordens_servico?.produtos?.nome || "Aplicação",
      subtitle: `${a.dose_aplicada ? `${a.dose_aplicada} mL/ha` : ""} ${a.resultado_inicial || ""}`.trim(),
    });
  });

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Indicadores de recorrência
  const problemasMap = new Map<string, number>();
  (registros as any[])?.forEach((r) => {
    const key = r.problema_principal || r.categoria_problema;
    if (key) problemasMap.set(key, (problemasMap.get(key) || 0) + 1);
  });
  const topProblemas = Array.from(problemasMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const ultimaAplicacao = (aplicacoes as any[])?.[0];
  const totalSolicitacoes = solicitacoes?.length || 0;
  const totalVisitas = registros?.length || 0;

  const typeConfig = {
    solicitacao: {
      icon: Inbox,
      color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
      label: "Solicitação",
    },
    ocorrencia: {
      icon: AlertTriangle,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
      label: "Visita",
    },
    recomendacao: {
      icon: FileText,
      color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40",
      label: "Recomendação",
    },
    os: {
      icon: Clock,
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40",
      label: "OS de Produção",
    },
    aplicacao: {
      icon: Droplets,
      color: "text-sky-600 bg-sky-50 dark:bg-sky-950/40",
      label: "Aplicação",
    },
  };

  const pressaoColor: Record<string, string> = {
    baixo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    medio: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    alto: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    severo: "bg-destructive/15 text-destructive",
  };

  const allPaths = useMemo(() => {
    const paths: string[] = [];
    timeline.forEach(item => {
      if (item.fotosPaths) paths.push(...item.fotosPaths);
    });
    return paths;
  }, [timeline]);

  const { urls: signedUrls, pagination: attachmentPage } = useSignedUrls(allPaths);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }



  return (
    <div className="space-y-4">
      <AttachmentPager pagination={attachmentPage} />
      {/* Indicadores rápidos de recorrência */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Inbox className="h-3 w-3" /> Solicitações
            </div>
            <p className="text-2xl font-bold mt-1">{totalSolicitacoes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <AlertTriangle className="h-3 w-3" /> Visitas
            </div>
            <p className="text-2xl font-bold mt-1">{totalVisitas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Droplets className="h-3 w-3" /> Aplicações
            </div>
            <p className="text-2xl font-bold mt-1">{aplicacoes?.length || 0}</p>
            {ultimaAplicacao && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Última: {formatDateDisplay(ultimaAplicacao.data_aplicacao)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Repeat className="h-3 w-3" /> Recorrências
            </div>
            <p className="text-2xl font-bold mt-1">{topProblemas.length}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">problemas distintos</p>
          </CardContent>
        </Card>
      </div>

      {/* Top problemas recorrentes */}
      {topProblemas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Problemas mais frequentes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {topProblemas.map(([problema, count]) => (
                <Badge key={problema} variant="secondary" className="capitalize">
                  {problema.replace(/_/g, " ")} <span className="ml-1.5 opacity-70">×{count}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico unificado ({timeline.length})</CardTitle>
        </CardHeader>
        <CardContent
          className={maxHeight ? "overflow-y-auto" : ""}
          style={maxHeight ? { maxHeight } : undefined}
        >
          {timeline.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              Nenhum registro neste talhão
            </p>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
              <div className="space-y-3">
                {timeline.map((item) => {
                  const config = typeConfig[item.type];
                  const Icon = config.icon;
                  return (
                    <div key={item.id} className="relative pl-10">
                      <div
                        className={`absolute left-1.5 top-2 w-5 h-5 rounded-full flex items-center justify-center ${config.color}`}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="rounded-md border border-border p-3 bg-card">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">
                              {item.title}
                            </p>
                            {item.subtitle && (
                              <p className="text-xs text-muted-foreground capitalize">
                                {item.subtitle}
                              </p>
                            )}
                          </div>
                          {item.status && (
                            <Badge
                              className={`text-[10px] ${pressaoColor[item.status] || ""}`}
                              variant="secondary"
                            >
                              {item.status}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-2">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {format(new Date(item.date), "dd 'de' MMM yyyy", { locale: ptBR })}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-4">
                            {config.label}
                          </Badge>
                          {item.latitude && item.longitude && (
                            <div className="flex items-center gap-1 text-[10px] text-primary font-medium hover:underline cursor-pointer" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`, '_blank')}>
                              <MapPin className="h-3 w-3" />
                              <span>{item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</span>
                            </div>
                          )}
                        </div>
                        {item.fotos && item.fotos.length > 0 && (
                          <div className="flex gap-1.5 overflow-x-auto pt-2">
                            {item.fotos.slice(0, 6).map((url, i) => {
                              const path = item.fotosPaths?.[i];
                              const effectiveUrl = (path && signedUrls[path]) || null; // sem fallback para URL gravada
                              if (!effectiveUrl) return null;
                              return (
                                <img
                                  key={i}
                                  src={effectiveUrl}
                                  alt=""
                                  className="w-14 h-14 rounded-md object-cover shrink-0"
                                />
                              );
                            })}
                            {item.fotos.length > 6 && (
                              <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <Camera className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  +{item.fotos.length - 6}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {item.registroId && item.type === "ocorrencia" && (
                          <div className="pt-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-primary hover:text-primary"
                              onClick={() => navigate(roteiroBaseHref(item.registroId!))}
                            >
                              <History className="h-3 w-3 mr-1" /> Ver roteiro da visita
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
