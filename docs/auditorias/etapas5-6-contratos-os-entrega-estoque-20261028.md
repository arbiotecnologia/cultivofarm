# Etapas 5/6 — contratos OS → entrega → estoque, 28/10/2026

## Resultado

**Pacote produzido no repositório, INATIVO e NO-GO operacional.** Não repetida a Etapa 6 financeira (61/61 históricos). Nesta rodada só consultas SELECT de catálogos/definições no Supabase `swzpzcwiasxmjutrmvkm`, geração offline de SQL review e testes descartáveis. Sem SQL hosted mutante, migrations, grants LIVE, sessões, fixtures reais, runtime writers, comunicação, NF ou publicação.

## Captura atual e drift

`supabase/config.toml` confirmado antes das consultas: ref canônico. Capturas de 01:33–01:36 UTC arquivadas em `scripts/delivery-stock-release-20261027/current-functions-20261028.json`, `current-extra-20261028.json`, `current-tables-20261028.json` e `scripts/stock-envase-recovery-20261027/live/current-20261028.json`. Conteúdo: funções, assinaturas/defaults, OIDs, owner, ACL, config, DEFINER e corpos/hash; tabelas com RLS/FORCE, ACL e agregados de triggers/policies. Colunas/constraints/triggers também inspecionados via catálogo somente leitura. Não consultados dados pessoais/de negócio.

- **14/14** corpos estoque/envase/guards idênticos à captura anterior; seis tabelas do pacote estoque idênticas em ACL/RLS/trigger/policy hash. Captura não significa aceite funcional.
- Criar entrega `a4d47ccf5d116141ed46e9de9ea7eeaa`, engine `6eb78ceebe90196ac5b95bfc127dd63b`, cancelar `f830c6c718e2b44a1ded06a19a04557a`, wrappers cockpit/principal preservados, sem EXECUTE authenticated.
- Aprovar `1023b9d5210534bee16147e2ce29ee12` e programar `e374f0ba1698b37523b890dc91682eaf` continuam authenticated; não foram redefinidos.
- Motor `c71a9e848eff0a522cbaa3a7ec2949a5` e batch `ce2e7cd4080ff2f8fc15cce9294046d9` continuam authenticated; recuperação não aplicada. CQ/manual binding/delete imutáveis preservados.
- Financeiro LIVE ainda generate `670ea34d37c4c4fd6612031ad763a3a7` / mark `e4008b029ce8d58f70f3fc88571d03be`: A2 não instalada. O composto anterior usa billing histórico incompatível; agora tem barreira explícita que aborta antes da primeira DDL. **Não feito rebase A2 sem composição segura.**
- A captura atual não detectou drift de corpo nos alvos coincidentes; novas funções no inventário não são classificadas como drift apenas por não constarem no pacote antigo.

## Código/deltas e auditoria

| Arquivo | Mudança |
|---|---|
| `scripts/delivery-stock-release-20261027/assemble.py` | Substituições contadas no gerador existente: recusa expedido preexistente; valida ACK motor, estorno e cancelamento; reautoriza após filhos; trava composto billing histórico |
| `composed-delivery.sql.review`, `candidate.sql.review` | Regenerados exclusivamente pelo assemble; sem edição manual; composto histórico aborta e não instala |
| `build-current-checks.py` | Gera PRE/POST atuais e delta de três funções existentes, com pinos metadata e dependências; não conecta |
| `delivery-only-delta.sql.review` | Transação única, PRE/POST embutidos, dependências não instaladas bloqueiam; sem tabela/helper/GRANT e sem redefinir financeiro |
| `current-preflight.sql`, `current-postflight.sql`, `local-post-hashes.json` | Pinos OID/body/ACL/config/owner e tabelas, hashes pós locais; leitura não concede autorização |
| `containment.sql.review` | Rollback deny-only, assinaturas conferidas com LIVE, sem restauração vulnerável/histórico |
| `test-local.py` composto | 48 checks, ACK negativo/NULL, expedição ambígua, falha POST/rollback DDL, drift PRE, contenção |
| `scripts/stock-envase-recovery-20261027/test-local.py` | Falha item N em envase e batch, rollback de ledger/saldo/receipts, disputa real mesmo item, reserva interna capturada, replay reordenado |
| `src/test/planejamento-producao/publicacao-contrato-current.test.tsx` | 6 testes QueryClient real/transporte simulado; contratos e caracterização explícita de lacunas, sem mudar hooks |
| READMEs/AGENTS/roadmap/plano original | Regras, limites e gates atualizados; nenhum plano paralelo |

