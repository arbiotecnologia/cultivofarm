import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";
import { metadataRetryKey } from "@/lib/catalogo/platformCatalogMetadata";
import { parseDecimal, readActiveMicroorganisms, type MicroPage } from "@/lib/catalogo/platformCatalogLifecycle";
import { FAMILY_LABEL } from "@/lib/catalogo/platformCatalogFamily";
import { BASE_LABEL, COMPONENT_LABEL, COMPOSITION_BASES, COMPOSITION_UNITS, FAMILY_COMPONENTS, NATUREZA_LABEL, NATUREZAS,
  UNIT_BASE, readComposition, setComposition, toDraft, validateDeclarations,
  type Composition, type CompositionStatus, type DeclarationDraft } from "@/lib/catalogo/platformCatalogComposition";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = DeclarationDraft & { key: number; qtyText: string; microLabel: string | null };
const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * Painel único de composição de um produto GLOBAL: mostra a receita existente (origem `formulacoes`,
 * somente leitura — o editor atual continua sendo o caminho de edição) e edita apenas declarações
 * que a receita não representa. Fence por produto/versão lida/escopo/vivo.
 */
export function PlatformCatalogCompositionDialog({ productId, nome, scope, onClose, onSaved }:
  { productId: string; nome: string; scope: string; onClose(): void; onSaved(): void }) {
  const access = platformCatalogAccess(useAuth());
  const live = access.ready && access.scope === scope;
  const liveRef = useRef(live); liveRef.current = live;
  const [data, setData] = useState<Composition>();
  const [loadError, setLoadError] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<CompositionStatus>("rascunho");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [microSearch, setMicroSearch] = useState("");
  const [micros, setMicros] = useState<MicroPage["items"]>();
  const lock = useRef(false);
  const seq = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const contextKey = JSON.stringify([productId, data?.produto.updated_at ?? null, scope, live]);
  const epoch = useRef({ key: contextKey, n: 0 });
  if (epoch.current.key !== contextKey) epoch.current = { key: contextKey, n: epoch.current.n + 1 };
  const epochN = epoch.current.n;
  useEffect(() => {
    for (const r of requests.current) r.abort();
    requests.current.clear();
    setReason(""); setConfirmed(false); setError(""); setBusy(false); setMicros(undefined); lock.current = false;
    setRows((data?.declaracoes ?? []).map((d) => ({ ...toDraft(d), key: ++seq.current,
      qtyText: d.quantidade === null ? "" : String(d.quantidade), microLabel: d.micro_nome })));
    setStatus(data?.conjunto?.status ?? "rascunho");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset somente por troca de época
  }, [epochN]);
  useEffect(() => {
    const set = requests.current;
    return () => { for (const r of set) r.abort(); set.clear(); };
  }, []);
  // Leitura: por produto/escopo/vivo (a versão vem da própria leitura). Resposta tardia descartada.
  useEffect(() => {
    if (!live) { setData(undefined); return; }
    const controller = new AbortController();
    setData(undefined); setLoadError(false);
    readComposition(productId, controller.signal)
      .then((c) => { if (!controller.signal.aborted) setData(c); })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [productId, scope, live]);
  if (!live) return null;

  const family = data?.produto.familia_catalogo ?? null;
  const withConc = new Set((data?.receita ?? []).filter((r) => r.concentracao !== null).map((r) => r.microrganismo_id));
  const qtyInvalid = rows.some((r) => r.qtyText.trim() !== "" && Number.isNaN(parseDecimal(r.qtyText)));
  const problems = data ? validateDeclarations(family, status, rows, withConc) : [];
  const reasonOk = reason.trim().length >= 10 && reason.trim().length <= 500;
  const canEdit = !!data && family !== null;
  const valid = canEdit && !busy && !qtyInvalid && problems.length === 0;
  const reset = () => setConfirmed(false);
  const update = (key: number, patch: Partial<Row>) => { setRows((rs) => rs.map((r) => r.key === key ? { ...r, ...patch } : r)); reset(); };

  const searchMicros = async () => {
    const myEpoch = epoch.current.n;
    const c = new AbortController(); requests.current.add(c);
    try {
      const page = await readActiveMicroorganisms(microSearch, 0, c.signal);
      if (!c.signal.aborted && epoch.current.n === myEpoch) setMicros(page.items);
    } catch { if (!c.signal.aborted && epoch.current.n === myEpoch) setError("Não foi possível consultar os microrganismos."); }
    finally { requests.current.delete(c); }
  };
  const submit = async () => {
    if (!data || !valid || !reasonOk || !confirmed || lock.current || !liveRef.current) return;
    const myEpoch = epoch.current.n;
    const current = () => epoch.current.n === myEpoch && liveRef.current;
    lock.current = true; setBusy(true); setError("");
    const c = new AbortController(); requests.current.add(c);
    const items: DeclarationDraft[] = rows.map(({ key: _k, qtyText, microLabel: _m, ...r }) => ({ ...r, quantidade: parseDecimal(qtyText) }));
    const key = metadataRetryKey(scope, JSON.stringify(["composition", productId, data.produto.updated_at, status, items, reason.trim()]));
    try {
      await setComposition(data, status, items, reason, key, c.signal);
      if (!c.signal.aborted && current()) onSaved();
    } catch (failure) {
      if (!c.signal.aborted && current()) setError(failure instanceof Error ? failure.message : "Não foi possível confirmar a composição.");
    } finally {
      requests.current.delete(c);
      if (epoch.current.n === myEpoch) { lock.current = false; setBusy(false); }
    }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto" aria-busy={busy}>
      <DialogHeader>
        <DialogTitle>Composição do produto global</DialogTitle>
        <DialogDescription>Receita de produção e declarações de composição ficam juntas aqui, cada uma com sua origem.
          Composição não é dose, ficha aprovada nem registro regulatório. Nenhum valor é convertido ou calculado.</DialogDescription>
      </DialogHeader>
      <p className="font-medium break-words">{nome}</p>
      {loadError && <p role="alert">Não foi possível consultar a composição.</p>}
      {!data && !loadError && <p role="status">Carregando…</p>}
      {error && <p role="alert">{error}</p>}
      {data && <>
        <p className="text-sm">Família: <strong>{family ? FAMILY_LABEL[family] : "Pendente de classificação"}</strong>
          {" · "}Declarações: <strong>{data.conjunto ? (data.conjunto.status === "completo" ? "Completas" : "Rascunho (incompleto)") : "Não informadas"}</strong></p>
        <section aria-labelledby="receita-titulo" className="space-y-2">
          <h3 id="receita-titulo" className="font-medium">Receita de produção (origem: formulação existente)</h3>
          <p className="text-sm text-muted-foreground">Somente leitura neste painel. Volumes por litro usados na produção; não são teor garantido.</p>
          {data.receita.length === 0 ? <p className="text-sm">Sem receita cadastrada.</p> : <ul className="space-y-1 text-sm">
            {data.receita.map((r) => <li key={r.formulacao_id} className="break-words">
              {r.micro_nome}{!r.micro_ativo && " (arquivado)"} — {r.volume_ml ?? "—"} mL
              {r.concentracao !== null && ` · concentração ${r.concentracao} ${r.unidade ?? "(unidade não informada)"}`}
              {r.insumo_nome && ` · insumo ${r.insumo_nome}`}</li>)}
          </ul>}
          {data.receita_has_more && <p className="text-sm">A receita tem mais itens do que os exibidos.</p>}
        </section>
        <section aria-labelledby="decl-titulo" className="space-y-3">
          <h3 id="decl-titulo" className="font-medium">Declarações de composição (origem: declaração)</h3>
          {family === null && <p role="note" className="rounded-md border p-3 text-sm">Produto sem família: declarações apenas para leitura.
            Classifique a família antes de editar.</p>}
          {rows.length === 0 && <p className="text-sm">Nenhuma declaração.</p>}
          {rows.map((r, i) => <fieldset key={r.key} className="space-y-2 rounded-md border p-3" disabled={!canEdit || busy}>
            <legend className="px-1 text-sm font-medium">Componente {i + 1}</legend>
            <Label htmlFor={`tipo-${r.key}`}>Tipo</Label>
            <select id={`tipo-${r.key}`} className={selectCls} value={r.tipo_componente}
              onChange={(e) => update(r.key, { tipo_componente: e.target.value as Row["tipo_componente"], microrganismo_id: null, microLabel: null,
                componente_nome: null, natureza: e.target.value === "microrganismo" ? "teor_garantido" : r.natureza })}>
              {(family ? FAMILY_COMPONENTS[family] : [r.tipo_componente]).map((t) => <option key={t} value={t}>{COMPONENT_LABEL[t]}</option>)}
            </select>
            {r.tipo_componente === "microrganismo" ? <div className="space-y-2">
              <p className="text-sm">Microrganismo: <strong>{r.microLabel ?? "não selecionado"}</strong></p>
              {micros && <><Label htmlFor={`micro-${r.key}`}>Escolher do catálogo (ativos)</Label>
                <select id={`micro-${r.key}`} className={selectCls} value={r.microrganismo_id ?? ""}
                  onChange={(e) => { const m = micros.find((x) => x.id === e.target.value); update(r.key, { microrganismo_id: m?.id ?? null, microLabel: m?.nome ?? null }); }}>
                  <option value="">Selecione…</option>
                  {micros.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.codigo ? ` (${m.codigo})` : ""}</option>)}
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
            <Label htmlFor={`nat-${r.key}`}>Natureza</Label>
            <select id={`nat-${r.key}`} className={selectCls} value={r.natureza}
              onChange={(e) => update(r.key, { natureza: e.target.value as Row["natureza"] })}>
              {NATUREZAS.filter((n) => r.tipo_componente !== "microrganismo" || n === "teor_garantido")
                .map((n) => <option key={n} value={n}>{NATUREZA_LABEL[n]}</option>)}</select>
            <Button type="button" variant="outline" size="sm" onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); reset(); }}>Remover componente</Button>
          </fieldset>)}
          {canEdit && <div className="flex flex-wrap items-end gap-2">
            <Button type="button" variant="outline" onClick={() => { const t = FAMILY_COMPONENTS[family!][0];
              setRows((rs) => [...rs, { key: ++seq.current, tipo_componente: t, microrganismo_id: null, componente_nome: null, quantidade: null,
                unidade: null, base: null, natureza: t === "microrganismo" ? "teor_garantido" : "concentracao_declarada", qtyText: "", microLabel: null }]); reset(); }}>
              Adicionar componente</Button>
            {family === "biologico" && <><div className="min-w-0 flex-1 space-y-1"><Label htmlFor="micro-busca">Buscar microrganismo</Label>
              <Input id="micro-busca" maxLength={120} value={microSearch} onChange={(e) => setMicroSearch(e.target.value)} /></div>
              <Button type="button" variant="outline" onClick={() => void searchMicros()}>Buscar no catálogo</Button></>}
          </div>}
        </section>
        {canEdit && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Label htmlFor="comp-status">Situação das declarações</Label>
          <select id="comp-status" className={selectCls} value={status} onChange={(e) => { setStatus(e.target.value as CompositionStatus); reset(); }}>
            <option value="rascunho">Rascunho (incompleto)</option><option value="completo">Completo</option></select>
          {(qtyInvalid || problems.length > 0) && <ul role="alert" className="list-disc pl-5 text-sm">
            {qtyInvalid && <li>Quantidade com formato inválido.</li>}
            {problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <Label htmlFor="comp-reason">Motivo (10 a 500 caracteres)</Label>
          <Textarea id="comp-reason" rows={2} maxLength={500} value={reason} onChange={(e) => { setReason(e.target.value); reset(); }} />
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
        {!canEdit && !busy && <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Fechar</Button></div>}
      </>}
    </DialogContent>
  </Dialog>;
}
