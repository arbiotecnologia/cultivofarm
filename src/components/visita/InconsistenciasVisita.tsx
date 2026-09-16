import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Link as LinkIcon, ExternalLink, RefreshCw, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";

interface Inconsistencia {
  id: string;
  tipo: string;
  descricao: string;
  gravidade: "alta" | "media" | "baixa";
  solicitacao_id?: string;
  registro_id?: string;
  checkin_id?: string;
  dados?: any;
}

export function InconsistenciasVisita() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: inconsistencias = [], isLoading, refetch } = useQuery({
    queryKey: ["inconsistencias-visita"],
    queryFn: async () => {
      const { data: viewData, error } = await (supabase as any)
        .from("vw_fluxo_visita_tecnica")
        .select("*")
        .not("bloqueios", "eq", "{}");

      if (error) {
        console.error("Erro ao carregar inconsistências da view:", error);
        return [];
      }

      const res: Inconsistencia[] = [];

      (viewData || []).forEach((item: any) => {
        (item.bloqueios || []).forEach((bloqueio: string) => {
          let descricao = "";
          let gravidade: "alta" | "media" | "baixa" = "media";
          let tipo = bloqueio;

          switch (bloqueio) {
            case "sem_consultor":
              descricao = `Solicitação ${item.numero_solicitacao} aguarda atribuição de consultor.`;
              gravidade = "media";
              break;
            case "sem_agendamento":
              descricao = `Solicitação ${item.numero_solicitacao} atribuída mas sem agendamento.`;
              gravidade = "media";
              break;
            case "sem_checkin":
              descricao = `Visita ${item.codigo_visita || item.registro_consultor_id.substring(0,8)} aguarda check-in no local.`;
              gravidade = "alta";
              break;
            case "sem_diagnostico":
              descricao = `Visita ${item.codigo_visita || item.registro_consultor_id.substring(0,8)} finalizada sem diagnósticos registrados.`;
              gravidade = "alta";
              break;
            case "sem_evidencia":
              descricao = `Visita ${item.codigo_visita || item.registro_consultor_id.substring(0,8)} finalizada sem evidências fotográficas.`;
              gravidade = "alta";
              break;
            case "sem_recomendacao":
              descricao = `Visita ${item.codigo_visita || item.registro_consultor_id.substring(0,8)} finalizada sem recomendação técnica.`;
              gravidade = "alta";
              break;
            case "aprovada_sem_recomendacao":
              descricao = `Visita ${item.codigo_visita || item.registro_consultor_id.substring(0,8)} aprovada mas sem conteúdo de recomendação real.`;
              gravidade = "alta";
              break;
            case "aprovada_com_solicitacao_antiga":
              descricao = `Visita ${item.codigo_visita || item.registro_consultor_id.substring(0,8)} aprovada, mas solicitação ainda não avançou no portal.`;
              gravidade = "media";
              break;
            case "convertida_os_sem_os":
              descricao = `Visita ${item.codigo_visita || item.registro_consultor_id.substring(0,8)} convertida mas sem OS de Produção gerada.`;
              gravidade = "alta";
              break;
            case "os_duplicada":
              descricao = `Visita ${item.codigo_visita || item.registro_consultor_id.substring(0,8)} possui múltiplas OS de Produção vinculadas.`;
              gravidade = "alta";
              break;
            case "evidencia_sem_arquivo_path":
              descricao = `Visita ${item.codigo_visita || item.registro_consultor_id.substring(0,8)} possui evidências legadas (sem path de storage).`;
              gravidade = "baixa";
              break;
            case "checkin_sem_registro_consultor":
              descricao = `Check-in identificado sem vínculo com registro de visita técnica.`;
              gravidade = "alta";
              break;
            default:
              descricao = `Inconsistência detectada: ${bloqueio}`;
          }

          res.push({
            id: `${bloqueio}-${item.registro_consultor_id || item.solicitacao_id}`,
            tipo,
            descricao,
            gravidade,
            solicitacao_id: item.solicitacao_id,
            registro_id: item.registro_consultor_id,
            dados: item
          });
        });
      });

      return res;
    }
  });

  const { converterRecomendacaoEmOS } = useFluxoVisitaTecnica();

  const vincularCheckin = useMutation({
    mutationFn: async (inconsistencia: Inconsistencia) => {
      if (!inconsistencia.checkin_id || !inconsistencia.solicitacao_id) return;
      
      // Tentar achar uma visita para essa solicitação
      const { data: visit } = await (supabase as any)
        .from("registros_consultor")
        .select("id")
        .eq("solicitacao_id", inconsistencia.solicitacao_id)
        .maybeSingle();

      if (visit) {
        await (supabase as any)
          .from("visitas_checkin")
          .update({ registro_consultor_id: visit.id })
          .eq("id", inconsistencia.checkin_id);
        return "Vinculado com sucesso!";
      } else {
        throw new Error("Nenhuma visita encontrada para esta solicitação. Inicie a visita primeiro.");
      }
    },
    onSuccess: (msg) => {
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ["inconsistencias-visita"] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  if (isLoading) return null;
  if (inconsistencias.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-5 w-5" />
          Inconsistências Pendentes ({inconsistencias.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {inconsistencias.map((inc) => (
          <Alert key={inc.id} className="bg-white border-amber-100 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={inc.gravidade === "alta" ? "destructive" : "secondary"}>
                    {inc.gravidade.toUpperCase()}
                  </Badge>
                  <span className="text-sm font-medium">{inc.descricao}</span>
                </div>
                <div className="flex gap-3">
                  {inc.solicitacao_id && (
                    <Button 
                      variant="link" 
                      className="p-0 h-auto text-xs" 
                      onClick={() => navigate(`/solicitacoes`)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" /> Ver Solicitação
                    </Button>
                  )}
                  {inc.registro_id && (
                    <Button 
                      variant="link" 
                      className="p-0 h-auto text-xs" 
                      onClick={() => navigate(`/visita-tecnica/${inc.registro_id}`)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" /> Abrir Visita
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {inc.tipo === "checkin_orfao" && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={() => vincularCheckin.mutate(inc)}
                  >
                    <LinkIcon className="h-3.5 w-3.5 mr-1" /> Vincular
                  </Button>
                )}
                {inc.tipo === "solicitacao_atribuida_sem_visita" && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 border-primary/20"
                    onClick={() => navigate(`/visita-tecnica/nova?solicitacao_id=${inc.solicitacao_id}`)}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Iniciar Agora
                  </Button>
                )}
                {(inc.tipo === "recomendacao_aprovada_sem_os" || inc.tipo === "visita_convertida_sem_os") && inc.registro_id && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={async () => {
                      const res = await converterRecomendacaoEmOS(inc.registro_id!);
                      if (res.success) {
                        toast.success(res.message);
                        queryClient.invalidateQueries({ queryKey: ["inconsistencias-visita"] });
                      } else toast.error(res.message);
                    }}
                  >
                    <PackagePlus className="h-3.5 w-3.5 mr-1" /> {inc.tipo === "visita_convertida_sem_os" ? "Re-gerar OS" : "Gerar OS"}
                  </Button>
                )}
              </div>
            </div>
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
}
