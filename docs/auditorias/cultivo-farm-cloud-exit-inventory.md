# Cultivo Farm — Inventário de saída do backend gerenciado (Lovable Cloud)

Data: 17/09/2026 (UTC)
Fase: inventário e preparação auditável. **Nenhuma migração, deploy, emissão ou escrita remota foi executada.**

Destino exclusivo e definitivo: Supabase `swzpzcwiasxmjutrmvkm` (produção real Cultivo Farm).
Origem inventariada: backend gerenciado (Lovable Cloud), reativado temporariamente **somente** para leitura.

O Cloud **não** é autoridade de schema. Nada deste inventário autoriza cópia em massa.

## 1. Inventário somente leitura da origem (Cloud)

Consultas executadas via ferramenta de leitura, sem escrita.

| Item | Resultado exato |
| --- | --- |
| Tabelas `public` (BASE TABLE) | 50 |
| Linhas em cada uma das 50 tabelas | **0** (zero, sem exceção) |
| `auth.users` | 0 |
| `storage.buckets` | 0 |
| `storage.objects` | 0 |
| Rotinas em `public` | 19 (corpos stub, ver §2) |
| Políticas RLS em `public` | 3 |
| `supabase_migrations.schema_migrations` | 21 registros |
| `public.fiscal_environment_marker` | **não existe** |

Tabelas inventariadas (todas com 0 linhas): accounts_payable, accounts_receivable, aplicacao_evidencias, aplicacao_evidencias_vinculos, aplicacoes, audit_senha_log, bank_accounts, bi_user_preferences, cliente_campos_extras, cliente_contatos, cliente_documentos, clientes, clientes_audit_log, company_fiscal_settings, configuracoes_sistema, controle_qualidade, culturas, entrega_conferencia_itens, entrega_etiquetas, entrega_termos, entregas, envase, esteira_producao_v2, estoque_movimentacoes, estoque_produto, evidencias, fazendas, financial_categories, financial_cost_centers, financial_documents, financial_settings, lotes, microorganism_technical_profiles, microrganismos, ordens_servico, ordens_servico_onfarm, os_faturamento_base, partner_accounts, partner_orders, payment_methods, portal_notifications, product_technical_profiles, produto_anexos, produtos, profiles, programacao_producao, registros_consultor, registros_consultor_recomendacoes, talhoes, user_roles.

Nenhum segredo, material de certificado ou dado pessoal foi lido ou exibido — não havia linha alguma a ler.

## 2. Diferenças que poderiam realmente faltar no canônico

Conclusão objetiva: **nenhuma.**

- Não há dados de negócio, usuários, objetos de storage ou documentos fiscais na origem para extrair.
- As 19 rotinas da origem são stubs sintéticos (retornam `gen_random_uuid()`, `NULL`, ou o payload recebido) e **não** correspondem ao motor fiscal real; o canônico possui 116 funções fiscais efetivas. Copiá-las seria regressão — ficam explicitamente **excluídas** de qualquer transferência.
- Ausência de `fiscal_environment_marker` na origem confirma que ela nunca foi ambiente fiscal válido. O canônico mantém o marcador correto: `STAGING`, `production_emission_allowed=false`.
- As 21 migrations registradas na origem pertencem ao ciclo gerenciado e **não** devem ser replayadas no canônico.

Portanto não há export seletivo a fazer: a lista de tabelas candidatas é **vazia**.

## 3. Dependências do Cloud no código e nos canais de deploy

- Runtime da aplicação: `src/integrations/supabase/client.ts` usa constantes literais do canônico, protegidas por `src/integrations/supabase/bindingGuard.ts`. Não lê `import.meta.env`.
- `supabase/config.toml` e `supabase/functions/_shared/fiscal/canonicalProject.ts`: apenas `swzpzcwiasxmjutrmvkm`.
- `dist/`: zero referências ao ref gerenciado.
- `.env` na raiz: regravado pela plataforma, contém `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do projeto gerenciado. **Nenhum arquivo de `src/`, `scripts/` ou `supabase/functions/` consome essas variáveis.** Está em `.gitignore`.
- Únicos arquivos que citam `VITE_SUPABASE`: `src/test/config/connection-binding.static.test.ts` e `src/test/config/cultivofarm-runtime.static.test.ts` — são justamente as guardas que reprovam a divergência. **Permanecem inalteradas.** A Opção B (ignorar o `.env`) **não** foi implementada.
- Canal de deploy de Edge Functions disponível no ambiente aponta para o projeto gerenciado; por isso `fiscal-xml-engine` e `fiscal-sefaz-transport` seguem **prontas para deploy e não publicadas** no canônico.

## 4. SQL somente leitura utilizado (evidência)

Todas as consultas rodaram com `SET default_transaction_read_only = on`, apenas `SELECT`:

```sql
-- tabelas public e contagem exata por tabela
select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

