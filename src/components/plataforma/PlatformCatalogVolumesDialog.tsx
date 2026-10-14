import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { metadataRetryKey } from "@/lib/catalogo/platformCatalogMetadata";
import { createVolume, fmtBrl, parseDecimalText, readVolumePage, setVolumeStatus, updateVolume, VOLUME_PAGE_LIMIT,
  VolumeConfirmationRequired, type ParentPricing, type VolumeItemTipo, type VolumeRow } from "@/lib/catalogo/platformCatalogVolumes";

type Mode = { type: "create" } | { type: "edit"; row: VolumeRow } | { type: "status"; row: VolumeRow; ativo: boolean };

/** Apresentações globais de um item (SA). `scope` = fence de identidade da aba; trocar identidade descarta cache. */
export function PlatformCatalogVolumesDialog({ tipo, itemId, nome, scope, onClose }:
  { tipo: VolumeItemTipo; itemId: string; nome: string; scope: string; onClose(): void }) {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<Mode>();
  const [saved, setSaved] = useState(false);
  const base = "platform-catalog-volumes";
  useEffect(() => {
    const other = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === base && q.queryKey[1] !== scope;
    void queryClient.cancelQueries({ predicate: other }); queryClient.removeQueries({ predicate: other });
    return () => { void queryClient.cancelQueries({ queryKey: [base, scope] }); queryClient.removeQueries({ queryKey: [base, scope] }); };
  }, [queryClient, scope]);
  const query = useQuery({ queryKey: [base, scope, tipo, itemId, offset], gcTime: 0, staleTime: 0, retry: false,
    queryFn: ({ signal }) => readVolumePage(tipo, itemId, offset, signal) });
  const page = !query.isFetching && !query.isError ? query.data : undefined;
  const done = () => { setMode(undefined); setSaved(true); void queryClient.invalidateQueries({ queryKey: [base, scope, tipo, itemId] }); };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="break-words">Apresentações de {nome}</DialogTitle>
        <DialogDescription>Preço por litro, dose de 100 mL e doses são calculados pelo servidor. Novas apresentações nascem inativas.</DialogDescription>
      </DialogHeader>
      {saved && <p role="status">Alteração confirmada.</p>}
      {mode && <VolumeForm key={JSON.stringify([scope, tipo, itemId, mode])} tipo={tipo} itemId={itemId} scope={scope} mode={mode}
        onClose={() => setMode(undefined)} onSaved={done} />}
      {!mode && <>
        {page && <PricingSummary pricing={page.item.pricing} tipo={tipo} />}
        <div className="flex justify-end"><Button className="min-h-10" disabled={!page}
          onClick={() => { setSaved(false); setMode({ type: "create" }); }}>Nova apresentação</Button></div>
        {query.isFetching && <p role="status" className="py-4 text-muted-foreground">Carregando…</p>}
        {query.isError && <div role="alert" className="space-y-3 py-4">
          <p>Não foi possível consultar as apresentações.</p>
          <Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Tentar novamente</Button>
        </div>}
        {page?.items.length === 0 && <p role="status" className="py-4 text-muted-foreground">Nenhuma apresentação cadastrada.</p>}
        {!!page?.items.length && <ul className="divide-y rounded-md border">{page.items.map((v) => {
          const label = v.rotulo || `${v.volume_ml} mL`;
          return <li key={v.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 break-words text-sm">
              <div className="font-medium">{label} <Badge variant={v.ativo ? "secondary" : "outline"}>{v.ativo ? "Ativa" : "Inativa"}</Badge></div>
              <p className="text-muted-foreground">{v.volume_ml} mL · {fmtBrl(v.preco_brl)} · {fmtBrl(v.preco_litro_brl)}/L · {fmtBrl(v.valor_dose_100ml_brl)}/100 mL · {v.doses_por_volume ?? "—"} doses</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="min-h-10" aria-label={`Editar ${label}`}
                onClick={() => { setSaved(false); setMode({ type: "edit", row: v }); }}>Editar</Button>
              <Button variant="ghost" size="sm" className="min-h-10" aria-label={`${v.ativo ? "Arquivar" : "Ativar"} ${label}`}
                onClick={() => { setSaved(false); setMode({ type: "status", row: v, ativo: !v.ativo }); }}>{v.ativo ? "Arquivar" : "Ativar"}</Button>
            </div>
          </li>;
        })}</ul>}
        <nav aria-label="Paginação de apresentações" className="flex items-center justify-between gap-2">
          <Button variant="outline" size="icon" className="min-h-10" aria-label="Página anterior" disabled={query.isFetching || offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - VOLUME_PAGE_LIMIT))}><ArrowLeft className="h-4 w-4" /></Button>
          <span aria-live="polite" className="text-sm">Página {offset / VOLUME_PAGE_LIMIT + 1}</span>
          <Button variant="outline" size="icon" className="min-h-10" aria-label="Próxima página" disabled={query.isFetching || query.isError || !query.data?.has_more}
            onClick={() => setOffset((o) => o + VOLUME_PAGE_LIMIT)}><ArrowRight className="h-4 w-4" /></Button>
        </nav>
      </>}
    </DialogContent>
  </Dialog>;
}