Escopo SQL delivery-only: `rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)`, `fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)`, `rpc_entrega_cancelar_v1(uuid,text)`. Mantém gate exclusivo e chave financeira unificada do composto; recusa expedição alheia, exige ACK filho e deixa replay legítimo anterior. Rollback contém também ambos wrappers de confirmação. Não cria ticket CQ/GUC de autorização.

## Contratos atuais e lacunas sem caminho paralelo

1. **OS manual:** `OrdensServico.handleCreate` continua INSERT com UUID retido, referências/item/volume/data/prioridade. Não há RPC manual equivalente recuperada. Aprovar/programar/converter visita não substituem cadastro. Não fechar DML antes de equivalência funcional instalada.
2. **OS B2B:** `useGenerateProductionOrders` chama `rpc_planejamento_publicar_v1(uuid,text)` (hash atual `5fe54a19d909a12a1fb310bc97b7b2e7`), que chama `publish_planning_to_lab(uuid)` (`0e6783b42c0016084682cd17bff5dd46`, service-only), que chama `generate_production_orders_from_partner(uuid)` (`2c75352712438df1558a3f5453e67da0`). Planejamento deriva pedido no servidor; snapshot de origem interna bloqueado. Linha é adquirida antes do advisory no wrapper; revalidação após waits/ator no recibo exige revisão da cadeia, sem assumir BOLA explorável só pelo trecho. Fallback cliente legado não é contrato alternativo autorizado.
3. **Entrega por itens:** `Entregas.tsx` reserva→cria por item via cockpit→relê→expede; falha de expedição hoje pode virar warning e sucesso de grupo; compensação direta/best-effort não é transação. `grupo_entrega_id` não prova atomicidade. Nenhuma troca de writer feita.
4. **Reserva:** motor `rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)` + `reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)`; batch `rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)` ordena IDs, chave por item, fingerprint ator/org/payload e receipt. Teste item N exercita batch real, não substituto.
5. **Expedição/cancelamento/retorno:** cancelamento separado/em_rota não é devolução de entregue; esta exige contrato específico. Motor contém ações `estorno_expedicao`/`devolucao` com origem canônica; isso não prova retorno logístico grupo/financeiro nem autoriza inventar wrapper. Expedição preexistente sem recibo da entrega agora PT409 no delta.
6. **CQ/envase:** overloads `rpc_avancar_esteira_laboratorio(uuid,text,text,uuid[,jsonb])` permanecem existentes. Envase registrar e embalagens pós-envase estão service-only. `fn_envase_avanca_os` permanece capturada, mas não habilitada no ensaio positivo: atualiza lote/programação/OS e conflita com dependências de contenção não certificadas. Mantido `ENVASE_TRANSITION_REVIEW_PENDING`, sem fabricar transição/ticket. Guards lote/CQ/binding/delete nunca substituídos.
7. **CAS/status:** status sob lock + idempotência não equivalem a versão observada/CAS de geração. Delta nega ambiguidades; não adiciona assinatura/payload de autoridade inventados. Retorno/grupo/CAS completos permanecem bloqueados.

## Testes e limites

