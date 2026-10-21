import { ReactNode, useEffect } from "react";
import { observeResumePrincipal, resumePrincipalKey } from "@/lib/navigation/protectedResumeContext";
import { useAuth } from "@/hooks/useAuth";
import { AUTHZ_CACHE_FOUNDATION_ENABLED } from "@/lib/authz/authzEpochGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldAlert } from "lucide-react";

/**
 * Boundary real da foundation de cache de autorização (mesma identidade).
 *
 * Envolvido nos guards de portal existentes (PortalGuard / B2BRouteGuard) —
 * sem rota nem provider paralelo. Com o gate fechado, renderiza os filhos sem
 * alteração. Com o gate aberto e perfil EXTERNO:
 *
 * - "pending"/"expired": ESCONDE imediatamente todo o conteúdo sensível e
 *   mostra estado amigável com "Tentar novamente" (revalidação manual).
 * - "valid": renderiza os filhos com `key={authzEpoch}` — mudança de época
 *   (revogação, troca de vínculo, A→B→A) REMONTA o conteúdo, descartando
 *   rascunhos, seleções e objectURLs via cleanup de unmount dos consumidores.
 */
export function AuthzEpochBoundary({ children }: { children: ReactNode }) {
  const { authzReady, authzEpoch, authzState, revalidateAuthz, authzLatchBlocked, user, profile, roles } = useAuth();
  // Identidade/empresa/papéis diferentes descartam a retomada de navegação.
  const principal = resumePrincipalKey(user?.id, profile?.organization_id, roles ?? []);
  useEffect(() => { observeResumePrincipal(principal); }, [principal]);

  if (!AUTHZ_CACHE_FOUNDATION_ENABLED) return <>{children}</>;

  if (!authzReady) {
    const checking = authzState === "pending" || authzState === "idle";
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            {checking ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            )}
            <CardTitle className="text-lg">
              {checking ? "Verificando seu acesso" : "Sessão de acesso pausada"}
            </CardTitle>
            <CardDescription>
              {checking
                ? "Estamos confirmando suas permissões. Isso leva apenas alguns segundos."
                : authzLatchBlocked
                ? "Suas permissões foram alteradas. Saia e entre novamente para continuar com o novo acesso."
                : "Não foi possível confirmar suas permissões no momento. Verifique sua conexão e tente novamente."}
            </CardDescription>
          </CardHeader>
          {!checking && (
            <CardContent className="flex justify-center">
              <Button onClick={() => revalidateAuthz()}>Tentar novamente</Button>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  // Remount por época: rascunhos/seleções/objectURLs são descartados no
  // unmount dos consumidores; respostas antigas não reabrem (fences por época).
  return <div key={authzEpoch} className="contents">{children}</div>;
}
