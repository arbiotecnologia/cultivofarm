import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TECHNICAL_STALE_REVALIDATION } from "@/hooks/useVisitaWorkspace";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, ChevronRight, WifiOff, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIAS, SEVERIDADES, URGENCIAS, diagnosticoValidationError } from "@/lib/visita/diagnosticoOptions";
import { invalidateWizardProgress } from "@/lib/visita/invalidateWizardProgress";
import {
  savePendingDiagnostico,
  getPendingDiagnosticosByRegistro,
  updatePendingDiagnostico,
  removePendingDiagnostico,
  type PendingDiagnostico,
} from "@/lib/offlineDb";

interface Props {
  localRegistroId: string;
  remoteRegistroId: string | null;
  locked: boolean;
  onDone: () => void;
}

type Form = PendingDiagnostico["payload"];

const EMPTY_FORM: Form = {
  categoria: "",
  problema: "",
  descricao: "",
  severidade: "",
  incidencia: null,
  urgencia: "",
  risco: "",
  intervencao: "",
  localizacao: "",
};

interface Row {
  id: string;            // id remoto ou clientUuid
  clientUuid?: string;
  remoteId?: string | null;
  isPending: boolean;
  payload: Form;
  versao: number;
}

export default function WizardDiagnosticoStep({
  localRegistroId, remoteRegistroId, locked, onDone,
}: Props) {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [pendingRows, setPendingRows] = useState<PendingDiagnostico[]>([]);

  const { data: remoteRows = [], refetch } = useQuery({
    queryKey: ["wizard-diag", remoteRegistroId],
    enabled: !!remoteRegistroId,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visita_diagnosticos")
        .select("*")
        .eq("registro_id", remoteRegistroId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const reloadPending = async () => {
    setPendingRows(await getPendingDiagnosticosByRegistro(localRegistroId));
  };

  useEffect(() => { reloadPending(); /* eslint-disable-next-line */ }, [localRegistroId]);

  // Mescla remoto + pendências (evita duplicar quando pending já sincronizou)
  const rows: Row[] = useMemo(() => {
    const remoteByUuid = new Map<string, any>();
    for (const r of remoteRows as any[]) {
      if (r.client_uuid) remoteByUuid.set(r.client_uuid, r);
    }
    const pendingUuids = new Set(pendingRows.map((p) => p.clientUuid));
    const merged: Row[] = [];
    // Remotos que não têm pendência ativa
    for (const r of remoteRows as any[]) {
      if (r.client_uuid && pendingUuids.has(r.client_uuid)) continue;
      merged.push({
        id: r.id, remoteId: r.id, clientUuid: r.client_uuid, isPending: false,
        payload: {
          categoria: r.categoria, problema: r.problema, descricao: r.descricao,
          severidade: r.severidade, incidencia: r.incidencia, urgencia: r.urgencia,
          risco: r.risco, intervencao: r.intervencao, localizacao: r.localizacao,
        },
        versao: r.versao ?? 1,
      });
    }
    for (const p of pendingRows) {
      if (p.deleted) continue;
      merged.push({
        id: p.clientUuid, clientUuid: p.clientUuid, remoteId: p.remoteId ?? null,
        isPending: true, payload: p.payload, versao: p.versao,
      });
    }
    return merged;
  }, [remoteRows, pendingRows]);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (row: Row) => { setEditing(row); setForm(row.payload); setDialogOpen(true); };

  const save = async () => {
    const validationError = diagnosticoValidationError(form);
    if (validationError) { toast.error(validationError); return; }
    if (!form.problema && !form.descricao) {
      toast.error("Informe ao menos problema ou descrição");
      return;
    }

    const clientUuid = editing?.clientUuid ?? crypto.randomUUID();
    const versao = (editing?.versao ?? 0) + 1;
    const entry: PendingDiagnostico = {
      clientUuid,
      localRegistroId,
      remoteId: editing?.remoteId ?? null,
      payload: form,
      versao,
      updatedAt: new Date().toISOString(),
      syncStatus: "pending_sync",
    };
    await savePendingDiagnostico(entry);

    // Se online e temos remoteRegistroId, tenta persistir imediatamente
    if (isOnline && remoteRegistroId) {
      try {
        const { error } = await supabase.rpc("rpc_upsert_diagnostico_visita" as any, {
          p_registro_id: remoteRegistroId,
          p_client_uuid: clientUuid,
          p_payload: form as any,
          p_expected_versao: versao,
        });
        if (error) throw error;
        await removePendingDiagnostico(clientUuid);
      } catch (err: any) {
        await updatePendingDiagnostico(clientUuid, { syncStatus: "sync_error", lastSyncError: err?.message || "Falha ao salvar" });
        toast.error(err?.message || "Falha ao salvar; ficou pendente de sincronização");
      }
    }

    setDialogOpen(false);
    await reloadPending();
    await refetch();
    if (remoteRegistroId) await invalidateWizardProgress(queryClient, remoteRegistroId, "diag");
  };

  const remove = async (row: Row) => {
    if (!confirm("Remover este diagnóstico?")) return;
    if (row.remoteId && isOnline) {
      const { error } = await supabase.rpc("rpc_delete_diagnostico_visita" as any, { p_id: row.remoteId });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (row.clientUuid) await removePendingDiagnostico(row.clientUuid);
    } else if (row.remoteId) {
      // offline: marca para exclusão
      await savePendingDiagnostico({
        clientUuid: row.clientUuid ?? crypto.randomUUID(),
        localRegistroId,
        remoteId: row.remoteId,
        payload: row.payload,
        versao: row.versao + 1,
        updatedAt: new Date().toISOString(),
        deleted: true,
        syncStatus: "pending_sync",
      });
    } else if (row.clientUuid) {
      await removePendingDiagnostico(row.clientUuid);
    }
    await reloadPending();
    await refetch();
  };

  if (locked) {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span className="text-sm">Visita finalizada — Etapa Diagnóstico em modo leitura.</span>
        </div>
        <ul className="space-y-2 text-sm">
          {rows.length === 0 && <li className="text-muted-foreground">Nenhum diagnóstico registrado.</li>}
          {rows.map((r) => (
            <li key={r.id} className="border-l-2 pl-2">
              <div className="font-medium">{r.payload.problema || "—"}</div>
              <div className="text-xs text-muted-foreground">{r.payload.categoria || "—"} · {r.payload.severidade || "—"}</div>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Diagnósticos</h3>
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>

        {!remoteRegistroId && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
            <WifiOff className="h-3.5 w-3.5 mt-0.5" />
            <span>Diagnósticos ficam pendentes até a visita sincronizar.</span>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum diagnóstico ainda. Toque em "Novo" para adicionar.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="border rounded-md p-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{r.payload.problema || "(sem problema)"}</span>
                    {r.isPending && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        pendente
                      </span>
                    )}
                    {(r.payload.severidade === "alto" || r.payload.severidade === "severo") && (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.payload.categoria || "—"} · sev {r.payload.severidade || "—"} · inc {r.payload.incidencia ?? "—"}%
                  </div>
                  {diagnosticoValidationError(r.payload) && <p role="alert" className="text-xs text-destructive whitespace-normal">{diagnosticoValidationError(r.payload)}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r)} aria-label="Remover">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button
          className="w-full" size="lg"
          disabled={rows.length === 0}
          onClick={onDone}
        >
          Avançar
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar diagnóstico" : "Novo diagnóstico"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {diagnosticoValidationError(form) && <p role="alert" className="text-sm text-destructive">{diagnosticoValidationError(form)}</p>}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="diag-categoria">Categoria</Label>
                <Select value={form.categoria || undefined} onValueChange={(categoria) => setForm({ ...form, categoria })}>
                  <SelectTrigger id="diag-categoria"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Localização</Label>
                <Input
                  value={form.localizacao ?? ""}
                  onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
                  placeholder="Talhão / área"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Problema</Label>
              <Input
                value={form.problema ?? ""}
                onChange={(e) => setForm({ ...form, problema: e.target.value })}
                placeholder="Ex.: Ferrugem asiática"
              />
            </div>

            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                rows={3}
                value={form.descricao ?? ""}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Severidade</Label>
                <Select
                  value={form.severidade || undefined}
                  onValueChange={(v) => setForm({ ...form, severidade: v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {SEVERIDADES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Urgência</Label>
                <Select
                  value={form.urgencia || undefined}
                  onValueChange={(v) => setForm({ ...form, urgencia: v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {URGENCIAS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Incidência %</Label>
                <Input
                  inputMode="numeric" placeholder="0"
                  value={form.incidencia ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setForm({ ...form, incidencia: v ? Number(v) : null });
                  }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Risco</Label>
              <Input
                value={form.risco ?? ""}
                onChange={(e) => setForm({ ...form, risco: e.target.value })}
                placeholder="Impacto potencial"
              />
            </div>

            <div className="space-y-1">
              <Label>Intervenção recomendada</Label>
              <Textarea
                rows={2}
                value={form.intervencao ?? ""}
                onChange={(e) => setForm({ ...form, intervencao: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
