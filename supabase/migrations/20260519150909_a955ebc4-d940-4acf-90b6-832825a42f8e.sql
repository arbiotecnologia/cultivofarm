-- 1. Nova tabela talhao_safras
CREATE TABLE public.talhao_safras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talhao_id uuid NOT NULL REFERENCES public.talhoes(id) ON DELETE CASCADE,
  cultura_id uuid NOT NULL REFERENCES public.culturas(id),
  safra text NOT NULL,
  periodo_safra text,
  data_plantio date NOT NULL,
  data_previsao_colheita date,
  data_colheita_real date,
  produtividade numeric,
  unidade_produtividade text DEFAULT 'sc/ha',
  status text NOT NULL DEFAULT 'em_andamento',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_talhao_safras_talhao_data ON public.talhao_safras (talhao_id, data_plantio DESC);
CREATE INDEX idx_talhao_safras_talhao_status ON public.talhao_safras (talhao_id, status);
CREATE UNIQUE INDEX uq_talhao_safra_em_andamento ON public.talhao_safras (talhao_id) WHERE status = 'em_andamento';

-- 2. FK ponteiro em talhoes
ALTER TABLE public.talhoes
  ADD COLUMN safra_atual_id uuid REFERENCES public.talhao_safras(id) ON DELETE SET NULL;

-- 3. RLS
ALTER TABLE public.talhao_safras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read talhao_safras"
  ON public.talhao_safras FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert talhao_safras"
  ON public.talhao_safras FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update talhao_safras"
  ON public.talhao_safras FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete talhao_safras"
  ON public.talhao_safras FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role));

-- 4. Trigger updated_at
CREATE TRIGGER update_talhao_safras_updated_at
  BEFORE UPDATE ON public.talhao_safras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Trigger de sync talhoes.safra_atual_id e talhoes.cultura_id
CREATE OR REPLACE FUNCTION public.sync_talhao_safra_atual()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_id uuid;
  v_next_cultura uuid;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'em_andamento' THEN
    UPDATE public.talhoes
      SET safra_atual_id = NEW.id,
          cultura_id = NEW.cultura_id
      WHERE id = NEW.talhao_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'em_andamento' AND NEW.status <> 'em_andamento' THEN
    SELECT id, cultura_id INTO v_next_id, v_next_cultura
      FROM public.talhao_safras
      WHERE talhao_id = NEW.talhao_id AND status = 'em_andamento' AND id <> NEW.id
      ORDER BY data_plantio DESC LIMIT 1;
    UPDATE public.talhoes
      SET safra_atual_id = v_next_id,
          cultura_id = COALESCE(v_next_cultura, cultura_id)
      WHERE id = NEW.talhao_id;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'em_andamento' THEN
    SELECT id, cultura_id INTO v_next_id, v_next_cultura
      FROM public.talhao_safras
      WHERE talhao_id = OLD.talhao_id AND status = 'em_andamento' AND id <> OLD.id
      ORDER BY data_plantio DESC LIMIT 1;
    UPDATE public.talhoes
      SET safra_atual_id = v_next_id
      WHERE id = OLD.talhao_id;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_talhao_safra_atual
  AFTER INSERT OR UPDATE OR DELETE ON public.talhao_safras
  FOR EACH ROW EXECUTE FUNCTION public.sync_talhao_safra_atual();

-- 6. Backfill: cada talhão com cultura_id ganha uma safra "em_andamento"
INSERT INTO public.talhao_safras (talhao_id, cultura_id, safra, data_plantio, status)
SELECT t.id, t.cultura_id, 'Sem safra informada', t.created_at::date, 'em_andamento'
FROM public.talhoes t
WHERE t.cultura_id IS NOT NULL AND t.ativo = true;