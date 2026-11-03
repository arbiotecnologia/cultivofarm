CREATE OR REPLACE FUNCTION public.set_codigo_microrganismo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefixo TEXT;
BEGIN
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
    v_prefixo := public.prefixo_para_microrganismo(NEW.tipo::text);
    IF v_prefixo IS NULL THEN
      RAISE EXCEPTION 'Tipo de microrganismo sem prefixo definido: %', NEW.tipo;
    END IF;
    NEW.codigo := public.proximo_codigo(v_prefixo, 'microrganismos');
  ELSE
    NEW.codigo := btrim(NEW.codigo);
  END IF;
  RETURN NEW;
END;
$function$
