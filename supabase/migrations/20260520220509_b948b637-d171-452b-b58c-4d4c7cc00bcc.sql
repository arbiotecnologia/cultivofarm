ALTER TABLE public.recurring_financial_templates
  ADD COLUMN IF NOT EXISTS adjustment_type TEXT CHECK (adjustment_type IN ('PERCENTAGE', 'INDEX', 'FIXED')),
  ADD COLUMN IF NOT EXISTS adjustment_value NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS adjustment_index_name TEXT,
  ADD COLUMN IF NOT EXISTS last_adjustment_date DATE,
  ADD COLUMN IF NOT EXISTS next_adjustment_date DATE;
