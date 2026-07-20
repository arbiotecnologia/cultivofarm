
CREATE OR REPLACE FUNCTION public.lote_volume_envasado(_lote_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(COALESCE(volume_por_unidade,0) * COALESCE(quantidade,0)), 0)::numeric
  FROM public.envase
  WHERE lote_id = _lote_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_validate_envase_volume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produzido numeric;
  v_envasado numeric;
  v_novo numeric;
  v_codigo text;
  v_saldo numeric;
BEGIN
  IF NEW.quantidade IS NULL OR NEW.quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade do envase deve ser maior que zero.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.volume_por_unidade IS NULL OR NEW.volume_por_unidade <= 0 THEN
    RAISE EXCEPTION 'O volume por unidade deve ser maior que zero.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT volume_produzido, codigo_lote INTO v_produzido, v_codigo
  FROM public.lotes WHERE id = NEW.lote_id;

  IF v_produzido IS NULL OR v_produzido <= 0 THEN
    RAISE EXCEPTION 'O lote % não possui volume produzido informado. Registre a produção antes de envasar.', COALESCE(v_codigo,'(desconhecido)')
      USING ERRCODE = 'check_violation';
  END IF;

  v_envasado := public.lote_volume_envasado(NEW.lote_id);
  v_novo := COALESCE(NEW.volume_por_unidade,0) * COALESCE(NEW.quantidade,0);
  v_saldo := v_produzido - v_envasado;

  IF (v_envasado + v_novo) > v_produzido THEN
    RAISE EXCEPTION 'Envase excede o volume produzido do lote %. Produzido: % L, já envasado: % L, saldo disponível: % L, solicitado: % L.',
      COALESCE(v_codigo,'(desconhecido)'),
      ROUND(v_produzido/1000.0, 2),
      ROUND(v_envasado/1000.0, 2),
      ROUND(v_saldo/1000.0, 2),
      ROUND(v_novo/1000.0, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_envase_volume ON public.envase;
CREATE TRIGGER trg_validate_envase_volume
BEFORE INSERT ON public.envase
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_envase_volume();
