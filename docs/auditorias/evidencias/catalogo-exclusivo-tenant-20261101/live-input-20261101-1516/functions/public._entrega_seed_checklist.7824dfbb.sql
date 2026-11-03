CREATE OR REPLACE FUNCTION public._entrega_seed_checklist(_entrega_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.entrega_checklist WHERE entrega_id = _entrega_id) THEN
    INSERT INTO public.entrega_checklist (entrega_id, item, obrigatorio) VALUES
      (_entrega_id, 'Conferir cliente e fazenda', true),
      (_entrega_id, 'Conferir produtos', true),
      (_entrega_id, 'Conferir lotes', true),
      (_entrega_id, 'Conferir volumes', true),
      (_entrega_id, 'Conferir validade', true),
      (_entrega_id, 'Conferir formulário impresso ou digital', true),
      (_entrega_id, 'Coletar assinatura do recebedor', true),
      (_entrega_id, 'Registrar ressalvas, se houver', false),
      (_entrega_id, 'Anexar comprovante assinado ou finalizar assinatura digital', true);
  END IF;
END $function$
