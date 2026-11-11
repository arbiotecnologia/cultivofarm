import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useSellerPortfolioAdmin } from "@/hooks/useSellerPortfolio";

/** Administrador atribui/revoga parceiros da própria empresa a vendedores; o servidor valida empresa, papel e motivo. */
export function CarteiraVendedoresAdmin() {
  const { overview, assign, revoke } = useSellerPortfolioAdmin(true);
  const [seller, setSeller] = useState("");
  const [partner, setPartner] = useState("");
  const [reason, setReason] = useState("");
  const [revokeReason, setRevokeReason] = useState<Record<string, string>>({});
  const data = overview.data;
  const name = useMemo(() => {
    const s = new Map((data?.sellers ?? []).map((x) => [x.user_id, x.nome ?? "Vendedor"]));
    const p = new Map((data?.partners ?? []).map((x) => [x.partner_id, x.razao_social]));
    return { s: (id: string) => s.get(id) ?? "Vendedor", p: (id: string) => p.get(id) ?? "Parceiro" };
  }, [data]);
  const busy = assign.isPending || revoke.isPending;

  if (overview.isLoading) return <p role="status">Carregando carteiras…</p>;
  if (!data) return <p role="alert">Não foi possível carregar as carteiras dos vendedores.</p>;
  const active = data.assignments.filter((a) => !a.revoked_at);
  const history = data.assignments.filter((a) => a.revoked_at);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Carteiras dos vendedores</h1>
        <p className="text-sm text-muted-foreground">Cada parceiro fica na carteira de um único vendedor. Sem atribuição, o vendedor não acessa o parceiro.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Atribuir parceiro</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 items-end">
          <div className="space-y-1">
            <Label id="vend-label">Vendedor</Label>
            <Select value={seller} onValueChange={setSeller}>
              <SelectTrigger aria-labelledby="vend-label"><SelectValue placeholder={data.sellers.length ? "Selecione" : "Nenhum vendedor ativo"} /></SelectTrigger>
              <SelectContent>{data.sellers.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.nome ?? s.user_id}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label id="parc-label">Parceiro</Label>
            <Select value={partner} onValueChange={setPartner}>
              <SelectTrigger aria-labelledby="parc-label"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{data.partners.map((p) => <SelectItem key={p.partner_id} value={p.partner_id}>{p.razao_social}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="motivo-atrib">Motivo</Label>
            <Input id="motivo-atrib" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button disabled={busy || !seller || !partner || !reason.trim()} onClick={async () => {
            try { await assign.mutateAsync({ seller, partner, reason: reason.trim() }); setPartner(""); setReason(""); toast.success("Parceiro atribuído."); }
            catch (e) { toast.error((e as Error).message); }
          }}>Atribuir</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Atribuições vigentes</CardTitle><CardDescription>{active.length} vigente(s)</CardDescription></CardHeader>
        <CardContent>
          {active.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma atribuição vigente.</p> :
            <ul className="divide-y">{active.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>{name.s(a.seller_user_id)} · {name.p(a.partner_id)}
                  {a.seller_active === false && <Badge variant="outline" className="ml-2">vendedor suspenso</Badge>}
                  {a.partner_active === false && <Badge variant="outline" className="ml-2">parceiro desativado</Badge>}
                </span>
                <span className="flex items-center gap-2">
                  <Input aria-label={`Motivo da revogação de ${name.p(a.partner_id)}`} className="w-56" value={revokeReason[a.id] ?? ""} onChange={(e) => setRevokeReason({ ...revokeReason, [a.id]: e.target.value })} placeholder="Motivo da revogação" />
                  <Button size="sm" variant="outline" disabled={busy || !(revokeReason[a.id] ?? "").trim()} onClick={async () => {
                    try { await revoke.mutateAsync({ assignment: a.id, reason: (revokeReason[a.id] ?? "").trim() }); toast.success("Atribuição revogada."); }
                    catch (e) { toast.error((e as Error).message); }
                  }}>Revogar</Button>
                </span>
              </li>))}</ul>}
        </CardContent>
      </Card>
      {history.length > 0 && <Card>
        <CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
        <CardContent><ul className="divide-y text-sm">{history.map((a) => (
          <li key={a.id} className="py-1">{name.s(a.seller_user_id)} · {name.p(a.partner_id)} · revogada{a.revoke_reason ? `: ${a.revoke_reason}` : ""}</li>))}</ul></CardContent>
      </Card>}
    </div>
  );
}
