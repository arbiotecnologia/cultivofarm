/**
 * Guia Fiscal dentro dos próprios cadastros (produto, microrganismo, cliente).
 * Lê os perfis canônicos; nunca cria perfil ao visualizar. A edição abre o
 * MESMO editor das telas fiscais (mesmos hooks, CAS, idempotência e permissões).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { getAccessLevel } from "@/lib/permissions";
import { useProductFiscalAccess } from "@/hooks/useProductFiscalAccess";
import { OWNED_PRODUCT_FISCAL_ENABLED } from "@/lib/fiscal/ownedProductFiscal";
import { useProductFiscalProfile, useOwnedProductIds } from "@/hooks/useProductFiscalProfiles";
import { useMicroorganismFiscalProfile } from "@/hooks/useMicroorganismFiscalProfiles";
import {
  productPendencies, customerPendencies, presentationPendencies, resolveCustomerForPendencies,
  type FiscalScenario, type Pendency, type PresentationInput,
} from "@/lib/fiscal/preEmissionPendencies";
import { getFiscalStatusLabel } from "@/lib/fiscal/fiscalOptions";
import { ProductEditDrawer, MicroorganismEditDrawer } from "@/pages/configuracoes/FiscalProdutos";
import { CustomerFiscalEditDrawer } from "@/pages/configuracoes/FiscalClientes";
import type { CustomerListItem } from "@/hooks/useCustomerFiscalProfiles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Pencil } from "lucide-react";

const SCENARIOS: { key: FiscalScenario; label: string }[] = [
  { key: "interna", label: "Venda interna" },
  { key: "interestadual", label: "Venda interestadual" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = supabase.from.bind(supabase) as unknown as (t: string) => any;

function PendencyList({ items }: { items: Pendency[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sem pendências nos campos verificados.</p>;
  return (
    <ul className="text-sm list-disc pl-5 space-y-1">
      {items.map((p) => <li key={p.field + p.message}><strong>{p.label}:</strong> {p.message}</li>)}
    </ul>
  );
}

function Shell({ kind, status, hasProfile, scenarios, extra, canEdit, canRead, onEdit }: {
  kind: "product" | "customer"; status: string | null; hasProfile: boolean;
  scenarios: { key: FiscalScenario; label: string; items: Pendency[] }[];
  extra?: Pendency[]; canEdit: boolean; canRead: boolean; onEdit: () => void;
}) {
  return (
    <div className="space-y-4" data-testid="fiscal-guide">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Perfil fiscal:</span>
        {hasProfile ? <Badge variant="secondary">{getFiscalStatusLabel(kind, status)}</Badge>
          : <Badge variant="outline">Sem perfil</Badge>}
      </div>
      {scenarios.map((s) => (
        <div key={s.key} className="space-y-1">
          <h4 className="text-sm font-semibold">{s.label}</h4>
          <PendencyList items={s.items} />
        </div>
      ))}
      {extra && extra.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">Apresentações e conversão</h4>
          <PendencyList items={extra} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Verificação prévia: não substitui a revisão contábil nem autoriza emissão. Notas já emitidas não são alteradas.
      </p>
      {(canEdit || (canRead && hasProfile)) && (
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onEdit} data-testid="fiscal-guide-edit">
          <Pencil className="h-4 w-4 mr-1" />{canEdit ? (hasProfile ? "Editar perfil fiscal" : "Cadastrar perfil fiscal") : "Ver perfil fiscal"}
        </Button>
      )}
    </div>
  );
}

function usePresentations(column: "produto_id" | "microrganismo_id", id: string) {
  return useQuery({
    queryKey: ["fiscal", "guide-presentations", column, id],
    retry: false,
    queryFn: async (): Promise<PresentationInput[]> => {
      const { data, error } = await anyFrom("catalogo_volumes").select("id, rotulo, medida, volume_ml, ativo").eq(column, id);
      if (error) throw new Error("read_failed");
      return (data ?? []) as PresentationInput[];
    },
  });
}

const readError = <Alert variant="destructive"><AlertDescription>Não foi possível ler o perfil fiscal. Nada foi alterado.</AlertDescription></Alert>;
const loading = <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando perfil fiscal" />;

export function ProductFiscalGuide({ productId, displayName, displayCodigo = null }: { productId: string; displayName: string; displayCodigo?: string | null }) {
  const access = useProductFiscalAccess("product-fiscal-guide");
  const { role } = useAuth();
  const canRead = getAccessLevel(role, "/configuracoes/fiscal/produtos") !== "none";
  const ownership = useOwnedProductIds([productId]);
  const canEdit = OWNED_PRODUCT_FISCAL_ENABLED && access.ready && access.canWriteOwnedProduct === true
    && ownership.confirmed && ownership.owned.has(productId);
  const [open, setOpen] = useState(false);
  const q = useProductFiscalProfile(productId);
  const pres = usePresentations("produto_id", productId);
  if (q.isError) return readError;
  if (q.data === undefined) return loading;
  const p = q.data as Record<string, string | null> | null;
  return (
    <>
      <Shell kind="product" status={p?.profile_status ?? null} hasProfile={!!p} canEdit={canEdit} canRead={canRead} onEdit={() => setOpen(true)}
        scenarios={SCENARIOS.map((s) => ({ ...s, items: productPendencies(p, s.key) }))}
        extra={presentationPendencies(p, pres.data ?? [])} />
      {open && <ProductEditDrawer productId={productId} displayName={displayName} displayCodigo={displayCodigo} canEdit={canEdit} onClose={() => setOpen(false)} />}
    </>
  );
}

export function MicroorganismFiscalGuide({ microorganismId, displayName, displayCodigo = null }: { microorganismId: string; displayName: string; displayCodigo?: string | null }) {
  const { role } = useAuth();
  const level = getAccessLevel(role, "/configuracoes/fiscal/produtos");
  const canEdit = level === "rw";
  const [open, setOpen] = useState(false);
  const q = useMicroorganismFiscalProfile(microorganismId);
  const pres = usePresentations("microrganismo_id", microorganismId);
  if (level === "none" || FEATURE_FLAGS.fiscalProductProfilesUi !== true) return null;
  if (q.isError) return readError;
  if (q.data === undefined) return loading;
  const p = q.data as unknown as Record<string, string | null> | null;
  return (
    <>
      <Shell kind="product" status={p?.profile_status ?? null} hasProfile={!!p} canEdit={canEdit} canRead onEdit={() => setOpen(true)}
        scenarios={SCENARIOS.map((s) => ({ ...s, items: productPendencies(p, s.key) }))}
        extra={presentationPendencies(p, pres.data ?? [])} />
      {open && <MicroorganismEditDrawer microorganismId={microorganismId} displayName={displayName} displayCodigo={displayCodigo} canEdit={canEdit} onClose={() => setOpen(false)} />}
    </>
  );
}

export function CustomerFiscalGuide({ customerId }: { customerId: string }) {
  const { role } = useAuth();
  const level = getAccessLevel(role, "/configuracoes/fiscal/clientes");
  const canEdit = level === "rw";
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["fiscal", "customer-profiles", "guide", customerId],
    retry: false,
    queryFn: async () => {
      const [prof, cli] = await Promise.all([
        anyFrom("customer_fiscal_profiles").select("*").eq("customer_id", customerId).maybeSingle(),
        anyFrom("clientes").select("id, nome, cpf_cnpj, endereco_logradouro, endereco_numero, endereco_cep, endereco_estado").eq("id", customerId).maybeSingle(),
      ]);
      if (prof.error || cli.error) throw new Error("read_failed");
      return { profile: prof.data ?? null, cliente: cli.data ?? null };
    },
  });
  if (q.isError) return readError;
  if (q.isLoading || !q.data) return loading;
  const { profile, cliente } = q.data;
  const resolved = resolveCustomerForPendencies(profile, cliente);
  const item: CustomerListItem | "new" = profile
    ? ({ ...profile, cliente_nome: cliente?.nome ?? null, cliente_cpf_cnpj: cliente?.cpf_cnpj ?? null } as CustomerListItem)
    : "new";
  return (
    <>
      <Shell kind="customer" status={profile?.profile_status ?? null} hasProfile={!!profile} canEdit={canEdit} canRead={level !== "none"} onEdit={() => setOpen(true)}
        scenarios={SCENARIOS.map((s) => ({ ...s, items: customerPendencies(resolved, s.key) }))} />
      {open && <CustomerFiscalEditDrawer item={item} canEdit={canEdit} presetCustomerId={profile ? null : customerId}
        onClose={() => { setOpen(false); void q.refetch(); }} />}
    </>
  );
}
