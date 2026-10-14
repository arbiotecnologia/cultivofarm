import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";
import { metadataRetryKey } from "@/lib/catalogo/platformCatalogMetadata";
import { MICRO_PAGE_LIMIT, parseDecimal, readActiveMicroorganisms, type MicroPage } from "@/lib/catalogo/platformCatalogLifecycle";
import { FAMILY_LABEL } from "@/lib/catalogo/platformCatalogFamily";
import { BASE_LABEL, COMPONENT_LABEL, COMPOSITION_BASES, COMPOSITION_MAX_ITEMS, COMPOSITION_UNITS, FAMILY_COMPONENTS, NATUREZA_LABEL,
  NATUREZAS, RECIPE_PAGE_LIMIT, UNIT_BASE, readComposition, setComposition, toDraft, validateDeclarations,
  type Composition, type CompositionStatus, type DeclarationDraft } from "@/lib/catalogo/platformCatalogComposition";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = DeclarationDraft & { key: number; qtyText: string; microLabel: string | null };
type Loaded<T> = { key: string; value: T };
type RecipePage = Pick<Composition, "receita" | "receita_offset" | "receita_has_more">;
const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const MICRO_MAX_OFFSET = 1000;

/**
 * Painel único de composição de um produto GLOBAL: receita existente (origem `formulacoes`, somente leitura,
 * paginada) + declarações (conjunto completo, editável). Fence por produto/versão da lista/escopo/vivo:
 * qualquer troca aborta leituras/escritas/buscas, limpa estado e impede renderizar dados do contexto anterior.
 */
