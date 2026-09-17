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

Portanto o "export seletivo" existe apenas como instrumento auditável; hoje sua lista de tabelas candidatas é **vazia**.

## 3. Dependências do Cloud no código e nos canais de deploy

- Runtime da aplicação: `src/integrations/supabase/client.ts` usa constantes literais do canônico, protegidas por `src/integrations/supabase/bindingGuard.ts`. Não lê `import.meta.env`.
- `supabase/config.toml` e `supabase/functions/_shared/fiscal/canonicalProject.ts`: apenas `swzpzcwiasxmjutrmvkm`.
- `dist/`: zero referências ao ref gerenciado.
- `.env` na raiz: regravado pela plataforma, contém `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do projeto gerenciado. **Nenhum arquivo de `src/`, `scripts/` ou `supabase/functions/` consome essas variáveis.** Está em `.gitignore`.
- Únicos arquivos que citam `VITE_SUPABASE`: `src/test/config/connection-binding.static.test.ts` e `src/test/config/cultivofarm-runtime.static.test.ts` — são justamente as guardas que reprovam a divergência. **Permanecem inalteradas.** A Opção B (ignorar o `.env`) **não** foi implementada.
- Canal de deploy de Edge Functions disponível no ambiente aponta para o projeto gerenciado; por isso `fiscal-xml-engine` e `fiscal-sefaz-transport` seguem **prontas para deploy e não publicadas** no canônico.

## 4. Artefatos criados nesta fase (nenhum executado contra remoto)

- `scripts/cloud-exit/inventory-cloud.sh` — inventário somente leitura. Exige `CLOUD_REF` e `CLOUD_DB_URL` coerentes entre si, recusa o canônico como origem, força `default_transaction_read_only`, imprime apenas metadados e contagens.
- `scripts/cloud-exit/export-selective.sh` — export seletivo para CSV local. Recusa origem canônica, aceita apenas `swzpzcwiasxmjutrmvkm` como destino declarado, exige lista explícita de tabelas, bloqueia tabelas sensíveis (certificados/segredos) e para sem `--i-have-audited-the-diff`. **Não escreve no canônico.**
- `src/test/config/cloudExitArtifacts.test.ts` — verifica as guardas acima de forma estática.

## 5. Como pausar/desativar o Cloud ao final

Limitações reais da plataforma, sem promessas inexistentes:

- **Não existe desvinculação** do backend gerenciado depois de anexado a um projeto. O que existe é desabilitá-lo para projetos **futuros** (Connectors → Lovable Cloud → Disable Cloud).
- É possível **pausar** o backend gerenciado. Pausar não apaga conteúdo e não afeta o canônico, que é um projeto Supabase independente com conexão própria.
- Enquanto o projeto existir, a plataforma continuará regravando o `.env` com o ref gerenciado. Isso mantém a guarda de vínculo reprovando de propósito (1 teste), o que é o comportamento correto e **não** será mascarado.
- Consequência prática a registrar: o canal gerenciado de deploy/migração permanece inútil para o canônico; migrations continuam aplicadas por `restoration/` + ledger manual, e o deploy das Edge Functions depende de canal externo autorizado.

## 6. Estado preservado

Rotas, dados e bloqueios fiscais intactos. `production_emission_allowed=false`. Nenhuma NF-e/NFS-e real transmitida. Nenhuma migration nova, nenhum deploy, nenhuma transferência.

## 7. Pendências para a próxima fase (aguardando auditoria do usuário)

1. Auditar o diff desta rodada e comparar bancos.
2. Decidir se o Cloud pode ser pausado imediatamente (inventário indica que sim: origem vazia).
3. Deploy das Edge Functions no canônico por canal autorizado.
4. E2E fiscal com certificado real em homologação.
