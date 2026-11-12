import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { documentarySchema, selectedDocumentaryValues, type DocumentaryIdentity, type DocumentaryResult } from "@/lib/catalogo/documentarySuggestions";

export function DocumentaryAI({ identity, values, allowed, onApply }: { identity: DocumentaryIdentity; values: Record<string, unknown>; allowed: readonly string[]; onApply(fields: Record<string, string>): void }) {
  const editor = useTenantCatalogEditor();
  const [manufacturer, setManufacturer] = useState(identity.manufacturer);
  const [registration, setRegistration] = useState(identity.registration);
  const [result, setResult] = useState<DocumentaryResult>();
  const [candidate, setCandidate] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const controller = useRef<AbortController>();
  const resultFence = useRef<() => boolean>(() => false);
  const fingerprint = JSON.stringify([editor.scope, identity.name, identity.id, identity.entity, manufacturer, registration]);
  useEffect(() => { controller.current?.abort(); setResult(undefined); setCandidate(""); setSelected([]); setError(undefined); setBusy(false); }, [fingerprint]);
  useEffect(() => () => controller.current?.abort(), []);
  if (!editor.canEdit) return null;
  const generate = async () => {
    if (lock.current || !identity.name.trim()) return;
    lock.current = true; setBusy(true); setError(undefined); setResult(undefined); setSelected([]);
    const c = new AbortController(); controller.current = c;
    const current = editor.capture();
    try {
      const { data, error: failure } = await supabase.functions.invoke("catalog-documentary-suggestions", { body: { identity: { ...identity, manufacturer, registration }, fields: allowed }, signal: c.signal });
      if (!current() || c.signal.aborted) return;
      if (failure) throw new Error("Pesquisa documental indisponível neste ambiente. O formulário foi preservado; o serviço requer implantação revisada.");
      const parsed = documentarySchema.safeParse(data);
      if (!parsed.success) throw new Error("A resposta não possui fontes verificáveis. Nenhum campo foi alterado.");
      resultFence.current = current;
      setResult(parsed.data); setCandidate(parsed.data.candidates.length === 1 ? parsed.data.candidates[0].key : "");
    } catch (e) { if (current() && !c.signal.aborted) setError(e instanceof Error ? e.message : "Pesquisa indisponível. Formulário preservado."); }
    finally { lock.current = false; if (current() && !c.signal.aborted) setBusy(false); }
  };
  return <section className="space-y-3 border-y py-3" aria-label="Pesquisa documental do produto">
    <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="documentary-manufacturer">Fabricante para pesquisa</Label><Input id="documentary-manufacturer" value={manufacturer} onChange={e => setManufacturer(e.target.value)} /></div><div><Label htmlFor="documentary-registration">Registro para pesquisa (opcional)</Label><Input id="documentary-registration" value={registration} onChange={e => setRegistration(e.target.value)} /></div></div>
    <Button type="button" variant="outline" disabled={busy || !identity.name.trim()} onClick={() => void generate()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Gerar com IA</Button>
    {busy && <Button type="button" variant="ghost" onClick={() => { controller.current?.abort(); setBusy(false); }}>Parar</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <>
      {result.candidates.length === 0 ? <p role="status">Nenhuma identificação documental verificável encontrada.</p> : <div><Label>Produto identificado</Label><Select value={candidate} onValueChange={v => { setCandidate(v); setSelected([]); }}><SelectTrigger aria-label="Produto identificado"><SelectValue placeholder="Escolha entre as identificações encontradas" /></SelectTrigger><SelectContent>{result.candidates.map(c => <SelectItem key={c.key} value={c.key}>{c.name} · {c.manufacturer ?? "Fabricante não informado"} · {c.registration ?? "Registro não informado"}</SelectItem>)}</SelectContent></Select></div>}
      {candidate && result.suggestions.filter(s => s.candidate_key === candidate && allowed.includes(s.field)).map(s => <div key={s.field} className="space-y-2 border-b py-3">
        <Label className="flex items-center gap-2"><Checkbox checked={selected.includes(s.field)} onCheckedChange={v => setSelected(old => v === true ? [...old, s.field] : old.filter(f => f !== s.field))} />{s.field.replace(/_/g, " ")}</Label>
        <div className="grid gap-2 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Atual</p><p className="whitespace-pre-wrap break-words text-sm">{String(values[s.field] ?? "") || "Não informado"}</p></div><div><p className="text-xs text-muted-foreground">Sugestão</p><p className="whitespace-pre-wrap break-words text-sm">{s.value}</p></div></div>
        {s.sources.map(source => <div key={source.url} className="break-words text-xs"><a className="text-primary underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><p>{source.excerpt}</p></div>)}
      </div>)}
      <Button type="button" disabled={!candidate || selected.length === 0} onClick={() => { if (resultFence.current() && editor.capture()()) { onApply(selectedDocumentaryValues(result, candidate, selected, allowed)); setSelected([]); } }}>Aplicar campos selecionados ao rascunho</Button>
    </>}
  </section>;
}