export function PlatformCatalogCompositionDialog({ productId, updatedAt, nome, scope, onClose, onSaved }:
  { productId: string; updatedAt: string; nome: string; scope: string; onClose(): void; onSaved(): void }) {
  const access = platformCatalogAccess(useAuth());
  const live = access.ready && access.scope === scope;
  const liveRef = useRef(live); liveRef.current = live;
  const contextKey = JSON.stringify([productId, updatedAt, scope, live]);
  const epoch = useRef({ key: contextKey, n: 0 });
  if (epoch.current.key !== contextKey) epoch.current = { key: contextKey, n: epoch.current.n + 1 };
  const epochN = epoch.current.n;
  const [loaded, setLoaded] = useState<Loaded<Composition>>();
  const [loadError, setLoadError] = useState<string>();
  const [recipe, setRecipe] = useState<Loaded<RecipePage>>();
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<CompositionStatus>("rascunho");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [microSearch, setMicroSearch] = useState("");
  const [micros, setMicros] = useState<{ key: string; query: string; offset: number; page: MicroPage }>();
  const lock = useRef(false);
  const seq = useRef(0);
  const microSeq = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const track = () => { const c = new AbortController(); requests.current.add(c); return c; };

  // Reset completo a cada época (ID, versão da lista, escopo, vivo).
  useEffect(() => {
    for (const r of requests.current) r.abort();
    requests.current.clear();
    setLoaded(undefined); setLoadError(undefined); setRecipe(undefined); setRecipeBusy(false); setRows([]); setStatus("rascunho");
    setReason(""); setConfirmed(false); setError(""); setBusy(false); setMicros(undefined); setMicroSearch("");
    lock.current = false; microSeq.current += 1;
    if (!live) return;
    const key = contextKey;
    const c = track();
    readComposition(productId, c.signal)
      .then((value) => {
        if (c.signal.aborted || epoch.current.key !== key) return;
        setLoaded({ key, value }); setRecipe({ key, value });
        setRows(value.declaracoes.map((d) => ({ ...toDraft(d), key: ++seq.current,
          qtyText: d.quantidade === null ? "" : String(d.quantidade), microLabel: d.micro_nome })));
        setStatus(value.conjunto?.status ?? "rascunho");
      })
      .catch(() => { if (!c.signal.aborted && epoch.current.key === key) setLoadError(key); })
      .finally(() => requests.current.delete(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- época agrega productId/updatedAt/scope/live
  }, [epochN]);
  useEffect(() => {
    const set = requests.current;
    return () => { for (const r of set) r.abort(); set.clear(); };
  }, []);
  if (!live) return null;

  // Só usa dados pertencentes à época corrente (impede render/submit com dados de ID/escopo anterior).
  const data = loaded?.key === contextKey ? loaded.value : undefined;
  const recipePage = recipe?.key === contextKey ? recipe.value : undefined;
  const family = data?.produto.familia_catalogo ?? null;
  const partial = !!data?.declaracoes_has_more;
  const versionDrift = !!data && data.produto.updated_at !== updatedAt;
  const withConc = new Set((recipePage?.receita ?? []).filter((r) => r.concentracao !== null).map((r) => r.microrganismo_id));
  const qtyInvalid = rows.some((r) => r.qtyText.trim() !== "" && Number.isNaN(parseDecimal(r.qtyText)));
  const problems = data ? validateDeclarations(family, status, rows, withConc) : [];
  const reasonOk = reason.trim().length >= 10 && reason.trim().length <= 500;
  const canEdit = !!data && family !== null && !partial && !versionDrift;
  const locked = !canEdit || busy;
  const valid = canEdit && !busy && !qtyInvalid && problems.length === 0;
  const reset = () => setConfirmed(false);
  const update = (key: number, patch: Partial<Row>) => { if (locked) return; setRows((rs) => rs.map((r) => r.key === key ? { ...r, ...patch } : r)); reset(); };
  const microItems = micros?.key === contextKey ? micros : undefined;

  const loadRecipe = async (offset: number) => {
    if (!data || recipeBusy) return;
    const key = contextKey; const c = track(); setRecipeBusy(true);
    try {
      const page = await readComposition(productId, c.signal, offset);
      if (c.signal.aborted || epoch.current.key !== key) return;
      // Produto mudou desde a leitura base: não misturar páginas de versões diferentes.
      if (page.produto.updated_at !== data.produto.updated_at) { setError("O produto mudou. Feche e reabra para conferir os dados."); return; }
      setRecipe({ key, value: page });
    } catch { if (!c.signal.aborted && epoch.current.key === key) setError("Não foi possível consultar a receita."); }
    finally { requests.current.delete(c); if (epoch.current.key === key) setRecipeBusy(false); }
  };
  const searchMicros = async (offset: number, query = microSearch) => {
    if (locked) return;
    const key = contextKey; const mine = ++microSeq.current; const c = track();
    try {
      const page = await readActiveMicroorganisms(query, offset, c.signal);
      // Descarta resposta de busca anterior que chegue depois de uma busca nova na mesma época.
      if (!c.signal.aborted && epoch.current.key === key && microSeq.current === mine) setMicros({ key, query, offset, page });
    } catch { if (!c.signal.aborted && epoch.current.key === key && microSeq.current === mine) setError("Não foi possível consultar os microrganismos."); }
    finally { requests.current.delete(c); }
  };
  const submit = async () => {
    if (!data || !valid || !reasonOk || !confirmed || lock.current || !liveRef.current) return;
    const key0 = contextKey;
    const current = () => epoch.current.key === key0 && liveRef.current;
    lock.current = true; setBusy(true); setError("");
    const c = track();
    const items: DeclarationDraft[] = rows.map(({ key: _k, qtyText, microLabel: _m, ...r }) => ({ ...r, quantidade: parseDecimal(qtyText) }));
    const key = metadataRetryKey(scope, JSON.stringify(["composition", productId, data.produto.updated_at, status, items, reason.trim()]));
    try {
      await setComposition(data, status, items, reason, key, c.signal);
      if (!c.signal.aborted && current()) onSaved();
    } catch (failure) {
      if (!c.signal.aborted && current()) setError(failure instanceof Error ? failure.message : "Não foi possível confirmar a composição.");
    } finally {
      requests.current.delete(c);
      if (epoch.current.key === key0) { lock.current = false; setBusy(false); }
    }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto" aria-busy={busy}>
      <DialogHeader>
        <DialogTitle>Composição do produto global</DialogTitle>
        <DialogDescription>Receita de produção e declarações de composição ficam juntas aqui, cada uma com sua origem.
          Composição não é dose, ficha técnica aprovada nem registro regulatório. Nenhum valor é convertido ou calculado.</DialogDescription>
      </DialogHeader>
      <p className="font-medium break-words">{nome}</p>
      {loadError === contextKey && <p role="alert">Não foi possível consultar a composição.</p>}
      {!data && loadError !== contextKey && <p role="status">Carregando…</p>}
      {error && <p role="alert">{error}</p>}
      {data && <>
        <p className="text-sm">Família: <strong>{family ? FAMILY_LABEL[family] : "Pendente de classificação"}</strong>
          {" · "}Declarações: <strong>{data.conjunto ? (data.conjunto.status === "completo" ? "Completas (não equivale a aprovação técnica)" : "Rascunho (incompleto)") : "Não informadas"}</strong></p>
        {versionDrift && <p role="alert">O produto mudou desde a lista. Feche e reabra para editar.</p>}
        {partial && <p role="alert">As declarações não foram carregadas por inteiro; edição bloqueada para não sobrescrever itens não exibidos.</p>}
        <section aria-labelledby="receita-titulo" className="space-y-2">
          <h3 id="receita-titulo" className="font-medium">Receita de produção (origem: formulação existente)</h3>
          <p className="text-sm text-muted-foreground">Somente leitura neste painel. Volumes por litro usados na produção.</p>
          {recipePage && (recipePage.receita.length === 0 ? <p className="text-sm">Sem receita nesta página.</p> : <ul className="space-y-1 text-sm">
            {recipePage.receita.map((r) => <li key={r.formulacao_id} className="break-words">
              {r.micro_nome}{!r.micro_ativo && " (arquivado)"} — {r.volume_ml ?? "—"} mL
              {r.concentracao !== null && ` · concentração ${r.concentracao} ${r.unidade ?? "(unidade não informada)"}`}
              {r.insumo_nome && ` · insumo ${r.insumo_nome}`}</li>)}
          </ul>)}
          {recipePage && (recipePage.receita_offset > 0 || recipePage.receita_has_more) && <nav aria-label="Páginas da receita" className="flex flex-wrap items-center gap-2">
            <p className="text-sm">Receita parcial: itens {recipePage.receita_offset + 1}–{recipePage.receita_offset + recipePage.receita.length}.</p>
            <Button type="button" size="sm" variant="outline" disabled={recipeBusy || busy || recipePage.receita_offset === 0}
              onClick={() => void loadRecipe(Math.max(0, recipePage.receita_offset - RECIPE_PAGE_LIMIT))}>Itens anteriores</Button>
            <Button type="button" size="sm" variant="outline" disabled={recipeBusy || busy || !recipePage.receita_has_more}
              onClick={() => void loadRecipe(recipePage.receita_offset + RECIPE_PAGE_LIMIT)}>Próximos itens</Button>
          </nav>}
        </section>
        <section aria-labelledby="decl-titulo" className="space-y-3">
          <h3 id="decl-titulo" className="font-medium">Declarações de composição (origem: declaração)</h3>
          {family === null && <p role="note" className="rounded-md border p-3 text-sm">Produto sem família: declarações apenas para leitura.
            Classifique a família antes de editar.</p>}
          {rows.length === 0 && <p className="text-sm">Nenhuma declaração.</p>}
          {rows.map((r, i) => <fieldset key={r.key} className="space-y-2 rounded-md border p-3" disabled={locked}>
            <legend className="px-1 text-sm font-medium">Componente {i + 1}</legend>
            <Label htmlFor={`tipo-${r.key}`}>Tipo</Label>
            <select id={`tipo-${r.key}`} className={selectCls} value={r.tipo_componente}
              onChange={(e) => update(r.key, { tipo_componente: e.target.value as Row["tipo_componente"], microrganismo_id: null, microLabel: null, componente_nome: null })}>
              {(family ? FAMILY_COMPONENTS[family] : [r.tipo_componente]).map((t) => <option key={t} value={t}>{COMPONENT_LABEL[t]}</option>)}
            </select>
            {r.tipo_componente === "microrganismo" ? <div className="space-y-2">
              <p className="text-sm">Microrganismo: <strong>{r.microLabel ?? "não selecionado"}</strong></p>
              {microItems && <><Label htmlFor={`micro-${r.key}`}>Escolher do catálogo (ativos)</Label>
                <select id={`micro-${r.key}`} className={selectCls} value={r.microrganismo_id ?? ""}
                  onChange={(e) => { const m = microItems.page.items.find((x) => x.id === e.target.value); if (m) update(r.key, { microrganismo_id: m.id, microLabel: m.nome }); }}>
                  <option value="">Selecione…</option>
                  {microItems.page.items.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.codigo ? ` (${m.codigo})` : ""}</option>)}
                </select></>}
            </div> : <><Label htmlFor={`nome-${r.key}`}>Nome do componente</Label>
              <Input id={`nome-${r.key}`} maxLength={160} value={r.componente_nome ?? ""} onChange={(e) => update(r.key, { componente_nome: e.target.value })} /></>}
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1"><Label htmlFor={`qtd-${r.key}`}>Quantidade</Label>
                <Input id={`qtd-${r.key}`} inputMode="decimal" value={r.qtyText} onChange={(e) => update(r.key, { qtyText: e.target.value, quantidade: parseDecimal(e.target.value) })} /></div>
              <div className="space-y-1"><Label htmlFor={`un-${r.key}`}>Unidade</Label>
                <select id={`un-${r.key}`} className={selectCls} value={r.unidade ?? ""}
                  onChange={(e) => update(r.key, { unidade: (e.target.value || null) as Row["unidade"], base: null })}>
                  <option value="">—</option>{COMPOSITION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor={`base-${r.key}`}>Base</Label>
                <select id={`base-${r.key}`} className={selectCls} value={r.base ?? ""}
                  onChange={(e) => update(r.key, { base: (e.target.value || null) as Row["base"] })}>
                  <option value="">—</option>{COMPOSITION_BASES.filter((b) => !r.unidade || UNIT_BASE[r.unidade] === b)
                    .map((b) => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}</select></div>
            </div>
            <Label htmlFor={`nat-${r.key}`}>Natureza da informação</Label>
            <select id={`nat-${r.key}`} className={selectCls} value={r.natureza}
              onChange={(e) => update(r.key, { natureza: e.target.value as Row["natureza"] })}>
              {NATUREZAS.map((n) => <option key={n} value={n}>{NATUREZA_LABEL[n]}</option>)}</select>
            <Button type="button" variant="outline" size="sm" disabled={locked}
              onClick={() => { if (locked) return; setRows((rs) => rs.filter((x) => x.key !== r.key)); reset(); }}>Remover componente</Button>
          </fieldset>)}
          {canEdit && <div className="flex flex-wrap items-end gap-2">
            <Button type="button" variant="outline" disabled={locked || rows.length >= COMPOSITION_MAX_ITEMS} onClick={() => {
              if (locked || rows.length >= COMPOSITION_MAX_ITEMS) return;
              const t = FAMILY_COMPONENTS[family!][0];
              setRows((rs) => [...rs, { key: ++seq.current, tipo_componente: t, microrganismo_id: null, componente_nome: null, quantidade: null,
                unidade: null, base: null, natureza: "concentracao_declarada", qtyText: "", microLabel: null }]); reset(); }}>
              Adicionar componente</Button>
            {rows.length >= COMPOSITION_MAX_ITEMS && <p className="text-sm">Limite de {COMPOSITION_MAX_ITEMS} componentes.</p>}
            {family === "biologico" && <><div className="min-w-0 flex-1 space-y-1"><Label htmlFor="micro-busca">Buscar microrganismo</Label>
              <Input id="micro-busca" maxLength={120} disabled={locked} value={microSearch} onChange={(e) => setMicroSearch(e.target.value)} /></div>
              <Button type="button" variant="outline" disabled={locked} onClick={() => void searchMicros(0)}>Buscar no catálogo</Button></>}
          </div>}
          {canEdit && microItems && (microItems.offset > 0 || microItems.page.has_more) && <nav aria-label="Páginas de microrganismos" className="flex flex-wrap items-center gap-2">
            <p className="text-sm">Resultados {microItems.offset + 1}–{microItems.offset + microItems.page.items.length} (lista parcial).</p>
            <Button type="button" size="sm" variant="outline" disabled={locked || microItems.offset === 0}
              onClick={() => void searchMicros(Math.max(0, microItems.offset - MICRO_PAGE_LIMIT), microItems.query)}>Anteriores</Button>
            <Button type="button" size="sm" variant="outline" disabled={locked || !microItems.page.has_more || microItems.offset + MICRO_PAGE_LIMIT > MICRO_MAX_OFFSET}
              onClick={() => void searchMicros(microItems.offset + MICRO_PAGE_LIMIT, microItems.query)}>Mais microrganismos</Button>
          </nav>}
        </section>
        {canEdit && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Label htmlFor="comp-status">Situação das declarações</Label>
          <select id="comp-status" className={selectCls} disabled={locked} value={status} onChange={(e) => { setStatus(e.target.value as CompositionStatus); reset(); }}>
            <option value="rascunho">Rascunho (incompleto)</option><option value="completo">Completo (não é aprovação técnica)</option></select>
          {(qtyInvalid || problems.length > 0) && <ul role="alert" className="list-disc pl-5 text-sm">
            {qtyInvalid && <li>Quantidade com formato inválido.</li>}
            {problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <Label htmlFor="comp-reason">Motivo (10 a 500 caracteres)</Label>
          <Textarea id="comp-reason" rows={2} maxLength={500} disabled={locked} value={reason} onChange={(e) => { setReason(e.target.value); reset(); }} />
          <div className="flex items-start gap-2">
            <Checkbox id="comp-confirm" checked={confirmed} disabled={!valid} onCheckedChange={(v) => setConfirmed(v === true)} />
            <Label htmlFor="comp-confirm" className="text-sm font-normal break-words">Confirmo as declarações de “{nome}”. A receita não muda.</Label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-10" disabled={busy} onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="min-h-10 whitespace-normal" disabled={!valid || !reasonOk || !confirmed}>
              {busy ? "Confirmando…" : "Salvar declarações"}</Button>
          </div>
        </form>}
        {!canEdit && <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Fechar</Button></div>}
      </>}
    </DialogContent>
  </Dialog>;
}
