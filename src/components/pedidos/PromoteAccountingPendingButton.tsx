import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isAccountingPending } from "@/lib/orderAccountingState";
import { PROMOTION_ERROR_TEXT, promotionErrorReason, usePromoteAccountingPendingOrder } from "@/hooks/usePromoteAccountingPendingOrder";

interface Props {
  order: { id: string; numero: string; status: string; updated_at?: string; c2_external_origin_snapshot?: unknown; partner_accounts?: { razao_social: string } | null };
  /** Exibição apenas; a autorização é exclusivamente do servidor. */
  canAttempt: boolean;
}

const PROMOTABLE = new Set(["em_analise_comercial", "aguardando_cotacao", "aguardando_aprovacao_credito"]);

/**
 * Liberação contábil explícita de um pedido pendente, depois que o cadastro fiscal da
 * empresa foi regularizado. Não valida o cadastro: o servidor recusa se ainda não estiver validado.
 */
export function PromoteAccountingPendingButton({ order, canAttempt }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const promote = usePromoteAccountingPendingOrder();
  if (!canAttempt || !isAccountingPending(order) || !PROMOTABLE.has(order.status) || !order.updated_at) return null;
  const confirm = async () => {
    setError(null);
    try {
      await promote.mutateAsync({ order_id: order.id, expected_updated_at: order.updated_at! });
      setDone(true); setOpen(false);
    } catch (e) {
      setError(PROMOTION_ERROR_TEXT[promotionErrorReason(e)]);
      setOpen(false);
    }
  };
  return <div className="space-y-2">
    {done ? <p role="status" className="text-sm">Pedido {order.numero} liberado pelo servidor. Aprovação e cobrança seguem as regras normais.</p>
      : <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={promote.isPending}>Liberar após regularização contábil</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Liberar pedido {order.numero}?</AlertDialogTitle>
          <AlertDialogDescription>
            Parceiro: {order.partner_accounts?.razao_social ?? "—"}. Use somente depois que o cadastro fiscal da sua empresa
            tiver sido validado pela contabilidade. O servidor confere a validação atual e recusa se ela ainda estiver pendente
            ou se o pedido tiver mudado. Esta ação não aprova o pedido nem gera cobrança, nota fiscal ou entrega.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirm(); }} disabled={promote.isPending}>Confirmar liberação</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
