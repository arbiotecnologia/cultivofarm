# Leitura financeira do pedido externo AR Bio (Financeiro vendedor) — LOCAL, não instalado

Função nova `public.get_b2b_seller_finance_order_review_v1(uuid)` (somente leitura, md5 `69f145f16b963044f319948ef9daa8aa`).
Autorização idêntica à via externa do writer de rejeição instalado (`781427080999234bfe74b04e2b8e7ffd`), que o PRE exige.
Retorna itens, termos congelados, situação do cabeçalho (rotulada à parte), pendência contábil e `reject_eligible` com o mesmo predicado de estado do writer.

Termos `not_required`: o snapshot é imutável (o próprio gatilho real recusou a alteração no espelho); revisão financeira exige novo pedido com plano que exija aprovação financeira. Nenhum writer novo.

Arquivos: 01-pre / 02-install (REVOKE PUBLIC, anon; GRANT authenticated) / 03-post / 04-rollback (DROP só se md5 exato; recusa drift). SHA em `SHA256SUMS`.

Evidência: `evidence/attempt-003` — exit 0; 17 PASS, 2 BLOCKED (mutação sintética de not_required e de pendência contábil recusada pelos gatilhos reais de imutabilidade), 38 gatilhos preservados.
Tentativas 001 (medição) e 002 (timeout por cluster órfão) preservadas; uma execução intermediária travada pelo mesmo cluster órfão, com apenas o manifesto, foi descartada antes desta numeração.
Limites: Auth por claims SQL sintéticos; não prova JWT/RLS/Storage hospedado.

## Revisão 051e9d14 (attempt-009, final)
- `c2_external_origin_contract_valid` agora integra o bloco de negação: origem inválida retorna `B2B_SELLER_FINANCE_REVIEW_DENIED` sem itens, termos ou notas. Motivos `accounting_pending`/`origin_invalid` removidos de `reject_block_reason`.
- Pendência contábil legítima (`C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1`, `accounting_validated=false`, aceita pelo validador existente) continua legível; é só informativa e não impede reprovar termos pendentes.
- attempt-009: exit 0, 25 PASS, 0 BLOCKED, 38 gatilhos preservados. Pedido contábil pendente criado pelo writer normal (configuração fiscal do emissor indisponível na fixture, nunca mutação do snapshot); reprovação sem novo evento fiscal/recebível/notificação; origem inválida via validador substituído só em transação revertida; pedido dispensado novo segue `not_required`; reserva existente bloqueia; rollback exato e recusa de drift.
- attempt-004 = medição do md5; 005–008 = falhas do roteiro de teste (tabela temporária entre sessões, nome do parâmetro do validador, reinício do ambiente, restauração booleana), sem mudança do candidato.
