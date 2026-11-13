/**
 * Guia Fiscal (somente leitura) exibida dentro dos próprios cadastros.
 * Lê os perfis canônicos existentes; nunca cria perfil ao visualizar.
 * A correção acontece no MESMO editor fiscal (link com ?produto= / ?cliente=).
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProductFiscalProfile } from "@/hooks/useProductFiscalProfiles";
import {
  productPendencies, customerPendencies, fiscalEditorLink,
  type FiscalScenario, type Pendency,
} from "@/lib/fiscal/preEmissionPendencies";
import { getFiscalStatusLabel } from "@/lib/fiscal/fiscalOptions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Loader2 } from "lucide-react";

const SCENARIOS: { key: FiscalScenario; label: string }[] = [
  { key: "interna", label: "Venda interna" },
  { key: "interestadual", label: "Venda interestadual" },
];

function PendencyList({ items }: { items: Pendency[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sem pendências nos campos verificados.</p>;
  return (
    <ul className="text-sm list-disc pl-5 space-y-1">
      {items.map((p) => <li key={p.field + p.message}><strong>{p.label}:</strong> {p.message}</li>)}
    </ul>
  );
}

function Shell({ status, hasProfile, scenarios, link, canOpen }: {
  status: string | null; hasProfile: boolean;
  scenarios: { key: FiscalScenario; label: string; items: Pendency[] }[];
  link: string; canOpen: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="fiscal-guide">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Perfil fiscal:</span>
        {hasProfile ? <Badge variant="secondary">{getFiscalStatusLabel("product", status)}</Badge>
          : <Badge variant="outline">Sem perfil</Badge>}
      </div>
      {scenarios.map((s) => (
        <div key={s.key} className="space-y-1">
          <h4 className="text-sm font-semibold">{s.label}</h4>
          <PendencyList items={s.items} />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Verificação prévia: não substitui a revisão contábil nem autoriza emissão. Notas já emitidas não são alteradas.
      </p>
      {canOpen && (
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <Link to={link}><FileText className="h-4 w-4 mr-1" />{hasProfile ? "Abrir editor fiscal" : "Cadastrar perfil fiscal"}</Link>
        </Button>
      )}
    </div>
  );
}

export function ProductFiscalGuide({ productId, canOpen }: { productId: string; canOpen: boolean }) {
  const q = useProductFiscalProfile(productId);
  if (q.isError) return <Alert variant="destructive"><AlertDescription>Não foi possível ler o perfil fiscal. Nada foi alterado.</AlertDescription></Alert>;
  if (q.data === undefined) return <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando perfil fiscal" />;
  const p = q.data as Record<string, string | null> | null;
  return <Shell status={p?.profile_status ?? null} hasProfile={!!p} link={fiscalEditorLink("produto", productId)} canOpen={canOpen}
    scenarios={SCENARIOS.map((s) => ({ ...s, items: productPendencies(p, s.key) }))} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = supabase.from.bind(supabase) as unknown as (t: string) => any;

export function CustomerFiscalGuide({ customerId, cpfCnpj, canOpen }: { customerId: string; cpfCnpj: string | null; canOpen: boolean }) {
  const q = useQuery({
    queryKey: ["fiscal", "customer-profiles", "guide", customerId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await anyFrom("customer_fiscal_profiles")
        .select("id, taxpayer_indicator, state_registration_status, fiscal_state, fiscal_municipality_ibge_code, fiscal_street, fiscal_number, fiscal_postal_code, profile_status")
        .eq("customer_id", customerId).maybeSingle();
      if (error) throw new Error("read_failed");
      return (data ?? null) as Record<string, string | null> | null;
    },
  });
  if (q.isError) return <Alert variant="destructive"><AlertDescription>Não foi possível ler o perfil fiscal. Nada foi alterado.</AlertDescription></Alert>;
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando perfil fiscal" />;
  const c = q.data ?? null;
  return <Shell status={c?.profile_status ?? null} hasProfile={!!c} link={fiscalEditorLink("cliente", customerId)} canOpen={canOpen}
    scenarios={SCENARIOS.map((s) => ({ ...s, items: customerPendencies(c ? { ...c, cpf_cnpj: cpfCnpj } : null, s.key) }))} />;
}
