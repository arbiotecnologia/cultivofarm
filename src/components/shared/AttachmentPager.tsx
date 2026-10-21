import { ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthenticatedBlobPage } from "@/hooks/useAuthenticatedBlobUrls";

/**
 * Janela de anexos carregados. Só aparece quando há mais anexos que o limite
 * de memória por janela; trocar de página revoga a janela anterior.
 */
export function AttachmentPager({ pagination, className }: { pagination?: AuthenticatedBlobPage; className?: string }) {
  if (!pagination || pagination.pageCount <= 1) return null;
  const { page, pageCount, pageSize, total, setPage } = pagination;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground ${className ?? ""}`} role="navigation" aria-label="Páginas de anexos">
      <span className="flex items-center gap-1.5">
        <Paperclip className="h-3.5 w-3.5" />
        Exibindo anexos {first}–{last} de {total}
      </span>
      <span className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" disabled={page <= 0} onClick={() => setPage(page - 1)} aria-label="Anexos anteriores">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span aria-live="polite">{page + 1}/{pageCount}</span>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)} aria-label="Próximos anexos">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </span>
    </div>
  );
}
