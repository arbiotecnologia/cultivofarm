import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthenticatedBlobUrls } from "./useAuthenticatedBlobUrls";
import { AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED } from "@/lib/authz/attachmentBlobGate";

function useLegacySignedUrls(paths: (string | null | undefined)[], bucket: string = "consultor-arquivos") {
  const { user, profile, roles, loading: authLoading, authzReady = true, authzEpoch = 0 } = useAuth();
  // Foundation de cache (mesma identidade): lease pendente/expirada esconde
  // URLs assinadas; época no escopo impede que respostas antigas reabram.
  const ready = !authLoading && !!user?.id && profile?.user_id === user.id &&
    profile.ativo === true && profile.senha_provisoria !== true &&
    !!profile.organization_id && roles.length > 0 && authzReady;
  const scope = JSON.stringify([ready, user?.id, profile?.organization_id, [...roles].sort(), bucket, paths, authzEpoch]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const [result, setResult] = useState<{ scope: string; urls: Record<string, string>; loading: boolean; error: Error | null }>({ scope: "", urls: {}, loading: false, error: null });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const gen = ++generation.current;
    const isCurrent = () => !cancelado && gen === generation.current && currentScope.current === scope;
    setResult({ scope, urls: {}, loading: ready, error: null });

    const fetchUrls = async () => {
      // Caminhos válidos e sem repetição: evita pedir a mesma assinatura 2x.
      const validPaths = Array.from(
        new Set(paths.filter((p): p is string => typeof p === "string" && p.length > 0)),
      );
      if (!ready || validPaths.length === 0) {
        setResult({ scope, urls: {}, loading: false, error: null });
        return;
      }
      try {
        const { data, error: erroStorage } = await supabase.storage
          .from(bucket)
          .createSignedUrls(validPaths, 3600); // 1 hora

        if (erroStorage) throw erroStorage;

        const newUrls: Record<string, string> = {};
        (data ?? []).forEach((item) => {
          // A chave é o próprio caminho do objeto; item sem path é descartado.
          if (item?.signedUrl && item?.path) newUrls[item.path] = item.signedUrl;
        });

        // Resposta parcial (item com erro individual, sem signedUrl ou ausente)
        // é tratada como falha: preservamos o que veio válido, mas expomos o
        // erro para habilitar "Tentar novamente". Nunca há fallback inseguro.
        const faltando = validPaths.filter((p) => !newUrls[p]);
        if (isCurrent()) {
          setResult({ scope, urls: newUrls, loading: false, error: faltando.length > 0
              ? new Error(
                  `Falha ao gerar ${faltando.length} de ${validPaths.length} URLs seguras`,
                )
              : null });
        }
      } catch {
        // Erros do transporte podem conter tokens: não repassar nem registrar.
        if (isCurrent()) setResult({ scope, urls: {}, loading: false, error: new Error("Falha ao gerar URLs seguras") });
      }
    };

    void fetchUrls();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, tentativa]);

  const refresh = useCallback(() => setTentativa((n) => n + 1), []);

  // Cerca de apresentação no próprio render, antes de cleanup/effects.
  const visible = ready && result.scope === scope;
  return { urls: visible ? result.urls : {}, loading: visible ? result.loading : ready, error: visible ? result.error : null, refresh };
}

// Both hooks remain mounted; closed candidate does not download or mint extra URLs.
export function useSignedUrls(paths: (string | null | undefined)[], bucket = "consultor-arquivos", options: { lazy?: boolean } = {}) {
  const legacy = useLegacySignedUrls(AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED ? [] : paths, bucket);
  const blobs = useAuthenticatedBlobUrls(AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED ? paths : [], bucket, { enabled: AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED, lazy: options.lazy });
  return AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED ? blobs : { ...legacy, request: (_path: string) => {} };
}
