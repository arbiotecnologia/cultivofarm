import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { useTenantSelection } from "@/hooks/useTenantCatalogVisibility";
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
  updatePendingCampo,
  type PendingCampo,
} from "@/lib/offlineDb";

type SaveState = "idle" | "saving" | "saved" | "pending_sync" | "error";

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
  const versionRef = useRef(0);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const advanceLock = useRef(false);
  const [advancing, setAdvancing] = useState(false);
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  // Talhões filtrados pelo cliente
  const { data: talhoes } = useQuery({
    queryKey: ["wizard-campo-talhoes", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talhoes")
        .select("id, nome, fazenda_id, fazendas!inner(cliente_id)")
        .eq("fazendas.cliente_id", clienteId ?? "")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Nova seleção de cultura: seletor do servidor (ativas e não ocultas na empresa). A cultura já
  // gravada no formulário vem via include e aparece marcada, sem poder ser escolhida de novo.
  const culturaSel = useTenantSelection("cultura", { limit: 100, include: form.cultura_id ? [form.cultura_id] : [] });
  const culturas = culturaSel.data?.rows;

  // Hidrata: primeiro tenta remoto, depois rascunho local
  useEffect(() => {
    let alive = true;
    (async () => {
      if (hydratedRef.current) return;
      try {
        if (remoteRegistroId) {
          const { data } = await supabase
            .from("visitas_campo" as any)
            .select("*")
            .eq("registro_consultor_id", remoteRegistroId)
            .maybeSingle();
          if (!alive) return;
          if (data) {
            const d = data as any;
            setForm({
              talhao_id: d.talhao_id ?? "",
              cultura_id: d.cultura_id ?? "",
              area_avaliada_ha: d.area_avaliada_ha != null ? String(d.area_avaliada_ha) : "",
              fase_fenologica: d.fase_fenologica ?? "",
              estande_plantas_ha: d.estande_plantas_ha != null ? String(d.estande_plantas_ha) : "",
              uniformidade: (d.uniformidade ?? "") as CampoForm["uniformidade"],
              observacoes_campo: d.observacoes_campo ?? "",
            });
            versionRef.current = d.versao ?? 1;
            setSaveState("saved");
            hydratedRef.current = true;
            return;
          }
        }
        const pending = await getPendingCampoByRegistro(localRegistroId);
        if (!alive) return;
        if (pending) {
          setForm({ ...EMPTY, ...(pending.payload as CampoForm) });
          versionRef.current = pending.versao;
          setSaveState(pending.syncStatus === "synced" ? "saved" : "pending_sync");
        }
        hydratedRef.current = true;
      } catch (err) {
        console.error("hydrate campo error", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [remoteRegistroId, localRegistroId]);

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

  const persist = (next: CampoForm, opts?: { force?: boolean }): Promise<boolean> => {
    // Queue complete snapshots; read the version only when this write begins.
    const run = async (): Promise<boolean> => {
      if (locked || (!opts?.force && !Object.values(next).some(Boolean))) return false;
      setSaveState("saving");
      try {
        const versao = versionRef.current;
        const entry: PendingCampo = {
          localRegistroId, clientUuid: clientUuid ?? undefined,
          remoteRegistroId: remoteRegistroId ?? undefined,
          payload: next, versao, updatedAt: new Date().toISOString(), syncStatus: "pending_sync",
        };
        await savePendingCampo(entry);
        if (!isOnline || !remoteRegistroId) {
          setSaveState("pending_sync");
          return true;
        }
        const { data, error } = await supabase.rpc("rpc_salvar_campo_visita" as never, {
          p_registro_consultor_id: remoteRegistroId, p_client_uuid: clientUuid,
          p_payload: next, p_versao: versao,
        } as never);
        if (error) throw error;
        const res = data as { versao?: number } | null;
        versionRef.current = res?.versao ?? versao + 1;
        await updatePendingCampo(localRegistroId, { syncStatus: "synced", versao: versionRef.current });
        const { removePendingCampo } = await import("@/lib/offlineDb");
        await removePendingCampo(localRegistroId);
        setSaveState("saved");
        await invalidateWizardProgress(queryClient, remoteRegistroId, "campo");
        return true;
      } catch (err) {
        const message = err && typeof err === "object" && "message" in err ? String(err.message) : "Falha ao salvar campo";
        await updatePendingCampo(localRegistroId, { syncStatus: "sync_error", lastSyncError: message }).catch(() => {});
        setSaveState("error");
        toast.error(message);
        return false;
      }
    };
    const task = queueRef.current.then(run, run);
    queueRef.current = task;
    return task;
  };

  const patch = (p: Partial<CampoForm>) => {
    if (advanceLock.current) return;
    const next = { ...form, ...p };
    setForm(next);
    setSaveState("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(next), 1500);
  };

  const handleAdvance = async () => {
    if (advanceLock.current || locked) return;
    if (isEmpty) {
      toast.error("Preencha ao menos um campo antes de avançar");
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    advanceLock.current = true;
    setAdvancing(true);
    try {
      if (await persist(form, { force: true })) onDone();
    } finally {
      advanceLock.current = false;
      setAdvancing(false);
    }
  };

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
        <Select
          value={form.cultura_id || undefined}
          onValueChange={(v) => patch({ cultura_id: v })}
        >
          <SelectTrigger id="cultura"><SelectValue placeholder="Selecione a cultura" /></SelectTrigger>
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
        {culturaSel.data?.hasMore && (
          <p className="text-xs text-muted-foreground">Mostrando as primeiras 100 culturas.</p>
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
        disabled={advancing}
      >
        Salvar e avançar
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </Card>
  );
}
