DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'financeiro@arbio.com', crypt('123456', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"created_by_admin":true,"nome":"Financeiro Teste"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'financeiro@arbio.com', 'email_verified', true),
    'email', v_user_id::text, now(), now(), now());

  INSERT INTO public.profiles (id, user_id, email, nome, ativo)
  VALUES (gen_random_uuid(), v_user_id, 'financeiro@arbio.com', 'Financeiro Teste', true)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'financeiro');
END $$;