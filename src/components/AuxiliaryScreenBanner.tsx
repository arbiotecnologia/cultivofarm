import { Info, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface AuxiliaryScreenBannerProps {
  title?: string;
  description?: string;
  cockpitPath?: string;
  ctaLabel?: string;
}

/**
 * Banner exibido nas telas técnicas auxiliares da esteira de produção
 * (PCP, Lotes, CQ, Envase) indicando que o fluxo operacional oficial
 * é conduzido pelo Cockpit Laboratório.
 */
export function AuxiliaryScreenBanner({
  title = "Tela auxiliar",
  description = "Esta tela é auxiliar para consulta, auditoria ou edição técnica controlada. O fluxo oficial da esteira é conduzido pelo Cockpit Laboratório.",
  cockpitPath = "/cockpit-laboratorio",
  ctaLabel = "Abrir Cockpit",
}: AuxiliaryScreenBannerProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="default"
        onClick={() => navigate(cockpitPath)}
        className="shrink-0 self-start sm:self-auto"
      >
        {ctaLabel}
        <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

export default AuxiliaryScreenBanner;
