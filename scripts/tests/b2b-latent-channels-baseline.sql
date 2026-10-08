SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.get_b2b_user_clients_secure(NULL,NULL);
 EXCEPTION WHEN SQLSTATE '42804' THEN RAISE NOTICE 'PASS baseline enum text mismatch reproduced'; RETURN; END;
 RAISE EXCEPTION 'FAIL baseline expected 42804'; END $$;
INSERT INTO storage.objects(bucket_id,name) VALUES('logos','parceiros/11111111-1111-4111-8111-111111111111/baseline.png');
SELECT pg_temp.assert_true('baseline residual internal link logo upload allowed',(SELECT count(*) FROM storage.objects)=1);
SELECT public.rpc_message_set_status('b3333333-3333-4333-8333-333333333333','lida');
RESET ROLE;
SELECT pg_temp.assert_true('baseline admin cross tenant message write reproduced locally',(SELECT status='lida' FROM public.partner_order_messages WHERE id='b3333333-3333-4333-8333-333333333333'));
UPDATE public.partner_order_messages SET status='nao_lida',status_updated_at=NULL;
DELETE FROM storage.objects;