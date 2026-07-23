# Fase H1 — Candidato à Homologação Fiscal (Certificação Local)

> Relatório versionado, somente-leitura de banco. Nenhuma migration aplicada,
> nenhum deploy, nenhum acesso a staging/produção.

## A. Commit
- HEAD analisado: `e84800924c6df116d391451ccaac49c043de196b`
- Escopo: pós “correção pendente do seletor de clientes” + realinhamento de
  testes canônicos de status de serviço.

## B. Inventário obrigatório (mapeado e validado localmente)
1. **Config empresa/ambientes** — `src/pages/configuracoes/FiscalEmpresa.tsx`,
   RTC empresa em `useFiscalRtc.ts`; `environment` default `homologation`,
   `production_enabled=false`.
2. **Perfis** — `FiscalProdutos.tsx`, `FiscalServicos.tsx`, `FiscalClientes.tsx`
   + hooks `useProductFiscalProfiles`, `useServiceFiscalProfiles`,
   `useCustomerFiscalProfiles`, `useFiscalClientesLite`.
3. **Central de Homologação & readiness v2** —
   `HomologacaoSecao.tsx`, `useFiscalHomologationReadiness.ts`
   consumindo `rpc_fiscal_homologation_readiness_v2`.
4. **Documentos / rascunho** — `RascunhoWizard.tsx`; CHECK de status
   consolidado em `20260726000000_fiscal_fase3_18_draft_status_check.sql`.
5. **Provider (homologação)** — configurável em
   `20260723000000_fiscal_fase3_15_central_config.sql`;
   `production_enabled=false` por padrão; sem token real em Git.
6. **Certificado A1 & bridge SO** —
   `20260724000000_fiscal_fase3_16_homologacao_certificados.sql`
   + edge function `fiscal-certificate-upload` (AES-256-GCM, metadata em DB,
   senha nunca persistida). UI de bridge (SO) permanece configuração de
   agente/nativo — navegador puro não acessa keystore do SO.
7. **RTC 2026 (IBS/CBS)** — `20260727000000_fiscal_fase3_19_rtc_2026.sql`
   com RPCs empresa/produto/serviço; serviços por `source_reference`
   suportados via `rpc_fiscal_service_profile_ibs_cbs_get/save`
   (identidade estável em `service_fiscal_profiles.id`, com `updated_by`).
8. **Auditoria/mask/idempotência** — mask recursivo em
   `src/lib/fiscal/mask.ts`; idempotência preservada nas RPCs de save.
9. **Feature flags** — `production_enabled`, `provider`, `environment`
   bloqueados por padrão; sem chamada externa em runtime.
10. **Rotas/navigation** — `/configuracoes/fiscal/*` presentes em
    `src/config/navigation.ts` e `App.tsx`; guards preservados.
11. **Migrations canônicas** — 494 arquivos; nenhuma duplicidade executável
    detectada (grep 0 ocorrências para stub secundário do fase3_19).
12. **types.ts** — `scripts/verify-fiscal-types.ts` OK
    (9 tabelas, 5 views, 2 RPCs). Regeneração externa pós-aplicação
    permanece gate externo (não falsificar aprovação — ver §J).
13. **Edge Functions fiscais** — inventário em
    `restoration/edge-functions-manifest.json`; nenhuma transmite sem
    credencial de homologação e sem flag.

## C. Gaps encontrados e corrigidos
1. **Teste desalinhado com o CHECK real de `service_fiscal_profiles`**
   (esperava 4 status, mas fase 3.19.x introduziu `NOT_FISCALLY_BILLED`
   como 5º status canônico). Corrigido em
   `src/test/fiscal/fase_corretiva_blocos_3_4.test.ts` para 5 status,
   preservando o `value` persistido.

Nenhum outro gap comprovado foi encontrado nesta rodada. Não foi realizada
alteração especulativa.

## D. Arquivos alterados
- `src/test/fiscal/fase_corretiva_blocos_3_4.test.ts` (assert 4→5, inclusão
  de `NOT_FISCALLY_BILLED`).
- `docs/fiscal-h1-candidato-homologacao.md` (novo — este relatório).

