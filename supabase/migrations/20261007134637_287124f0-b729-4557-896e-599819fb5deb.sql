-- Canonical swzpzcwiasxmjutrmvkm. B2B-only reuse of existing fresh installments.
DO $fix$ DECLARE d text; old_block text; new_block text; BEGIN
 d:=pg_get_functiondef('public.generate_b2b_receivable_secure_impl(uuid)'::regprocedure);
 old_block:=E'    INSERT INTO public.accounts_receivable_installments(\n      organization_id, receivable_id, installment_number, due_date,\n      original_amount, interest_amount, net_amount, status\n    ) VALUES (\n      v_org, v_receivable_id, v_sch.installment_number, v_sch.due_date,\n      v_sch.amount, COALESCE(v_sch.interest_amount, 0), v_sch.amount, ''OPEN''\n    ) RETURNING id INTO v_ari_id;';
 new_block:=E'    -- b2b_f1_reuse_installments: generic title trigger already created them.\n    IF (SELECT count(*) FROM public.accounts_receivable_installments\n         WHERE receivable_id=v_receivable_id AND installment_number=v_sch.installment_number\n           AND organization_id=v_org) <> 1 THEN\n      RAISE EXCEPTION ''B2B_INSTALLMENT_CARDINALITY_INVALID'' USING ERRCODE=''23514'';\n    END IF;\n    UPDATE public.accounts_receivable_installments\n       SET due_date=v_sch.due_date, original_amount=v_sch.amount,\n           interest_amount=COALESCE(v_sch.interest_amount,0), net_amount=v_sch.amount\n     WHERE receivable_id=v_receivable_id AND installment_number=v_sch.installment_number\n       AND organization_id=v_org\n     RETURNING id INTO v_ari_id;';
 IF position('b2b_f1_reuse_installments' IN d)>0 THEN RETURN; END IF;
 IF position(old_block IN d)=0 THEN RAISE EXCEPTION 'b2b_installment_anchor_missing'; END IF;
 EXECUTE replace(d,old_block,new_block);
END $fix$;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;
-- Reversal restores only prior INSERT block, but reopens proven duplication.
