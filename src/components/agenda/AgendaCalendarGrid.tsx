import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertTriangle, CloudOff } from "lucide-react";
import { formatTimeDisplay } from "@/lib/date-utils";
import { addDays, subDays, startOfWeek, format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  HOUR_START,
  HOUR_END,
  SLOT_HEIGHT,
  TOTAL_HEIGHT,
  isWithinGridRange,
  resolveDropDate,
} from "@/lib/agenda/grid";

const URGENCIA_BORDER: Record<string, string> = {
  baixa: "border-l-blue-400",
  media: "border-l-amber-400",
  alta: "border-l-orange-500",
  critica: "border-l-destructive",
};

const STATUS_BG: Record<string, string> = {
  agendada: "bg-muted/60",
  atribuida: "bg-muted/60",
  em_deslocamento: "bg-blue-500/15",
  checkin_realizado: "bg-yellow-500/20",
  em_visita: "bg-yellow-500/20",
  concluida: "bg-green-500/15",
};

interface Props {
  items: any[];
  mode: "diario" | "semanal";
  onItemClick: (id: string) => void;
  onItemMove?: (id: string, newDate: Date) => void;
  /** Reagendamento em andamento: bloqueia novos arrastes até concluir. */
  isMoving?: boolean;
}

export function AgendaCalendarGrid({ items, mode, onItemClick, onItemMove, isMoving }: Props) {
  const [cursor, setCursor] = useState<Date>(new Date());
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const days = useMemo(() => {
    if (mode === "diario") return [cursor];
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor, mode]);

  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  const itemsByDay = useMemo(() => {
    const m = new Map<string, any[]>();
    items.forEach((it) => {
      if (!it.data_prevista_atendimento) return;
      const key = format(new Date(it.data_prevista_atendimento), "yyyy-MM-dd");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(it);
    });
    return m;
  }, [items]);

  const step = mode === "diario" ? 1 : 7;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setCursor(subDays(cursor, step))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button size="icon" variant="outline" onClick={() => setCursor(addDays(cursor, step))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm font-semibold text-foreground capitalize">
          {mode === "diario"
            ? format(cursor, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR })
            : `${format(days[0], "dd/MM", { locale: ptBR })} – ${format(days[6], "dd/MM/yyyy", { locale: ptBR })}`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header row */}
          <div
            className="grid border-b border-border"
            style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(120px, 1fr))` }}
          >
            <div className="bg-muted/30" />
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className={`border-l border-border p-2 text-center text-xs font-medium capitalize ${
                  isSameDay(d, new Date()) ? "bg-primary/10 text-primary" : "bg-muted/30 text-foreground"
                }`}
              >
                <div>{format(d, "EEE", { locale: ptBR })}</div>
                <div className="text-base font-bold">{format(d, "dd")}</div>
              </div>
            ))}
          </div>

          {/* Body: hour labels + day columns side by side */}
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: `60px repeat(${days.length}, minmax(120px, 1fr))`,
              height: TOTAL_HEIGHT,
            }}
          >
            {/* Hour labels column */}
            <div className="relative">
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-b border-border text-[11px] text-muted-foreground text-right pr-1 pt-0.5"
                  style={{ height: SLOT_HEIGHT }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((d) => {
              const dayItems = itemsByDay.get(format(d, "yyyy-MM-dd")) || [];
              return (
                <div 
                  key={d.toISOString()} 
                  className="relative border-l border-border"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("bg-primary/5");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("bg-primary/5");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("bg-primary/5");
                    if (!draggedId || !onItemMove) return;
                    
                    const rect = e.currentTarget.getBoundingClientRect();
                    const offsetY = e.clientY - rect.top;
                    const hourFraction = offsetY / SLOT_HEIGHT;
                    const finalHour = Math.floor(hourFraction) + HOUR_START;
                    
                    // Snap para 00 ou 30 minutos
                    const minutes = (hourFraction % 1) >= 0.5 ? 30 : 0;
                    
                    const newDate = setMinutes(setHours(d, finalHour), minutes);
                    onItemMove(draggedId, newDate);
                    setDraggedId(null);
                  }}
                >
                  {/* Hour grid lines */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="border-b border-border"
                      style={{ height: SLOT_HEIGHT }}
                    />
                  ))}
                  {/* Event blocks */}
                  {dayItems.map((s: any) => {
                    const dt = new Date(s.data_prevista_atendimento);
                    const hour = dt.getHours() + dt.getMinutes() / 60;
                    if (hour < HOUR_START || hour > HOUR_END) return null;
                    const top = (hour - HOUR_START) * SLOT_HEIGHT;
                    const isCompleted = s.status === 'concluida';
                    const duration = s.duracao_estimada || 120;
                    const height = Math.max(44, (duration / 60) * SLOT_HEIGHT - 2);

                    const syncLogs = s.agenda_sync_log || [];
                    const latestSync = syncLogs.length > 0 
                      ? [...syncLogs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                      : null;
                    const syncFailed = latestSync?.status === "failed";

                    return (
                      <button
                        key={s.id}
                        type="button"
                        draggable={!isCompleted}
                        onDragStart={() => setDraggedId(s.id)}
                        onDragEnd={() => setDraggedId(null)}
                        onClick={() => onItemClick(s.id)}
                        className={`absolute left-1 right-1 rounded text-left p-1.5 border-l-4 ${
                          URGENCIA_BORDER[s.urgencia] || "border-l-muted"
                        } ${STATUS_BG[s.status] || "bg-muted/40"} hover:ring-2 hover:ring-primary/40 transition z-10 ${
                          !isCompleted ? "cursor-grab active:cursor-grabbing" : "cursor-default opacity-80"
                        } ${draggedId === s.id ? "opacity-40" : ""}`}
                        style={{ top, height }}
                      >
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                          {formatTimeDisplay(dt)}
                          {s.urgencia === "critica" && (
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                          )}
                          {syncFailed && (
                            <CloudOff className="h-3 w-3 text-red-500" />
                          )}
                        </div>
                        <div className="text-xs font-medium truncate text-foreground">
                          {s.clientes?.nome || "—"}
                        </div>
                        <div className="text-[10px] truncate text-muted-foreground">
                          {s.fazendas?.nome}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
