UPDATE public.registros_consultor
SET objetivo_visita = titulo_registro
WHERE objetivo_visita IS NULL AND titulo_registro IS NOT NULL;

ALTER TABLE public.registros_consultor DROP COLUMN titulo_registro;