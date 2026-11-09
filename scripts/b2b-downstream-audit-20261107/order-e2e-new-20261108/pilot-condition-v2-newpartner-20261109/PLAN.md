# Habilitação estrita do plano V2 para o novo parceiro — PLAN_ONLY_NOT_APPROVED

Status: preparação. Nada executado. Sem SQL hospedado, GRANT, publicação ou ativação automática.
Execução só pelo proprietário, na UI admin (Comercial → Meios de pagamento, `MeiosPagamentoTab`), depois da revisão.

## Estado real lido (09/11/2026 15:28Z, ref swzpzcwiasxmjutrmvkm)
- Ativação ARBio `007bb519…`: `pilot`, `pilot_partner_ids=[7e52de9a…]`, `version=1`.
- Atribuições: somente `7e52de9a…` / `d2e37af8…` / boleto / v1.
- Versão já publicada e aprovada para o plano `a129001e…` (TESTE-FLUXO-20261108-V2, desconto 10%): boleto v1, `deadline_days=30`, `installment_count=1`, `monthly_rate=0`, categoria `9347fdab…`, meio `1e7bd8ba…`, `calendar_version=NULL`.
- Ela já corresponde a "boleto, 10% de desconto pelo plano, 0 juros, 1x, NF+30". **Não publicar nova versão.**

## Operações (exatamente duas, nesta ordem)
1. Atribuir: `b2b_payment_condition_assign(p_partner_id=5c4f35f8-4e33-4879-bdbe-476789dc9555, p_plan_id=a129001e-5a3b-4663-8f98-9bb9c3a739ed, p_method='boleto', p_version=1, p_enabled=true)`.
2. Piloto: `b2b_payment_condition_activation_set(p_mode='pilot', p_pilot_partner_ids=[7e52de9a-4bed-4d1e-8200-3255a805465c, 5c4f35f8-4e33-4879-bdbe-476789dc9555], p_expected_version=1)`.
   - Nunca `enforced`. Nunca remover `7e52de9a…`. Se o CAS falhar, parar, sem retry.

Se o passo 2 for rejeitado, a atribuição do passo 1 sozinha não muda o modo, que continua `legacy`. Reverter com `assign(..., p_enabled=false)`.

## PRE (leitura, antes do passo 1); abortar se divergir
- Ativação `pilot`/v1/`[7e52de9a…]`.
- Versão do `a129001e…` exatamente como acima, aprovada e sem aposentadoria.
- Nenhuma atribuição para `5c4f35f8…`.
- Gates de estoque/logística OFF, allowlist do piloto 0, envios/fiscal/cobrança OFF.

## POST (leitura)
- Ativação `pilot` v2 com os dois parceiros; atribuição única nova `5c4f35f8…`/`a129001e…`/boleto/v1; nada mais alterado.
- Sessão real do comprador `5c4f…`: o leitor de opções retorna `mode=required` com boleto disponível (30 dias após a NF). Sem criar pedido nesta verificação.
- Sessão do parceiro `7e52de9a…`: continua `required`. Sessão FSF: continua `legacy`/sem itens.

## Pendências declaradas
- `calendar_version=NULL`: o calendário Paracatu-MG + nacionais não está vinculado. As datas continuam estimativas e o vencimento real depende do gate fiscal/B4, que está fechado. Não inventar feriados.
- Guard 81 (bloqueio do legado em plano configurado) é independente e ainda não instalado. Recomenda-se revisá-lo antes de qualquer novo pedido real.
- PB-001038 continua legado, sem backfill. Fiscal pendente; aprovação e promoção não acionadas.
- O primeiro pedido V2 real só ocorre depois de aprovar este plano e, depois dele, ler o snapshot privado da condição.

## Atualização do proprietário (15:29Z)
- A versão boleto v1 do `a129001e…` foi publicada pelo proprietário na UI admin ARBio. A categoria `9347fdab…` é fictícia (teste). Não publicar outra versão nem duplicar a configuração.
- Leitura SQL do proprietário: 0 atribuições para `5c4f…`; ativação continua v1 só com `7e52…`. A seleção do piloto foi preparada na UI, mas **Ativar não foi clicado**.
- Os passos 1 e 2 aguardam confirmação explícita do proprietário quanto à ampliação de acesso ao novo fluxo.
- Causa confirmada: escopo do piloto. PB-001038 sem backfill.

## Executado pelo proprietário na UI admin (15:29–15:31Z, relato com SQL verificado)
- `assign` 5c4f35f8… / a129001e… / boleto / v1. `activation_set` passou para pilot v2 com ids exatos `[5c4f35f8…, 7e52de9a…]`. Autorizado por decisão humana.
- Não repetir nem duplicar a configuração. Gates de estoque/logística OFF, allowlist de entrega 0, PB-001038 com receivable=false.
- Próximo passo: o comprador simula na prévia (V1 com boleto obrigatório), sem enviar pedido antes da revisão. Depois disso, o guard 81 é recomendado antes do primeiro pedido real.
