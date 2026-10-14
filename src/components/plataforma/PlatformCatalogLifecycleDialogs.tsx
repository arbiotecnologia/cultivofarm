import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";
import { metadataRetryKey } from "@/lib/catalogo/platformCatalogMetadata";
import { createGlobalProduct, createPayloadSchema, legacyProductTypes, MICRO_PAGE_LIMIT, parseDecimal, proporcaoSchema, readActiveMicroorganisms, volumeSchema, setGlobalProductStatus, type CreatePayload, type MicroPage } from "@/lib/catalogo/platformCatalogLifecycle";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const tipoLabels: Record<(typeof legacyProductTypes)[number], string> = {
  inseticida: "Inseticida", fungicida: "Fungicida", solo: "Solo", inoculante: "Inoculante", solubilizador: "Solubilizador",
};

/**
 * Visibility fence: every loss of the exact ready scope bumps an epoch, so the inner
 * form remounts (state cleared, in-flight requests aborted) even if the scope later
 * returns to the same value.
 */
function useScopeEpoch(scope: string) {
  const access = platformCatalogAccess(useAuth());
  const visible = access.ready && access.scope === scope;
  const epoch = useRef(0);
  const wasVisible = useRef(visible);
  if (wasVisible.current && !visible) epoch.current += 1;
  wasVisible.current = visible;
  return { visible, epoch: epoch.current };
}

/** Shared fence: identity/scope must stay identical; aborts in-flight on unmount; synchronous lock blocks double click. */
function useFencedSubmit(scope: string) {
  const access = platformCatalogAccess(useAuth());
  const current = useRef(false);
  current.current = access.ready && access.scope === scope;
  const mounted = useRef(true);
  const lock = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true; const set = requests.current;
    return () => { mounted.current = false; for (const r of set) r.abort(); set.clear(); };
  }, []);
  async function run(task: (signal: AbortSignal) => Promise<unknown>, onDone: () => void) {
    if (lock.current || !mounted.current || !current.current) return;
    lock.current = true; setBusy(true); setError("");
    const controller = new AbortController(); requests.current.add(controller);
    try {
      await task(controller.signal);
      if (mounted.current && current.current && !controller.signal.aborted) onDone();
    } catch (failure) {
      if (mounted.current && current.current && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Não foi possível confirmar a operação.");
    } finally {
      requests.current.delete(controller); lock.current = false;
      if (mounted.current && current.current) setBusy(false);
    }
  }
  return { visible: current.current, busy, error, run };
}

