ALTER TABLE public.audit_senha_log DROP CONSTRAINT audit_senha_log_executor_id_fkey;
ALTER TABLE public.audit_senha_log DROP CONSTRAINT audit_senha_log_target_user_id_fkey;

ALTER TABLE public.audit_senha_log 
  ADD CONSTRAINT audit_senha_log_executor_id_fkey 
  FOREIGN KEY (executor_id) REFERENCES public.profiles(user_id);

ALTER TABLE public.audit_senha_log 
  ADD CONSTRAINT audit_senha_log_target_user_id_fkey 
  FOREIGN KEY (target_user_id) REFERENCES public.profiles(user_id);
