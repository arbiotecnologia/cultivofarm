-- Identidade visual isolada por cliente/parceiro.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS marca_nome text,
  ADD COLUMN IF NOT EXISTS marca_logo_url text,
  ADD COLUMN IF NOT EXISTS marca_cor_primaria text;
ALTER TABLE public.partner_accounts
  ADD COLUMN IF NOT EXISTS marca_nome text,
  ADD COLUMN IF NOT EXISTS marca_logo_url text,
  ADD COLUMN IF NOT EXISTS marca_cor_primaria text;

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_marca_nome_check;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_marca_nome_check
  CHECK (marca_nome IS NULL OR char_length(btrim(marca_nome)) BETWEEN 2 AND 80);
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_marca_cor_check;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_marca_cor_check
  CHECK (marca_cor_primaria IS NULL OR marca_cor_primaria ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE public.partner_accounts DROP CONSTRAINT IF EXISTS partner_accounts_marca_nome_check;
ALTER TABLE public.partner_accounts ADD CONSTRAINT partner_accounts_marca_nome_check
  CHECK (marca_nome IS NULL OR char_length(btrim(marca_nome)) BETWEEN 2 AND 80);
ALTER TABLE public.partner_accounts DROP CONSTRAINT IF EXISTS partner_accounts_marca_cor_check;
ALTER TABLE public.partner_accounts ADD CONSTRAINT partner_accounts_marca_cor_check
  CHECK (marca_cor_primaria IS NULL OR marca_cor_primaria ~ '^#[0-9A-Fa-f]{6}$');

CREATE OR REPLACE FUNCTION public.save_client_portal_branding(
  _cliente_id uuid, _marca_nome text, _marca_logo_url text, _marca_cor_primaria text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_clientes uc
    WHERE uc.user_id = auth.uid() AND uc.cliente_id = _cliente_id
      AND uc.is_active
      AND (uc.valid_until IS NULL OR uc.valid_until >= now())
  ) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  IF _marca_nome IS NOT NULL AND char_length(btrim(_marca_nome)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Nome da marca inválido' USING ERRCODE = '22023';
  END IF;
  IF _marca_cor_primaria IS NOT NULL AND _marca_cor_primaria !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor da marca inválida' USING ERRCODE = '22023';
  END IF;
  IF _marca_logo_url IS NOT NULL AND _marca_logo_url !~ ('^https://swzpzcwiasxmjutrmvkm\\.supabase\\.co/storage/v1/object/public/logos/clientes/' || _cliente_id::text || '/') THEN
    RAISE EXCEPTION 'URL da logomarca inválida' USING ERRCODE = '22023';
  END IF;
  UPDATE public.clientes SET
    marca_nome = NULLIF(btrim(_marca_nome), ''), marca_logo_url = NULLIF(btrim(_marca_logo_url), ''),
    marca_cor_primaria = lower(NULLIF(btrim(_marca_cor_primaria), ''))
  WHERE id = _cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = 'P0002'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.save_partner_portal_branding(
  _partner_id uuid, _marca_nome text, _marca_logo_url text, _marca_cor_primaria text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id = pu.partner_id
    WHERE pu.user_id = auth.uid() AND pu.partner_id = _partner_id
      AND pu.papel = 'gestor' AND pa.ativo AND pa.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  IF _marca_nome IS NOT NULL AND char_length(btrim(_marca_nome)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Nome da marca inválido' USING ERRCODE = '22023';
  END IF;
  IF _marca_cor_primaria IS NOT NULL AND _marca_cor_primaria !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor da marca inválida' USING ERRCODE = '22023';
  END IF;
  IF _marca_logo_url IS NOT NULL AND _marca_logo_url !~ ('^https://swzpzcwiasxmjutrmvkm\\.supabase\\.co/storage/v1/object/public/logos/parceiros/' || _partner_id::text || '/') THEN
    RAISE EXCEPTION 'URL da logomarca inválida' USING ERRCODE = '22023';
  END IF;
  UPDATE public.partner_accounts SET
    marca_nome = NULLIF(btrim(_marca_nome), ''), marca_logo_url = NULLIF(btrim(_marca_logo_url), ''),
    marca_cor_primaria = lower(NULLIF(btrim(_marca_cor_primaria), '')), updated_at = now()
  WHERE id = _partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parceiro não encontrado' USING ERRCODE = 'P0002'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.save_client_portal_branding(uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_partner_portal_branding(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_client_portal_branding(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_partner_portal_branding(uuid,text,text,text) TO authenticated;

DROP POLICY IF EXISTS "Clientes enviam própria logo" ON storage.objects;
CREATE POLICY "Clientes enviam própria logo" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = 'clientes'
  AND EXISTS (SELECT 1 FROM public.user_clientes uc WHERE uc.user_id = auth.uid()
    AND uc.cliente_id::text = (storage.foldername(name))[2] AND uc.is_active
    AND (uc.valid_until IS NULL OR uc.valid_until >= now())));
DROP POLICY IF EXISTS "Parceiros gestores enviam própria logo" ON storage.objects;
CREATE POLICY "Parceiros gestores enviam própria logo" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = 'parceiros'
  AND EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = auth.uid()
    AND pu.partner_id::text = (storage.foldername(name))[2] AND pu.papel = 'gestor'));
