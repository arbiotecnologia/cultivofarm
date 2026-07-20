ALTER TABLE public.entregas
  ADD CONSTRAINT entregas_lote_id_fkey
  FOREIGN KEY (lote_id) REFERENCES public.lotes(id) ON DELETE SET NULL;