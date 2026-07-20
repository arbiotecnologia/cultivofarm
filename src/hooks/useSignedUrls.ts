import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSignedUrls(paths: (string | null | undefined)[], bucket: string = "consultor-arquivos") {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUrls = async () => {
      const validPaths = paths.filter((p): p is string => !!p);
      if (validPaths.length === 0) {
        setUrls({});
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrls(validPaths, 3600); // 1 hour

        if (error) throw error;

        const newUrls: Record<string, string> = {};
        data.forEach((item) => {
          if (item.signedUrl) {
            // We use the path as key
            newUrls[item.path || ""] = item.signedUrl;
          }
        });
        setUrls(newUrls);
      } catch (err) {
        console.error("Error generating signed URLs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUrls();
  }, [JSON.stringify(paths), bucket]);

  return { urls, loading };
}
