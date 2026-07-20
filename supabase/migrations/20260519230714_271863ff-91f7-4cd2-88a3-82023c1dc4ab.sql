-- Ensure RLS is enabled
ALTER TABLE public.audit_senha_log ENABLE ROW LEVEL SECURITY;

-- The existing SELECT policy already restricts to 'administrador'
-- We keep it as is since it was already found in the previous check

-- Add explicit INSERT policy: ONLY service_role (system/triggers) can insert. 
-- Regular users (even admins) shouldn't insert audit records manually.
CREATE POLICY "System can insert audit logs" 
ON public.audit_senha_log 
FOR INSERT 
TO service_role 
WITH CHECK (true);

-- Explicitly deny UPDATE and DELETE for everyone to ensure audit integrity
CREATE POLICY "Audit logs cannot be updated" 
ON public.audit_senha_log 
FOR UPDATE 
USING (false);

CREATE POLICY "Audit logs cannot be deleted" 
ON public.audit_senha_log 
FOR DELETE 
USING (false);