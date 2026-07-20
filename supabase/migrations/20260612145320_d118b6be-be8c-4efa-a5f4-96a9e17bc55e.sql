
-- Habilita REPLICA IDENTITY FULL para receber payload completo em UPDATE/DELETE
ALTER TABLE public.alertas_operacionais REPLICA IDENTITY FULL;
ALTER TABLE public.alertas_leituras REPLICA IDENTITY FULL;
ALTER TABLE public.alertas_acoes REPLICA IDENTITY FULL;

-- Adiciona tabelas à publicação supabase_realtime com tratamento de duplicidade
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas_operacionais;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas_leituras;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas_acoes;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
