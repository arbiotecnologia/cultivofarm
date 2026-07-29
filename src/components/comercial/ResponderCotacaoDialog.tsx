import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/financial/format";
import { useRespondB2BQuote } from "@/hooks/useRespondB2BQuote";
import { partnerOrderStatusLabel } from "@/lib/partnerOrderStatus";
import { PedidoItemProdutoInfo } from "@/components/pedidos-b2b/PedidoItemProdutoInfo";

interface QuoteItem {
  id: string;
  quantidade: number | string;
  [key: string]: unknown;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  orderNumero: string | null;
  items: QuoteItem[];
  onResponded?: () => void;
}

export function ResponderCotacaoDialog({
  open, onOpenChange, orderId, orderNumero, items, onResponded,
}: Props) {
  const respond = useRespondB2BQuote();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [installments, setInstallments] = useState<string>("");
  const [firstDue, setFirstDue] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");

  useEffect(() => {
    if (open) {
      setPrices({});
      setInstallments("");
      setFirstDue("");
      setMotivo("");
    }
  }, [open, orderId]);

  const total = useMemo(
    () =>
      items.reduce((acc, i) => {
        const price = Number(prices[i.id] ?? 0);
        return acc + (Number.isFinite(price) ? price * Number(i.quantidade) : 0);
      }, 0),
    [items, prices],
  );

  const allPriced = items.length > 0 && items.every((i) => Number(prices[i.id] ?? 0) > 0);

  async function submit() {
    if (!orderId) return;
    if (!allPriced) {
      toast.error("Informe o preço unitário de todos os itens.");
      return;
    }
    try {
      const result = await respond.mutateAsync({
        order_id: orderId,
        lines: items.map((i) => ({ item_id: i.id, unit_price: Number(prices[i.id]) })),
        installment_count: installments ? Number(installments) : null,
        first_due_date: firstDue || null,
        motivo: motivo.trim() || null,
      });
      toast.success(
        `Cotação registrada · ${result.numero} → ${partnerOrderStatusLabel(result.status)} · ${brl(Number(result.final_amount))}`,
      );
      onOpenChange(false);
      onResponded?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a cotação.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Responder cotação {orderNumero ?? ""}</DialogTitle>
          <DialogDescription>
            Informe o preço unitário de cada item. O servidor recalcula totais, condição de
            pagamento e parcelas — o pedido segue então para análise comercial ou de crédito.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Os preços informados viram snapshot imutável do pedido (modo preço fixo, origem cotação
            manual). Regras futuras da matriz não alteram este pedido.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          {items.map((i) => {
            const qty = Number(i.quantidade);
            const unit = Number(prices[i.id] ?? 0);
            return (
              <div key={i.id} className="border rounded-md p-2 space-y-1">
                <PedidoItemProdutoInfo item={i} />
                <div className="flex items-end gap-2">
                  <div className="text-xs text-muted-foreground w-24">Qtd: {qty}</div>
                  <div className="flex-1">
                    <Label className="text-xs">Preço unitário (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={prices[i.id] ?? ""}
                      onChange={(e) => setPrices((p) => ({ ...p, [i.id]: e.target.value }))}
                    />
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap w-28 text-right">
                    {brl(Number.isFinite(unit) ? unit * qty : 0)}
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground">Este pedido não possui itens.</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Parcelas (opcional)</Label>
            <Input
              type="number"
              min="1"
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
              placeholder="Padrão da condição"
            />
          </div>
          <div>
            <Label className="text-xs">1º vencimento (opcional)</Label>
            <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="text-xs">Justificativa da cotação (auditoria)</Label>
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>

        <div className="flex justify-between items-center border-t pt-3 text-sm">
          <span className="text-muted-foreground">Total de tabela da cotação</span>
          <span className="text-base font-semibold">{brl(total)}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!allPriced || respond.isPending}>
            {respond.isPending ? "Registrando..." : "Registrar cotação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
