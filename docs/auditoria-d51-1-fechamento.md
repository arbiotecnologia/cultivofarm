# Auditoria D51.1 — fechamento técnico antes do E2E

Data da execução: 2026-10-02  
Supabase canônico: `swzpzcwiasxmjutrmvkm`  
Escopo encerrado sem E2E real, e-mail, criação de usuário, pedido, publicação do aplicativo ou D52.

## 1. Decisão

**BLOQUEADO para o Gate E2E controlado somente pela proteção contra senhas vazadas.**

O código, o build e as suítes estão verdes, e o P0 encontrado no provisionamento foi corrigido. Resta um requisito externo/manual:

1. a proteção contra senhas vazadas continua desativada e o ambiente disponível não expôs mecanismo oficial seguro para habilitá-la; requer ação no Dashboard.

O mecanismo de migration executou sete diagnósticos `select 1`, registrando migrations no-op no ledger. A revisão de reconciliação confirmou equivalência integral 1:1 com o repositório. Elas não alteram dados ou schema e ficam formalmente aceitas e preservadas como dívida histórica rastreável, não como P0/P1 aberto.

Não há P0/P1 funcional D51/SaaS conhecido além desses bloqueios operacionais de fechamento. A homologação real de Auth/SMTP continua proibida até nova revisão.

## 2. Diagnóstico inicial e diferenças do D51

O relatório D51 anterior registrava seis falhas estáticas na suíte global, timestamps locais inválidos `20261038...`, divergência entre objetos canônicos e ledger, 492 advisors históricos e proteção contra senhas vazadas desativada.

Nesta rodada:

- os seis contratos estáticos foram atualizados sem remover testes nem relaxar os invariantes de segurança;
- os arquivos inválidos `20261038000000_d51_provisioning_fencing.sql` e `20261038001000_d51_admin_password_tenant_guard.sql` foram removidos do diretório de migrations, pois seu conteúdo já estava representado por forward-fixes canônicos válidos;
- o ledger oficial foi consultado e não contém versões `20261038...`;
- foi encontrado um P0 real: a finalização do provisionamento ainda comprovava origem por `raw_user_meta_data`;
- o P0 foi corrigido para usar `auth.users.raw_app_meta_data.provisioning_request_id`;
- a suíte global passou integralmente;
- os 492 advisors permaneceram numericamente iguais, sem achado novo introduzido.

## 3. Ledger e equivalência dos objetos

### Estado canônico confirmado

As versões efetivas relacionadas ao D51 no ledger são:

- `20261002001921` — fencing, claim/finalize/fail e estrutura de provisionamento;
- `20261002001946` — ajustes complementares;
- `20261002002408` — guard server-side de alteração de senha por tenant;
- `20261002003844` — forward-fix desta rodada para origem Auth em `raw_app_meta_data` e revogação da assinatura antiga de claim.

Não existem entradas `20261038...` no ledger. Os objetos canônicos foram comparados com os SQLs versionados quanto a colunas, índices, constraints, assinaturas, `SECURITY DEFINER`, `search_path`, grants e policies relevantes. A tabela `platform_org_admin_invites` possui identidade de request, lease/fencing, contador/status/erro, unicidade por request e e-mail normalizado, índice parcial de lease e leitura de plataforma restrita.

As RPCs internas `platform_claim_org_admin_provisioning`, `platform_find_org_admin_provisioning`, `platform_finalize_org_admin_provisioning`, `platform_fail_org_admin_provisioning` e `admin_can_update_user_password_server` estão restritas a `service_role`. A autorização do ator superadmin e o vínculo tenant são verificados no servidor.

### Entradas no-op registradas

Durante a tentativa de inspeção/reconciliação pelo mecanismo disponível, foram executados e registrados sete arquivos contendo somente `select 1`:

- `20261002004011_d60b62cb-875d-457f-8ad2-385fb3e39425.sql`;
- `20261002004039_61d58032-a1ef-4719-a466-6a95e76019f1.sql`;
- `20261002004819_410b2ad1-3b28-49de-99df-4896344381ed.sql`;
- `20261002004944_42af9cd4-02b4-42fc-b95a-51239aa19877.sql`;
- `20261002005018_332c6bb8-fb9d-4c1a-b296-c5b40f885507.sql`;
- `20261002005053_8949b0cd-981a-4e91-b08a-331b4c141ed3.sql`;
- `20261002005119_c837b479-a25b-4c71-b06b-210b1e8b0991.sql`.

