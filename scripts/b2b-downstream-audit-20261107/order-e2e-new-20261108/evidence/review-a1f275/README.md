# Revisão a1f275 — resultado local, NÃO APROVADO

ANTES: três falhas funcionais reproduzidas na confirmação parcial, com traceback do sincronizador. Os antigos `initial_denial` não são aprovação de entrega parcial; registros históricos permanecem intactos.

DEPOIS: rebuild integral fresh **40/40, exit 0**, regressões **13/13**. Dois itens com somente uma OS e entrega, 3 embalagens com confirmação de 1 e restante sem reserva, cancelada/substituição: confirmação parcial retorna sucesso, persiste entrega/comprovante/estoque/um ledger de expedição/um recibo e deixa pedido aprovado; restante completa. Replay não duplica. OS com saldo permanece pronto_entrega para receber o restante. Excesso é negado antes da confirmação, independentemente da transição terminal. Status direto permanece fechado.

Duas conexões, duas OS e últimas entregas no mesmo pedido: espera real pelo lock, ambas confirmadas, um evento terminal e replays sem delta. Iteração intermediária encontrou dois eventos: sincronizador e gatilho canônico do pedido; o candidato passou a reutilizar exclusivamente o evento canônico na revenda, sem escrever planejamento de fabricação.

Candidato SHA256 `8ad4def8d4ae3c2e86518f2d82bf57f053cee66b0d7e165b84472cb586812c20`. PRE/POST/rollback logístico e composto planos+B3+B4+ponte concluídos. Dez gatilhos/ACL/fence e guarda no-downstream preservados. Manifesto fresh e arquivos finais identificados em summary.json; falhas anteriores separadas em before-* e iteration1-*.

Dependência fiscal REAL always-deny não foi substituída: callback simulado 104/100 e replay preservam retorno externo/pendência, com **zero documento, alocação, snapshot e título**; nota fixture continua DRAFT. Contabilidade real pendente, positivo fiscal integrado NOT_RUN_BLOCKED. Nenhuma prova JWT/RLS/Storage HTTP, produção, provedor ou envio. Candidato inativo, revisão independente obrigatória.
