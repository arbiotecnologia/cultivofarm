import { useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, Mail, RotateCcw, Search, ShieldAlert, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  mensagemErroPlataforma,
  useConvidarAdminEmpresa,
  useCriarEmpresa,
  useOrganizacoesSaaS,
  usePlanosSaaS,
  type ResultadoConvite,
} from "@/hooks/usePlataformaSaaS";
import { cnpjValido, normalizarCnpj } from "@/lib/saas/orgOnboarding";
import { CODIGOS_FALLBACK_MANUAL, FONTE_OFICIAL, consultarCnpjOnboarding, mensagemConsulta, type DadosEmpresa } from "@/lib/saas/onboardingCnpj";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
type Origem = { tipo: "api"; dados: DadosEmpresa } | { tipo: "manual"; motivo: string } | null;
type Etapa = 1 | 2 | 3;
type Progresso = "preparando" | "criando_empresa" | "empresa_pronta" | "criando_acesso" | "enviando_convite" | "convite_enviado" | "falhou";
interface ConsultaSnapshot {
  normalized_cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  consulted_at: string;
}
interface EmpresaRevisada {
  cnpj: string;
  nome: string;
  fantasia: string;
  email: string;
  planKey: string;
  planName: string;
  rascunho: boolean;
}

const PROGRESSO_LABEL: Record<Progresso, string> = {
  preparando: "Preparando",
  criando_empresa: "Criando empresa",
  empresa_pronta: "Empresa criada — pronta para auditoria",
  criando_acesso: "Criando acesso",
  enviando_convite: "Enviando convite",
  convite_enviado: "Convite enviado",
  falhou: "Falhou — tentar novamente",
};

const mascaraCpf = (value: string) => value.replace(/\D/g, "").slice(0, 11)
  .replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const mascaraTelefone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.length <= 10
    ? digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2")
    : digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

export interface OrganizationOnboardingFlowProps {
  onOpenAdmins: (organizationId: string) => void;
  onShowOrganization: (organizationId: string) => void;
}