Consulta somente leitura ao ledger canônico confirmou a versão `20261002005119`, com o nome `c837b479-a25b-4c71-b06b-210b1e8b0991`, além das outras seis versões listadas. Quantidade real: **7 no ledger e 7 no repositório**. A inspeção byte a byte normalizada confirmou que cada arquivo contém exclusivamente `select 1`, sem DDL ou DML.

Essas entradas não modificaram schema ou dados. Foram preservadas localmente para que repositório e ledger permaneçam convergentes. Não houve inserção manual em `supabase_migrations.schema_migrations`, remoção de linha, reaplicação SQL ou `migration repair`.

**Decisão formal de tratamento:** os sete no-ops são aceitos como dívida histórica rastreável e permanecem preservados 1:1 no repositório e no ledger. Qualquer divergência futura de versão, nome, quantidade ou conteúdo volta a ser bloqueio P1 até reconciliação oficial.

## 4. P0 corrigido

`platform_finalize_org_admin_provisioning` validava a origem do Auth user por `raw_user_meta_data.provisioning_request_id`. Metadado editável pelo usuário não pode ser usado para autorização ou adoção de conta.

O forward-fix `20261002003844_e58b7b7b-97f0-4dda-9e48-a6257d7c614c.sql` passou a exigir `raw_app_meta_data.provisioning_request_id`, mantendo:

- conta Auth, e-mail e request de origem coincidentes;
- lease vigente e token de fencing;
- idempotência do estado terminal;
- bloqueio de superadmin como administrador operacional;
- conflito para vínculo com outro tenant/papel;
- `SECURITY DEFINER` com `search_path=''`;
- EXECUTE somente para `service_role`;
- revogação da assinatura antiga de claim.

Rollback destrutivo não é recomendado. O forward-fix seguro é manter a função atual; se o fluxo precisar ser suspenso, revogar temporariamente EXECUTE das RPCs internas e desabilitar a Edge Function, sem apagar intenções ou vínculos.

## 5. As seis falhas antigas

1. `fase-provider-settings-corr.test.ts`: passou a admitir somente a allowlist explícita de funções `verify_jwt=false`; cada exceção exige verificação interna aprovada (`getClaims`) ou assinatura Meta no webhook.
2. `fase4.test.ts`: recebeu o mesmo contrato positivo e fail-closed; uma nova função sem verificação interna continua causando falha.
3. `catalogo-fase28a-pos-certificacao.test.ts`: substituiu contagem/lista congelada por presença do baseline, nomes numéricos de 14 dígitos e versões únicas.
4. `estoque-contratos-fase28c.test.ts`: mesma mudança para invariantes estruturais, sem permitir colisão de versão.
5. `estoque-fase28b-auditoria.test.ts`: mesma mudança, preservando a exigência das migrations de baseline.
6. `h7p-repo-only-migrations.static.test.ts`: removeu teto numérico obsoleto e manteve manifesto, formato e unicidade. O teste D51 passou a apontar para os forward-fixes reais e exigir `raw_app_meta_data`.

Resultado: suíte global com 342 arquivos aprovados, 1 ignorado; 5.281 testes aprovados e 4 ignorados.

## 6. Advisors D51/SaaS

### Antes e depois

- 17 INFO — RLS habilitada sem policy;
- 2 WARN — `SECURITY DEFINER` executável por PUBLIC/anon;
- 472 WARN — `SECURITY DEFINER` executável por authenticated;
- 1 WARN — leaked password protection desativada.

Delta: **0**. O forward-fix não introduziu achados.

Os dois executáveis públicos foram identificados nominalmente como:

- `rpc_validar_comprovante_entrega(uuid)`;
- `rpc_validar_rastreio_produto(uuid)`.

São endpoints públicos por token, com rate limit antes da leitura, não pertencem ao pipeline SaaS D51 e não foram alterados nesta rodada.

Na triagem SaaS, as RPCs internas de claim/find/finalize/fail e guard de senha são `service_role` only. `platform_create_organization` e `platform_set_organization_status` verificam superadmin por `auth.uid()`. `org_onboarding_state/save/complete` derivam a organização do perfil autenticado, usam allowlist e não aceitam troca livre de `organization_id`. Funções fiscais observadas mantêm escopo por organização; nenhuma evidência comprovou P0/P1 D51 que justificasse alteração ampla nos 472 avisos históricos.

`platform_register_org_admin` permanece como função legada restrita a `service_role`; não é o orquestrador atual e não foi criada estrutura paralela.

