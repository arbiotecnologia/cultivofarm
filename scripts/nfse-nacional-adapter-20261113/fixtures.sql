-- Fixtures sintéticas compartilhadas (gatilhos desativados só na preparação).
-- Fixtures inseridas com gatilhos desativados (apenas a preparação); o caminho
-- testado roda depois com gatilhos ativos (session_replication_role=origin).
set local session_replication_role = replica;
-- fixtures sintéticas
insert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000000a1','qa-a@example.invalid'),('00000000-0000-4000-8000-0000000000b1','qa-b@example.invalid'),('00000000-0000-4000-8000-0000000000a2','qa-gestor@example.invalid');
insert into public.organizations(id,nome,ativo,status) values ('00000000-0000-4000-8000-00000000000a','QA ORG A',true,'ativa'),('00000000-0000-4000-8000-00000000000b','QA ORG B',true,'ativa');
insert into public.profiles(user_id,organization_id,ativo) values ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-00000000000a',true),('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-00000000000b',true),('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-00000000000a',true);
insert into public.user_roles(user_id,role) values ('00000000-0000-4000-8000-0000000000a1','administrador'),('00000000-0000-4000-8000-0000000000b1','administrador'),('00000000-0000-4000-8000-0000000000a2','gestor');
insert into public.company_fiscal_settings(id,organization_id,is_active,state,fiscal_environment,municipality_ibge_code,cnpj,legal_name)
  values ('00000000-0000-4000-8000-0000000c0a01','00000000-0000-4000-8000-00000000000a',true,'MG','HOMOLOGATION','3147006','11222333000181','QA PRESTADORA A'),
         ('00000000-0000-4000-8000-0000000c0b01','00000000-0000-4000-8000-00000000000b',true,'SP','HOMOLOGATION','3550308','44555666000181','QA PRESTADORA B');
insert into public.clientes(id,codigo_cliente,nome,organization_id) values
  ('00000000-0000-4000-8000-00000000c1a1','QA-C-A1','QA Tomador A1','00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-00000000c1a2','QA-C-A2','QA Tomador A2','00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-00000000c1b1','QA-C-B1','QA Tomador B1','00000000-0000-4000-8000-00000000000b');
insert into public.catalog_services(id,organization_id,name,unit,is_active) values
  ('00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000000a','QA Consultoria','H',true),
  ('00000000-0000-4000-8000-0000000005a2','00000000-0000-4000-8000-00000000000a','QA Sem perfil','UN',true),
  ('00000000-0000-4000-8000-0000000005b1','00000000-0000-4000-8000-00000000000b','QA Serv B','UN',true);
insert into public.service_fiscal_profiles(organization_id,service_id,source_reference,service_name,is_active,lc116_item,national_taxation_code,incidence_municipality_ibge_code,iss_rate,iss_withheld_default)
  values ('00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','qa-consultoria','QA Consultoria',true,'17.01','170101','3147006',2.5,false),
         ('00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000005b1','qa-serv-b','QA Serv B',true,'17.01','170101','3550308',3,false);
insert into public.service_engagements(id,organization_id,service_id,customer_id,performed_on,quantity,unit_price,status) values
  ('00000000-0000-4000-8000-0000000e0a01','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000c1a1','2026-11-10',2,150,'READY'),
  ('00000000-0000-4000-8000-0000000e0a02','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000c1a1','2026-11-11',1.5,100,'READY'),
  ('00000000-0000-4000-8000-0000000e0a03','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000c1a2','2026-11-11',1,90,'READY'),
  ('00000000-0000-4000-8000-0000000e0a04','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a2','00000000-0000-4000-8000-00000000c1a1','2026-11-12',1,50,'READY'),
  ('00000000-0000-4000-8000-0000000e0b01','00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000005b1','00000000-0000-4000-8000-00000000c1b1','2026-11-12',1,80,'READY');