- PostgreSQL17.9 descartável, socket `/tmp`, TCP desligado, nenhum DSN hosted. Composto: **48/48 PASS** (baseline deadlock 40P01, exclusivo sem deadlock nos pares, advisory financeiro, revogação no gate, timeout 55P03, negativo/NULL filho, rollback DDL e deny-only). **Motor/financeiro/avanço/Auth/schema são stubs** neste runner; não herda força da suíte estoque.
- Estoque/envase: **64/64 PASS**, resultados finais em `scripts/stock-envase-recovery-20261027/results.txt`; motor, reserva interna, livro/P1/CQ/volume exatos capturados, Auth/SaaS/hash/schema sintéticos. Transição/refresh/financeiro e cadeia de triggers OS completa omitidos; isso impede homologação integrada. Multi-line envase e batch falham no item N após primeira escrita e revertem saldo/ledger/receipt; expedição em transação explícita não equivale ao grupo UI multichamada.
- Vitest: **55/55 PASS**, cinco arquivos (6 novos +11 publicação +18 planejamento +5 contrato entrega +15 registro entrega). QueryClient real; RPC/Auth de teste, não JWT/RLS. Sem repetição da suíte financeira 61.
- Dois novos testes são **caracterização de lacunas**, não aceite: hook atual dispara duas chamadas concorrentes com mesma chave e aceita envelope `ok:false`/invalida cache. Esses testes passam constatando o risco; não foi alterado writer para escondê-lo.
- Corrigidos erros no próprio harness: assinaturas de containment, inicialização de mock que retornava thenable, e preparação de embalagem disponível versus reservada. Reexecutar e auditar resultados finais antes do aceite.
- Sem browser real/sessão A/B, pois writers/runtime permanecem intactos e proprietário proibiu sessões/fixtures. Typecheck/build pelo harness; log automático deve ser conferido. Não executado build/typecheck manual.
- PRE/POST atuais são fotografias de auditoria: o POST mantém pinos LIVE de estoque e **não** representa instalação simultânea de suas dependências propostas. O delta standalone exige hashes de recuperação, logo exige recaptura conjunta das dependências/POST antes de instalação; falha OID local e dependências LIVE ausentes são bloqueios intencionais, não ensaio positivo de instalação do delta.
- Revisão independente local encontrou o fragmento intermediário sem barreira executável: corrigido no gerador para abortar antes de DDL (`DELIVERY_FRAGMENT_NOT_INSTALLABLE`); somente o runner descartável extrai o trecho delimitado, com contagem fail-closed. O gerador do delta extrai os mesmos delimitadores. Nenhum fragmento intermediário foi aplicado hosted.

## Gates exatos seguintes — nenhum autoriza instalação agora

1. Recaptura/preflight no ref canônico, pinos completos (incluindo ACL por coluna, dependências/overloads e writers de revogação/entitlements); revisar delta e contenção independentemente.
2. Contrato canônico envase compatível com CQ/binding/delete e trigger completo; sem bypass e sem presumir que sucesso reduzido libera produção.
3. Autoridade B2B/onfarm por empresa, vínculos/origem interna/externa e revogação após cada espera; preservar negativos cumulativos/técnico isolado.
4. Contrato funcional equivalente cadastro manual OS e publicação B2B; observed-version CAS/receipt ator/tenant e fechamento da inversão linha/advisory/gate na cadeia, com reprodução antes de corrigir.
5. Criação entrega multi-item/grupo, reserva/expedição/item N/cancelamento/retorno atomicamente definidos; geração/CAS observados e ACK incerto reconciliável sem compensação best-effort.
6. Composição única motor/ledger/triggers reais + A2/parcelas imutáveis, categoria RECEITA e método ativo/valor servidor; não replay do billing histórico. Ensaiar ambos ordenamentos de revogação em gate/row/advisory e writers não cooperantes; custo do gate global.
7. PostgreSQL completo PRE falho/POST falho/replay/rollback/timeout e prova JWT/browser real A/B pelo auditor. Sintéticos não substituem.
8. Só então instalação coordenada autorizada separadamente, migração dos consumidores canônicos/fences/ACK e publicação independente; **depois** fechamento DML por comando. Fiscal/contabilidade reais e SU-518022 continuam pendentes.
## Complemento consumidor real (02:12 UTC)
As caracterizações `ok:false`/duplo clique anteriores eram publicação; esta rodada reproduziu também falhas na página Entregas real (motor ACK ignorado, expedição warning e dupla criação). Correção local em `consumidor-real-entrega-20261028.md`,32 testes novos/328 regressões totais. A criação permanece multichamada e BLOCKED operacional; não herda atomicidade dos188PG históricos nem libera A2/envase/B2B.
