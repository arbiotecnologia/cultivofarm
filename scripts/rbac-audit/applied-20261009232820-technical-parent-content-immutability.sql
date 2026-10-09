CREATE OR REPLACE FUNCTION public.enforce_visit_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Technical content is frozen for every nature and actor after submission.
  -- Official RPCs may change status; version, timestamp and PDF processing are metadata.
  IF OLD.status::text NOT IN ('rascunho', 'em_andamento') AND
    (to_jsonb(NEW) - ARRAY['status','version','updated_at','pdf_status']::text[])
      IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status','version','updated_at','pdf_status']::text[])
  THEN
    RAISE EXCEPTION 'technical_record_content_locked'
      USING ERRCODE = '23514',
      HINT = 'Use the authorized adjustment workflow before editing technical content.';
  END IF;
  NEW.version := COALESCE(OLD.version, 1) + 1;
  RETURN NEW;
END;
$function$;