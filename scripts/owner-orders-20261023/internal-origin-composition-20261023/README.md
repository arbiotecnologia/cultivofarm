# C2-ORD — composição de origem externa, candidata inativa

**NO-GO para implantação automática/reabertura.** Pacote local; produção permanece sob `c2_contain_writer_internal_origin_conflict`. Nenhuma sessão foi alterada, nenhum pedido/título hospedado criado, nenhum SQL aplicado ou frontend publicado pelo agente.

## Causa e reprodução

O `trg_00_b2b_internal_snapshot` executa para TODO INSERT de pedido e exige organização/autoridade comercial interna. O create C2 externo autorizado não possui essa autoridade: a RPC completa, com o guard original capturado, reproduziu `B2B_INTERNAL_ACTOR_DENIED` no PostgreSQL descartável. Não é problema do carrinho nem autorização para atribuir papel interno.

Foram capturados 44 triggers atuais de pedidos, itens, termos, cronograma, vínculos financeiros, títulos e parcelas; 50 policies em 11 relações; 78 corpos/owners/ACLs de dependências, inclusive o motor de preços e os helpers canônicos C2/P1. Capturas não incluem dados de usuários/pedidos de produção.

## Correção proposta

- Prova externa explícita e imutável `c2_external_origin_snapshot`, separada da origem interna; NULL legado NÃO autoriza promoção.
- Emissão exclusivamente na transação do create canônico, após guards/cart/hash/replay, usando o `issue_ticket` privado existente. Ticket txid/partner consumido ao terminar; sem GUC, claims de papel inventadas, trigger-depth ou desativação de RLS.
- Owner/credor/emissor derivados de `commercial_owner_organization_id` ativo e único estabelecimento fiscal validado desse owner; cliente precisa pertencer ao mesmo owner. Sem organização própria do parceiro e sem UUID/payload como prova de autoridade.
- Guards de pai/filhos validam a prova e preservam selagem econômica/imutabilidade. Alteração administrativa posterior depende do owner interno ativo autorizado por P1, nunca dos papéis externos.
- Aprovação externa pode selar e cobrar, mas mantém `ready_for_production=false`; etapas operacionais continuam negadas. Não reabre planejamento/produção/entrega/fiscal. Guard final `zz_c2_external_final_state` impede persistir uma selagem caso um guard de crédito posterior retire aprovação.
- Parcelas de título externo são inseridas com datas/valores exatos do cronograma contratual (30 dias), evitando UPDATE de valores imutáveis H6 após inserir parcelas por meses civis. Fluxo interno original permanece preservado.
- Não muda fiscal resolver, eligibility ACL/corpo, settings fence/CAS ou helper de contenção. Método ativo é o instalado P1; configuração ausente falha explicitamente, sem INSERT automático.

## Caminhos exatos

Prefixo: `scripts/owner-orders-20261023/internal-origin-composition-20261023/`

| Artefato | Arquivo |
|---|---|
| Capturas/hash/ACL/trigger/policies | `baseline/` |
| PRE integral READ ONLY | `preflight.sql` |
| Candidato transacional **inativo** | `candidate.sql.review` |
| POST assertivo READ ONLY, writer ainda contido | `postflight.sql` |
| Rollback deny-only, sem apagar snapshots/histórico | `rollback.sql.review` |
| Montador determinístico local | `assemble.py` |
| Testes PostgreSQL | `test-local.py` |
| Resultado e limites | `validation.md` |
| Hashes | `SHA256SUMS` |

Os scripts SQL NÃO comprovam o endpoint Supabase sozinhos. Operador deve validar externamente o ref exato `swzpzcwiasxmjutrmvkm` antes de qualquer execução; divergência/ausência fecha. PRE exige containment atual byte-exato, owners/ACLs, triggers e conjunto integral de policies/flags RLS, incluindo ausência de policies extras. Segunda instalação aborta. POST espera composição com helper false, **não** release antigo/reabertura.

## Revisão independente e limites

Revisão read-only independente apontou selagem antes do crédito e ausência de comparação integral RLS; ambos receberam barreiras/testes locais. Revisão integral final pelo proprietário continua obrigatória; não há homologação JWT/PostgREST hospedada desta composição.

Dependências sintéticas/replica histórica: Auth, catálogo SaaS/assinaturas e fixtures locais; estrutura parcial de relações fora do recorte; seed usa `session_replication_role=replica` apenas na preparação. Chamadas testadas usam `SET LOCAL ROLE authenticated`, claims sintéticas e triggers ligados (`origin`); dois testes de invariantes de trigger usam execução owner local explicitamente identificada, sem chamar isso de RLS real.

Achado adicional preservado: `fn_b2b_credit_exposure` usa `numeric(6,2)` para percentual. Limite local 1/exposição180 provoca overflow antes de avaliar bloqueio. Não alterado neste recorte; limite100/exposição180 exercita a decisão real e a barreira final. Essa faixa extrema permanece pendência de revisão financeira, não sucesso silencioso.

Bloqueadores remanescentes: revisão final whole-chain, execução PRE/POST independente no canônico e provas JWT reais A/B/gestor cumulativo/revogação após implantação autorizada. Qualquer pedido para entrar em produção/entrega continua bloqueado por desenho e exige recorte próprio. Não reaplicar release antigo nem reabrir writer junto deste pacote.