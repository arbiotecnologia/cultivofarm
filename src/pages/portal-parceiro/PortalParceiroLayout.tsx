import { Outlet, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyPartner } from "@/hooks/useMyPartner";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// NOTA: Estrutura de vínculo B2B × cliente (Meus Produtores, Usuários × Clientes,
// Técnicos × Produtores) preservada no banco/rotas para uso futuro.
// Acesso oculto temporariamente por decisão de produto (Fase 2 - reformulação B2B).
// Os itens de menu passaram a ser declarados em `src/config/portalMenus.ts`
// (mesmas rotas, mesmos rótulos, mesmo `showFor`).

export default function PortalParceiroLayout() {
  const { user, role, signOut, loading } = useAuth();
  const { data: ownPartner, isLoading } = useMyPartner();
  const { data: contexts } = useAvailableContexts();
  const switchPortal = useSwitchPortal();
  const canSwitchPortal = !!contexts && contexts.available_contexts.length >= 2;
  const navigate = useNavigate();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebarOpenState("parceiro");
  const [simulatedId, setSimulatedId] = useState<string | null>(null);

  const isStaff = role === "administrador" || role === "gestor_comercial";
  const isTecnico = role === "parceiro_b2b_tecnico";
  const menuGroups = isTecnico ? PARCEIRO_TECNICO_GROUPS : PARCEIRO_GESTOR_GROUPS;
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

  const location = useLocation();

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (role && !["parceiro_b2b", "parceiro_b2b_tecnico", "administrador", "gestor_comercial"].includes(role)) {
    return <Navigate to="/" replace />;
  }
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
        brandTitle="Portal Parceiro B2B"
        brandIcon={ShoppingCart}
        brandSubtitle={getPapelLabel(papelVisual)}
        hideBrandOnMobile
        onSwitchPortal={canSwitchPortal ? () => { void switchPortal(); } : undefined}
        leadingSlot={<SidebarTrigger className="h-10 w-10 shrink-0" />}
        contextSlot={
          isStaff ? (
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Ver como</span>
              <Select value={simulatedId ?? ""} onValueChange={(v) => setSimulatedId(v)}>
                <SelectTrigger className="h-8 text-sm w-[200px]">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {allPartners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
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
        {isStaff && partner && (
          <div
            className="mb-4 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            role="status"
          >
            Você está visualizando como <span className="font-medium text-foreground">{partner.razao_social}</span> (visão interna).
          </div>
        )}
        {!partner && !isLoading && (role === "parceiro_b2b" || role === "parceiro_b2b_tecnico") ? (

          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            Seu usuário ainda não está vinculado a um parceiro B2B. Entre em contato com a Cultivo Farm.
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

