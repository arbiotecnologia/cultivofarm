import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSignedUrls(paths: (string | null | undefined)[], bucket: string = "consultor-arquivos") {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const chave = JSON.stringify(paths);

  useEffect(() => {
    let cancelado = false;

    const fetchUrls = async () => {
      const validPaths = paths.filter((p): p is string => !!p);
      if (validPaths.length === 0) {
        setUrls({});
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { data, error: erroStorage } = await supabase.storage
          .from(bucket)
          .createSignedUrls(validPaths, 3600); // 1 hora

        if (erroStorage) throw erroStorage;

        const newUrls: Record<string, string> = {};
        (data ?? []).forEach((item) => {
          if (item.signedUrl) {
            // A chave é o próprio caminho do objeto.
            newUrls[item.path || ""] = item.signedUrl;
          }
        });
        if (!cancelado) setUrls(newUrls);
      } catch (err) {
        // Nunca logar a URL assinada nem o token; apenas a mensagem.
        if (!cancelado) {
          setUrls({});
          setError(err instanceof Error ? err : new Error("Falha ao gerar URLs seguras"));
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    void fetchUrls();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, bucket, tentativa]);

  const refresh = useCallback(() => setTentativa((n) => n + 1), []);

  return { urls, loading, error, refresh };
}
