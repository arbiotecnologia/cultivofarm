import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseConduta, type CondutaState } from "@/lib/condutaSerializer";

export type RoteiroEventoTipo =
  | "abertura"
  | "status"
  | "checkin"
  | "checkout"
  | "diagnostico"
  | "foto"
  | "audio"
  | "arquivo"
  | "conduta"
  | "aprovacao"
  | "ordem_servico";

export interface RoteiroEvento {
  id: string;
  ts: string;
  tipo: RoteiroEventoTipo;
  titulo: string;
  detalhe?: string | null;
  responsavel?: string | null;
  // mídia
  fotoUrl?: string | null;
  fotoPath?: string | null;
  audioUrl?: string | null;
  audioPath?: string | null;
  arquivoUrl?: string | null;
  arquivoPath?: string | null;
  arquivoNome?: string | null;
  legenda?: string | null;
  // GPS
  gps?: { lat: number; lng: number } | null;
  // conduta render
  conduta?: CondutaState | null;
  // link
  link?: { href: string; label: string } | null;
}

interface RoteiroData {
  registro: any | null;
  eventos: RoteiroEvento[];
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  finalizado: "Finalizado",
  enviado_aprovacao: "Enviado para aprovação",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  convertido_os: "Convertido em OS",
  arquivado: "Arquivado",
};

