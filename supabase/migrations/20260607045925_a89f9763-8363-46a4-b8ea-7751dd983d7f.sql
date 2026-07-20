GRANT SELECT, INSERT, UPDATE, DELETE ON public.fazendas TO authenticated;
GRANT ALL ON public.fazendas TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talhoes TO authenticated;
GRANT ALL ON public.talhoes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talhao_safras TO authenticated;
GRANT ALL ON public.talhao_safras TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.culturas TO authenticated;
GRANT ALL ON public.culturas TO service_role;