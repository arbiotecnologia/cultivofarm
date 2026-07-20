import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import PainelOperacional from "./PainelOperacional";
import { DashboardAgronomico } from "@/components/bi/DashboardAgronomico";
import { useSystemConfig } from "@/hooks/useSystemConfig";


import { ErrorRecovery } from "@/components/ErrorRecovery";

export default function Index() {
  const { role, loading, error, refresh, signOut } = useAuth();
  useSystemConfig(); // Carrega as configurações globais necessárias

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground flex flex-col items-center gap-2">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          Carregando painel...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorRecovery 
        message={error} 
        onRetry={refresh} 
        onSignOut={signOut}
      />
    );
  }


  // Redirecionamento baseado em perfil
  if (role === "cliente_produtor") {
    return <Navigate to="/portal" replace />;
  }

  // Perfis administrativos e gestores veem o painel operacional
  if (role === "administrador" || role === "gestor") {
    return <PainelOperacional />;
  }

  // Perfis técnicos veem o dashboard agronômico/BI
  if (role === "consultor_tecnico" || role === "tecnico_agronomo" || role === "aplicador") {
    return <DashboardAgronomico />;
  }

  // Default para outros perfis logados (administrativo, etc)
  return <DashboardAgronomico />;
}