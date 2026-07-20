
-- Policies para bucket order-attachments
DROP POLICY IF EXISTS "order_attach_admin_all" ON storage.objects;
CREATE POLICY "order_attach_admin_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'order-attachments' AND (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial')))
  WITH CHECK (bucket_id = 'order-attachments' AND (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial')));

DROP POLICY IF EXISTS "order_attach_partner_select" ON storage.objects;
CREATE POLICY "order_attach_partner_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'order-attachments' AND has_role(auth.uid(),'parceiro_b2b')
    AND (storage.foldername(name))[1] IN (
      SELECT po.id::text FROM public.partner_orders po WHERE po.partner_id = get_user_partner_id()
    ));

DROP POLICY IF EXISTS "order_attach_partner_insert" ON storage.objects;
CREATE POLICY "order_attach_partner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-attachments' AND has_role(auth.uid(),'parceiro_b2b')
    AND (storage.foldername(name))[1] IN (
      SELECT po.id::text FROM public.partner_orders po WHERE po.partner_id = get_user_partner_id()
    ));
