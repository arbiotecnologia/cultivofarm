import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";
import { metadataRetryKey } from "@/lib/catalogo/platformCatalogMetadata";
import { CLASS_LABEL, FAMILY_CLASSES, FAMILY_LABEL, PRODUCT_FAMILIES, isClassAllowed, setProductFamily,
  type FamilyTarget, type ProductFamily } from "@/lib/catalogo/platformCatalogFamily";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const NO_CLASS = "";

/**
 * Classificação explícita da família de um produto GLOBAL. Nunca sugere família a partir de
 * nome/tipo/composição. Exige motivo e confirmação; recibo validado; CAS no servidor.
 * Fence: troca de escopo de identidade aborta a requisição e descarta o resultado.
 */
export function PlatformCatalogFamilyDialog({ product, scope, onClose, onSaved }:
  { product: FamilyTarget & { nome: string }; scope: string; onClose(): void; onSaved(): void }) {
  const access = platformCatalogAccess(useAuth());
  const live = access.ready && access.scope === scope;
  const liveRef = useRef(live); liveRef.current = live;
  const [family, setFamily] = useState<ProductFamily | "">(product.familia_catalogo ?? "");
  const [classe, setClasse] = useState<string>(product.classe_catalogo ?? NO_CLASS);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const requests = useRef(new Set<AbortController>());
  // Época do contexto (item/versão/escopo/vivo): qualquer mudança aborta pedidos, limpa campos e descarta respostas tardias.
  const contextKey = JSON.stringify([product.id, product.updated_at, scope, live]);
  const epoch = useRef({ key: contextKey, n: 0 });
  if (epoch.current.key !== contextKey) epoch.current = { key: contextKey, n: epoch.current.n + 1 };
  const epochN = epoch.current.n;
  useEffect(() => {
    for (const r of requests.current) r.abort();
    requests.current.clear();
    setFamily(product.familia_catalogo ?? ""); setClasse(product.classe_catalogo ?? NO_CLASS);
    setReason(""); setConfirmed(false); setError(""); setBusy(false); lock.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset somente por troca de época
  }, [epochN]);
  useEffect(() => {
    const set = requests.current;
    return () => { for (const r of set) r.abort(); set.clear(); };
  }, []);
  if (!live) return null;
  const classValue = classe === NO_CLASS ? null : classe;
  const changed = family !== "" && (family !== product.familia_catalogo || classValue !== product.classe_catalogo);
  const reasonOk = reason.trim().length >= 10 && reason.trim().length <= 500;
  const valid = family !== "" && isClassAllowed(family, classValue);
  const submit = async () => {
    if (family === "" || !valid || !changed || !reasonOk || !confirmed || lock.current || !liveRef.current) return;
    const myEpoch = epoch.current.n;
    const current = () => epoch.current.n === myEpoch && liveRef.current;
    lock.current = true; setBusy(true); setError("");
    const c = new AbortController(); requests.current.add(c);
    const key = metadataRetryKey(scope, JSON.stringify(["family", product.id, product.updated_at, family, classValue, reason.trim()]));
    try {
      await setProductFamily(product, family, classValue, reason, key, c.signal);
      if (!c.signal.aborted && current()) onSaved();
    } catch (failure) {
      if (!c.signal.aborted && current()) setError(failure instanceof Error ? failure.message : "Não foi possível confirmar a classificação.");
    } finally {
      requests.current.delete(c);
      if (epoch.current.n === myEpoch) { lock.current = false; setBusy(false); }
    }
  };
  const reset = () => setConfirmed(false);
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto" aria-busy={busy}>
      <DialogHeader>
        <DialogTitle>Classificar família do produto global</DialogTitle>
        <DialogDescription>Muda apenas a família e o rótulo do produto no catálogo global. Situação, B2B, preços, dose, tipo,
          composição e apresentações não mudam. Escolha com base no registro real do produto — nada é sugerido automaticamente.</DialogDescription>
      </DialogHeader>
      {error && <p role="alert">{error}</p>}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="font-medium break-words">{product.nome}</p>
        <p className="text-sm">Atual: <strong>{product.familia_catalogo ? FAMILY_LABEL[product.familia_catalogo] : "Pendente de classificação"}</strong>
          {product.classe_catalogo ? ` · ${CLASS_LABEL[product.classe_catalogo] ?? product.classe_catalogo}` : ""}</p>
        <Label htmlFor="family-select">Família</Label>
        <select id="family-select" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          disabled={busy} value={family} onChange={(e) => { setFamily(e.target.value as ProductFamily | ""); setClasse(NO_CLASS); reset(); }}>
          <option value="">Selecione…</option>
          {PRODUCT_FAMILIES.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
        </select>
        {family !== "" && <>
          <Label htmlFor="class-select">Rótulo (opcional)</Label>
          <select id="class-select" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            disabled={busy || FAMILY_CLASSES[family].length === 0} value={classe} onChange={(e) => { setClasse(e.target.value); reset(); }}>
            <option value={NO_CLASS}>Sem rótulo</option>
            {FAMILY_CLASSES[family].map((c) => <option key={c} value={c}>{CLASS_LABEL[c]}</option>)}
          </select>
          {FAMILY_CLASSES[family].length === 0 && <p className="text-sm text-muted-foreground">Rótulos de fertilizantes/adubos ainda não foram definidos.</p>}
        </>}
        <Label htmlFor="family-reason">Motivo (10 a 500 caracteres)</Label>
        <Textarea id="family-reason" required rows={2} maxLength={500} disabled={busy} value={reason}
          onChange={(e) => { setReason(e.target.value); reset(); }} />
        <div className="flex items-start gap-2">
          <Checkbox id="family-confirm" checked={confirmed} disabled={busy || !changed || !valid} onCheckedChange={(v) => setConfirmed(v === true)} />
          <Label htmlFor="family-confirm" className="text-sm font-normal break-words">Confirmo a classificação de “{product.nome}”.</Label>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="min-h-10" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="min-h-10 whitespace-normal" disabled={busy || !changed || !valid || !reasonOk || !confirmed}>
            {busy ? "Confirmando…" : "Salvar classificação"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
