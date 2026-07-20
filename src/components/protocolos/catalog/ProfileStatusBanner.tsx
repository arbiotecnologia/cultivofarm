import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, FileEdit, Eye } from "lucide-react";

interface Props {
  status: string | null | undefined;
  b2bEnabled?: boolean;
  hasExplicacaoB2B?: boolean;
  /** Quando false, oculta marcadores internos de aprovação (Conteúdo aprovado e publicado, Aprovado para produtor/B2B). Default: true (admin/gestor) */
  showInternalApprovalMarkers?: boolean;
}

export function ProfileStatusBanner({ status, b2bEnabled, hasExplicacaoB2B, showInternalApprovalMarkers = true }: Props) {
  const s = status ?? "sem_ficha";
  if (s === "rascunho" || s === "sem_ficha") {
    return (
      <Alert className="border-amber-300 bg-amber-50">
        <FileEdit className="h-4 w-4 text-amber-700" />
        <AlertDescription className="text-xs text-amber-900">
          Ficha em rascunho — não aparece para produtor nem parceiro B2B até ser aprovada.
        </AlertDescription>
      </Alert>
    );
  }
  if (s === "em_revisao") {
    return (
      <Alert className="border-blue-300 bg-blue-50">
        <Eye className="h-4 w-4 text-blue-700" />
        <AlertDescription className="text-xs text-blue-900">
          Ficha em revisão — ainda invisível para produtor e parceiro B2B.
        </AlertDescription>
      </Alert>
    );
  }
  if (s === "aprovado") {
    if (!showInternalApprovalMarkers) return null;
    return (
      <Alert className="border-emerald-300 bg-emerald-50">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        <AlertDescription className="text-xs text-emerald-900 flex flex-wrap gap-1.5 items-center">
          Conteúdo aprovado e publicado.
          <Badge className="bg-emerald-600 text-[10px]">Aprovado para produtor</Badge>
          {b2bEnabled && hasExplicacaoB2B && <Badge className="bg-blue-600 text-[10px]">Aprovado para B2B</Badge>}
          {b2bEnabled && !hasExplicacaoB2B && (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800">
              Sem texto B2B
            </Badge>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert className="border-slate-300 bg-slate-50">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-xs">Ficha arquivada.</AlertDescription>
    </Alert>
  );
}