export default function OrganizationOnboardingFlow({ onOpenAdmins, onShowOrganization }: OrganizationOnboardingFlowProps) {
  const orgs = useOrganizacoesSaaS();
  const planos = usePlanosSaaS();
  const criar = useCriarEmpresa();
  const convidar = useConvidarAdminEmpresa();
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [cnpjBusca, setCnpjBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<{ codigo: string; msg: string } | null>(null);
  const [origem, setOrigem] = useState<Origem>(null);
  const [consultaSnapshot, setConsultaSnapshot] = useState<ConsultaSnapshot | null>(null);
  const [empresaRevisada, setEmpresaRevisada] = useState<EmpresaRevisada | null>(null);
  const [confirmacaoCnpj, setConfirmacaoCnpj] = useState("");
  const [nome, setNome] = useState("");
  const [fantasia, setFantasia] = useState("");
  const [emailEmpresa, setEmailEmpresa] = useState("");
  const [plano, setPlano] = useState("");
  const [revisaoSituacao, setRevisaoSituacao] = useState(false);
  const [responsavelNome, setResponsavelNome] = useState("");
  const [responsavelEmail, setResponsavelEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [responsavelPrincipal, setResponsavelPrincipal] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoConvite | null>(null);
  const [progresso, setProgresso] = useState<Progresso>("preparando");
  const operacaoEmCurso = useRef(false);

  const cnpjNorm = normalizarCnpj(cnpjBusca);
  const cnpjOk = cnpjValido(cnpjBusca);
  const existente = useMemo(
    () => cnpjNorm ? (orgs.data ?? []).find((item) => normalizarCnpj(item.cnpj ?? "") === cnpjNorm) : undefined,
    [cnpjNorm, orgs.data],
  );
  const dados = origem?.tipo === "api" ? origem.dados : null;
  const naoAtiva = Boolean(dados && dados.situacao_cadastral !== "ATIVA");
  const rascunho = origem?.tipo === "manual" || naoAtiva;
  const empresaValida = Boolean(origem && nome.trim().length >= 2 && EMAIL_RE.test(emailEmpresa.trim()) && plano && cnpjOk && !existente && (!naoAtiva || revisaoSituacao));
  const responsavelValido = responsavelNome.trim().length >= 3 && EMAIL_RE.test(responsavelEmail.trim()) &&
    [0, 11].includes(cpf.replace(/\D/g, "").length) && [0, 10, 11].includes(telefone.replace(/\D/g, "").length);
  const processando = criar.isPending || convidar.isPending;
  const planoNome = planos.data?.find((item) => item.key === plano)?.name ?? "—";
  const confirmacaoCnpjNorm = confirmacaoCnpj.replace(/\D/g, "");
  const confirmacaoOk = Boolean(
    empresaRevisada && /^\d{14}$/.test(confirmacaoCnpjNorm) && confirmacaoCnpjNorm === empresaRevisada.cnpj,
  );
  const revisaoIntegra = Boolean(empresaRevisada &&
    empresaRevisada.cnpj === cnpjNorm &&
    empresaRevisada.nome === nome.trim() &&
    empresaRevisada.fantasia === fantasia.trim() &&
    empresaRevisada.email === emailEmpresa.trim() &&
    empresaRevisada.planKey === plano &&
    (origem?.tipo !== "api" || (
      consultaSnapshot?.normalized_cnpj === cnpjNorm &&
      consultaSnapshot.razao_social === nome.trim()
    )));

  const buscar = async () => {
    if (!cnpjOk || existente || buscando) return;
    setBuscando(true); setErroBusca(null); setOrigem(null); setConsultaSnapshot(null);
    setEmpresaRevisada(null); setConfirmacaoCnpj("");
    try {
      const response = await consultarCnpjOnboarding(cnpjBusca, "plataforma");
      if (response.codigo === "ok" && "dados" in response) {
        const normalizedResponseCnpj = normalizarCnpj(response.dados.cnpj ?? "");
        if (!normalizedResponseCnpj || normalizedResponseCnpj !== cnpjNorm) {
          setErroBusca({ codigo: "cnpj_mismatch", msg: "A consulta retornou outro CNPJ. Consulte novamente antes de continuar." });
          return;
        }
        setConsultaSnapshot(Object.freeze({
          normalized_cnpj: normalizedResponseCnpj,
          razao_social: (response.dados.razao_social ?? "").trim(),
          nome_fantasia: (response.dados.nome_fantasia ?? "").trim(),
          consulted_at: response.consultado_em ?? new Date().toISOString(),
        }));
        setOrigem({ tipo: "api", dados: response.dados });
        setNome(response.dados.razao_social ?? "");
        setFantasia(response.dados.nome_fantasia ?? "");
        if (response.dados.email_contato) setEmailEmpresa(response.dados.email_contato);
      } else {
        setErroBusca({
          codigo: response.codigo,
          msg: response.codigo === "forbidden" ? "Somente o Superadmin de Plataforma pode consultar." : mensagemConsulta(response.codigo),
        });
      }
    } finally {
      setBuscando(false);
    }
  };

  const reiniciar = () => {
    setEtapa(1); setCnpjBusca(""); setErroBusca(null); setOrigem(null); setNome(""); setFantasia("");
    setEmailEmpresa(""); setPlano(""); setRevisaoSituacao(false); setResponsavelNome(""); setResponsavelEmail("");
    setCpf(""); setTelefone(""); setResponsavelPrincipal(true); setOrganizationId(null); setResultado(null); setProgresso("preparando");
    setConsultaSnapshot(null); setEmpresaRevisada(null); setConfirmacaoCnpj("");
  };

  const revisar = () => {
    if (!empresaValida || !responsavelValido) return;
    setEmpresaRevisada(Object.freeze({
      cnpj: cnpjNorm ?? "",
      nome: nome.trim(),
      fantasia: fantasia.trim(),
      email: emailEmpresa.trim(),
      planKey: plano,
      planName: planoNome,
      rascunho,
    }));
    setConfirmacaoCnpj("");
    setEtapa(3);
  };

  const voltarParaResponsavel = () => {
    if (organizationId) return;
    setEmpresaRevisada(null);
    setConfirmacaoCnpj("");
    setEtapa(2);
  };

  const criarEmpresa = async () => {
    if (!empresaValida || !responsavelValido || !empresaRevisada || !confirmacaoOk || !revisaoIntegra || organizationId || processando || operacaoEmCurso.current) {
      if (!confirmacaoOk || !revisaoIntegra) toast.error("Os dados mudaram ou não conferem com a consulta. Volte e consulte o CNPJ novamente.");
      return;
    }
    operacaoEmCurso.current = true;
    try {
      setProgresso("criando_empresa");
      const createdOrganizationId = await criar.mutateAsync({
        nome: empresaRevisada.nome, nomeFantasia: empresaRevisada.fantasia, cnpj: empresaRevisada.cnpj,
        email: empresaRevisada.email, planKey: empresaRevisada.planKey, rascunho: empresaRevisada.rascunho,
      });
      setOrganizationId(createdOrganizationId);
      setProgresso("empresa_pronta");
      toast.success("Empresa criada — pronta para auditoria.");
    } catch (error) {
      setProgresso("preparando");
      toast.error(mensagemErroPlataforma(error));
    } finally {
      operacaoEmCurso.current = false;
    }
  };

  const enviarConvite = async () => {
    if (!organizationId || !responsavelValido || resultado || processando || operacaoEmCurso.current) return;
    operacaoEmCurso.current = true;
    try {
      setProgresso("criando_acesso");
      setProgresso("enviando_convite");
      const invite = await convidar.mutateAsync({
        organizationId,
        nome: responsavelNome.trim(),
        email: responsavelEmail.trim().toLowerCase(),
        cpf: cpf.replace(/\D/g, ""),
        telefone: telefone.replace(/\D/g, ""),
        modo: "link",
        responsavelPrincipal,
      });
      setResultado(invite);
      setProgresso("convite_enviado");
      toast.success("Convite enviado.");
    } catch (error) {
      setProgresso("falhou");
      toast.error("Empresa criada; convite pendente ou falhou.");
    } finally {
      operacaoEmCurso.current = false;
    }
  };

  return (
    <div className="space-y-4" data-testid="organization-onboarding-flow">
      <nav aria-label="Etapas do cadastro" className="grid grid-cols-3 gap-2">
        {[{ n: 1, label: "Empresa", icon: Building2 }, { n: 2, label: "Responsável", icon: UserRound }, { n: 3, label: "Revisão", icon: Check }].map(({ n, label, icon: Icon }) => (
          <div key={n} className={`flex min-h-12 items-center justify-center gap-2 rounded-md border px-2 text-sm ${etapa === n ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground"}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{n}. {label}</span>
          </div>
        ))}
      </nav>

      {etapa === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Dados da empresa</CardTitle><CardDescription>Dados comerciais e da assinatura. O e-mail abaixo pertence à empresa.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); void buscar(); }}>
              <div className="flex-1 space-y-1"><Label htmlFor="emp-cnpj">CNPJ *</Label><Input id="emp-cnpj" value={cnpjBusca} maxLength={18} placeholder="00.000.000/0000-00" autoComplete="off" disabled={Boolean(origem)} aria-invalid={Boolean(cnpjNorm && !cnpjOk)} onChange={(event) => { setCnpjBusca(event.target.value.toUpperCase()); setErroBusca(null); setConsultaSnapshot(null); setEmpresaRevisada(null); setConfirmacaoCnpj(""); }} /></div>
              {!origem ? <Button type="submit" disabled={!cnpjOk || Boolean(existente) || buscando}><Search className="mr-2 h-4 w-4" />{buscando ? "Buscando…" : "Buscar empresa"}</Button> : <Button type="button" variant="outline" onClick={reiniciar}><RotateCcw className="mr-2 h-4 w-4" />Consultar outro CNPJ</Button>}
            </form>
            {existente && <p role="alert" className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">Este CNPJ já pertence a <strong>{existente.nome}</strong>. Nenhuma empresa nova será criada.</p>}
            {erroBusca && <div role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm"><p>{erroBusca.msg}</p>{CODIGOS_FALLBACK_MANUAL.has(erroBusca.codigo) && <Button size="sm" variant="outline" onClick={() => { setOrigem({ tipo: "manual", motivo: erroBusca.codigo }); setErroBusca(null); }}>Preencher manualmente</Button>}</div>}
            {origem && <div className="grid gap-4 sm:grid-cols-2">
              <p className="text-xs text-muted-foreground sm:col-span-2">{dados ? FONTE_OFICIAL : "Cadastro manual: a empresa será criada como rascunho para revisão."}</p>
              <div className="space-y-1"><Label htmlFor="emp-nome">Razão social *</Label><Input id="emp-nome" value={nome} maxLength={200} readOnly={Boolean(dados)} className={dados ? "bg-muted" : undefined} onChange={(event) => setNome(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="emp-fantasia">Nome fantasia</Label><Input id="emp-fantasia" value={fantasia} maxLength={200} onChange={(event) => setFantasia(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="emp-email">E-mail corporativo da empresa *</Label><Input id="emp-email" type="email" value={emailEmpresa} maxLength={255} autoComplete="off" onChange={(event) => setEmailEmpresa(event.target.value)} /><p className="text-xs text-muted-foreground">Contato institucional; não será usado como login do responsável.</p></div>
              <div className="space-y-1"><Label htmlFor="emp-plano">Plano *</Label><Select value={plano} onValueChange={setPlano}><SelectTrigger id="emp-plano"><SelectValue placeholder="Selecione o plano" /></SelectTrigger><SelectContent>{(planos.data ?? []).filter((item) => item.active).map((item) => <SelectItem key={item.id} value={item.key}>{item.name}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">A assinatura começa em período de teste.</p></div>
              {naoAtiva && <div role="alert" className="flex gap-2 rounded-md border border-destructive/40 p-3 text-sm sm:col-span-2"><ShieldAlert className="h-4 w-4 shrink-0 text-destructive" /><div className="space-y-2"><p>Situação cadastral diferente de ATIVA. A empresa será criada como rascunho.</p><div className="flex items-center gap-2"><Checkbox id="emp-revisao" checked={revisaoSituacao} onCheckedChange={(value) => setRevisaoSituacao(value === true)} /><Label htmlFor="emp-revisao" className="font-normal">Revisei a situação cadastral</Label></div></div></div>}
            </div>}
            <div className="flex justify-end"><Button disabled={!empresaValida} onClick={() => setEtapa(2)}>Continuar<ChevronRight className="ml-2 h-4 w-4" /></Button></div>
          </CardContent>
        </Card>
      )}

      {etapa === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Responsável de acesso</CardTitle><CardDescription>Este e-mail será o login do usuário e receberá o convite.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="responsavel-nome">Nome completo *</Label><Input id="responsavel-nome" value={responsavelNome} maxLength={200} onChange={(event) => setResponsavelNome(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="responsavel-email">E-mail de acesso e convite *</Label><Input id="responsavel-email" type="email" value={responsavelEmail} maxLength={255} autoComplete="off" onChange={(event) => setResponsavelEmail(event.target.value)} /><p className="text-xs text-muted-foreground">E-mail pessoal do usuário, separado do contato da empresa.</p></div>
              <div className="space-y-1"><Label htmlFor="responsavel-telefone">Telefone (opcional)</Label><Input id="responsavel-telefone" value={telefone} inputMode="numeric" onChange={(event) => setTelefone(mascaraTelefone(event.target.value))} /></div>
              <div className="space-y-1"><Label htmlFor="responsavel-cpf">CPF (opcional)</Label><Input id="responsavel-cpf" value={cpf} inputMode="numeric" onChange={(event) => setCpf(mascaraCpf(event.target.value))} /></div>
              <div className="space-y-1"><Label>Forma de acesso</Label><div className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />Link de convite</div></div>
            </div>
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={responsavelPrincipal} onCheckedChange={(value) => setResponsavelPrincipal(value === true)} aria-label="Responsável principal" /><span>Registrar como <strong>Responsável Principal</strong> da empresa.</span></label>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setEtapa(1)}><ChevronLeft className="mr-2 h-4 w-4" />Voltar</Button><Button disabled={!responsavelValido} onClick={revisar}>Revisar<ChevronRight className="ml-2 h-4 w-4" /></Button></div>
          </CardContent>
        </Card>
      )}

      {etapa === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Revisão</CardTitle><CardDescription>Confira os dados antes de criar a empresa e preparar o acesso.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <section className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4" aria-labelledby="empresa-revisada-titulo">
              <h3 id="empresa-revisada-titulo" className="font-semibold">Empresa que será criada</h3>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">CNPJ</dt><dd className="font-medium">{empresaRevisada?.cnpj ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Razão social</dt><dd className="font-medium">{empresaRevisada?.nome ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Nome fantasia</dt><dd className="font-medium">{empresaRevisada?.fantasia || "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">E-mail corporativo</dt><dd className="font-medium break-all">{empresaRevisada?.email ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Plano e trial</dt><dd className="font-medium">{empresaRevisada?.planName ?? "—"}</dd><dd className="text-muted-foreground">Período de teste</dd></div>
              </dl>
            </section>
            <section className="space-y-3 rounded-md border p-4" aria-labelledby="responsavel-revisado-titulo">
              <h3 id="responsavel-revisado-titulo" className="font-semibold">Responsável que receberá acesso</h3>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Responsável</dt><dd className="font-medium">{responsavelNome}</dd><dd className="text-muted-foreground">{responsavelPrincipal ? "Responsável Principal" : "Administrador"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">E-mail de acesso</dt><dd className="font-medium break-all">{responsavelEmail}</dd><dd className="text-muted-foreground">Link de convite</dd></div>
              </dl>
            </section>
            {!organizationId && <div className="max-w-sm space-y-1"><Label htmlFor="confirmacao-cnpj">Confirme o CNPJ *</Label><Input id="confirmacao-cnpj" value={confirmacaoCnpj} inputMode="numeric" autoComplete="off" maxLength={18} placeholder="Digite os 14 números" onChange={(event) => setConfirmacaoCnpj(event.target.value.replace(/\D/g, "").slice(0, 14))} aria-invalid={Boolean(confirmacaoCnpj && !confirmacaoOk)} /><p className="text-xs text-muted-foreground">Redigite os 14 números do CNPJ mostrado acima.</p></div>}
            {!revisaoIntegra && !organizationId && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">Os dados não conferem com a consulta. Volte e use “Consultar outro CNPJ”.</p>}
            <div aria-live="polite" className={`rounded-md border p-3 text-sm ${progresso === "falhou" ? "border-destructive/40" : "bg-muted/40"}`}>
              <p className="font-medium">{PROGRESSO_LABEL[progresso]}</p>
              {progresso === "criando_acesso" && <p className="text-muted-foreground">Enviando convite</p>}
              {progresso === "empresa_pronta" && <p className="text-muted-foreground">Confira a criação no ambiente canônico antes de enviar o convite.</p>}
              {progresso === "falhou" && organizationId && <p className="text-muted-foreground">Empresa criada; convite pendente ou falhou. A nova tentativa não criará outra empresa.</p>}
            </div>
            {resultado && organizationId ? (
              <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => onShowOrganization(organizationId)}>Ver empresa</Button><Button onClick={() => onOpenAdmins(organizationId)}>Ver administradores</Button><Button variant="ghost" onClick={reiniciar}>Cadastrar outra empresa</Button></div>
            ) : (
               <div className="flex flex-wrap justify-between gap-2"><Button variant="outline" disabled={processando || Boolean(organizationId)} onClick={voltarParaResponsavel}><ChevronLeft className="mr-2 h-4 w-4" />Voltar e editar</Button>{organizationId ? <Button data-testid="send-invite" disabled={!responsavelValido || processando} onClick={() => void enviarConvite()}>{processando ? PROGRESSO_LABEL[progresso] : progresso === "falhou" ? "Tentar convite novamente" : "Enviar convite"}</Button> : <Button data-testid="create-organization" disabled={!empresaValida || !responsavelValido || !confirmacaoOk || !revisaoIntegra || processando} onClick={() => void criarEmpresa()}>{criar.isPending ? "Criando empresa" : "Criar empresa"}</Button>}</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}