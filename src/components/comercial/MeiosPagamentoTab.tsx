import { useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METHOD_KINDS, METHOD_KIND_LABEL, type MethodKind } from "@/hooks/useB2BPaymentMethodOptions";
import {
  MAX_INSTALLMENTS, methodAdminError, useB2BPaymentMethodAdmin, useSaveB2BPaymentMethodConfig, useSetB2BPaymentMethodActivation,
  validateConfig, type Activation, type MethodConfig, type SaveConfigInput,
} from "@/hooks/useB2BPaymentMethodAdmin";

type Draft = { planId: string; kind: MethodKind; pmId: string; due: string; max: string; rate: string; status: "active" | "revoked" };
const EMPTY: Draft = { planId: "", kind: "pix", pmId: "", due: "", max: "1", rate: "", status: "active" };
const MODE_LABEL: Record<Activation["mode"], string> = { off: "Desligada", pilot: "Piloto", enforced: "Obrigatória" };

/**
 * Meios de pagamento por condição (B2B_PAYMENT_METHOD_V1). Empresa sempre derivada no servidor; nada é gravado sem
 * clique explícito, conflitos de versão mantêm o rascunho e nunca tentam de novo sozinhos. Nenhuma taxa é sugerida.
 */
export function MeiosPagamentoTab() {
  const q = useB2BPaymentMethodAdmin();
  const save = useSaveB2BPaymentMethodConfig();
  const act = useSetB2BPaymentMethodActivation();
  const [editing, setEditing] = useState<MethodConfig | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pilot, setPilot] = useState<string[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const d = q.data?.status === "ok" ? q.data.data : null;
  const planById = useMemo(() => new Map((d?.plans ?? []).map((p) => [p.id, p])), [d]);
  const pmName = useMemo(() => new Map((d?.catalog ?? []).map((m) => [m.id, m.name])), [d]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando meios de pagamento…</p>;
  if (q.data?.status === "not_installed")
    return <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Meios de pagamento por condição ainda não estão disponíveis neste ambiente. O pedido segue o contrato atual.</AlertDescription></Alert>;
  if (q.isError || !d)
    return (
      <Alert variant="destructive" role="alert" data-testid="pm-admin-error">
        <AlertDescription className="space-y-2">
          <p>Não foi possível carregar a configuração de meios de pagamento.</p>
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Tentar carregar novamente</Button>
        </AlertDescription>
      </Alert>
    );

  const startEdit = (c: MethodConfig | null) => {
    setFormError(null); setEditing(c);
    setDraft(c ? { planId: c.payment_plan_id, kind: c.method_kind, pmId: c.payment_method_id, due: String(c.due_days), max: String(c.max_installments),
      rate: c.price_monthly_rate_percent == null ? "" : String(c.price_monthly_rate_percent), status: c.status } : EMPTY);
  };
  const submit = () => {
    const input: SaveConfigInput = {
      config_id: editing?.id ?? null, payment_plan_id: draft.planId, method_kind: draft.kind, payment_method_id: draft.pmId,
      due_days: Number(draft.due), max_installments: Number(draft.max), price_monthly_rate_percent: draft.rate.trim() === "" ? null : Number(draft.rate.replace(",", ".")),
      status: draft.status, expected_version: editing?.version ?? 0,
    };
    if (draft.due.trim() === "") return setFormError("Informe o prazo em dias.");
    if (!draft.pmId) return setFormError("Selecione o meio no cadastro.");
    const v = validateConfig(input, planById.get(draft.planId));
    if (v) return setFormError(v);
    setFormError(null);
    save.mutate(input, {
      onSuccess: () => { toast.success("Meio de pagamento salvo."); setEditing(null); setDraft(EMPTY); },
      onError: (e) => setFormError(methodAdminError(e)),
    });
  };
  const pilotIds = pilot ?? d.activation.pilot_partner_ids;
  const setMode = (mode: Activation["mode"]) =>
    act.mutate({ mode, pilot_partner_ids: mode === "pilot" ? pilotIds : [], expected_version: d.activation.version }, {
      onSuccess: () => { toast.success(`Exigência: ${MODE_LABEL[mode]}.`); setPilot(null); },
      onError: (e) => toast.error(methodAdminError(e)),
    });
  const busy = save.isPending || act.isPending;

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          O comprador escolhe entre os meios ativos de cada condição. As datas mostradas no pedido são estimadas; o vencimento
          definitivo conta da emissão da nota fiscal. Meio sem configuração ativa fica indisponível.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exigência do meio no pedido</CardTitle>
          <CardDescription>Situação atual: <Badge data-testid="pm-mode">{MODE_LABEL[d.activation.mode]}</Badge>. Piloto vale só para os parceiros marcados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {d.partners.map((id) => {
              const on = pilotIds.includes(id);
              return (
                <Button key={id} size="sm" variant={on ? "default" : "outline"} disabled={!d.can_activate || busy} aria-pressed={on}
                  onClick={() => setPilot(on ? pilotIds.filter((x) => x !== id) : [...pilotIds, id])}>
                  Parceiro {id.slice(0, 8)}
                </Button>
              );
            })}
          </div>
          {d.can_activate ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode("off")}>Desligar</Button>
              <Button size="sm" variant="outline" disabled={busy || pilotIds.length === 0} onClick={() => setMode("pilot")}>Ativar piloto</Button>
              <Button size="sm" disabled={busy} onClick={() => setMode("enforced")}>Tornar obrigatória</Button>
            </div>
          ) : <p className="text-xs text-muted-foreground">Somente administrador altera a exigência.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Meios por condição</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Condição</TableHead><TableHead>Meio</TableHead><TableHead>Prazo</TableHead><TableHead>Parcelas</TableHead>
              <TableHead>Taxa Price</TableHead><TableHead>Situação</TableHead><TableHead>Versão</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {d.configs.length === 0 && <TableRow><TableCell colSpan={8} className="text-sm text-muted-foreground">Nenhum meio configurado.</TableCell></TableRow>}
              {d.configs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{planById.get(c.payment_plan_id)?.name ?? "Condição indisponível"}</TableCell>
                  <TableCell>{METHOD_KIND_LABEL[c.method_kind]} · {pmName.get(c.payment_method_id) ?? "inativo no cadastro"}</TableCell>
                  <TableCell>{c.due_days} dias</TableCell>
                  <TableCell>até {c.max_installments}x</TableCell>
                  <TableCell>{c.price_monthly_rate_percent == null ? "—" : `${c.price_monthly_rate_percent}% a.m.`}</TableCell>
                  <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status === "active" ? "Ativo" : "Revogado"}</Badge></TableCell>
                  <TableCell>v{c.version}</TableCell>
                  <TableCell>{d.can_edit && <Button size="sm" variant="outline" disabled={busy} onClick={() => startEdit(c)}>Editar</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {d.can_edit ? (
        <Card data-testid="pm-form">
          <CardHeader><CardTitle className="text-base">{editing ? `Editar meio (v${editing.version})` : "Novo meio na condição"}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pm-plan">Condição</Label>
              <Select value={draft.planId} onValueChange={(v) => setDraft({ ...draft, planId: v })} disabled={!!editing}>
                <SelectTrigger id="pm-plan" aria-label="Condição"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{d.plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.installment_count}x · até {p.max_days} dias</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-kind">Tipo de meio</Label>
              <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as MethodKind, max: "1", rate: "" })} disabled={!!editing}>
                <SelectTrigger id="pm-kind" aria-label="Tipo de meio"><SelectValue /></SelectTrigger>
                <SelectContent>{METHOD_KINDS.map((k) => <SelectItem key={k} value={k}>{METHOD_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-cat">Meio no cadastro</Label>
              <Select value={draft.pmId} onValueChange={(v) => setDraft({ ...draft, pmId: v })}>
                <SelectTrigger id="pm-cat" aria-label="Meio no cadastro"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{d.catalog.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-due">Prazo da 1ª parcela (dias após a NF)</Label>
              <Input id="pm-due" inputMode="numeric" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-max">Parcelas máximas (até {MAX_INSTALLMENTS[draft.kind]})</Label>
              <Input id="pm-max" inputMode="numeric" value={draft.max} disabled={MAX_INSTALLMENTS[draft.kind] === 1}
                onChange={(e) => setDraft({ ...draft, max: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-rate">Taxa Price mensal (%)</Label>
              <Input id="pm-rate" inputMode="decimal" placeholder="obrigatória se parcelado" value={draft.rate} disabled={MAX_INSTALLMENTS[draft.kind] === 1}
                onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-status">Situação</Label>
              <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as Draft["status"] })}>
                <SelectTrigger id="pm-status" aria-label="Situação"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Ativo</SelectItem><SelectItem value="revoked">Revogado</SelectItem></SelectContent>
              </Select>
            </div>
            {formError && <Alert variant="destructive" role="alert" className="sm:col-span-2"><AlertDescription>{formError}</AlertDescription></Alert>}
            <div className="sm:col-span-2 flex gap-2">
              <Button onClick={submit} disabled={busy}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Salvar meio</Button>
              {editing && <Button variant="outline" disabled={busy} onClick={() => startEdit(null)}>Cancelar edição</Button>}
            </div>
          </CardContent>
        </Card>
      ) : <p className="text-sm text-muted-foreground">Consulta apenas. Administrador ou financeiro configura os meios.</p>}
    </div>
  );
}
