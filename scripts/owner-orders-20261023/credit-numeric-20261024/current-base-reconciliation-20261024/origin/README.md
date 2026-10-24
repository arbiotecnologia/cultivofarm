# C2-ORD — composição de origem externa, candidata inativa

**NO-GO para implantação automática/reabertura.** Pacote local; produção permanece sob `c2_contain_writer_internal_origin_conflict`. Nenhuma sessão foi alterada, nenhum pedido/título hospedado criado, nenhum SQL aplicado ou frontend publicado pelo agente.

## Causa e reprodução

O `trg_00_b2b_internal_snapshot` executa para TODO INSERT de pedido e exige organização/autoridade comercial interna. O create C2 externo autorizado não possui essa autoridade: a RPC completa, com o guard original capturado, reproduziu `B2B_INTERNAL_ACTOR_DENIED` no PostgreSQL descartável. Não é problema do carrinho nem autorização para atribuir papel interno.

Foram capturados 44 triggers atuais de pedidos, itens, termos, cronograma, vínculos financeiros, títulos e parcelas; 50 policies em 11 relações; 78 corpos/owners/ACLs de dependências, inclusive o motor de preços e os helpers canônicos C2/P1. Capturas não incluem dados de usuários/pedidos de produção.

## Correção proposta

### Bloqueio humano contábil obrigatório — complemento 23:55 UTC

Segundo consulta readonly relatada pelo proprietário, owner A `007bb519-cba0-4704-be2c-cb93ad010048` possui uma configuração ativa **DRAFT**, com `accounting_validated_at=NULL`; owner B `8f57c7dd-0557-4041-b401-7a00f7244626` não possui configuração. Esses dados NÃO foram alterados nem novamente consultados pelo agente.

Revisão independente **9c62ecab**, relatada em 24/10 00:14 UTC: PRE estrutural integral readonly canônico PASS; PRE contábil negado com **42501/C2_ACCOUNTING_PREREQUISITE_BLOCKED**, esperado. A informou CNPJ/razão social reais, mas continua DRAFT sem atestado. Isso não atende à validação contábil nem autoriza alterar dados/pré-requisito. PRE da rodada atual permanece byte-exato ao revisado; POST atualizado é local, ainda não executado no canônico.

O requisito é indispensável para emitir a prova de origem: **NO-GO concreto para implantação/reabertura** até revisão contábil humana legítima do owner A pelo fluxo autorizado. Não preencher CNPJ/nome/atestado fictícios, marcar VALIDATED apenas para passar ou relaxar o guard. `preflight-accounting.sql` é READ ONLY e obrigatório junto do PRE estrutural; retorna `C2_ACCOUNTING_PREREQUISITE_BLOCKED` enquanto A não estiver realmente pronto. B é diagnóstico, não pedido de criação de configuração. PASS estrutural não significa prontidão contábil.

A composição dos filhos já separa `c2_external_origin_assert` do `b2b_internal_assert_origin`: origem interna continua passando exclusivamente pelo assert interno; origem externa exige ticket somente durante create e autoridade interna owner P1 nas alterações posteriores. Novos negativos executam o trigger independentemente da filtragem RLS e negam gestor singleton/cumulativo, técnico, produtor e atores B após create. Isso não concede administração financeira interna ao comprador.

- Prova externa explícita e imutável `c2_external_origin_snapshot`, separada da origem interna; NULL legado NÃO autoriza promoção.
- Emissão exclusivamente na transação do create canônico, após guards/cart/hash/replay, usando o `issue_ticket` privado existente. Ticket txid/partner consumido ao terminar; sem GUC, claims de papel inventadas, trigger-depth ou desativação de RLS.
- Owner/credor/emissor derivados de `commercial_owner_organization_id` ativo e único estabelecimento fiscal validado desse owner; cliente precisa pertencer ao mesmo owner. Sem organização própria do parceiro e sem UUID/payload como prova de autoridade.
- Guards de pai/filhos validam a prova e preservam selagem econômica/imutabilidade. Alteração administrativa posterior depende do owner interno ativo autorizado por P1, nunca dos papéis externos.
- Aprovação externa pode selar e cobrar, mas mantém `ready_for_production=false`; etapas operacionais continuam negadas. Não reabre planejamento/produção/entrega/fiscal. Guard final `zz_c2_external_final_state` impede persistir uma selagem caso um guard de crédito posterior retire aprovação.
- A notificação externa comunica aprovação comercial com planejamento ainda não liberado. O ramo interno retém a mensagem capturada, sem modificar seus gates/readiness; preservação textual não é homologação operacional interna.
- Para `na_entrega`, aprovação externa não gera título. O teste novo revelou que o gerador manual original permitia cobrar antes da entrega: barreira específica no impl externo passa a negar com **42501/C2_EXTERNAL_DELIVERY_REQUIRED**, após configuração confirmada e antes de qualquer efeito financeiro. Eligibility internal-only permanece corpo/ACL intactos; não altera o comportamento interno. Produção/entrega continuam negadas, logo esse bloqueio externo não tem um caminho operacional de liberação neste pacote.
- Parcelas de título externo são inseridas com datas/valores exatos do cronograma contratual (30 dias), evitando UPDATE de valores imutáveis H6 após inserir parcelas por meses civis. Fluxo interno original permanece preservado.
- Não muda fiscal resolver, eligibility ACL/corpo, settings fence/CAS ou helper de contenção. Método ativo é o instalado P1; configuração ausente falha explicitamente, sem INSERT automático.

