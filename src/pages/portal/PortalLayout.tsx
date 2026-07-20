import { Outlet, NavLink, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { canAccess, getHomeForRole } from "@/lib/permissions";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

import {
  LayoutDashboard, MapPin, FileText, ClipboardList,
  FlaskConical, Truck, Sprout, User, PlusCircle, Stethoscope,
  LogOut, Menu, X, Calendar, Building2, ChevronsUpDown, Check, CreditCard, Inbox
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  /** Rota interna usada para verificação de permissão (ACCESS_MAP). null = sempre visível */
  permissionPath: string | null;
}

const portalMenu: MenuItem[] = [
  { title: "Dashboard", url: "/portal", icon: LayoutDashboard, permissionPath: null },
  // "Meus Pedidos" removido — visualização B2B não é mais exibida ao produtor (Fase 2).
  { title: "Meus Títulos", url: "/portal/financeiro", icon: CreditCard, permissionPath: null },
  { title: "Fazendas", url: "/portal/fazendas", icon: MapPin, permissionPath: null },
  { title: "Minha Agenda", url: "/portal/agenda", icon: Calendar, permissionPath: null },
  { title: "Registros Técnicos", url: "/portal/registros", icon: Stethoscope, permissionPath: null },
  { title: "Recomendações", url: "/portal/recomendacoes", icon: FileText, permissionPath: null },
  { title: "Acompanhamento", url: "/portal/acompanhamento", icon: ClipboardList, permissionPath: null },

  { title: "Aplicações", url: "/portal/aplicacoes", icon: Sprout, permissionPath: null },
  { title: "Solicitar Atendimento", url: "/portal/solicitar", icon: PlusCircle, permissionPath: null },
  { title: "Meu Perfil", url: "/portal/perfil", icon: User, permissionPath: null },
];

export default function PortalLayout() {
  const { signOut, profile, role } = useAuth();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [clientePickerOpen, setClientePickerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { clienteId, clienteNome, clientes, setClienteAtivo, loading } = usePortalCliente();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

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

  // Filtra o menu pelo perfil do usuário (ACCESS_MAP)
  const filteredMenu = useMemo(
    () => portalMenu.filter(it => it.permissionPath === null || canAccess(role, it.permissionPath)),
    [role]
  );

  // Para perfis não-produtor/admin/gestor, manda para sua home
  if (role && !["cliente_produtor", "administrador", "gestor"].includes(role)) {
    return <Navigate to={getHomeForRole(role)} replace />;
  }

  // Usuário precisa ter pelo menos um cliente vinculado para usar o portal
  if (!loading && clientes.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
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
    );
  }

  // Guard de rota: se a página atual não está nas permitidas, manda para o dashboard
  const currentItem = portalMenu.find(it => it.url === location.pathname);
  if (currentItem && currentItem.permissionPath && !canAccess(role, currentItem.permissionPath)) {
    return <Navigate to="/portal" replace />;
  }

  const navContent = (
    <nav className="flex flex-col gap-1 p-3">
      {filteredMenu.map((item) => {
        const showBadge = item.url === "/portal/recomendacoes" && aguardandoCount > 0;
        return (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/portal"}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.title}</span>
            {showBadge && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {aguardandoCount}
              </Badge>
            )}
          </NavLink>
        );
      })}
    </nav>
  );


  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center justify-between px-4 h-14 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={() => setMenuOpen(!menuOpen)}>
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            )}
            <div className="flex items-center gap-2 min-w-0">
              <Sprout className="h-6 w-6 text-primary shrink-0" />
              <span className="font-bold text-lg truncate">Portal do Produtor</span>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            {clientes.length > 1 ? (
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
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span className="truncate max-w-[160px]">{clienteNome}</span>
              </div>
            ) : null}

            <span className="text-sm text-muted-foreground hidden md:block truncate max-w-[120px]">
              {(profile as any)?.nome || "Produtor"}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {!isMobile && (
          <aside className="w-60 border-r bg-card shrink-0 overflow-y-auto">
            {navContent}
          </aside>
        )}

        {isMobile && menuOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
            <aside className="relative z-50 w-64 bg-card border-r overflow-y-auto animate-in slide-in-from-left">
              {navContent}
            </aside>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
