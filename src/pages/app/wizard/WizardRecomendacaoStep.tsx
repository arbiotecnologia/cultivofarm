import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantCatalogScope } from "@/hooks/useTenantCatalogVisibility";
import { TECHNICAL_STALE_REVALIDATION } from "@/hooks/useVisitaWorkspace";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchRecSelection, REC_MICRO_SELECT, REC_PRODUTO_SELECT, recCatalogErrorMessage, recMicroLabel, recProdutoLabel, recReferencedIds, recSelectOptions,
  type RecMicro, type RecProduto,
} from "@/lib/visita/recomendacaoCatalogo";
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
  const scope = useTenantCatalogScope();
  const identity = scope ? `${scope.organizationId}|${scope.userId}|${localRegistroId}|${remoteRegistroId}` : "unready";
  const fence = useRef({ identity, generation: 0 });
  if (fence.current.identity !== identity) fence.current = { identity, generation: fence.current.generation + 1 };
  const generation = fence.current.generation;
  const current = () => fence.current.identity === identity && fence.current.generation === generation;
  const cacheScope = [scope?.organizationId, scope?.userId, generation];
  const [microSearch, setMicroSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [microOffset, setMicroOffset] = useState(0);
  const [prodOffset, setProdOffset] = useState(0);
  useEffect(() => {
    setDialogOpen(false); setEditing(null); setForm(EMPTY_FORM); setPendingRows([]);
    setMicroSearch(""); setProdSearch(""); setMicroOffset(0); setProdOffset(0);
    return () => { fence.current.generation += 1; };
  }, [identity]);

  const { data: remoteRows = [], refetch } = useQuery({
    queryKey: ["wizard-rec", ...cacheScope, remoteRegistroId],
    enabled: !!scope && !!remoteRegistroId,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async ({ signal }) => {
      if (!remoteRegistroId) return [];
      const { data, error } = await supabase
        .from("registros_consultor_recomendacoes")
        .select("*")
        .eq("registro_consultor_id", remoteRegistroId)
        .order("created_at", { ascending: true }).abortSignal(signal);
      if (error) throw error;
      if (!current()) throw new Error("Sessão alterada");
      return data ?? [];
    },
  });

  // RPC autorizada da visita: globais ativos/visíveis, sem gate comercial de catálogo.
  const microSel = useQuery({
    queryKey: ["tenant-catalog", ...cacheScope.slice(0, 2), "visit-selection", generation, remoteRegistroId, "microrganismo", microSearch, microOffset, 50, form.microrganismo_id],
    enabled: !!scope && !!remoteRegistroId && dialogOpen, retry: false,
    queryFn: async ({ signal }) => {
      if (!remoteRegistroId) return [];
      const data = await fetchRecSelection(supabase, remoteRegistroId, "microrganismo", microSearch, microOffset, form.microrganismo_id ? [form.microrganismo_id] : [], signal);
      if (!current()) throw new Error("Sessão alterada");
      return data;
    },
  });
  const prodSel = useQuery({
    queryKey: ["tenant-catalog", ...cacheScope.slice(0, 2), "visit-selection", generation, remoteRegistroId, "produto", prodSearch, prodOffset, 50, form.produto_biologico_sugerido_id],
    enabled: !!scope && !!remoteRegistroId && dialogOpen, retry: false,
    queryFn: async ({ signal }) => {
      if (!remoteRegistroId) return [];
      const data = await fetchRecSelection(supabase, remoteRegistroId, "produto", prodSearch, prodOffset, form.produto_biologico_sugerido_id ? [form.produto_biologico_sugerido_id] : [], signal);
      if (!current()) throw new Error("Sessão alterada");
      return data;
    },
  });
  const microrganismos = (microSel.data ?? []).filter(r => r.selectable).map(r => ({ ...r, nome_cientifico: null }));
  const produtos = (prodSel.data ?? []).filter(r => r.selectable);

  const reloadPending = async () => {
    const data = await getPendingRecomendacoesByRegistro(localRegistroId);
    if (current()) setPendingRows(data);
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
    if (!current()) return;
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

  // Visualização de itens vinculados/históricos: por ID referenciado, sem filtro de ativo.
  const refIds = useMemo(() => recReferencedIds([
    ...rows.map((r) => r.payload),
    { microrganismo_id: form.microrganismo_id, produto_biologico_sugerido_id: form.produto_biologico_sugerido_id },
  ]), [rows, form.microrganismo_id, form.produto_biologico_sugerido_id]);
  const microHist = useQuery({
    queryKey: ["wizard-rec-micro-hist", ...cacheScope, refIds.micro.join(",")],
    enabled: !!scope && refIds.micro.length > 0,
    retry: false,
    queryFn: async ({ signal }): Promise<RecMicro[]> => {
      const { data, error } = await supabase.from("microrganismos").select(REC_MICRO_SELECT).in("id", refIds.micro).abortSignal(signal);
      if (error) throw error;
      if (!current()) throw new Error("Sessão alterada");
      return (data ?? []) as RecMicro[];
    },
  });
  const prodHist = useQuery({
    queryKey: ["wizard-rec-prod-hist", ...cacheScope, refIds.prod.join(",")],
    enabled: !!scope && refIds.prod.length > 0,
    retry: false,
    queryFn: async ({ signal }): Promise<RecProduto[]> => {
      const { data, error } = await supabase.from("produtos").select(REC_PRODUTO_SELECT).in("id", refIds.prod).abortSignal(signal);
      if (error) throw error;
      if (!current()) throw new Error("Sessão alterada");
      return (data ?? []) as RecProduto[];
    },
  });
  const microMap = useMemo(() => new Map((microHist.data ?? []).map((m) => [m.id, m])), [microHist.data]);
  const prodMap = useMemo(() => new Map((prodHist.data ?? []).map((p) => [p.id, p])), [prodHist.data]);
  const microNome = (id: string | null | undefined) =>
    id ? (microMap.get(id) ? recMicroLabel(microMap.get(id)) : microHist.isError ? "Nome indisponível" : "—") : "—";
  const prodNome = (id: string | null | undefined) =>
    id ? (prodMap.get(id) ? recProdutoLabel(prodMap.get(id)) : prodHist.isError ? "Nome indisponível" : "—") : "—";
  const microOpts = recSelectOptions(microrganismos, form.microrganismo_id, microMap);
  const prodOpts = recSelectOptions(produtos, form.produto_biologico_sugerido_id, prodMap);

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
              <Input aria-label="Buscar microrganismo" value={microSearch} onChange={e => { setMicroSearch(e.target.value); setMicroOffset(0); }} />
              <Select
                value={form.microrganismo_id ?? undefined}
                disabled={!microSel.isSuccess || microSel.isFetching}
                onValueChange={(v) => { if (microrganismos.some((m) => m.id === v)) setForm({ ...form, microrganismo_id: v }); }}
              >
                <SelectTrigger><SelectValue placeholder={microSel.isLoading ? "Carregando…" : "Selecione"} /></SelectTrigger>
                <SelectContent>
                  {microOpts.map(({ item, selectable }) => (
                    <SelectItem key={item.id} value={item.id} disabled={!selectable}>
                      {recMicroLabel(item)}{!selectable ? " (indisponível para nova seleção)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-between">
                <Button variant="ghost" size="sm" aria-label="Página anterior de microrganismos" disabled={microOffset === 0 || microSel.isFetching} onClick={() => setMicroOffset(Math.max(0, microOffset - 50))}>Anterior</Button>
                <Button variant="ghost" size="sm" aria-label="Próxima página de microrganismos" disabled={!microSel.isSuccess || microSel.isFetching || microOffset + 50 >= Number(microSel.data?.find(r => r.in_page)?.total ?? 0)} onClick={() => setMicroOffset(microOffset + 50)}>Próxima</Button>
              </div>
              {microSel.isError && <p role="alert" className="text-xs text-destructive">{recCatalogErrorMessage(microSel.error)}</p>}
            </div>

            <div className="space-y-1">
              <Label>Produto sugerido</Label>
              <Input aria-label="Buscar produto" value={prodSearch} onChange={e => { setProdSearch(e.target.value); setProdOffset(0); }} />
              <Select
                value={form.produto_biologico_sugerido_id ?? undefined}
                disabled={!prodSel.isSuccess || prodSel.isFetching}
                onValueChange={(v) => { if (produtos.some((p) => p.id === v)) setForm({ ...form, produto_biologico_sugerido_id: v }); }}
              >
                <SelectTrigger><SelectValue placeholder={prodSel.isLoading ? "Carregando…" : "Selecione"} /></SelectTrigger>
                <SelectContent>
                  {prodOpts.map(({ item, selectable }) => (
                    <SelectItem key={item.id} value={item.id} disabled={!selectable}>
                      {recProdutoLabel(item)}{!selectable ? " (indisponível para nova seleção)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-between">
                <Button variant="ghost" size="sm" aria-label="Página anterior de produtos" disabled={prodOffset === 0 || prodSel.isFetching} onClick={() => setProdOffset(Math.max(0, prodOffset - 50))}>Anterior</Button>
                <Button variant="ghost" size="sm" aria-label="Próxima página de produtos" disabled={!prodSel.isSuccess || prodSel.isFetching || prodOffset + 50 >= Number(prodSel.data?.find(r => r.in_page)?.total ?? 0)} onClick={() => setProdOffset(prodOffset + 50)}>Próxima</Button>
              </div>
              {prodSel.isError && <p role="alert" className="text-xs text-destructive">{recCatalogErrorMessage(prodSel.error)}</p>}
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
