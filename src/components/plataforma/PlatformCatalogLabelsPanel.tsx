import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";
import { FAMILY_LABEL, PRODUCT_FAMILIES, type ProductFamily } from "@/lib/catalogo/platformCatalogFamily";
import { LABEL_CONFLICT_MESSAGE, LABEL_REASON_MAX, LABEL_REASON_MIN, createCatalogLabel, labelRetryKey, setCatalogLabelActive,
  updateCatalogLabel, usePlatformCatalogLabels, type CatalogLabel } from "@/lib/catalogo/platformCatalogLabels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Cadastro canônico de rótulos por família (Gestão da plataforma → Catálogo).
 * Escrita restrita a Platform Superadmin validado no servidor; motivo obrigatório, CAS e
 * idempotência. Chave do rótulo é imutável; inativar preserva atribuições existentes.
 * Fence: troca de escopo/época aborta pedidos e descarta respostas tardias.
 */
export function PlatformCatalogLabelsPanel({ scope }: { scope: string }) {
  const access = platformCatalogAccess(useAuth());
  const live = access.ready && access.scope === scope;
  const [family, setFamily] = useState<ProductFamily>("quimico");
  if (!live) return null;
  return <section aria-labelledby="catalog-labels-title" className="space-y-4">
    <h2 id="catalog-labels-title" className="text-lg font-semibold">Rótulos por família</h2>
    <p className="text-sm text-muted-foreground">Fonte canônica dos rótulos oferecidos ao classificar produtos. Inativar não
      remove rótulos já atribuídos; novas atribuições exigem rótulo ativo. Nada aqui altera preço, composição ou fabricação.</p>
    <div role="tablist" aria-label="Família dos rótulos" className="flex flex-wrap gap-1">
      {PRODUCT_FAMILIES.map((f) => <Button key={f} type="button" role="tab" aria-selected={family === f}
        variant={family === f ? "default" : "outline"} className="min-h-10" onClick={() => setFamily(f)}>
        {FAMILY_LABEL[f]}</Button>)}
    </div>
    <FamilyLabels key={`${scope}:${family}`} family={family} scope={scope} />
  </section>;
}

function FamilyLabels({ family, scope }: { family: ProductFamily; scope: string }) {
  const queryClient = useQueryClient();
  const labelsQuery = usePlatformCatalogLabels(family, scope, true);
  const labels = labelsQuery.data ?? [];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const epoch = useRef(0);
  useEffect(() => {
    const set = requests.current;
    return () => { epoch.current += 1; for (const r of set) r.abort(); set.clear(); };
  }, []);
  // Após mutação confirmada: invalida a lista administrativa E o leitor de exibição do mesmo escopo/família.
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["platform-catalog-labels", scope, family] }),
    queryClient.invalidateQueries({ queryKey: ["catalog-labels-read", scope, family] }),
  ]);
  const [conflict, setConflict] = useState(false);
  const reloadData = async () => {
    if (lock.current) return;
    const myEpoch = epoch.current;
    await refresh();
    if (epoch.current === myEpoch) { setConflict(false); setError(""); }
  };

  const run = async (fn: (signal: AbortSignal) => Promise<unknown>) => {
    if (lock.current) return;
    const myEpoch = epoch.current;
    lock.current = true; setBusy(true); setError(""); setConflict(false);
    const c = new AbortController(); requests.current.add(c);
    try {
      await fn(c.signal);
      if (!c.signal.aborted && epoch.current === myEpoch) refresh();
    } catch (failure) {
      if (!c.signal.aborted && epoch.current === myEpoch) {
        const message = failure instanceof Error ? failure.message : "Não foi possível confirmar a operação.";
        setError(message); setConflict(message === LABEL_CONFLICT_MESSAGE);
      }
    } finally {
      requests.current.delete(c);
      if (epoch.current === myEpoch) { lock.current = false; setBusy(false); }
    }
  };

  return <div className="space-y-4">
    {labelsQuery.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os rótulos desta família.</p>}
    {error && <p role="alert">{error}</p>}
    {conflict && <Button type="button" variant="outline" className="min-h-10" disabled={busy}
      onClick={() => void reloadData()}>Atualizar dados</Button>}
    {labelsQuery.isSuccess && labels.length === 0 &&
      <p className="text-sm text-muted-foreground">Nenhum rótulo cadastrado nesta família.</p>}
    {labels.length > 0 && <ul className="space-y-2" aria-label={`Rótulos de ${FAMILY_LABEL[family]}`}>
      {labels.map((l) => <LabelRow key={l.id} label={l} scope={scope} busy={busy} run={run} />)}
    </ul>}
    <CreateLabelForm family={family} scope={scope} busy={busy} run={run} />
  </div>;
}

