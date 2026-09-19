# H15 — gate de isolamento fiscal por empresa

## Estado desta rodada

**NÃO APLICADA — implementação incompleta; correções pontuais autorizadas pelo usuário, sem necessidade de nova aprovação de escopo.**

Destino confirmado por `supabase/config.toml` e leitura do marcador vivo: `swzpzcwiasxmjutrmvkm`. Banco real de produção do SaaS; `environment_label=STAGING` refere-se à emissão fiscal. `production_emission_allowed=false`.

Nenhuma migration foi submetida, nenhum dado alterado e nenhuma ferramenta de deploy acionada nesta rodada. Publicação automática da plataforma não foi consultada: não se afirma ausência global de deploy. Edge Functions, config.toml, secrets, cliente e tipos não foram editados.

## Baseline vivo — 18/09/2026

| Verificação | Resultado |
|---|---|
| Organizações / ativas | 1 / 1 |
| Emitentes / ativos em HOMOLOGATION sem produção | 1 / 1 |
| Notas / certificados / séries | 0 / 0 / 0 |
| Administradores ativos com organização | 1 |
| Emitentes com CNPJ ausente ou comprimento numérico diferente de 14 | 0 |
| organization_id em company_fiscal_settings | Ausente |
| company_settings_id em fiscal_invoices | Ausente |
| Índice ativo | ux_company_fiscal_settings_active_singleton: UNIQUE ((true)) WHERE is_active=true |
| Certificado → emitente | company_settings_id, FK ON DELETE RESTRICT |
| Série → emitente | company_id, FK ON DELETE RESTRICT |

As políticas staff de empresa/notas e dependentes verificam papéis globais. `fi_producer_read` é separada e verifica cliente vinculado por accounts_receivable/entregas. Nada foi alterado nela.

## Gate impeditivo: RLS e triggers não isolam leituras SECURITY DEFINER

A auditoria encontrou caminhos públicos existentes com EXECUTE para authenticated que contornariam uma correção limitada a RLS e triggers:

| Função viva | Evidência |
|---|---|
| rpc_fiscal_company_settings_init() | Administrador global; retorna o primeiro emitente ativo sem organização. Retorno acontece antes de qualquer INSERT, portanto trigger não resolve. |
| rpc_fiscal_company_rtc_get() | SECURITY DEFINER; retorna configuração do emitente mais recentemente atualizado, sem filtro organizacional. |
| fn_fiscal_emitter_pendencies(uuid) | SECURITY DEFINER; lê emitente por ID sem validar empresa do chamador. |
| rpc_fiscal_tax_preview_v1(uuid,jsonb) | SECURITY DEFINER; papel global, lê nota por ID e emitente ativo global. Preview não escreve; trigger não protege esse retorno. |
| rpc_fiscal_xml_status_v1(uuid) | SECURITY DEFINER; papel global e consulta runs por invoice ID, sem escopo organizacional. |
| rpc_fiscal_sefaz_transmission_status_v1(uuid) | SECURITY DEFINER; papel global; parâmetro nulo lista as últimas transmissões globalmente. |
| rpc_fiscal_draft_save(uuid,jsonb,jsonb,integer) | Papel global; seleciona UF do emitente ativo mais recente; INSERT não fornece vínculo com emitente. |

Também existem consumidores SECURITY DEFINER fora do prefixo fiscal (`fn_financial_inconsistencies`, `rpc_upsert_fiscal_invoice_manual`) que referenciam notas e precisam entrar na análise de alcance, sem mudanças automáticas em massa.

**Consequência:** aplicar apenas os vínculos e as políticas solicitadas deixaria vazamento por leitura pública. Triggers poderiam impedir escrita divergente, mas não seriam prova de isolamento de consultas. O estado com um único emitente não elimina esse problema para um staff de outra organização.

Não foi feita reescrita em massa, wrapper paralelo, revogação indiscriminada de RPCs ou alteração de papel global para contornar a limitação de escopo. O usuário autorizou correções pontuais nesses caminhos; a pendência é técnica, não de autorização. Segundo emitente continua não homologado.

### Continuação da auditoria — 19/09/2026

