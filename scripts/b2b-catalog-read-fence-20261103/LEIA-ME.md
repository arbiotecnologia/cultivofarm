# Regressão de leitura do catálogo B2B — pacote candidato (03/11/2026)

**Estado:** candidato NÃO aplicado. Nenhuma escrita hospedada, publicação, pedido, cobrança ou e-mail.

## Causa (reproduzida — RED)
`get_partner_catalog_secure(uuid)` chama `public.fn_b2b_resolve_base_unit_price` 3×/item. Após a migração v4 esse
invólucro (md5 real 87418209, recomposto byte a byte no PG descartável) executa `tenant_catalog_fence('read_catalog')`
→ `catalog_tenant_actor` → `can_view_catalog_internal`, que nega papéis B2B. O comprador recebe 42501
`tenant_catalog_fence_denied`; o leitor interno passa. O núcleo B2B ainda chama `public.fn_catalogo_preco_canonico`
(md5 real b201e49e), que tem a mesma cerca — chamar só o núcleo privado continuaria negando.

## Correção candidata (estreita)
- Novo `platform_private.b2b_partner_catalog_reader(partner)`: mesma guarda canônica do catálogo, sem bypass de Superadmin.
- Novo `platform_private.b2b_partner_catalog_item_price(...)`: guarda + item do vendedor, ativo, b2b_enabled, não oculto → núcleo B2B.
- Delta pinado (1×) no núcleo B2B: preço canônico via núcleo privado. Delta pinado (3×) no catálogo: usa o helper.
- Sem mudança em `can_view_catalog_internal`, cerca, ator, invólucros públicos ou ACL de cliente.

## Ensaio (PG descartável, costuras sintéticas declaradas) — PASS
GREEN: comprador legítimo lê 4 itens (químico, fertilizante, biológico, sem preço = sob consulta) com preços 150/40/80;
DTO exato sem NCM/CFOP/custo/fonte; parceiro alheio, FSF sem vínculo, comprador FSF, técnico, revogado, parceiro inativo,
anon negados; Superadmin vazio; oculto/b2b_false/inativo/outro tenant ausentes; invólucros públicos seguem negando o
comprador e servindo o interno; núcleos/helpers sem EXECUTE de cliente; reaplicar aborta; rollback volta ao RED.

## Dependências ausentes (não inferidas)
- md5 hospedado de `get_partner_catalog_secure(uuid)`, dos dois núcleos `__tenant_core` e de `tenant_catalog_fence`: derivados da composição v4; confirmar por captura read-only.
- Corpos reais de `b2b_actor_scope`, `b2b_internal_commercial_actor`, `c2_internal_order_target_reason`, `c1b_catalog_visibility_scope`, `can_view_catalog_internal`, `has_role`, `_saas_user_has_feature`, `h15_actor_organization`: costuras sintéticas.
- Fora do escopo e provavelmente afetados pela mesma cerca para comprador: carrinho/simulador/preço comercial e catálogo técnico — não liberados.
- Prova real pendente: JWT teste4@ (parceiro 7e52de9a) em homolog e depois produção, pelo auditor.
