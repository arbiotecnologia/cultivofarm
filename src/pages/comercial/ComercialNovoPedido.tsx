import { Link, Outlet, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useInternalOrderEntry } from "@/hooks/useInternalOrderEntry";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INTERNAL_ORDER_REASON_TEXT, internalOrderDraftScope, resolveInternalOrderTarget } from "@/lib/comercial/internalOrderEntry";
import { OrderJourney } from "@/components/comercial/OrderJourney";

/**
 * Venda do comercial para a carteira da própria empresa. Reutiliza NovoPedido
 * (rota filha) com a mesma simulação/create_partner_order_secure. Monta o
 * pedido só com contrato explícito; a chave remonta tudo na troca de escopo.
 */
export default function ComercialNovoPedido() {
  const { user, profile, roles = [], authzEpoch = 0 } = useAuth();
  const cap = useInternalOrderEntry();
  const [params, setParams] = useSearchParams();
  const requested = params.get("parceiro");
  const state = cap.data;
  const target = resolveInternalOrderTarget(state, requested);
  const scope = internalOrderDraftScope({ actorId: user?.id, organizationId: profile?.organization_id, roles, partnerId: target?.partnerId, authzEpoch, ready: cap.ready && !!state && state.state === "allowed" });

  return <div className="space-y-4 p-4">
    <header className="space-y-1">
      <h1 className="text-xl font-semibold">Registrar venda para parceiro da carteira</h1>
      <p className="text-sm text-muted-foreground">Somente parceiros da carteira desta empresa. Não é compra para a própria empresa.</p>
      <Link to="/comercial/pedidos-b2b" className="text-sm text-primary">Voltar para Pedidos B2B</Link>
    </header>
    {!cap.ready || cap.isLoading ? <p role="status">Verificando liberação no servidor.</p>
      : cap.isError || !state ? <p role="status">{INTERNAL_ORDER_REASON_TEXT.unavailable}</p>
      : state.state === "blocked" ? <div role="status" data-reason={state.reason} className="space-y-1">
          <p className="font-medium">Registro de venda indisponível</p>
          <p className="text-sm text-muted-foreground">{INTERNAL_ORDER_REASON_TEXT[state.reason]}</p>
        </div>
      : <div className="space-y-3">
          <label className="text-sm font-medium" id="parceiro-label">Parceiro da carteira</label>
          <Select value={target?.partnerId ?? ""} onValueChange={v => setParams({ parceiro: v }, { replace: true })}>
            <SelectTrigger aria-labelledby="parceiro-label" className="max-w-md"><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger>
            <SelectContent>{state.targets.map(t => <SelectItem key={t.partnerId} value={t.partnerId}>{t.razaoSocial}</SelectItem>)}</SelectContent>
          </Select>
          {requested && !target && <p role="alert" className="text-sm text-destructive">Parceiro informado no endereço não pertence à carteira autorizada desta empresa.</p>}
          {target && scope && <Outlet key={scope} context={{ partner: { id: target.partnerId, razao_social: target.razaoSocial }, afterCreatePath: "/comercial/pedidos-b2b" }} />}
        </div>}
    <OrderJourney />
  </div>;
}
