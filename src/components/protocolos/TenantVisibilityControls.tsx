import { useEffect, useMemo, useRef, useState } from "react";
import type { TenantCatalogScope } from "@/lib/catalogo/tenantCatalogVisibility";
import { EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useSetTenantVisibility, useTenantCatalogScope, useTenantVisibilityMap } from "@/hooks/useTenantCatalogVisibility";
import {
  TENANT_VISIBILITY_COMMON_NOTE, TENANT_VISIBILITY_REASON_MAX, TENANT_VISIBILITY_REASON_MIN, tenantVisibilityActionNote, applyManagementVisibility,
  type TenantCatalogEntity, type VisibilityState,
} from "@/lib/catalogo/tenantCatalogVisibility";

/** Texto honesto, por entidade, de onde a ocultação vale nesta fase. */
export function tenantVisibilityScopeNote(entity: TenantCatalogEntity, nextHidden = true): string {
  return `${tenantVisibilityActionNote(entity, nextHidden)} ${TENANT_VISIBILITY_COMMON_NOTE}`;
}

/** Papel de gestão (dica de UI). A autorização real é feita no servidor. */
export function useCanManageTenantVisibility(): boolean {
  const { roles } = useAuth();
  return roles.includes("administrador") || roles.includes("gestor");
}

export function ShowHiddenSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Switch id="tenant-show-hidden" checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <Label htmlFor="tenant-show-hidden" className="text-sm">Mostrar ocultos nesta empresa</Label>
    </div>
  );
}

export function TenantHiddenBadge({ state }: { state?: VisibilityState }) {
  if (!state?.hidden) return null;
  return <Badge variant="secondary" data-testid="tenant-hidden-badge">Oculto nesta empresa</Badge>;
}

