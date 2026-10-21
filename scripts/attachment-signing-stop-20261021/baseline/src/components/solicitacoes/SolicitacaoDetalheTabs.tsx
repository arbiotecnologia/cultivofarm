import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  TimelineAtendimento,
  TimelineEvent,
} from "@/components/solicitacoes/TimelineAtendimento";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { AtribuicaoForm } from "@/components/solicitacoes/AtribuicaoForm";
import {
  PlayCircle,
  ExternalLink,
  Image as ImageIcon,
  FileAudio,
  Plus,
} from "lucide-react";
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/date-utils";

interface Props {
  solicitacao: any;
  onClose?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aberta: "Aberta",
  em_triagem: "Em triagem",
  atribuida: "Atribuída",
  agendada: "Agendada",
  em_deslocamento: "Em deslocamento",
  checkin_realizado: "Check-in feito",
  em_visita: "Em visita",
  aguardando_recomendacao: "Aguard. recomendação",
  aguardando_os: "Aguard. OS",
  aguardando_decisao: "Aguard. decisão produtor",
  aceita_sem_os: "Aceita (Sem OS)",
  convertido_os: "Convertido em OS",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export function SolicitacaoDetalheTabs({ solicitacao }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("dados");

  const { data: registros } = useQuery({
    queryKey: ["solicitacao-registros", solicitacao.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("registros_consultor")
        .select("*")
        .eq("solicitacao_id", solicitacao.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const regIds = (registros || []).map((r: any) => r.id);

  const { data: recomendacoes } = useQuery({
    queryKey: ["solicitacao-recs", solicitacao.id, regIds],
    queryFn: async () => {
      if (regIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("registros_consultor_recomendacoes")
        .select("*, produtos:produto_biologico_sugerido_id(nome)")
        .in("registro_consultor_id", regIds);
      return data || [];
    },
    enabled: regIds.length > 0,
  });

  const { data: oss } = useQuery({
    queryKey: ["solicitacao-oss", solicitacao.id, regIds],
    queryFn: async () => {
      if (regIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("ordens_servico_onfarm")
        .select("*, produtos:produto_id(nome)")
        .in("registro_consultor_id", regIds);
      return data || [];
    },
    enabled: regIds.length > 0,
  });

  const { data: timeline } = useQuery({
    queryKey: ["solicitacao-timeline-tabs", solicitacao.id],
    queryFn: async (): Promise<TimelineEvent[]> => {
      const ev: TimelineEvent[] = [];
      ev.push({
        id: "criacao",
        data: solicitacao.created_at,
        tipo: "solicitacao_criada",
        titulo: "Solicitação criada",
        descricao: solicitacao.tipo_demanda,
        fotoPath: solicitacao.fotos_paths?.[0], // Preview da primeira foto
      });

      const { data: timelineRows } = await (supabase as any)
        .from("solicitacoes_timeline")
        .select("*")
        .eq("solicitacao_id", solicitacao.id)
        .order("created_at");
      (timelineRows || []).forEach((t: any) =>
        ev.push({
          id: `tl-${t.id}`,
          data: t.created_at,
          tipo:
            t.tipo_evento === "cancelada"
              ? "outro"
              : t.tipo_evento === "atribuida"
              ? "atribuicao"
              : t.tipo_evento === "agendada" || t.tipo_evento === "reagendada"
              ? "atribuicao"
              : "outro",
          titulo: `Evento: ${t.tipo_evento}`,
          descricao: t.descricao,
        })
      );

      (registros || []).forEach((r: any) => {
        if (r.hora_inicio) {
          ev.push({
            id: `vi-${r.id}`,
            data: r.hora_inicio,
            tipo: "visita_iniciada",
            titulo: "Visita iniciada",
            descricao: r.objetivo_visita,
            link: { href: `/visita-tecnica/${r.id}?from=solicitacoes`, label: "Abrir visita" },
          });
        }
        if (r.status === "finalizado" && r.hora_fim) {
          ev.push({
            id: `vf-${r.id}`,
            data: r.hora_fim,
            tipo: "visita_finalizada",
            titulo: "Visita finalizada",
            descricao: r.problema_principal,
            link: { href: `/visita-tecnica/${r.id}?from=solicitacoes`, label: "Abrir prontuário" },
          });
        }
      });

      (recomendacoes || []).forEach((r: any) =>
        ev.push({
          id: `rec-${r.id}`,
          data: r.created_at,
          tipo: "recomendacao",
          titulo: "Recomendação técnica",
          descricao: r.recomendacao_tecnica?.slice(0, 140),
        })
      );

      (oss || []).forEach((os: any) =>
        ev.push({
          id: `os-${os.id}`,
          data: os.created_at,
          tipo: "ordem_servico",
          titulo: `${os.numero_os || `OS-${os.id.slice(0, 8).toUpperCase()}`} (${os.status})`,
          descricao: [os.dose_ml_ha && `${os.dose_ml_ha} mL/ha`, os.area_hectares && `${os.area_hectares} ha`]
            .filter(Boolean)
            .join(" · "),
          link: { href: `/ordens-servico`, label: "Abrir OS" },
        })
      );

      return ev.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    },
    enabled: !!solicitacao,
  });

  const fotosUrls = solicitacao.fotos_iniciais || [];
  const fotosPaths = solicitacao.fotos_paths || [];
  const audioUrl = solicitacao.audio_inicial_url;
  const audioPath = solicitacao.audio_inicial_path;

  const { urls: signedUrls } = useSignedUrls([...fotosPaths, audioPath].filter(Boolean));

  const getEffectiveUrl = (path: string | null | undefined, url: string | null | undefined) => {
    return (path && signedUrls[path]) || url;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-foreground">{solicitacao.tipo_demanda}</h2>
          <Badge variant="outline">{solicitacao.numero_solicitacao || "—"}</Badge>
          <Badge>{STATUS_LABELS[solicitacao.status] || solicitacao.status}</Badge>
          {solicitacao.confirmacao_produtor && (
            <Badge variant="outline" className="capitalize">
              Produtor: {solicitacao.confirmacao_produtor.replace("_", " ")}
            </Badge>
          )}
          <Badge variant={solicitacao.urgencia === "critica" ? "destructive" : "secondary"}>
            {solicitacao.urgencia}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Aberta {formatDateTimeDisplay(solicitacao.created_at)}
          {solicitacao.origem_solicitacao && ` · via ${solicitacao.origem_solicitacao}`}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="evidencias">Evidências</TabsTrigger>
          <TabsTrigger value="atribuicao">Atribuição</TabsTrigger>
          <TabsTrigger value="visitas">Visitas</TabsTrigger>
          <TabsTrigger value="recomendacoes">Recomendações</TabsTrigger>
          <TabsTrigger value="os">OS</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DataField label="Cliente" value={solicitacao.clientes?.nome} />
            <DataField label="Fazenda" value={solicitacao.fazendas?.nome} />
            <DataField label="Talhão" value={solicitacao.talhoes?.nome} />
            <DataField label="Solicitante" value={solicitacao.solicitante_nome} />
            <DataField label="Contato" value={solicitacao.solicitante_contato} />
            <DataField label="Tipo" value={solicitacao.tipo_demanda} />
            <DataField label="Origem" value={solicitacao.origem_solicitacao} />
            <DataField
              label="Data prevista"
              value={
                solicitacao.data_prevista_atendimento
                  ? formatDateTimeDisplay(solicitacao.data_prevista_atendimento)
                  : "—"
              }
            />
          </div>
          {solicitacao.descricao && (
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <p className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
                {solicitacao.descricao}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="evidencias" className="space-y-4 mt-4">
          {fotosUrls.length === 0 && fotosPaths.length === 0 && !audioUrl && !audioPath && (
            <p className="text-sm text-muted-foreground italic">Sem evidências iniciais.</p>
          )}
          {(fotosUrls.length > 0 || fotosPaths.length > 0) && (
            <div>
              <Label className="text-xs flex items-center gap-1.5 mb-2">
                <ImageIcon className="h-3.5 w-3.5" /> Fotos
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {/* Priorizar caminhos de storage (novos) sobre URLs legadas */}
                {fotosPaths.length > 0 ? (
                  fotosPaths.map((path: string, i: number) => (
                    <a
                      key={path}
                      href={signedUrls[path]}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square rounded-md overflow-hidden bg-muted border border-border"
                    >
                      <img src={signedUrls[path]} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))
                ) : (
                  fotosUrls.map((url: string, i: number) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square rounded-md overflow-hidden bg-muted border border-border"
                    >
                      <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))
                )}
              </div>
            </div>
          )}
          {(audioUrl || audioPath) && (
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <FileAudio className="h-3.5 w-3.5" /> Áudio inicial
              </Label>
              <audio src={getEffectiveUrl(audioPath, audioUrl)!} controls className="w-full" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="atribuicao" className="mt-4">
          <AtribuicaoForm solicitacao={solicitacao} />
        </TabsContent>

        <TabsContent value="visitas" className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {(registros || []).length} visita(s) registrada(s)
            </p>
            <Button
              size="sm"
              onClick={() =>
                navigate(`/visita-tecnica/nova?solicitacao_id=${solicitacao.id}&from=solicitacoes`)
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Nova visita
            </Button>
          </div>
          {(registros || []).length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nenhuma visita ainda.</p>
          )}
          <div className="space-y-2">
            {(registros || []).map((r: any) => (
              <Card key={r.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {r.objetivo_visita || r.tipo_visita || "Visita técnica"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateDisplay(r.data_vistoria)} · status {r.status}
                      </p>
                      {r.problema_principal && (
                        <p className="text-xs mt-1">{r.problema_principal}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/visita-tecnica/${r.id}?from=solicitacoes`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Abrir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="recomendacoes" className="space-y-2 mt-4">
          {(recomendacoes || []).length === 0 && (
            <p className="text-sm text-muted-foreground italic">Sem recomendações registradas.</p>
          )}
          {(recomendacoes || []).map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-medium text-sm">
                    {r.produtos?.nome || "Sem produto definido"}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {formatDateDisplay(r.created_at)}
                  </span>
                </div>
                {r.dose_recomendada_valor && (
                  <p className="text-xs">
                    Dose: {r.dose_recomendada_valor} {r.dose_recomendada_unidade || "mL/ha"}
                  </p>
                )}
                {r.recomendacao_tecnica && (
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {r.recomendacao_tecnica}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="os" className="space-y-2 mt-4">
          {(oss || []).length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nenhuma OS gerada.</p>
          )}
          {(oss || []).map((os: any) => (
            <Card key={os.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-sm">{os.produtos?.nome || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[os.dose_ml_ha && `${os.dose_ml_ha} mL/ha`, os.area_hectares && `${os.area_hectares} ha`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Badge variant="outline">{os.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="timeline" className="mt-4 space-y-3">
          {regIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(registros || []).map((r: any) => (
                <Button
                  key={r.id}
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/visita-tecnica/${r.id}`)}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Ver roteiro da visita {r.id.slice(0, 8)}
                </Button>
              ))}
            </div>
          )}
          <TimelineAtendimento events={timeline || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DataField({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
