import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
}

const ACAO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  reserva: "Reserva",
  cancelamento_reserva: "Cancelamento",
  expedicao: "Expedição",
  edicao: "Edição",
};

export function HistoricoSheet({ open, onOpenChange, itemId }: Props) {
  const { data: movs = [] } = useQuery({
    queryKey: ["estoque-movimentacoes", itemId],
    enabled: !!itemId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("estoque_movimentacoes" as any)
        .select("*")
        .eq("estoque_produto_id", itemId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Histórico de movimentações</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {movs.length === 0 && <div className="text-sm text-muted-foreground">Sem movimentações.</div>}
          {movs.map((m: any) => (
            <div key={m.id} className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <Badge variant="outline">{ACAO_LABEL[m.acao] || m.acao}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTimeDisplay(m.created_at)}</span>
              </div>
              {(m.status_anterior || m.status_novo) && (
                <div className="text-xs text-muted-foreground">
                  {m.status_anterior || "—"} → <span className="font-medium text-foreground">{m.status_novo}</span>
                </div>
              )}
              {m.quantidade != null && <div className="text-xs">Quantidade: {m.quantidade}</div>}
              {m.observacao && <div className="text-xs italic">{m.observacao}</div>}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
