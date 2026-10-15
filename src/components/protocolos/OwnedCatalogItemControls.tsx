import { Archive, Pencil, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CATALOG_ORIGIN_LABEL,
  TENANT_OWNED_CATALOG_ENABLED,
  canManageOwnedItem,
  catalogOrigin,
} from "@/lib/catalogo/tenantCatalogOwnership";

interface OwnedRow {
  owner_organization_id?: string | null;
  archived_at?: string | null;
}

export function CatalogOriginBadge({ item }: { item: OwnedRow }) {
  const origin = catalogOrigin(item);
  return <Badge variant={origin === "global" ? "outline" : "secondary"}>{CATALOG_ORIGIN_LABEL[origin]}</Badge>;
}

/** Controles preparados na tela existente; o gate OFF impede montagem e qualquer chamada. */
export function OwnedCatalogItemControls({ item, actorOrganizationId, canManage, onEdit, onArchive, onRestore }: {
  item: OwnedRow;
  actorOrganizationId: string | null | undefined;
  canManage: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  if (!canManageOwnedItem(item, actorOrganizationId, canManage, TENANT_OWNED_CATALOG_ENABLED)) return null;
  const archived = !!item.archived_at;
  return (
    <div className="flex items-center gap-1">
      {!archived && (
        <Button type="button" size="icon" variant="ghost" title="Editar item próprio" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      <Button type="button" size="icon" variant="ghost" title={archived ? "Restaurar item próprio" : "Arquivar item próprio"}
        onClick={archived ? onRestore : onArchive}>
        {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </Button>
    </div>
  );
}