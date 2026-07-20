
-- Novo status "em_andamento" (visita com check-in feito)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_registro_consultor' AND e.enumlabel = 'em_andamento'
  ) THEN
    ALTER TYPE public.status_registro_consultor ADD VALUE 'em_andamento' BEFORE 'finalizado';
  END IF;
END$$;
