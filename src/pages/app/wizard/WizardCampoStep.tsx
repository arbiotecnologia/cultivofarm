import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { useTenantSelection } from "@/hooks/useTenantCatalogVisibility";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import {
  CAMPO_CONFLICT_MESSAGE, campoOwnedBy, isCampoConflict, isValidCampoExpected, parseCampoResult, parseCampoRow,
} from "@/lib/visita/campoContract";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, CircleDashed, WifiOff, AlertCircle, Lock, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { invalidateWizardProgress } from "@/lib/visita/invalidateWizardProgress";
import {
  savePendingCampo,
  getPendingCampoByRegistro,
  claimPendingCampo,
  finishPendingCampo,
  discardPendingCampo,
  type CampoClaim,
  type PendingCampo,
} from "@/lib/offlineDb";

const CULTURA_PAGE = 50;

type SaveState = "idle" | "saving" | "saved" | "pending_sync" | "error" | "conflict";

interface Props {
  /** ID local do registro (usado como chave da store offline) */
  localRegistroId: string;
  /** ID remoto (necessário para RPC online); null se ainda pendente de sync */
  remoteRegistroId: string | null;
  clienteId: string | null;
  clientUuid: string | null;
  locked: boolean;
  onDone: () => void;
}

interface CampoForm {
  talhao_id: string;
  cultura_id: string;
  area_avaliada_ha: string;
  fase_fenologica: string;
  estande_plantas_ha: string;
  uniformidade: "" | "baixa" | "media" | "alta";
  observacoes_campo: string;
}

const EMPTY: CampoForm = {
  talhao_id: "",
  cultura_id: "",
  area_avaliada_ha: "",
  fase_fenologica: "",
  estande_plantas_ha: "",
  uniformidade: "",
  observacoes_campo: "",
};

function StatusBadge({ state }: { state: SaveState }) {
  const map: Record<SaveState, { icon: React.ReactNode; label: string; cls: string }> = {
    idle: { icon: <CircleDashed className="h-3.5 w-3.5" />, label: "Rascunho", cls: "text-muted-foreground" },
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "Salvando…", cls: "text-muted-foreground" },
    saved: { icon: <Check className="h-3.5 w-3.5" />, label: "Salvo", cls: "text-emerald-600" },
    pending_sync: { icon: <WifiOff className="h-3.5 w-3.5" />, label: "Pendente de sincronização", cls: "text-amber-600" },
    error: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: "Erro ao salvar", cls: "text-destructive" },
    conflict: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: "Conflito — revise antes de salvar", cls: "text-destructive" },
  };
  const m = map[state];
  return (
    <div className={`flex items-center gap-1 text-xs ${m.cls}`}>
      {m.icon}
      <span>{m.label}</span>
    </div>
  );
}

