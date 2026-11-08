# Reconstrução nova — trabalho parcial, NÃO APROVADO

Autorização Renato 08/11/2026 03:13 UTC. Este diretório é novo, não recuperação de `order-e2e/`; nenhum 11/11 ou 34/34 histórico entra nos resultados.

## Executado nesta rodada

- `rebuild.py` copia dependências para espelho em `/tmp`, calcula procedência SHA256 e roda `compose.py` com PostgreSQL 17.11, somente socket Unix e sem listener TCP. Geradores escrevem apenas no espelho; capturas/candidatos anteriores permanecem intactos.
- Restauração integral da captura física: zero dependências não restauradas; stack revisável de comprovante/estoque/envase/grupo composta. Checkpoint **novo desta execução**, não artefato histórico recuperado.
- Confirmação/envio com PRE/POST medidos e instalador físico 6667a8d6 pinado (SHA256 `93aa96092d2e7210bfc8ae7e6741db41bd439c1ac737fc8301248ce1ff9dabbf`). Controle novo executou compra de três embalagens de 25 kg, reserva parcial de duas, agrupamento/baixa, envio, comprovante sintético e confirmação, sem fabricação/CQ/envase. **Controle físico com demanda agronômica local, não E2E B2B.**
- Base B3 reconstruída separadamente do zero: checks dos seis corpos reais e PRE/install/POST passaram nesta execução, sem contabilizar resultados antigos. Tentativa de fusão das relações/corpos econômicos na base física mantém helpers de autoridade existentes em vez dos stubs permissivos do harness B3.

## Continuação c40a13b8 — comprador no tenant vendedor

Última execução nova: **8/8 checkpoints PASS, exit 0**. Os chamadores exatos são `simulate_b2b_payment_condition_secure` e `create_partner_order_condition_secure`, ambos por `c2_order_actor_scope` e `c2_owner_order_guard`. O shape canônico foi preservado: `organizations.partner_account_id=NULL` no tenant vendedor e exatamente um `partner_users` do comprador com `tenant_id` do vendedor. Nenhuma organização foi transformada em parceiro e nenhum Superadmin foi usado.

A captura atual de `b2b_actor_scope` já resolve o vínculo válido quando a organização não tem parceiro próprio. As falhas reproduzidas foram da fixture reduzida: `tenant_id` ausente e o resolvedor real sem assinatura/funcionalidades. Foram completados o vínculo e uma assinatura local com `pedidos_b2b` e `catalogo_precos`; nenhuma guarda ou writer foi substituído. `assert_b2b_partner_scope` permanece MD5 `f86f43f9d9ad3ed97b840fcc02c79476` e `c2_order_actor_scope` MD5 `54c4327d63f48e39f598129ff9dd8f09`.

Novo pedido de duas embalagens de 25 kg: simulação B3, reserva durável pelo servidor, criação, replay com o mesmo ID e recuperação `committed`. Total local R$ 373,04 em três parcelas estimadas, sem NF ou recebível. Antes da promoção, `approve_partner_order` foi negado por `C2_ACCOUNTING_PENDING` sem alterar o pedido; com configuração contábil fictícia VALIDATED e CAS exato, a promoção e o aceite vendedor passaram. `ready_for_production=false` preservado.

Negativos executados: técnico isolado, comprador de outro tenant, perfil inativo, vínculo revogado, tenant divergente e segundo vínculo impedido por `partner_users_user_id_key`. Evidências em `buyer-scope-diagnostic.json`, `buyer-scope-negatives.json`, `buyer-attempt.json`, `buyer-order.json` e `seller-acceptance.json`.

**Continuação 15:07 — ponte logística INCOMPLETA:** candidato novo, inativo e não aprovado, com gate fechado por padrão, writer privado sem grant de cliente, ticket específico para OS de revenda e deltas pinados dos corpos recém-instalados. A execução mais recente terminou **exit 1**, com **12 checkpoints PASS antes da falha**, não 12/12. Passaram OS sem fabricação, compra, reserva parcial e negativos de fração/ator/parceiro/pedido. O primeiro agrupamento expediu e o cancelamento restaurou as três embalagens sem recebível; a segunda reserva, o agrupamento/replay e o envio/replay foram alcançados sem erro. A geração do comprovante foi negada por `platform_private.delivery_proof_recheck_20261030` / `DELIVERY_PROOF_SCOPE_DENIED`; confirmação, regressão manual posterior e POST/rollback estão NOT_RUN. SHA256 do candidato desta tentativa: `2a73d61896c051c74cec1c5c6357f4551d55b3ecabb028a990e7334f7675565e`. Helpers globais permanecem intactos. Artefatos e status em `evidence/logistics/`; nenhum candidato está aprovado ou instalável sem revisão independente. B4 integrado, NF/recebível e prova JWT/RLS/Storage/browser continuam NOT_RUN/NÃO APROVADOS.

