# Certificação Parceiro B2B — Fase 1 (parcial)

## Decisão
**GO focal: contenção de crédito. NO-GO: certificação completa e avanço à Fase 2.** Não houve publicação/deploy, emissão fiscal ou ativação de pagamentos. Nenhuma assinatura, preço ou condição real foi alterada.

## Destino e método
`lovable supabase info` confirmou produção externa `swzpzcwiasxmjutrmvkm`, URL canônica e `managed_by_lovable=false`. Provas feitas com claims locais e papel `authenticated` dentro de bloco transacional, encerrado com exceção intencional `CERT_B2B_F1_ROLLBACK`. Isto não equivale a sessão Auth HTTP real.

As identidades A/B/C já existentes tiveram perfil, papéis e vínculos temporariamente substituídos dentro da mesma transação, sem persistência. Empresas/parceiros eram fictícios. Não foram criados pedidos nem consumidas suas sequências. Rollback PostgreSQL restaura as alterações da transação; não foi obtido hash completo antes/depois das identidades. Não chamar esta evidência de prova integral de restauração por hash.

## Falhas comprovadas e correções
1. RPCs de crédito permitiam consulta ao parceiro de outra empresa. Migration `20261007131828_9007da9a-6dad-4793-a0b3-b02e73c03d15.sql`: guard canônico antes do cálculo, parâmetros finitos/não negativos, pedido excluído pertencente ao parceiro e helper fechado a authenticated/anon.
2. Após a primeira correção, leitura direta de `partner_financial_settings` pelo administrador A ainda retornou **1 linha de B** (`pass=false`). Migration `20261007132558_fcace95c-5756-4110-9cb7-be2fbb192efd.sql`: policy restritiva para leitura/escrita, empresa/perfil/parceiro ativos, técnico negado e Superadmin validado no servidor. Preserva policies permissivas existentes, apenas limita seu alcance.

Ambas aplicadas exclusivamente no canônico. Sem tabela nova ou alteração de dados reais. Reversão estrutural da segunda: remover somente `b2b_financial_settings_tenant_guard`; **não executar** sem contenção substituta, pois reabre falha comprovada. A primeira exige restaurar definição/ACL anterior sob revisão; uma reversão insegura não foi aplicada nem certificada.

## Resultados individuais SQL
| Cenário pós-correção | Resultado |
|---|---|
| A crédito próprio (101 fictício) | PASS |
| A consulta crédito B | PASS: negada |
| A exposição B | PASS: negada |
| A helper direto | PASS: negado |
| A valor negativo | PASS: 22023 |
| A pedido excluído forjado | PASS: 42501 |
| B crédito próprio (202 fictício) | PASS |
| B consulta crédito A | PASS: negada |
| C crédito e exposição próprios | PASS: negados (2 casos) |
| Anônimo crédito | PASS: negado |
| A leitura direta própria | PASS: 1 linha |
| A leitura direta B | PASS: 0 linhas |
| A edição direta B | PASS: 0 linhas alteradas |
| Técnico + administrador, leitura direta própria | PASS: 0 linhas |

São **11 casos RPC e 4 casos de acesso direto**, executados em provas separadas. A primeira tentativa RPC ficou BLOCKED no setup por configurações criadas automaticamente pelo trigger; corrigido o roteiro com merge somente das fixtures. Não contabilizada como PASS.

Consultas posteriores: 0 empresas, 0 parceiros, 0 produtos e 0 planos com prefixo `CERT_B2B_F1`. Não há prova por contagem de todas as tabelas; ausência de resíduos dessas quatro classes e rollback são as evidências disponíveis. ACL viva: helper não executável por anon/authenticated; RPCs executáveis por authenticated e não anon.

## Matriz restante: não certificada
| Superfície | Evidência/limite |
|---|---|
| Catálogo/preço/snapshot/cart_hash | Auditoria de resolvedores existentes; prova positiva não concluída. Setup anterior bloqueou com `approval_missing_resumo_curto`. |
| Criação/conversão/idempotência de pedido | NOT RUN integral: RPC consome sequência não transacional. Inserts com número explícito não certificam a RPC; não substituir esta prova por inserção manual. |
| Aprovação/crédito concorrente/produção | NOT RUN funcional ponta a ponta e concorrência multi-sessão. |
| Financeiro exatamente uma vez | NO-GO: falhas do trigger registradas sem retry; implantação de retry é Fase 2 e não foi iniciada. |
| RPC/helper financeiro | Revisão viva mostra autorização por papel no wrapper e bypass por uid nulo no impl; escopo tenant não certificado. Não afirmar segurança pelo lock. |
| RLS de pedidos/simulações/vínculos | Revisão parcial; role-only observada, sem prova negativa completa. Nenhuma declaração geral de isolamento. |
| Contas a receber | Policy restritiva viva `organization_id = h15_actor_organization()`; não prova todas as RPCs DEFINER. |
| Produção | Policy restritiva viva por parceiro/cliente; fluxo funcional não provado. |
| Storage | `entrega-documentos`, `fiscal-xml`, `fiscal-certificates` privados; paths/policies A/B não certificados. |
| NF-e/CT-e/MDF-e | BLOCKED nesta fase; nenhuma emissão/transmissão. |
| Desktop/mobile Auth real | NOT RUN; não criar fixtures persistentes para contornar rollback. |

Resultados dos subauditores baseados em migrations antigas foram tratados somente como pistas: referências a ambientes proibidos ou conclusões sem runtime não foram usadas para executar testes nem declarar falhas.

## Verificações executadas
- Focal SaaS/Comunicação/B2B/planejamento: **869/869 PASS** (antes do último teste estático adicional).
- Suíte: **5.582 PASS / 4 skipped**, 387 arquivos PASS / 1 skipped (antes do último teste estático adicional).
- Lint focal PASS. Lint global FAIL preexistente: **3.604 problemas (3.477 erros, 127 avisos)**. Não corrigidos fora do escopo.
- Scanner de segredos PASS; scanner de integração fiscal PASS. Flag `fiscalEmissionEnabled=false` preservada; entrega externa não ativada.
- Build automático: último sinal lido `2026-10-07T13:26:09Z`, **build OK**.
- Typecheck isolado: **NÃO EXECUTADO**; execução manual vedada pelo ambiente. Não declarar PASS sem sinal específico.
- Advisors de segurança consultados: **464** achados anteriores (17 INFO RLS sem policy; 2 WARN DEFINER público; 444 WARN DEFINER authenticated; 1 WARN senhas vazadas OFF). Migration informou nenhuma introdução. Não revalidado advisor de performance.

## Pendências e limite de encerramento
Fase 1 permanece aberta: faltam roteiro funcional completo e evidências de preço/hash/idempotência/aprovação/produção/financeiro/Storage/concurrency. Não avançar à Fase 2. O gate não está satisfeito, embora as duas falhas de crédito comprovadas tenham sido contidas e revalidadas.

Commit disponível antes da consolidação documental: `1f8bfc1399cdf742f65514dd43be02e25db67cdd`; não representa necessariamente esta documentação final. Git é gerenciado pelo ambiente; nenhum commit foi criado manualmente.