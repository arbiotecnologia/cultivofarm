/**
 * Onboarding obrigatório da empresa no primeiro acesso do administrador.
 * Etapa 1 "Identificar empresa": apenas CNPJ + consulta à BrasilAPI
 * (Edge Function autenticada). Sem consulta válida (ou fallback manual),
 * o formulário extenso não é exibido.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { OnboardingState, useConcluirOnboarding, useSalvarOnboarding } from "@/hooks/useOrgOnboarding";
import { FUSOS_BRASIL, OnboardingDados, pendenciasOnboarding, REGIMES_TRIBUTARIOS } from "@/lib/saas/orgOnboarding";
import { validateCnpjAlpha } from "@/lib/fiscal/cnpjAlpha";
import {
  aplicarPlano, CampoAplicavel, consultarCnpjOnboarding, DadosEmpresa, FONTE_OFICIAL, ItemPlano,
  mensagemConsulta, planejarAplicacao,
} from "@/lib/saas/onboardingCnpj";
import { mensagemErroPlataforma } from "@/hooks/usePlataformaSaaS";
import { MOTIVO_REVISAO_LABEL } from "@/lib/saas/orgOnboarding";
import { supportContact } from "@/config/brand";

const suporte = supportContact();

const ETAPAS = [
  "Identificar empresa", "Dados da empresa", "Endereço e contatos",
  "Responsável", "Preferências", "Plano", "Revisão",
] as const;

type Campo = { k: keyof OnboardingDados; l: string; max?: number };
const CAMPOS: Record<number, Campo[]> = {
  1: [
    { k: "razao_social", l: "Razão social *" }, { k: "nome_fantasia", l: "Nome fantasia" },
    { k: "inscricao_estadual", l: "Inscrição estadual" },
  ],
  2: [
    { k: "cep", l: "CEP *", max: 9 }, { k: "logradouro", l: "Logradouro *" }, { k: "numero", l: "Número" },
    { k: "bairro", l: "Bairro" }, { k: "cidade", l: "Cidade *" }, { k: "uf", l: "UF *", max: 2 },
    { k: "telefone", l: "Telefone *", max: 15 }, { k: "email_contato", l: "E-mail de contato" },
  ],
  3: [{ k: "responsavel_nome", l: "Nome do responsável *" }, { k: "responsavel_cargo", l: "Cargo" }],
  4: [{ k: "idioma", l: "Idioma" }],
};

/** Códigos que habilitam o fallback manual (API indisponível ou não encontrado). */
const CODIGOS_FALLBACK = new Set(["not_found", "upstream_error", "timeout", "malformed", "too_large", "network_error", "rate_limited", "rate_limited_local", "unsupported_alpha"]);

