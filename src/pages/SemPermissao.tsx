import { useLocation, useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft, LogOut, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { getHomeForRole } from "@/lib/permissions";

/**
 * Página 403 — Acesso não autorizado.
 * Não expõe RLS, role interna ou parâmetros da URL.
 */
export default function SemPermissao() {
  const navigate = useNavigate();
  const location = useLocation() as {
    state?: { requested?: "b2b" | "technical"; from?: string };
  };
  const { role, signOut, user } = useAuth();
  const { data } = useAvailableContexts();

  const canSwitch =
    !!data && data.available_contexts.length >= 2;
  const hasSingleOther =
    data && data.available_contexts.length === 1 ? data.available_contexts[0] : null;

  const goHome = () => {
    if (hasSingleOther === "b2b") {
      navigate("/portal-parceiro/dashboard", { replace: true });
    } else if (hasSingleOther === "technical") {
      navigate(getHomeForRole(role), { replace: true });
    } else if (data && data.available_contexts.length === 0) {
      navigate("/acesso-pendente", { replace: true });
    } else {
      navigate(getHomeForRole(role), { replace: true });
    }
  };

  return (
    <main
      className="min-h-dvh flex items-center justify-center bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      aria-labelledby="sem-permissao-title"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle id="sem-permissao-title">Acesso não autorizado</CardTitle>
          <CardDescription>
            Você não possui permissão para acessar esta funcionalidade.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {user && (
            <Button onClick={goHome} aria-label="Voltar ao dashboard permitido">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Voltar
            </Button>
          )}
          {canSwitch && (
            <Button
              variant="outline"
              onClick={() => navigate("/selecionar-portal", { replace: true })}
              aria-label="Trocar de portal"
            >
              <Repeat className="mr-2 h-4 w-4" aria-hidden="true" />
              Trocar de portal
            </Button>
          )}
          <Button variant="ghost" onClick={signOut} aria-label="Sair da conta">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
