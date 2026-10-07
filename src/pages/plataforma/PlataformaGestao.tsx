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
import { bounded } from "@/lib/saas/subscriptionTransition";
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
] as const;
type AcaoAssinatura = (typeof ACOES)[number][0];

const SITUACOES: Record<string, string> = { SUSPENDED: "Suspensa", ACTIVE: "Ativa", PAST_DUE: "Em atraso", TRIAL: "Em teste", CANCELLED: "Cancelada", EXPIRED: "Expirada" };
export function acoesAssinatura(status: string | undefined, trialEndsAt: string | null, now = Date.now()): AcaoAssinatura[] {
  switch (status) {
    case "SUSPENDED": return ["reactivate_manual", "cancel", "change_plan"];
    case "ACTIVE": return ["change_plan", "mark_past_due", "suspend", "cancel"];
    case "PAST_DUE": return ["change_plan", "suspend", "cancel"];
    case "TRIAL": return ["change_plan", "cancel", ...(trialEndsAt && new Date(trialEndsAt).getTime() <= now ? ["expire_trial" as const] : [])];
    default: return [];
  }
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
  const assinatura = assinaturas.data?.find((s) => s.organization_id === org);
  const atual = versoes.data?.find((v) => v.id === assinatura?.plan_version_id);
  const permitidas = acoesAssinatura(assinatura?.status, assinatura?.trial_ends_at ?? null);
  const mesmaVersao = acao === "change_plan" && !!versao && versao === assinatura?.plan_version_id;
  const busy = alterar.isPending || refreshing;
  const bloqueada = !org || !assinaturas.isSuccess || refreshError || !permitidas.includes(acao) || mesmaVersao || !motivoOk(motivo);
  useEffect(() => {
    setVersao(""); setMotivo(""); setRefreshError(false);
  }, [org]);
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
          toast.success(suspensa ? `${plano?.name_snapshot ?? "Plano"} · v${plano?.version_number ?? ""} aplicado. A assinatura continua suspensa. Selecione Reativar assinatura para liberar o acesso.` : "Ação aplicada e registrada no histórico.");
          setMotivo("");
          setVersao("");
          setRefreshing(true); setRefreshError(false);
          void bounded(() => Promise.all([
            assinaturas.refetch({ throwOnError: true }), historico.refetch({ throwOnError: true }),
          ]), 8_000).catch(() => {
            if (mounted.current) setRefreshError(true);
          }).finally(() => {
            submitting.current = false;
            if (mounted.current) setRefreshing(false);
          });
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
          {refreshing ? "Atualizando assinatura e histórico…" : refreshError ? "Ação registrada, mas não foi possível atualizar o resumo. Atualize a consulta antes de nova ação." : assinaturas.isError ? "Não foi possível consultar a assinatura." : !assinaturas.isSuccess ? "Carregando assinatura…" : assinatura ? `${atual ? `${atual.name_snapshot} · v${atual.version_number}` : assinatura.plan_version_id ? "Versão aplicada indisponível" : "Plano legado sem versão"} — ${SITUACOES[assinatura.status] ?? "Situação indisponível"}` : "Empresa sem assinatura."}
        </div>}
        <Select value={permitidas.includes(acao) ? acao : ""} disabled={busy || !assinaturas.isSuccess || !permitidas.length || refreshError} onValueChange={(value) => { setAcao(value as AcaoAssinatura); setVersao(""); }}>
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
          {mesmaVersao && <p role="status" className="mb-3 text-sm">Este plano já está aplicado nesta empresa.</p>}
          <Button disabled={bloqueada || (exigeVersao && !versao) || busy} onClick={enviar}>
            {refreshing ? "Atualizando resumo…" : alterar.isPending ? (alterar.verifying ? "Verificando resultado…" : "Aplicando…") : "Aplicar ação"}
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
