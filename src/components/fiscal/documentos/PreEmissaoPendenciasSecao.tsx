/**
 * Pré-emissão: lê AGORA os mesmos perfis canônicos (empresa, cliente, produto,
 * microrganismo, serviço) e aponta o que falta por cenário (interna /
 * interestadual derivado das UFs, nunca inferido). A correção abre o MESMO
 * editor fiscal no contexto; nada altera o rascunho, snapshots ou documentos
 * históricos — após corrigir, reaplique o item.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { useFiscalCompanySettings } from "@/hooks/useFiscalCompanySettings";
import { useProductFiscalAccess } from "@/hooks/useProductFiscalAccess";
import { useProductFiscalProfile } from "@/hooks/useProductFiscalProfiles";
import { useMicroorganismFiscalProfile } from "@/hooks/useMicroorganismFiscalProfiles";
import { useServiceFiscalProfile } from "@/hooks/useServiceFiscalProfiles";
import { OWNED_PRODUCT_FISCAL_ENABLED } from "@/lib/fiscal/ownedProductFiscal";
import {
  productPendencies, customerPendencies, servicePendencies, resolveCustomerForPendencies,
  scenarioFor, draftItemCfopPendency, type Pendency, type FiscalScenario,
} from "@/lib/fiscal/preEmissionPendencies";
import { ProductEditDrawer, MicroorganismEditDrawer } from "@/pages/configuracoes/FiscalProdutos";
import { CustomerFiscalEditDrawer } from "@/pages/configuracoes/FiscalClientes";
import { ServiceFiscalEditDrawer } from "@/pages/configuracoes/FiscalServicos";
import type { CustomerListItem } from "@/hooks/useCustomerFiscalProfiles";
import type { RascunhoItem } from "@/lib/fiscal/rascunhoWizardValidation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = supabase.from.bind(supabase) as unknown as (t: string) => any;

function List({ items }: { items: Pendency[] }) {
  if (items.length === 0) return <Badge variant="secondary">Sem pendências verificadas</Badge>;
  return <ul className="text-sm list-disc pl-5 space-y-0.5">{items.map((p) => <li key={p.field + p.message}><strong>{p.label}:</strong> {p.message}</li>)}</ul>;
}

function Row({ title, items, loading, onFix, fixLabel }: { title: string; items: Pendency[]; loading?: boolean; onFix?: () => void; fixLabel: string }) {
  return (
    <div className="border rounded-md p-3 space-y-2" data-testid="pre-emissao-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-sm">{title}</span>
        {onFix && <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onFix}>{fixLabel}</Button>}
      </div>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando" /> : <List items={items} />}
    </div>
  );
}

function ProductItem({ item, idx, scenario, crt }: { item: RascunhoItem; idx: number; scenario: FiscalScenario | null; crt: string | null }) {
  const access = useProductFiscalAccess(`pre-emissao:${idx}`);
  const canEdit = OWNED_PRODUCT_FISCAL_ENABLED && access.ready && access.canWriteOwnedProduct === true;
  const [open, setOpen] = useState(false);
  const id = item.source_item_id ?? null;
  const q = useProductFiscalProfile(id);
  const label = `Item ${idx + 1} — ${item.description || "produto"}`;
  if (!id) return <Row title={label} fixLabel="" items={[{ entity: "produto", field: "origem", label: "Origem", message: "Item digitado sem produto do catálogo; não há perfil para conferir." }]} />;
  const p = q.data as Record<string, string | null> | null | undefined;
  const items = scenario ? [...productPendencies(p, scenario, crt), ...(p ? [draftItemCfopPendency(item.cfop, scenario, "CFOP do item")].filter(Boolean) as Pendency[] : [])] : productPendencies(p, "interna", crt).filter((x) => !x.field.startsWith("cfop"));
  return (
    <>
      <Row title={label} items={items} loading={q.data === undefined && !q.isError} onFix={() => setOpen(true)} fixLabel={canEdit ? "Corrigir perfil" : "Ver perfil"} />
      {open && <ProductEditDrawer productId={id} displayName={item.description} displayCodigo={null} canEdit={canEdit} onClose={() => setOpen(false)} />}
    </>
  );
}

function MicroItem({ item, idx, scenario, crt }: { item: RascunhoItem; idx: number; scenario: FiscalScenario | null; crt: string | null }) {
  const { role } = useAuth();
  const canEdit = getAccessLevel(role, "/configuracoes/fiscal/produtos") === "rw";
  const [open, setOpen] = useState(false);
  const id = item.source_item_id!;
  const q = useMicroorganismFiscalProfile(id);
  const p = q.data as unknown as Record<string, string | null> | null | undefined;
  return (
    <>
      <Row title={`Item ${idx + 1} — ${item.description || "microrganismo"}`} items={productPendencies(p, scenario ?? "interna", crt)}
        loading={q.data === undefined && !q.isError} onFix={() => setOpen(true)} fixLabel={canEdit ? "Corrigir perfil" : "Ver perfil"} />
      {open && <MicroorganismEditDrawer microorganismId={id} displayName={item.description} displayCodigo={null} canEdit={canEdit} onClose={() => setOpen(false)} />}
    </>
  );
}

function ServiceItem({ item, idx }: { item: RascunhoItem; idx: number }) {
  const [open, setOpen] = useState(false);
  const { role } = useAuth();
  const svcAccess = useProductFiscalAccess("pre-emissao-servico");
  const canEdit = role === "superadmin" && getAccessLevel(role, "/configuracoes/fiscal/servicos") === "rw" && svcAccess.canWrite;
  const q = useServiceFiscalProfile(item.source_item_id ?? null);
  return (
    <>
      <Row title={`Item ${idx + 1} — ${item.description || "serviço"}`} items={servicePendencies(q.data ?? null)} loading={q.isLoading}
        onFix={q.data ? () => setOpen(true) : undefined} fixLabel={canEdit ? "Corrigir perfil" : "Ver perfil"} />
      {open && q.data && <ServiceFiscalEditDrawer item={q.data as never} canEdit={canEdit} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Leitura compartilhada (mesma chave) do perfil + cadastro do destinatário. */
