import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canAccess, getHomeForRole } from "@/lib/permissions";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

import { Sprout, LogOut, Building2, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PortalSidebar } from "@/components/nav/PortalSidebar";
import { useSidebarOpenState } from "@/hooks/useNavCollapseState";
import { PRODUTOR_MENU_GROUPS } from "@/config/portalMenus";
import { usePortalBranding } from "@/hooks/useBranding";


// Itens do menu passaram a ser declarados em `src/config/portalMenus.ts`
// (mesmas rotas, mesmos rótulos e mesmos `permissionPath`).

export default function PortalLayout() {
  const { signOut, profile, role } = useAuth();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebarOpenState("produtor");
  const [clientePickerOpen, setClientePickerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { clienteId, clienteNome, clientes, setClienteAtivo, loading } = usePortalCliente();
  const brand = usePortalBranding("cliente", clienteId);

  // Contagem de recomendações aguardando decisão do produtor
  const { data: aguardandoCount = 0 } = useQuery({
    queryKey: ["portal-fila-aguardando", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { count } = await supabase
        .from("registros_consultor")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", clienteId!)
        .eq("status", "aprovado");
      return count || 0;
    },
  });

  // Atualização em tempo real do contador
  useEffect(() => {
    if (!clienteId) return;

    const channel = supabase
      .channel(`portal-badge-${clienteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "registros_consultor",
          filter: `cliente_id=eq.${clienteId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["portal-fila-aguardando", clienteId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clienteId, queryClient]);

  // Filtra o menu pelo perfil do usuário (ACCESS_MAP) — regra inalterada.
  const menuGroups = useMemo(
    () =>
      PRODUTOR_MENU_GROUPS.map((g) => ({
        ...g,
        items: g.items
          .filter((it) => it.permissionPath == null || canAccess(role, it.permissionPath))
          .map((it) =>
            it.route === "/portal/recomendacoes" && aguardandoCount > 0
              ? { ...it, badgeCount: aguardandoCount }
              : it,
          ),
      })).filter((g) => g.items.length > 0),
    [role, aguardandoCount],
  );

  // Para perfis não-produtor/admin/gestor, manda para sua home
  if (role && !["cliente_produtor", "administrador", "gestor"].includes(role)) {
    return <Navigate to={getHomeForRole(role)} replace />;
  }

  // Usuário precisa ter pelo menos um cliente vinculado para usar o portal
  if (!loading && clientes.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PortalTopBar
          brandTitle="Portal do Produtor"
          brandIcon={Sprout}
        />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Nenhum cliente vinculado</h2>
            <p className="text-sm text-muted-foreground">
              Sua conta não está vinculada a nenhum cliente. Contate o administrador para concluir a configuração do acesso.
            </p>
            <Button variant="outline" onClick={async () => { await signOut(); navigate("/auth"); }}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Guard de rota: se a página atual não está nas permitidas, manda para o dashboard
  const currentItem = PRODUTOR_MENU_GROUPS.flatMap((g) => g.items).find(
    (it) => it.route === location.pathname,
  );
  if (currentItem && currentItem.permissionPath && !canAccess(role, currentItem.permissionPath)) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="min-h-screen flex w-full">
        <PortalSidebar
          portal="produtor"
          groups={menuGroups}
          brandTitle="Portal do Produtor"
          brandIcon={Sprout}
        />
        <div className="flex-1 flex flex-col min-w-0">
      <PortalTopBar
        brandTitle={brand.marcaPropria?.nome || "Portal do Produtor"}
        brandSubtitle={brand.marcaPropria?.nome ? "Portal do Produtor" : undefined}
        brandIcon={Sprout}
        brandLogoUrl={brand.marcaPropria?.logoUrl ?? null}
        hideBrandOnMobile
        leadingSlot={<SidebarTrigger className="h-10 w-10 shrink-0" />}
        contextSlot={
          clientes.length > 1 ? (
            <Popover open={clientePickerOpen} onOpenChange={setClientePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="max-w-[220px] gap-2">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">{clienteNome ?? "Selecionar cliente"}</span>
                  <ChevronsUpDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandList>
                    <CommandEmpty>Nada encontrado.</CommandEmpty>
                    <CommandGroup heading="Visualizando">
                      {clientes.map(c => (
                        <CommandItem key={c.id} value={c.nome} onSelect={() => { setClienteAtivo(c.id); setClientePickerOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", clienteId === c.id ? "opacity-100" : "opacity-0")} />
                          <span className="flex-1 truncate">{c.nome}</span>
                          {c.principal && <span className="text-[10px] text-muted-foreground ml-2">principal</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : clienteNome ? (
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground min-w-0">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-[160px]" title={clienteNome}>{clienteNome}</span>
            </div>
          ) : null
        }
      />


      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
