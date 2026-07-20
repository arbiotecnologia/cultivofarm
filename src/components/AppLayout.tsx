import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { NotificacoesPopover } from "@/components/notificacoes/NotificacoesPopover";
import { AlertasNotificationBell } from "@/components/alertas/AlertasNotificationBell";

export function AppLayout() {
  const { profile, role, signOut } = useAuth();

  // Guarda inversa: produtor não pode acessar áreas internas
  if (role === "cliente_produtor") {
    return <Navigate to="/portal" replace />;
  }

  const roleLabels: Record<string, string> = {
    administrador: "Administrador",
    tecnico_agronomo: "Técnico Agrônomo",
    producao: "Produção",
    administrativo: "Administrativo",
    gestor: "Gestor",
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center justify-between border-b bg-card px-3 sm:px-4 gap-2 sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="ml-0 h-10 w-10" />
              <div className="flex flex-col sm:hidden">
                <span className="text-xs font-bold leading-none">AR Bio</span>
                <span className="text-[10px] text-muted-foreground">On-Farm</span>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-3 overflow-hidden">
              {role && (
                <Badge variant="secondary" className="text-[10px] sm:text-xs hidden md:inline-flex px-1.5 h-5">
                  {roleLabels[role] || role}
                </Badge>
              )}
              <div className="flex flex-col items-end mr-1 min-w-0">
                <span className="text-xs sm:text-sm font-medium truncate max-w-[80px] xs:max-w-[100px] sm:max-w-[150px]">
                  {profile?.nome || profile?.email?.split('@')[0] || "Usuário"}
                </span>
                <span className="text-[9px] sm:text-[10px] text-muted-foreground hidden xs:block">
                  {roleLabels[role] || role}
                </span>
              </div>
              <AlertasNotificationBell />
              <NotificacoesPopover />
              <Button variant="ghost" size="icon" onClick={signOut} title="Sair" className="shrink-0 h-9 w-9">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
