# Fiscal — Redução de base: Fases C6 a C9

Projeto canônico: `swzpzcwiasxmjutrmvkm`. Emissão de produção permanece desativada (`fiscalEmissionEnabled=false`, `tpAmb=2`). Nada publicado.

## C6 — XML: PIS/COFINS por CST e modalidade da base

`supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts`:

- Novo dispatch fail-closed de PIS e COFINS por CST:
  - CST `01`/`02` → `PISAliq` / `COFINSAliq` (CST, vBC, alíquota, valor);
  - CST `04`–`09` → `PISNT` / `COFINSNT`;
  - qualquer outro CST → erro técnico `NFE_<tributo>_CST_UNSUPPORTED` (geração bloqueada, nunca CST incompatível dentro do grupo de alíquota).
- Erros adicionais: `CST_MISSING` (snapshot sem CST), `NT_WITH_VALUE` (CST não tributado com valor apurado), `REDUCTION_INCOMPATIBLE` (redução com CST não tributado).
- ICMS: `modBC` deixa de ser literal. Passa a vir do snapshot (`baseModality`/`modBC`); apenas `3` (valor da operação) está homologado, qualquer outra modalidade bloqueia com `NFE_ICMS_MODBC_UNSUPPORTED`. ICMS20/`pRedBC`, ICMS00, ICMS40 e IPI permanecem inalterados.

`validateNfeXml.ts`: gramática passa a aceitar `PISNT`/`COFINSNT` como alternativa aos grupos de alíquota (cardinalidade 0..1 em cada, obrigando a presença de `PIS`/`COFINS`).

Evidência: `src/test/fiscal/nfeXmlEngine.test.ts` — 26/26 aprovados, incluindo 6 casos novos da Fase C6 (alíquota válida no XSD, NT válido no XSD, CST sem grupo, NT com valor, CST ausente e modalidade não homologada).

## C7 — E2E real

Pendente. Depende de configuração fiscal completa no banco (emitente/CNPJ) e das fixtures da C9 persistidas em homologação.

## C8 — Edge Function `fiscal-xml-engine`

Bloqueado. Não há token de implantação para o projeto canônico no ambiente, e a ferramenta gerenciada de deploy aponta para um projeto proibido. Nenhum deploy foi executado.

## C9 — Fixtures de homologação

`restoration/fiscal-reducao-base/fixtures_homologacao_v1.sql`:

- Regras com prefixo obrigatório `HML_`, fundamento e justificativa declarando "AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL";
- Guarda fail-closed: aborta se o marcador de ambiente não for o projeto canônico ou se a emissão de produção estiver habilitada;
- Fonte oficial sintética `HML_2026`; regras ICMS CST 20 com redução fixa de 60%, ICMS CST 00 pleno, PIS e COFINS;
- Execução padrão em `BEGIN … ROLLBACK`; persistir exige troca deliberada para `COMMIT`.

Evidência: execução completa no banco canônico com 5 inserções e `ROLLBACK` final — nada persistido.