export function PlatformCatalogCreateDialog(props: { scope: string; onClose: () => void; onSaved: () => void }) {
  const { visible, epoch } = useScopeEpoch(props.scope);
  return visible ? <CreateForm key={epoch} {...props} /> : null;
}
function CreateForm({ scope, onClose, onSaved }: { scope: string; onClose: () => void; onSaved: () => void }) {
  const { visible, busy, error, run } = useFencedSubmit(scope);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [dose, setDose] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [rows, setRows] = useState<CompRow[]>([]);
  if (!visible) return null;
  const doseNum = parseDecimal(dose);
  const composicao = rows.map((row) => ({ microrganismo_id: row.id, volume_ml: parseDecimal(row.volume) ?? NaN, proporcao: parseDecimal(row.proporcao) }));
  const payload: CreatePayload | null = (() => {
    const parsed = createPayloadSchema.safeParse({ nome, tipo, descricao: descricao || null, modo_acao: null,
      funcao_completa: null, modo_aplicacao: null, dose_ml_ha: doseNum, composicao });
    return parsed.success ? parsed.data : null;
  })();
  const valid = !!payload && reason.trim().length >= 10 && reason.trim().length <= 500;
  const submit = () => {
    if (!payload || !valid) return;
    const key = metadataRetryKey(scope, JSON.stringify(["create", payload, reason.trim()]));
    void run((signal) => createGlobalProduct(payload, reason, key, signal), onSaved);
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto" aria-busy={busy}>
      <DialogHeader><DialogTitle>Novo produto global</DialogTitle>
        <DialogDescription>O produto é criado inativo e fora do B2B. O código é gerado pelo servidor; preços seguem o cálculo por volumes e não são informados aqui. Outros textos podem ser completados depois em Editar.</DialogDescription>
      </DialogHeader>
      {error && <p role="alert">{error}</p>}
      <form className="min-w-0 space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) setConfirming(true); }}>
        <fieldset disabled={busy || confirming} className="min-w-0 w-full space-y-3">
          <div className="space-y-1.5"><Label htmlFor="create-nome">Nome</Label>
            <Input id="create-nome" required maxLength={500} value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="create-tipo">Tipo de aplicação</Label>
            <select id="create-tipo" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Selecione…</option>
              {legacyProductTypes.map((t) => <option key={t} value={t}>{tipoLabels[t]}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Famílias Químicos e Fertilizantes/Adubos ainda não estão disponíveis.</p></div>
          <div className="space-y-1.5"><Label htmlFor="create-dose">Dose (mL/ha, opcional)</Label>
            <Input id="create-dose" inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="create-descricao">Descrição</Label>
            <Textarea id="create-descricao" rows={2} maxLength={10000} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <CompositionEditor rows={rows} onChange={setRows} />
          <div className="space-y-1.5"><Label htmlFor="create-reason">Motivo (10 a 500 caracteres)</Label>
            <Textarea id="create-reason" required rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </fieldset>
        {!confirming ? <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!valid}>Revisar criação</Button>
        </div> : <div role="group" aria-label="Confirmar criação" className="space-y-2">
          <p>Confirmar criação de “{payload?.nome}” com {rows.length} microrganismo(s) na composição?</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Voltar</Button>
            <Button type="button" disabled={busy} onClick={submit}>{busy ? "Confirmando…" : "Confirmar criação"}</Button>
          </div></div>}
      </form>
    </DialogContent>
  </Dialog>;
}

export function PlatformCatalogStatusDialog(props: {
  scope: string; product: { id: string; nome: string; ativo: boolean; updated_at: string }; onClose: () => void; onSaved: () => void;
}) {
  const { visible, epoch } = useScopeEpoch(props.scope);
  return visible ? <StatusForm key={epoch} {...props} /> : null;
}
function StatusForm({ scope, product, onClose, onSaved }: {
  scope: string; product: { id: string; nome: string; ativo: boolean; updated_at: string }; onClose: () => void; onSaved: () => void;
}) {
  const { visible, busy, error, run } = useFencedSubmit(scope);
  const [reason, setReason] = useState("");
  if (!visible) return null;
  const target = !product.ativo;
  const valid = reason.trim().length >= 10 && reason.trim().length <= 500;
  const submit = () => {
    if (!valid) return;
    const key = metadataRetryKey(scope, JSON.stringify(["status", product.id, product.updated_at, target, reason.trim()]));
    void run((signal) => setGlobalProductStatus(product.id, product.updated_at, target, reason, key, signal), onSaved);
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto" aria-busy={busy}>
      <DialogHeader><DialogTitle>{target ? "Reativar" : "Arquivar"} produto global</DialogTitle>
        <DialogDescription>{target ? "O produto volta a ficar ativo." : "O produto deixa de ficar ativo. Nada é excluído e o histórico é preservado."} Disponibilidade B2B e preços não mudam.</DialogDescription>
      </DialogHeader>
      {error && <p role="alert">{error}</p>}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p className="font-medium break-words">{product.nome}</p>
        <Label htmlFor="status-reason">Motivo (10 a 500 caracteres)</Label>
        <Textarea id="status-reason" required rows={2} maxLength={500} disabled={busy} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !valid}>{busy ? "Confirmando…" : target ? "Confirmar reativação" : "Confirmar arquivamento"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

type CompRow = { id: string; nome: string; codigo: string | null; volume: string; proporcao: string };

/** Seleção de microrganismos ATIVOS via leitor mínimo; descarta respostas tardias por sequência. */
function CompositionEditor({ rows, onChange }: { rows: CompRow[]; onChange: (rows: CompRow[]) => void }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<MicroPage>();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current; const controller = new AbortController();
    setState("loading"); setPage(undefined);
    readActiveMicroorganisms(search, offset, controller.signal)
      .then((data) => { if (id === seq.current && !controller.signal.aborted) { setPage(data); setState("ready"); } })
      .catch(() => { if (id === seq.current && !controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [search, offset]);
  const chosen = new Set(rows.map((r) => r.id));
  const update = (id: string, patch: Partial<CompRow>) => onChange(rows.map((r) => r.id === id ? { ...r, ...patch } : r));
  return <fieldset className="min-w-0 w-full space-y-2 rounded-md border p-3">
    <legend className="max-w-full px-1 text-sm font-medium [overflow-wrap:anywhere]">Composição (microrganismos ativos)</legend>
    {rows.length === 0 && <p className="text-xs text-muted-foreground">Nenhum microrganismo adicionado.</p>}
    {rows.map((row) => {
      const vol = parseDecimal(row.volume); const prop = parseDecimal(row.proporcao);
      const volBad = vol === null || Number.isNaN(vol) || !volumeSchema.safeParse(vol).success;
      const propBad = prop !== null && !proporcaoSchema.safeParse(prop).success;
      return <div key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-b pb-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
        <p className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere] sm:col-span-2">{row.nome}{row.codigo ? ` (${row.codigo})` : ""}</p>
        <div className="min-w-0 space-y-1"><Label className="block [overflow-wrap:anywhere]" htmlFor={`vol-${row.id}`}>Volume (mL) de {row.nome}</Label>
          <Input id={`vol-${row.id}`} inputMode="decimal" required aria-invalid={volBad} value={row.volume} onChange={(e) => update(row.id, { volume: e.target.value })} /></div>
        <div className="min-w-0 space-y-1"><Label className="block [overflow-wrap:anywhere]" htmlFor={`prop-${row.id}`}>Proporção (%) de {row.nome}</Label>
          <Input id={`prop-${row.id}`} inputMode="decimal" aria-invalid={propBad} value={row.proporcao} onChange={(e) => update(row.id, { proporcao: e.target.value })} /></div>
        <Button type="button" variant="ghost" size="sm" className="min-h-10 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-left sm:col-span-2 justify-self-start" onClick={() => onChange(rows.filter((r) => r.id !== row.id))}>Remover {row.nome}</Button>
        {volBad && <p className="text-xs text-destructive sm:col-span-2">Informe volume positivo com até 6 casas decimais.</p>}
        {propBad && <p className="text-xs text-destructive sm:col-span-2">Proporção deve ser maior que 0 e até 100, com até 6 casas.</p>}
      </div>;
    })}
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0 space-y-1"><Label className="block [overflow-wrap:anywhere]" htmlFor="micro-search">Buscar microrganismo</Label>
        <Input id="micro-search" className="w-full" maxLength={120} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setSearch(input.trim()); setOffset(0); } }} /></div>
      <Button type="button" variant="outline" className="min-h-10 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-left" onClick={() => { setSearch(input.trim()); setOffset(0); }}>Buscar microrganismo</Button>
    </div>
    {state === "loading" && <p role="status" className="text-sm text-muted-foreground">Carregando microrganismos…</p>}
    {state === "error" && <p role="alert" className="text-sm">Não foi possível consultar os microrganismos.</p>}
    {state === "ready" && page?.items.length === 0 && <p role="status" className="text-sm text-muted-foreground">Nenhum microrganismo ativo encontrado.</p>}
    {state === "ready" && !!page?.items.length && <ul className="min-w-0 space-y-1">{page.items.map((m) =>
      <li key={m.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{m.nome}{m.codigo ? ` (${m.codigo})` : ""}</span>
        <Button type="button" size="sm" variant="outline" className="min-h-10 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-left" disabled={chosen.has(m.id) || rows.length >= 50}
          onClick={() => onChange([...rows, { id: m.id, nome: m.nome, codigo: m.codigo, volume: "", proporcao: "" }])}>
          {chosen.has(m.id) ? `${m.nome} adicionado` : `Adicionar ${m.nome}`}</Button>
      </li>)}</ul>}
    <nav aria-label="Paginação de microrganismos" className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" className="min-h-10 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-left" disabled={state !== "ready" || offset === 0}
        onClick={() => setOffset((o) => Math.max(0, o - MICRO_PAGE_LIMIT))}>Microrganismos anteriores</Button>
      <Button type="button" variant="outline" size="sm" className="min-h-10 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-left" disabled={state !== "ready" || !page?.has_more}
        onClick={() => setOffset((o) => o + MICRO_PAGE_LIMIT)}>Próximos microrganismos</Button>
    </nav>
  </fieldset>;
}
