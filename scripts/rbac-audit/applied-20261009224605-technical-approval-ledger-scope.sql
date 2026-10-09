CREATE POLICY technical_approval_read_scope ON public.aprovacoes_tecnicas AS RESTRICTIVE FOR SELECT TO authenticated USING (public.technical_child_read_scope(registro_consultor_id));
CREATE POLICY technical_approval_rpc_insert_only ON public.aprovacoes_tecnicas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY technical_approval_rpc_update_only ON public.aprovacoes_tecnicas AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY technical_approval_rpc_delete_only ON public.aprovacoes_tecnicas AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
