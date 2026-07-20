DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_email text := 'tecnico_agronomo@arbio.com';
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  ELSE
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, crypt('123456', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('created_by_admin', true, 'nome', 'Técnico Agrônomo Teste'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email', now(), now(), now()
    );
  END IF;

  INSERT INTO public.profiles (id, user_id, email, nome, cargo, ativo)
  VALUES (gen_random_uuid(), v_user_id, v_email, 'Técnico Agrônomo Teste', 'Técnico Agrônomo', true)
  ON CONFLICT (user_id) DO NOTHING;

  DELETE FROM public.user_roles WHERE user_id = v_user_id AND role <> 'tecnico_agronomo';
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'tecnico_agronomo')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;