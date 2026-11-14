import { isC2ExternalScope } from "@/lib/authz/multiProfileContract";
import { ownerCatalogRoute } from "@/lib/catalogo/catalogAccess";
import { ownFinanceRoute } from "@/lib/comercial/financeAccess";
import { OwnerFinance } from "@/components/comercial/OwnerFinance";
import { OwnerCatalog } from "@/components/catalogo/OwnerCatalog";
import { ownerOrderRoute, ownerOrdersRoute } from "@/lib/comercial/ownerOrderAccess";
import { CatalogFilterMemoryContext, createCatalogFilterMemory } from "@/lib/catalogo/catalogFilterPreferences";
import { Outlet, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyPartner } from "@/hooks/useMyPartner";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { useSwitchPortal } from "@/hooks/useSwitchPortal";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PortalSidebar } from "@/components/nav/PortalSidebar";
import { useSidebarOpenState } from "@/hooks/useNavCollapseState";
import { PARCEIRO_GESTOR_GROUPS, PARCEIRO_TECNICO_GROUPS } from "@/config/portalMenus";
import { getPapelLabel } from "@/lib/portal/identidade";
import { usePortalBranding } from "@/hooks/useBranding";
import { useEntitlements } from "@/hooks/useEntitlements";
import { isPathEntitled } from "@/lib/saas/featureRouteMap";
import { CommercialOwnOrders } from "@/components/comercial/CommercialOwnOrders";
import { PartnerOrderEntry } from "@/components/comercial/PartnerOrderEntry";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supplierLabel } from "@/lib/comercial/supplierName";

// NOTA: Estrutura de vínculo B2B × cliente (Meus Produtores, Usuários × Clientes,
// Técnicos × Produtores) preservada no banco/rotas para uso futuro.
// Acesso oculto temporariamente por decisão de produto (Fase 2 - reformulação B2B).
// Os itens de menu passaram a ser declarados em `src/config/portalMenus.ts`
// (mesmas rotas, mesmos rótulos, mesmo `showFor`).