## 7. JWT, senha e recovery

As únicas funções com `verify_jwt=false` são:

- `whatsapp-status-webhook`, autenticada por assinatura `x-hub-signature-256`;
- `platform-complete-first-access`, que exige Authorization e valida claims no servidor;
- `onboarding-cnpj-lookup`, que exige Authorization e valida claims no servidor.

Chamadas negativas com JWT inválido retornaram HTTP 401, sem mutação:

- `platform-complete-first-access`: `invalid_jwt`, etapa `auth_claims`;
- `onboarding-cnpj-lookup`: `bad_jwt`;
- `platform-invite-org-admin`: `UNAUTHORIZED_INVALID_JWT_FORMAT`;
- `admin-update-user-password`: `UNAUTHORIZED_INVALID_JWT_FORMAT`.

Não foram usados ou registrados senha, token, OTP ou link completo. Não houve sessão autenticada real nesta rodada.

## 8. Proteção contra senhas vazadas

Permanece **desativada**. O ambiente não disponibilizou API/CLI oficial autenticada para alterar a configuração com segurança. Não foi feito contorno por SQL ou alteração de política incompatível.

Passo manual obrigatório: no Dashboard do projeto canônico, abrir **Authentication → Settings → Password Security**, habilitar **Leaked password protection** e salvar. Depois, reexecutar o linter e confirmar que o aviso desapareceu, preservando as regras atuais de senha.

## 9. Arquivos alterados

- `roadmap.md`;
- `docs/auditoria-d51-1-fechamento.md`;
- `src/test/catalogo/catalogo-fase28a-pos-certificacao.test.ts`;
- `src/test/comunicacao/fase-provider-settings-corr.test.ts`;
- `src/test/comunicacao/fase4.test.ts`;
- `src/test/estoque/estoque-contratos-fase28c.test.ts`;
- `src/test/estoque/estoque-fase28b-auditoria.test.ts`;
- `src/test/saas/d51-gate.test.ts`;
- `src/test/security/h7p-repo-only-migrations.static.test.ts`;
- `supabase/migrations/20261002003844_e58b7b7b-97f0-4dda-9e48-a6257d7c614c.sql`;
- os sete arquivos no-op listados na seção de ledger;
- removidos os dois arquivos locais inválidos `20261038...`.

Nenhum arquivo de aplicação foi publicado e nenhuma Edge Function foi implantada nesta rodada de fechamento.

## 10. Certificação executada

- `npx tsgo -p tsconfig.app.json` — exit 0.
- sete contratos focados — exit 0; 142/142.
- `npx vitest run src/test/saas src/test/config/authProviderCallback.test.tsx src/test/config/edgeFunctionsJwtGate.test.ts` — exit 0; 147/147.
- `npx vitest run` — exit 0; 5.281 aprovados, 4 ignorados.
- `npx deno test --allow-env --allow-net supabase/functions/onboarding-cnpj-lookup/core_test.ts` — exit 0; 11/11.
- `npx vite build` — exit 0; warnings não bloqueantes de chunk/import dinâmico e Browserslist.
- linter/advisors — 492 achados históricos, delta zero.
- grants das RPCs D51 — internos restritos a `service_role`; funções chamadas por usuário mantêm autorização interna.
- chamadas negativas das quatro Edge Functions — HTTP 401, sem mutação.

## 11. Dados e riscos restantes

Não foi criado usuário, convite, organização, pedido ou outro dado funcional de teste. Não houve e-mail, senha real, processamento de pedido, publicação do app ou avanço para D52.

Riscos restantes:

1. leaked password protection precisa ser habilitada manualmente;
2. sete migrations no-op permanecem como dívida histórica aceita e rastreável, com correspondência 1:1 entre ledger e repositório;
3. os 492 advisors globais exigem programa separado; os dois endpoints públicos foram classificados, e nenhum P0/P1 SaaS adicional foi comprovado;
4. concorrência real, crash Auth↔Postgres, reenvio simultâneo, recovery e tenant A/B ainda dependem do Gate E2E controlado e não foram simulados com contas reais.

## 12. Próxima decisão

Após habilitar leaked password protection, reexecutar o linter. A reconciliação dos no-ops está concluída e não resta outro P0/P1 D51/SaaS conhecido. Só então o D51.1 poderá ser reclassificado como **APTO PARA GATE E2E CONTROLADO**.

Até lá: não criar conta descartável, não enviar e-mail, não processar pedido, não publicar e não avançar para D52.