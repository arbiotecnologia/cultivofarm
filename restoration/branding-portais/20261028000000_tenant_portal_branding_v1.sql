-- Identidade visual por cliente/parceiro nos portais.
-- Alvo EXCLUSIVO: CultivoFarm swzpzcwiasxmjutrmvkm. Idempotente.
-- Nao aplicada pelo ambiente Lovable (o canal disponivel aponta para outro projeto).

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS marca_nome text,
  ADD COLUMN IF NOT EXISTS marca_logo_url text,
  ADD COLUMN IF NOT EXISTS marca_cor_primaria text;

ALTER TABLE public.partner_accounts
  ADD COLUMN IF NOT EXISTS marca_nome text,
  ADD COLUMN IF NOT EXISTS marca_logo_url text,
  ADD COLUMN IF NOT EXISTS marca_cor_primaria text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_marca_nome_len') THEN
    ALTER TABLE public.clientes ADD CONSTRAINT clientes_marca_nome_len
      CHECK (marca_nome IS NULL OR char_length(btrim(marca_nome)) BETWEEN 2 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_marca_cor_hex') THEN
    ALTER TABLE public.clientes ADD CONSTRAINT clientes_marca_cor_hex
      CHECK (marca_cor_primaria IS NULL OR marca_cor_primaria ~ '^#[0-9a-fA-F]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_accounts_marca_nome_len') THEN
    ALTER TABLE public.partner_accounts ADD CONSTRAINT partner_accounts_marca_nome_len
      CHECK (marca_nome IS NULL OR char_length(btrim(marca_nome)) BETWEEN 2 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_accounts_marca_cor_hex') THEN
    ALTER TABLE public.partner_accounts ADD CONSTRAINT partner_accounts_marca_cor_hex
      CHECK (marca_cor_primaria IS NULL OR marca_cor_primaria ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_client_portal_branding(
  p_cliente_id uuid,
  p_marca_nome text,
  p_marca_logo_url text,
  p_marca_cor_primaria text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'nao autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_clientes uc
    WHERE uc.user_id = auth.uid()
      AND uc.cliente_id = p_cliente_id
      AND uc.is_active
      AND uc.revoked_at IS NULL
      AND (uc.valid_until IS NULL OR uc.valid_until >= now())
  ) THEN
    RAISE EXCEPTION 'sem vinculo ativo com este cliente';
  END IF;

  IF p_marca_logo_url IS NOT NULL
     AND p_marca_logo_url !~ ('/logos/clientes/' || p_cliente_id::text || '/') THEN
    RAISE EXCEPTION 'logo fora da pasta autorizada';
  END IF;

  UPDATE public.clientes
     SET marca_nome = NULLIF(btrim(coalesce(p_marca_nome, '')), ''),
         marca_logo_url = p_marca_logo_url,
         marca_cor_primaria = p_marca_cor_primaria
   WHERE id = p_cliente_id;
END $$;

CREATE OR REPLACE FUNCTION public.save_partner_portal_branding(
  p_partner_id uuid,
  p_marca_nome text,
  p_marca_logo_url text,
  p_marca_cor_primaria text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'nao autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.partner_users pu
      JOIN public.partner_accounts pa ON pa.id = pu.partner_id
     WHERE pu.user_id = auth.uid()
       AND pu.partner_id = p_partner_id
       AND pu.papel = 'gestor'
       AND coalesce(pa.ativo, true)
  ) THEN
    RAISE EXCEPTION 'apenas gestor de parceiro ativo pode alterar a identidade';
  END IF;

  IF p_marca_logo_url IS NOT NULL
     AND p_marca_logo_url !~ ('/logos/parceiros/' || p_partner_id::text || '/') THEN
    RAISE EXCEPTION 'logo fora da pasta autorizada';
  END IF;

  UPDATE public.partner_accounts
     SET marca_nome = NULLIF(btrim(coalesce(p_marca_nome, '')), ''),
         marca_logo_url = p_marca_logo_url,
         marca_cor_primaria = p_marca_cor_primaria
   WHERE id = p_partner_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.save_client_portal_branding(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_partner_portal_branding(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_client_portal_branding(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_partner_portal_branding(uuid, text, text, text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos', 'logos', true, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 2097152,
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'];

DROP POLICY IF EXISTS "branding logo read" ON storage.objects;
CREATE POLICY "branding logo read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "branding logo upload cliente" ON storage.objects;
CREATE POLICY "branding logo upload cliente"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = 'clientes'
    AND EXISTS (
      SELECT 1 FROM public.user_clientes uc
      WHERE uc.user_id = auth.uid()
        AND uc.cliente_id::text = (storage.foldername(name))[2]
        AND uc.is_active
        AND uc.revoked_at IS NULL
        AND (uc.valid_until IS NULL OR uc.valid_until >= now())
    )
  );

DROP POLICY IF EXISTS "branding logo upload parceiro" ON storage.objects;
CREATE POLICY "branding logo upload parceiro"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = 'parceiros'
    AND EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.partner_id::text = (storage.foldername(name))[2]
        AND pu.papel = 'gestor'
    )
  );

COMMIT;
