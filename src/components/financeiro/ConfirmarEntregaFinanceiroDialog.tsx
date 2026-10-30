import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useDeliveryFinanceReconciliation } from "@/hooks/useDeliveryFinanceReconciliation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/financial/format";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  entrega: any | null;
}

export function ConfirmarEntregaFinanceiroDialog({ open, onClose, entrega }: Props) {
  const access = useStorageAccessScope(`delivery-finance-consultation:${entrega?.id}`);
  return <DeliveryFinanceDialog key={access.scope} open={open} onClose={onClose} entrega={entrega} />;
}

function DeliveryFinanceDialog({ open, onClose, entrega }: Props) {
  const recovery = useDeliveryFinanceReconciliation(entrega?.id, open);
  const navigate = useNavigate();
  if (!entrega) return null;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consulta financeira da entrega</DialogTitle>
        </DialogHeader>
        {recovery.eligible && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div><dt className="text-muted-foreground">Cliente</dt><dd>{entrega.clientes?.nome || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Produto</dt><dd>{entrega.produtos?.nome || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Lote</dt><dd className="font-mono">{entrega.lotes?.codigo_lote || "—"}</dd></div>
          </dl>
        )}
        <p role="status" className="text-sm text-muted-foreground">{recovery.message}</p>
        <p className="text-sm text-muted-foreground">Emissão e alterações financeiras indisponíveis. Nenhuma cobrança ou nota fiscal será enviada nesta consulta.</p>
        {recovery.receipt && (
          <div className="border border-border rounded-md p-3 space-y-2 text-sm">
            <p>Total confirmado: {brl(Number(recovery.receipt.total_amount))}</p>
            <Button size="sm" variant="link" className="px-0" onClick={() => {
              if (recovery.access.capture()() && recovery.receipt) navigate(`/financeiro/receber?id=${recovery.receipt.id}`);
            }}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" />Abrir lançamento financeiro
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button variant="outline" onClick={() => void recovery.reconsultar()} disabled={!recovery.eligible || recovery.pending}>
            <RefreshCw className="h-4 w-4 mr-2" />{recovery.pending ? "Consultando…" : "Reconsultar lançamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
