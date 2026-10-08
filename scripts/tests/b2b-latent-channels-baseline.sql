SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.get_b2b_user_clients_secure(NULL,NULL);
 EXCEPTION WHEN SQLSTATE '42804' THEN RAISE NOTICE 'PASS baseline enum text mismatch reproduced'; RETURN; END;
 RAISE EXCEPTION 'FAIL baseline expected 42804'; END $$;
INSERT INTO storage.objects(bucket_id,name) VALUES('logos','parceiros/11111111-1111-4111-8111-111111111111/baseline.png');
SELECT pg_temp.assert_true('baseline residual internal link logo upload allowed',(SELECT count(*) FROM storage.objects)=1);
RESET ROLE;
DELETE FROM storage.objects;