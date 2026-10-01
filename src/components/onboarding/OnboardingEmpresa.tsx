/**
 * Onboarding obrigatório da empresa no primeiro acesso do administrador.
 * Enquanto incompleto, AppLayout renderiza apenas esta tela (sem módulos).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { OnboardingState, useConcluirOnboarding, useSalvarOnboarding } from "@/hooks/useOrgOnboarding";
import { OnboardingDados, pendenciasOnboarding } from "@/lib/saas/orgOnboarding";
import { mensagemErroPlataforma } from "@/hooks/usePlataformaSaaS";

const ETAPAS = ["Identificação", "Dados fiscais", "Endereço e contatos", "Responsável", "Preferências", "Plano", "Revisão"] as const;

type Campo = { k: keyof OnboardingDados; l: string; max?: number };
const CAMPOS: Record<number, Campo[]> = {
  0: [{ k: "razao_social", l: "Razão social *" }, { k: "nome_fantasia", l: "Nome fantasia" }],
  1: [{ k: "cnpj", l: "CNPJ *", max: 18 }, { k: "inscricao_estadual", l: "Inscrição estadual" }, { k: "regime_tributario", l: "Regime tributário" }],
  2: [
    { k: "cep", l: "CEP *", max: 9 }, { k: "logradouro", l: "Logradouro *" }, { k: "numero", l: "Número" },
    { k: "bairro", l: "Bairro" }, { k: "cidade", l: "Cidade *" }, { k: "uf", l: "UF *", max: 2 },
    { k: "telefone", l: "Telefone *", max: 20 }, { k: "email_contato", l: "E-mail de contato" },
  ],
  3: [{ k: "responsavel_nome", l: "Nome do responsável *" }, { k: "responsavel_cargo", l: "Cargo" }],
  4: [{ k: "fuso_horario", l: "Fuso horário *" }, { k: "idioma", l: "Idioma" }],
};

export function OnboardingEmpresa({ state }: { state: OnboardingState }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const salvar = useSalvarOnboarding();
  const concluir = useConcluirOnboarding();
  const [etapa, setEtapa] = useState(0);
  const [d, setD] = useState<OnboardingDados>({});

  useEffect(() => {
    setD({
      razao_social: state.razao_social ?? state.nome ?? "",
      nome_fantasia: state.nome_fantasia ?? "",
      cnpj: state.cnpj ?? "",
      fuso_horario: "America/Sao_Paulo",
      idioma: "pt-BR",
      ...(state.dados ?? {}),
      confirmado: false,
    });
  }, [state]);

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
    try {
      await salvar.mutateAsync(d);
      await concluir.mutateAsync();
      toast.success("Cadastro concluído. Empresa ativa.");
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(mensagemErroPlataforma(e));
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Cadastro da empresa</h1>
          <div className="space-x-2">
            <Button variant="ghost" size="sm" asChild><a href="mailto:suporte@cultivofarm.com.br">Suporte</a></Button>
            <Button variant="outline" size="sm" onClick={() => signOut()}>Sair</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Etapa {etapa + 1} de {ETAPAS.length}: {ETAPAS[etapa]}</p>
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            {CAMPOS[etapa]?.map((c) => (
              <div key={c.k} className="space-y-1">
                <Label htmlFor={`ob-${c.k}`}>{c.l}</Label>
                <Input id={`ob-${c.k}`} maxLength={c.max ?? 200} value={(d[c.k] as string) ?? ""}
                  onChange={(e) => setD((p) => ({ ...p, [c.k]: e.target.value }))} />
              </div>
            ))}
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
                <div className="flex items-center gap-2">
                  <Checkbox id="ob-conf" checked={d.confirmado === true} onCheckedChange={(v) => setD((p) => ({ ...p, confirmado: v === true }))} />
                  <Label htmlFor="ob-conf" className="font-normal">Confirmo que os dados estão corretos.</Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="flex justify-between">
          <Button variant="outline" disabled={etapa === 0} onClick={() => setEtapa((e) => e - 1)}>Voltar</Button>
          {etapa < ETAPAS.length - 1 ? (
            <Button onClick={avancar} disabled={salvar.isPending}>Salvar e continuar</Button>
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
