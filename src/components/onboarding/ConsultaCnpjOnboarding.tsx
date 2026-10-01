import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import type { OnboardingDados } from "@/lib/saas/orgOnboarding";
import { validateCnpjAlpha } from "@/lib/fiscal/cnpjAlpha";
import {
  aplicarPlano, CampoAplicavel, consultarCnpjOnboarding, DadosEmpresa, FONTE_OFICIAL, ItemPlano,
  mensagemConsulta, planejarAplicacao, ROTULOS,
} from "@/lib/saas/onboardingCnpj";

interface Props {
  dados: OnboardingDados;
  travado: boolean;
  onAplicar: (novo: OnboardingDados, empresa: DadosEmpresa) => void;
  onConsultarOutro: () => void;
}

export function ConsultaCnpjOnboarding({ dados, travado, onAplicar, onConsultarOutro }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<DadosEmpresa | null>(null);
  const [plano, setPlano] = useState<ItemPlano[]>([]);
  const [usarApi, setUsarApi] = useState<Set<CampoAplicavel>>(new Set());

  const buscar = async () => {
    setErro(null);
    if (!validateCnpjAlpha(dados.cnpj)) { setErro(mensagemConsulta("invalid_cnpj")); return; }
    setCarregando(true);
    try {
      const r = await consultarCnpjOnboarding(dados.cnpj ?? "");
      if (r.codigo !== "ok" || !("dados" in r)) { setErro(mensagemConsulta(r.codigo)); return; }
      setEmpresa(r.dados);
      setPlano(planejarAplicacao(dados, r.dados));
      setUsarApi(new Set());
    } finally {
      setCarregando(false);
    }
  };

  const aplicar = (somenteVazios: boolean) => {
    if (!empresa) return;
    onAplicar(aplicarPlano(dados, plano, somenteVazios ? new Set() : usarApi), empresa);
    setPlano([]);
  };

  const conflitos = plano.filter((p) => p.tipo === "conflito" && p.campo !== "cnpj");
  const inativa = empresa && empresa.situacao_cadastral !== "ATIVA";

  return (
    <div className="sm:col-span-2 space-y-3">
      <div className="flex flex-wrap gap-2">
        {!travado ? (
          <Button type="button" variant="secondary" onClick={buscar} disabled={carregando} aria-busy={carregando}>
            {carregando ? "Consultando…" : erro ? "Tentar novamente" : "Buscar dados da empresa"}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => { setEmpresa(null); setPlano([]); onConsultarOutro(); }}>
            Consultar outro CNPJ
          </Button>
        )}
      </div>
      <div aria-live="polite" role="status">
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
      </div>

      {empresa && (
        <section aria-label="Dados encontrados" className="rounded-md border p-3 space-y-2 text-sm">
          <h3 className="font-medium">Dados encontrados</h3>
          <p className="text-xs text-muted-foreground">{FONTE_OFICIAL}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            {([
              ["Razão social", empresa.razao_social], ["CNPJ", empresa.cnpj],
              ["Situação cadastral", empresa.situacao_cadastral], ["Matriz/filial", empresa.matriz_filial],
              ["Porte", empresa.porte], ["Natureza jurídica", empresa.natureza_juridica],
              ["Data de abertura", empresa.data_abertura],
              ["CNAE principal", [empresa.cnae_principal, empresa.cnae_descricao].filter(Boolean).join(" — ")],
              ["Endereço", [empresa.logradouro, empresa.numero, empresa.complemento, empresa.bairro].filter(Boolean).join(", ")],
              ["Município/UF", [empresa.cidade, empresa.uf].filter(Boolean).join("/")],
            ] as const).map(([l, v]) => (
              <div key={l} className="contents"><dt className="text-muted-foreground">{l}</dt><dd>{v || "—"}</dd></div>
            ))}
          </dl>
          {inativa && (
            <Alert variant="destructive">
              <AlertTitle>Situação cadastral: {empresa.situacao_cadastral ?? "desconhecida"}</AlertTitle>
              <AlertDescription>A empresa não está ATIVA. O cadastro não poderá ser concluído automaticamente; a equipe CultivoFarm fará a revisão.</AlertDescription>
            </Alert>
          )}
          {empresa.socios_sugeridos.length > 0 && (
            <p className="text-xs text-muted-foreground">Sugestões para o responsável (etapa 4): {empresa.socios_sugeridos.join(", ")}</p>
          )}

          {plano.length > 0 && (
            <div className="space-y-2 pt-2">
              {conflitos.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="font-medium">Valores diferentes do que você informou</legend>
                  {conflitos.map((c) => (
                    <div key={c.campo} role="radiogroup" aria-label={ROTULOS[c.campo]} className="rounded border p-2">
                      <p className="font-medium">{ROTULOS[c.campo]}</p>
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
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => aplicar(true)}>Aplicar apenas campos vazios</Button>
                {conflitos.length > 0 && <Button type="button" variant="secondary" onClick={() => aplicar(false)}>Aplicar com minhas escolhas</Button>}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
