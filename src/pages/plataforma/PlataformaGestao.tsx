/**
 * D52 — gestão de exceções e transições específicas de assinatura.
 * Toda escrita passa por RPCs `platform_*` (superadmin, motivo obrigatório).
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { acoesAssinatura, bounded } from "@/lib/saas/subscriptionTransition";
import {
  mensagemErroAssinatura,
  mensagemErroPlataforma,
  useAlterarAssinatura,
  useAssinaturasSaaS,
  useHistoricoAssinaturasSaaS,
  useCriarExcecao,
  useEncerrarExcecao,
  useExcecoesSaaS,
  useModulosFeaturesSaaS,
  useOrganizacoesSaaS,
  useVersoesPlanosSaaS,
} from "@/hooks/usePlataformaSaaS";

const ACOES = [
  ["start_trial", "Iniciar período de teste"],
  ["change_plan", "Alterar plano (não muda a situação)"],
  ["mark_past_due", "Marcar pagamento em atraso"],
  ["suspend", "Suspender"],
  ["reactivate_manual", "Reativar assinatura"],
  ["cancel", "Cancelar"],
  ["expire_trial", "Expirar período de teste vencido"],
  ["activate_subscription", "Regularizar assinatura (não registra pagamento)"],
] as const;
type AcaoAssinatura = (typeof ACOES)[number][0];

const SITUACOES: Record<string, string> = { SUSPENDED: "Suspensa", ACTIVE: "Ativa", PAST_DUE: "Em atraso", TRIAL: "Em teste", CANCELLED: "Cancelada", EXPIRED: "Expirada" };
// Ciclos canônicos do CHECK de banco: monthly/quarterly/semiannual/annual/custom.
const CICLOS: Record<string, string> = { monthly: "mensal", quarterly: "trimestral", semiannual: "semestral", annual: "anual", custom: "personalizado" };

/** Moeda do SNAPSHOT da assinatura via Intl; fallback seguro sem prefixo fixo. */
function formatarMoedaSnapshot(valor: number, moeda: string | null): string {
  const codigo = (moeda ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(codigo)) {
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: codigo }).format(valor);
    } catch { /* código de moeda desconhecido: cai no fallback abaixo */ }
  }
  return `${valor.toFixed(2).replace(".", ",")}${codigo ? ` ${codigo}` : ""}`.trim();
}

const motivoOk = (m: string) => m.trim().length >= 5;

