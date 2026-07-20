
-- Add new roles to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cliente_produtor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultor_tecnico';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'aplicador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operador_onfarm';

-- Expand profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf_cnpj text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Allow admins to read all profiles (needed for user management)
CREATE POLICY "Admins can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role));

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role));
