CREATE OR REPLACE FUNCTION public._refresh_esteira_laboratorio_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.refresh_esteira_laboratorio();
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public._refresh_esteira_laboratorio_after_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._refresh_esteira_laboratorio_after_change() TO service_role;

DROP TRIGGER IF EXISTS trg_refresh_esteira_ordens_servico ON public.ordens_servico;
CREATE TRIGGER trg_refresh_esteira_ordens_servico
AFTER INSERT OR UPDATE OR DELETE ON public.ordens_servico
FOR EACH STATEMENT EXECUTE FUNCTION public._refresh_esteira_laboratorio_after_change();

DROP TRIGGER IF EXISTS trg_refresh_esteira_ordens_servico_onfarm ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_refresh_esteira_ordens_servico_onfarm
AFTER INSERT OR UPDATE OR DELETE ON public.ordens_servico_onfarm
FOR EACH STATEMENT EXECUTE FUNCTION public._refresh_esteira_laboratorio_after_change();

DROP TRIGGER IF EXISTS trg_refresh_esteira_programacao ON public.programacao_producao;
CREATE TRIGGER trg_refresh_esteira_programacao
AFTER INSERT OR UPDATE OR DELETE ON public.programacao_producao
FOR EACH STATEMENT EXECUTE FUNCTION public._refresh_esteira_laboratorio_after_change();

DROP TRIGGER IF EXISTS trg_refresh_esteira_lotes ON public.lotes;
CREATE TRIGGER trg_refresh_esteira_lotes
AFTER INSERT OR UPDATE OR DELETE ON public.lotes
FOR EACH STATEMENT EXECUTE FUNCTION public._refresh_esteira_laboratorio_after_change();

DROP TRIGGER IF EXISTS trg_refresh_esteira_cq ON public.controle_qualidade;
CREATE TRIGGER trg_refresh_esteira_cq
AFTER INSERT OR UPDATE OR DELETE ON public.controle_qualidade
FOR EACH STATEMENT EXECUTE FUNCTION public._refresh_esteira_laboratorio_after_change();

DROP TRIGGER IF EXISTS trg_refresh_esteira_envase ON public.envase;
CREATE TRIGGER trg_refresh_esteira_envase
AFTER INSERT OR UPDATE OR DELETE ON public.envase
FOR EACH STATEMENT EXECUTE FUNCTION public._refresh_esteira_laboratorio_after_change();

DROP TRIGGER IF EXISTS trg_refresh_esteira_estoque ON public.estoque_produto;
CREATE TRIGGER trg_refresh_esteira_estoque
AFTER INSERT OR UPDATE OR DELETE ON public.estoque_produto
FOR EACH STATEMENT EXECUTE FUNCTION public._refresh_esteira_laboratorio_after_change();

DROP TRIGGER IF EXISTS trg_refresh_esteira_entregas ON public.entregas;
CREATE TRIGGER trg_refresh_esteira_entregas
AFTER INSERT OR UPDATE OR DELETE ON public.entregas
FOR EACH STATEMENT EXECUTE FUNCTION public._refresh_esteira_laboratorio_after_change();

SELECT public.refresh_esteira_laboratorio();