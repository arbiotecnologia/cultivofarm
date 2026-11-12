import { useEffect, useState } from "react";
import { useCatalogExtensions, type CatalogExtensionRow } from "@/hooks/useCatalogExtensions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DraftExitConfirmation } from "@/components/catalogo/DraftExitConfirmation";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";

export function TenantProblemDialog({ item, onClose, onSaved }: { item: CatalogExtensionRow | null; onClose(): void; onSaved(row: { id: string; nome: string }): void }) {
  const api = useCatalogExtensions("problems");
  const [nome, setNome] = useState(item?.nome ?? "");
  const [categoria, setCategoria] = useState(item?.categoria ?? "outro");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [exit, setExit] = useState(false);
  return <><Dialog open onOpenChange={v => { if (!v && !busy) setExit(true); }}><DialogContent className="max-h-[90dvh] overflow-y-auto [&_input]:min-h-11 [&_button]:min-h-11"><DialogTitle>{item ? "Editar problema" : "Adicionar problema"}</DialogTitle>
    <Label htmlFor="problem-name">Nome</Label><Input id="problem-name" value={nome} onChange={e => setNome(e.target.value)} disabled={busy} />
    <Label htmlFor="problem-category">Categoria</Label><Input id="problem-category" value={categoria} onChange={e => setCategoria(e.target.value)} disabled={busy} />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button disabled={busy || !nome.trim() || !api.canEdit} onClick={async () => { setBusy(true); setError(""); try { const ack = await api.save(item?.id ?? null, item?.updated_at ?? null, { nome: nome.trim(), categoria, ativo: true }); onSaved({ id: ack.id, nome }); } catch (e) { setError(e instanceof Error ? e.message : "Rascunho preservado."); } finally { setBusy(false); } }}>Salvar problema</Button>
  </DialogContent></Dialog><DraftExitConfirmation open={exit} onOpenChange={setExit} onLeave={onClose} /></>;
}
export function TenantProblemPanel() {
  const api = useCatalogExtensions("problems"); const [editing, setEditing] = useState<{ item: CatalogExtensionRow | null }>(); const [search, setSearch] = useState("");
  const historical = useScopedPortalQuery({ queryKey: ["catalog-problems-historical"], queryFn: async signal => {
    const {data,error} = await supabase.from("catalogo_problemas").select("id,nome,nome_cientifico,categoria").eq("ativo",true).order("nome").abortSignal(signal);
    if(error) throw error; return data ?? [];
  } });
  useEffect(() => { setEditing(undefined); setSearch(""); }, [api.scope]);
  return <section className="space-y-3"><header className="flex flex-wrap gap-3 justify-between"><Input aria-label="Buscar problemas próprios" value={search} onChange={e => setSearch(e.target.value)} className="min-h-11 sm:max-w-sm" />{api.canEdit && <Button className="min-h-11" onClick={() => setEditing({ item: null })}>Adicionar problema</Button>}</header>
    {api.isError && <p role="alert">Cadastros próprios indisponíveis; o contrato precisa estar ativo.</p>}
    {(api.data ?? []).filter(r => (r.nome ?? "").toLowerCase().includes(search.toLowerCase())).map(r => <article className="border-b py-3 flex gap-3 justify-between" key={r.id}><p>{r.nome}</p>{api.canEdit && <Button variant="outline" className="min-h-11" onClick={() => setEditing({ item: r })}>Editar problema</Button>}</article>)}
    {!api.isLoading && !api.isError && !api.data?.length && <p>Nenhum problema próprio cadastrado.</p>}
    {historical.isError && <p role="alert">Não foi possível consultar os problemas existentes.</p>}
    {(historical.data ?? []).filter(r => r.nome.toLowerCase().includes(search.toLowerCase())).map(r => <article key={`historical-${r.id}`} className="border-b py-3"><p>{r.nome}</p><p className="text-sm text-muted-foreground">{r.categoria}</p></article>)}
    {editing && <TenantProblemDialog key={api.scope} item={editing.item} onClose={() => setEditing(undefined)} onSaved={() => setEditing(undefined)} />}
  </section>;
}