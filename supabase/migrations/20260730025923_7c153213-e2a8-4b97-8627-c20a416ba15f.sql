DO $p10$
DECLARE
  v_run uuid; v_partner uuid; v_partner_user uuid; v_n int; v_tot int; v_err text;
BEGIN
  SELECT run_id INTO v_run FROM public._motor_b2b_fase7_proofs ORDER BY created_at DESC LIMIT 1;
  SELECT pa.id INTO v_partner FROM public.partner_accounts pa WHERE pa.ativo LIMIT 1;
  SELECT pu.user_id INTO v_partner_user FROM public.partner_users pu WHERE pu.partner_id=v_partner LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_partner_user,'role','authenticated')::text, true);

  DELETE FROM public._motor_b2b_fase7_proofs WHERE proof='P10-CATALOGO-PRECIFICADO';
  BEGIN
    SELECT count(*) FILTER (WHERE c.preco_parceiro IS NOT NULL AND c.preco_parceiro > 0), count(*)
      INTO v_n, v_tot
      FROM public.get_partner_catalog_secure(v_partner) c;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P10-CATALOGO-PRECIFICADO', CASE WHEN v_tot > 0 AND v_n = v_tot THEN 'PASS' ELSE 'FAIL' END,
       jsonb_build_object('itens_total',v_tot,'itens_com_preco_parceiro',v_n));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO public._motor_b2b_fase7_proofs(run_id,proof,result,details) VALUES
      (v_run,'P10-CATALOGO-PRECIFICADO','FAIL',jsonb_build_object('error',v_err));
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $p10$;