export default function PortalParceiroLayout() {
  const { user, profile, roles, role, signOut, loading } = useAuth();
  const entitlements = useEntitlements();
  const { data: ownPartner, isLoading, isError: partnerError, isSuccess: partnerSuccess, ready: partnerReady } = useMyPartner();
  const location = useLocation();
  const filterMemory = useRef(createCatalogFilterMemory());
  const guardFilterMemory = useContext(CatalogFilterMemoryContext);
  // Preferences survive only this layout's transient unavailability. Identity/context
  // changes clear synchronously, including A→B→A; no query cache or storage is retained.
  const preferenceIdentity = user?.id && profile?.user_id === user.id && profile.organization_id &&
    location.pathname === "/portal-parceiro/catalogo"
    ? JSON.stringify([user.id, profile.organization_id, [...(roles ?? [])].sort(), "b2b"]) : null;
  const filterPreferences = (guardFilterMemory ?? filterMemory.current).bind(preferenceIdentity,
    partnerReady && !partnerError
      ? ownPartner?.id ?? (partnerSuccess && ownPartner === null ? null : undefined)
      : undefined);
  const canReadOwnFinance = partnerReady && !partnerError && entitlements.status === "ready" && ownFinanceRoute(location.pathname, ownPartner?.financeRead === true, entitlements.features);
  const canReadOwnerRoute = partnerReady && !partnerError && ownerCatalogRoute(location.pathname, ownPartner?.capabilities) && isPathEntitled(location.pathname, entitlements);
  const canCreateOwnerOrder = canReadOwnerRoute && entitlements.status === "ready" &&
    ownerOrderRoute(location.pathname, ownPartner?.orderCreate === true, entitlements.features);
  const { data: contexts } = useAvailableContexts();
  const switchPortal = useSwitchPortal();
  const canSwitchPortal = !!contexts && contexts.available_contexts.length >= 2;
  const navigate = useNavigate();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebarOpenState("parceiro");
  const [simulatedId, setSimulatedId] = useState<string | null>(null);

  const externalManager = isC2ExternalScope(roles) && roles.includes("parceiro_b2b");
  const isStaff = role === "administrador" || role === "gestor_comercial";
  const isTecnico = !externalManager && role === "parceiro_b2b_tecnico";
  const commercialOwner = ownPartner?.mode === "commercial_owner";
  const menuGroups = (isTecnico ? PARCEIRO_TECNICO_GROUPS : PARCEIRO_GESTOR_GROUPS)
    .map((group) => ({ ...group, items: group.items.filter((item) => (!commercialOwner || (partnerReady && !partnerError && (ownerCatalogRoute(item.route, ownPartner?.capabilities) || ownerOrdersRoute(item.route) || (entitlements.status === "ready" && ownFinanceRoute(item.route, ownPartner?.financeRead === true, entitlements.features))))) && isPathEntitled(item.route, entitlements)) }))
    .filter((group) => group.items.length > 0);
  const papelVisual = isStaff ? "staff" : isTecnico ? "tecnico" : "gestor";


  const { data: allPartners = [] } = useQuery({
    queryKey: ["partner-accounts-active"],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_accounts")
        .select("id, razao_social, nome_fantasia, desconto_padrao, ativo")
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (isStaff && !simulatedId && allPartners.length > 0) {
      setSimulatedId(allPartners[0].id);
    }
  }, [isStaff, allPartners, simulatedId]);

  const partner = useMemo(() => {
    if (isStaff) return allPartners.find((p) => p.id === simulatedId) ?? null;
    return ownPartner;
  }, [isStaff, ownPartner, allPartners, simulatedId]);

  const parceiroBrand = usePortalBranding("parceiro", commercialOwner ? null : partner?.id ?? null);

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!externalManager && role && !["parceiro_b2b", "parceiro_b2b_tecnico", "administrador", "gestor_comercial"].includes(role)) {
    return <Navigate to="/" replace />;
  }
  if (!isStaff && (!partnerReady || partnerError)) return <div role="status">Acesso indisponível.</div>;
  const isPartnerRole = role === "parceiro_b2b" || role === "parceiro_b2b_tecnico";

  // Rotas de vínculo B2B × cliente ocultadas para todos parceiros B2B (Fase 2).
  // Estrutura preservada apenas para admin/gestor_comercial para suporte interno.
  if (isPartnerRole && (
    location.pathname.startsWith("/portal-parceiro/meus-produtores")
    || location.pathname.startsWith("/portal-parceiro/usuarios-clientes")
    || location.pathname.startsWith("/portal-parceiro/tecnicos-produtores")
  )) {
    return <Navigate to="/portal-parceiro/dashboard" replace />;
  }

  // Substituição /novo → /catalogo (Fase 2). Técnico não acessa catálogo.
  if (isTecnico && location.pathname.startsWith("/portal-parceiro/catalogo")) {
    return <Navigate to="/portal-parceiro/dashboard" replace />;
  }
  if (location.pathname.startsWith("/portal-parceiro/novo")) {
    if (isTecnico) return <Navigate to="/portal-parceiro/simulador" replace />;
    return <Navigate to="/portal-parceiro/catalogo" replace />;
  }

  if (isTecnico && (
    location.pathname.startsWith("/portal-parceiro/financeiro")
    || location.pathname.startsWith("/portal-parceiro/pedidos")
    || location.pathname.startsWith("/portal-parceiro/historico")
    || location.pathname.startsWith("/portal-parceiro/meu-historico")
    || location.pathname.startsWith("/portal-parceiro/favoritos")
    || location.pathname.startsWith("/portal-parceiro/simulacoes-equipe")
    || location.pathname.startsWith("/portal-parceiro/solicitacoes")
  )) {
    return <Navigate to="/portal-parceiro/dashboard" replace />;
  }

  // Solicitações ocultada do gestor no menu (dados integrados em Meus Pedidos/Simulações).
  // Rota mantida acessível apenas para admin/gestor_comercial se necessário.
  if (role === "parceiro_b2b" && location.pathname.startsWith("/portal-parceiro/solicitacoes")) {
    return <Navigate to="/portal-parceiro/pedidos" replace />;
  }




  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="min-h-screen flex w-full">
        <PortalSidebar
          portal="parceiro"
          groups={menuGroups}
          brandTitle="Portal Parceiro B2B"
          brandSubtitle={getPapelLabel(papelVisual)}
          brandIcon={ShoppingCart}
        />
        <div className="flex-1 flex flex-col min-w-0">
      <PortalTopBar
        brandTitle={parceiroBrand.marcaPropria?.nome || "Portal Parceiro B2B"}
        brandIcon={ShoppingCart}
        brandLogoUrl={parceiroBrand.marcaPropria?.logoUrl ?? null}
        brandSubtitle={getPapelLabel(papelVisual)}
        hideBrandOnMobile
        onSwitchPortal={canSwitchPortal ? () => { void switchPortal(); } : undefined}
        leadingSlot={<SidebarTrigger className="h-10 w-10 shrink-0" />}
        contextSlot={
          isStaff ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 min-w-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Ver como</span>
              <Select value={simulatedId ?? ""} onValueChange={(v) => setSimulatedId(v)}>
                <SelectTrigger aria-label="Ver como parceiro" className="h-8 text-xs sm:text-sm w-32 sm:w-[200px] min-w-0 [&>span]:truncate" title={partner?.razao_social}>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {allPartners.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="max-w-[min(28rem,calc(100vw-2rem))] [&>span:last-child]:whitespace-normal [&>span:last-child]:break-words">
                      {p.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <span
              className="hidden sm:block text-sm text-muted-foreground truncate max-w-[200px]"
              title={ownPartner?.razao_social ?? undefined}
            >
              {isLoading ? "..." : ownPartner?.razao_social ?? "—"}
            </span>
          )
        }
      />

      <main className="flex-1 p-4 md:p-6 overflow-x-auto">
        {commercialOwner && externalManager && ["/portal-parceiro/dashboard", "/portal-parceiro/catalogo"].includes(location.pathname) &&
          <PartnerOrderEntry
            pending={entitlements.status === "loading" || isLoading}
            canReadCatalog={partnerReady && !partnerError && ownerCatalogRoute("/portal-parceiro/catalogo", ownPartner?.capabilities) && isPathEntitled("/portal-parceiro/catalogo", entitlements)}
            canCreate={partnerReady && !partnerError && ownerCatalogRoute("/portal-parceiro/catalogo", ownPartner?.capabilities) && isPathEntitled("/portal-parceiro/catalogo", entitlements) && entitlements.status === "ready" && ownerOrderRoute("/portal-parceiro/catalogo", ownPartner?.orderCreate === true, entitlements.features)}
          />}
        {isStaff && partner && (
          <div
            className="mb-4 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            role="status"
          >
            Você está visualizando como <span className="font-medium text-foreground">{partner.razao_social}</span> (visão interna).
          </div>
        )}
        {commercialOwner && canReadOwnFinance ? <OwnerFinance key={ownPartner.id} partnerId={ownPartner.id} capability={ownPartner.financeRead === true} /> : commercialOwner && canReadOwnerRoute ? (
          location.pathname === "/portal-parceiro/catalogo"
            ? canCreateOwnerOrder
              // Carrinho canônico (NovoPedido → simulate/create_partner_order_secure) somente
              // com capacidade server-side explícita; caso contrário catálogo somente leitura.
              ? <Outlet key={ownPartner.id} context={{ partner: ownPartner }} />
              : <OwnerCatalog key={JSON.stringify([preferenceIdentity, ownPartner.id])} partnerId={ownPartner.id} filterPreferences={filterPreferences} />
            : <Outlet context={{ partner: ownPartner }} />
        ) : commercialOwner && ownerOrdersRoute(location.pathname) ? (
          // Acompanhamento somente leitura pós-envio: canal canônico fail-closed,
          // sem ações legadas (mensagens/andamento/edição) e sem declarar validação.
          <section className="space-y-4" aria-label="Acompanhamento de pedidos">
            <h1 className="text-2xl font-semibold">Meus pedidos</h1>
            <CommercialOwnOrders partnerId={ownPartner.id} />
            <p className="text-sm text-muted-foreground">
              Pedidos enviados seguem para análise comercial da {supplierLabel(ownPartner.sellerName)}. Aprovação, cobrança,
              nota fiscal e entrega dependem de validações internas e podem permanecer bloqueadas —
              este acompanhamento não garante nenhuma dessas etapas.
            </p>
          </section>
        ) : commercialOwner ? (
          <section className="space-y-4" aria-label="Cliente comercial">
            <h1 className="text-2xl font-semibold">{ownPartner.razao_social}</h1>
            <p className="text-muted-foreground">{ownPartner.codigo}</p>
            {location.pathname === "/portal-parceiro/dashboard" && !isTecnico && <CommercialOwnOrders partnerId={ownPartner.id} />}
            <p role="status" className="text-muted-foreground">
              {entitlements.status === "ready" && menuGroups.some(group => group.items.some(item => ownFinanceRoute(item.route, ownPartner?.financeRead === true, entitlements.features)))
                ? "Simulações, arquivos e alterações de pedidos estão indisponíveis."
                : "Simulações, financeiro, arquivos e alterações de pedidos estão indisponíveis."}
            </p>
          </section>
        ) : !partner && !isLoading && (role === "parceiro_b2b" || role === "parceiro_b2b_tecnico") ? (

          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            Seu usuário ainda não está vinculado a um parceiro B2B. Entre em contato com a empresa fornecedora.
          </div>
        ) : !partner ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            {isStaff ? "Selecione um parceiro para visualizar." : "Nenhum parceiro selecionado."}
          </div>
        ) : (
          <Outlet context={{ partner }} />
        )}
      </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

