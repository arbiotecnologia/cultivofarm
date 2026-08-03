REVOKE ALL ON public.produto_conformidade_perfis FROM anon;
REVOKE ALL ON public.etiqueta_templates FROM anon;
REVOKE ALL ON public.produto_etiqueta_consultas FROM anon, authenticated;
GRANT SELECT ON public.produto_etiqueta_consultas TO authenticated;