import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FileText, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED } from "@/lib/authz/attachmentBlobGate";

interface Evidencia {
  id: string;
  tipo: string;
  storage_path: string;
  legenda: string | null;
  mime: string | null;
  versao_origem_id: string | null;
  aplicacoes_origem?: {
    versao: number;
    data_aplicacao: string;
  } | null;
}

interface Props {
  aplicacaoId: string;
}

export function EvidenciasGallery({ aplicacaoId }: Props) {
  const access = useStorageAccessScope(`aplicacao:${aplicacaoId}`);
  const [result, setResult] = useState<{ scope: string; items: Evidencia[] }>({ scope: "", items: [] });
  const items = access.ready && result.scope === access.scope ? result.items : [];
  const { urls, request } = useSignedUrls(items.map(e => e.storage_path), "aplicacao-evidencias", { lazy: true });
  const galleryRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{ scope: string; path: string } | null>(null);
  const lightboxUrl = lightbox?.scope === access.scope ? urls[lightbox.path] : undefined;

  useEffect(() => {
    if (!AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED || !access.ready || !galleryRef.current) return;
    const current = access.capture();
    // Visible photo previews only; other formats remain explicit click downloads.
    const observer = new IntersectionObserver(entries => {
      if (!current()) return;
      for (const entry of entries) {
        const path = (entry.target as HTMLElement).dataset.attachmentPath;
        if (entry.isIntersecting && path) { request(path); observer.unobserve(entry.target); }
      }
    }, { rootMargin: "100px" });
    galleryRef.current.querySelectorAll("[data-attachment-path]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [access.scope, access.ready, items, request]);

  useEffect(() => {
    const current = access.capture();
    let cancelled = false;
    setResult({ scope: access.scope, items: [] });
    setLightbox(null);
    if (!access.ready || !aplicacaoId) return;
    (async () => {
      // Usando query com join para pegar a versão da aplicação de origem
      const { data, error } = await supabase
        .from("aplicacao_evidencias_vinculos")
        .select(`
          evidencia:evidencia_id (
            id, tipo, storage_path, legenda, mime, versao_origem_id,
            aplicacoes_origem:aplicacoes!aplicacao_evidencias_versao_origem_id_fkey(versao, data_aplicacao)
          )
        `)
        .eq("aplicacao_id", aplicacaoId)
        .order("created_at", { ascending: true });
        
      if (!current() || cancelled) return;
      const flattened = error ? [] : (data ?? []).flatMap(d => d.evidencia ? [d.evidencia as unknown as Evidencia] : []);
      setResult({ scope: access.scope, items: flattened });
    })().catch(() => { if (current() && !cancelled) setResult({ scope: access.scope, items: [] }); });
    return () => { cancelled = true; };
    // Scope includes resource, readiness, identity, tenant and roles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.scope, aplicacaoId]);

  if (!items.length) {
    return <p className="text-sm text-muted-foreground italic">Sem evidências anexadas.</p>;
  }

  return (
    <>
      <div ref={galleryRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {items.map((e) => (
          <div key={e.id} className="border rounded-lg overflow-hidden bg-card relative group">
            <Button
              variant="ghost"
              type="button"
              data-attachment-path={e.tipo === "foto" ? e.storage_path : undefined}
              disabled={!urls[e.storage_path] && !AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED}
              onClick={() => {
                if (!access.ready) return;
                if (!urls[e.storage_path]) { request(e.storage_path); return; }
                if (e.tipo === "foto") setLightbox({ scope: access.scope, path: e.storage_path });
                else window.open(urls[e.storage_path], "_blank", "noopener,noreferrer");
              }}
              className="block w-full h-auto p-0 aspect-square bg-muted relative"
            >
              {e.tipo === "foto" && urls[e.storage_path] ? (
                <img src={urls[e.storage_path]} alt={e.legenda || ""} className="w-full h-full object-cover" />
              ) : (
                <FileText className="h-8 w-8 text-muted-foreground absolute inset-0 m-auto" />
              )}
              
              {e.versao_origem_id && (
                <div className="absolute top-1 right-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="px-1 py-0 h-5 backdrop-blur-sm text-[10px] font-normal border-none">
                          <History className="h-3 w-3 mr-0.5 opacity-70" />
                          v{e.aplicacoes_origem?.versao || "?"}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Herdado da versão {e.aplicacoes_origem?.versao || "?"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </Button>
            {e.legenda && <p className="text-xs p-2 truncate bg-background/50 border-t">{e.legenda}</p>}
          </div>
        ))}
      </div>
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Evidência da aplicação</DialogTitle>
          {lightboxUrl && <img src={lightboxUrl} alt="" className="w-full h-auto" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
