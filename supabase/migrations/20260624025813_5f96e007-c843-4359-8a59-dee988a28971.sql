
CREATE OR REPLACE FUNCTION public.prefixo_para_produto(_tipo TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(_tipo,''))
    WHEN 'solo' THEN 'SOLO'
    WHEN 'inseticida' THEN 'INS'
    WHEN 'fungicida' THEN 'FUNG'
    WHEN 'inoculante' THEN 'INO'
    WHEN 'solubilizador' THEN 'SOLB'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.prefixo_para_microrganismo(_tipo TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(_tipo,''))
    WHEN 'bacteria' THEN 'BAC'
    WHEN 'fungo' THEN 'FUN'
    WHEN 'levedura' THEN 'LEV'
    WHEN 'consorcio' THEN 'CON'
    ELSE NULL
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.proximo_codigo(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_codigo_produto() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_codigo_microrganismo() FROM PUBLIC, anon;
