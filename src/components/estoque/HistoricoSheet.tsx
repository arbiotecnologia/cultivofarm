import { useEffect, useState } from "react";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
}

const PAGE_SIZE = 25;

const ACAO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  reserva: "Reserva",
  cancelamento_reserva: "Cancelamento de reserva",
  expedicao: "Expedição",
  estorno_expedicao: "Estorno de expedição",
  entrega: "Entrega",
  devolucao: "Devolução",
  descarte: "Descarte",
  perda: "Perda",
  consumo: "Consumo",
  ajuste: "Ajuste",
  edicao: "Edição",
};

const DIRECAO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  neutro: "Neutro",
};

const FILTROS = ["todas", "reserva", "expedicao", "entrega", "devolucao", "perda", "ajuste"] as const;

export function HistoricoSheet({ open, onOpenChange, itemId }: Props) {
  const [acao, setAcao] = useState<string>("todas");
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    if (open) {
      setAcao("todas");
      setLimit(PAGE_SIZE);
    }
  }, [open, itemId]);

  const { data: movs = [], isFetching } = useQuery({
    queryKey: ["estoque-movimentacoes", itemId, acao, limit],
    enabled: !!itemId && open,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("estoque_movimentacoes" as any)
        .select("*")
        .eq("estoque_produto_id", itemId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (acao !== "todas") q = q.eq("acao", acao);
      const { data } = await q;
      return data || [];
    },
  });

  const podeCarregarMais = movs.length >= limit;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Histórico de movimentações</SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <label htmlFor="historico-filtro-acao" className="text-xs text-muted-foreground">
            Filtrar por ação
          </label>
          <Select
            value={acao}
            onValueChange={(v) => {
              setAcao(v);
              setLimit(PAGE_SIZE);
            }}
          >
            <SelectTrigger id="historico-filtro-acao" className="mt-1" aria-label="Filtrar movimentações por ação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTROS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f === "todas" ? "Todas as ações" : ACAO_LABEL[f] ?? f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ul className="mt-4 space-y-3" aria-live="polite" aria-busy={isFetching}>
          {movs.length === 0 && (
            <li className="text-sm text-muted-foreground">Sem movimentações para o filtro selecionado.</li>
          )}
          {movs.map((m: any) => (
            <li key={m.id} className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ACAO_LABEL[m.acao] || m.acao}</Badge>
                  {m.direcao && (
                    <Badge variant="secondary">{DIRECAO_LABEL[m.direcao] ?? m.direcao}</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTimeDisplay(m.created_at)}</span>
              </div>

              {(m.status_anterior || m.status_novo) && (
                <div className="text-xs text-muted-foreground">
                  {m.status_anterior || "—"} → <span className="font-medium text-foreground">{m.status_novo}</span>
                </div>
              )}

              {m.quantidade != null && (
                <div className="text-xs">
                  Quantidade: {m.quantidade}
                  {m.unidade ? ` ${m.unidade}` : ""}
                </div>
              )}

              {(m.saldo_anterior != null || m.saldo_posterior != null) && (
                <div className="text-xs text-muted-foreground">
                  Saldo: {m.saldo_anterior ?? "—"} → <span className="text-foreground">{m.saldo_posterior ?? "—"}</span>
                </div>
              )}

              {(m.reservado_anterior != null || m.reservado_posterior != null) && (
                <div className="text-xs text-muted-foreground">
                  Reservado: {m.reservado_anterior ?? "—"} →{" "}
                  <span className="text-foreground">{m.reservado_posterior ?? "—"}</span>
                </div>
              )}

              {m.motivo && <div className="text-xs">Motivo: {m.motivo}</div>}
              {m.origem && <div className="text-xs text-muted-foreground">Origem: {m.origem}</div>}
              {m.observacao && <div className="text-xs italic">{m.observacao}</div>}
            </li>
          ))}
        </ul>

        {podeCarregarMais && (
          <div className="mt-4">
            <Button
              variant="outline"
              className="w-full"
              disabled={isFetching}
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
            >
              {isFetching ? "Carregando…" : "Carregar mais"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
