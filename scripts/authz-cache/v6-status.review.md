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
- Índices/constraints/FKs ainda pendentes do próximo delta do auditor; DDL/guards/índices das filhas de audit/recalc/default financeiro e `platform_private.authz_tickets` também necessários.
- Corpos live completos dos callers/writers enumerados por assinatura na consulta canônica read-only de 12:50: `v6-writers-catalog.review.md`. Assinaturas não são prova da ordem interna; filtro textual não cobre todos writers/dynamic SQL/grants diretos.
- `storage.operation()` e manifest das policies/buckets/ACL efetiva seguem pendentes. Hash/body dos dois allow_operation recebidos, sem HTTP validado.
- Fixture reduzido anterior contém stub has_ticket: continua inválido para certificação. Corpo real agora conhecido, sem substituição por stub nem novo harness PASS alegado.

## Ordem de locks não fechada

Os três guards fornecidos provam singleton → identidade → touch perfis OLD/NEW
e reentrada singleton. Não provam ordem dos writers comerciais/invites/tickets.
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