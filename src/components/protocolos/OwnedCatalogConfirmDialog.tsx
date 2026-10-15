import { useEffect, useRef, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useOwnedCatalogCapability, useOwnedCatalogMutation } from "@/hooks/useOwnedCatalogMutations";
import { ownedCatalogError } from "@/lib/catalogo/tenantCatalogOwnership";
import type { TenantCatalogEntity } from "@/lib/catalogo/tenantCatalogVisibility";

export function OwnedCatalogConfirmDialog({ item, entity, operation, onOpenChange, onApplied }: {
  item: { id: string; nome: string; updated_at?: string | null } | null;
  entity: TenantCatalogEntity;
  operation: "archive" | "restore";
  onOpenChange: (open: boolean) => void;
  onApplied: () => Promise<void> | void;
}) {
  const capability = useOwnedCatalogCapability();
  const mutation = useOwnedCatalogMutation(entity, onApplied);
  const [reason, setReason] = useState("");
  const scope = useRef("");
  useEffect(() => { if (item) { setReason(""); scope.current = capability.scope ? `${capability.scope.organizationId}|${capability.scope.userId}` : ""; } }, [item, capability.scope]);
  const submit = async () => {
    if (!item) return;
    try {
      await mutation.mutateAsync({ entity, operation, entityId: item.id, expectedUpdatedAt: item.updated_at ?? null, payload: {}, reason, idempotencyKey: crypto.randomUUID(), scopeKey: scope.current });
      toast.success(operation === "archive" ? "Item próprio arquivado." : "Item próprio restaurado.");
      onOpenChange(false);
    } catch (error) { toast.error(ownedCatalogError(error, entity).message); }
  };
  return <AlertDialog open={!!item} onOpenChange={(open) => !mutation.isPending && onOpenChange(open)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{operation === "archive" ? "Arquivar" : "Restaurar"} “{item?.nome}”?</AlertDialogTitle><AlertDialogDescription>{operation === "archive" ? "O item deixa de aceitar novas referências, mas históricos permanecem preservados." : "O item volta a ficar disponível para a empresa."}</AlertDialogDescription></AlertDialogHeader><div className="space-y-2"><Label>Motivo</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></div><AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={mutation.isPending || reason.trim().length < 10} onClick={(e) => { e.preventDefault(); void submit(); }}>{mutation.isPending ? "Salvando..." : "Confirmar"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}