export function useDraftCustomerFiscal(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["fiscal", "pre-emissao", "customer", customerId],
    enabled: !!customerId,
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
}

export function PreEmissaoPendenciasSecao({ customerId, items }: { customerId: string | null | undefined; items: RascunhoItem[] }) {
  const { role } = useAuth();
  const canEditCustomer = getAccessLevel(role, "/configuracoes/fiscal/clientes") === "rw";
  const [openCustomer, setOpenCustomer] = useState(false);
  const company = useFiscalCompanySettings();
  const cust = useDraftCustomerFiscal(customerId);
  const emitter = company.data as { state?: string | null; crt?: string | null } | null | undefined;
  const emitterUf = emitter?.state ?? null;
  const crt = emitter?.crt ?? null;
  const resolved = cust.data ? resolveCustomerForPendencies(cust.data.profile, cust.data.cliente) : null;
  const scenario = scenarioFor(emitterUf, resolved?.fiscal_state ?? null);
  const companyPend: Pendency[] = [];
  if (company.data !== undefined) {
    if (!emitterUf) companyPend.push({ entity: "empresa", field: "state", label: "UF do emitente", message: "Informe a UF na Configuração fiscal." });
    if (!crt) companyPend.push({ entity: "empresa", field: "crt", label: "CRT", message: "Regime (CRT) do emitente ausente." });
  }
  const custItem: CustomerListItem | "new" = cust.data?.profile
    ? ({ ...cust.data.profile, cliente_nome: cust.data.cliente?.nome ?? null, cliente_cpf_cnpj: cust.data.cliente?.cpf_cnpj ?? null } as CustomerListItem)
    : "new";
  return (
    <Card data-testid="pre-emissao-pendencias">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pendências fiscais por cenário</CardTitle>
        <CardDescription>
          {scenario ? `Operação ${scenario} (${emitterUf} → ${resolved?.fiscal_state}).` : "Cenário indeterminado: falta UF do emitente ou do destinatário."}
          {" "}Leitura dos perfis atuais; corrigir o perfil não altera este rascunho nem notas emitidas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row title="Emitente" items={companyPend} loading={company.isLoading} fixLabel="" />
        {customerId ? (
          <Row title="Destinatário" loading={cust.isLoading}
            items={customerPendencies(resolved, scenario ?? "interna", scenario ? emitterUf : null)}
            onFix={() => setOpenCustomer(true)} fixLabel={canEditCustomer ? "Corrigir perfil" : "Ver perfil"} />
        ) : <Row title="Destinatário" items={[{ entity: "cliente", field: "customer_id", label: "Cliente", message: "Selecione o destinatário." }]} fixLabel="" />}
        {items.map((it, i) => {
          const t = (it.source_item_type ?? "").toLowerCase();
          if (it.item_kind === "SERVICE" || t === "servico" || t === "service") return <ServiceItem key={i} item={it} idx={i} />;
          if ((t === "microrganismo" || t === "microorganism") && it.source_item_id) return <MicroItem key={i} item={it} idx={i} scenario={scenario} crt={crt} />;
          return <ProductItem key={i} item={it} idx={i} scenario={scenario} crt={crt} />;
        })}
        {openCustomer && customerId && (
          <CustomerFiscalEditDrawer item={custItem} canEdit={canEditCustomer} presetCustomerId={cust.data?.profile ? null : customerId}
            onClose={() => { setOpenCustomer(false); void cust.refetch(); }} />
        )}
      </CardContent>
    </Card>
  );
}
