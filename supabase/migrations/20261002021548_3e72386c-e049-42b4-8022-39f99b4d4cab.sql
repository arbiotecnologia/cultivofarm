-- D51.2-D — hardening idempotente das ACLs do singleton de provedores.
-- A UI usa exclusivamente a Edge Function autenticada; somente service_role/owner acessam a tabela.
REVOKE ALL PRIVILEGES ON TABLE public.communication_provider_settings
  FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.communication_provider_settings
  TO service_role;

-- O schema atual usa id smallint DEFAULT 1 e não possui sequência. Este bloco
-- cobre de forma idempotente uma eventual sequência legada sem criar objeto novo.
DO $acl$
DECLARE
  v_sequence regclass := to_regclass('public.communication_provider_settings_id_seq');
BEGIN
  IF v_sequence IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated',
      v_sequence
    );
    EXECUTE format(
      'GRANT ALL PRIVILEGES ON SEQUENCE %s TO service_role',
      v_sequence
    );
  END IF;
END
$acl$;

DO $post$
DECLARE
  v_role name;
  v_privilege text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name] LOOP
    FOREACH v_privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(v_role, 'public.communication_provider_settings', v_privilege) THEN
        RAISE EXCEPTION 'D51.2-D ACL ABORT: % ainda possui % direto na tabela', v_role, v_privilege;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.communication_provider_settings', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.communication_provider_settings', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.communication_provider_settings', 'UPDATE') THEN
    RAISE EXCEPTION 'D51.2-D ACL ABORT: service_role perdeu privilégios necessários';
  END IF;
END
$post$;