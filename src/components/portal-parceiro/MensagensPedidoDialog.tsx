import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrderMessagesPanel } from "@/components/comercial/OrderMessagesPanel";

interface Props {
  orderId: string | null;
  numero?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MensagensPedidoDialog({ orderId, numero, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Mensagens do pedido
            {numero && <span className="font-mono text-sm text-muted-foreground ml-2">· {numero}</span>}
          </DialogTitle>
        </DialogHeader>
        {orderId && <OrderMessagesPanel orderId={orderId} authorType="parceiro" />}
      </DialogContent>
    </Dialog>
  );
}
