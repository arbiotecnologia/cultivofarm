import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileText, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const [items, setItems] = useState<(Evidencia & { signedUrl?: string })[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Usando query com join para pegar a versão da aplicação de origem
      const { data } = await supabase
        .from("aplicacao_evidencias_vinculos")
        .select(`
          evidencia:evidencia_id (
            id, tipo, storage_path, legenda, mime, versao_origem_id,
            aplicacoes_origem:aplicacoes!aplicacao_evidencias_versao_origem_id_fkey(versao, data_aplicacao)
          )
        `)
        .eq("aplicacao_id", aplicacaoId)
        .order("created_at", { ascending: true });
        
      if (!data?.length) return setItems([]);
      
      const flattened = data.map((d: any) => d.evidencia).filter(Boolean);
      
      const withUrls = await Promise.all(
        flattened.map(async (e: any) => {
          const { data: s } = await supabase.storage
            .from("aplicacao-evidencias")
            .createSignedUrl(e.storage_path, 3600);
          return { ...e, signedUrl: s?.signedUrl };
        })
      );
      setItems(withUrls);
    })();
  }, [aplicacaoId]);

  if (!items.length) {
    return <p className="text-sm text-muted-foreground italic">Sem evidências anexadas.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {items.map((e) => (
          <div key={e.id} className="border rounded-lg overflow-hidden bg-card relative group">
            <button
              type="button"
              onClick={() => e.signedUrl && (e.tipo === "foto" ? setLightbox(e.signedUrl) : window.open(e.signedUrl, "_blank"))}
              className="block w-full aspect-square bg-muted relative"
            >
              {e.tipo === "foto" && e.signedUrl ? (
                <img src={e.signedUrl} alt={e.legenda || ""} className="w-full h-full object-cover" />
              ) : (
                <FileText className="h-8 w-8 text-muted-foreground absolute inset-0 m-auto" />
              )}
              
              {e.versao_origem_id && (
                <div className="absolute top-1 right-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="px-1 py-0 h-5 bg-white/80 dark:bg-black/60 backdrop-blur-sm text-[10px] font-normal border-none">
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
            </button>
            {e.legenda && <p className="text-xs p-2 truncate bg-background/50 border-t">{e.legenda}</p>}
          </div>
        ))}
      </div>
      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2">
          {lightbox && <img src={lightbox} alt="" className="w-full h-auto" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
