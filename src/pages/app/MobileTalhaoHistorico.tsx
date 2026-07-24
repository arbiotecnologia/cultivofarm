import { formatDateDisplay } from "@/lib/date-utils";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Layers,
  AlertTriangle,
  FileText,
  Droplets,
  Camera,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePortalCliente } from "@/hooks/usePortalCliente";

interface TimelineItem {
  id: string;
  date: string;
  type: "ocorrencia" | "recomendacao" | "aplicacao";
  title: string;
  subtitle: string;
  status?: string;
  fotos?: string[];
  fotosPaths?: string[];
}

export default function MobileTalhaoHistorico() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { clienteId } = usePortalCliente();
  const isProdutor = role === "cliente_produtor";

  const { data: talhao, isLoading: talhaoLoading } = useQuery({
    queryKey: ["mobile-talhao", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("talhoes")
        .select("*, fazendas(nome, cliente_id, clientes(nome)), culturas(nome)")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const blockProdutor =
    isProdutor && !talhaoLoading && !!talhao && !!clienteId &&
    (talhao.fazendas as any)?.cliente_id !== clienteId;



  const { data: registros } = useQuery({
    queryKey: ["mobile-talhao-registros", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("registros_consultor")
        .select("id, data_vistoria, objetivo_visita, problema_principal, categoria_problema, nivel_pressao, status")
        .eq("talhao_id", id!)
        .order("data_vistoria", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: arquivos } = useQuery({
    queryKey: ["mobile-talhao-arquivos", id],
    queryFn: async () => {
      if (!registros?.length) return [];
      const ids = registros.map((r) => r.id);
      const { data } = await supabase
        .from("registros_consultor_arquivos")
        .select("registro_consultor_id, arquivo_url, arquivo_path")
        .in("registro_consultor_id", ids);
      return data || [];
    },
    enabled: !!registros?.length,
  });

  const { data: aplicacoes } = useQuery({
    queryKey: ["mobile-talhao-aplicacoes", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("aplicacoes")
        .select("id, data_aplicacao, dose_aplicada, resultado_inicial, observacoes, ordens_servico!inner(talhao_id, produtos(nome))")
        .eq("ordens_servico.talhao_id", id!)
        .order("data_aplicacao", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  // Build timeline
  const timeline: TimelineItem[] = [];

  registros?.forEach((r) => {
    const rArquivos = arquivos?.filter((a) => a.registro_consultor_id === r.id) || [];
    const fotos = rArquivos.map((a) => a.arquivo_url);
    const fotosPaths = rArquivos.map((a) => a.arquivo_path).filter(Boolean) as string[];

    timeline.push({
      id: r.id,
      date: r.data_vistoria,
      type: "ocorrencia",
      title: r.objetivo_visita || r.problema_principal || "Vistoria",
      subtitle: r.categoria_problema?.replace(/_/g, " ") || "",
      status: r.nivel_pressao || undefined,
      fotos,
      fotosPaths,
    });
  });

  aplicacoes?.forEach((a) => {
    timeline.push({
      id: a.id,
      date: a.data_aplicacao,
      type: "aplicacao",
      title: (a.ordens_servico as any)?.produtos?.nome || "Aplicação",
      subtitle: `${a.dose_aplicada ? `${a.dose_aplicada} mL/ha` : ""} ${a.resultado_inicial || ""}`.trim(),
    });
  });

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const typeConfig = {
    ocorrencia: { icon: AlertTriangle, color: "text-amber-600 bg-amber-50", label: "Ocorrência" },
    recomendacao: { icon: FileText, color: "text-purple-600 bg-purple-50", label: "Recomendação" },
    aplicacao: { icon: Droplets, color: "text-sky-600 bg-sky-50", label: "Aplicação" },
  };

  const pressaoColor: Record<string, string> = {
    baixo: "bg-emerald-100 text-emerald-700",
    medio: "bg-amber-100 text-amber-700",
    alto: "bg-orange-100 text-orange-700",
    severo: "bg-red-100 text-red-700",
  };

  const allPaths = useMemo(() => {
    const paths: string[] = [];
    timeline.forEach(item => {
      if (item.fotosPaths) paths.push(...item.fotosPaths);
    });
    return paths;
  }, [timeline]);

  const { urls: signedUrls } = useSignedUrls(allPaths);

  if (blockProdutor) {
    return <Navigate to="/app/fazendas" replace />;
  }

  return (

    <div className="p-4 space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">{talhao?.nome || "Talhão"}</h1>
          <p className="text-xs text-muted-foreground">
            {(talhao?.fazendas as any)?.nome} • {(talhao?.fazendas as any)?.clientes?.nome}
          </p>
        </div>
      </div>

      {/* Info card */}
      <Card className="p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Layers className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {talhao?.area_hectares && (
              <Badge variant="secondary">{talhao.area_hectares} ha</Badge>
            )}
            {(talhao?.culturas as any)?.nome && (
              <Badge variant="outline">{(talhao.culturas as any).nome}</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Timeline */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Histórico ({timeline.length})
        </h2>

        {timeline.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhum registro neste talhão
          </p>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-4 bottom-4 w-px bg-border" />

            <div className="space-y-4">
              {timeline.map((item) => {
                const config = typeConfig[item.type];
                const Icon = config.icon;

                return (
                  <div key={item.id} className="relative pl-10">
                    {/* Dot */}
                    <div className={`absolute left-1.5 top-2 w-5 h-5 rounded-full flex items-center justify-center ${config.color}`}>
                      <Icon className="h-3 w-3" />
                    </div>

                    <Card className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm text-foreground">{item.title}</p>
                          {item.subtitle && (
                            <p className="text-xs text-muted-foreground capitalize">{item.subtitle}</p>
                          )}
                        </div>
                        {item.status && (
                          <Badge className={`text-[10px] ${pressaoColor[item.status] || ""}`} variant="secondary">
                            {item.status}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDateDisplay(item.date)}</span>
                        <Badge variant="outline" className="text-[10px] h-4">
                          {config.label}
                        </Badge>
                      </div>

                      {/* Photos */}
                      {item.fotos && item.fotos.length > 0 && (
                        <div className="flex gap-1.5 overflow-x-auto pt-1">
                          {item.fotos.slice(0, 4).map((url, i) => {
                            const path = item.fotosPaths?.[i];
                            const effectiveUrl = (path && signedUrls[path]) || url;
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
                          {item.fotos.length > 4 && (
                            <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Camera className="h-4 w-4 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">+{item.fotos.length - 4}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
