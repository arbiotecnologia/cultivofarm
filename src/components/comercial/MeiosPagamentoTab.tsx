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
  MAX_INSTALLMENTS, methodAdminError, useAssignB2BPaymentCondition, useB2BPaymentMethodAdmin, usePublishB2BPaymentCondition,
  useRetireB2BPaymentCondition, useSetB2BPaymentMethodActivation, validateConfig, type Activation, type ConditionVersion, type PublishInput,
} from "@/hooks/useB2BPaymentMethodAdmin";

type Draft = { planId: string; kind: MethodKind; pmId: string; catId: string; due: string; n: string; rate: string };
const MODE_LABEL: Record<Activation["mode"], string> = { off: "Desligada", pilot: "Piloto", enforced: "Obrigatória" };

/**
 * Condições e meios de pagamento (B2B_PAYMENT_CONDITION_V1). Empresa sempre derivada no servidor; cada salvamento publica
 * uma NOVA versão (as antigas ficam no histórico e nos pedidos). Nada é gravado sem clique explícito; conflitos mantêm o
 * rascunho e nunca tentam de novo sozinhos. Nenhuma taxa é sugerida; o prazo inicial vem do servidor (padrão aprovado).
 */
export function MeiosPagamentoTab() {
  const q = useB2BPaymentMethodAdmin();
  const publish = usePublishB2BPaymentCondition();
  const retire = useRetireB2BPaymentCondition();
  const assign = useAssignB2BPaymentCondition();
  const act = useSetB2BPaymentMethodActivation();
  const [editing, setEditing] = useState<ConditionVersion | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pilot, setPilot] = useState<string[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const d = q.data?.status === "ok" ? q.data.data : null;
  const planById = useMemo(() => new Map((d?.plans ?? []).map((p) => [p.id, p])), [d]);
  const pmName = useMemo(() => new Map((d?.catalog ?? []).map((m) => [m.id, m.name])), [d]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando condições e meios de pagamento…</p>;
  if (q.data?.status === "not_installed")
    return <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Condições com meio de pagamento ainda não estão disponíveis neste ambiente. O pedido segue o contrato atual.</AlertDescription></Alert>;
  if (q.isError || !d)
    return (
      <Alert variant="destructive" role="alert" data-testid="pm-admin-error">
        <AlertDescription className="space-y-2">
          <p>Não foi possível carregar a configuração de meios de pagamento.</p>
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Tentar carregar novamente</Button>
        </AlertDescription>
      </Alert>
    );

  const empty: Draft = { planId: "", kind: "pix", pmId: "", catId: "", due: String(d.default_deadline_days), n: "1", rate: "0" };
  const form = draft ?? empty;
  const startEdit = (c: ConditionVersion | null) => {
    setFormError(null); setEditing(c);
    setDraft(c ? { planId: c.plan_id, kind: c.method, pmId: c.payment_method_id, catId: c.category_id, due: String(c.deadline_days),
      n: String(c.installment_count), rate: String(c.monthly_rate) } : null);
  };
  const submit = () => {
    if (form.due.trim() === "") return setFormError("Informe o prazo em dias.");
    if (form.rate.trim() === "") return setFormError("Informe a taxa Price mensal explicitamente (pode ser 0).");
    const input: PublishInput = {
      plan_id: form.planId, method: form.kind, payment_method_id: form.pmId, category_id: form.catId, deadline_days: Number(form.due),
      installment_count: Number(form.n), monthly_rate: Number(form.rate.replace(",", ".")),
      expected_version: editing?.version ?? d.conditions.find((c) => c.plan_id === form.planId && c.method === form.kind)?.version ?? 0,
    };
    const v = validateConfig(input, planById.get(form.planId));
    if (v) return setFormError(v);
    setFormError(null);
    publish.mutate(input, {
      onSuccess: () => { toast.success("Nova versão publicada."); setEditing(null); setDraft(null); },
      onError: (e) => setFormError(methodAdminError(e)),
    });
  };
  const pilotIds = pilot ?? d.activation.pilot_partner_ids;
  const setMode = (mode: Activation["mode"]) =>
    act.mutate({ mode, pilot_partner_ids: mode === "pilot" ? pilotIds : [], expected_version: d.activation.version }, {
      onSuccess: () => { toast.success(`Exigência: ${MODE_LABEL[mode]}.`); setPilot(null); },
      onError: (e) => toast.error(methodAdminError(e)),
    });
  const busy = publish.isPending || retire.isPending || assign.isPending || act.isPending;
  const maxN = MAX_INSTALLMENTS[form.kind];

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          O comprador escolhe entre as versões vigentes liberadas para ele. As datas mostradas no pedido são estimadas; o vencimento
          definitivo conta da emissão da nota fiscal. Meio sem versão vigente liberada fica indisponível.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exigência no pedido</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">Situação atual: <Badge data-testid="pm-mode">{MODE_LABEL[d.activation.mode]}</Badge></div>
          <CardDescription>Piloto vale só para os parceiros marcados; os demais seguem o contrato atual.</CardDescription>
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
        <CardHeader><CardTitle className="text-base">Meios por condição (versão vigente)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Condição</TableHead><TableHead>Meio</TableHead><TableHead>Prazo</TableHead><TableHead>Parcelas</TableHead>
              <TableHead>Taxa Price</TableHead><TableHead>Situação</TableHead><TableHead>Parceiros</TableHead><TableHead>Versão</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {d.conditions.length === 0 && <TableRow><TableCell colSpan={9} className="text-sm text-muted-foreground">Nenhum meio configurado.</TableCell></TableRow>}
              {d.conditions.map((c) => (
                <TableRow key={`${c.plan_id}:${c.method}`}>
                  <TableCell>{planById.get(c.plan_id)?.name ?? "Condição indisponível"}</TableCell>
                  <TableCell>{METHOD_KIND_LABEL[c.method]} · {pmName.get(c.payment_method_id) ?? "inativo no cadastro"}</TableCell>
                  <TableCell>{c.deadline_days} dias após a NF</TableCell>
                  <TableCell>{c.installment_count}x</TableCell>
                  <TableCell>{`${c.monthly_rate.toLocaleString("pt-BR")}% a.m.`}</TableCell>
                  <TableCell><Badge variant={c.retired ? "secondary" : "default"}>{c.retired ? "Aposentada" : "Vigente"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {d.partners.map((pid) => {
                        const on = c.partner_ids.includes(pid);
                        return (
                          <Button key={pid} size="sm" variant={on ? "default" : "outline"} aria-pressed={on} disabled={!d.can_edit || busy || c.retired}
                            onClick={() => assign.mutate({ partner_id: pid, plan_id: c.plan_id, method: c.method, version: c.version, enabled: !on }, {
                              onSuccess: () => toast.success(on ? "Parceiro revogado nesta versão." : "Parceiro liberado."),
                              onError: (e) => toast.error(methodAdminError(e)),
                            })}>
                            {pid.slice(0, 8)}
                          </Button>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>v{c.version}</TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    {d.can_edit && <Button size="sm" variant="outline" disabled={busy} onClick={() => startEdit(c)}>Nova versão</Button>}
                    {d.can_edit && !c.retired && (
                      <Button size="sm" variant="outline" disabled={busy}
                        onClick={() => retire.mutate({ plan_id: c.plan_id, method: c.method, expected_version: c.version }, {
                          onSuccess: () => toast.success("Versão aposentada."), onError: (e) => toast.error(methodAdminError(e)),
                        })}>Aposentar</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {d.can_edit ? (
        <Card data-testid="pm-form">
          <CardHeader><CardTitle className="text-base">{editing ? `Nova versão (atual v${editing.version})` : "Novo meio na condição"}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pm-plan">Condição</Label>
              <Select value={form.planId} onValueChange={(v) => setDraft({ ...form, planId: v })} disabled={!!editing}>
                <SelectTrigger id="pm-plan" aria-label="Condição"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{d.plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · até {p.max_days} dias</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-kind">Tipo de meio</Label>
              <Select value={form.kind} onValueChange={(v) => setDraft({ ...form, kind: v as MethodKind, n: "1", rate: "0" })} disabled={!!editing}>
                <SelectTrigger id="pm-kind" aria-label="Tipo de meio"><SelectValue /></SelectTrigger>
                <SelectContent>{METHOD_KINDS.map((k) => <SelectItem key={k} value={k}>{METHOD_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-cat">Meio no cadastro</Label>
              <Select value={form.pmId} onValueChange={(v) => setDraft({ ...form, pmId: v })}>
                <SelectTrigger id="pm-cat" aria-label="Meio no cadastro"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{d.catalog.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-rev">Categoria de receita</Label>
              <Select value={form.catId} onValueChange={(v) => setDraft({ ...form, catId: v })}>
                <SelectTrigger id="pm-rev" aria-label="Categoria de receita"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{d.categories.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-due">Prazo da 1ª parcela (dias após a NF)</Label>
              <Input id="pm-due" inputMode="numeric" value={form.due} onChange={(e) => setDraft({ ...form, due: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-max">Parcelas (até {maxN})</Label>
              <Input id="pm-max" inputMode="numeric" value={form.n} disabled={maxN === 1} onChange={(e) => setDraft({ ...form, n: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-rate">Taxa Price mensal (%)</Label>
              <Input id="pm-rate" inputMode="decimal" value={form.rate} disabled={maxN === 1} onChange={(e) => setDraft({ ...form, rate: e.target.value })} />
            </div>
            {formError && <Alert variant="destructive" role="alert" className="sm:col-span-2"><AlertDescription>{formError}</AlertDescription></Alert>}
            <div className="sm:col-span-2 flex gap-2">
              <Button onClick={submit} disabled={busy}>{publish.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Publicar versão</Button>
              {(editing || draft) && <Button variant="outline" disabled={busy} onClick={() => startEdit(null)}>Cancelar</Button>}
            </div>
          </CardContent>
        </Card>
      ) : <p className="text-sm text-muted-foreground">Consulta apenas. Administrador ou financeiro configura as condições.</p>}
    </div>
  );
}
