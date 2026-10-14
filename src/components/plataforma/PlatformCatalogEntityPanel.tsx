import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { metadataRetryKey } from "@/lib/catalogo/platformCatalogMetadata";
import { parseDecimal } from "@/lib/catalogo/platformCatalogLifecycle";
import { createEntity, entityFields, ENTITY_PAGE_LIMIT, microTypes, readEntityDetail, readEntityPage, setEntityStatus, updateEntity,
  type EntityDetail, type EntityKind, type EntityValues } from "@/lib/catalogo/platformCatalogEntities";

const labels: Record<EntityKind, { one: string; many: string }> = {
  micro: { one: "microrganismo", many: "microrganismos" },
  cultura: { one: "cultura", many: "culturas" },
};
type Mode = { type: "create" } | { type: "edit"; id: string } | { type: "status"; id: string; ativo: boolean };

/** Lista paginada + criação/edição/arquivamento global. `scope` vem do fence de identidade da aba. */
export function PlatformCatalogEntityPanel({ kind, scope }: { kind: EntityKind; scope: string }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<Mode>();
  const [saved, setSaved] = useState(false);
  const base = `platform-catalog-${kind}`;
  useEffect(() => {
    const other = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === base && q.queryKey[1] !== scope;
    void queryClient.cancelQueries({ predicate: other }); queryClient.removeQueries({ predicate: other });
    return () => { void queryClient.cancelQueries({ queryKey: [base, scope] }); queryClient.removeQueries({ queryKey: [base, scope] }); };
  }, [queryClient, scope, base]);
  const query = useQuery({ queryKey: [base, scope, search, offset], gcTime: 0, staleTime: 0, retry: false,
    queryFn: ({ signal }) => readEntityPage(kind, search, offset, signal) });
  const rows = !query.isFetching && !query.isError ? query.data?.items : undefined;
  const done = () => { setMode(undefined); setSaved(true); void queryClient.invalidateQueries({ queryKey: [base, scope] }); };
  const l = labels[kind];
  return <section aria-label={`Gestão global de ${l.many}`} className="space-y-4">
    {saved && <p role="status">Alteração confirmada.</p>}
    {mode && <EntityDialog key={JSON.stringify(mode)} kind={kind} scope={scope} mode={mode} onClose={() => setMode(undefined)} onSaved={done} />}
    <div className="flex justify-end"><Button className="min-h-10" onClick={() => { setSaved(false); setMode({ type: "create" }); }}>Novo {l.one} global</Button></div>
    <form className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(e) => { e.preventDefault(); setSearch(input.trim()); setOffset(0); }}>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${base}-search`}>Buscar {l.many}</Label>
        <Input id={`${base}-search`} className="w-full" value={input} maxLength={120} onChange={(e) => setInput(e.target.value)} />
      </div>
      <Button type="submit" variant="outline" className="min-h-10"><Search className="mr-2 h-4 w-4" aria-hidden="true" />Buscar</Button>
    </form>
    {query.isFetching && <p role="status" className="py-6 text-muted-foreground">Carregando…</p>}
    {query.isError && <div role="alert" className="space-y-3 py-6">
      <p>Não foi possível consultar {l.many} globais.</p>
      <Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Tentar novamente</Button>
    </div>}
    {rows?.length === 0 && <p role="status" className="py-6 text-muted-foreground">Nenhum item encontrado.</p>}
    {!!rows?.length && <ul className="divide-y rounded-md border">{rows.map((row) => <li key={row.id}
      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 break-words">
        <p className="font-medium">{row.nome}</p>
        <p className="text-sm text-muted-foreground">{row.codigo ?? ""} <Badge variant={row.ativo ? "secondary" : "outline"}>{row.ativo ? "Ativo" : "Inativo"}</Badge></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="min-h-10" aria-label={`Editar ${row.nome}`}
          onClick={() => { setSaved(false); setMode({ type: "edit", id: row.id }); }}>Editar</Button>
        <Button variant="ghost" size="sm" className="min-h-10" aria-label={`${row.ativo ? "Arquivar" : "Reativar"} ${row.nome}`}
          onClick={() => { setSaved(false); setMode({ type: "status", id: row.id, ativo: !row.ativo }); }}>{row.ativo ? "Arquivar" : "Reativar"}</Button>
      </div>
    </li>)}</ul>}
    <nav aria-label={`Paginação de ${l.many}`} className="flex items-center justify-between gap-2">
      <Button variant="outline" size="icon" className="min-h-10" aria-label="Página anterior" disabled={query.isFetching || offset === 0}
        onClick={() => setOffset((v) => Math.max(0, v - ENTITY_PAGE_LIMIT))}><ArrowLeft className="h-4 w-4" /></Button>
      <span aria-live="polite" className="text-sm">Página {offset / ENTITY_PAGE_LIMIT + 1}</span>
      <Button variant="outline" size="icon" className="min-h-10" aria-label="Próxima página" disabled={query.isFetching || query.isError || !query.data?.has_more}
        onClick={() => setOffset((v) => v + ENTITY_PAGE_LIMIT)}><ArrowRight className="h-4 w-4" /></Button>
    </nav>
  </section>;
}

function emptyValues(kind: EntityKind): EntityValues {
  return Object.fromEntries(entityFields[kind].map((f) => [f.name, f.kind === "tipo" ? microTypes[0] : null]));
}

function EntityDialog({ kind, scope, mode, onClose, onSaved }: { kind: EntityKind; scope: string; mode: Mode; onClose(): void; onSaved(): void }) {
  const [detail, setDetail] = useState<EntityDetail>();
  const [values, setValues] = useState<EntityValues>(() => emptyValues(kind));
  const [numText, setNumText] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const controller = useRef<AbortController>();
  const id = mode.type === "create" ? undefined : mode.id;
  useEffect(() => {
    const c = new AbortController(); controller.current = c;
    if (id) readEntityDetail(kind, id, c.signal).then((d) => {
      if (c.signal.aborted) return;
      setDetail(d);
      setValues(Object.fromEntries(entityFields[kind].map((f) => [f.name, d[f.name] ?? null])));
      setNumText(Object.fromEntries(entityFields[kind].filter((f) => f.kind === "number").map((f) => [f.name, d[f.name] == null ? "" : String(d[f.name])])));
    }).catch((e: Error) => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, [kind, id]);
  const l = labels[kind];
  const title = mode.type === "create" ? `Novo ${l.one} global` : mode.type === "edit" ? `Editar ${l.one} global` : `${mode.ativo ? "Reativar" : "Arquivar"} ${l.one} global`;
  const loading = !!id && !detail && !error;
  const submit = async () => {
    if (lock.current || !controller.current) return;
    for (const f of entityFields[kind]) if (f.kind === "number" && Number.isNaN(values[f.name])) { setError(`${f.label}: valor inválido.`); return; }
    lock.current = true; setBusy(true); setError(undefined);
    const signal = controller.current.signal;
    const fingerprint = JSON.stringify([kind, mode, detail?.updated_at, values, reason.trim()]);
    const key = metadataRetryKey(scope, fingerprint);
    try {
      if (mode.type === "create") await createEntity(kind, values, reason, key, signal);
      else if (!detail) throw new Error("Dados do item indisponíveis.");
      else if (mode.type === "edit") await updateEntity(kind, detail, values, reason, key, signal);
      else await setEntityStatus(kind, detail, mode.ativo, reason, key, signal);
      if (!signal.aborted) onSaved();
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error && !("issues" in e) ? e.message : "Confira os campos obrigatórios e o motivo (10 a 500 caracteres).");
    } finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {mode.type === "create" ? "O item nasce inativo, sem preço e fora do B2B. O código é gerado pelo servidor." :
            mode.type === "status" ? "Arquivar não exclui: históricos permanecem preservados." : "Somente os campos permitidos são enviados."}
        </DialogDescription>
      </DialogHeader>
      {loading && <p role="status">Carregando…</p>}
      {mode.type !== "status" && !loading && (mode.type === "create" || detail) && <div className="grid gap-3">
        {entityFields[kind].map((f) => {
          const fid = `entity-${kind}-${f.name}`;
          if (f.kind === "tipo") return <div key={f.name} className="space-y-1">
            <Label htmlFor={fid}>{f.label}</Label>
            <select id={fid} className="h-10 w-full rounded-md border bg-background px-3" value={String(values[f.name] ?? "")}
              disabled={mode.type !== "create"} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
              {microTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>;
          if (f.kind === "boolean") return <div key={f.name} className="space-y-1">
            <Label htmlFor={fid}>{f.label}</Label>
            <select id={fid} className="h-10 w-full rounded-md border bg-background px-3"
              value={values[f.name] === true ? "sim" : values[f.name] === false ? "nao" : ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value === "sim" ? true : e.target.value === "nao" ? false : null }))}>
              <option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option>
            </select>
          </div>;
          if (f.kind === "number") return <div key={f.name} className="space-y-1">
            <Label htmlFor={fid}>{f.label}</Label>
            <Input id={fid} inputMode="decimal" value={numText[f.name] ?? ""} onChange={(e) => {
              const t = e.target.value; setNumText((n) => ({ ...n, [f.name]: t }));
              setValues((v) => ({ ...v, [f.name]: parseDecimal(t) }));
            }} />
          </div>;
          const Comp = f.kind === "longtext" ? Textarea : Input;
          return <div key={f.name} className="space-y-1">
            <Label htmlFor={fid}>{f.label}</Label>
            <Comp id={fid} maxLength={f.max} value={String(values[f.name] ?? "")}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                const t = e.target.value; setValues((v) => ({ ...v, [f.name]: f.required ? t : (t === "" ? null : t) }));
              }} />
          </div>;
        })}
      </div>}
      {mode.type === "status" && detail && <p className="break-words">Item: <strong>{String(detail.nome)}</strong></p>}
      {(mode.type === "create" || detail) && <div className="space-y-1">
        <Label htmlFor={`entity-${kind}-reason`}>Motivo da alteração (10 a 500 caracteres)</Label>
        <Textarea id={`entity-${kind}-reason`} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <DialogFooter className="gap-2">
        <Button variant="outline" className="min-h-10" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button className="min-h-10" disabled={busy || loading || (mode.type !== "create" && !detail)} onClick={() => void submit()}>
          {mode.type === "status" ? (mode.ativo ? "Confirmar reativação" : "Confirmar arquivamento") : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
