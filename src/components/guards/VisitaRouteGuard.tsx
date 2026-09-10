/**
 * H9-G Bloco 2C — Guard fail-closed das rotas internas de visita técnica
 * (`/visita-tecnica`, `/visita-tecnica/nova`, `/visita-tecnica/:id`).
 *
 * Executa ANTES do layout interno e de qualquer consulta ao banco:
 * - sem sessão → `/auth`;
 * - autenticado sem permissão → `/sem-permissao` (tela neutra com ação de voltar);
 * - falha/tempo esgotado → tela neutra de erro com "Tentar novamente" e "Voltar";
 * - autorizado → conteúdo original, sem alteração de comportamento.
 *
 * Nunca renderiza o conteúdo antes da decisão (sem flash) e nunca expõe
 * nomes, IDs relacionados ou a existência do registro solicitado.
 */
import { ReactNode, useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { resolveSafeHome } from "@/lib/navigation/safeHome";
import { readActiveContext } from "@/lib/navigation/portalRoleContext";

import {
  VISITA_GUARD_TIMEOUT_MS,
  resolveVisitaRouteAccess,
} from "@/lib/visita/visitaRouteAccess";

export function VisitaRouteGuard({ children }: { children?: ReactNode }) {
  const { user, roles, primaryRole, loading, error, refresh } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), VISITA_GUARD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const state = resolveVisitaRouteAccess({
    loading,
    timedOut,
    error,
    hasUser: !!user,
    roles,
    activeContext: readActiveContext(),
  });


  if (state === "carregando") {
    return (
      <div
        className="min-h-dvh flex items-center justify-center bg-background"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          Verificando acesso…
        </div>
      </div>
    );
  }

  if (state === "erro") {
    return (
      <main
        className="min-h-dvh flex items-center justify-center bg-background p-4"
        aria-labelledby="visita-guard-erro"
      >
        <div className="w-full max-w-md text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <h1 id="visita-guard-erro" className="text-xl font-semibold">
            Não foi possível verificar seu acesso
          </h1>
          <p className="text-sm text-muted-foreground">
            Tente novamente em instantes ou volte para a página inicial.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => void refresh()} aria-label="Tentar novamente">
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(resolveSafeHome({ hasUser: !!user, roles, primaryRole }), { replace: true })}
              aria-label="Voltar"
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Voltar
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (state === "nao_autenticado") {
    return <Navigate to="/auth" replace />;
  }

  if (state === "negado") {
    return <Navigate to="/sem-permissao" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

export default VisitaRouteGuard;
