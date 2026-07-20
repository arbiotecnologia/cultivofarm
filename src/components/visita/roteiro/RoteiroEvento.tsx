import { formatDateTimeDisplay } from "@/lib/date-utils";
import {
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Mic,
  ImageIcon,
  ClipboardList,
  AlertCircle,
  Paperclip,
  Activity,
  GitCommit,
  Sprout,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoteiroEvento as RoteiroEventoT } from "./useRoteiroEventos";
import { RoteiroCondutaBlock } from "./RoteiroCondutaBlock";

const ICON: Record<RoteiroEventoT["tipo"], any> = {
  abertura: AlertCircle,
  status: GitCommit,
  checkin: MapPin,
  checkout: CheckCircle2,
  diagnostico: Activity,
  foto: ImageIcon,
  audio: Mic,
  arquivo: Paperclip,
  conduta: Sprout,
  aprovacao: FileText,
  ordem_servico: ClipboardList,
};

const COLOR: Record<RoteiroEventoT["tipo"], string> = {
  abertura: "bg-orange-500",
  status: "bg-slate-500",
  checkin: "bg-emerald-500",
  checkout: "bg-green-600",
  diagnostico: "bg-amber-600",
  foto: "bg-purple-500",
  audio: "bg-pink-500",
  arquivo: "bg-cyan-600",
  conduta: "bg-teal-600",
  aprovacao: "bg-blue-600",
  ordem_servico: "bg-indigo-600",
};

interface Props {
  evento: RoteiroEventoT;
  onPhotoClick: (url: string) => void;
}

export function RoteiroEventoItem({ evento, onPhotoClick }: Props) {
  const Icon = ICON[evento.tipo];

  return (
    <section
      id={`evento-${evento.id}`}
      aria-labelledby={`evento-${evento.id}-title`}
      className="relative scroll-mt-24 roteiro-evento"
    >
      <div className="flex gap-4">
        {/* coluna de ícone + linha */}
        <div className="flex flex-col items-center shrink-0">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm",
              COLOR[evento.tipo]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="w-px flex-1 bg-border mt-1" />
        </div>

        {/* conteúdo */}
        <div className="flex-1 min-w-0 pb-8">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h3
              id={`evento-${evento.id}-title`}
              className="text-base font-semibold text-foreground"
            >
              {evento.titulo}
            </h3>
            <time
              dateTime={evento.ts}
              className="text-xs text-muted-foreground tabular-nums flex items-center gap-1"
            >
              <Clock className="h-3 w-3" />
              {formatDateTimeDisplay(evento.ts)}
            </time>
          </div>

          {evento.detalhe && (
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
              {evento.detalhe}
            </p>
          )}

          {evento.gps && (
            <a
              href={`https://www.google.com/maps?q=${evento.gps.lat},${evento.gps.lng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
            >
              <MapPin className="h-3 w-3" />
              {evento.gps.lat.toFixed(5)}, {evento.gps.lng.toFixed(5)}
            </a>
          )}

          {evento.fotoUrl && (
            <figure className="mt-3">
              <button
                type="button"
                onClick={() => onPhotoClick(evento.fotoUrl!)}
                className="block w-full max-w-xl rounded-lg overflow-hidden border bg-muted hover:opacity-95 transition"
              >
                <img
                  src={evento.fotoUrl}
                  alt={evento.legenda || evento.titulo}
                  loading="lazy"
                  className="w-full h-auto object-cover roteiro-foto"
                />
              </button>
              {evento.legenda && (
                <figcaption className="text-xs italic text-muted-foreground mt-1.5">
                  {evento.legenda}
                </figcaption>
              )}
            </figure>
          )}

          {evento.audioUrl && (
            <div className="mt-3 max-w-md roteiro-audio">
              <audio src={evento.audioUrl} controls preload="none" className="w-full" />
              {evento.legenda && (
                <p className="text-xs italic text-muted-foreground mt-1">{evento.legenda}</p>
              )}
            </div>
          )}

          {evento.arquivoUrl && (
            <a
              href={evento.arquivoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 mt-3 px-3 py-2 rounded-lg border bg-muted/40 hover:bg-muted text-sm font-medium text-foreground"
            >
              <Paperclip className="h-4 w-4" />
              {evento.arquivoNome || "Abrir arquivo"}
            </a>
          )}

          {evento.conduta && <RoteiroCondutaBlock conduta={evento.conduta} />}

          {evento.link && (
            <a
              href={evento.link.href}
              className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
            >
              {evento.link.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {evento.responsavel && (
            <p className="text-xs text-muted-foreground mt-2 italic">por {evento.responsavel}</p>
          )}
        </div>
      </div>
    </section>
  );
}
