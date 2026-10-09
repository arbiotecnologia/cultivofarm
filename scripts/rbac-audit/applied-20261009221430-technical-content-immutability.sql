CREATE OR REPLACE FUNCTION public.enforce_technical_content_editable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_old uuid; v_new uuid; v_id uuid; v_status text;
BEGIN
 IF TG_OP <> 'INSERT' THEN v_old := (to_jsonb(OLD)->>TG_ARGV[0])::uuid; END IF;
 IF TG_OP <> 'DELETE' THEN v_new := (to_jsonb(NEW)->>TG_ARGV[0])::uuid; END IF;
 FOR v_id IN SELECT DISTINCT x FROM unnest(ARRAY[v_old,v_new]) x WHERE x IS NOT NULL ORDER BY x LOOP
  SELECT r.status::text INTO v_status FROM public.registros_consultor r WHERE r.id=v_id FOR SHARE;
  IF NOT FOUND OR v_status NOT IN ('rascunho','em_andamento') THEN
   RAISE EXCEPTION 'technical_content_locked: reabra a visita pelo fluxo autorizado antes de alterar seu conteúdo' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.enforce_technical_content_editable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER technical_content_editable BEFORE INSERT OR UPDATE OR DELETE ON public.visitas_checkin FOR EACH ROW EXECUTE FUNCTION public.enforce_technical_content_editable('registro_consultor_id');
CREATE TRIGGER technical_content_editable BEFORE INSERT OR UPDATE OR DELETE ON public.visitas_campo FOR EACH ROW EXECUTE FUNCTION public.enforce_technical_content_editable('registro_consultor_id');
CREATE TRIGGER technical_content_editable BEFORE INSERT OR UPDATE OR DELETE ON public.visita_diagnosticos FOR EACH ROW EXECUTE FUNCTION public.enforce_technical_content_editable('registro_id');
CREATE TRIGGER technical_content_editable BEFORE INSERT OR UPDATE OR DELETE ON public.registros_consultor_recomendacoes FOR EACH ROW EXECUTE FUNCTION public.enforce_technical_content_editable('registro_consultor_id');
CREATE TRIGGER technical_content_editable BEFORE INSERT OR UPDATE OR DELETE ON public.registros_consultor_arquivos FOR EACH ROW EXECUTE FUNCTION public.enforce_technical_content_editable('registro_consultor_id');