export function AlterarAssinaturaCard({ organizationIdInicial = null }: { organizationIdInicial?: string | null } = {}) {
  const orgs = useOrganizacoesSaaS();
  const versoes = useVersoesPlanosSaaS();
  const alterar = useAlterarAssinatura();
  const submitting = useRef(false);
  const [org, setOrg] = useState(organizationIdInicial ?? "");
  const assinaturas = useAssinaturasSaaS(org || undefined);
  const historico = useHistoricoAssinaturasSaaS(org || undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (organizationIdInicial) setOrg(organizationIdInicial); }, [organizationIdInicial]);
  const [versao, setVersao] = useState("");
  const [acao, setAcao] = useState<AcaoAssinatura>("change_plan");
  const [motivo, setMotivo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  // Seleção espelha o núcleo: linha MAIS RECENTE por started_at/created_at/id.
  // EXPIRED só é elegível com origem TRIAL→EXPIRED comprovada no histórico;
  // uma CANCELLED (ou qualquer outra) mais nova nunca é pulada.
  const ordenadas = (assinaturas.data ?? []).filter((s) => s.organization_id === org)
    .sort((a, b) => Date.parse(b.started_at ?? b.created_at) - Date.parse(a.started_at ?? a.created_at)
      || Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
  const maisRecente = ordenadas[0];
  const origemTrialExpirada = !!maisRecente && historico.data?.some(
    (h) => h.subscription_id === maisRecente.id && h.previous_status === "TRIAL" && h.new_status === "EXPIRED",
  );
  const assinatura = !maisRecente ? undefined
    : maisRecente.status === "CANCELLED" ? undefined
    : maisRecente.status === "EXPIRED" ? (origemTrialExpirada ? maisRecente : undefined)
    : maisRecente;
  const atual = versoes.data?.find((v) => v.id === assinatura?.plan_version_id);
  const versaoAtualVigente = !!atual && atual.status === "PUBLISHED" && !!atual.effective_from
    && new Date(atual.effective_from).getTime() <= Date.now()
    && (!atual.effective_to || new Date(atual.effective_to).getTime() > Date.now());
  const trialUtilizado = assinaturas.data?.some((s) => s.organization_id === org && s.status === "TRIAL") || historico.data?.some((h) => h.organization_id === org && (h.action === "start_trial" || h.previous_status === "TRIAL" || h.new_status === "TRIAL"));
  const permitidas = assinatura
    ? assinatura.plan_version_id === null ? ["change_plan" as const] : acoesAssinatura(assinatura.status, assinatura.trial_ends_at)
    : assinaturas.isSuccess && historico.isSuccess && (assinaturas.data?.length ?? 0) < 200 && (historico.data?.length ?? 0) < 200 && !trialUtilizado ? ["start_trial" as const] : [];
  const mesmaVersao = acao === "change_plan" && !!versao && versao === assinatura?.plan_version_id;
  const busy = alterar.isPending || refreshing;
  const regularizar = acao === "activate_subscription";
  const trialVencido = assinatura?.status === "TRIAL" && !!assinatura.trial_ends_at && new Date(assinatura.trial_ends_at).getTime() <= Date.now();
  const situacaoEfetiva = trialVencido ? "Teste vencido" : assinatura ? SITUACOES[assinatura.status] ?? "Situação indisponível" : "";
  const bloqueada = !org || !assinaturas.isSuccess || refreshError || !permitidas.includes(acao) || mesmaVersao || !motivoOk(motivo) || (regularizar && !confirmado);
  useEffect(() => {
    setVersao(""); setMotivo(""); setRefreshError(false); setConfirmado(false);
  }, [org]);
  // Confirmação só vale para o estado lido: qualquer mudança de assinatura,
  // versão, status ou snapshots reseta a confirmação explícita.
  useEffect(() => { setConfirmado(false); }, [assinatura?.id, assinatura?.plan_version_id, assinatura?.status, assinatura?.price_snapshot, assinatura?.billing_cycle_snapshot]);
  useEffect(() => {
    if (!permitidas.includes(acao) && permitidas[0]) setAcao(permitidas[0]);
  }, [assinatura?.status, assinatura?.trial_ends_at, acao]); // eslint-disable-line react-hooks/exhaustive-deps
  const exigeVersao = acao === "start_trial" || acao === "change_plan";
  const agora = Date.now();
  const versoesVigentes = (versoes.data ?? []).filter((v) => {
    if (v.status !== "PUBLISHED" || !v.effective_from) return false;
    const inicio = new Date(v.effective_from).getTime();
    const fim = v.effective_to ? new Date(v.effective_to).getTime() : null;
    return inicio <= agora && (fim === null || fim > agora);
  });

  const atualizarResumo = () => {
    setRefreshing(true); setRefreshError(false);
    void bounded(() => Promise.all([
      assinaturas.refetch({ throwOnError: true }), historico.refetch({ throwOnError: true }),
    ]), 8_000).catch(() => {
      if (mounted.current) setRefreshError(true);
    }).finally(() => {
      submitting.current = false;
      if (mounted.current) setRefreshing(false);
    });
  };

  const enviar = () => {
    if (submitting.current || alterar.isPending) return;
    if (refreshing || bloqueada || (exigeVersao && !versao)) return;
    submitting.current = true;
    alterar.mutate(
      { organizationId: org, action: acao, planVersionId: exigeVersao ? versao : null, reason: motivo.trim() },
      {
        onSuccess: () => {
          const suspensa = acao === "change_plan" && assinatura?.status === "SUSPENDED";
          const plano = versoes.data?.find((v) => v.id === versao);
          toast.success(suspensa ? `${plano?.name_snapshot ?? "Plano"} · v${plano?.version_number ?? ""} aplicado. A assinatura continua suspensa. Selecione Reativar assinatura para liberar o acesso.` : acao === "activate_subscription" ? "Assinatura regularizada para Ativa e registrada no histórico. Nenhum pagamento foi registrado." : "Ação aplicada e registrada no histórico.");
          setMotivo("");
          setVersao("");
          setConfirmado(false);
          atualizarResumo();
        },
        onError: (e) => { submitting.current = false; toast.error(mensagemErroAssinatura(e)); },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ação de assinatura</CardTitle>
        <CardDescription>Somente transições válidas são aceitas e toda ação exige motivo.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Select value={org} onValueChange={setOrg} disabled={busy}>
          <SelectTrigger aria-label="Empresa"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            {orgs.data?.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        {org && <div role="status" aria-live="polite" className="text-sm sm:col-span-2 break-words">
          {refreshing ? "Atualizando assinatura e histórico…" : refreshError ? "Ação registrada, mas não foi possível atualizar o resumo. Atualize a consulta antes de nova ação." : assinaturas.isError ? "Não foi possível consultar a assinatura." : !assinaturas.isSuccess ? "Carregando assinatura…" : assinatura ? `${atual ? `${atual.name_snapshot} · v${atual.version_number}` : assinatura.plan_version_id ? "Versão aplicada indisponível" : "Plano legado sem versão"} — ${situacaoEfetiva}` : "Empresa sem assinatura."}
        </div>}
        <Select value={permitidas.includes(acao) ? acao : ""} disabled={busy || !assinaturas.isSuccess || !permitidas.length || refreshError} onValueChange={(value) => { setAcao(value as AcaoAssinatura); setVersao(""); setConfirmado(false); }}>
          <SelectTrigger aria-label="Ação" className="h-auto min-h-11 [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Nenhuma ação disponível" /></SelectTrigger>
          <SelectContent>
            {ACOES.filter(([value]) => permitidas.includes(value)).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        {exigeVersao && permitidas.includes(acao) && <Select value={versao} onValueChange={setVersao} disabled={busy}>
          <SelectTrigger aria-label="Versão comercial"><SelectValue placeholder="Versão comercial vigente" /></SelectTrigger>
          <SelectContent>
            {versoesVigentes.map((v) => <SelectItem key={v.id} value={v.id}>{v.name_snapshot} · v{v.version_number}</SelectItem>)}
          </SelectContent>
        </Select>}
        <div className="space-y-1">
          <Label htmlFor="assin-motivo">Motivo da alteração *</Label>
          <Input id="assin-motivo" disabled={busy} placeholder="Ex.: renovação contratual" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          {exigeVersao && versoes.isSuccess && versoesVigentes.length === 0 && <p className="mb-3 text-sm text-muted-foreground">Nenhuma versão comercial vigente. A ação permanece bloqueada.</p>}
          {acao === "change_plan" && assinatura?.status === "SUSPENDED" && <p className="mb-3 text-sm" role="note">O plano será atualizado, mas a assinatura continuará suspensa. Para liberar o acesso, use Reativar assinatura.</p>}
          {regularizar && assinatura && permitidas.includes(acao) && <div className="mb-3 space-y-2 rounded-md border p-3 text-sm" role="note">
            <p><strong>Regularização de assinatura.</strong> A situação passa de {situacaoEfetiva} para <strong>Ativa</strong>, mantendo o plano atual{atual ? ` (${atual.name_snapshot} · v${atual.version_number})` : ""} e o histórico do período de teste.</p>
            <p>Condições preservadas da assinatura: <strong>{assinatura.price_snapshot != null ? `R$ ${Number(assinatura.price_snapshot).toFixed(2).replace(".", ",")} ${assinatura.currency_snapshot ?? ""}`.trim() : "valor não registrado"}{assinatura.billing_cycle_snapshot ? ` · ciclo ${CICLOS[assinatura.billing_cycle_snapshot] ?? assinatura.billing_cycle_snapshot}` : ""}</strong> (exatamente como registradas; nada é recalculado).</p>
            <p>Esta ação <strong>não registra pagamento nem quita cobrança</strong>, não prorroga o teste e não implanta cobrança ou expiração automática.</p>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={confirmado} disabled={busy} onChange={(e) => setConfirmado(e.target.checked)} aria-label="Confirmar regularização" className="mt-1" />
              <span>Confirmo a conversão para assinatura ativa, ciente de que nenhum pagamento é registrado.</span>
            </label>
          </div>}
          {mesmaVersao && <p role="status" className="mb-3 text-sm">Este plano já está aplicado nesta empresa.</p>}
          {refreshError && <Button variant="outline" onClick={atualizarResumo} disabled={busy} className="mb-3">Atualizar consulta</Button>}
          <Button disabled={bloqueada || (exigeVersao && !versao) || busy} onClick={enviar}>
            {refreshing ? "Atualizando resumo…" : alterar.isPending ? (alterar.verifying ? "Verificando resultado…" : "Aplicando…") : regularizar ? "Regularizar assinatura" : "Aplicar ação"}
          </Button>
          <p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">
            {alterar.isPending ? (alterar.verifying ? "Verificando resultado…" : "Aplicando…") : alterar.isError ? mensagemErroAssinatura(alterar.error) : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExcecoesTab() {
  const orgs = useOrganizacoesSaaS();
  const catalogo = useModulosFeaturesSaaS();
  const excecoes = useExcecoesSaaS();
  const criar = useCriarExcecao();
  const encerrar = useEncerrarExcecao();
  const [org, setOrg] = useState("");
  const [feature, setFeature] = useState("");
  const [modo, setModo] = useState<"GRANT" | "REVOKE">("GRANT");
  const [ate, setAte] = useState("");
  const [motivo, setMotivo] = useState("");

  const nomeOrg = (id: string) => orgs.data?.find((o) => o.id === id)?.nome ?? id.slice(0, 8);
  const nomeFeat = (id: string) => catalogo.data?.features.find((f) => f.id === id)?.name ?? id.slice(0, 8);

  const enviar = () =>
    criar.mutate(
      {
        organizationId: org,
        featureKey: feature,
        mode: modo,
        reason: motivo.trim(),
        endsAt: ate ? new Date(`${ate}T23:59:59-03:00`).toISOString() : null,
      },
      {
        onSuccess: () => {
          toast.success("Exceção criada.");
          setMotivo("");
          setAte("");
        },
        onError: (e) => toast.error(mensagemErroPlataforma(e)),
      },
    );

  const encerrarExcecao = (id: string) => {
    const r = window.prompt("Motivo do encerramento (mínimo 5 caracteres):") ?? "";
    if (!motivoOk(r)) return;
    encerrar.mutate(
      { id, reason: r.trim() },
      {
        onSuccess: () => toast.success("Exceção encerrada."),
        onError: (e) => toast.error(mensagemErroPlataforma(e)),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova exceção</CardTitle>
          <CardDescription>
            Libera ou retira uma funcionalidade de uma empresa, acima do que o plano dela define.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Select value={org} onValueChange={setOrg}>
            <SelectTrigger aria-label="Empresa"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              {orgs.data?.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={feature} onValueChange={setFeature}>
            <SelectTrigger aria-label="Funcionalidade"><SelectValue placeholder="Funcionalidade" /></SelectTrigger>
            <SelectContent>
              {catalogo.data?.features.map((f) => <SelectItem key={f.id} value={f.key}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={modo} onValueChange={(v) => setModo(v as "GRANT" | "REVOKE")}>
            <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="GRANT">Liberar</SelectItem>
              <SelectItem value="REVOKE">Retirar</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" aria-label="Válida até (opcional)" value={ate} onChange={(e) => setAte(e.target.value)} />
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="exce-motivo">Motivo da exceção *</Label>
            <Input id="exce-motivo" placeholder="Ex.: liberação acordada até a renovação" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={!org || !feature || !motivoOk(motivo) || criar.isPending} onClick={enviar}>
              {criar.isPending ? "Salvando…" : "Criar exceção"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exceções registradas</CardTitle>
          <CardDescription>Não podem ser apagadas — apenas encerradas, com motivo.</CardDescription>
        </CardHeader>
        <CardContent>
          {excecoes.isError && <p className="text-sm text-muted-foreground">Não foi possível carregar.</p>}
          {excecoes.data && excecoes.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma exceção registrada.</p>
          )}
          {excecoes.data && excecoes.data.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Funcionalidade</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Até</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excecoes.data.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell>{nomeOrg(x.organization_id)}</TableCell>
                      <TableCell>{nomeFeat(x.feature_id)}</TableCell>
                      <TableCell>
                        <Badge variant={x.mode === "GRANT" ? "default" : "secondary"}>
                          {x.mode === "GRANT" ? "Liberar" : "Retirar"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {x.ends_at ? new Date(x.ends_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Sem prazo"}
                      </TableCell>
                      <TableCell>{x.reason}</TableCell>
                      <TableCell>
                        {x.ended_at ? (
                          <Badge variant="outline">Encerrada</Badge>
                        ) : (
                          <Button size="sm" variant="outline" disabled={encerrar.isPending} onClick={() => encerrarExcecao(x.id)}>
                            Encerrar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
