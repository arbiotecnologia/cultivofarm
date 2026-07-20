import { NavLink, Outlet, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyPartner } from "@/hooks/useMyPartner";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ListOrdered, PlusCircle, History, LogOut, Menu, Wallet, LayoutDashboard, Star, TrendingUp, FileText, FlaskConical, Users, Inbox, Repeat } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { useSwitchPortal } from "@/hooks/useSwitchPortal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MenuItem = {
  title: string;
  url: string;
  icon: any;
  showFor: "all" | "gestor" | "tecnico";
};

// NOTA: Estrutura de vínculo B2B × cliente (Meus Produtores, Usuários × Clientes,
// Técnicos × Produtores) preservada no banco/rotas para uso futuro.
// Acesso oculto temporariamente por decisão de produto (Fase 2 - reformulação B2B).
const menuGestor: MenuItem[] = [
  { title: "Dashboard", url: "/portal-parceiro/dashboard", icon: LayoutDashboard, showFor: "gestor" },
  { title: "Meus Pedidos", url: "/portal-parceiro/pedidos", icon: ListOrdered, showFor: "gestor" },
  { title: "Simulações", url: "/portal-parceiro/simulacoes-equipe", icon: FlaskConical, showFor: "gestor" },
  { title: "Catálogo", url: "/portal-parceiro/catalogo", icon: ShoppingCart, showFor: "gestor" },
  { title: "Fichas Técnicas", url: "/portal-parceiro/fichas", icon: FileText, showFor: "gestor" },
  { title: "Favoritos", url: "/portal-parceiro/favoritos", icon: Star, showFor: "gestor" },
  { title: "Meu Histórico", url: "/portal-parceiro/meu-historico", icon: TrendingUp, showFor: "gestor" },
  { title: "Financeiro", url: "/portal-parceiro/financeiro", icon: Wallet, showFor: "gestor" },
];

const menuTecnico: MenuItem[] = [
  { title: "Dashboard", url: "/portal-parceiro/dashboard", icon: LayoutDashboard, showFor: "tecnico" },
  { title: "Simulador", url: "/portal-parceiro/simulador", icon: FlaskConical, showFor: "tecnico" },
  { title: "Minhas Simulações", url: "/portal-parceiro/simulacoes", icon: History, showFor: "tecnico" },
  { title: "Fichas Técnicas", url: "/portal-parceiro/fichas", icon: FileText, showFor: "tecnico" },
];


export default function PortalParceiroLayout() {
  const { user, role, signOut, loading } = useAuth();
  const { data: ownPartner, isLoading } = useMyPartner();
  const { data: contexts } = useAvailableContexts();
  const switchPortal = useSwitchPortal();
  const canSwitchPortal = !!contexts && contexts.available_contexts.length >= 2;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [simulatedId, setSimulatedId] = useState<string | null>(null);

  const isStaff = role === "administrador" || role === "gestor_comercial";
  const isTecnico = role === "parceiro_b2b_tecnico";
  const menu = isTecnico ? menuTecnico : menuGestor;

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




  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <header className="md:hidden border-b flex items-center justify-between px-4 py-3 sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span className="font-semibold">Portal Parceiro</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label={open ? "Fechar menu" : "Abrir menu"}>
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      <aside
        className={cn(
          "md:w-64 md:min-h-screen border-r bg-card md:flex md:flex-col",
          open ? "flex flex-col" : "hidden md:flex",
        )}
      >
        <div className="hidden md:flex flex-col gap-1 px-4 py-4 border-b">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <div className="font-semibold leading-tight">Portal Parceiro</div>
              <div className="text-xs text-muted-foreground">B2B AR Bio</div>
            </div>
          </div>
          <span
            className="mt-1 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
            aria-label="Portal ativo: Parceiro B2B"
          >
            Portal Parceiro B2B
          </span>
        </div>

        {isStaff ? (
          <div className="px-4 py-3 border-b space-y-1">
            <div className="text-xs text-muted-foreground">Visualizar como parceiro</div>
            <Select value={simulatedId ?? ""} onValueChange={(v) => setSimulatedId(v)}>
              <SelectTrigger className="h-8 text-sm">
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
          <div className="px-4 py-3 border-b text-sm space-y-1">
            <div className="text-muted-foreground text-xs">Parceiro</div>
            <div className="font-medium truncate">
              {isLoading ? "..." : ownPartner?.razao_social ?? "—"}
            </div>
          </div>

        )}

        <nav className="flex-1 px-2 py-2 space-y-1">
          {menu.map((m) => (
            <NavLink
              key={m.url}
              to={m.url}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground",
                )
              }
            >
              <m.icon className="h-4 w-4" />
              {m.title}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t space-y-2">
          {canSwitchPortal && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setOpen(false);
                void switchPortal();
              }}
              aria-label="Trocar de portal"
            >
              <Repeat className="h-4 w-4 mr-2" aria-hidden="true" /> Trocar de portal
            </Button>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={handleSignOut} aria-label="Sair da conta">
            <LogOut className="h-4 w-4 mr-2" aria-hidden="true" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-6 overflow-x-auto">
        {!partner && !isLoading && (role === "parceiro_b2b" || role === "parceiro_b2b_tecnico") ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            Seu usuário ainda não está vinculado a um parceiro B2B. Entre em contato com a AR Bio.
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
  );
}
