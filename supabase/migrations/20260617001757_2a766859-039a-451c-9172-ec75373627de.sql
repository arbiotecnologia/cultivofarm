
-- 1. Add new status values to enum (cannot drop in same tx)
ALTER TYPE partner_order_status ADD VALUE IF NOT EXISTS 'rascunho' BEFORE 'pendente';
ALTER TYPE partner_order_status ADD VALUE IF NOT EXISTS 'solicitado' AFTER 'pendente';
ALTER TYPE partner_order_status ADD VALUE IF NOT EXISTS 'aprovado' AFTER 'solicitado';
ALTER TYPE partner_order_status ADD VALUE IF NOT EXISTS 'em_producao' AFTER 'aprovado';
ALTER TYPE partner_order_status ADD VALUE IF NOT EXISTS 'produzido' AFTER 'em_producao';
ALTER TYPE partner_order_status ADD VALUE IF NOT EXISTS 'aguardando_entrega' AFTER 'produzido';
ALTER TYPE partner_order_status ADD VALUE IF NOT EXISTS 'faturado' AFTER 'entregue';
