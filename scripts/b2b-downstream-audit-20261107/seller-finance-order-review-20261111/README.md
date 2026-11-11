# Leitura financeira do pedido externo AR Bio (Financeiro vendedor) — LOCAL, não instalado

Função nova `public.get_b2b_seller_finance_order_review_v1(uuid)` (somente leitura, md5 `451db4ab6cd9e8d87e036b7a9c828238`).
Autorização idêntica à via externa do writer de rejeição instalado (`781427080999234bfe74b04e2b8e7ffd`), que o PRE exige.
Retorna itens, termos congelados, situação do cabeçalho (rotulada à parte), pendência contábil e `reject_eligible` com o mesmo predicado de estado do writer.

Termos `not_required`: o snapshot é imutável (o próprio gatilho real recusou a alteração no espelho); revisão financeira exige novo pedido com plano que exija aprovação financeira. Nenhum writer novo.

Arquivos: 01-pre / 02-install (REVOKE PUBLIC, anon; GRANT authenticated) / 03-post / 04-rollback (DROP só se md5 exato; recusa drift). SHA em `SHA256SUMS`.

Evidência: `evidence/attempt-003` — exit 0; 17 PASS, 2 BLOCKED (mutação sintética de not_required e de pendência contábil recusada pelos gatilhos reais de imutabilidade), 38 gatilhos preservados.
Tentativas 001 (medição) e 002 (timeout por cluster órfão) preservadas; uma execução intermediária travada pelo mesmo cluster órfão, com apenas o manifesto, foi descartada antes desta numeração.
Limites: Auth por claims SQL sintéticos; não prova JWT/RLS/Storage hospedado.
