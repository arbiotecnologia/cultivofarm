# Certificação Parceiro B2B — Fase 1

## Decisão atual: NO-GO estrito
Forward-fix focal aplicado e verificado estruturalmente. **A certificação ponta a ponta NÃO foi concluída.** Não há prova funcional SQL pós-fix 13:58, Auth real, concorrência ou isolamento Storage A/B nesta retomada. Não avançar à Fase 2. Nenhuma publicação, deploy de app/Edge, transmissão fiscal ou ativação fiscal/pagamentos foi realizada.

## Autorização e ambiente
As fixtures mutáveis com limpeza e correções mínimas estavam expressamente autorizadas; a alegação anterior de falta de autorização foi incorreta e fica corrigida. As seis migrations 13:38–13:49 foram preservadas sem reversão. Avanço de sequence é aceito, não constitui bloqueio e não deve ser restaurado.

Preflight `lovable supabase info`: produção externa `swzpzcwiasxmjutrmvkm`, URL canônica, `managed_by_lovable=false`. Nenhuma operação foi direcionada a ambiente proibido. As consultas finais foram somente leitura. Nesta retomada não foram executadas novas fixtures ou provas SQL mutáveis; somente a migration de esquema focal foi aplicada.

## Migrations confirmadas no histórico remoto
| Versão / nome | Finalidade |
|---|---|
| 20261007133803_beba56d3-c531-476d-8738-3edcbdc1c8de | Guards/policies restritivas B2B |
| 20261007133830_d245ab9a-2822-4acb-abc8-913e68dc4049 | Cores privados e wrappers INVOKER |
| 20261007134443_0d3d4ba9-cf4b-4882-8fcc-ba1641dfdce4 | Tenant financeiro derivado |
| 20261007134548_edb7c6ec-3cf2-4c4b-b0cb-af9e5a66751d | Remove DELETE redundante de parcelas |
| 20261007134637_287124f0-b729-4557-896e-599819fb5deb | Reutiliza parcelas do título recém-criado |
| 20261007134935_198c1f48-1e7e-4f12-b22a-bb550c2bfb4e | Projeção e gravação técnica canônicas |
| **20261007135856_0ba377fd-500e-4bf0-840c-60196df60ee0** | **Forward-fix atual: atribuição técnica, bloqueio financeiro e initplans focais** |

A migration 13:58 está também no checkout, salva pelo fluxo da ferramenta. Não foi reaplicada para obter arquivo local.

## Correções focais e evidência
1. `platform_private.b2b_save_technical_simulation` reutiliza exatamente os dois predicados ativos existentes de atribuição: `partner_user_clients` (cliente, user_id, partner_id, active) OU `partner_technician_clients` (cliente, technician_user_id, partner_id, active). Remove checagem somente por organização. Substituição falha fechada se a definição remota divergir. Cliente não nulo exige vínculo; não foi criada nova fonte/regra de associação.
2. Policies `b2b_technical_financial_write_guard`, RESTRICTIVE FOR ALL, limitam técnico a total zero, estados rascunho/enviada_gestor e campos de conversão nulos; nos itens os cinco campos brutos ficam nulos/zero. Policies permissivas antigas não foram apagadas; as restritivas limitam sua combinação. Papéis sem papel técnico não recebem essa restrição adicional. Leitura bruta técnica segue negada pela policy SELECT existente.
3. `useSimulacaoFormalHeader` lê cabeçalho e itens pela RPC price-free, inclui identidade/perfil na chave e propaga falha de itens. Volume continua calculado sem preços. Testes mockados cobrem técnico, administrador, gestor_comercial e parceiro. Removidos os `any` do hook afetado; contrato RPC tipado localmente, sem editar tipos gerados.
4. Initplans somente nos predicados B2B alterados: `has_role`, `auth.uid` e superadmin independentes da linha usam SELECT. Guard de parceiro e EXISTS correlacionados permanecem por linha. Não houve limpeza global de policies ou advisors.

ACLs remotas: wrappers public de read/save INVOKER e cores privados DEFINER com search_path vazio fixo; anon não executa, authenticated executa ambos (arquitetura existente preservada). Core financeiro `generate_b2b_receivable_secure_impl`: anon/authenticated não executam, service_role executa. Definição contém tenant `v_org` e reutilização de parcelas; **isso não prova execução funcional**. Wrapper financeiro contém guard de escopo e lock; locks não substituem teste de concorrência.

MD5 observado da definição do core financeiro: `60be0fb336ca1537c063a001a213f7af`; save técnico privado: `daad3c1554f370bb0456b4ea3afdeea7`; read privado: `33838d618fc104b3c42d5954dae609f8`.

## Matriz individual atual
PASS estrutural/unitário não equivale a PASS funcional autenticado.

