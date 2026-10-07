DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.platform_begin_org_admin_email_change(uuid,uuid,text,text,uuid)'::regprocedure);
  IF position('Alteração de e-mail administrativo' in d) = 0 THEN
    d := replace(d,
      $a$IF char_length(v_reason) < 2 THEN RAISE EXCEPTION 'platform_invalid: motivo' USING ERRCODE='22023'; END IF;$a$,
      $b$IF v_reason = '' THEN v_reason := 'Alteração de e-mail administrativo'; END IF;
  IF char_length(v_reason) < 2 THEN RAISE EXCEPTION 'platform_invalid: motivo' USING ERRCODE='22023'; END IF;$b$);
    IF position('Alteração de e-mail administrativo' in d) = 0 THEN RAISE EXCEPTION 'patch não aplicado'; END IF;
    EXECUTE d;
  END IF;
END $m$;
-- Rollback: remover a linha "IF v_reason = '' THEN ..." da função (motivo volta a ser obrigatório).