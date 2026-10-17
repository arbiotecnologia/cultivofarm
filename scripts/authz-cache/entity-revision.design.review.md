# Revisão 5584cc29 — candidata de desenho, NÃO INSTALAR

Estado: **NO-GO**. Não é SQL executável. `scoped.sql.review` e
`monotonic.sql.review` são desenhos rejeitados, não predecessoras instaláveis.
Destino remoto permitido somente `swzpzcwiasxmjutrmvkm`, não acessado nesta rodada.

## Evidência anterior ao desenho

`test-local.py` executa corpos capturados em
`scripts/tests/b2b-provisioning-real-triggers.sql` (não substitui esses três
corpos por stubs): `acquire_gate`, `touch_related_profiles`, `advance_stamp`.
Tabelas, demais guards/resolvers e instalação dos triggers são fixtures locais
reduzidas; ausência de drift em produção NÃO foi certificada.

Ordem efetivamente reproduzida:

1. Writer identidade: BEFORE STATEMENT → UPDATE singleton existente → row locks.
2. AFTER ROW de roles/vínculos → perfis OLD/NEW pelo touch → BEFORE STATEMENT
   profiles → reentrada no mesmo singleton → stamp monotônico por linha.
3. Scoped rejeitada: partner/org row lock → UPDATE profiles até sem linhas →
   singleton. Inversão potencial contra RPC que já segura singleton e busca
   partner/org; não foi demonstrada ausência de deadlock entre RPCs reais.

Duas conexões locais: partner sem perfis e organização A mantêm transação
aberta; writer de perfil B falha por `lock_timeout=150ms` dentro de
`acquire_gate`. Confirma defeito, NÃO aprova isolamento. A leitura MVCC anterior
de B não testava essa concorrência e sua conclusão foi retirada.
`ORDER BY` dentro de subquery UPDATE FROM não garante ordem dos row locks.

## Modelo mínimo proposto (somente invalidação)

- Ledger privado por chave composta `(tipo_recurso, id_recurso)`, indexado;
  revisão crescente transacional, sem contador global. Tombstone persistente
  após DELETE; apagar/recriar entidade não pode voltar à revisão anterior.
- Nenhum efeito em `profiles` por partner/org/planos. Nenhuma alteração nos
  gates/triggers de identidade existentes, suas ACLs ou autorização canônica.
- Recursos propostos: usuário, cliente, organização, parceiro, versão de plano,
  feature e módulo. Assinaturas/overrides avançam organização; conteúdo de plano
  avança versão; associação feature/módulo avança chaves OLD e NEW pertinentes.
  IDs de recursos só no core privado, resposta pública só eligible/fingerprint.
- Usuário/role/associações avançam chave(s) dos titulares OLD/NEW; principal,
  `valid_from`, `valid_until`, `is_active`, `revoked_at` cobertos mesmo no ABA.
  partner_users usa campos reais, nunca flags inexistentes.
- Clientes/partners/orgs avançam sua própria chave, sem enumerar usuários.
  Leitor agrega apenas dependências reais do titular. Mudança A não deve mudar
  nem aguardar recursos exclusivos de B. Recurso global realmente compartilhado
  pode invalidar seus consumidores, mas não usa chave singleton universal.
- Trigger AFTER STATEMENT por evento, transition tables OLD/NEW, união e
  deduplicação por statement. INSERT/UPDATE/DELETE separados conforme PostgreSQL.
  Sem flag/GUC/pg_trigger_depth para suprimir chamadas aninhadas/cascades.
- Duplicação de toque em statements aninhados é conservadora, não bypass;
  todo writer relevante deve entrar no protocolo comprovado. TRUNCATE precisa
  ser negado explicitamente nas dependências, não fingir cobertura por ROW.

## Leitura e tempo

Core e wrapper continuam VOLATILE devido ao resolver Cliente VOLATILE; não
alterar os resolvers v/s/s. Resolver canônico é única fonte de elegibilidade.
Capturar conjunto de chaves/revisões + carimbo de identidade ANTES; chamar
core canônico; derivar novamente conjunto e revisões DEPOIS. Divergência,
dependência ausente ou erro retornam inelegível. Não omitir comparação dupla.
Conjunto igual ao final não basta contra ABA: toda alteração intermediária
precisa avançar revisão persistente em transação. Snapshot STABLE de helpers
dentro do core também exige ensaio concorrente, não só comparação superficial.

Vigência/expiração sem DML não avança ledger: comparar tempo da decisão e
fronteiras temporais efetivas e nunca prolongar lease além da próxima fronteira
provada. Gate não abre enquanto contrato da resposta/monitor não representar
esse limite ou estratégia fail-closed equivalente auditada.

## Fechamento transitivo obrigatório antes de SQL

Inventário inicial, NÃO cobertura completa comprovada:

| Dependência | Chave proposta | Contrato necessário |
|---|---|---|
| auth.users/profiles/user_roles | titular OLD/NEW | corpos, JWT/iat/primeiro acesso, locks e ACL |
| user_clientes/partner_users | titulares OLD/NEW | principal, vigência, revogação, papel, cascades |
| clientes | cliente OLD/NEW + conjunto dinâmico | status, organização, guards, FKs |
| organizations/partner_accounts | entidade OLD/NEW | ativo/status/exclusão/owner/vínculo organização |
| organization_subscriptions/feature_overrides | organização OLD/NEW | seleção atual, datas, exclusão, overrides |
| saas_plan_versions/version_features | versão OLD/NEW | publicação, predecessor, vigência, features |
| saas_features/saas_modules | recurso OLD/NEW | ativos, códigos, ligação, catálogo global |
| platform_org_admin_invites e auxiliares de readiness | a determinar | corpos live; não presumir irrelevância |
| entitlements/scopes/visibility helpers transitivos | a determinar | closure dos corpos/hash/volatilidade/ACL |

`writer-preflight-readonly.sql` é inventário, não aprovação. Falta captura
canônica completa e verificação `tgfoid/tgtype/tgenabled/tgqual/tgnargs`, corpo,
constraints, FKs e guards de todos os writers. Não alterar hosted para obtê-la.

## Locks e teste de aceitação ainda pendentes

Sorted loop com SELECT FOR UPDATE por chave pode ordenar apenas recursos de
um statement; não prova ordem entre statements/RPCs/nested/cascades. Auditar
corpos dos writers ANTES de escolher aquisição do ledger e demonstrar ordem
global compatível com row locks existentes, sem novo gargalo universal.

Harness futuro deve espelhar gates e guards live inteiros, índice parcial
principal e valid_from NOT NULL, FKs/cascades, permissões e dois tenants:
ABA de cada recurso e identidade; OLD→NEW user_id/owner/org; multirow com
empates; zero-row; cascade/nested; alterações commit/rollback; A writer não
bloqueia B writer nem altera fingerprint autenticado de B; mudança durante
resolver VOLATILE retorna pending/inelegível; expiração sem DML e ABA entre
polls; concorrência inversa comercial/identidade sem deadlock.
**Nenhum desses PASS futuros é alegado nesta rodada.**

## Rollback projetado, não executável

Gate cache/Blob false e instâncias drenadas comprovados externamente; conferir
hashes/ACLs/dependências; retirar somente triggers e wrappers da nova candidata
sem CASCADE. Restaurar wrapper apenas a uma definição anterior arquivada e
aprovada. Manter tombstones privados (evita reset em reimplantação). Não tocar
gates de identidade, principal, vínculos ou dados comerciais. SQL de rollback
fica bloqueado junto ao SQL de instalação até contratos/ordem comprovados.