## Evidências e limites

`evidence/` conserva tentativas e falhas, stdout/stderr/exitcode, manifesto de origem, metadados novos B3 e checkpoint novo identificado. Falhas intermediárias: registro Python de módulo, representação ACL após dump, assinaturas incompatíveis dos stubs, campos obrigatórios de fixtures e constraints ausentes. Todas preservadas; helpers canônicos mantidos, sem DROP para contornar autoridade.

Dados upstream sintéticos montados sob `session_replication_role=replica` somente na preparação local, nunca durante os writers testados; GUC local é transporte Auth sintético, Storage.objects é fixture sem bytes/HTTP. Permissões de consulta de fixture e relações mínimas adicionadas são costuras locais, não prova de RLS/JWT/produção. Os dez gatilhos/ACL reais de recebíveis e baseline de cadastro reconciliada deverão ser exigidos na próxima composição B4; este controle físico ainda não os revalida integralmente.

Não houve consultas/escritas hospedadas, Auth, publicação, NF, cobrança ou envio externo nesta reconstrução. Piloto e cinco títulos intocados. B4/estoque/entregas continuam NÃO APROVADOS. A ausência antiga de artefatos deixou de ser bloqueio humano; a tarefa permanece tecnicamente incompleta na guarda de linha `stock_p1_guard` documentada acima.

Execução: `python3 scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/rebuild.py`. Por padrão restaura tudo do zero; `NEW_E2E_REUSE_FRESH=1` reutiliza exclusivamente checkpoint novo local explicitamente identificado para iterações.

## Correção UX 08/11 03:31 — reserva inicial não é envio anterior

Correção integrada ao frontend em preparação, sem alterar SQL, contratos, pins de captura ou o harness logístico. A tela agora distingue o `state` canônico, não apenas `mode=durable`: `reserved` não mostra alerta de envio anterior nem ação de encerramento; `uncertain` oferece verificação/encerramento explícitos; `committed` conserva o diálogo de ACK com UUID/key/geração; `closed` conserva o avanço somente por clique e usa linguagem de tentativa, sem afirmar envio. Loading/erro usam texto neutro, sem presumir histórico. Journal/IndexedDB, hooks de recuperação e deduplicação permanecem inalterados; reserva inicial ainda usa a mesma chave do servidor no envio.

Evidência nova em `evidence/ux-journal-0331/`: três arquivos Vitest, **59/59, exit 0** (34 journal, 9 diálogo/estados, 16 encerramento legado). Quatro casos novos exercitam reserva sem pedido e sem fechamento/avanço na montagem, envio posterior com a chave reservada, encerramento incerto somente por clique, closed com CAS explícito e troca de conta descartando ACK anterior. Os demais testes preservam committed/duplo clique/revogação/fences. Transporte Auth/RPC sintético e IndexedDB emulado: não é sessão real, JWT/RLS, Storage HTTP nem E2E logístico. Avisos não fatais de React act/React Router constam no log. Prévia registrou `build OK` em 03:33:02 UTC; nenhum typecheck independente foi executado manualmente.

Não foi aberto o catálogo em sessão real nesta rodada: sua montagem chama recuperação/reserva hospedada, fora da autorização de zero hosted writes. Nenhuma publicação, envio, NF, cobrança ou alteração do piloto/cinco títulos. Pendências logísticas acima continuam abertas e NÃO APROVADAS.

## Correção UI separada 08/11 14:07 — defaults financeiros de novo cadastro

O fato do parceiro fictício salvo pela sessão real do proprietário foi registrado como relato auditado, não como nova consulta do agente: limite 10000, prazo 30, Boleto bancário, `billing_trigger=manual`, `auto_generate_receivable=false`, `block_if_overdue=true`. Manual é contenção de teste, não nova regra comercial; recebível somente após NF autorizada continua pendente.

`emptyPartnerSettings` agora inicia somente novos formulários com `manual` e `auto_generate_receivable=false`; prazo 7, método NULL e demais valores permanecem como estavam. Configurações existentes `na_entrega`/auto=true continuam sendo carregadas sem reescrita, e o RPC/CAS não mudou. Ausência e abertura/reabertura não gravam; salvar exige método ativo explícito e usa `p_expected=NULL` quando não havia settings.

Evidência independente em `evidence/ui-safe-defaults-1407/`: três arquivos Vitest **47/47 exit 0**, typecheck exit 0 e prévia `build OK` em 14:24:36. Cobertura inclui novo default, abertura sem gravação, salvar explícito, existentes sem regressão e conflito CAS. SDK/Auth/RPC são sintéticos; não é prova JWT/RLS/sessão real. Nenhuma escrita hospedada, publicação, envio, NF/cobrança ou alteração de títulos.
