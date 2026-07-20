CREATE OR REPLACE FUNCTION public._avancar_os_status(p_origem text, p_os_id uuid, p_alvo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    status_order TEXT[] := ARRAY['aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega','entregue','finalizada'];
    v_atual TEXT;
    v_idx_atual INT;
    v_idx_alvo INT;
    v_proximo TEXT;
BEGIN
    IF p_origem = 'manual' THEN
        SELECT status::text INTO v_atual FROM public.ordens_servico WHERE id = p_os_id;
    ELSE
        SELECT status::text INTO v_atual FROM public.ordens_servico_onfarm WHERE id = p_os_id;
    END IF;

    SELECT i INTO v_idx_atual FROM unnest(status_order) WITH ORDINALITY AS t(val,i) WHERE val = v_atual;
    SELECT i INTO v_idx_alvo FROM unnest(status_order) WITH ORDINALITY AS t(val,i) WHERE val = p_alvo;

    IF v_idx_atual IS NULL OR v_idx_alvo IS NULL THEN
        RAISE EXCEPTION 'Status OS inválido (% -> %).', v_atual, p_alvo;
    END IF;

    WHILE v_idx_atual < v_idx_alvo LOOP
        v_proximo := status_order[v_idx_atual + 1];
        IF p_origem = 'manual' THEN
            UPDATE public.ordens_servico SET status = v_proximo::public.status_os WHERE id = p_os_id;
        ELSE
            UPDATE public.ordens_servico_onfarm SET status = v_proximo::public.status_os_onfarm WHERE id = p_os_id;
        END IF;
        v_idx_atual := v_idx_atual + 1;
    END LOOP;
END;
$function$;