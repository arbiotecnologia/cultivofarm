import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthzEpochBoundary } from "@/components/authz/AuthzEpochBoundary";
import { useB2BFinanceCapability } from "@/hooks/useB2BFinance";
import { isExclusiveFinanceRoles } from "@/lib/comercial/b2bFinanceRole";

/**
 * Guarda visual do portal Financeiro B2B. Exige papel exclusivo e capacidade positiva do
 * servidor; erro, resposta inválida ou negação nunca montam o conteúdo. RPC/RLS seguem autoritativos.
 */
export function B2BFinanceRouteGuard({ children }: { children: (cap: { partnerId: string; partnerName: string | null; exportAllowed: boolean; creditRead: boolean }) => ReactNode }) {
  const { user, loading, roles, authzReady = true } = useAuth();
  const location = useLocation();
  const cap = useB2BFinanceCapability();
  if (!loading && user && !authzReady) return <AuthzEpochBoundary>{null}</AuthzEpochBoundary>;
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  if (!isExclusiveFinanceRoles(roles)) return <Navigate to="/sem-permissao" replace />;
  if (cap.isLoading || (!cap.data && !cap.isError && cap.enabled)) return <Spinner />;
  if (cap.isError || !cap.data) return <Unavailable onRetry={() => void cap.refetch()} />;
  if (cap.data.allowed !== true) return <Navigate to="/sem-permissao" replace />;
  return <>{children({ partnerId: cap.data.partner_id, partnerName: cap.data.partner_name, exportAllowed: cap.data.export, creditRead: cap.data.credit_read })}</>;
}
function Spinner() {
  return <div className="min-h-dvh flex items-center justify-center bg-background" role="status" aria-live="polite">
    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" /><span className="sr-only">Carregando…</span></div>;
}
function Unavailable({ onRetry }: { onRetry: () => void }) {
  return <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center bg-background" role="alert">
    <p className="text-foreground">Acesso financeiro indisponível no momento.</p>
    <button type="button" className="underline text-primary" onClick={onRetry}>Tentar novamente</button></div>;
}
