import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, History, Pencil, RefreshCw, UserCog, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  useAssinaturasSaaS,
  useAuditoriaEmpresa,
  useConvitesAdminEmpresa,
  useEditarEmpresa,
  useEmpresaDetalhe,
  usePlanosSaaS,
} from "@/hooks/usePlataformaSaaS";
import { ORG_STATUS_LABEL, type OrgStatus } from "@/lib/saas/orgOnboarding";
import { errosFormEmpresa, formEmpresaAlterado, formatarCnpj, mensagemErroEdicaoEmpresa, type FormEmpresa } from "@/components/plataforma/empresaEdicao";

const ASSINATURA_LABEL: Record<string, string> = {
  TRIAL: "Período de teste", ACTIVE: "Ativa", PAST_DUE: "Pagamento em atraso",
  SUSPENDED: "Suspensa", CANCELLED: "Cancelada", EXPIRED: "Expirada",
};
const dataHora = (v: string | null | undefined) => {
  if (!v) return "Não informado";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "Não informado" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

function Campo({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{valor ?? <span className="text-muted-foreground font-normal">Não informado</span>}</dd>
    </div>
  );
}

export interface EmpresaDetalheProps {
  organizationId: string;
  onVoltar: () => void;
  onAbrirAdministradores: (organizationId: string) => void;
  onAbrirAssinaturas: (organizationId: string) => void;
  onAbrirHistorico: (organizationId: string) => void;
}

export default function EmpresaDetalhe({ organizationId, onVoltar, onAbrirAdministradores, onAbrirAssinaturas, onAbrirHistorico }: EmpresaDetalheProps) {
  const { roles } = useAuth();
  const superadmin = roles.includes("superadmin");
  const detalhe = useEmpresaDetalhe(organizationId);
  const assinaturas = useAssinaturasSaaS();
  const planos = usePlanosSaaS();
  const convites = useConvitesAdminEmpresa();
  const auditoria = useAuditoriaEmpresa(organizationId);
  const editar = useEditarEmpresa();
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FormEmpresa>({ razaoSocial: "", nomeFantasia: "", email: "", motivo: "" });
  const enviando = useRef(false);

  // Troca de empresa: descarta edição em curso.
  useEffect(() => { setEditando(false); }, [organizationId]);

  const org = detalhe.data;
  const assinatura = (assinaturas.data ?? []).find((a) => a.organization_id === organizationId);
  const plano = assinatura ? planos.data?.find((p) => p.id === assinatura.plan_id) : undefined;
  const admins = (convites.data ?? []).filter((c) => c.organization_id === organizationId);
  const responsavel = admins.find((c) => c.responsavel_principal) ?? null;

  const abrirEdicao = () => {
    if (!org) return;
    setForm({ razaoSocial: org.razao_social ?? org.nome ?? "", nomeFantasia: org.nome_fantasia ?? "", email: org.email_corporativo ?? "", motivo: "" });
    setEditando(true);
  };

  const erros = errosFormEmpresa(form);
  const alterado = org ? formEmpresaAlterado(form, org) : false;
  const podeSalvar = Boolean(org?.updated_at) && erros.length === 0 && alterado && !editar.isPending;

  const salvar = async () => {
    if (!org?.updated_at || !podeSalvar || enviando.current) return;
    enviando.current = true;
    try {
      await editar.mutateAsync({
        organizationId, razaoSocial: form.razaoSocial, nomeFantasia: form.nomeFantasia,
        email: form.email, motivo: form.motivo, expectedUpdatedAt: org.updated_at,
      });
      toast.success("Empresa atualizada e registrada no histórico.");
      setEditando(false);
      await Promise.all([detalhe.refetch(), auditoria.refetch()]);
    } catch (error) {
      toast.error(mensagemErroEdicaoEmpresa(error));
    } finally {
      enviando.current = false;
    }
  };

  return (
    <section aria-labelledby="empresa-detalhe-titulo" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2 min-w-0">
          <Button variant="ghost" size="sm" className="min-h-10 shrink-0" onClick={onVoltar} aria-label="Voltar para a lista de empresas">
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Voltar
          </Button>
          <div className="min-w-0">
            <h2 id="empresa-detalhe-titulo" className="text-lg font-semibold break-words">{org?.razao_social ?? org?.nome ?? "Empresa"}</h2>
            {org && <p className="text-sm text-muted-foreground">{formatarCnpj(org.cnpj)}</p>}
          </div>
        </div>
        {superadmin && org && (
          <Button className="min-h-10" onClick={abrirEdicao}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Editar empresa</Button>
        )}
      </div>

      {detalhe.isLoading && <p className="text-sm text-muted-foreground">Carregando dados da empresa…</p>}
      {detalhe.isError && (
        <div className="space-y-2"><p className="text-sm text-muted-foreground">Não foi possível carregar a empresa.</p>
          <Button size="sm" variant="outline" onClick={() => detalhe.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Tentar novamente</Button></div>
      )}
      {detalhe.data === null && <p className="text-sm text-muted-foreground">Empresa não encontrada.</p>}

      {org && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Dados cadastrais</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Campo label="Razão social" valor={org.razao_social ?? org.nome} />
                <Campo label="Nome fantasia" valor={org.nome_fantasia} />
                <Campo label="CNPJ" valor={org.cnpj ? formatarCnpj(org.cnpj) : null} />
                <Campo label="E-mail" valor={org.email_corporativo} />
                <Campo label="Situação" valor={<Badge variant="outline">{ORG_STATUS_LABEL[org.status as OrgStatus] ?? org.status}</Badge>} />
                <Campo label="Fuso horário" valor={org.fuso_horario} />
                <Campo label="Criada em" valor={dataHora(org.created_at)} />
                <Campo label="Atualizada em" valor={dataHora(org.updated_at)} />
                <Campo label="Cadastro concluído em" valor={org.onboarding_concluido_em ? dataHora(org.onboarding_concluido_em) : null} />
                <Campo label="Ativada em" valor={org.ativada_em ? dataHora(org.ativada_em) : null} />
              </dl>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 gap-2">
                <CardTitle className="text-base">Plano e assinatura</CardTitle>
                <Button size="sm" variant="outline" className="min-h-9" onClick={() => onAbrirAssinaturas(organizationId)}><Building2 className="mr-2 h-4 w-4" aria-hidden="true" />Assinaturas</Button>
              </CardHeader>
              <CardContent>
                {assinaturas.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : assinaturas.isError ? <p className="text-sm text-muted-foreground">Não foi possível carregar a assinatura.</p> : !assinatura ? <p className="text-sm text-muted-foreground">Sem assinatura registrada.</p> : (
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <Campo label="Plano" valor={plano?.name ?? null} />
                    <Campo label="Situação" valor={<Badge variant={assinatura.status === "ACTIVE" ? "default" : "secondary"}>{ASSINATURA_LABEL[assinatura.status] ?? assinatura.status}</Badge>} />
                    <Campo label="Versão comercial" valor={assinatura.plan_version_id ? "Vinculada" : "Regularização pendente"} />
                    <Campo label="Início" valor={assinatura.started_at ? dataHora(assinatura.started_at) : null} />
                  </dl>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 gap-2">
                <CardTitle className="text-base">Administradores</CardTitle>
                <Button size="sm" variant="outline" className="min-h-9" onClick={() => onAbrirAdministradores(organizationId)}><UserCog className="mr-2 h-4 w-4" aria-hidden="true" />Administradores</Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {convites.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : convites.isError ? <p className="text-sm text-muted-foreground">Não foi possível carregar os administradores.</p> : admins.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum administrador convidado.</p> : (
                  <>
                    <Campo label="Responsável principal" valor={responsavel ? `${responsavel.nome} · ${responsavel.email}` : null} />
                    <ul className="text-sm space-y-1">{admins.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2"><span className="break-all">{a.nome} · {a.email}</span><Badge variant="outline">{a.status}</Badge></li>)}</ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 gap-2">
              <div><CardTitle className="text-base">Histórico da empresa</CardTitle><CardDescription>Mudanças de situação e de cadastro. Registro permanente.</CardDescription></div>
              <Button size="sm" variant="outline" className="min-h-9" onClick={() => onAbrirHistorico(organizationId)}><History className="mr-2 h-4 w-4" aria-hidden="true" />Histórico</Button>
            </CardHeader>
            <CardContent>
              {auditoria.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : auditoria.isError ? <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p> : (auditoria.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma mudança registrada.</p> : (
                <ul className="divide-y">{auditoria.data!.map((e) => <li key={`${e.tipo}-${e.id}`} className="py-2 text-sm"><p className="font-medium">{e.resumo}</p><p className="text-xs text-muted-foreground">{dataHora(e.created_at)}{e.motivo ? ` · Motivo: ${e.motivo}` : ""}</p></li>)}</ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={editando} onOpenChange={(open) => { if (!editar.isPending) setEditando(open); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
            <DialogDescription>Somente dados cadastrais. A alteração exige motivo e fica registrada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="emp-ed-razao">Razão social *</Label><Input id="emp-ed-razao" maxLength={200} value={form.razaoSocial} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="emp-ed-fantasia">Nome fantasia</Label><Input id="emp-ed-fantasia" maxLength={200} value={form.nomeFantasia} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="emp-ed-email">E-mail *</Label><Input id="emp-ed-email" type="email" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1">
              <Label htmlFor="emp-ed-cnpj">CNPJ</Label>
              <Input id="emp-ed-cnpj" value={formatarCnpj(org?.cnpj)} readOnly disabled aria-describedby="emp-ed-cnpj-ajuda" />
              <p id="emp-ed-cnpj-ajuda" className="text-xs text-muted-foreground">O CNPJ não pode ser alterado aqui. Uma correção exige fluxo específico e auditado.</p>
            </div>
            <p className="text-xs text-muted-foreground">Situação, plano, assinatura e administradores são alterados nas abas próprias.</p>
            <div className="space-y-1"><Label htmlFor="emp-ed-motivo">Motivo *</Label><Textarea id="emp-ed-motivo" maxLength={300} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></div>
            {erros.length > 0 && <ul className="text-xs text-muted-foreground list-disc pl-4" aria-live="polite">{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
            {erros.length === 0 && !alterado && <p className="text-xs text-muted-foreground" aria-live="polite">Nenhuma alteração para salvar.</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditando(false)} disabled={editar.isPending}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={!podeSalvar}>{editar.isPending ? "Salvando…" : "Salvar alterações"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