export function useRoteiroEventos(registroId: string | undefined) {
  return useQuery<RoteiroData>({
    queryKey: ["roteiro-visita", registroId],
    enabled: !!registroId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!registroId) return { registro: null, eventos: [] };

      const [
        { data: registro },
        { data: logs },
        { data: checkins },
        { data: arquivos },
        { data: aprovacoes },
        { data: osList },
      ] = await Promise.all([
        supabase
          .from("registros_consultor")
          .select(
            "*, clientes(nome), fazendas(nome, municipio, estado), talhoes(nome), culturas(nome)"
          )
          .eq("id", registroId)
          .maybeSingle(),
        supabase
          .from("registros_consultor_status_log")
          .select("*")
          .eq("registro_consultor_id", registroId)
          .order("changed_at", { ascending: true }),
        supabase
          .from("visitas_checkin")
          .select("*")
          .eq("registro_consultor_id", registroId)
          .order("data_hora_checkin", { ascending: true }),
        supabase
          .from("registros_consultor_arquivos")
          .select("*")
          .eq("registro_consultor_id", registroId)
          .order("uploaded_at", { ascending: true }),
        supabase
          .from("aprovacoes_tecnicas")
          .select("*")
          .eq("registro_consultor_id", registroId)
          .order("created_at", { ascending: true }),
        supabase
          .from("ordens_servico_onfarm")
          .select("id, created_at, status, numero_os")
          .eq("registro_consultor_id", registroId)
          .order("created_at", { ascending: true }),
      ]);

      const eventos: RoteiroEvento[] = [];

      if (registro) {
        eventos.push({
          id: `abertura-${registro.id}`,
          ts: registro.created_at || registro.data_vistoria,
          tipo: "abertura",
          titulo: "Visita iniciada",
          detalhe: [
            (registro as any).clientes?.nome,
            (registro as any).fazendas?.nome,
            (registro as any).talhoes?.nome,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }

      (checkins || []).forEach((c: any) => {
        const isOut = String(c.tipo_checkin || "").includes("saida") || String(c.tipo_checkin) === "checkout";
        eventos.push({
          id: `checkin-${c.id}`,
          ts: c.data_hora_checkin,
          tipo: isOut ? "checkout" : "checkin",
          titulo: isOut ? "Check-out registrado" : "Check-in realizado",
          detalhe:
            c.observacoes ||
            (c.justificativa_sem_gps ? `Sem GPS — ${c.justificativa_sem_gps}` : null),
          gps:
            c.latitude && c.longitude
              ? { lat: Number(c.latitude), lng: Number(c.longitude) }
              : null,
          fotoUrl: c.foto_url || null,
          fotoPath: c.foto_path || null,
          audioUrl: c.audio_url || null,
          audioPath: c.audio_path || null,
        });
      });

      if (registro && (registro as any).problema_principal) {
        eventos.push({
          id: `diag-${registro.id}`,
          ts: (registro as any).updated_at || registro.data_vistoria,
          tipo: "diagnostico",
          titulo: `Diagnóstico: ${(registro as any).problema_principal}`,
          detalhe: [
            (registro as any).nivel_pressao ? `Pressão: ${(registro as any).nivel_pressao}` : null,
            (registro as any).estagio_cultura ? `Estágio: ${(registro as any).estagio_cultura}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        });
      }

      (arquivos || []).forEach((a: any) => {
        const isFoto = a.tipo_midia === "foto" || a.tipo_arquivo?.startsWith?.("image");
        const isAudio = a.tipo_midia === "audio" || a.tipo_arquivo?.startsWith?.("audio");
        eventos.push({
          id: `arq-${a.id}`,
          ts: a.capturado_em || a.uploaded_at,
          tipo: isFoto ? "foto" : isAudio ? "audio" : "arquivo",
          titulo: isFoto
            ? "Foto adicionada"
            : isAudio
              ? "Áudio gravado"
              : `Anexo${a.categoria_arquivo ? ` (${a.categoria_arquivo})` : ""}`,
          legenda: a.legenda || null,
          fotoUrl: isFoto ? a.arquivo_url : null,
          fotoPath: isFoto ? a.arquivo_path : null,
          audioUrl: isAudio ? a.arquivo_url : null,
          audioPath: isAudio ? a.arquivo_path : null,
          arquivoUrl: !isFoto && !isAudio ? a.arquivo_url : null,
          arquivoPath: !isFoto && !isAudio ? a.arquivo_path : null,
          arquivoNome: a.categoria_arquivo || "Arquivo",
          gps:
            a.latitude && a.longitude
              ? { lat: Number(a.latitude), lng: Number(a.longitude) }
              : null,
        });
      });

      // Conduta extraída das observações
      if (registro) {
        const { conduta } = parseConduta((registro as any).observacoes_tecnicas);
        if (conduta) {
          eventos.push({
            id: `conduta-${registro.id}`,
            ts: (registro as any).updated_at || registro.data_vistoria,
            tipo: "conduta",
            titulo: "Conduta agronômica definida",
            conduta,
          });
        }
      }

      const STATUS_TITULOS: Record<string, string> = {
        finalizado: "Visita finalizada",
        aprovado: "Recomendação aprovada pelo gestor",
        reprovado: "Recomendação reprovada",
        convertido_os: "Convertida em Ordem de Serviço",
        arquivado: "Registro arquivado",
      };
      const statusVistos = new Set<string>();
      (logs || []).forEach((l: any) => {
        const titulo = STATUS_TITULOS[l.status_novo];
        if (!titulo) return; // ignora rascunho, enviado_aprovacao e outros
        if (statusVistos.has(l.status_novo)) return; // remove duplicatas
        statusVistos.add(l.status_novo);
        eventos.push({
          id: `log-${l.id}`,
          ts: l.changed_at,
          tipo: "status",
          titulo,
          detalhe: l.motivo,
        });
      });

      (aprovacoes || []).forEach((ap: any) => {
        eventos.push({
          id: `apr-${ap.id}`,
          ts: ap.data_aprovacao || ap.created_at,
          tipo: "aprovacao",
          titulo:
            ap.status_aprovacao === "aprovado"
              ? "Recomendação aprovada"
              : ap.status_aprovacao === "reprovado"
                ? "Recomendação reprovada"
                : `Aprovação: ${ap.status_aprovacao}`,
          detalhe: ap.comentario_gestor,
        });
      });

      (osList || []).forEach((os: any) => {
        eventos.push({
          id: `os-${os.id}`,
          ts: os.created_at,
          tipo: "ordem_servico",
          titulo: `${os.numero_os || `OS-${os.id.slice(0, 8).toUpperCase()}`} gerada`,
          detalhe: os.status ? `Status: ${os.status}` : null,
          link: { href: `/ordens-servico?os=${os.id}`, label: "Ver ordem de serviço" },
        });
      });

      eventos.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

      return { registro, eventos };
    },
  });
}