export function TenantVisibilityToggle({ entity, item, state, disabledReason }: {
  entity: TenantCatalogEntity;
  item: { id: string; nome: string; ativo: boolean };
  state: VisibilityState | undefined;
  /** Quando definido, o botão fica desativado e o motivo aparece como título. */
  disabledReason?: string | null;
}) {
  const scope = useTenantCatalogScope();
  const mutation = useSetTenantVisibility(entity);
  const [reason, setReason] = useState("");
  const hidden = !!state?.hidden;
  const version = state?.version ?? 0;
  const contextKey = scope ? `${scope.organizationId}|${scope.userId}|${entity}|${item.id}|${version}|${hidden}|${item.ativo}` : null;

  /** Intenção congelada na ABERTURA do diálogo; nunca relida do contexto no submit. */
  const [snap, setSnap] = useState<{ contextKey: string; scope: TenantCatalogScope; itemId: string; nextHidden: boolean; version: number } | null>(null);
  const open = snap !== null;
  /** Geração: muda ao abrir/fechar/mudar contexto/desmontar. Respostas de gerações antigas são ignoradas. */
  const gen = useRef(0);
  const lock = useRef(false);
  /** Tentativa: payload congelado + chave. Mesmo payload reusa a chave (retry); payload novo gera chave nova. */
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Exibir item inativo não é permitido (a preferência não reativa itens).
  const blocked = disabledReason ?? (!scope ? "Sessão da empresa não carregada." : (!item.ativo && hidden ? "Item global inativo." : null));

  const close = () => { gen.current += 1; lock.current = false; attempt.current = null; setSubmitting(false); setSnap(null); setReason(""); };
  const openDialog = () => {
    if (!scope || !contextKey || blocked) return;
    gen.current += 1; attempt.current = null; setReason("");
    setSnap({ contextKey, scope, itemId: item.id, nextHidden: !hidden, version });
  };

  // Contexto (identidade/empresa/item/versão/estado) mudou com o diálogo aberto → invalida a intenção.
  useEffect(() => {
    if (snap && snap.contextKey !== contextKey) {
      close();
      toast.info("Os dados mudaram enquanto o diálogo estava aberto. Revise e tente de novo.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey, snap]);
  useEffect(() => () => { gen.current += 1; }, []);

  const reasonOk = reason.trim().length >= TENANT_VISIBILITY_REASON_MIN && reason.trim().length <= TENANT_VISIBILITY_REASON_MAX;
  const busy = submitting || mutation.isPending;
  const nextHidden = snap?.nextHidden ?? !hidden;

  const submit = async () => {
    if (lock.current || !snap || !reasonOk) return;
    const payload = JSON.stringify([snap.contextKey, snap.nextHidden, snap.version, reason.trim()]);
    if (!attempt.current || attempt.current.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
    const myGen = gen.current;
    const frozen = { snap, key: attempt.current.key, reason: reason.trim() };
    lock.current = true;
    setSubmitting(true);
    try {
      const r = await mutation.mutateAsync({
        entityId: frozen.snap.itemId, hidden: frozen.snap.nextHidden, expectedVersion: frozen.snap.version,
        reason: frozen.reason, idempotencyKey: frozen.key, scopeAtStart: frozen.snap.scope,
      });
      if (myGen !== gen.current) return; // conclusão tardia: sem toast/setState
      toast.success(r.hidden ? "Item oculto nesta empresa." : "Item exibido novamente nesta empresa.");
      close();
    } catch (e) {
      if (myGen !== gen.current) return;
      toast.error((e as Error).message);
    } finally {
      if (myGen === gen.current) { lock.current = false; setSubmitting(false); }
    }
  };

  return (
    <>
      <Button
        size="sm" variant="outline" className="h-7 px-2"
        disabled={!!blocked || busy}
        title={blocked ?? (hidden ? "Exibir nesta empresa" : "Ocultar nesta empresa")}
        onClick={openDialog}
      >
        {hidden ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
        {hidden ? "Exibir" : "Ocultar"}
      </Button>
      <AlertDialog open={open} onOpenChange={(v) => { if (!v && !busy) close(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{nextHidden ? "Ocultar" : "Exibir"} “{item.nome}” nesta empresa?</AlertDialogTitle>
            <AlertDialogDescription>{tenantVisibilityScopeNote(entity, nextHidden)}</AlertDialogDescription>
          </AlertDialogHeader>
          <fieldset disabled={busy} className="space-y-1.5">
            <Label htmlFor="tenant-visibility-reason">Motivo</Label>
            <Textarea
              id="tenant-visibility-reason" value={reason} maxLength={TENANT_VISIBILITY_REASON_MAX}
              onChange={(e) => setReason(e.target.value)} placeholder="Ex.: produto não comercializado pela empresa"
            />
            <p className="text-xs text-muted-foreground">Mínimo de {TENANT_VISIBILITY_REASON_MIN} caracteres.</p>
          </fieldset>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !reasonOk} onClick={(e) => { e.preventDefault(); void submit(); }}>
              {busy ? "Salvando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Sobreposição de visibilidade da empresa sobre uma lista de gestão já carregada.
 * Ocultos saem da lista por padrão; "Mostrar ocultos" permite reexibir. Em erro, a lista NÃO é filtrada
 * e a barra mostra o erro de forma explícita (sem fingir que a preferência foi aplicada).
 */
export function useManagedVisibility<T extends { id: string }>(entity: TenantCatalogEntity, items: readonly T[]) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const q = useTenantVisibilityMap(entity, ids);
  const [showHidden, setShowHidden] = useState(false);
  const map = q.isSuccess ? q.data : undefined;
  const displayed = useMemo(() => applyManagementVisibility(items, map, showHidden), [items, map, showHidden]);
  const hiddenCount = useMemo(() => (map ? [...map.values()].filter((v) => v.hidden).length : 0), [map]);
  return {
    displayed, map, showHidden, setShowHidden, hiddenCount,
    loading: q.isLoading && ids.length > 0,
    error: q.isError ? (q.error as Error).message : null,
  };
}

export function TenantVisibilityBar({ v }: { v: ReturnType<typeof useManagedVisibility<{ id: string }>> }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="tenant-visibility-bar">
      <ShowHiddenSwitch checked={v.showHidden} onChange={v.setShowHidden} disabled={!!v.error || v.loading} />
      {v.loading && <span role="status" className="text-muted-foreground">Carregando preferências da empresa…</span>}
      {v.error && <span role="alert" className="text-destructive">Preferências da empresa indisponíveis: {v.error} A lista abaixo mostra todos os itens.</span>}
      {!v.error && !v.loading && v.hiddenCount > 0 && !v.showHidden && (
        <span className="text-muted-foreground">{v.hiddenCount} oculto(s) nesta empresa.</span>
      )}
    </div>
  );
}
