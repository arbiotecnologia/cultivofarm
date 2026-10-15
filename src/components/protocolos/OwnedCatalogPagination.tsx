import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function OwnedCatalogPagination({ entity, archived, onArchived, offset, onOffset, hasMore, busy, error }: {
  entity: string; archived: boolean; onArchived: (value: boolean) => void; offset: number;
  onOffset: (value: number) => void; hasMore: boolean; busy: boolean; error?: string | null;
}) {
  return <div className="flex flex-wrap items-center gap-3">
    <Switch id={`owned-archived-${entity}`} checked={archived} onCheckedChange={(value) => { onArchived(value); onOffset(0); }} />
    <Label htmlFor={`owned-archived-${entity}`}>Mostrar arquivados</Label>
    <Button size="icon" variant="outline" title="Página anterior de itens próprios" disabled={busy || offset === 0} onClick={() => onOffset(Math.max(0, offset - 50))}><ChevronLeft className="h-4 w-4" /></Button>
    <span className="text-sm text-muted-foreground">Próprios · página {offset / 50 + 1}</span>
    <Button size="icon" variant="outline" title="Próxima página de itens próprios" disabled={busy || !hasMore} onClick={() => onOffset(offset + 50)}><ChevronRight className="h-4 w-4" /></Button>
    {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
  </div>;
}