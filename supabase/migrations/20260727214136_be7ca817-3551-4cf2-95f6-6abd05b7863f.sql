
UPDATE public.comunicacao_regras
   SET template_versao = 2, updated_at = now()
 WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\'
   AND canal = 'in_app'
   AND template_versao IS DISTINCT FROM 2;
