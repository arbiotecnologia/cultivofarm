-- Canonical Auth lifecycle producer, captured read-only; no hosted Auth calls.
ALTER TABLE public.profiles ALTER COLUMN ativo SET DEFAULT true;
ALTER TABLE public.profiles ALTER COLUMN senha_provisoria SET DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN telefone text, ADD COLUMN cargo text, ADD COLUMN cpf_cnpj text;
ALTER TABLE public.platform_org_admin_invites ADD COLUMN concluido_em timestamptz;
CREATE TABLE public.platform_org_admin_audit(organization_id uuid,target_user_id uuid,invite_id uuid,actor_user_id uuid,action text,status text,reason text,origin text,idempotency_key uuid,new_values jsonb,created_at timestamptz DEFAULT now());
ALTER TABLE public.organizations ADD PRIMARY KEY(id);
ALTER TABLE public.partner_accounts ADD PRIMARY KEY(id);
ALTER TABLE public.clientes ADD PRIMARY KEY(id);
INSERT INTO auth.users(id,email) SELECT user_id,'admin@example.invalid' FROM public.profiles;
ALTER TABLE public.profiles ADD FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD FOREIGN KEY(organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD FOREIGN KEY(cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles ADD UNIQUE(user_id,role), ADD FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.partner_users ADD UNIQUE(user_id), ADD FOREIGN KEY(partner_id) REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
 ADD CHECK(papel IN ('gestor','tecnico'));
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 INSERT INTO public.profiles(user_id,nome,email)
 VALUES(NEW.id,COALESCE(NEW.raw_user_meta_data->>'nome',''),NEW.email);
 RETURN NEW;
END;
$function$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER a00_cf_user_gate BEFORE DELETE ON auth.users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE FUNCTION cf_user_guards_v1.block_truncate() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'user_bulk_truncate_forbidden' USING ERRCODE='PT409'; END $$;
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON auth.users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
-- Canonical invitation columns/defaults/checks needed by the real claim producer.
ALTER TABLE public.platform_org_admin_invites
 ADD PRIMARY KEY(id), ADD COLUMN organization_id uuid NOT NULL REFERENCES public.organizations(id),
 ADD COLUMN email text NOT NULL, ADD COLUMN nome text NOT NULL,
 ADD COLUMN cpf_cnpj text, ADD COLUMN telefone text, ADD COLUMN modo_acesso text NOT NULL CHECK(modo_acesso IN ('link','senha_temporaria')),
 ADD COLUMN responsavel_principal boolean NOT NULL DEFAULT true, ADD COLUMN invited_by uuid NOT NULL,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN request_id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
 ADD COLUMN lease_token uuid, ADD COLUMN lease_expires_at timestamptz, ADD COLUMN auth_created_at timestamptz, ADD COLUMN last_error_code text,
 ADD COLUMN email_delivery_status text NOT NULL DEFAULT 'pending' CHECK(email_delivery_status IN ('pending','sending','accepted','failed','ambiguous')),
 ADD COLUMN email_attempt_count integer NOT NULL DEFAULT 0 CHECK(email_attempt_count BETWEEN 0 AND 50),
 ADD COLUMN email_idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN email_lease_token uuid,
 ADD COLUMN email_lease_expires_at timestamptz, ADD COLUMN email_last_attempt_at timestamptz, ADD COLUMN email_accepted_at timestamptz,
 ADD COLUMN email_failed_at timestamptz, ADD COLUMN email_next_attempt_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN email_last_error_code text CHECK(email_last_error_code IS NULL OR length(email_last_error_code) BETWEEN 1 AND 80),
 ADD COLUMN access_operation_kind text, ADD COLUMN access_requested_at timestamptz, ADD COLUMN access_expires_at timestamptz;
ALTER TABLE public.platform_org_admin_invites ADD CHECK(status IN ('pendente','processando','falhou','ativo'));
CREATE FUNCTION public.is_platform_superadmin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=_user_id AND r.role='superadmin'::public.app_role)
$$;