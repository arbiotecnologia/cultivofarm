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

type Reference = { id: string; nome: string; descricao: string | null; nome_cientifico?: string | null; tipo?: string; updated_at: string | null; owner_organization_id?: string | null };
export type ReferenceRoot = "culturas" | "microrganismos";
const names = { culturas: "cultura", microrganismos: "microrganismo" };

/** Existing canonical root writer only; never enables the old Owned gate or global DML. */
export function TenantReferenceDialog({ root, item, onClose, onSaved }: {
  root: ReferenceRoot; item: Reference | null; onClose(): void; onSaved(row: Reference): void;
}) {
  const editor = useTenantCatalogEditor();
  const [values, setValues] = useState({ nome: item?.nome ?? "", descricao: item?.descricao ?? "", nome_cientifico: item?.nome_cientifico ?? "", tipo: item?.tipo ?? "bacteria" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
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
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    try {
      const ack = await saveTenantCatalogRoot(supabase, root, item?.id ?? null, payload, item?.updated_at ?? null, attempt.current.key);
      if (current()) onSaved({ ...item, ...payload, id: ack.id, updated_at: ack.updated_at });
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : "Não foi possível salvar; rascunho preservado."); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  return <Dialog open onOpenChange={v => { if (!v && !busy) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto" aria-describedby={undefined}>
    <DialogHeader><DialogTitle>{item ? "Editar" : "Adicionar"} {names[root]}</DialogTitle></DialogHeader>
    <fieldset disabled={busy} className="space-y-3">
      <div><Label htmlFor="reference-name">Nome</Label><Input id="reference-name" value={values.nome} onChange={e => setValues(v => ({ ...v, nome: e.target.value }))} /></div>
      {root === "microrganismos" && <><div><Label htmlFor="reference-scientific">Nome científico</Label><Input id="reference-scientific" value={values.nome_cientifico} onChange={e => setValues(v => ({ ...v, nome_cientifico: e.target.value }))} /></div>
        <Label>Tipo</Label><Select value={values.tipo} onValueChange={tipo => setValues(v => ({ ...v, tipo }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["bacteria", "fungo", "levedura", "consorcio"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></>}
      <div><Label htmlFor="reference-description">Descrição</Label><Textarea id="reference-description" value={values.descricao} onChange={e => setValues(v => ({ ...v, descricao: e.target.value }))} /></div>
    </fieldset>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button disabled={busy || !editor.canEdit} onClick={() => void save()}>Salvar</Button></div>
  </DialogContent></Dialog>;
}

export function TenantReferencePanel({ root }: { root: ReferenceRoot }) {
  const editor = useTenantCatalogEditor();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ item: Reference | null }>();
  useEffect(() => { setDialog(undefined); setSearch(""); }, [editor.scope]);
  const query = useScopedPortalQuery<Reference[]>({ queryKey: ["tenant-reference", root], queryFn: async signal => {
    const { data, error } = await supabase.from(root).select("*").order("nome").abortSignal(signal);
    if (error) throw error;
    return (data ?? []) as Reference[];
  } });
  const rows = query.data?.filter(r => r.nome.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <section className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><Input className="w-full sm:max-w-sm" aria-label={`Buscar ${root}`} value={search} onChange={e => setSearch(e.target.value)} />
      {editor.canEdit && <Button onClick={() => setDialog({ item: null })}><Plus className="mr-2 h-4 w-4" />Adicionar {names[root]}</Button>}
    </header>
    {query.isError ? <div role="alert">Não foi possível consultar. <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button></div>
      : query.isLoading ? <p role="status">Carregando…</p> : <ul className="divide-y">{rows.map(r => <li key={r.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words font-medium">{r.nome}</p><p className="break-words text-sm text-muted-foreground">{r.descricao}</p></div>
        {editor.canEdit && r.owner_organization_id && <Button variant="outline" aria-label={`Editar ${r.nome}`} onClick={() => setDialog({ item: r })}><Pencil className="h-4 w-4" /></Button>}</li>)}{rows.length === 0 && <li className="py-8 text-muted-foreground">Nenhum registro encontrado.</li>}</ul>}
    {dialog && <TenantReferenceDialog key={editor.scope} root={root} item={dialog.item} onClose={() => setDialog(undefined)} onSaved={() => {
      setDialog(undefined); void qc.invalidateQueries({ queryKey: ["tenant-reference", root] }); void qc.invalidateQueries({ queryKey: ["tenant-product-details"] });
    }} />}
  </section>;
}