export default function WizardCampoStep({
  localRegistroId,
  remoteRegistroId,
  clienteId,
  clientUuid,
  locked,
  onDone,
}: Props) {
  const isOnline = useOnlineStatus();
  const [form, setForm] = useState<CampoForm>(EMPTY);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [hydration, setHydration] = useState<"loading" | "ready" | "error">("loading");
  const [inConflict, setInConflict] = useState(false);
  const [review, setReview] = useState<{ serverVersion: number; serverForm: CampoForm } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  // Observed server version (CAS) and exact local snapshot revision; null = not trusted -> no save.
  const observed = useRef<{ version: number | null; revision: string | null }>({ version: null, revision: null });
  const hydrationRef = useRef<"loading" | "ready" | "error">("loading");
  const conflictRef = useRef(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const advanceLock = useRef(false);
  const [advancing, setAdvancing] = useState(false);
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Canonical session fence (actor/tenant/roles/authz epoch/monitor), captured per attempt and
  // re-checked after every await. Server authorization remains mandatory.
  const { user, profile } = useAuth();
  const access = useStorageAccessScope(`wizard-campo:${localRegistroId}:${remoteRegistroId ?? ""}`);
  const owner = access.ready && user?.id && profile?.organization_id
    ? { userId: user.id, organizationId: profile.organization_id as string } : null;
  const fence = useRef({ scope: access.scope, generation: 0 });
  if (fence.current.scope !== access.scope) fence.current = { scope: access.scope, generation: fence.current.generation + 1 };
  const generation = fence.current.generation;
  const mounted = useRef(true);
  const isCurrent = (gen: number) => mounted.current && fence.current.generation === gen;
  const hydratedGen = useRef<number | null>(null);
  const markHydration = (h: "loading" | "ready" | "error") => { hydrationRef.current = h; setHydration(h); };
  const markConflict = (c: boolean) => { conflictRef.current = c; setInConflict(c); };
  useEffect(() => {
    mounted.current = true;
    // New context: drop everything observed under the previous one (form, CAS, queue, timers).
    if (debounceRef.current) clearTimeout(debounceRef.current);
    observed.current = { version: null, revision: null }; queueRef.current = Promise.resolve();
    hydratedGen.current = null; advanceLock.current = false;
    hydrationRef.current = "loading"; conflictRef.current = false;
    setForm(EMPTY); setSaveState("idle"); setHydration("loading"); setInConflict(false); setReview(null);
    setReviewing(false); setAdvancing(false);
    return () => { mounted.current = false; };
  }, [generation]);

  // Talhões filtrados pelo cliente
  const { data: talhoes } = useQuery({
    queryKey: ["wizard-campo-talhoes", clienteId, access.scope],
    enabled: !!clienteId && access.ready,
    queryFn: async () => {
      const fenced = access.capture();
      const { data, error } = await supabase
        .from("talhoes")
        .select("id, nome, fazenda_id, fazendas!inner(cliente_id)")
        .eq("fazendas.cliente_id", clienteId ?? "")
        .order("nome");
      if (!fenced()) throw new Error("fenced_scope");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fresh server lookup of this visit's campo row, keyed by the session scope (no cross-scope cache).
  const remoteQuery = useQuery({
    queryKey: ["wizard-campo-remote", remoteRegistroId, access.scope],
    enabled: !!remoteRegistroId && access.ready,
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async () => {
      const fenced = access.capture();
      if (!remoteRegistroId || !fenced()) throw new Error("fenced_scope");
      const { data, error } = await supabase
        .from("visitas_campo" as never)
        .select("*")
        .eq("registro_consultor_id", remoteRegistroId)
        .maybeSingle();
      if (!fenced()) throw new Error("fenced_scope");
      if (error) throw error;
      return { row: data == null ? null : parseCampoRow(data, remoteRegistroId) };
    },
  });
  const remoteTrusted = !!remoteRegistroId && access.ready && remoteQuery.isSuccess && !remoteQuery.isError
    && remoteQuery.isFetchedAfterMount;
  const remoteFailed = !!remoteRegistroId && (remoteQuery.isError || (!access.ready && hydration !== "loading"));

  // Nova seleção de cultura: seletor do servidor (ativas e não ocultas na empresa). A cultura já
  // gravada no formulário vem via include e aparece marcada, sem poder ser escolhida de novo.
  // Paginado e pesquisável no servidor (sem baixar o catálogo todo).
  const [culturaBusca, setCulturaBusca] = useState("");
  const [culturaBuscaAplicada, setCulturaBuscaAplicada] = useState("");
  const [culturaOffset, setCulturaOffset] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => { setCulturaBuscaAplicada(culturaBusca.trim()); setCulturaOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [culturaBusca]);
  const culturaSel = useTenantSelection("cultura", {
    limit: CULTURA_PAGE, offset: culturaOffset, search: culturaBuscaAplicada,
    include: form.cultura_id ? [form.cultura_id] : [],
  });
  const culturas = culturaSel.isSuccess && !culturaSel.isFetching ? culturaSel.data.rows : undefined;
  const culturaPronta = culturas !== undefined;

  const rowToForm = (d: Record<string, unknown> | null): CampoForm => d ? {
    talhao_id: (d.talhao_id as string) ?? "",
    cultura_id: (d.cultura_id as string) ?? "",
    area_avaliada_ha: d.area_avaliada_ha != null ? String(d.area_avaliada_ha) : "",
    fase_fenologica: (d.fase_fenologica as string) ?? "",
    estande_plantas_ha: d.estande_plantas_ha != null ? String(d.estande_plantas_ha) : "",
    uniformidade: ((d.uniformidade as string) ?? "") as CampoForm["uniformidade"],
    observacoes_campo: (d.observacoes_campo as string) ?? "",
  } : EMPTY;

  // Hidratação: só com sessão pronta e (se houver registro remoto) leitura fresca validada.
  // Erro de leitura (ex. 403) NUNCA cai para rascunho/versão 0: bloqueia e oferece reconsulta.
  useEffect(() => {
    if (hydratedGen.current === generation || !owner) return;
    if (remoteRegistroId && !remoteTrusted) return;
    const gen = generation;
    const live = access.capture();
    hydratedGen.current = gen;
    const ok = () => live() && isCurrent(gen);
    const row = remoteRegistroId ? (remoteQuery.data?.row ?? null) : null;
    const serverVersion = row ? row.versao : 0;
    (async () => {
      try {
        const pending = await getPendingCampoByRegistro(localRegistroId);
        if (!ok()) return;
        const ownedPending = pending && pending.revision && campoOwnedBy(pending, owner) ? pending : null;
        observed.current = { version: serverVersion, revision: ownedPending?.revision ?? null };
        if (ownedPending) {
          setForm({ ...EMPTY, ...(ownedPending.payload as CampoForm) });
          if (ownedPending.versao !== serverVersion || ownedPending.syncStatus === "conflict") {
            markConflict(true); setSaveState("conflict");
          } else {
            setSaveState("pending_sync");
          }
        } else {
          setForm(rowToForm(row));
          setSaveState(row ? "saved" : "idle");
        }
        markHydration("ready");
      } catch (err) {
        if (!ok()) return;
        console.error("hydrate campo error", err);
        observed.current = { version: null, revision: null };
        markHydration("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, remoteTrusted, remoteQuery.dataUpdatedAt, !!owner, remoteRegistroId, localRegistroId]);

  // Read failure (or fenced session) after hydration: hide data/actions until a fresh lookup.
  useEffect(() => {
    if (remoteFailed && hydrationRef.current !== "loading") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [remoteFailed]);

  const isEmpty = useMemo(
    () =>
      !form.talhao_id &&
      !form.cultura_id &&
      !form.area_avaliada_ha &&
      !form.fase_fenologica &&
      !form.estande_plantas_ha &&
      !form.uniformidade &&
      !form.observacoes_campo.trim(),
    [form],
  );

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const canWrite = () => hydrationRef.current === "ready" && !conflictRef.current
    && (!remoteRegistroId || (remoteQuery.isSuccess && !remoteQuery.isError));

  const persist = (next: CampoForm, opts?: { force?: boolean }): Promise<boolean> => {
    // Capture the session fence per attempt; the CAS is read only when this write begins.
    const gen = generation;
    const live = access.capture();
    const ownerSnap = owner;
    const ok = () => live() && isCurrent(gen);
    const run = async (): Promise<boolean> => {
      if (locked || !ownerSnap || !ok() || !canWrite() || (!opts?.force && !Object.values(next).some(Boolean))) return false;
      const versao = observed.current.version;
      if (!isValidCampoExpected(versao)) return false;
      setSaveState("saving");
      let claim: CampoClaim | null = null;
      try {
        const entry: PendingCampo = {
          localRegistroId, clientUuid: clientUuid ?? undefined,
          remoteRegistroId: remoteRegistroId ?? undefined,
          payload: next, versao, updatedAt: new Date().toISOString(), syncStatus: "pending_sync",
          ownerUserId: ownerSnap.userId, ownerOrganizationId: ownerSnap.organizationId,
        };
        const revision = await savePendingCampo(entry);
        if (!ok()) return false;
        observed.current.revision = revision;
        if (!isOnline || !remoteRegistroId) {
          setSaveState("pending_sync");
          return true;
        }
        const claimed = await claimPendingCampo(localRegistroId, revision, ownerSnap);
        if (!ok()) return false;
        if (!claimed) { setSaveState("pending_sync"); return false; } // superseded or held elsewhere
        claim = claimed.claim;
        const { data, error } = await supabase.rpc("rpc_salvar_campo_visita" as never, {
          p_registro_consultor_id: remoteRegistroId, p_client_uuid: clientUuid,
          p_payload: next, p_versao: versao,
        } as never);
        // Late answer of a previous identity/epoch/visit: not adopted (no version, no UI, no cleanup).
        if (!ok()) return false;
        if (error) throw error;
        const env = parseCampoResult(data, versao, remoteRegistroId, clientUuid);
        observed.current.version = env.versao;
        await finishPendingCampo(claim, { remove: true }); // only this exact revision+attempt
        claim = null;
        if (!ok()) return false;
        await invalidateWizardProgress(queryClient, remoteRegistroId, "campo");
        if (!ok()) return false;
        setSaveState("saved");
        return true;
      } catch (err) {
        if (!ok()) return false;
        const conflict = isCampoConflict(err);
        const message = conflict ? CAMPO_CONFLICT_MESSAGE
          : err && typeof err === "object" && "message" in err ? String(err.message) : "Falha ao salvar campo";
        if (claim) await finishPendingCampo(claim, { patch: { syncStatus: conflict ? "conflict" : "sync_error", lastSyncError: message } }).catch(() => false);
        if (!ok()) return false;
        if (conflict) markConflict(true);
        setSaveState(conflict ? "conflict" : "error");
        toast.error(message);
        return false;
      }
    };
    const task = queueRef.current.then(run, run);
    queueRef.current = task;
    return task;
  };

  const patch = (p: Partial<CampoForm>) => {
    if (advanceLock.current || hydrationRef.current !== "ready") return;
    const next = { ...form, ...p };
    setForm(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // After PT409 the draft stays in the form; no automatic requeue until an explicit review.
    if (conflictRef.current) return;
    setSaveState("saving");
    debounceRef.current = setTimeout(() => persist(next), 1500);
  };

  const handleAdvance = async () => {
    if (advanceLock.current || locked || conflictRef.current) return;
    if (isEmpty) {
      toast.error("Preencha ao menos um campo antes de avançar");
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const gen = generation;
    const live = access.capture();
    advanceLock.current = true;
    setAdvancing(true);
    try {
      const saved = await persist(form, { force: true });
      if (saved && live() && isCurrent(gen)) onDone();
    } finally {
      if (isCurrent(gen)) { advanceLock.current = false; setAdvancing(false); }
    }
  };

  // Explicit recovery after PT409/read failure: fresh canonical lookup without reloading the tab.
  const reconsultar = async () => {
    if (!remoteRegistroId || reviewing) return;
    const gen = generation;
    const live = access.capture();
    setReviewing(true);
    try {
      const res = await remoteQuery.refetch();
      if (!live() || !isCurrent(gen)) return;
      if (!res.isSuccess || res.isError || !res.data) return;
      const row = res.data.row;
      if (hydrationRef.current === "ready" && conflictRef.current) {
        setReview({ serverVersion: row ? row.versao : 0, serverForm: rowToForm(row) });
      }
    } finally {
      if (isCurrent(gen)) setReviewing(false);
    }
  };
  const confirmarSobreVersaoAtual = () => {
    if (!review || hydrationRef.current !== "ready") return;
    observed.current.version = review.serverVersion;
    setReview(null); markConflict(false);
    void persist(form, { force: true });
  };
  const usarDadosDoServidor = async () => {
    if (!review) return;
    const gen = generation; const live = access.capture();
    const rev = observed.current.revision;
    if (rev) await discardPendingCampo(localRegistroId, rev).catch(() => false);
    if (!live() || !isCurrent(gen)) return;
    observed.current = { version: review.serverVersion, revision: null };
    setForm(review.serverForm); setReview(null); markConflict(false); setSaveState("saved");
  };

  if ((remoteRegistroId && remoteFailed) || hydration === "error" || (hydration === "ready" && !access.ready)) {
    return (
      <Card className="p-6 space-y-3" role="alert">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">
            {access.ready ? "Não foi possível confirmar os dados de campo atuais desta visita." : "Sessão alterada ou em verificação. Aguarde antes de continuar."}
          </span>
        </div>
        {access.ready && remoteRegistroId && (
          <Button type="button" variant="outline" onClick={() => void reconsultar()} disabled={reviewing}>
            {reviewing ? "Reconsultando…" : "Reconsultar"}
          </Button>
        )}
      </Card>
    );
  }
  if (hydration !== "ready") {
    return (
      <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados de campo…
      </Card>
    );
  }

  if (locked) {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span className="text-sm">Visita finalizada — Etapa Campo em modo leitura.</span>
        </div>
        <dl className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Fase fenológica:</span> {form.fase_fenologica || "—"}</div>
          <div><span className="text-muted-foreground">Área avaliada:</span> {form.area_avaliada_ha || "—"} ha</div>
          <div><span className="text-muted-foreground">Estande:</span> {form.estande_plantas_ha || "—"} pl/ha</div>
          <div><span className="text-muted-foreground">Uniformidade:</span> {form.uniformidade || "—"}</div>
          <div><span className="text-muted-foreground">Observações:</span> {form.observacoes_campo || "—"}</div>
        </dl>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Evidências de campo</h3>
        <StatusBadge state={saveState} />
      </div>

      {inConflict && (
        <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p>{CAMPO_CONFLICT_MESSAGE}</p>
          {!review && remoteRegistroId && (
            <Button type="button" size="sm" variant="outline" onClick={() => void reconsultar()} disabled={reviewing}>
              {reviewing ? "Reconsultando…" : "Reconsultar dados atuais"}
            </Button>
          )}
          {review && (
            <div className="space-y-2">
              <p>Versão atual no servidor: {review.serverVersion}. Fase: {review.serverForm.fase_fenologica || "—"}; observações: {review.serverForm.observacoes_campo || "—"}.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={confirmarSobreVersaoAtual}>Salvar meu rascunho sobre a versão {review.serverVersion}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void usarDadosDoServidor()}>Descartar rascunho e usar dados atuais</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!remoteRegistroId && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          <WifiOff className="h-3.5 w-3.5 mt-0.5" />
          <span>
            A visita ainda não sincronizou. Suas anotações ficam salvas localmente e serão enviadas
            automaticamente quando o registro remoto estiver disponível.
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="talhao">Talhão</Label>
        <Select
          value={form.talhao_id || undefined}
          onValueChange={(v) => patch({ talhao_id: v })}
        >
          <SelectTrigger id="talhao"><SelectValue placeholder="Selecione o talhão" /></SelectTrigger>
          <SelectContent>
            {(talhoes ?? []).map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cultura">Cultura</Label>
        <Input
          aria-label="Buscar cultura" placeholder="Buscar cultura" value={culturaBusca} maxLength={80}
          onChange={(e) => setCulturaBusca(e.target.value)}
        />
        <Select
          value={form.cultura_id || undefined}
          disabled={!culturaPronta}
          onValueChange={(v) => {
            // Nova seleção só a partir de resposta válida do servidor e de item selecionável.
            const row = culturas?.find((c) => c.id === v);
            if (row?.selectable) patch({ cultura_id: v });
          }}
        >
          <SelectTrigger id="cultura"><SelectValue placeholder={culturaPronta ? "Selecione a cultura" : "Carregando culturas…"} /></SelectTrigger>
          <SelectContent>
            {(culturas ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id} disabled={!c.selectable}>
                {c.nome}{!c.selectable ? " (indisponível para nova seleção)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {culturaSel.isError && (
          <p role="alert" className="text-xs text-destructive">
            Não foi possível carregar as culturas: {(culturaSel.error as Error).message}
          </p>
        )}
        {culturaSel.isSuccess && (culturaOffset > 0 || culturaSel.data.hasMore) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Button type="button" size="sm" variant="ghost" disabled={culturaOffset === 0 || culturaSel.isFetching}
              onClick={() => setCulturaOffset((o) => Math.max(0, o - CULTURA_PAGE))}>Anteriores</Button>
            <span>{culturaOffset + 1}–{Math.min(culturaOffset + CULTURA_PAGE, culturaSel.data.total)} de {culturaSel.data.total}</span>
            <Button type="button" size="sm" variant="ghost" disabled={!culturaSel.data.hasMore || culturaSel.isFetching}
              onClick={() => setCulturaOffset((o) => o + CULTURA_PAGE)}>Próximas</Button>
          </div>
        )}
        {culturaSel.isSuccess && culturaSel.data.total === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma cultura disponível{culturaBuscaAplicada ? " para esta busca" : ""}.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="area">Área avaliada (ha)</Label>
          <Input
            id="area" inputMode="decimal" placeholder="0,00"
            value={form.area_avaliada_ha}
            onChange={(e) => patch({ area_avaliada_ha: e.target.value.replace(",", ".") })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="estande">Estande (pl/ha)</Label>
          <Input
            id="estande" inputMode="numeric" placeholder="0"
            value={form.estande_plantas_ha}
            onChange={(e) => patch({ estande_plantas_ha: e.target.value.replace(/\D/g, "") })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fase">Fase fenológica</Label>
        <Input
          id="fase" placeholder="Ex.: V4, R2, florescimento…"
          value={form.fase_fenologica}
          onChange={(e) => patch({ fase_fenologica: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="uniformidade">Uniformidade</Label>
        <Select
          value={form.uniformidade || undefined}
          onValueChange={(v) => patch({ uniformidade: v as CampoForm["uniformidade"] })}
        >
          <SelectTrigger id="uniformidade"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="baixa">Baixa</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="obs">Observações de campo</Label>
        <Textarea
          id="obs" rows={4} placeholder="Sintomas, distribuição, presença de pragas, etc."
          value={form.observacoes_campo}
          onChange={(e) => patch({ observacoes_campo: e.target.value })}
        />
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={handleAdvance}
        disabled={advancing || inConflict}
      >
        Salvar e avançar
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </Card>
  );
}
