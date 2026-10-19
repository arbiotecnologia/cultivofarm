CREATE OR REPLACE FUNCTION public.rpc_entrega_registrar_pdf_termo_v1(p_termo_id uuid, p_pdf_path text, p_pdf_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_t public.entrega_termos%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;
  IF v_t.status <> 'assinado' THEN RAISE EXCEPTION 'termo_nao_assinado'; END IF;
  IF coalesce(trim(p_pdf_path),'') = '' OR coalesce(trim(p_pdf_hash),'') = '' THEN
    RAISE EXCEPTION 'pdf_path_e_hash_obrigatorios';
  END IF;

  IF v_t.pdf_path IS NOT NULL THEN
    IF v_t.pdf_path = p_pdf_path AND v_t.pdf_hash = p_pdf_hash THEN
      RETURN jsonb_build_object('success', true, 'replay', true, 'pdf_path', v_t.pdf_path);
    END IF;
    RAISE EXCEPTION 'pdf_ja_registrado';
  END IF;

  UPDATE public.entrega_termos
     SET pdf_path = p_pdf_path, pdf_hash = p_pdf_hash, pdf_gerado_em = now()
   WHERE id = p_termo_id;

  RETURN jsonb_build_object('success', true, 'replay', false, 'pdf_path', p_pdf_path);
END $function$
