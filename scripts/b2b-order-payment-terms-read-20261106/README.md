# B2B_ORDER_PAYMENT_TERMS_READ_V1 (NÃO APLICADO)
Causa (read-only, ref swzpzcwiasxmjutrmvkm): o guard restritivo de SELECT de `partner_orders` aceita `b2b_phase1_partner_visible OR
b2b_owner_internal_partner_readable`; o de `partner_order_payment_terms` só aceita `b2b_phase1_order_visible`. A equipe ARBio lê PB-001036, mas a
leitura direta da condição volta 0 linhas → a tela dizia "Sem condição". A linha existe (1 linha para o pedido).
Delta: nova `public.get_partner_order_payment_terms_secure(uuid)` (DEFINER, leitura) com as mesmas portas do pedido + a regra de papel de
`popt_select`; pedido inexistente nega igual; >1 linha falha. EXECUTE só para authenticated. Policies/ACL da tabela pinadas e inalteradas.
Arquivos 01–04 + generated-md5.json; local 27/27. Superadmin com papel parceiro_b2b e vínculo segue as regras atuais (não muda).
