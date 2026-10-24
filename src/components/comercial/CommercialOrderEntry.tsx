import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderJourney } from "./OrderJourney";
import { INTERNAL_ORDER_REASON_TEXT, type InternalOrderEntryState } from "@/lib/comercial/internalOrderEntry";

/** Recebe o contrato já lido do servidor; sem ele, nenhum link é exibido. */
export function CommercialOrderEntry({ state }: { state?: InternalOrderEntryState }) {
  const allowed = state?.state === "allowed";
  return <section aria-label="Registrar venda ou pedido" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Registrar venda para parceiro da carteira</h2>
      {allowed && <Button asChild><Link to="/comercial/pedidos-b2b/novo"><Plus aria-hidden="true" />Registrar venda</Link></Button>}
    </div>
    <p role="status" data-reason={state?.state === "blocked" ? state.reason : undefined} className="text-sm text-muted-foreground">
      {!state ? "Verificando liberação no servidor."
        : allowed ? "Venda para parceiros da carteira desta empresa, sujeita à análise comercial."
        : INTERNAL_ORDER_REASON_TEXT[state.reason]}
    </p>
    <OrderJourney />
  </section>;
}
