# Revisão independente 70d08c — ANTES/DEPOIS

Escopo: candidato local de logística B2B para revenda. Nenhuma operação hospedada, publicação, NF, cobrança ou envio.

## ANTES — candidato `6452c8ce4c61dbc52222d2081fe2a9c0d0099dc5c11ecad11cae48849b61cbb3`

A reprodução integral em PostgreSQL 17.11 descartável terminou exit 1, com 27/32 checkpoints e cinco vulnerabilidades confirmadas:

- Dois itens com somente uma OS/entrega: pedido concluído indevidamente.
- Item de quantidade 3 com entrega 1 e duas unidades ainda sem reserva: pedido concluído indevidamente.
- Parcial cancelada: uma unidade ativa concluiu pedido de duas, ignorando a quantidade restante.
- Tentativa de entregar 3 em pedido de 2: excesso confirmado e pedido concluído.
- Revogação do papel durante `SELECT ... FOR UPDATE`: uma OS e um recibo foram criados sem autoridade vigente.

Perfil inativo, tenant alterado e gate fechado durante o lock já foram contidos por guards independentes (`tenant_context_required`, `tenant_scope_violation` e `OS_APPROVAL_SCOPE_DENIED`), sem efeitos. Os quatro replays revogados também já foram negados. Isso não elimina a necessidade da reautorização explícita no writer.

Artefatos: `before/results.json`, `before/checks.json`, stdout/stderr/exitcode. A tentativa inicial com segunda apresentação inelegível e oráculo excessivamente específico fica em `attempts/01-oracle-and-second-product.log`; não é usada como prova final.

## DEPOIS — candidato `db36815b2aad673a2f9e09823f90eb4c1014856df191e06374d1b701cbb8beea`

Somente `resale_logistics.py` foi corrigido, por geração pinada:

- A transição `aprovado→entregue` exige, para **cada** `partner_order_items`, soma de entregas confirmadas exatamente igual à quantidade imutável. Ausência de OS/item, falta ou excesso bloqueiam; canceladas não somam; entregas confirmadas fora dos itens bloqueiam. O snapshot econômico e os snapshots de condição permanecem inalterados.
- Após o `FOR SHARE` do item, último lock explícito antes do ticket/INSERT, o writer revalida identidade, ator comercial, tenant do motor, gate e escopo pedido↔parceiro/owner/origem. Revogação nega antes de OS/ticket/ledger/evento/recibo. Replays continuam reautorizados após advisory lock.

Resultado final: **32/32 checkpoints e 12/12 casos da revisão, exit 0**. Os quatro cenários de quantidade foram contidos e depois completados somente após cobrir todos os itens/quantidades. As quatro revogações durante o lock foram negadas sem delta de efeitos; os quatro replays revogados não devolveram recibo. Regressão manual, dez gatilhos/ACL de recebíveis, fence de cadastro, POST e rollback deny-only permaneceram aprovados localmente.

A primeira execução DEPOIS integral teve somente uma falha de oráculo: a revalidação do tenant chamou a guarda canônica e negou com `ESTQ_FEATURE_REQUIRED`, enquanto o teste exigia `B2B_RESALE_SCOPE_CHANGED`. O candidato não foi alterado por isso; o log está em `attempts/02-tenant-canonical-error-oracle.log`. A repetição final aceitou o código canônico observado, usou o checkpoint novo identificado da execução anterior e passou 32/32.

Fonte do gerador DEPOIS: SHA256 `56545af4bc0af6fcfb190b63191e04b32b99282c4b95bf5641bc44d922c34b12`.

## Limite

PASS é somente componente/composição sintética local, não aprovação independente nem exploração LIVE. O candidato permanece **INATIVO/NÃO APROVADO/NÃO INSTALÁVEL** até nova revisão e homologação JWT/RLS/Storage/PostgREST/browser. Isolamento dos planos comerciais continua BLOCKER prioritário de liberação.
