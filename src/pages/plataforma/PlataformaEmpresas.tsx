/**
 * Nova Empresa (Superadmin) — fluxo CNPJ-first.
 * 1) CNPJ + "Buscar empresa" (Edge Function autenticada, modo plataforma;
 *    papel validado no servidor). A consulta não grava nada.
 * 2) Cartão-resumo da fonte oficial; formulário só após consulta válida ou
 *    fallback manual (apenas fonte indisponível/não encontrado).
 * 3) Criação via RPC platform_create_organization (servidor valida superadmin,
 *    CNPJ único e plano). Situação ≠ ATIVA ou manual ⇒ nasce como rascunho.
 * O convite do administrador é feito depois, na aba Administradores.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, ShieldAlert, RotateCcw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  mensagemErroPlataforma,
  useAlterarStatusEmpresa,
  useCriarEmpresa,
  useOrganizacoesSaaS,
  usePlanosSaaS,
} from "@/hooks/usePlataformaSaaS";
import { ORG_STATUS_LABEL, OrgStatus, cnpjValido, normalizarCnpj, transicaoPermitida } from "@/lib/saas/orgOnboarding";
import {
  CODIGOS_FALLBACK_MANUAL, FONTE_OFICIAL, consultarCnpjOnboarding, mensagemConsulta, type DadosEmpresa,
} from "@/lib/saas/onboardingCnpj";

const ACOES_SUPERADMIN: OrgStatus[] = ["aguardando_ativacao", "rascunho", "suspensa", "ativa", "cancelada"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Origem = { tipo: "api"; dados: DadosEmpresa } | { tipo: "manual"; motivo: string } | null;

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm break-words">{valor || "—"}</dd>
    </div>
  );
}

export default function PlataformaEmpresas({ onConvidar }: { onConvidar?: () => void }) {
  const orgs = useOrganizacoesSaaS();
  const planos = usePlanosSaaS();
  const criar = useCriarEmpresa();
  const alterar = useAlterarStatusEmpresa();

  const [cnpjBusca, setCnpjBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<{ codigo: string; msg: string } | null>(null);
  const [origem, setOrigem] = useState<Origem>(null);
  const [confirmarTroca, setConfirmarTroca] = useState(false);

  const [nome, setNome] = useState("");
  const [fantasia, setFantasia] = useState("");
  const [email, setEmail] = useState("");
  const [plano, setPlano] = useState("");
  const [revisaoSituacao, setRevisaoSituacao] = useState(false);
  const [criada, setCriada] = useState<string | null>(null);

  const [filtro, setFiltro] = useState("");
  const [motivoDlg, setMotivoDlg] = useState<{ org: string; status: OrgStatus } | null>(null);
  const [motivo, setMotivo] = useState("");

  const cnpjNorm = normalizarCnpj(cnpjBusca);
  const cnpjOk = cnpjValido(cnpjBusca);
  const existente = useMemo(
    () => (cnpjNorm ? (orgs.data ?? []).find((o) => normalizarCnpj(o.cnpj ?? "") === cnpjNorm) : undefined),
    [orgs.data, cnpjNorm],
  );

  const dados = origem?.tipo === "api" ? origem.dados : null;
  const situacao = dados?.situacao_cadastral ?? null;
  const naoAtiva = !!dados && situacao !== "ATIVA";
  const rascunho = origem?.tipo === "manual" || naoAtiva;

  const limparConsulta = () => {
    setOrigem(null); setErroBusca(null); setRevisaoSituacao(false); setCriada(null);
    // Limpa somente o que veio da consulta; e-mail/plano digitados permanecem.
    setNome(""); setFantasia("");
  };

  const buscar = async () => {
    if (!cnpjOk || existente) return;
    setBuscando(true); setErroBusca(null); setOrigem(null); setCriada(null);
    try {
      const r = await consultarCnpjOnboarding(cnpjBusca, "plataforma");
      if (r.codigo === "ok" && "dados" in r) {
        setOrigem({ tipo: "api", dados: r.dados });
        setNome(r.dados.razao_social ?? "");
        setFantasia(r.dados.nome_fantasia ?? "");
        if (!email && r.dados.email_contato) setEmail(r.dados.email_contato);
      } else {
        const msg = r.codigo === "forbidden" ? "Somente o Superadmin de Plataforma pode consultar." : mensagemConsulta(r.codigo);
        setErroBusca({ codigo: r.codigo, msg });
      }
    } finally {
      setBuscando(false);
    }
  };

  const podeCriar =
    !!origem && nome.trim().length >= 2 && EMAIL_RE.test(email.trim()) && !!plano && cnpjOk && !existente &&
    (!naoAtiva || revisaoSituacao);

  const enviar = async () => {
    try {
      const id = await criar.mutateAsync({
        nome: nome.trim(), nomeFantasia: fantasia.trim(), cnpj: cnpjNorm, email: email.trim(), planKey: plano, rascunho,
      });
      setCriada(id);
      toast.success(rascunho ? "Empresa criada como rascunho (não verificada)." : "Empresa criada.");
    } catch (e) {
      toast.error(mensagemErroPlataforma(e));
    }
  };

  const confirmarMudanca = async () => {
    if (!motivoDlg || motivo.trim().length < 5) return;
    try {
      await alterar.mutateAsync({ org: motivoDlg.org, status: motivoDlg.status, motivo: motivo.trim() });
      toast.success("Situação atualizada.");
      setMotivoDlg(null); setMotivo("");
    } catch (e) {
      toast.error(mensagemErroPlataforma(e));
    }
  };

  const lista = (orgs.data ?? []).filter((o) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return [o.nome, o.nome_fantasia, o.cnpj].some((v) => (v ?? "").toLowerCase().includes(q)) ||
      (normalizarCnpj(q) && normalizarCnpj(o.cnpj ?? "").includes(normalizarCnpj(q)));
  });

  return (
    <div className="space-y-4">
      {/* ETAPA 1 — IDENTIFICAR */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Identificar empresa</CardTitle>
          <CardDescription>
            Informe o CNPJ e busque os dados oficiais. A empresa é criada antes do convite do administrador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => { e.preventDefault(); void buscar(); }}
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="emp-cnpj">CNPJ *</Label>
              <Input
                id="emp-cnpj" value={cnpjBusca} maxLength={18} placeholder="00.000.000/0000-00"
                disabled={!!origem} aria-invalid={!!cnpjNorm && !cnpjOk}
                aria-describedby="emp-cnpj-ajuda"
                onChange={(e) => { setCnpjBusca(e.target.value.toUpperCase()); setErroBusca(null); }}
              />
              <p id="emp-cnpj-ajuda" className="text-xs text-muted-foreground">
                {cnpjNorm && !cnpjOk ? <span className="text-destructive">CNPJ inválido. Confira os dígitos.</span> : "Aceita CNPJ numérico ou alfanumérico."}
              </p>
            </div>
            {!origem ? (
              <Button type="submit" disabled={!cnpjOk || !!existente || buscando}>
                <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                {buscando ? "Buscando…" : "Buscar empresa"}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setConfirmarTroca(true)}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Consultar outro CNPJ
              </Button>
            )}
          </form>

          {existente && (
            <div role="alert" className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              Este CNPJ já pertence a <strong>{existente.nome}</strong> ({ORG_STATUS_LABEL[existente.status as OrgStatus] ?? existente.status}).
              Nenhuma empresa nova será criada.{" "}
              <button type="button" className="underline" onClick={() => setFiltro(existente.cnpj ?? existente.nome)}>
                Ver na lista
              </button>
            </div>
          )}

          {erroBusca && (
            <div role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
              <p>{erroBusca.msg}</p>
              {CODIGOS_FALLBACK_MANUAL.has(erroBusca.codigo) && (
                <Button size="sm" variant="outline" onClick={() => { setOrigem({ tipo: "manual", motivo: erroBusca.codigo }); setErroBusca(null); }}>
                  Preencher manualmente
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ETAPA 2 — DADOS E CRIAÇÃO */}
      {origem && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Dados da empresa</CardTitle>
            <CardDescription>
              {dados ? FONTE_OFICIAL : "Cadastro manual: a empresa nascerá como rascunho não verificado e exigirá revisão antes de ativar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {dados && (
              <section aria-labelledby="sec-oficial" className="space-y-2">
                <h3 id="sec-oficial" className="text-sm font-semibold">Identificação oficial</h3>
                <dl className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
                  <Campo rotulo="CNPJ" valor={cnpjBusca} />
                  <Campo rotulo="Razão social" valor={dados.razao_social} />
                  <div>
                    <dt className="text-xs text-muted-foreground">Situação cadastral</dt>
                    <dd><Badge variant={naoAtiva ? "destructive" : "default"}>{situacao ?? "Não informada"}</Badge></dd>
                  </div>
                  <Campo rotulo="Matriz/filial" valor={dados.matriz_filial} />
                  <Campo rotulo="Porte" valor={dados.porte} />
                  <Campo rotulo="Natureza jurídica" valor={dados.natureza_juridica} />
                  <Campo rotulo="Abertura" valor={dados.data_abertura} />
                  <Campo rotulo="CNAE principal" valor={[dados.cnae_principal, dados.cnae_descricao].filter(Boolean).join(" — ")} />
                  <Campo rotulo="Simples/MEI" valor={dados.regime_tributario ?? "Não confirmado pela fonte"} />
                </dl>
                <h3 className="pt-2 text-sm font-semibold">Contato e endereço</h3>
                <dl className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
                  <Campo rotulo="Endereço" valor={[dados.logradouro, dados.numero, dados.complemento].filter(Boolean).join(", ")} />
                  <Campo rotulo="Bairro" valor={dados.bairro} />
                  <Campo rotulo="Município/UF" valor={[dados.cidade, dados.uf].filter(Boolean).join("/")} />
                  <Campo rotulo="CEP" valor={dados.cep} />
                  <Campo rotulo="Telefone" valor={dados.telefone} />
                  <Campo rotulo="E-mail" valor={dados.email_contato} />
                </dl>
                <p className="text-xs text-muted-foreground">
                  Endereço, inscrição estadual e regime tributário são confirmados pelo administrador no primeiro acesso.
                </p>
              </section>
            )}

            {naoAtiva && (
              <div role="alert" className="flex gap-2 rounded-md border border-destructive/40 p-3 text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <div className="space-y-2">
                  <p>Situação cadastral diferente de ATIVA. A empresa só pode ser criada como rascunho, após revisão explícita.</p>
                  <div className="flex items-center gap-2">
                    <Checkbox id="emp-revisao" checked={revisaoSituacao} onCheckedChange={(v) => setRevisaoSituacao(v === true)} />
                    <Label htmlFor="emp-revisao" className="font-normal">Revisei a situação e quero criar como rascunho</Label>
                  </div>
                </div>
              </div>
            )}

            <section aria-labelledby="sec-plataforma" className="grid gap-4 sm:grid-cols-2">
              <h3 id="sec-plataforma" className="text-sm font-semibold sm:col-span-2">Configuração da plataforma</h3>
              <div className="space-y-1">
                <Label htmlFor="emp-nome">Razão social *</Label>
                <Input
                  id="emp-nome" value={nome} maxLength={200} readOnly={!!dados}
                  aria-readonly={!!dados} className={dados ? "bg-muted" : undefined}
                  onChange={(e) => setNome(e.target.value)}
                />
                {dados && <p className="text-xs text-muted-foreground">Protegido: valor oficial.</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-fantasia">
                  Nome fantasia
                  {dados && fantasia.trim() !== (dados.nome_fantasia ?? "") && <Badge variant="outline" className="ml-2">alterado</Badge>}
                </Label>
                <Input id="emp-fantasia" value={fantasia} maxLength={200} onChange={(e) => setFantasia(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-email">E-mail corporativo *</Label>
                <Input id="emp-email" type="email" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-plano">Plano *</Label>
                <Select value={plano} onValueChange={setPlano}>
                  <SelectTrigger id="emp-plano"><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
                  <SelectContent>
                    {(planos.data ?? []).filter((p) => p.active).map((p) => (
                      <SelectItem key={p.id} value={p.key}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section aria-labelledby="sec-revisao" className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
              <h3 id="sec-revisao" className="font-semibold">Revisão</h3>
              <p>
                {nome || "—"} · CNPJ {cnpjBusca || "—"} · plano {planos.data?.find((p) => p.key === plano)?.name ?? "—"} · situação inicial{" "}
                <strong>{rascunho ? "Rascunho (não verificada)" : ORG_STATUS_LABEL.aguardando_ativacao}</strong>
              </p>
              {criada ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Empresa criada</Badge>
                  {onConvidar && (
                    <Button size="sm" onClick={onConvidar}>
                      <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                      Convidar administrador
                    </Button>
                  )}
                </div>
              ) : (
                <Button onClick={enviar} disabled={!podeCriar || criar.isPending}>
                  {criar.isPending ? "Criando…" : rascunho ? "Criar como rascunho" : "Criar empresa"}
                </Button>
              )}
            </section>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Empresas</CardTitle>
          <CardDescription>Mudanças de situação exigem motivo e ficam registradas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm space-y-1">
            <Label htmlFor="emp-filtro">Buscar empresa</Label>
            <Input id="emp-filtro" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Nome ou CNPJ" />
          </div>
          {orgs.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {orgs.isError && (
            <Button size="sm" variant="outline" onClick={() => orgs.refetch()}>Tentar novamente</Button>
          )}
          {orgs.data && lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>}
          {lista.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Empresa</TableHead>
                    <TableHead scope="col">CNPJ</TableHead>
                    <TableHead scope="col">Situação</TableHead>
                    <TableHead scope="col">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((o) => {
                    const st = o.status as OrgStatus;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">
                          {o.nome}
                          {o.nome_fantasia && <span className="block text-xs text-muted-foreground">{o.nome_fantasia}</span>}
                        </TableCell>
                        <TableCell>{o.cnpj ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline">{ORG_STATUS_LABEL[st] ?? o.status}</Badge></TableCell>
                        <TableCell className="space-x-1">
                          {ACOES_SUPERADMIN.filter((a) => transicaoPermitida(st, a) && !(st === "onboarding" && a === "ativa")).map((a) => (
                            <Button key={a} size="sm" variant="ghost" disabled={alterar.isPending} onClick={() => { setMotivo(""); setMotivoDlg({ org: o.id, status: a }); }}>
                              {ORG_STATUS_LABEL[a]}
                            </Button>
                          ))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmarTroca} onOpenChange={setConfirmarTroca}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Consultar outro CNPJ?</AlertDialogTitle>
            <AlertDialogDescription>
              Os dados vindos da consulta atual serão descartados. E-mail e plano digitados são mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { limparConsulta(); setCnpjBusca(""); }}>Consultar outro</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!motivoDlg} onOpenChange={(v) => !v && setMotivoDlg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar para “{motivoDlg ? ORG_STATUS_LABEL[motivoDlg.status] : ""}”</AlertDialogTitle>
            <AlertDialogDescription>Informe o motivo (mínimo 5 caracteres). A mudança fica registrada.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="emp-motivo">Motivo *</Label>
            <Input id="emp-motivo" value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={motivo.trim().length < 5 || alterar.isPending} onClick={(e) => { e.preventDefault(); void confirmarMudanca(); }}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
