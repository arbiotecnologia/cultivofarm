import { Link, Outlet, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SELLER_FISCAL_TEXT, useSellerPortfolio } from "@/hooks/useSellerPortfolio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Lançamento de pedido pelo Vendedor para parceiro da PRÓPRIA carteira.
 * Reutiliza NovoPedido (rota filha) com simulação/criação canônicas; o servidor
 * revalida a carteira dentro da transação. O ID da URL só seleciona.
 */
export default function VendedorNovoPedido() {
  const { user, profile, roles = [], authzEpoch = 0 } = useAuth() as any;
  const cap = useSellerPortfolio();
  const [params, setParams] = useSearchParams();
  const requested = params.get("parceiro");
  const data = cap.data;
  const target = data?.partners.find((p) => p.partner_id === requested && p.orderCreate) ?? null;
  const scope = target && user?.id && profile?.organization_id
    ? JSON.stringify([user.id, profile.organization_id, [...roles].sort(), target.partner_id, authzEpoch])
    : null;
  const allowed = data?.partners.filter((p) => p.orderCreate) ?? [];

  return <div className="space-y-4 p-4">
    <header className="space-y-1">
      <h1 className="text-xl font-semibold">Lançar pedido para parceiro da minha carteira</h1>
      <p className="text-sm text-muted-foreground">Somente parceiros atribuídos a você. A aprovação continua com o comercial e o financeiro.</p>
      <Link to="/comercial/minha-carteira" className="text-sm text-primary">Voltar para Minha carteira</Link>
    </header>
    {cap.isLoading ? <p role="status">Verificando liberação no servidor.</p>
      : !data?.ready ? <p role="status">Seu acesso de vendedor não está ativo nesta empresa.</p>
      : data.fiscalBlock ? <p role="status" data-reason={data.fiscalBlock}>{SELLER_FISCAL_TEXT[data.fiscalBlock]}</p>
      : allowed.length === 0 ? <p role="status">Lançamento de pedido indisponível para a sua carteira.</p>
      : <div className="space-y-3">
          <label className="text-sm font-medium" id="parceiro-label">Parceiro da carteira</label>
          <Select value={target?.partner_id ?? ""} onValueChange={(v) => setParams({ parceiro: v }, { replace: true })}>
            <SelectTrigger aria-labelledby="parceiro-label" className="max-w-md"><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger>
            <SelectContent>{allowed.map((p) => <SelectItem key={p.partner_id} value={p.partner_id}>{p.razao_social}</SelectItem>)}</SelectContent>
          </Select>
          {requested && !target && <p role="alert" className="text-sm text-destructive">Parceiro informado no endereço não está na sua carteira.</p>}
          {target && scope && <Outlet key={scope} context={{ partner: { id: target.partner_id, razao_social: target.razao_social }, afterCreatePath: "/comercial/minha-carteira" }} />}
        </div>}
  </div>;
}
