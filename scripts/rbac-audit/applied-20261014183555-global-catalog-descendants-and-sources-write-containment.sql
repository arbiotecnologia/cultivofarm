-- REGISTRO HISTÓRICO — NÃO REAPLICAR.
-- Aplicado externamente pelo Codex no canônico swzpzcwiasxmjutrmvkm:
--   20261014183555 global_catalog_descendants_write_containment
--   20261014183838 global_catalog_sources_versions_write_containment
-- ATENÇÃO: conteúdo RECONSTITUÍDO do relato do usuário (statements informados),
-- não cópia literal do arquivo de migration. Conferir contra o histórico remoto.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  public.formulacoes, public.catalogo_volumes, public.product_technical_profiles,
  public.microorganism_technical_profiles, public.product_crop_recommendations,
  public.product_target_recommendations, public.catalogo_alvos,
  public.catalogo_problemas, public.cq_parametros_referencia
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
  public.approve_microorganism_profile_with_audit(uuid, jsonb, boolean),
  public.approve_product_profile_with_audit(uuid, jsonb, boolean),
  public.aprovar_ficha_versao(uuid),
  public.bulk_inserir_alvos(text, uuid, jsonb),
  public.return_catalog_profile_to_review(text, uuid, text),
  public.update_microorganism_b2b_description(uuid, text)
  FROM PUBLIC, anon, authenticated;
-- 20261014183838 global_catalog_sources_versions_write_containment
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  public.microorganism_targets, public.microorganism_crop_recommendations,
  public.catalog_technical_sources, public.ficha_tecnica_versoes
  FROM PUBLIC, anon, authenticated;
-- Rollback seguro: NÃO restaurar escrita/EXECUTE de cliente. Futuro writer deve
-- ser RPC public INVOKER -> platform_private DEFINER (Superadmin ativo/readiness, auditado).
