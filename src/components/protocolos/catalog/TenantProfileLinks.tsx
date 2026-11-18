import { useEffect, useRef, useState } from "react";
import { useCatalogExtensions } from "@/hooks/useCatalogExtensions";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { CompactCatalogSelect } from "@/components/catalogo/CompactCatalogSelect";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TenantReferenceDialog } from "../TenantReferencePanel";
import { TenantProblemDialog } from "../TenantProblemPanel";
type Props = { entity: "produto" | "microrganismo"; parent: string; disabled?: boolean; onDirty?(): void; onPending?(value: boolean): void };
export function TenantProfileLinks(props: Props) {
  const editor = useTenantCatalogEditor();
  return <Links key={`${editor.scope}:${props.entity}:${props.parent}`} {...props} />;
}
function Links({ entity, parent, disabled = false, onDirty, onPending }: Props) {
  const api = useCatalogExtensions("links", entity, parent), problems = useCatalogExtensions("problems");
  const cultures = useScopedPortalQuery({ queryKey: ["link-cultures"], queryFn: async signal => {
    const { data, error } = await supabase.from("culturas").select("id,nome").eq("ativo", true).abortSignal(signal);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Culturas indisponíveis");
    return data;
  } });
  const [culture, setCulture] = useState("none"), [problem, setProblem] = useState("none"), [note, setNote] = useState("");
  const [inline, setInline] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const pending = busy || !!inline || culture !== "none" || problem !== "none" || !!note;
  useEffect(() => { onPending?.(pending); }, [pending, onPending]);
  useEffect(() => () => { onPending?.(false); }, [onPending]);
  const unavailable = api.isError || cultures.isError || problems.isError;
  const ready = api.isSuccess && cultures.isSuccess && problems.isSuccess;
  const reset = () => { setCulture("none"); setProblem("none"); setNote(""); setError(""); };
  const save = async () => {
    if (lock.current || disabled || !ready || unavailable || !api.canEdit || (culture === "none" && problem === "none")) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await api.save(null, null, { culture_id: culture === "none" ? null : culture, problem_id: problem === "none" ? null : problem, observacao: note || null, ativo: true });
      if (alive.current) reset();
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Rascunho preservado"); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <section className="space-y-3 border rounded p-3" aria-label="Vínculos adicionais da empresa">
    <h3 className="font-semibold">Culturas e problemas vinculados</h3>
    <p className="text-sm text-muted-foreground">Estes vínculos pertencem à sua empresa e são salvos separadamente da ficha, pelo botão Salvar vínculo.</p>
    {unavailable ? <p role="alert">Não foi possível consultar os vínculos, culturas ou problemas da empresa.</p> : !ready ? <p role="status">Carregando vínculos adicionais…</p> : <>
      {!(api.data ?? []).length && <p>Nenhum vínculo adicional cadastrado.</p>}
      {(api.data ?? []).filter(r => r.ativo !== false).map(r => <p key={r.id} className="border-b py-2 break-words">{cultures.data?.find(c => c.id === r.culture_id)?.nome} · {problems.data?.find(p => p.id === r.problem_id)?.nome} {r.observacao}</p>)}
    </>}
    {api.canEdit && <fieldset disabled={disabled || busy || !ready || unavailable} className="space-y-3 min-w-0">
      <CompactCatalogSelect label="Cultura do vínculo adicional" value={culture} onChange={v => { setCulture(v); onDirty?.(); }} options={[{value:"none",label:"Não selecionada"},...(cultures.data ?? []).map(c => ({value:c.id,label:c.nome}))]} />
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setInline("culture")}>Cadastrar cultura</Button>
      <CompactCatalogSelect label="Problema do vínculo adicional" value={problem} onChange={v => { setProblem(v); onDirty?.(); }} options={[{value:"none",label:"Não selecionado"},...(problems.data ?? []).filter(p => p.ativo !== false).map(p => ({value:p.id,label:p.nome ?? p.id}))]} />
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setInline("problem")}>Cadastrar problema</Button>
      <Textarea aria-label="Observação do vínculo" value={note} onChange={e => { setNote(e.target.value); onDirty?.(); }} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={culture === "none" && problem === "none"} onClick={() => void save()}>Salvar vínculo</Button>
      </div>
    </fieldset>}
    {api.canEdit && <Button type="button" variant="outline" disabled={busy || !pending || api.hasPendingAttempt()} onClick={reset}>Cancelar vínculo</Button>}
    {error && <p role="alert">{error}</p>}
    {api.hasPendingAttempt() && !busy && <p role="status">O envio ainda não foi confirmado. Repita Salvar vínculo com os mesmos dados para reconciliar.</p>}
    {inline === "culture" && <TenantReferenceDialog root="culturas" item={null} onClose={() => setInline("")} onSaved={r => { setCulture(r.id); onDirty?.(); setInline(""); void cultures.refetch(); }} />}
    {inline === "problem" && <TenantProblemDialog item={null} onClose={() => setInline("")} onSaved={r => { setProblem(r.id); onDirty?.(); setInline(""); void problems.refetch(); }} />}
  </section>;
}
