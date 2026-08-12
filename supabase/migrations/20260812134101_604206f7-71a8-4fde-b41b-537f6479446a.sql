CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE TABLE public.company_fiscal_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj text UNIQUE NOT NULL,
    legal_name text NOT NULL,
    trade_name text,
    is_active boolean DEFAULT true,
    configuration_version integer DEFAULT 1,
    configuration_status text DEFAULT 'DRAFT',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_fiscal_settings TO authenticated;
GRANT ALL ON public.company_fiscal_settings TO service_role;

ALTER TABLE public.company_fiscal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fiscal settings"
ON public.company_fiscal_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_settings_init()
RETURNS public.company_fiscal_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.company_fiscal_settings;
BEGIN
    -- Advisory lock para evitar corrida na inicialização
    PERFORM pg_advisory_xact_lock(hashtext('company_fiscal_settings_init'));
    
    SELECT * INTO v_row FROM public.company_fiscal_settings WHERE is_active = true LIMIT 1;
    
    IF NOT FOUND THEN
        INSERT INTO public.company_fiscal_settings (cnpj, legal_name, trade_name)
        VALUES ('00000000000000', 'EMPRESA INICIAL', 'NOME FANTASIA')
        RETURNING * INTO v_row;
    END IF;
    
    RETURN v_row;
END;
$$;
