ALTER TABLE public.registros_consultor_arquivos
  ADD COLUMN IF NOT EXISTS nome_arquivo text;

ALTER TABLE public.registros_consultor_arquivos
  ALTER COLUMN arquivo_url DROP NOT NULL;

UPDATE public.registros_consultor_arquivos
   SET nome_arquivo = split_part(arquivo_path, '/', -1)
 WHERE nome_arquivo IS NULL
   AND arquivo_path IS NOT NULL;