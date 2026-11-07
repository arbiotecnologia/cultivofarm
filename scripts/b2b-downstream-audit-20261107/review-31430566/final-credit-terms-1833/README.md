# Revisão final do ajuste B2B — pós-lock dos termos (18:33 UTC)

**Candidatos INATIVOS/NÃO APROVADOS.** Sem hosted, publicação, NF, cobrança ou envios.

Antes: **184/187, exit 1**; request/approve/reject não negaram a revogação do papel durante a espera no `FOR UPDATE` de `partner_order_payment_terms`. Depois: **187/187, exit 0**, com todos os **38 gatilhos reais** habilitados.

Os três candidatos agora releem pedido e termos depois dessa espera, exigem `payment_terms_id` íntegro e `terms.partner_order_id=pedido`, repetem o escopo vendedor completo e a contenção `C2_ACCOUNTING_PENDING`. Os testes usaram duas sessões PostgreSQL descartáveis e `ROLLBACK` explícito no chamador; pedido, termos, auditoria e notificações ficaram preservados.

O teste cruzado de associação continua coberto pelos casos `payment_terms_order_mismatch` das três operações. Uma tentativa adicional de troca cruzada sob locks em ordem inversa ao gatilho real terminou em deadlock e foi arquivada em `before/deadlock-harness-attempt.*`; ela não é contada como prova do predicado pós-espera.

MD5 finais: request `2f28a6e87a8f72ea54cafd0bfd852219`, approve `4cf1c4ccdb2d1acec705c11bd0cfdfd0`, reject `99cdc4eb7b286e75d1ce14332c42bf29`.
Instalação revisável SHA256: `74a924effe1c7597f3f614170bc595a20d0b87ca60d99bb663368e9519404731`.

Rollback deny-only e owners/ACLs preservados. Revisão LIVE e homologação real continuam pendentes.
