import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { CheckCircle2, Circle, XCircle, AlertTriangle } from "lucide-react";

// Safe public-facing event labels for partners. Internal lot/user data is NOT shown.
const PUBLIC_EVENTS: Record<string, string> = {
  pedido_criado: "Pedido enviado",
  pedido_aprovado: "Pedido aprovado",
  planejamento_criado: "Planejamento criado",
  op_gerada: "Em preparação",
  producao_iniciada: "Produção iniciada",
  producao_finalizada: "Produção finalizada",
  entrega_realizada: "Entregue",
};

const STEP_ORDER = [
  "pedido_criado",
  "pedido_aprovado",
  "planejamento_criado",
  "producao_iniciada",
  "producao_finalizada",
  "entrega_realizada",
];

interface Props {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TimelinePedidoDialog({ orderId, open, onOpenChange }: Props) {
  const { data: order } = useQuery({
    queryKey: ["partner-order-summary", orderId],
    enabled: !!orderId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("partner_orders")
        .select("id, status, approval_notes, updated_at")
        .eq("id", orderId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["partner-timeline", orderId],
    enabled: !!orderId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("production_timeline_events")
        .select("id, event_type, event_at")
        .eq("partner_order_id", orderId!)
        .order("event_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((e: any) => PUBLIC_EVENTS[e.event_type]);
    },
  });

  const reachedTypes = new Set(events.map((e: any) => e.event_type));
  const isReprovado = order?.status === "reprovado";
  const isCancelado = order?.status === "cancelado";
  const terminalNegativo = isReprovado || isCancelado;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Andamento do pedido {(order as any)?.numero ? <span className="font-mono text-sm text-muted-foreground">· {(order as any).numero}</span> : null}
          </DialogTitle>
        </DialogHeader>

        {terminalNegativo && (
          <div
            className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
              isReprovado
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-muted-foreground/20 bg-muted/40 text-muted-foreground"
            }`}
          >
            {isReprovado ? <XCircle className="h-4 w-4 mt-0.5" /> : <AlertTriangle className="h-4 w-4 mt-0.5" />}
            <div className="flex-1">
              <div className="font-medium">
                {isReprovado ? "Pedido reprovado" : "Pedido cancelado"}
              </div>
              {order?.approval_notes ? (
                <div className="text-xs whitespace-pre-wrap mt-1 opacity-90">
                  {order.approval_notes}
                </div>
              ) : (
                <div className="text-xs opacity-80 mt-1">
                  Entre em contato com o comercial Cultivo Farm para mais detalhes.
                </div>
              )}
              {order?.updated_at && (
                <div className="text-[10px] mt-1 opacity-70">
                  Atualizado em {formatDateTimeDisplay(order.updated_at)}
                </div>
              )}
            </div>
          </div>
        )}

        <ol className="space-y-3 mt-2">
          {STEP_ORDER.map((step) => {
            const ev = events.find((e: any) => e.event_type === step);
            const done = reachedTypes.has(step);
            const blocked = terminalNegativo && !done;
            return (
              <li key={step} className="flex items-start gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                ) : blocked ? (
                  <XCircle className="h-5 w-5 text-muted-foreground/40 mt-0.5" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className={`text-sm ${done ? "font-medium" : "text-muted-foreground"} ${blocked ? "line-through" : ""}`}>
                    {PUBLIC_EVENTS[step]}
                  </div>
                  {ev && (
                    <div className="text-xs text-muted-foreground">
                      {formatDateTimeDisplay(ev.event_at)}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