export function OnboardingEmpresa({ state }: { state: OnboardingState }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const salvar = useSalvarOnboarding();
  const concluir = useConcluirOnboarding();
  const [etapa, setEtapa] = useState(0);
  const [d, setD] = useState<OnboardingDados>({});
  const [pronto, setPronto] = useState(false);

  // Consulta
  const [carregando, setCarregando] = useState(false);
  const [erroConsulta, setErroConsulta] = useState<string | null>(null);
  const [codigoErro, setCodigoErro] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<DadosEmpresa | null>(null); // original da consulta (memória)
  const [plano, setPlano] = useState<ItemPlano[]>([]);
  const [usarApi, setUsarApi] = useState<Set<CampoAplicavel>>(new Set());
  const [origem, setOrigem] = useState<Record<string, "manual" | "consulta">>({});

  useEffect(() => {
    const inicial: OnboardingDados = {
      razao_social: state.razao_social ?? state.nome ?? "",
      nome_fantasia: state.nome_fantasia ?? "",
      cnpj: state.cnpj ?? "",
      fuso_horario: "America/Sao_Paulo",
      idioma: "pt-BR",
      ...(state.dados ?? {}),
      confirmado: false,
    };
    setD(inicial);
    // Retomada de rascunho: pula para a primeira pendência.
    if (inicial.razao_social && inicial.cnpj && inicial.cep) {
      const pend = new Set(pendenciasOnboarding(inicial));
      const alvo = pend.has("Razão social") || pend.has("CNPJ válido") ? 1
        : pend.has("CEP") || pend.has("Endereço") || pend.has("Cidade") || pend.has("UF") || pend.has("Telefone") ? 2
        : pend.has("Responsável") ? 3 : pend.has("Fuso horário") ? 4 : 5;
      // Retomada: só a evidência registrada no servidor para este CNPJ conta como verificação.
      // Sem ela, o cadastro segue como não verificado (revisão obrigatória).
      const ev = state.evidencia;
      setEmpresa(ev && ev.vigente
        ? ({ cnpj: ev.cnpj, razao_social: ev.razao_social, situacao_cadastral: ev.situacao_cadastral } as DadosEmpresa)
        : null);
      setEtapa(alvo);
      setPronto(true);
    } else {
      setPronto(true);
    }
  }, [state]);

  const inativa = !!empresa && !!empresa.situacao_cadastral && empresa.situacao_cadastral !== "ATIVA";
  const campoBloqueado = (k: keyof OnboardingDados) => k === "cnpj" || (k === "razao_social" && !!empresa);

  if (state.status === "aguardando_revisao" || state.review_pending) {
    return <CadastroEmRevisao state={state} onSair={() => signOut()} />;
  }

  if (!state.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Empresa em ativação</CardTitle>
            <CardDescription>O administrador da empresa ainda está concluindo o cadastro. Tente novamente mais tarde.</CardDescription>
          </CardHeader>
          <CardContent><Button variant="outline" onClick={() => signOut()}>Sair</Button></CardContent>
        </Card>
      </div>
    );
  }

  if (!pronto) return null;

  const consultar = async () => {
    setErroConsulta(null);
    if (!validateCnpjAlpha(d.cnpj)) { setCodigoErro("invalid_cnpj"); setErroConsulta(mensagemConsulta("invalid_cnpj")); return; }
    setCarregando(true);
    try {
      const r = await consultarCnpjOnboarding(d.cnpj ?? "");
      if (r.codigo !== "ok" || !("dados" in r)) { setCodigoErro(r.codigo); setErroConsulta(mensagemConsulta(r.codigo)); return; }
      const p = planejarAplicacao(d, r.dados);
      const novo = aplicarPlano(d, p, new Set()); // aplica apenas campos vazios agora
      const orig: Record<string, "manual" | "consulta"> = { ...origem };
      for (const i of p) if (i.tipo === "vazio") orig[i.campo] = "consulta";
      setOrigem(orig);
      setD(novo);
      setEmpresa(r.dados);
      setPlano(p);
      setUsarApi(new Set());
      setErroConsulta(null);
    } finally {
      setCarregando(false);
    }
  };

  const aplicarEscolhas = (somenteVazios: boolean) => {
    if (!empresa) return;
    const conflitos = plano.filter((p) => p.tipo === "conflito" && p.campo !== "cnpj");
    const novo = aplicarPlano(d, plano, somenteVazios ? new Set() : usarApi);
    const orig = { ...origem };
    for (const i of conflitos) if (!somenteVazios && usarApi.has(i.campo)) orig[i.campo] = "consulta";
    setOrigem(orig);
    setD(novo);
    setPlano([]);
  };

  const trocarCnpj = () => {
    if (!window.confirm("Consultar outro CNPJ? Os valores vindos da consulta anterior serão limpos; o que você digitou manualmente será mantido.")) return;
    const novo: OnboardingDados = { ...d, cnpj: "" };
    const orig: Record<string, "manual" | "consulta"> = {};
    for (const [k, v] of Object.entries(origem)) {
      if (v === "manual") { orig[k] = v; continue; }
      // limpa somente valores originados da consulta
      (novo as Record<string, unknown>)[k] = "";
    }
    setOrigem(orig);
    setD(novo);
    setEmpresa(null);
    setPlano([]);
    setErroConsulta(null);
    setCodigoErro(null);
  };

  const preencherManualmente = () => {
    setEmpresa(null);
    setPlano([]);
    setErroConsulta(null);
    setCodigoErro(null);
    setEtapa(1);
  };

  const avancar = async () => {
    try {
      await salvar.mutateAsync({ ...d, confirmado: false });
      setEtapa((e) => Math.min(e + 1, ETAPAS.length - 1));
    } catch (e) {
      toast.error(mensagemErroPlataforma(e));
    }
  };

  const finalizar = async () => {
    const pend = pendenciasOnboarding(d);
    if (pend.length) { toast.error(`Pendências: ${pend.join(", ")}`); return; }
    if (inativa) { toast.error("Situação cadastral não ATIVA: a conclusão exige revisão da equipe CultivoFarm."); return; }
    try {
      await salvar.mutateAsync(d);
      const r = await concluir.mutateAsync();
      if (r?.status === "ativa") {
        toast.success("Cadastro concluído. Empresa ativa.");
        navigate("/", { replace: true });
      } else {
        toast.success("Cadastro enviado para revisão da equipe CultivoFarm.");
      }
    } catch (e) {
      toast.error(mensagemErroPlataforma(e));
    }
  };

  const conflitos = plano.filter((p) => p.tipo === "conflito" && p.campo !== "cnpj");
  const podeAvancarDaEtapa1 = !!empresa || etapa >= 1;
  const resumoOficial = empresa ? [
    ["Situação cadastral", empresa.situacao_cadastral], ["Matriz/filial", empresa.matriz_filial],
    ["Porte", empresa.porte], ["Natureza jurídica", empresa.natureza_juridica],
    ["Data de abertura", empresa.data_abertura],
    ["CNAE principal", [empresa.cnae_principal, empresa.cnae_descricao].filter(Boolean).join(" — ")],
  ] as const : [];

  return (
    <div className="min-h-screen bg-muted/30 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Cadastro da empresa</h1>
          <div className="space-x-2">
            {suporte ? (
              <Button variant="ghost" size="sm" asChild><a href={suporte.href} target="_blank" rel="noreferrer">{suporte.label}</a></Button>
            ) : (
              <span className="text-xs text-muted-foreground">Dúvidas? Fale com quem enviou o seu convite.</span>
            )}
            <Button variant="outline" size="sm" onClick={() => signOut()}>Sair</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Etapa {etapa + 1} de {ETAPAS.length}: {ETAPAS[etapa]}</p>

        {etapa === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Identificar empresa</CardTitle>
              <CardDescription>Informe o CNPJ para buscar os dados oficiais da empresa.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ob-cnpj">CNPJ *</Label>
                <Input id="ob-cnpj" maxLength={18} value={d.cnpj ?? ""} disabled={!!empresa}
                  onChange={(e) => setD((p) => ({ ...p, cnpj: e.target.value }))} />
              </div>
              <div className="sm:col-span-2 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {!empresa ? (
                    <Button onClick={consultar} disabled={carregando} aria-busy={carregando}>
                      {carregando ? "Consultando…" : erroConsulta ? "Tentar novamente" : "Buscar dados da empresa"}
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={trocarCnpj}>Consultar outro CNPJ</Button>
                  )}
                  {erroConsulta && codigoErro && CODIGOS_FALLBACK.has(codigoErro) && (
                    <Button variant="secondary" onClick={preencherManualmente}>Preencher manualmente</Button>
                  )}
                </div>
                <div aria-live="polite" role="status">
                  {erroConsulta && (
                    <Alert variant="destructive">
                      <AlertTitle>Consulta não concluída</AlertTitle>
                      <AlertDescription>{erroConsulta} O cadastro ficará marcado como não verificado e passará por revisão.</AlertDescription>
                    </Alert>
                  )}
                </div>
                {empresa && (
                  <section aria-label="Dados encontrados" className="rounded-md border p-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Dados encontrados</h3>
                      <Badge variant={inativa ? "destructive" : "secondary"}>{empresa.situacao_cadastral ?? "—"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{FONTE_OFICIAL}</p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {([["Razão social", empresa.razao_social], ["CNPJ", empresa.cnpj],
                        ["Matriz/filial", empresa.matriz_filial], ["Porte", empresa.porte],
                        ["Endereço", [empresa.logradouro, empresa.numero, empresa.complemento, empresa.bairro].filter(Boolean).join(", ")],
                        ["Município/UF", [empresa.cidade, empresa.uf].filter(Boolean).join("/")]] as const).map(([l, v]) => (
                        <div key={l} className="contents"><dt className="text-muted-foreground">{l}</dt><dd>{v || "—"}</dd></div>
                      ))}
                    </dl>
                    {inativa && (
                      <Alert variant="destructive">
                        <AlertTitle>Situação cadastral: {empresa.situacao_cadastral}</AlertTitle>
                        <AlertDescription>A empresa não está ATIVA. O cadastro não poderá ser concluído automaticamente; a equipe CultivoFarm fará a revisão.</AlertDescription>
                      </Alert>
                    )}
                    {empresa.socios_sugeridos.length > 0 && (
                      <p className="text-xs text-muted-foreground">Sugestões para o responsável (etapa 4): {empresa.socios_sugeridos.join(", ")}</p>
                    )}
                    {plano.length > 0 && conflitos.length > 0 && (
                      <fieldset className="space-y-2 pt-2">
                        <legend className="font-medium">Valores diferentes do que você informou</legend>
                        {conflitos.map((c) => (
                          <div key={c.campo} role="radiogroup" aria-label={c.campo} className="rounded border p-2">
                            <p className="font-medium">{c.campo}</p>
                            {(["manter", "api"] as const).map((op) => (
                              <div key={op} className="flex items-center gap-2">
                                <input type="radio" id={`cf-${c.campo}-${op}`} name={`cf-${c.campo}`}
                                  checked={op === "api" ? usarApi.has(c.campo) : !usarApi.has(c.campo)}
                                  onChange={() => setUsarApi((s) => { const n = new Set(s); if (op === "api") n.add(c.campo); else n.delete(c.campo); return n; })} />
                                <Label htmlFor={`cf-${c.campo}-${op}`} className="font-normal">
                                  {op === "manter" ? `Manter: ${c.atual}` : `Usar BrasilAPI: ${c.novo}`}
                                </Label>
                              </div>
                            ))}
                          </div>
                        ))}
                      </fieldset>
                    )}
                    {plano.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => aplicarEscolhas(true)}>Aplicar apenas campos vazios</Button>
                        {conflitos.length > 0 && <Button variant="secondary" onClick={() => aplicarEscolhas(false)}>Aplicar com minhas escolhas</Button>}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {etapa >= 1 && (
          <Card>
            <CardHeader>
              <CardTitle>{ETAPAS[etapa]}</CardTitle>
              {etapa === 1 && <CardDescription>Confira os dados oficiais e complete o que faltar.</CardDescription>}
            </CardHeader>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              {etapa === 1 && resumoOficial.length > 0 && (
                <div className="sm:col-span-2 space-y-1">
                  <p className="text-xs text-muted-foreground">{FONTE_OFICIAL}</p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    {resumoOficial.map(([l, v]) => (
                      <div key={l} className="contents"><dt className="text-muted-foreground">{l}</dt><dd>{v || "—"}</dd></div>
                    ))}
                  </dl>
                  {inativa && (
                    <Alert variant="destructive">
                      <AlertTitle>Situação cadastral: {empresa?.situacao_cadastral}</AlertTitle>
                      <AlertDescription>O cadastro não poderá ser concluído automaticamente; a equipe CultivoFarm fará a revisão.</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
              {etapa === 1 && (
                <div className="space-y-1">
                  <Label htmlFor="ob-cnpj-ro">CNPJ *</Label>
                  <Input id="ob-cnpj-ro" value={d.cnpj ?? ""} disabled />
                </div>
              )}
              {CAMPOS[etapa]?.map((c) => {
                const travado = campoBloqueado(c.k);
                const editadoOficial = travado && c.k === "razao_social" && !!empresa && d.razao_social !== empresa.razao_social;
                return (
                  <div key={c.k} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`ob-${c.k}`}>{c.l}</Label>
                      {editadoOficial && <Badge variant="secondary">Editado pelo usuário</Badge>}
                    </div>
                    {c.k === "telefone" ? (
                      <MaskedInput id={`ob-${c.k}`} mask="telefone" value={(d[c.k] as string) ?? ""}
                        onChange={(e) => setD((p) => ({ ...p, telefone: e.target.value }))} />
                    ) : (
                      <Input id={`ob-${c.k}`} maxLength={c.max ?? 200} value={(d[c.k] as string) ?? ""}
                        type={c.k === "email_contato" ? "email" : "text"}
                        autoComplete={c.k === "email_contato" ? "email" : undefined}
                        onChange={(e) => setD((p) => ({ ...p, [c.k]: c.k === "email_contato" ? e.target.value.toLowerCase() : e.target.value }))}
                        readOnly={travado} aria-readonly={travado} />
                    )}
                  </div>
                );
              })}
              {etapa === 1 && (
                <div className="space-y-1">
                  <Label htmlFor="ob-regime_tributario">Regime tributário</Label>
                  <Select value={d.regime_tributario ?? ""} onValueChange={(value) => setD((p) => ({ ...p, regime_tributario: value }))}>
                    <SelectTrigger id="ob-regime_tributario"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{REGIMES_TRIBUTARIOS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {etapa === 4 && (
                <div className="space-y-1">
                  <Label htmlFor="ob-fuso_horario">Fuso horário *</Label>
                  <Select value={d.fuso_horario ?? ""} onValueChange={(value) => setD((p) => ({ ...p, fuso_horario: value }))}>
                    <SelectTrigger id="ob-fuso_horario"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{FUSOS_BRASIL.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {etapa === 1 && !empresa && (
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Cadastro não verificado: os dados serão revisados pela equipe CultivoFarm antes da ativação.
                </p>
              )}
              {etapa === 5 && (
                <div className="sm:col-span-2 text-sm">
                  Plano contratado: <strong>{state.plano ?? "—"}</strong>
                  <p className="text-muted-foreground">Alterações de plano são feitas pela equipe CultivoFarm.</p>
                </div>
              )}
              {etapa === 6 && (
                <div className="sm:col-span-2 space-y-3 text-sm">
                  <dl className="grid grid-cols-2 gap-1">
                    {Object.values(CAMPOS).flat().map((c) => (
                      <div key={c.k} className="contents">
                        <dt className="text-muted-foreground">{c.l.replace(" *", "")}</dt>
                        <dd>{(d[c.k] as string) || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  {!empresa && (
                    <Alert>
                      <AlertTitle>Dados não verificados</AlertTitle>
                      <AlertDescription>Este cadastro foi preenchido manualmente e passará por revisão antes da ativação.</AlertDescription>
                    </Alert>
                  )}
                  <div className="flex items-center gap-2">
                    <Checkbox id="ob-conf" checked={d.confirmado === true} onCheckedChange={(v) => setD((p) => ({ ...p, confirmado: v === true }))} />
                    <Label htmlFor="ob-conf" className="font-normal">Confirmo que os dados estão corretos.</Label>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between">
          <Button variant="outline" disabled={etapa === 0} onClick={() => setEtapa((e) => e - 1)}>Voltar</Button>
          {etapa < ETAPAS.length - 1 ? (
            <Button onClick={avancar} disabled={salvar.isPending || (etapa === 0 && !podeAvancarDaEtapa1)}>
              {etapa === 0 ? "Continuar" : "Salvar e continuar"}
            </Button>
          ) : (
            <Button onClick={finalizar} disabled={salvar.isPending || concluir.isPending || d.confirmado !== true}>
              Concluir cadastro
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Empresa aguardando revisão: sem edição nem reenvio; liberação só pela equipe CultivoFarm. */
function CadastroEmRevisao({ state, onSair }: { state: OnboardingState; onSair: () => void }) {
  const motivo = state.review?.motivo_codigo ? MOTIVO_REVISAO_LABEL[state.review.motivo_codigo] : null;
  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Cadastro em revisão</CardTitle>
          <CardDescription>
            {state.is_admin
              ? "Recebemos o cadastro da empresa. A equipe CultivoFarm vai revisá-lo antes de liberar o acesso, inclusive à Central Fiscal."
              : "O cadastro da empresa está em revisão pela equipe CultivoFarm. O acesso será liberado após a aprovação."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.is_admin && motivo && (
            <p className="text-sm"><span className="text-muted-foreground">Motivo da revisão: </span>{motivo}</p>
          )}
          {state.is_admin && state.review?.submetido_em && (
            <p className="text-sm text-muted-foreground">Enviado em {new Date(state.review.submetido_em).toLocaleString("pt-BR")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {suporte && <Button variant="ghost" asChild className="min-h-11"><a href={suporte.href} target="_blank" rel="noreferrer">{suporte.label}</a></Button>}
            <Button variant="outline" className="min-h-11" onClick={onSair}>Sair</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
