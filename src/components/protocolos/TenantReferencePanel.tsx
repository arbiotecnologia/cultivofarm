import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { saveTenantCatalogRoot } from "@/lib/catalogo/tenantCatalogRoots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MicroorganismFichaEditor } from "./MicroorganismFichaEditor";
import { DocumentaryAI } from "./catalog/DocumentaryAI";
import { DraftExitConfirmation } from "@/components/catalogo/DraftExitConfirmation";
import { useAuth } from "@/hooks/useAuth";
import { useManagedVisibility, TenantVisibilityBar, TenantVisibilityToggle, useCanManageTenantVisibility } from "./TenantVisibilityControls";

type Reference = { id: string; nome: string; descricao: string | null; nome_cientifico?: string | null; tipo?: string; updated_at: string | null; owner_organization_id?: string | null };
export type ReferenceRoot = "culturas" | "microrganismos";
const names = { culturas: "cultura", microrganismos: "microrganismo" };

/** Existing canonical root writer only; never enables the old Owned gate or global DML. */
export function TenantReferenceDialog(props: {
  root: ReferenceRoot; item: Reference | null; onClose(): void; onSaved(row: Reference): void;
}) {
  return props.root === "microrganismos" ? <MicroorganismFichaEditor key={`${props.item?.id ?? "new"}`} {...props} /> : <CultureReferenceDialog {...props} />;
}
function CultureReferenceDialog({ root, item, onClose, onSaved }: {
  root: ReferenceRoot; item: Reference | null; onClose(): void; onSaved(row: Reference): void;
}) {
  const editor = useTenantCatalogEditor();
  const actor = useRef(editor.scope);
  const unresolved = useRef(false);
  const [values, setValues] = useState({ nome: item?.nome ?? "", descricao: item?.descricao ?? "", nome_cientifico: item?.nome_cientifico ?? "", tipo: item?.tipo ?? "bacteria" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [exit, setExit] = useState(false);
  const lock = useRef(false);
  const attempt = useRef<{ signature: string; key: string }>();
  const save = async () => {
    if (!editor.canEdit || lock.current) return;
    if (!values.nome.trim()) { setError("Informe o nome."); return; }
    lock.current = true; setBusy(true); setError(undefined);
    const current = editor.capture();
    const payload = root === "culturas" ? { nome: values.nome.trim(), descricao: values.descricao || null }
      : { nome: values.nome.trim(), descricao: values.descricao || null, nome_cientifico: values.nome_cientifico || null, tipo: values.tipo };
    const signature = JSON.stringify([editor.scope, root, item?.id, item?.updated_at, payload]);
    if (actor.current !== editor.scope) { lock.current = false; return; }
    if (unresolved.current && attempt.current?.signature !== signature) { lock.current = false; setBusy(false); setError("Tentativa anterior inconclusiva. Preserve os mesmos campos para reconciliar; rascunho mantido."); return; }
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    try {
      unresolved.current = true;
      const ack = await saveTenantCatalogRoot(supabase, root, item?.id ?? null, payload, item?.updated_at ?? null, attempt.current.key);
      if (current()) { unresolved.current = false; onSaved({ ...item, ...payload, id: ack.id, updated_at: ack.updated_at }); }
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : "Não foi possível salvar; rascunho preservado."); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  return <><DraftExitConfirmation open={exit} onOpenChange={setExit} onLeave={onClose} /><Dialog open onOpenChange={v => { if (!v && !busy) setExit(true); }}><DialogContent className="max-h-[90dvh] overflow-y-auto [&_input]:min-h-11 [&_button]:min-h-11" aria-describedby={undefined}>
    <DialogHeader><DialogTitle>{item ? "Editar" : "Adicionar"} {names[root]}</DialogTitle></DialogHeader>
    <fieldset disabled={busy} className="space-y-3">
      {root === "microrganismos" && <DocumentaryAI identity={{ name: values.nome, manufacturer: "", registration: "", entity: "microrganismo", id: item?.id }} values={values} allowed={["descricao"]} onApply={fields => setValues(v => ({ ...v, ...fields }))} />}
      <div><Label htmlFor="reference-name">Nome</Label><Input id="reference-name" value={values.nome} onChange={e => setValues(v => ({ ...v, nome: e.target.value }))} /></div>
      {root === "microrganismos" && <><div><Label htmlFor="reference-scientific">Nome científico</Label><Input id="reference-scientific" value={values.nome_cientifico} onChange={e => setValues(v => ({ ...v, nome_cientifico: e.target.value }))} /></div>
        <Label>Tipo</Label><Select value={values.tipo} onValueChange={tipo => setValues(v => ({ ...v, tipo }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["bacteria", "fungo", "levedura", "consorcio"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></>}
      <div><Label htmlFor="reference-description">Descrição</Label><Textarea id="reference-description" value={values.descricao} onChange={e => setValues(v => ({ ...v, descricao: e.target.value }))} /></div>
    </fieldset>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setExit(true)}>Cancelar</Button><Button disabled={busy || !editor.canEdit} onClick={() => void save()}>Salvar</Button></div>
  </DialogContent></Dialog></>;
}

export function TenantReferencePanel({ root }: { root: ReferenceRoot }) {
  const editor = useTenantCatalogEditor();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ item: Reference | null }>();
  useEffect(() => { setDialog(undefined); setSearch(""); }, [editor.scope]);
  const query = useScopedPortalQuery<Reference[]>({ queryKey: ["tenant-reference", root], queryFn: async signal => {
    const { data, error } = await supabase.from(root).select("*").order("nome").abortSignal(signal);
    if (error) throw error;
    return (data ?? []).map(row => {
      const r = row as typeof row & { updated_at?: string; owner_organization_id?: string };
      return { ...r, updated_at: r.updated_at ?? null };
    });
  } });
  const matched = query.data?.filter(r => r.nome.toLowerCase().includes(search.toLowerCase())) ?? [];
  const vis = useManagedVisibility(root === "culturas" ? "cultura" : "microrganismo", matched);
  const canManageVis = useCanManageTenantVisibility();
  const rows = vis.displayed;
  return <section className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><Input className="w-full sm:max-w-sm" aria-label={`Buscar ${root}`} value={search} onChange={e => setSearch(e.target.value)} />
      {editor.canEdit && <Button onClick={() => setDialog({ item: null })}><Plus className="mr-2 h-4 w-4" />Adicionar {names[root]}</Button>}
    </header>
    <TenantVisibilityBar v={vis} />
    {query.isError ? <div role="alert">Não foi possível consultar. <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button></div>
      : query.isLoading ? <p role="status">Carregando…</p> : <ul className="divide-y">{rows.map(r => <li key={r.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0">{root === "microrganismos" ? <Button variant="link" className="h-auto whitespace-normal p-0 text-left" onClick={() => setDialog({ item: r })}>{r.nome}</Button> : <p className="break-words font-medium">{r.nome}</p>}<p className="break-words text-sm text-muted-foreground">{r.descricao}</p></div>
        {canManageVis && !r.owner_organization_id && <TenantVisibilityToggle entity={root === "culturas" ? "cultura" : "microrganismo"} item={{ id: r.id, nome: r.nome, ativo: true }} state={vis.map?.get(r.id)} disabledReason={vis.error ?? (vis.map ? null : "Carregando preferências.")} />}
        {root === "microrganismos" && <Button variant="outline" onClick={() => setDialog({ item: r })}>Abrir ficha</Button>}
        {root === "culturas" && editor.canEdit && r.owner_organization_id === profile?.organization_id && !!r.owner_organization_id && <Button variant="outline" aria-label={`Editar ${r.nome}`} onClick={() => setDialog({ item: r })}><Pencil className="h-4 w-4" /></Button>}</li>)}{rows.length === 0 && <li className="py-8 text-muted-foreground">Nenhum registro encontrado.</li>}</ul>}
    {dialog && <TenantReferenceDialog key={editor.scope} root={root} item={dialog.item} onClose={() => setDialog(undefined)} onSaved={() => {
      setDialog(undefined); void qc.invalidateQueries({ queryKey: ["tenant-reference", root] }); void qc.invalidateQueries({ queryKey: ["tenant-product-details"] });
    }} />}
  </section>;
}