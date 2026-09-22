-- FASE SUPERADMIN — Migration 1/2: adicionar o valor 'superadmin' ao enum app_role.
-- Migration mínima, idempotente. O novo valor NÃO pode ser usado nesta mesma
-- transação (restrição do PostgreSQL), por isso o endurecimento (guards de RPC,
-- policies da user_roles) vem em migration separada, logo após esta.
-- Preserva integralmente os 13 valores existentes do enum (adição é sempre
-- ao final do enum; nenhuma reordenação ou remoção).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'public')
     AND NOT EXISTS (
       SELECT 1 FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname = 'app_role'
     ) THEN
    RAISE EXCEPTION 'SUPERADMIN_M1_FALHOU: tipo public.app_role inexistente';
  END IF;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

COMMIT;