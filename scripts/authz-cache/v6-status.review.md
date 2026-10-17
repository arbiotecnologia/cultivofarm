# v6 — fechamento dos contratos, NO-GO

Contratos/hash fornecidos pelo auditor arquivados em `v6-contracts-supplied.json`.
Fonte é o texto do pedido, não leitura hospedada desta rodada; hashes não foram
recalculados a partir de reformatação. O catálogo read-only adicional está em
`v6-missing-contracts-readonly.sql`, não executado.

## O que os novos corpos fecham

Resolver Cliente VOLATILE, Produtor/B2B STABLE preservados. Closure de leitura
agora prova profiles.cliente_id, user_clientes principal/vigência/revogação,
roles e org/parceiro ativos; B2B usa owner, papel exato e catalogo_precos.
Entitlements depende de seleção da assinatura por started_at/id, versão
PUBLISHED e effective_from/to, trial_ends_at/cancel_at, overrides starts/ends/
ended_at e created_at/id, features/module ativos. Readiness depende também de
platform_org_admin_invites.access_operation_status/access_valid_after e JWT iat.
Esses contratos estavam ausentes na rodada anterior, não são mais listados
como faltantes. Preferências de portal influenciam seleção visual, não inventam
autorização externa; não incluir consultor ou reimplementar seleção de contexto.

## Contratos exatos ainda faltantes

- Recebidos em 12:49: 13 funções com corpos/hash/ACL, 55 triggers com tgfoid/tgtype/qual/corpos e 287 colunas/nullable/defaults. Não listar esses contratos novamente como ausentes; reconciliação em `v6-contracts-1249.review.md`.
- Recebidos em 12:52: 144 constraints relacionadas e 33 índices das tabelas selecionadas. Não mais pedir esse pacote; faltam catálogos completos das filhas de audit/recalc/default financeiro, tickets privados e índices das demais dependências não incluídas no recorte.
- Corpos live completos dos callers/writers enumerados por assinatura na consulta canônica read-only de 12:50: `v6-writers-catalog.review.md`. Assinaturas não são prova da ordem interna; filtro textual não cobre todos writers/dynamic SQL/grants diretos.
- Recebido manifest 33 policies + 11 buckets + RLS enabled/forced=false. `storage.operation()`, ACL/grants efetivos, corpos dos helpers Storage e provas de operação HTTP seguem pendentes. order-attachments/entrega-termos ausentes: preflight permanece rejeitando, sem criar/remapear.
- Fixture reduzido anterior contém stub has_ticket: continua inválido para certificação. Corpo real agora conhecido, sem substituição por stub nem novo harness PASS alegado.

## Ordem de locks não fechada

Os três guards fornecidos provam singleton → identidade → touch perfis OLD/NEW
e reentrada singleton. Não provam ordem dos writers comerciais/invites/tickets.
Adendo 12:52: corpos recebidos de transition_subscription_core, admin_edit_user_profile_v1, user_edit_f2_common, is_tenant_admin_for_user, issue_ticket e issue_saas_plan_version_ticket; não listá-los como corpos faltantes. A análise desses corpos está em v6-contracts-1252.review.md. Já existe ordem inversa no caminho interno admin (profile FOR UPDATE → user_roles DML → singleton); o caminho common usa singleton NOWAIT → profiles → links → clientes/partners FOR SHARE. Não introduzir contador/locks novos sobre essas inversões nem alterar gates existentes.
Ledger por entidade AFTER STATEMENT pode criar ciclo se writer que segura
revisão de org passa a obter row de partner que outro writer segura antes de
obter revisão de org. Sorted keys dentro de um statement não resolve transações
multi-statement/nested/cascades. Sem corpos de writers não há prova de ordem
compatível, mesmo sem profiles/fanout. Não produzir instalação v6 fingindo isso.
Não tocar auth.users/gates gerenciados nem expandir escopo Auth para fechar teste.

## Snapshot/tempo não fechados para gate

VOLATILE deve comparar conjunto/revisões antes/depois de chamadas canônicas,
incluindo invites, JWT-contexto e dependências dinâmicas. Helpers STABLE usam
snapshots da chamada; testes concorrentes precisam commits nos intervalos reais.
`now()` é estável na transação, não clock de chegada: transação antiga pode
ler vigência já expirada no relógio real. Seleção futura/expiry deve produzir
fronteira conservadora e negar se consulta atravessar fronteira; lease cliente
no máximo min(15s desde início, fronteira server comprovada). Não mudar os
resolvers para satisfazer o cache. Prova de tempo ainda pendente.

Portanto v6 por entidade permanece **desenho**, sem SQL de instalação/rollback
executável ou harness completo declarados. Harness anterior é reprodução de
defeito com guards capturados, não aprovação universal. Próxima implementação
depende exatamente dos contratos/ordem/tempo acima; gates false.