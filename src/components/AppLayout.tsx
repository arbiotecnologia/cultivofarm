import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PortalTopBar } from "@/components/portal/PortalTopBar";

export function AppLayout() {
  const { role } = useAuth();

  // Guarda inversa: produtor não pode acessar áreas internas
  if (role === "cliente_produtor") {
    return <Navigate to="/portal" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <PortalTopBar
            brandTitle="Cultivo Farm"
            brandSubtitle="On-Farm"
            leadingSlot={<SidebarTrigger className="ml-0 h-10 w-10" />}
          />
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
