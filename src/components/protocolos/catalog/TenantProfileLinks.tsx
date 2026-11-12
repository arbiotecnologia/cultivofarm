import { useState } from "react";
import { useCatalogExtensions } from "@/hooks/useCatalogExtensions";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { CompactCatalogSelect } from "@/components/catalogo/CompactCatalogSelect";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TenantReferenceDialog } from "../TenantReferencePanel";
import { TenantProblemDialog } from "../TenantProblemPanel";
export function TenantProfileLinks({ entity, parent }: { entity: "produto" | "microrganismo"; parent: string }) {
  const api = useCatalogExtensions("links", entity, parent); const problems = useCatalogExtensions("problems");
  const cultures = useScopedPortalQuery({ queryKey: ["link-cultures"], queryFn: async signal => { const { data, error } = await supabase.from("culturas").select("id,nome").eq("ativo", true).abortSignal(signal); if (error) throw error; return data ?? []; } });
  const [culture, setCulture] = useState("none"); const [problem, setProblem] = useState("none"); const [note, setNote] = useState(""); const [inline, setInline] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <section className="space-y-3"><h3 className="font-semibold">Culturas e problemas vinculados</h3>{api.isError && <p role="alert">Vínculos indisponíveis neste ambiente.</p>}
    {(api.data ?? []).map(r => <p key={r.id} className="border-b py-2">{cultures.data?.find(c => c.id === r.culture_id)?.nome} · {problems.data?.find(p => p.id === r.problem_id)?.nome} {r.observacao}</p>)}
    {api.canEdit && <><CompactCatalogSelect label="Cultura" value={culture} onChange={setCulture} options={[{value:"none",label:"Não selecionada"},...(cultures.data ?? []).map(c => ({value:c.id,label:c.nome}))]} /><Button variant="outline" className="min-h-11" onClick={() => setInline("culture")}>Cadastrar cultura</Button>
      <CompactCatalogSelect label="Problema" value={problem} onChange={setProblem} options={[{value:"none",label:"Não selecionado"},...(problems.data ?? []).map(p => ({value:p.id,label:p.nome ?? p.id}))]} /><Button variant="outline" className="min-h-11" onClick={() => setInline("problem")}>Cadastrar problema</Button>
      <Textarea aria-label="Observação do vínculo" value={note} onChange={e => setNote(e.target.value)} />{error && <p role="alert">{error}</p>}
      <Button className="min-h-11" disabled={busy || (culture === "none" && problem === "none")} onClick={async () => { setBusy(true); try { await api.save(null, null, { culture_id: culture === "none" ? null : culture, problem_id: problem === "none" ? null : problem, observacao: note || null, ativo: true }); setNote(""); } catch(e) { setError(e instanceof Error ? e.message : "Rascunho preservado"); } finally { setBusy(false); } }}>Salvar vínculo</Button></>}
    {inline === "culture" && <TenantReferenceDialog root="culturas" item={null} onClose={() => setInline("")} onSaved={r => { setCulture(r.id); setInline(""); void cultures.refetch(); }} />}
    {inline === "problem" && <TenantProblemDialog item={null} onClose={() => setInline("")} onSaved={r => { setProblem(r.id); setInline(""); void problems.refetch(); }} />}
  </section>;
}