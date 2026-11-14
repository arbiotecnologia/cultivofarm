import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSearch, Loader2, Download, ExternalLink } from "lucide-react";
import { generateVisitaPdf, type VisitaPdfData } from "@/lib/pdfVisita";
import { toast } from "sonner";

interface PdfPreviewDialogProps {
  data?: VisitaPdfData | null;
  getData?: () => Promise<VisitaPdfData | null>;
  title?: string;
  trigger?: React.ReactNode;
}

export function PdfPreviewDialog({ data, getData, title = "Pré-visualização do PDF", trigger }: PdfPreviewDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = async () => {
    setLoading(true);
    setIsOpen(true);

    try {
      const finalData = getData ? await getData() : data;
      
      if (!finalData) {
        toast.error("Dados insuficientes para gerar o PDF");
        setIsOpen(false);
        return;
      }

      const doc = await generateVisitaPdf(finalData);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      console.error("Erro ao gerar preview do PDF:", error);
      toast.error("Erro ao gerar pré-visualização");
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open && pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
    }}>
      <DialogTrigger asChild onClick={() => { void handlePreview(); }}>
        {trigger || (
          <Button variant="outline" size="sm">
            <FileSearch className="h-4 w-4 mr-2" />
            Visualizar PDF
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <div className="flex min-w-0 flex-col gap-2 pr-8 sm:flex-row sm:items-start sm:justify-between">
            <DialogTitle className="min-w-0 break-words">{title}</DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              {pdfUrl && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const link = document.createElement("a");
                      link.href = pdfUrl;
                      link.download = "preview.pdf";
                      link.click();
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Baixar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(pdfUrl, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Abrir em nova aba
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 bg-muted/30 relative min-h-0">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground font-medium">Gerando relatório...</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
              className="w-full h-full border-none"
              title="PDF Preview"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              Não foi possível carregar o PDF
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