-- rotinas public (somente nomes)
select routine_name from information_schema.routines where routine_schema = 'public' order by routine_name;

-- políticas RLS
select tablename, policyname from pg_policies where schemaname = 'public' order by tablename, policyname;

-- storage e auth (somente metadados/contagens)
select id, public from storage.buckets order by id;
select bucket_id, count(*) from storage.objects group by bucket_id order by bucket_id;
select count(*) from auth.users;

-- migrations registradas
select version from supabase_migrations.schema_migrations order by version;
```

Nenhum valor de segredo, material de certificado ou dado pessoal foi lido — não havia linha alguma.

## 5. Artefatos desta fase

Os scripts `scripts/cloud-exit/inventory-cloud.sh` e `scripts/cloud-exit/export-selective.sh`, e o teste `src/test/config/cloudExitArtifacts.test.ts`, foram **removidos**. Motivos, registrados sem eufemismo:

- Nunca foram executados; o inventário real foi feito pelas consultas da §4.
- Não há dado algum a exportar seletivamente, então a ferramenta seria capacidade ociosa e arriscada.
- Falhas reais identificadas na auditoria do diff: o exportador interpolava `TABLES` e `OUTDIR` diretamente em SQL e no meta-comando `\copy` (injeção de identificador/caminho) e não vinculava `CLOUD_DB_URL` à origem declarada de forma robusta; o inventário validava host por substring e usava `ORDER BY 1,2` sobre projeção de coluna única.
- O teste associado era estático e superficial, dando falsa sensação de cobertura.

Permanece apenas este relatório, com o SQL e as evidências.

## 6. Edge Functions do Cloud (37) — inventário e comparação

A UI do Cloud lista **37 Edge Functions**, entidade distinta das 19 rotinas SQL da §2.

O repositório contém exatamente **37 diretórios de função** em `supabase/functions/` (além de `_shared`, que não é função):

admin-audit-produtos-orfaos, admin-update-user-password, admin-wipe-produtos-catalog, ai-generate-ficha-campo, ai-refresh-fichas, ai-sugerir-alvos, aplicar-sla-alertas, check-monitoramentos-vencidos, communication-health, communication-provider-settings, create-user, entrega-runtime-harness, entrega-termo-pdf, enviar-alertas-notificacoes, enviar-alertas-resumo, enviar-pdf-aplicacao, enviar-pdf-visita, fase-e-runtime-harness, fiscal-binding-diagnostics, fiscal-certificate-revoke, fiscal-certificate-upload, fiscal-cnpj-lookup, fiscal-event-sign, fiscal-preflight, fiscal-sefaz-transport, fiscal-xml-engine, generate-financial-receipt, generate-financial-report, gerar-alertas-operacionais, hml-b2b-runtime-harness, list-portal-users, process-communication-outbox, send-push-notification, sync-calendar-event, sync-clima, test-communication-email, whatsapp-status-webhook.

Conclusão e limite honesto: a contagem coincide (37 = 37) e todo código-fonte de função conhecido está versionado no repositório, incluindo dependências compartilhadas em `supabase/functions/_shared/`. **Não foi possível, por este canal, baixar o código efetivamente implantado no Cloud para diff byte a byte.** Portanto a afirmação máxima sustentável é: *não há função cujo nome exista só no Cloud*; a igualdade de conteúdo linha a linha não está comprovada. Se o backup/export da UI incluir o código das funções, o diff definitivo deve ser feito sobre ele antes de remover o Cloud.

Nomes de secrets referenciados pelo código das funções (**apenas nomes; nenhum valor foi lido ou exibido**): ALERTAS_CRON_SECRET, ALERTAS_NOTIFICACOES_SECRET, ALERTAS_RESUMO_SECRET, ALERTAS_SLA_SECRET, APP_URL, COMMUNICATION_ADMIN_ORIGINS, COMMUNICATION_DELIVERY_ENABLED, COMMUNICATION_INAPP_ADAPTER_ENABLED, COMMUNICATION_TEST_MODE_ENABLED, DENO_DEPLOYMENT_ID, EMAIL_DELIVERY_ENABLED, FISCAL_CERTIFICATE_MASTER_KEY, FISCAL_RELEASE_ID, GEMINI_API_KEY, GOOGLE_MAIL_API_KEY, INTERNAL_FUNCTION_SECRET, LOVABLE_API_KEY, SITE_URL, SMTP_FROM, SMTP_FROM_NAME, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT, WHATSAPP_DELIVERY_ENABLED, WHATSAPP_WEBHOOK_ENABLED.

Consequência: qualquer função reimplantada no canônico exige que os secrets equivalentes existam lá. `FISCAL_CERTIFICATE_MASTER_KEY` e `INTERNAL_FUNCTION_SECRET` são críticos e precisam ser reprovisionados por canal seguro — nunca copiados por este agente.

### Serviços do Cloud fora de tabelas e funções (limites a registrar)

- **Jobs/cron**: agendamentos configurados no Cloud (ex.: alertas, outbox de comunicação, clima) não são objetos do schema `public` e não aparecem no inventário SQL. Se existirem, precisam ser recriados no canônico; não foram lidos nesta fase.
- **E-mails**: templates de autenticação, remetente e domínio de e-mail gerenciados pelo Cloud não migram sozinhos. Entregas externas permanecem desligadas por flag.
- **Domínios/URLs**: URL de site, redirects de autenticação e domínio publicado são configuração da plataforma, não do banco.
- **Storage/auth**: no Cloud estão vazios (0 buckets, 0 objetos, 0 usuários), então não há conteúdo a preservar nessas superfícies.

Por isso **não** se afirma "nada a preservar" de forma global: afirma-se que **não há dados, usuários, objetos de storage nem DDL do Cloud a importar**, e que a verificação pendente é o diff do código implantado das 37 funções e a conferência de jobs/e-mail/domínio antes da remoção.

## 7. Pausar ou remover o Cloud — o que a UI realmente oferece

Correção de afirmação anterior: **a afirmação "não existe desvinculação" estava errada** e foi removida.

- A UI oferece, em Cloud > Advanced settings, **Remove Lovable Cloud**, com diálogo declarando exclusão **permanente** da instância, dos dados e dos backups.
- A UI também oferece **Pause**, que não apaga conteúdo.
- Remoção é destrutiva e irreversível pelo texto do próprio diálogo. **Não há garantia de reconexão** posterior — e nenhuma garantia desse tipo é feita aqui, porque não foi testada.
- Nada foi pausado nem removido nesta rodada, conforme instrução; o Export database iniciado pela UI está em andamento sob controle do proprietário.
- Enquanto o projeto existir vinculado, a plataforma continuará regravando o `.env` com o ref gerenciado, mantendo a guarda de vínculo reprovando de propósito (1 teste). Isso **não** será mascarado.
- Consequência prática: o canal gerenciado de deploy/migração permanece inútil para o canônico; migrations continuam aplicadas por `restoration/` + ledger manual, e o deploy das Edge Functions depende de canal externo autorizado.

## 8. Estado preservado

Rotas, dados e bloqueios fiscais intactos. `production_emission_allowed=false`. Nenhuma NF-e/NFS-e real transmitida. Nenhuma migration nova, nenhum deploy, nenhuma transferência. Revertida a alteração incidental de `PostgrestVersion` em `src/integrations/supabase/types.ts` (volta a `14.15`); nenhum tipo foi regenerado pelo Cloud.

## 9. Pendências para a próxima fase (aguardando auditoria do usuário)

1. Concluir o Export database da UI e, se ele contiver o código implantado, fazer o diff das 37 funções.
2. Conferir jobs/cron, configuração de e-mail e domínio antes de qualquer remoção.
3. Decidir entre Pause e Remove (Remove é permanente, sem garantia de reconexão).
4. Deploy das Edge Functions no canônico por canal autorizado, com secrets reprovisionados.
5. E2E fiscal com certificado real em homologação.

## 10. Corte real do Cloud e revínculo ao canônico (2026-09-18, pós-corte)

Executado pelo proprietário na UI, fora do agente: **Remove Lovable Cloud** (exclusão permanente de instância, dados e backups), com `get_database_status` retornando `enabled=false`; em seguida **Connect Supabase** selecionando **CultivoFarm** na organização Cultivo Farm já autorizada. O Cloud **não** deve ser reabilitado.

Backups: o export do banco e o download do código-fonte foram obtidos pelo proprietário e mantidos **fora** do Cloud. Jobs/cron no Cloud: **zero**. E-mail personalizado/domínio de e-mail: **não configurado**. O **código implantado das Edge Functions do Cloud não pôde ser comparado** (acesso negado a esse canal); portanto **não se afirma preservação byte a byte** — a garantia existente é apenas que os 37 diretórios de função estão versionados no repositório.

### Evidências desta auditoria (somente leitura; nenhum banco alterado)

| Verificação | Comando | Exit | Resultado |
| --- | --- | --- | --- |
| `.env` gerado | `sed -E 's/=.*/=<redacted>/' .env` | 0 | apenas `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`; host `swzpzcwiasxmjutrmvkm.supabase.co` (nenhum valor de chave exibido) |
| Variáveis de ambiente | `env \| grep -oE '^(SUPABASE\|VITE_SUPABASE)[A-Z_]*'` | 0 | ref efetivo `swzpzcwiasxmjutrmvkm` em `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID` |
| Configuração local | `head -2 supabase/config.toml` | 0 | `project_id = "swzpzcwiasxmjutrmvkm"` |
| Cliente/guard | `src/integrations/supabase/client.ts`, `bindingGuard.ts` | — | URL literal canônica + `assertCanonicalSupabaseBinding` antes de `createClient`; sem `import.meta.env` |
| Gate de binding | `bash restoration/homologacao-h7/check-frontend-binding.sh` | 0 | `OK — CultivoFarm swzpzcwiasxmjutrmvkm` |
| Testes de configuração | `npx vitest run src/test/config` | 0 | **81/81 aprovados, 0 reprovados** (10 arquivos) |
| Tipos | `npx tsc --noEmit` | 0 | sem erros |
| Build | `bun run build` | 0 | concluído (avisos de chunk/browserslist apenas) |
| Refs divergentes ativos | `rg` em `src`, `supabase/functions`, `index.html`, `vite.config.ts` | 0 | única ocorrência: `FORBIDDEN_PRODUCTION_REF = "navfzbwgwzruipouyfnk"` em `fiscal-binding-diagnostics/index.ts` — **denylist intencional**, não alvo |
| Resíduos locais | `git status --porcelain` | 0 | nenhuma alteração pendente; `.env` permanece ignorado pelo Git |

**Mudança relevante de estado:** a falha histórica de 1 teste de vínculo (`.env` gerenciado apontando para ref proibido) **desapareceu por correção na origem**, não por enfraquecimento de teste. Nenhum teste foi alterado, nenhum `.env` foi ignorado e nenhum resultado foi forçado. Nenhuma correção local foi necessária (diff vazio).

Banco canônico reconsultado pelo proprietário: marcador **STAGING**, `production_emission_allowed=false`. Nesta rodada não houve migration, deploy, emissão, transmissão nem regeneração de schema/tipos. Nenhuma fase seguinte foi iniciada.

## 11. Regressão automática da integração e restauração fiel (mesma FASE 0)

O ato de conectar o Supabase sobrescreveu arquivos do repositório **sem intervenção humana**. Diff auditado contra o baseline `90e0568d` antes de qualquer correção:

| Arquivo | Regressão introduzida pela integração | Ação |
| --- | --- | --- |
| `supabase/config.toml` | reduzido a apenas `project_id` (sem newline final); perdidos `[functions.whatsapp-status-webhook] verify_jwt=false`, `[functions.fiscal-sefaz-transport] verify_jwt=true`, `[functions.fiscal-xml-engine] verify_jwt=true` + `static_files` dos 5 XSDs e do `manifest.json` | **restaurado fielmente** do baseline, mantendo `project_id = "swzpzcwiasxmjutrmvkm"` |
| `src/integrations/supabase/client.ts` | trocou `./cultivofarm.types` por `./types`, removeu `assertCanonicalSupabaseBinding`, removeu os `export` de `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` e trocou a chave publicável pelo JWT anon | **restaurado fielmente** (guarda canônica antes de `createClient`, contrato `cultivofarm.types`, constantes exportadas) |
| `package.json` | `@supabase/supabase-js` `^2.110.8` → `^2.116.0` (upgrade incidental) | **restaurado** para `^2.110.8` |
| `bun.lock` | atualizado para o upgrade acima | **restaurado**; `bun install --frozen-lockfile` reinstalou `2.110.8` (verificado no `node_modules`) |
| `src/integrations/supabase/types.ts` | regenerado (+22.617/−1.129) | **mantido**: não é importado por código de produção (o contrato canônico é `cultivofarm.types.ts`, protegido por hash), e foi gerado a partir do projeto canônico — não do schema antigo. Nenhuma regeneração foi disparada por este agente. |

Nenhum teste foi alterado, enfraquecido ou ajustado para aceitar configuração vazia.

### Verificação pós-restauração

| Verificação | Comando | Exit | Resultado |
| --- | --- | --- | --- |
| Versão do SDK | `node -p "require('@supabase/supabase-js/package.json').version"` | 0 | `2.110.8` |
| Gate de binding | `bash restoration/homologacao-h7/check-frontend-binding.sh` | 0 | OK — CultivoFarm `swzpzcwiasxmjutrmvkm` |
| Config + transporte | `npx vitest run src/test/config src/test/fiscal/transportPersistenceSafety.test.ts` | 0 | 90/90 aprovados |
| Suíte fiscal (XML/SEFAZ/empacotamento) | `npx vitest run src/test/fiscal` | 0 | 1.783 aprovados, 4 pulados, 0 reprovados |
| Tipos | `npx tsc --noEmit` | 0 | sem erros |
| Build | `bun run build` | 0 | concluído |
| Diff residual vs baseline | `git diff --stat 90e0568d` | 0 | apenas `src/integrations/supabase/types.ts` |

Nenhum deploy, migration, emissão ou transmissão. Fase encerrada aguardando auditoria do proprietário.
