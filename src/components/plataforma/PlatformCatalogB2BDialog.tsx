import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";
import { metadataRetryKey } from "@/lib/catalogo/platformCatalogMetadata";
import { canRequestB2B, readB2BState, setB2BEnabled, type B2BItemTipo, type B2BState } from "@/lib/catalogo/platformCatalogB2B";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Liberar/retirar disponibilidade B2B de um item GLOBAL. Lê o estado atual no servidor
 * (nunca confia na linha da lista), exige confirmação explícita e motivo, valida o recibo.
 * Fence: perda do escopo de identidade aborta a requisição e descarta resultado.
 */
export function PlatformCatalogB2BDialog({ tipo, itemId, scope, onClose, onSaved }:
  { tipo: B2BItemTipo; itemId: string; scope: string; onClose(): void; onSaved(): void }) {
  const access = platformCatalogAccess(useAuth());
  const live = access.ready && access.scope === scope;
  const liveRef = useRef(live); liveRef.current = live;
  const [state, setState] = useState<B2BState>();
  const [loadError, setLoadError] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const requests = useRef(new Set<AbortController>());
  useEffect(() => {
    const set = requests.current;
    return () => { for (const r of set) r.abort(); set.clear(); };
  }, []);
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    setState(undefined); setLoadError(false);
    readB2BState(tipo, itemId, controller.signal)
      .then((s) => { if (!controller.signal.aborted) setState(s); })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [tipo, itemId, live]);
  if (!live) return null;
  const target = state ? !state.b2b_enabled : undefined;
  const reasonOk = reason.trim().length >= 10 && reason.trim().length <= 500;
  const allowed = !!state && target !== undefined && canRequestB2B(state, target);
  const submit = async () => {
    if (!state || target === undefined || !allowed || !reasonOk || !confirmed || lock.current || !liveRef.current) return;
    lock.current = true; setBusy(true); setError("");
    const controller = new AbortController(); requests.current.add(controller);
    const key = metadataRetryKey(scope, JSON.stringify(["b2b", state.item_tipo, state.id, state.updated_at, target, reason.trim()]));
    try {
      await setB2BEnabled(state, target, reason, key, controller.signal);
      if (!controller.signal.aborted && liveRef.current) onSaved();
    } catch (failure) {
      if (!controller.signal.aborted && liveRef.current)
        setError(failure instanceof Error ? failure.message : "Não foi possível confirmar a alteração.");
    } finally {
      requests.current.delete(controller); lock.current = false;
      // Sempre libera o botão, mesmo se o escopo mudou durante a chamada (evita "Confirmando…" preso).
      setBusy(false);
    }
  };
  const label = tipo === "produto" ? "produto" : "microrganismo";
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto" aria-busy={busy}>
      <DialogHeader>
        <DialogTitle>Disponibilidade B2B do {label} global</DialogTitle>
        <DialogDescription>Muda apenas se o item pode aparecer no catálogo comercial dos parceiros. Situação, preços, dose,
          composição, apresentações, fichas e dados fiscais não mudam. Ficha técnica não é aprovada por esta ação.</DialogDescription>
      </DialogHeader>
      {!state && !loadError && <p role="status">Carregando…</p>}
      {loadError && <p role="alert">Não foi possível carregar a disponibilidade B2B do item.</p>}
      {error && <p role="alert">{error}</p>}
      {state && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="font-medium break-words">{state.nome}{state.codigo ? ` (${state.codigo})` : ""}</p>
        <p className="text-sm">Situação: <strong>{state.ativo ? "Ativo" : "Inativo"}</strong> · B2B atual: <strong>{state.b2b_enabled ? "Liberado" : "Não liberado"}</strong></p>
        {target && !state.ativo && <p role="alert" className="text-sm">Ative o item antes de liberá-lo para o B2B.</p>}
        {target && state.ativo && <p className="text-sm text-muted-foreground">Ao liberar, o item pode aparecer no catálogo comercial com preço
          resolvido pelas condições comerciais (ou “sob consulta”). No portal técnico ele só aparece depois de ficha técnica aprovada.</p>}
        {target === false && <p className="text-sm text-muted-foreground">Ao retirar, o item deixa de aparecer nos catálogos B2B. Pedidos e históricos são preservados.</p>}
        <Label htmlFor="b2b-reason">Motivo (10 a 500 caracteres)</Label>
        <Textarea id="b2b-reason" required rows={2} maxLength={500} disabled={busy || !allowed} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex items-start gap-2">
          <Checkbox id="b2b-confirm" checked={confirmed} disabled={busy || !allowed} onCheckedChange={(v) => setConfirmed(v === true)} />
          <Label htmlFor="b2b-confirm" className="text-sm font-normal break-words">
            Confirmo que desejo {target ? "liberar" : "retirar"} “{state.nome}” {target ? "para" : "do"} B2B.</Label>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="min-h-10" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="min-h-10 whitespace-normal" disabled={busy || !allowed || !reasonOk || !confirmed}>
            {busy ? "Confirmando…" : target ? "Liberar para B2B" : "Retirar do B2B"}</Button>
        </div>
      </form>}
    </DialogContent>
  </Dialog>;
}