## Caminhos exatos

Prefixo: `scripts/owner-orders-20261023/internal-origin-composition-20261023/`

| Artefato | Arquivo |
|---|---|
| Capturas/hash/ACL/trigger/policies | `baseline/` |
| PRE integral READ ONLY | `preflight.sql` |
| PRE contábil obrigatório READ ONLY | `preflight-accounting.sql` |
| Candidato transacional **inativo** | `candidate.sql.review` |
| POST assertivo READ ONLY, writer ainda contido | `postflight.sql` |
| Contenção guardada create/approve/generate externos, não reversão de código | `rollback.sql.review` |
| Montador determinístico local | `assemble.py` |
| Testes PostgreSQL | `test-local.py` |
| Proposta numérica separada, não integrada | `numeric-overflow-proposal.md` |
| Resultado e limites | `validation.md` |
| Hashes | `SHA256SUMS` |

Os scripts SQL NÃO comprovam o endpoint Supabase sozinhos. Operador deve validar externamente o ref exato `swzpzcwiasxmjutrmvkm` antes de qualquer execução; divergência/ausência fecha. PRE exige containment atual byte-exato, owners/ACLs, triggers e conjunto integral de policies/flags RLS, incluindo ausência de policies extras. Segunda instalação aborta. POST espera composição com helper false, **não** release antigo/reabertura.

## Revisão independente e limites

### Contenção ampliada — complemento 24/10 00:20 UTC

O rollback antigo fechava apenas novos pedidos. O atual exige os **78 corpos/owners/ACL esperados pós-composição**, policies/RLS e todos os triggers, incluindo helpers privados/final guard, antes de alterar qualquer função. O helper de criação aceita apenas hash false capturado ou o hash revisado reaberto `5f0a08d1d4f8d8c5a7ae58e24c71071e`, com owner/ACL originais. Estado inesperado/parcial aborta, sem aplicar silenciosamente.

Na mesma transação fecha create e adiciona **42501/C2_EXTERNAL_OPERATIONS_CONTAINED** em approve e generate impl, imediatamente após o lock/leitura do pedido, antes de aprovação, auditorias financeiras ou retorno de replay. Origem externa identificada pelo snapshot imutável do servidor; nenhum payload/role escolhe a contenção. Origem interna e NULL legado mantêm corpos e gates existentes. POST embutido verifica os três corpos normalizados e owner/ACL antes do COMMIT. Não DROP/reverte coluna, não apaga dados nem restaura grants.

**É contenção, não reversão do código de composição.** O `postflight.sql` de composição deixa de ser o estado esperado para approve/impl após contê-los; não reaplicar release para “reparar” essa divergência. Antes de executar, proprietário deve provar ref canônico e **pausar/drenar operações afetadas**. Lock com timeout não cancela invocações já iniciadas nem certifica quiescência. Sem essa prova, NO-GO operacional. Pré-requisito contábil permanece para implantação/reabertura, não deve impedir emergência de contenção de um pacote já instalado.

84 checks sintéticos: externos criados antes da contenção (pendente, aprovado com título e aprovado sem título), approve/generate negados sem efeitos incluindo replay, histórico/snapshots idênticos, drift de corpo/ACL abortado. Create interno canônico usa organização própria autorizada; approval/generate retornam a mesma contenção downstream antes/depois, **não** sucesso interno inventado. Legado NULL mantém negação original de preço. Sucesso financeiro interno permanece não homologado porque o guard LIVE já o bloqueia. Pfs real **na_entrega/active/auto=true** confirmado pelo proprietário, não alterado.

Revisão read-only independente apontou selagem antes do crédito e ausência de comparação integral RLS; ambos receberam barreiras/testes locais. Revisão integral final pelo proprietário continua obrigatória; não há homologação JWT/PostgREST hospedada desta composição.

Dependências sintéticas/replica histórica: Auth, catálogo SaaS/assinaturas e fixtures locais; estrutura parcial de relações fora do recorte; seed usa `session_replication_role=replica` apenas na preparação. Chamadas testadas usam `SET LOCAL ROLE authenticated`, claims sintéticas e triggers ligados (`origin`); dois testes de invariantes de trigger usam execução owner local explicitamente identificada, sem chamar isso de RLS real.

Achado adicional preservado: `fn_b2b_credit_exposure` usa `numeric(6,2)` para percentual. Limite local 1/exposição180 provoca SQLSTATE22003 antes de avaliar bloqueio; função e create agora têm testes explícitos sem efeitos. Não alterado no candidato; limite100/exposição180 continua exercitando a decisão real e a barreira final. `numeric-overflow-proposal.md` propõe somente `v_pct numeric`, sem teto arbitrário nem mudança da fórmula/decisões; experimento local transacional cobre block/approval_required e restaura MD5 original. Continua pendência financeira separada, não correção instalada.

Bloqueadores remanescentes: revisão final whole-chain, execução PRE/POST independente no canônico e provas JWT reais A/B/gestor cumulativo/revogação após implantação autorizada. Qualquer pedido para entrar em produção/entrega continua bloqueado por desenho e exige recorte próprio. Não reaplicar release antigo nem reabrir writer junto deste pacote.