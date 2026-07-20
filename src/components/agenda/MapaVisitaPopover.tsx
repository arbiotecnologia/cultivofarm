import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, PlayCircle, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { format } from "date-fns";

const STATUS_DOT: Record<string, string> = {
  agendada: "bg-gray-400",
  atribuida: "bg-gray-400",
  em_deslocamento: "bg-blue-500",
  checkin_realizado: "bg-yellow-400",
  em_visita: "bg-yellow-400",
  concluida: "bg-green-500",
};

interface Props {
  s: any;
  onIniciar: (id: string) => void;
  onSyncRetry?: (id: string) => void;
  isSyncing?: boolean;
}

export function MapaVisitaPopover({ s, onIniciar, onSyncRetry, isSyncing }: Props) {
  const isCritica = s.urgencia === "critica";
  const dotColor = isCritica ? "bg-red-500" : STATUS_DOT[s.status] || "bg-muted-foreground";
  const hasGps = s.fazendas?.latitude && s.fazendas?.longitude;
  const mapsUrl = hasGps
    ? `https://maps.google.com/?q=${s.fazendas.latitude},${s.fazendas.longitude}`
    : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 bg-card border border-border rounded p-2 hover:bg-muted/50 transition"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-3 w-3 rounded-full flex-shrink-0 ${dotColor}`} />
            <div className="text-left min-w-0">
              <p className="font-medium text-sm truncate">
                {s.clientes?.nome} · {s.fazendas?.nome}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(s.data_prevista_atendimento), "dd/MM HH:mm")} · {s.tipo_demanda}
              </p>
            </div>
          </div>
          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
          <p className="font-semibold text-sm">{s.clientes?.nome}</p>
          {isCritica && (
            <Badge variant="destructive" className="gap-1 ml-auto">
              <AlertTriangle className="h-3 w-3" /> Crítica
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {s.fazendas?.nome}
          {s.talhoes?.nome && ` › ${s.talhoes.nome}`}
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Hora</p>
            <p className="font-medium">
              {format(new Date(s.data_prevista_atendimento), "dd/MM HH:mm")}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="font-medium capitalize">{String(s.status).replace(/_/g, " ")}</p>
          </div>
        </div>
        <p className="text-xs">
          <span className="text-muted-foreground">Demanda: </span>
          {s.tipo_demanda}
        </p>
        {onSyncRetry && (
          <div className="flex items-center justify-between py-1 border-t border-border mt-1">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Google Calendar</span>
            <SyncStatusBadge 
              logs={s.agenda_sync_log} 
              onRetry={() => onSyncRetry(s.id)}
              isSyncing={!!isSyncing}
            />
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1" onClick={() => onIniciar(s.id)}>
            <PlayCircle className="h-4 w-4 mr-1" />
            Iniciar
          </Button>
          {mapsUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={mapsUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
