import { useState, useMemo } from "react";
import { Printer, Share2, Loader2, FileText, Lock, Eye, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRoteiroEventos } from "./useRoteiroEventos";
import { RoteiroEventoItem } from "./RoteiroEvento";
import { AttachmentPager } from "@/components/shared/AttachmentPager";
import { useSignedUrls } from "@/hooks/useSignedUrls";

interface Props {
  registroId: string;
  readOnly?: boolean;
  hideHeader?: boolean;
  /**
   * Fase 12.7 — split de views:
   * - "tecnico" (default): visão do consultor/admin, mostra rascunhos/em_andamento.
   * - "produtor": visão do produtor no portal, exige status ≥ finalizado, adiciona
   *   selo de leitura e reforça o disclaimer de prescrição agronômica.
   */
  viewer?: "tecnico" | "produtor";
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  enviado_aprovacao: "Em aprovação",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  convertido_os: "Convertido em OS",
  arquivado: "Arquivado",
};

const PRODUTOR_VISIBLE_STATUS = new Set([
  "finalizado",
  "enviado_aprovacao",
  "aprovado",
  "convertido_os",
  "arquivado",
]);

export function RoteiroVisita({ registroId, hideHeader, viewer = "tecnico" }: Props) {
  const { data, isLoading } = useRoteiroEventos(registroId);
  const [photo, setPhoto] = useState<string | null>(null);
  const { toast } = useToast();
  const isProdutor = viewer === "produtor";

  const registro = data?.registro;
  const eventos = data?.eventos || [];

  const allPaths = useMemo(() => {
    const paths: string[] = [];
    eventos.forEach(ev => {
      if (ev.fotoPath) paths.push(ev.fotoPath);
      if (ev.audioPath) paths.push(ev.audioPath);
      if (ev.arquivoPath) paths.push(ev.arquivoPath);
    });
    return paths;
  }, [eventos]);

  const { urls: signedUrls, pagination: attachmentPage } = useSignedUrls(allPaths);

  const eventosComUrls = useMemo(() => {
    return eventos.map(ev => ({
      ...ev,
      fotoUrl: (ev.fotoPath && signedUrls[ev.fotoPath]) || null,
      audioUrl: (ev.audioPath && signedUrls[ev.audioPath]) || null,
      arquivoUrl: (ev.arquivoPath && signedUrls[ev.arquivoPath]) || null,
    }));
  }, [eventos, signedUrls]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Roteiro da visita", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado", description: "Cole onde quiser compartilhar." });
      }
    } catch {
      /* user cancelled */
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando roteiro...
      </div>
    );
  }

  if (!registro) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Registro de visita não encontrado.
      </div>
    );
  }

  const status = (registro as any).status as string;

  // Fase 12.7 — produtor só enxerga registros a partir de "finalizado".
  if (isProdutor && !PRODUTOR_VISIBLE_STATUS.has(status)) {
    return (
      <div className="border rounded-lg p-6 text-center bg-muted/30">
        <Lock className="h-6 w-6 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">Visita ainda em elaboração</p>
        <p className="text-xs text-muted-foreground mt-1">
          Esta visita ficará disponível para consulta assim que o consultor concluir e finalizar o registro.
        </p>
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Ainda não há eventos para compor o roteiro desta visita.
      </div>
    );
  }

  return (
    <div className="roteiro-visita">
      <AttachmentPager pagination={attachmentPage} />
      {!hideHeader && (
        <header className="sticky top-0 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-3 mb-4 bg-background/95 backdrop-blur border-b print:static print:border-none print:bg-transparent">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold truncate">Roteiro da visita</h2>
                <Badge variant="secondary" className="text-[10px]">
                  {STATUS_LABEL[status] || status}
                </Badge>
                {isProdutor && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Eye className="h-3 w-3" aria-hidden="true" /> Visualização do produtor
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {[
                  (registro as any).clientes?.nome,
                  (registro as any).fazendas?.nome,
                  (registro as any).talhoes?.nome,
                  (registro as any).culturas?.nome,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
              <Button size="sm" variant="outline" onClick={handleShare}>
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1.5">Compartilhar</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1.5">Imprimir</span>
              </Button>
            </div>
          </div>
        </header>
      )}

      {isProdutor && (
        <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-start gap-2 print:break-inside-avoid">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" aria-hidden="true" />
          <p className="text-[11px] leading-snug text-foreground/80">
            Documento somente leitura. As recomendações aqui registradas constituem prescrição
            técnica-agronômica emitida por profissional habilitado. Execute-as respeitando as
            condições locais, a legislação vigente e o receituário aplicável.
          </p>
        </div>
      )}

      <div className="px-1 sm:px-2">
        {eventosComUrls.map((ev) => (
          <RoteiroEventoItem key={ev.id} evento={ev} onPhotoClick={setPhoto} />
        ))}
      </div>

      <p className="text-[10px] italic text-muted-foreground text-center mt-6 print:mt-4">
        Documento técnico-agronômico. As recomendações e condutas registradas devem ser executadas
        sob responsabilidade de profissional habilitado, considerando as condições locais.
      </p>

      <Dialog open={!!photo} onOpenChange={(o) => !o && setPhoto(null)}>
        <DialogContent className="max-w-4xl p-2">
          {photo && (
            <img
              src={photo}
              alt="Pré-visualização"
              className="w-full h-auto max-h-[85vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
