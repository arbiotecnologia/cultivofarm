# Pré-requisitos para a prova positiva real da entrega em grupo — diagnóstico 30/10

Fonte: pacotes do repositório e captura `delivery-atomic-hardening-20261030/capture/post-expected.json`.
Estado LIVE da AR Bio **informado pelo proprietário**: 0 OS, 0 lotes, 0 estoque, 3 clientes.
O único estoque global existente pertence a outro tenant e **não pode ser usado**. Nenhuma consulta hosted foi feita nesta rodada.

Sessão real AR Bio já observada pelo proprietário:
- preflight de comprovação em entrega inexistente → 403/42501;
- PNG sintético no Storage → 403 AccessDenied;
- bucket continua com 0 objetos.

Isso é **negativo/fechado**, não prova positiva.

## O que a RPC de grupo instalada exige (`rpc_cockpit_criar_entrega_v1`, linhas 162–230 do candidato atômico)

- OS `ordens_servico` do mesmo tenant, `origem='agronomica'`, `partner_order_id IS NULL`, `status='pronto_entrega'`, `updated_at` igual ao observado.
- Itens `estoque_produto` com `status='disponivel'` e `quantidade_reservada=0` (a RPC reserva, cria e expede); sem entrega ativa do mesmo item na OS.
- Ator interno ativo do tenant (administrador/gestor/produção/administrativo), recurso `estoque_embalagens` ativo, sem papel/vínculo externo.

## Cadeia até esse estado (0 OS hoje) e situação de cada pacote

| Etapa | Pacote | Situação registrada | Bloqueio |
|---|---|---|---|
| Produto fabricável (sintético) | `os-manufacturable-prerequisite/fixture-product.sql.review` | revisão, não executado | só técnico/operacional: autorizar execução do seed marcado |
| OS agronômica + aprovação | `os-approval-recovery` | revisão, não aplicado | técnico: PRE atual + aplicação |
| Programação | `os-programming-recovery` | recibo parcial de PRE informado; POST/aplicação não confirmados | técnico |
| Geração de lote manual | `lot-generation-canonical-20261020` | `hosted_executed=false`, gate UI false | técnico + aceite do impacto do guard sobre escritores legados (`WRITE-CONCURRENCY-REVIEW.md`) |
| CQ manual + referência produto-only | `manual-cq-recovery-20261020` | `applied=false`, `MANUAL_CQ_REVIEWED=false`; referência fictícia proposta, não executada | técnico (referência fictícia já autorizada) |
| Envase → estoque | `stock-envase-recovery-20261027` | NO-GO, inativo | **ver abaixo** |
| Entrega em grupo | este pacote | não aplicado | depende das etapas acima |

## Blockers concretos encontrados agora (técnicos, não decisão humana)

1. **Os pins de PRE do envase estão desatualizados.** De 27 funções em comum com a captura pós-atômica, 26 continuam iguais e 1 mudou: `public.rpc_estoque_operar_v1`, pin `c71a9e848eff0a522cbaa3a7ec2949a5` → instalado `44b150bf16eaa81e69395fc3b040ce5c` (delta de split do motor). O `preflight.sql` do envase recusaria a instalação. É preciso rebasear sobre o motor atual, sem reaplicar o corpo antigo.
2. **O envase não leva a OS a `pronto_entrega`.** O candidato retorna `avanco.success=false` com `ENVASE_TRANSITION_REVIEW_PENDING` (`candidate.sql.review:222`). A RPC de entrega exige `pronto_entrega` e então recusaria com `DELIVERY_OBSERVED_CONFLICT` (PT409). Falta a transição canônica envase→pronto_entrega, revisada, sem ticket de CQ fictício e sem forçar status.
3. **Contrato incompatível entre a saída do envase e a entrada da entrega.** O fluxo positivo do envase deixa o estoque `reservado` para a OS. A RPC de grupo só aceita `disponivel`, e o adaptador do cliente também. Ou o envase produz `disponivel`, ou a entrega passa a aceitar a reserva da própria OS. A regra já existe (estoque reservado para a OS pertence a ela), portanto isso é correção técnica, não decisão de negócio. Exige delta revisado nas duas pontas, com PRE/POST.
4. **Modo de lock.** O README do envase exige uniformizar o gate antes de compor com a entrega. A regra em `delivery-stock-release-20261027/AGENTS.md` é um único `cf_user_guards_v1 FOR UPDATE`. É preciso verificar a nova composição (40P01/55P03 bounded).

## Menor próximo pacote

`stock-envase-recovery` rebaseado sobre o LIVE pós-atômico, contendo:
- correção do pin do motor;
- transição revisada envase→`pronto_entrega`;
- harmonização `reservado`-para-a-OS ↔ entrada da entrega.

Ele seria instalado depois de produto/OS/aprovação/programação/lote/CQ. Até lá, nenhuma prova positiva de entrega é possível sem:
- forçar status;
- desabilitar triggers;
- usar estoque de outro tenant;
- emitir ticket fictício.

Tudo isso é proibido.

**Decisão humana real restante:** apenas o aceite já pendente do impacto do guard de lote sobre os escritores legados de CQ/envase e a autorização para executar o seed sintético marcado. Os itens 1 a 4 são técnicos.

## Por que o grant continua fechado

O delta deste pacote concede EXECUTE a `authenticated` em toda a plataforma: qualquer ator interno elegível de qualquer tenant poderia chamar os writers logo após a instalação, antes da prova real. Os writers reautorizam, mas isso abriria a operação a todos. Não instalar para viabilizar teste. Restringir a abertura por tenant exigiria nova arquitetura SQL (fora do escopo desta rodada). Fica registrado como condição: só instalar quando a cadeia acima estiver pronta e a liberação geral for aceitável.
