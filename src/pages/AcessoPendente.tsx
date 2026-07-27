import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useAvailableContexts,
  registerLoginRedirect,
} from "@/hooks/useAvailableContexts";
import { PORTAL_CONTEXT_HOME } from "@/lib/portalContext";
import { getHomeForRole } from "@/lib/permissions";

export default function AcessoPendente() {
  const navigate = useNavigate();
  const { signOut, profile, roles } = useAuth();
  const { data, refetch, isFetching } = useAvailableContexts();

  const isAdmin = roles.includes("administrador");

  // Admin nunca fica preso em "acesso pendente" — vai direto à home administrativa.
  useEffect(() => {
    if (isAdmin) {
      navigate(getHomeForRole("administrador"), { replace: true });
    }
  }, [isAdmin, navigate]);

  // Fase Corretiva 7 — reagir automaticamente à liberação do acesso.
  useEffect(() => {
    if (isAdmin || !data) return;
    const ctxs = data.available_contexts;
    if (ctxs.length === 1) {
      const only = ctxs[0];
      registerLoginRedirect(only);
      navigate(PORTAL_CONTEXT_HOME[only], { replace: true });
    } else if (ctxs.length >= 2) {
      navigate("/selecionar-portal", { replace: true });
    }
  }, [data, navigate, isAdmin]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-xl">Acesso pendente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              {profile?.nome ? `Olá, ${profile.nome}. ` : ""}
              Seu usuário está ativo, mas ainda não possui um portal operacional liberado.
            </p>
            <p>Entre em contato com o administrador para solicitar a liberação do acesso.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="default"
              onClick={() => refetch()}
              disabled={isFetching}
              className="w-full"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar acesso
            </Button>
            <Button variant="outline" onClick={signOut} className="w-full">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
