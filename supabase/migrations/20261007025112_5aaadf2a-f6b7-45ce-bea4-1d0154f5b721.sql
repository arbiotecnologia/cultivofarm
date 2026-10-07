DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('platform_private.set_org_principal_admin_core(uuid,uuid,text,uuid,uuid)'::regprocedure);
  IF position('Alteração de responsável principal' in d) = 0 THEN
    d := replace(d,
      $a$  v_motivo := btrim(coalesce(_motivo,''));
$a$,
      $b$  v_motivo := btrim(coalesce(_motivo,''));
  IF v_motivo = '' THEN v_motivo := 'Alteração de responsável principal'; END IF;
$b$);
    IF position('Alteração de responsável principal' in d) = 0 THEN RAISE EXCEPTION 'patch não aplicado'; END IF;
    EXECUTE d;
  END IF;
END $m$;
-- Rollback: remover a linha "IF v_motivo = '' THEN ..." de set_org_principal_admin_core.