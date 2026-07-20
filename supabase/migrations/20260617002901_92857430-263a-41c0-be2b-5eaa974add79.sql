
-- 1. Enum: add new statuses
ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'em_analise_comercial' BEFORE 'aprovado';
ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'reprovado' AFTER 'aprovado';

-- 2. New columns on partner_orders
ALTER TABLE public.partner_orders
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS requested_delivery_date date,
  ADD COLUMN IF NOT EXISTS estimated_delivery_date date,
  ADD COLUMN IF NOT EXISTS partner_notes text,
  ADD COLUMN IF NOT EXISTS commercial_notes text,
  ADD COLUMN IF NOT EXISTS ready_for_production boolean NOT NULL DEFAULT false;

-- 3. Produto: B2B enabled flag
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS b2b_enabled boolean NOT NULL DEFAULT true;
