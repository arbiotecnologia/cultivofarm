import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { TrocaSenhaObrigatoria } from "@/components/auth/TrocaSenhaObrigatoria";
import { OnboardingEmpresa } from "@/components/onboarding/OnboardingEmpresa";
import { useOnboardingState } from "@/hooks/useOrgOnboarding";
import { OnboardingRevalidando } from "@/components/onboarding/OnboardingRevalidando";

export function AppLayout() {
  const { role, profile, user } = useAuth();
  const { config, defaults } = useSystemConfig();
  const nomeEmpresa = config?.nome_empresa || defaults.nome_empresa;
  const onboarding = useOnboardingState(
    !!profile?.organization_id && profile?.senha_provisoria !== true,
    { userId: user?.id, organizationId: profile?.organization_id },
  );
  // Mocks/legado sem `bloqueado` caem no `required` do servidor.
  const bloqueado = onboarding.bloqueado ?? !!onboarding.data?.required;

  // Primeiro acesso com senha provisória: bloqueia até a troca.
  if (profile?.senha_provisoria === true) {
    return <TrocaSenhaObrigatoria />;
  }

  // Guarda inversa: produtor não pode acessar áreas internas
  if (role === "cliente_produtor") {
    return <Navigate to="/portal" replace />;
  }

  // Empresa com cadastro pendente: só onboarding, sair e suporte.
  // Retorno após ausência longa / bfcache: não exibe formulário nem módulo antigos até revalidar.
  if (onboarding.revalidando === true) {
    return <OnboardingRevalidando />;
  }
  if (onboarding.data && bloqueado) {
    return <OnboardingEmpresa state={onboarding.data} />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <PortalTopBar
            brandTitle={nomeEmpresa}
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
