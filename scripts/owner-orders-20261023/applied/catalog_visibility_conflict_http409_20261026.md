# catalog_visibility_conflict_http409_20261026 — aplicado externamente pelo auditor (NÃO REAPLICAR)
- Ref `swzpzcwiasxmjutrmvkm`. `platform_private.catalog_tenant_set_visibility_core`: exatamente 2 `RAISE ... ERRCODE='40001'` → `'PT409'`.
- md5 pré `143b83413eb7a8fee5060043e46e70db`; pós `ba09b5a94cb7bd4e786db0df1acc0f5a` (informados pelo auditor; não verificados pelo agente).
- Cliente `src/lib/catalogo/tenantCatalogVisibility.ts` mapeia pela mensagem, sem depender do código: sem mudança funcional.
- Homologação real A/B relatada pelo auditor (não reproduzida pelo agente): stale 409 <0,5s; A oculta fixture fertilizante e B segue livre;
  replay A retorna a mesma v1; A restitui v2; B oculta só em B e restitui v2; parceiro A negado 403.
- Teste cliente: `src/test/catalogo/http409Conflicts.test.ts`.
