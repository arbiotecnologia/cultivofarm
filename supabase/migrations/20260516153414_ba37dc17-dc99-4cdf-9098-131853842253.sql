CREATE TABLE public.audit_senha_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  executor_id UUID REFERENCES auth.users(id),
  target_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_senha_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view the logs
CREATE POLICY "Admins can view password audit logs" 
ON public.audit_senha_log 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'administrador'
  )
);

-- Service role will handle insertions
