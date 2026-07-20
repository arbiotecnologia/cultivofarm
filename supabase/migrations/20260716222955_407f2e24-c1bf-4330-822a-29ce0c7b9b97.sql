-- B2 · Vínculo formal do check-in ↔ visita técnica
-- 1) Sanitiza órfãos (4 linhas conhecidas): mantém o check-in mas desliga o vínculo inválido
UPDATE public.visitas_checkin vc
   SET registro_consultor_id = NULL
 WHERE registro_consultor_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.registros_consultor rc WHERE rc.id = vc.registro_consultor_id);

-- 2) FK explícita (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'visitas_checkin_registro_consultor_id_fkey'
       AND conrelid = 'public.visitas_checkin'::regclass
  ) THEN
    ALTER TABLE public.visitas_checkin
      ADD CONSTRAINT visitas_checkin_registro_consultor_id_fkey
      FOREIGN KEY (registro_consultor_id)
      REFERENCES public.registros_consultor(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;