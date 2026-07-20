
DO $$
DECLARE v_uid uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'comercial@arbio.com') THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'comercial@arbio.com', crypt('123456', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nome":"Gestor Comercial"}'::jsonb, now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', 'comercial@arbio.com'),
            'email', v_uid::text, now(), now(), now());
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'gestor_comercial') ON CONFLICT DO NOTHING;
  END IF;
END $$;