| Aspecto | Resultado | Evidência / limite |
|---|---|---|
| Preservação das seis migrations e forward-fix | PASS | Histórico remoto confirmou sete versões |
| Escopo canônico técnico e bloqueio bruto | PASS estrutural | Definição/policies vivas e 5 testes de contrato |
| Cliente atribuído aceito / não atribuído negado | BLOCKED funcional | Não executado com claims/session após fix |
| Técnico sem preço lido / escrita direta negada | PASS unitário/estrutural; BLOCKED funcional | 5 testes do hook + policy; sem request real |
| Cabeçalho/itens e erro não silencioso | PASS unitário | Projeção, volume, total e erro testados |
| Demais perfis comerciais | PASS unitário; BLOCKED funcional | Totais preservados em mocks de 3 perfis |
| Catálogo/preço/cart_hash/hash inválido | BLOCKED atual | Prova anterior parcial não recertifica estado atual |
| Criação/replay/conflito/partner forjado | BLOCKED atual | Harness atualizado não executado |
| Simulação/conversão/snapshot imutável | BLOCKED atual | Sem execução pós-fix |
| Crédito A/B/C | PASS histórico focal | 11 RPC + 4 acessos diretos em rollback; não substitui fluxo atual |
| Aprovação/transições/produção | BLOCKED atual | Encaminhamento anterior parcial não recertificado |
| Exatamente um título e parcelas, sem retry/outbox | BLOCKED funcional | Fixes de tenant/reutilização presentes; sem execução pós-fix isolada |
| Isolamento A/B pedidos/itens/simulações/vínculos | BLOCKED funcional | Policies inspecionadas, não matriz atual executada |
| Storage A/B e perfis completos | BLOCKED funcional | Sem sessões reais e objetos fictícios testados |
| Concorrência multi-sessão | BLOCKED | Sem duas sessões Auth reais disponíveis |
| UI autenticada desktop/mobile | BLOCKED | Ambiente `external_unmanaged`; E2E autenticado indisponível |
| Ausência de emissão fiscal/pagamentos/deploy/Fase 2 | PASS para ações desta retomada | Não acionados; scanners OK |

## Bloqueio da prova funcional
Não há PGHOST/DSN nem executor SQL transacional autenticado disponível. `read_query` aceita SELECT; `run_sql` aceita apenas DML e executa sem Auth. Migration não foi usada como executor de fixtures. O roteiro `supabase/tests/certificacao-b2b-fase1/02-flow-rollback.sql` exige DO, claims locais, ROLE e rollback; não pode ser executado com essas ferramentas sem contornar seus contratos. A autorização do usuário NÃO é o bloqueio; o acesso disponível é. Não usar DML persistente como substituto de prova autenticada/rollback.

**Authenticated path: UNVERIFIED.** Não foi executado request real com bearer Auth. A prova de concorrência existente recusa produção e exige sessões de staging; não foi redirecionada para ambientes proibidos nem alterada para burlar o guard.

## Resíduos observados
Consultas finais por prefixo `CERT_B2B_F1` em JSON das linhas; também por IDs de pais ainda existentes nas classes principais. **0 em cada uma das 26 classes consultadas:**
- organizations, partner_accounts, partner_orders, partner_simulations, accounts_receivable;
- partner_order_items, partner_simulation_items, partner_order_financial_links, accounts_receivable_installments, production_planning;
- produtos, commercial_payment_plans, storage.objects;
- partner_users, partner_user_clients, partner_technician_clients, partner_financial_settings;
- partner_order_idempotency, partner_order_payment_schedule, partner_order_payment_terms, partner_order_audit_logs;
- organization_subscriptions, organization_subscription_history, profiles, financial_audit_log, clientes.

Sequence `partner_orders_numero_seq`: **1026, is_called=true**, igual ao observado antes desta retomada; não restaurada. Sem novas fixtures nesta retomada, portanto nenhum novo ID a limpar.

**Limite:** prefixo/IDs de pais presentes não detectam dependentes órfãos sem prefixo de IDs históricos já removidos. Não há inventário completo desses IDs nem hash antes/depois de perfis/user_roles alterados em provas históricas. Não declarar restauração integral de todas as tabelas historicamente tocadas. Falta também inventário fechado de auditorias/triggers dependentes. As contagens zero não bastam para GO.

## Verificações finais
- Focal final: **16/16 PASS**, 3 arquivos (hook, guard estrutural e crédito).
- Agrupamento ampliado anterior: **309/309 PASS**, 39 arquivos.
- Suíte completa após última correção: **5.593 PASS / 4 skipped**, 389 arquivos PASS / 1 skipped, saída 0; 14:02:10 UTC, duração 119,04s.
- Lint focal final dos três arquivos alterados: **PASS, saída 0**. Não corrigidos lints globais antigos.
- Scanners de segredos e integração fiscal: **PASS**, saídas 0/0.
- Build automático: **build OK em 14:01:33 UTC**, após alteração do hook; nenhum build manual executado.
- Typecheck isolado: **BLOCKED/não executado separadamente** por instrução do ambiente; wrapper eliminou erro anterior e build automático está OK, mas não rotular typecheck isolado como PASS.
- Scan de segurança atual: **10 INFO**; sem limpeza dos achados globais. Esse scanner não é o advisor Supabase de performance.
- Advisors globais prévios: **463** (17 RLS sem policy, 2 DEFINER publicamente executáveis, 443 executáveis por authenticated, 1 proteção de senhas desativada); não são FAIL isolado da Fase 1. Diagnostics CLI não suporta este backend user-managed. Advisor focal performance **BLOCKED/não executado**; initplans confirmados estruturalmente, não por plano funcional Auth.

## Arquivos e referência Git
Alterados nesta retomada: migration 13:58 gerenciada pela ferramenta, `src/hooks/useSimulacaoFormalHeader.ts`, `src/test/saas/b2b-formal-header-projection.test.tsx`, `src/test/saas/b2b-forward-technical-guards.test.ts`, regra B2B em `AGENTS.md`, este relatório e `roadmap.md`. Memória registra a autorização corrigida.

HEAD observado depois das correções/testes de código e antes desta consolidação documental: **`13c909d25e635c0a1f22b85f99af4fdbfab753a4`**. Git é gerenciado pelo ambiente; nenhum commit manual criado. Não afirmar que esse SHA inclui a documentação final.

## Pendências abertas
Executor canônico que suporte prova autenticada transacional/cleanup seguro; execução de todos os casos funcionais e resíduos por inventário fechado de IDs; sessões Auth para UI/múltiplos atores e concorrência; advisor focal performance e evidência específica de typecheck. **NO-GO; sem declaração de 100%.**
