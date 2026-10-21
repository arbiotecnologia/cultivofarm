import { useAuthenticatedBlobUrls } from "./useAuthenticatedBlobUrls";

/**
 * Nome mantido por compatibilidade dos consumidores. Não emite URLs assinadas:
 * entrega apenas blob: obtidos por download autenticado (RLS do Storage),
 * com fences de identidade/tenant/papéis/epoch e revogação no cleanup.
 */
export function useSignedUrls(paths: (string | null | undefined)[], bucket = "consultor-arquivos", options: { lazy?: boolean } = {}) {
  return useAuthenticatedBlobUrls(paths, bucket, { enabled: true, lazy: options.lazy });
}
