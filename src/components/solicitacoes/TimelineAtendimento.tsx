import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Mic,
  ImageIcon,
  ClipboardList,
  UserCheck,
  AlertCircle,
  ExternalLink,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { useMemo } from "react";

export interface TimelineEvent {
  id: string;
  data: string;
  tipo:
    | "solicitacao_criada"
    | "atribuicao"
    | "checkin"
    | "visita_iniciada"
    | "foto_adicionada"
    | "audio_gravado"
    | "evidencia_anexada"
    | "visita_finalizada"
    | "recomendacao"
    | "ordem_servico"
    | "outro";
  titulo: string;
  descricao?: string | null;
  responsavel?: string | null;
  /** Optional rich content displayed inside the timeline item */
  fotoUrl?: string | null;
  audioUrl?: string | null;
  arquivoUrl?: string | null;
  arquivoNome?: string | null;
  /** Optional click-through (e.g., visit detail / OS) */
  link?: { href: string; label: string } | null;
  /** Optional GPS link rendered alongside the description */
  gps?: { lat: number; lng: number } | null;
  fotoPath?: string | null;
  audioPath?: string | null;
  arquivoPath?: string | null;
}

const ICON_MAP: Record<TimelineEvent["tipo"], any> = {
  solicitacao_criada: AlertCircle,
  atribuicao: UserCheck,
  checkin: MapPin,
  visita_iniciada: Clock,
  foto_adicionada: ImageIcon,
  audio_gravado: Mic,
  evidencia_anexada: Paperclip,
  visita_finalizada: CheckCircle2,
  recomendacao: FileText,
  ordem_servico: ClipboardList,
  outro: Clock,
};

const COLOR_MAP: Record<TimelineEvent["tipo"], string> = {
  solicitacao_criada: "bg-orange-500",
  atribuicao: "bg-blue-500",
  checkin: "bg-emerald-500",
  visita_iniciada: "bg-indigo-500",
  foto_adicionada: "bg-purple-500",
  audio_gravado: "bg-pink-500",
  evidencia_anexada: "bg-cyan-600",
  visita_finalizada: "bg-green-600",
  recomendacao: "bg-teal-500",
  ordem_servico: "bg-amber-500",
  outro: "bg-muted-foreground",
};

interface TimelineAtendimentoProps {
  events: TimelineEvent[];
  className?: string;
}

export function TimelineAtendimento({ events, className }: TimelineAtendimentoProps) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const allPaths = useMemo(() => {
    const paths: string[] = [];
    events.forEach(ev => {
      if (ev.fotoPath) paths.push(ev.fotoPath);
      if (ev.audioPath) paths.push(ev.audioPath);
      if (ev.arquivoPath) paths.push(ev.arquivoPath);
    });
    return paths;
  }, [events]);

  const { urls: signedUrls } = useSignedUrls(allPaths);

  const getEffectiveUrl = (path: string | null | undefined, url: string | null | undefined) => {
    return (path && signedUrls[path]) || null; // sem fallback para URL gravada
  };

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">Nenhum evento registrado ainda.</p>
    );
  }

  return (
    <>
      <div className={cn("relative space-y-3", className)}>
        <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
        {events.map((ev) => {
          const Icon = ICON_MAP[ev.tipo];
          return (
            <div key={ev.id} className="relative flex gap-3 pl-1">
              <div
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
                  COLOR_MAP[ev.tipo]
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 pt-0.5 pb-2 min-w-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{ev.titulo}</p>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(ev.data), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                {ev.descricao && (
                  <p className="text-xs text-muted-foreground mt-0.5">{ev.descricao}</p>
                )}
                {ev.gps && (
                  <a
                    href={`https://www.google.com/maps?q=${ev.gps.lat},${ev.gps.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-[11px] text-primary hover:underline"
                  >
                    <MapPin className="h-3 w-3" />
                    {ev.gps.lat.toFixed(5)}, {ev.gps.lng.toFixed(5)}
                  </a>
                )}
                {getEffectiveUrl(ev.fotoPath, ev.fotoUrl) && (
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(getEffectiveUrl(ev.fotoPath, ev.fotoUrl)!)}
                    className="mt-2 block w-32 h-24 rounded overflow-hidden bg-muted border border-border hover:opacity-90 transition"
                  >
                    <img
                      src={getEffectiveUrl(ev.fotoPath, ev.fotoUrl)!}
                      alt={ev.titulo}
                      className="w-full h-full object-cover"
                    />
                  </button>
                )}
                {getEffectiveUrl(ev.audioPath, ev.audioUrl) && (
                  <audio
                    src={getEffectiveUrl(ev.audioPath, ev.audioUrl)!}
                    controls
                    className="mt-2 w-full max-w-xs h-8"
                  />
                )}
                {getEffectiveUrl(ev.arquivoPath, ev.arquivoUrl) && (
                  <a
                    href={getEffectiveUrl(ev.arquivoPath, ev.arquivoUrl)!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[11px] font-medium text-foreground"
                  >
                    <Paperclip className="h-3 w-3" />
                    {ev.arquivoNome || "Abrir arquivo"}
                  </a>
                )}
                {ev.link && (
                  <a
                    href={ev.link.href}
                    className="inline-flex items-center gap-1 mt-1 text-[11px] text-primary hover:underline"
                  >
                    {ev.link.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {ev.responsavel && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 italic">
                    por {ev.responsavel}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!photoPreview} onOpenChange={(open) => !open && setPhotoPreview(null)}>
        <DialogContent className="max-w-3xl p-2">
          {photoPreview && (
            <img
              src={photoPreview}
              alt="Pré-visualização"
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

