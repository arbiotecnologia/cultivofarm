# Contenção obrigatória do piloto ARBio — REVIEW_ONLY, INATIVO

## Estado

- Nenhuma operação hospedada, publicação, ativação, emissão fiscal, cobrança ou envio externo.
- `finished_product_gate_v1` e `b2b_resale_logistics_gate_v1` continuam desligados por padrão e são somente chaves-mestras; nenhum deles, isoladamente, autoriza operação.
- Todo pacote de rollout anterior a esta contenção está inadequado para ativação do piloto. Não usar o rollout antigo como aprovação.
- A tentativa exata fica registrada no manifesto do pacote. Somente `run.exitcode=0`, todos os checkpoints PASS e a captura corrigida atual são evidência válida. A contenção atual exige 35 testes específicos, incluindo gate OFF antes e depois da autorização final sob locks reais. Rollback deny-only concluído; histórico e recibos preservados.
- Testes usam PostgreSQL descartável, identidades/claims sintéticos e fixtures locais. Não são prova de JWT, RLS, Storage, navegador ou sessão real hospedada.

## Autoridade

A tabela privada `platform_private.resale_pilot_allowlist_v1` exige ator, organização, operação e referências sintéticas exatas, com `valid_from`, `valid_until`, `revoked_at` e motivo de revogação. Não há grant de tabela nem EXECUTE dos helpers para `PUBLIC`, `anon`, `authenticated` ou `service_role`.

Os writers e readers cobrem compra, leitura, criação de OS, reserva, criação de entrega, envio, comprovante, confirmação e cancelamento. Replays reautorizam. GUC, claims ou dados do cliente não concedem acesso. A concessão futura é ato administrativo server-side do auditor, nunca parâmetro da aplicação.

## Ordem obrigatória de revisão

1. Executar o PRE LIVE escopado, sem migração ampla de catálogo e sem reinstalar planos.
2. Instalar os candidatos já revisados de confirmação, envio, físico, logística e endpoint, todos com gates OFF.
3. Antes de qualquer ativação, executar `pilot-containment/01-pre.sql.readonly`, revisar `02-install.sql.review` e verificar `03-post.sql.readonly`.
4. Não há script de ativação neste pacote. O piloto autenticado permanece NOT_RUN até revisão independente, concessões server-side exatas e autorização específica posterior.

## Evidência local coberta

- Outra organização com feature ON e papel válido: negada.
- Ator ARBio com papel válido, fora da allowlist: negado.
- Cliente sem escrita na allowlist; GUC forjado não altera autoridade.
- Piloto sintético ARBio permitido somente com grants exatos por operação.
- Fluxo compra → OS → reserva → entrega → envio → comprovante → confirmação concluído localmente.
- Replays, expiração, revogação e concorrência real em duas conexões: sem duplicação.
- Nenhum efeito financeiro, fiscal ou de comunicação.
- Gates OFF permanecem fail-closed mesmo com concessões válidas.

## Rollback

Executar primeiro `pilot-containment/04-rollback-deny.sql.review`, depois os rollbacks na ordem inversa revisada. O rollback composto de envio+confirmação mede os corpos escopados atuais, incluindo `private` e `cf_user_guards_v1`; não usa os antigos guards de corpos globais. Não apaga allowlist, histórico ou recibos e não restaura writers vulneráveis.