function PricingSummary({ pricing, tipo }: { pricing: ParentPricing; tipo: VolumeItemTipo }) {
  return <p className="break-words rounded-md border p-3 text-sm">
    Preço vigente do item: {fmtBrl(pricing.valor_litro_brl)}/L · dose {fmtBrl(pricing.valor_dose_brl)}
    {tipo === "produto" ? ` · ha ${fmtBrl(pricing.valor_ha_brl)}` : ""}
  </p>;
}

function VolumeForm({ tipo, itemId, scope, mode, onClose, onSaved }:
  { tipo: VolumeItemTipo; itemId: string; scope: string; mode: Mode; onClose(): void; onSaved(): void }) {
  const row = mode.type === "create" ? undefined : mode.row;
  const [vol, setVol] = useState(row?.volume_ml ?? "");
  const [preco, setPreco] = useState(row?.preco_brl ?? "");
  const [rotulo, setRotulo] = useState(row?.rotulo ?? "");
  const [ordem, setOrdem] = useState(String(row?.ordem ?? 0));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  // Prévia do servidor vinculada ao estado revisado (`sig`). Qualquer mudança de campo/motivo/identidade/item a invalida.
  const [preview, setPreview] = useState<{ p: VolumeConfirmationRequired; sig: string }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => () => controller.current.abort(), []);
  const sig = JSON.stringify([scope, tipo, itemId, mode.type, row?.id, row?.updated_at, mode.type === "status" ? mode.ativo : null,
    vol, preco, rotulo, ordem, reason]);
  const live = preview && preview.sig === sig ? preview.p : undefined;
  useEffect(() => { if (preview && preview.sig !== sig) { setPreview(undefined); setConfirm(false); } }, [preview, sig]);
  const edit = (set: (v: string) => void) => (e: { target: { value: string } }) => { set(e.target.value); setConfirm(false); };
  const submit = async () => {
    if (lock.current) return;
    setError(undefined);
    let values;
    if (mode.type !== "status") {
      const v = parseDecimalText(vol, "volume"); const p = parseDecimalText(preco, "preco");
      const o = /^\d{1,4}$/.test(ordem.trim()) ? Number(ordem.trim()) : NaN;
      if (!v) { setError("Volume (mL): valor positivo até 1.000.000, com até 3 casas decimais."); return; }
      if (!p) { setError("Preço (R$): valor positivo com até 2 casas decimais."); return; }
      if (Number.isNaN(o)) { setError("Ordem: número inteiro de 0 a 9999."); return; }
      values = { volume_ml: v, preco_brl: p, rotulo: rotulo.trim() === "" ? null : rotulo.trim().slice(0, 60), ordem: o };
    }
    // Primeira tentativa: sem token => servidor devolve prévia (nada persiste). Confirmação só com prévia vigente + checkbox.
    if (live && !confirm) { setError("Marque a confirmação do efeito comercial para continuar."); return; }
    const token = live ? live.token : null;
    lock.current = true; setBusy(true);
    const signal = controller.current.signal;
    const key = metadataRetryKey(scope, JSON.stringify(["volume", tipo, itemId, mode.type, row?.id, row?.updated_at, values,
      mode.type === "status" ? mode.ativo : null, token, reason.trim()]));
    try {
      if (mode.type === "create") await createVolume(tipo, itemId, values!, reason, key, signal);
      else if (mode.type === "edit") await updateVolume(mode.row, values!, token, live?.repriced ?? false, reason, key, signal);
      else await setVolumeStatus(mode.row, mode.ativo, token, live?.repriced ?? false, reason, key, signal);
      if (!signal.aborted) onSaved();
    } catch (e) {
      if (signal.aborted) return;
      setConfirm(false);
      if (e instanceof VolumeConfirmationRequired) { setPreview({ p: e, sig }); setError(undefined); }
      else {
        if (token) setPreview(undefined);
        setError(e instanceof Error && !("issues" in e) ? e.message : "Confira os campos e o motivo (10 a 500 caracteres).");
      }
    } finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  };
  const title = mode.type === "create" ? "Nova apresentação" : mode.type === "edit" ? "Editar apresentação" : mode.ativo ? "Ativar apresentação" : "Arquivar apresentação";
  const action = live ? "Confirmar alteração" : mode.type === "create" ? "Salvar"
    : mode.type === "edit" ? "Revisar e salvar" : mode.ativo ? "Revisar ativação" : "Revisar arquivamento";
  const ha = tipo === "produto";
  return <section aria-label={title} className="space-y-3">
    <h3 className="font-semibold">{title}</h3>
    {mode.type === "status" && <p className="text-sm">{mode.ativo
      ? "Ativar pode alterar o preço por litro e por dose do item. Com preços por litro diferentes entre apresentações ativas, o preço do item fica sem valor."
      : "Arquivar não exclui. Se for a última ativa, o item mantém o último preço sincronizado."}</p>}
    {mode.type !== "status" && <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1"><Label htmlFor="vol-ml">Volume (mL)</Label>
        <Input id="vol-ml" inputMode="decimal" value={vol} onChange={edit(setVol)} /></div>
      <div className="min-w-0 space-y-1"><Label htmlFor="vol-preco">Preço da apresentação (R$)</Label>
        <Input id="vol-preco" inputMode="decimal" value={preco} onChange={edit(setPreco)} /></div>
      <div className="min-w-0 space-y-1"><Label htmlFor="vol-rotulo">Rótulo (opcional)</Label>
        <Input id="vol-rotulo" maxLength={60} value={rotulo} onChange={edit(setRotulo)} /></div>
      <div className="min-w-0 space-y-1"><Label htmlFor="vol-ordem">Ordem</Label>
        <Input id="vol-ordem" inputMode="numeric" value={ordem} onChange={edit(setOrdem)} /></div>
    </fieldset>}
    {live && <div role="note" aria-label="Prévia do servidor" className="break-words rounded-md border p-3 text-sm space-y-1">
      <p className="font-medium">{live.repriced ? "Prévia: o preço do item será alterado." : "Prévia: alteração em apresentação ativa, sem mudança no preço do item."}</p>
      <p>Antes: {fmtBrl(live.before.valor_litro_brl)}/L · dose {fmtBrl(live.before.valor_dose_brl)}{ha ? ` · ha ${fmtBrl(live.before.valor_ha_brl)}` : ""}</p>
      <p>Depois: {fmtBrl(live.after.valor_litro_brl)}/L · dose {fmtBrl(live.after.valor_dose_brl)}{ha ? ` · ha ${fmtBrl(live.after.valor_ha_brl)}` : ""}</p>
      <p className="text-muted-foreground">Nada foi gravado ainda. Alterar qualquer campo ou o motivo descarta esta prévia.</p>
    </div>}
    <div className="space-y-1"><Label htmlFor="vol-reason">Motivo da alteração (10 a 500 caracteres)</Label>
      <Textarea id="vol-reason" disabled={busy} maxLength={500} value={reason} onChange={edit(setReason)} /></div>
    {live && <div className="flex items-start gap-2">
      <Checkbox id="vol-confirm" disabled={busy} checked={confirm} onCheckedChange={(c) => setConfirm(c === true)} />
      <Label htmlFor="vol-confirm" className="leading-snug">Confirmo o efeito comercial desta alteração no catálogo global.</Label>
    </div>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <DialogFooter className="gap-2">
      <Button variant="outline" className="min-h-10" disabled={busy} onClick={onClose}>Voltar</Button>
      <Button className="min-h-10" disabled={busy} onClick={() => void submit()}>{action}</Button>
    </DialogFooter>
  </section>;
}