- Inventário local exportado em `restoration/fiscal-h15/inventory.json`: 54 definers com referência textual direta às tabelas selecionadas, incluindo funções técnicas e triggers. Esse número não equivale ao inventário transitivo completo e não substitui a revisão de chamadas indiretas, views e SQL dinâmico.
- Políticas originais preservadas em `restoration/fiscal-h15/baseline-policies.json`; inclui `fi_producer_read`, sem alteração.
- Consultas reproduzíveis somente leitura em `restoration/fiscal-h15/01-preflight.sql`; ainda não constituem ensaio nem migration.
- Outros caminhos examinados: prontidão, elegibilidade, comprovante de entrega, reservas, cálculo, revisão contábil e registro de XML. Guard de papel global não comprova isolamento organizacional em nenhum desses caminhos.
- Consulta viva das views diretamente dependentes confirmou `security_invoker=true` nas cinco retornadas: certificado, empresa, reconciliação, prontidão NF-e e estado de evento SEFAZ. Execução dessas views dentro de um definer continua exigindo escopo explícito.
- O índice singleton global existe em `pg_indexes`; sua ausência na lista de constraints não significa ausência de unicidade.
- `rpc_fiscal_certificate_register_a1` possui guard baseado em claim de papel, mas isso não substitui auditoria de ACL efetiva nem deve ser tratado como prova de ausência de exposição.
- Nenhuma migration H15 foi criada/submetida nesta continuação; nenhum ensaio transacional ou teste adversarial H15 foi executado. Não há evidência de aplicação automática H15. Não foi feita auditoria global de deploys automáticos.

## Contratos de escrita a preservar na implementação

- company_snapshot usa cnpj, legalName, crt, ie, uf, municipalityIbge, series e environment.
- H12 materializa snapshot no cálculo; draft legado pode inserir snapshot vazio ou fornecido no payload.
- company_cnpj e snapshot.cnpj precisam ser validados independentemente contra o emitente vinculado, sem aceitar ausência como prova de coerência de snapshot preenchido.
- created_by é obrigatório; usar profiles.user_id (não profiles.id) para vínculo com identidade autenticada.
- Proteção de vínculos secundários deve cobrir referências de notas/itens, XML/certificado/reserva, transmissão/XML/evento e documento protocolado/transmissão/XML.
- Não alterar políticas no-write/append-only nem conceder bypass novo. Service_role técnico não dispensa verificação de integridade.

## Verificações executadas

Comando: `bun run test -- src/test/config src/test/fiscal src/test/security`.

Captura: `set -o pipefail`, saída em `/tmp/h15-existing-tests.log`; status capturado imediatamente após o processo, antes de tail.

Resultado: **exit 0; 147 arquivos aprovados, 1 arquivo pulado; 2.145 testes aprovados e 4 pulados preexistentes**. Nenhum teste foi alterado. Esta suíte comprova regressão atual, não comprova H15 nem RLS multiempresa.

Sinal automático observado antes da entrega: build OK em 18/09/2026 18:22:49 UTC. Não foi executado build/typecheck manual. Não há evidência separada de typecheck nesta rodada.

As consultas usaram catálogos `information_schema.columns`, `pg_policies`, `pg_indexes`, `pg_constraint`, `pg_trigger`, `pg_proc` e `pg_get_functiondef`, além de contagens e marcador. Não foram exibidos documentos pessoais, tokens ou segredos. Duas consultas diagnósticas falharam: coluna environment inexistente (corrigida para environment_label) e EXECUTE de has_role indisponível para o leitor (substituído por contagem via join com user_roles).

## Pendências explícitas

1. Implementar as correções pontuais autorizadas, completando também o inventário transitivo das leituras SECURITY DEFINER.
2. Preparar migration H15 autocontida e rollback; validar e aplicar somente após os guards técnicos. Não é necessária nova aprovação de escopo.
3. Testes SQL comportamentais de isolamento, adversariais e concorrência, além de pós-check de schema/RLS/ACL e advisors security/performance. Não executados porque não houve alteração.
4. Revalidar contagens e marcador sob locks na futura migration; o baseline não substitui o guard transacional.

Não iniciado certificado, emissão, E2E fiscal ou próxima fase. **H15 incompleta, isolamento não certificado.**