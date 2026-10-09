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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, ChevronRight, WifiOff, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  savePendingRecomendacao,
  getPendingRecomendacoesByRegistro,
  removePendingRecomendacao,
  type PendingRecomendacao,
} from "@/lib/offlineDb";

interface Props {
  localRegistroId: string;
  remoteRegistroId: string | null;
  locked: boolean;
  onDone: () => void;
}

type Form = PendingRecomendacao["payload"];

const EMPTY_FORM: Form = {
  recomendacao_tecnica: "",
  objetivo_recomendacao: "",
  estrategia_manejo: "",
  microrganismo_id: null,
  produto_biologico_sugerido_id: null,
  dose_recomendada_valor: null,
  dose_recomendada_unidade: "",
  volume_calda: "",
  volume_total_recomendado: null,
  numero_aplicacoes: null,
  intervalo_aplicacoes: "",
  modo_aplicacao: "",
  momento_aplicacao: "",
  cuidados_operacionais: "",
  compatibilidade_observacoes: "",
  observacoes_finais: "",
  encaminhar_para_os: false,
};

interface Row {
  id: string;
  clientUuid?: string;
  remoteId?: string | null;
  isPending: boolean;
  payload: Form;
  versao: number;
}

export default function WizardRecomendacaoStep({
  localRegistroId, remoteRegistroId, locked, onDone,
}: Props) {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [pendingRows, setPendingRows] = useState<PendingRecomendacao[]>([]);

  const { data: remoteRows = [], refetch } = useQuery({
    queryKey: ["wizard-rec", remoteRegistroId],
    enabled: !!remoteRegistroId,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_consultor_recomendacoes")
        .select("*")
        .eq("registro_consultor_id", remoteRegistroId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: microrganismos = [] } = useQuery({
    queryKey: ["wizard-rec-microrganismos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("microrganismos")
        .select("id, nome_comum, nome_cientifico")
        .order("nome_comum");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["wizard-rec-produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome_comercial")
        .order("nome_comercial");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reloadPending = async () => {
    setPendingRows(await getPendingRecomendacoesByRegistro(localRegistroId));
  };
  useEffect(() => { reloadPending(); /* eslint-disable-next-line */ }, [localRegistroId]);

  const rows: Row[] = useMemo(() => {
    const pendingUuids = new Set(pendingRows.map((p) => p.clientUuid));
    const merged: Row[] = [];
    for (const r of remoteRows as any[]) {
      if (r.client_uuid && pendingUuids.has(r.client_uuid)) continue;
      merged.push({
        id: r.id, remoteId: r.id, clientUuid: r.client_uuid, isPending: false,
        payload: {
          recomendacao_tecnica: r.recomendacao_tecnica,
          objetivo_recomendacao: r.objetivo_recomendacao,
          estrategia_manejo: r.estrategia_manejo,
          microrganismo_id: r.microrganismo_id,
          produto_biologico_sugerido_id: r.produto_biologico_sugerido_id,
          dose_recomendada_valor: r.dose_recomendada_valor,
          dose_recomendada_unidade: r.dose_recomendada_unidade,
          volume_calda: r.volume_calda,
          volume_total_recomendado: r.volume_total_recomendado,
          numero_aplicacoes: r.numero_aplicacoes,
          intervalo_aplicacoes: r.intervalo_aplicacoes,
          modo_aplicacao: r.modo_aplicacao,
          momento_aplicacao: r.momento_aplicacao,
          cuidados_operacionais: r.cuidados_operacionais,
          compatibilidade_observacoes: r.compatibilidade_observacoes,
          observacoes_finais: r.observacoes_finais,
          encaminhar_para_os: r.encaminhar_para_os,
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
    if (!form.recomendacao_tecnica?.trim()) {
      toast.error("Informe a recomendação técnica");
      return;
    }
    const clientUuid = editing?.clientUuid ?? crypto.randomUUID();
    const versao = (editing?.versao ?? 0) + 1;
    const entry: PendingRecomendacao = {
      clientUuid, localRegistroId, remoteId: editing?.remoteId ?? null,
      payload: form, versao, updatedAt: new Date().toISOString(),
      syncStatus: "pending_sync",
    };
    await savePendingRecomendacao(entry);

    if (isOnline && remoteRegistroId) {
      try {
        const { error } = await supabase.rpc("rpc_upsert_recomendacao_visita" as any, {
          p_registro_id: remoteRegistroId,
          p_client_uuid: clientUuid,
          p_payload: form as any,
          p_expected_versao: versao,
        });
        if (error) throw error;
        await removePendingRecomendacao(clientUuid);
      } catch (err: any) {
        toast.error(err?.message || "Falha ao salvar; ficou pendente de sincronização");
      }
    }
    setDialogOpen(false);
    await reloadPending();
    await refetch();
    queryClient.invalidateQueries({ queryKey: ["wizard-rec-flag", remoteRegistroId] });
  };

  const remove = async (row: Row) => {
    if (!confirm("Remover esta recomendação?")) return;
    if (row.remoteId && isOnline) {
      const { error } = await supabase.rpc("rpc_delete_recomendacao_visita" as any, { p_id: row.remoteId });
      if (error) { toast.error(error.message); return; }
      if (row.clientUuid) await removePendingRecomendacao(row.clientUuid);
    } else if (row.remoteId) {
      await savePendingRecomendacao({
        clientUuid: row.clientUuid ?? crypto.randomUUID(),
        localRegistroId, remoteId: row.remoteId, payload: row.payload,
        versao: row.versao + 1, updatedAt: new Date().toISOString(),
        deleted: true, syncStatus: "pending_sync",
      });
    } else if (row.clientUuid) {
      await removePendingRecomendacao(row.clientUuid);
    }
    await reloadPending();
    await refetch();
  };

  const microNome = (id: string | null | undefined) =>
    (microrganismos as any[]).find((m) => m.id === id)?.nome_comum || "—";
  const prodNome = (id: string | null | undefined) =>
    (produtos as any[]).find((p) => p.id === id)?.nome_comercial || "—";

  if (locked) {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span className="text-sm">Visita finalizada — Etapa Recomendação em modo leitura.</span>
        </div>
        <ul className="space-y-2 text-sm">
          {rows.length === 0 && <li className="text-muted-foreground">Nenhuma recomendação registrada.</li>}
          {rows.map((r) => (
            <li key={r.id} className="border-l-2 pl-2">
              <div className="font-medium">{r.payload.recomendacao_tecnica || "—"}</div>
              <div className="text-xs text-muted-foreground">
                {microNome(r.payload.microrganismo_id)} · {r.payload.dose_recomendada_valor ?? "—"} {r.payload.dose_recomendada_unidade || ""}
              </div>
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
          <h3 className="text-sm font-semibold">Recomendações técnicas</h3>
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Nova
          </Button>
        </div>

        {!remoteRegistroId && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
            <WifiOff className="h-3.5 w-3.5 mt-0.5" />
            <span>Recomendações ficam pendentes até a visita sincronizar.</span>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma recomendação ainda. Toque em "Nova" para adicionar.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="border rounded-md p-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {r.payload.recomendacao_tecnica || "(sem descrição)"}
                    </span>
                    {r.isPending && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        pendente
                      </span>
                    )}
                    {r.payload.encaminhar_para_os && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        → OS
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {microNome(r.payload.microrganismo_id)} · {prodNome(r.payload.produto_biologico_sugerido_id)}
                    {r.payload.dose_recomendada_valor != null && (
                      <> · {r.payload.dose_recomendada_valor} {r.payload.dose_recomendada_unidade || ""}</>
                    )}
                  </div>
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

        <Button className="w-full" size="lg" disabled={rows.length === 0} onClick={onDone}>
          Avançar
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar recomendação" : "Nova recomendação"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Recomendação técnica *</Label>
              <Textarea
                rows={3}
                value={form.recomendacao_tecnica ?? ""}
                onChange={(e) => setForm({ ...form, recomendacao_tecnica: e.target.value })}
                placeholder="Descreva a intervenção recomendada"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Objetivo</Label>
                <Input
                  value={form.objetivo_recomendacao ?? ""}
                  onChange={(e) => setForm({ ...form, objetivo_recomendacao: e.target.value })}
                  placeholder="controle_praga…"
                />
              </div>
              <div className="space-y-1">
                <Label>Estratégia</Label>
                <Input
                  value={form.estrategia_manejo ?? ""}
                  onChange={(e) => setForm({ ...form, estrategia_manejo: e.target.value })}
                  placeholder="preventivo/curativo…"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Microrganismo</Label>
              <Select
                value={form.microrganismo_id ?? undefined}
                onValueChange={(v) => setForm({ ...form, microrganismo_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(microrganismos as any[]).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome_comum}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Produto biológico sugerido</Label>
              <Select
                value={form.produto_biologico_sugerido_id ?? undefined}
                onValueChange={(v) => setForm({ ...form, produto_biologico_sugerido_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(produtos as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome_comercial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Dose</Label>
                <Input
                  inputMode="decimal" placeholder="0"
                  value={form.dose_recomendada_valor ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(",", ".");
                    setForm({ ...form, dose_recomendada_valor: v ? Number(v) : null });
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>Unidade</Label>
                <Input
                  value={form.dose_recomendada_unidade ?? ""}
                  onChange={(e) => setForm({ ...form, dose_recomendada_unidade: e.target.value })}
                  placeholder="mL/ha"
                />
              </div>
              <div className="space-y-1">
                <Label>Nº aplic.</Label>
                <Input
                  inputMode="numeric" placeholder="1"
                  value={form.numero_aplicacoes ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setForm({ ...form, numero_aplicacoes: v ? Number(v) : null });
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Volume calda</Label>
                <Input
                  value={form.volume_calda ?? ""}
                  onChange={(e) => setForm({ ...form, volume_calda: e.target.value })}
                  placeholder="ex.: 150 L/ha"
                />
              </div>
              <div className="space-y-1">
                <Label>Intervalo</Label>
                <Input
                  value={form.intervalo_aplicacoes ?? ""}
                  onChange={(e) => setForm({ ...form, intervalo_aplicacoes: e.target.value })}
                  placeholder="ex.: 7 dias"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Modo aplicação</Label>
                <Input
                  value={form.modo_aplicacao ?? ""}
                  onChange={(e) => setForm({ ...form, modo_aplicacao: e.target.value })}
                  placeholder="pulverizacao…"
                />
              </div>
              <div className="space-y-1">
                <Label>Momento</Label>
                <Input
                  value={form.momento_aplicacao ?? ""}
                  onChange={(e) => setForm({ ...form, momento_aplicacao: e.target.value })}
                  placeholder="V4, R2…"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Cuidados operacionais</Label>
              <Textarea
                rows={2}
                value={form.cuidados_operacionais ?? ""}
                onChange={(e) => setForm({ ...form, cuidados_operacionais: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label>Compatibilidade / observações</Label>
              <Textarea
                rows={2}
                value={form.compatibilidade_observacoes ?? ""}
                onChange={(e) => setForm({ ...form, compatibilidade_observacoes: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label>Observações finais</Label>
              <Textarea
                rows={2}
                value={form.observacoes_finais ?? ""}
                onChange={(e) => setForm({ ...form, observacoes_finais: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <Label htmlFor="os" className="text-sm">Encaminhar para OS</Label>
                <p className="text-xs text-muted-foreground">Gera ordem de serviço on-farm</p>
              </div>
              <Switch
                id="os"
                checked={!!form.encaminhar_para_os}
                onCheckedChange={(v) => setForm({ ...form, encaminhar_para_os: v })}
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
