ALTER TABLE public.registros_consultor_arquivos ADD COLUMN IF NOT EXISTS arquivo_path TEXT;

-- Backfill arquivo_path a partir de arquivo_url (extraindo o que vem após /consultor-arquivos/)
UPDATE public.registros_consultor_arquivos
SET arquivo_path = substring(arquivo_url from '/consultor-arquivos/(.*)')
WHERE arquivo_path IS NULL AND arquivo_url LIKE '%/consultor-arquivos/%';
