# Ativação escopada do novo parceiro — somente preparação

**Não aplicado, não aprovado e não executado pelo agente.** O alvo de produção foi relatado pelo proprietário; nenhuma leitura ou escrita hospedada foi feita nesta rodada. O UUID completo do parceiro não foi fornecido, somente o prefixo `5c4f35f8`, portanto não existe SQL ou payload executável presumindo sua terminação.

## Diagnóstico do achado autenticado relatado

O código do leitor `b2b_list_payment_condition_options_secure` devolve `mode='required'` somente quando a empresa está `enforced` ou quando o parceiro está no array `pilot_partner_ids`. Fora desse array, devolve `legacy`. O fluxo legado não exige escolha de meio e usa `simulate_b2b_payment_plan_secure`; isso explica a sequência relatada de seletor temporário, simulação de R$ 9 após 10% e envio habilitado sem meio. A parcela 08/12/2026 também é compatível com 30 dias contados da data do pedido de 08/11/2026, e não com a regra V1 baseada na NF.

Essa conclusão vem do contrato local e do relato de produção; o agente não consultou a ativação LIVE. O fallback legado não deve ser removido globalmente: parceiros fora da ativação continuam no contrato anterior. A correção de targeting é adicionar o novo parceiro ao piloto existente, não tornar o contrato obrigatório para todos.

## Procedimento manual do auditor, pelo fluxo normal

1. Entrar com a sessão administrativa ARBio e abrir a configuração canônica **Motor Comercial B2B → Meios de pagamento**.
2. Recarregar a configuração e conferir a atribuição vigente do plano sintético `TESTE-FLUXO-20261108-V2` ao UUID completo que começa com `5c4f35f8`.
3. Em **Exigência no pedido**, manter marcados todos os parceiros atuais do piloto e marcar também o novo parceiro. Não usar **Tornar obrigatória**.
4. Clicar **Ativar piloto** uma vez. A tela existente envia o array completo preservado + o novo ID e o `p_expected_version` observado. Em `payment_condition_activation_stale`, recarregar, revisar e só então decidir; não há retry automático.
5. No comprador, reabrir/relcarregar a condição. O leitor deve responder `required`; durante qualquer releitura, a simulação e o envio ficam contidos.
6. Selecionar explicitamente **Boleto**. O default financeiro do parceiro não escolhe meio no pedido.
7. Conferir total calculado pelo servidor, parcela única e **Parcelas estimadas**. A nota deve informar que o vencimento definitivo conta da emissão da NF. Só após escolha e simulação V1 válidas o botão pode habilitar.
8. Não enviar pedido real nesta preparação. Uma eventual submissão exige autorização específica separada; NF, cobrança, recebível e comunicação continuam bloqueados.

O plano simbólico e os critérios de aceite estão em `activation-plan.json`.

## Evidência local executada

- Tela administrativa: a inclusão preserva o parceiro antigo, envia somente `p_mode='pilot'` com o CAS atual e nunca `enforced` no cenário testado.
- Comprador: antes da correção, uma invalidação com cache `legacy` deixava **Enviar pedido** habilitado durante a releitura. `NovoPedido.tsx` agora trata `isFetching` como modo indeterminado, aposenta a simulação atual e mostra carregamento até a resposta. A reabertura `legacy → required` também foi coberta.
- Matriz B3 descartável: **231/231, exit 0**. Um parceiro/comprador novo, sem histórico, entra no array sem remover o antigo; ambos ficam `required`, parceiro fora do array e outro tenant ficam `legacy`, CAS antigo é negado e o writer legado do novo parceiro falha com `B2B_PAYMENT_CONDITION_REQUIRED`, sem pedido/idempotência.
- E2E local completo: **20/20, exit 0**, com reserva durável antes da tentativa legada, dez gatilhos/ACL de recebíveis e fence de cadastro preservados, fluxo logístico e rollback anteriores repetidos, sem novos recebíveis/NF.
- UI focada: **34/34, exit 0** em três arquivos; typecheck exit 0; builds automáticos OK observados.

## Falhas de oráculo/harness preservadas

- A primeira matriz do segundo comprador chamou implicitamente o parceiro antigo e obteve `forbidden_partner`; o parâmetro `partner=...` foi corrigido.
- Em seguida, a fixture de crédito já possuía exposição e negou `credit_limit_exceeded`. Não se aumentou limite nem se apagou histórico: criou-se um parceiro/comprador sintético novo, com configuração própria e sem exposição.
- No E2E, o comprador externo FSF foi negado pela fence física real antes de informar o modo. O controle do outro tenant passou a ser feito pelo administrador interno autorizado desse tenant; a fence não mudou.
- O writer legado parou primeiro em `C2DJ_REGISTERED_ATTEMPT_REQUIRED`. A tentativa foi registrada pelo contrato durável canônico e só então a negação específica B3 foi aceita como evidência.

Logs, exits e a resposta final estão em `../evidence/pilot-targeting-1538/` e `../evidence/pilot-targeting.json`. PASS sintético não prova JWT/RLS/PostgREST/Storage/browser real, não instala o candidato e não autoriza publicação.
