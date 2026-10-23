CREATE OR REPLACE FUNCTION public.tg_pfs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.updated_at=GREATEST(clock_timestamp(),OLD.updated_at+interval '1 microsecond'); RETURN NEW; END $function$

