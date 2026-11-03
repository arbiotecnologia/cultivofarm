CREATE OR REPLACE FUNCTION public.proximo_codigo(_prefixo text, _tabela text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max INT;
  v_seed INT;
  v_next INT;
BEGIN
  IF _prefixo IS NULL OR _prefixo = '' THEN
    RAISE EXCEPTION 'prefixo obrigatório';
  END IF;

  INSERT INTO public.codigo_sequencias(prefixo, proximo_numero)
  VALUES (_prefixo, 1)
  ON CONFLICT (prefixo) DO NOTHING;

  -- adquire row lock no contador
  UPDATE public.codigo_sequencias
    SET proximo_numero = proximo_numero
    WHERE prefixo = _prefixo
    RETURNING proximo_numero INTO v_seed;

  -- garante alinhamento com o MAX(N) atual da tabela alvo
  IF _tabela = 'produtos' THEN
    SELECT COALESCE(MAX((regexp_match(codigo, '^' || _prefixo || '-(\d+)$'))[1]::int), 0) + 1
      INTO v_max FROM public.produtos;
  ELSIF _tabela = 'microrganismos' THEN
    SELECT COALESCE(MAX((regexp_match(codigo, '^' || _prefixo || '-(\d+)$'))[1]::int), 0) + 1
      INTO v_max FROM public.microrganismos;
  ELSE
    RAISE EXCEPTION 'tabela inválida: %', _tabela;
  END IF;

  v_next := GREATEST(v_seed, v_max);

  UPDATE public.codigo_sequencias
    SET proximo_numero = v_next + 1,
        updated_at = now()
    WHERE prefixo = _prefixo;

  RETURN _prefixo || '-' || v_next;
END;
$function$
