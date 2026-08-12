import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown, Eye } from "lucide-react";
import { DocumentoEntregaPayload, DocumentoEntregaBranding, prepararDocumentoEntregaPDF } from "@/lib/comprovanteEntregaPdf";

interface PreviewDocumentoEntregaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: DocumentoEntregaPayload | null;
  branding: DocumentoEntregaBranding;
  onDownload: () => void;
}

export function PreviewDocumentoEntrega({
  open,
  onOpenChange,
  payload,
  branding,
  onDownload,
}: PreviewDocumentoEntregaProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let active = true;
    if (open && payload) {
      renderPreview(active);
    } else {
      cleanup();
    }
    return () => { active = false; };
  }, [open, payload]);

  const cleanup = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  };

  const renderPreview = async (active: boolean) => {
    if (!payload) return;
    setGenerating(true);
    cleanup();
    
    try {
      const doc = await prepararDocumentoEntregaPDF(payload, branding);
      if (!active) return;
      
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      console.error("Erro ao gerar preview:", err);
    } finally {
      if (active) setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Pré-visualização: {payload?.titulo || "Documento"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 bg-muted/30 relative flex items-center justify-center overflow-hidden">
          {generating ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Gerando visualização...</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#toolbar=0&navpanes=0`}
              className="w-full h-full border-0"
              title="Preview PDF"
            />
          ) : (
            <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center space-y-4">
               <FileDown className="h-12 w-12 text-muted-foreground/50" />
               <div>
                 <h4 className="font-medium">Falha ao carregar visualização</h4>
                 <p className="text-sm text-muted-foreground">Você ainda pode baixar o documento diretamente.</p>
               </div>
               <Button onClick={onDownload}>
                 <FileDown className="h-4 w-4 mr-2" /> Baixar PDF
               </Button>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-background">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={onDownload} disabled={!payload}>
            <FileDown className="h-4 w-4 mr-2" /> Baixar Documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