function LabelRow({ label, scope, busy, run }: {
  label: CatalogLabel; scope: string; busy: boolean;
  run: (fn: (signal: AbortSignal) => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [exibicao, setExibicao] = useState(label.rotulo_exibicao);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const reasonOk = reason.trim().length >= LABEL_REASON_MIN && reason.trim().length <= LABEL_REASON_MAX;
  const renamed = exibicao.trim() !== label.rotulo_exibicao && exibicao.trim().length >= 2;
  const key = (parts: unknown) => labelRetryKey(scope, parts);
  return <li className="rounded-md border border-border p-3 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium break-words">{label.rotulo_exibicao}
        <span className="ml-2 text-muted-foreground font-normal">{label.rotulo}</span>
        {!label.ativo && <span className="ml-2 text-muted-foreground">(inativo)</span>}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="min-h-10" disabled={busy}
          onClick={() => { setEditing((v) => !v); setReason(""); setConfirmed(false); setExibicao(label.rotulo_exibicao); }}>
          {editing ? "Fechar" : "Renomear exibição"}</Button>
        <Button type="button" variant="outline" className="min-h-10" disabled={busy || !reasonOk || !confirmed}
          onClick={() => void run((signal) => setCatalogLabelActive(label, !label.ativo, reason,
            key(["label-active", label.id, label.updated_at, !label.ativo, reason.trim()]), signal))}>
          {label.ativo ? "Inativar" : "Reativar"}</Button>
      </div>
    </div>
    {editing && <div className="space-y-2">
      <Label htmlFor={`rename-${label.id}`}>Nome de exibição (a chave “{label.rotulo}” não muda)</Label>
      <Input id={`rename-${label.id}`} value={exibicao} maxLength={80} disabled={busy}
        onChange={(e) => { setExibicao(e.target.value); setConfirmed(false); }} />
      <Button type="button" className="min-h-10" disabled={busy || !renamed || !reasonOk || !confirmed}
        onClick={() => void run((signal) => updateCatalogLabel(label, exibicao, reason,
          key(["label-rename", label.id, label.updated_at, exibicao.trim(), reason.trim()]), signal))}>
        Salvar nome</Button>
    </div>}
    <Label htmlFor={`reason-${label.id}`}>Motivo ({LABEL_REASON_MIN} a {LABEL_REASON_MAX} caracteres)</Label>
    <Textarea id={`reason-${label.id}`} rows={2} maxLength={LABEL_REASON_MAX} disabled={busy} value={reason}
      onChange={(e) => { setReason(e.target.value); setConfirmed(false); }} />
    <div className="flex items-start gap-2">
      <Checkbox id={`confirm-${label.id}`} checked={confirmed} disabled={busy || !reasonOk}
        onCheckedChange={(v) => setConfirmed(v === true)} />
      <Label htmlFor={`confirm-${label.id}`} className="text-sm font-normal break-words">
        Confirmo a alteração do rótulo “{label.rotulo}”.</Label>
    </div>
  </li>;
}

function CreateLabelForm({ family, scope, busy, run }: {
  family: ProductFamily; scope: string; busy: boolean;
  run: (fn: (signal: AbortSignal) => Promise<unknown>) => Promise<void>;
}) {
  const [rotulo, setRotulo] = useState("");
  const [exibicao, setExibicao] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const rotuloOk = /^[a-z0-9][a-z0-9_]{1,39}$/.test(rotulo.trim().toLowerCase());
  const exibicaoOk = exibicao.trim().length >= 2 && exibicao.trim().length <= 80;
  const reasonOk = reason.trim().length >= LABEL_REASON_MIN && reason.trim().length <= LABEL_REASON_MAX;
  const valid = rotuloOk && exibicaoOk && reasonOk && confirmed;
  return <div className="rounded-md border border-border p-3 space-y-2" aria-label={`Novo rótulo em ${FAMILY_LABEL[family]}`}>
    <p className="text-sm font-medium">Novo rótulo em {FAMILY_LABEL[family]}</p>
    <Label htmlFor={`new-rotulo-${family}`}>Chave (minúscula, imutável, ex.: npk_organomineral)</Label>
    <Input id={`new-rotulo-${family}`} value={rotulo} maxLength={40} disabled={busy}
      onChange={(e) => { setRotulo(e.target.value); setConfirmed(false); }} />
    <Label htmlFor={`new-exibicao-${family}`}>Nome de exibição</Label>
    <Input id={`new-exibicao-${family}`} value={exibicao} maxLength={80} disabled={busy}
      onChange={(e) => { setExibicao(e.target.value); setConfirmed(false); }} />
    <Label htmlFor={`new-reason-${family}`}>Motivo ({LABEL_REASON_MIN} a {LABEL_REASON_MAX} caracteres)</Label>
    <Textarea id={`new-reason-${family}`} rows={2} maxLength={LABEL_REASON_MAX} disabled={busy} value={reason}
      onChange={(e) => { setReason(e.target.value); setConfirmed(false); }} />
    <div className="flex items-start gap-2">
      <Checkbox id={`new-confirm-${family}`} checked={confirmed} disabled={busy || !(rotuloOk && exibicaoOk && reasonOk)}
        onCheckedChange={(v) => setConfirmed(v === true)} />
      <Label htmlFor={`new-confirm-${family}`} className="text-sm font-normal break-words">
        Confirmo o cadastro deste rótulo na família {FAMILY_LABEL[family]}.</Label>
    </div>
    <Button type="button" className="min-h-10" disabled={busy || !valid}
      onClick={() => void run(async (signal) => {
        await createCatalogLabel({ familia: family, rotulo, rotulo_exibicao: exibicao }, reason,
          labelRetryKey(scope, ["label-create", family, rotulo.trim().toLowerCase(), exibicao.trim(), reason.trim()]), signal);
        setRotulo(""); setExibicao(""); setReason(""); setConfirmed(false);
      })}>
      Cadastrar rótulo</Button>
  </div>;
}
