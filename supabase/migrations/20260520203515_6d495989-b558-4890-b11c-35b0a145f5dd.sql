-- Add 'financeiro' to app_role enum (must be in its own migration before usage)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financeiro';