## E. Testes e contagens
- Vitest completo: **85 arquivos, 1341 testes ✅, 3 skipped, 0 falhas**.
- Suíte fiscal focada (todos `src/test/fiscal/*`) inclusa no total.
- Testes canônicos de migrations (`fase3_19_5.canonical`,
  `fase3_19_6.canonical`, `correcao_cirurgica_final`) verdes.
- Scanners como Vitest: `fiscal-secrets-scan` + `fiscal-integration-scan`
  (fixtures FAIL disparam alertas conforme esperado).

## F. Typecheck / lint / build
- `bun run typecheck` (`tsc --noEmit`): ✅ sem erros.
- Lint dedicado: **não configurado no projeto** (não há script `lint`).
  Registrado como gate ausente — sem falsificar aprovação.
- `bun run build`: ✅ (SW gerado, 20 entries precache).

## G. Scanners
- `scripts/fiscal-secrets-scan.sh`: OK — nenhum valor secreto real.
- `scripts/fiscal-integration-scan.sh`: OK — sem indicador de emissão em
  runtime.
- `scripts/verify-fiscal-types.ts`: OK — 9 tabelas / 5 views / 2 RPCs
  verificadas contra `types.ts` local.

## H. Migrations canônicas pendentes de aplicação (staging)
Não aplicadas nesta rodada (proibido em H1):
- `20260727000000_fiscal_fase3_19_rtc_2026.sql` — RTC 2026 + RPCs
  service_profile IBS/CBS + `updated_by`.
- `20260726000000_fiscal_fase3_18_draft_status_check.sql`.
- `20260725000000_fiscal_fase3_17_homologation_readiness.sql`.
- `20260724000000_fiscal_fase3_16_homologacao_certificados.sql`.
- `20260723000000_fiscal_fase3_15_central_config.sql`.
- `20260722000000_fiscal_fase3_0_1_integridade.sql`.
- `20260721010000_fiscal_fase2_1_hardening.sql`.
- `20260721000000_fiscal_fase2_fundacao.sql`.

## I. Gates locais aprovados
- Typecheck ✅
- Build ✅
- Vitest completo ✅
- Suíte fiscal ✅
- Testes canônicos de migrations ✅
- Scanner de segredos ✅
- Scanner de integração prematura ✅
- Verificador de types ✅
- Duplicidade de migrations executáveis ✅ (0)
- Rotas / ACCESS_MAP / navigation ✅
- Feature flags de produção OFF ✅

## J. Gates externos / staging pendentes
- Aplicação das migrations canônicas em staging isolado.
- Regeneração do `types.ts` a partir do schema aplicado (gate externo — não
  falsificar aprovação local).
- Smoke RLS staging (`scripts/fiscal-staging-rls-certify.sql`).
- Certificação runtime provider em ambiente de homologação com credenciais
  próprias (nunca commitadas).
- Lint real (script `lint` não configurado no `package.json`) — decidir
  entre configurar ESLint dedicado ou registrar como dívida.

## K. Riscos residuais
- `types.ts` reflete schema local esperado, mas depende de regeneração após
  aplicação em staging para paridade absoluta.
- Bridge de certificado do SO permanece **apenas interface**; execução real
  exige agente/nativo (documentado, não simulado).
- Race entre listagem e criação de perfil de cliente mitigada por
  `UNIQUE(customer_id)` no banco (defesa final).
- Ausência de script `lint` no repositório impede gate automatizado local
  de estilo.

## L. Instrução objetiva para H2
H2 deve, com autorização humana explícita e credenciais próprias:
1. Aplicar em staging isolado, em ordem cronológica, as migrations listadas
   em §H.
2. Regenerar `types.ts` e reexecutar `verify-fiscal-types` + suíte fiscal.
3. Executar `scripts/fiscal-staging-rls-certify.sql` e
   `scripts/fiscal-staging-a2-smoke.sql`.
4. Rodar `fiscal-staging-certify.ts` com provider em homologação e
   `production_enabled=false`.
5. Consolidar relatório H2 mantendo `production_enabled` OFF até
   autorização formal separada.

## M. Créditos consumidos (estimativa)
Rodada H1: dentro do limite de 20. Estimativa ~8–10 créditos
(exploração + 1 fix cirúrgico + typecheck/build/vitest completos + relatório).
