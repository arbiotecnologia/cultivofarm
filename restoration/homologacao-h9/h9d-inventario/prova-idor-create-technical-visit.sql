\set ON_ERROR_STOP off
\set victim '11111111-0000-4000-8000-00000000d101'
\set attacker '11111111-0000-4000-8000-00000000d102'
\set cli '11111111-0000-4000-8000-00000000d103'
\set faz '11111111-0000-4000-8000-00000000d104'
\set cuuid '11111111-0000-4000-8000-00000000d105'
BEGIN;
INSERT INTO public.clientes(id,nome) VALUES (:'cli','H9DL1_FIXTURE_CLI');
INSERT INTO public.fazendas(id,cliente_id,nome) VALUES (:'faz',:'cli','H9DL1_FIXTURE_FAZ');
INSERT INTO public.registros_consultor(cliente_id,fazenda_id,client_uuid,created_by,consultor_responsavel,natureza_registro,status,data_vistoria)
VALUES (:'cli',:'faz',:'cuuid',:'victim',:'victim','visita','rascunho',CURRENT_DATE);
SELECT 'fixture_registro_id' AS k, id FROM public.registros_consultor WHERE client_uuid=:'cuuid';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'attacker', true);
SAVEPOINT s1;
\echo == T1 ATAQUE IDOR (identidade arbitraria, cliente inexistente, client_uuid alheio)
SELECT 'T1_ATTACK' AS t, * FROM public.create_technical_visit_secure(
  '11111111-0000-4000-8000-0000000000ff','11111111-0000-4000-8000-0000000000fe',NULL,NULL,NULL,
  'vistoria_inicial'::public.tipo_visita,'media'::public.urgencia_consultor,NULL,:'cuuid');
ROLLBACK TO SAVEPOINT s1;
SAVEPOINT s2;
\echo == T2 CRIACAO SEM VINCULO (cliente real, sem vinculo)
SELECT 'T2_CREATE_NOAUTH' AS t, * FROM public.create_technical_visit_secure(
  :'cli',:'faz',NULL,NULL,NULL,'vistoria_inicial'::public.tipo_visita,'media'::public.urgencia_consultor,NULL,NULL);
ROLLBACK TO SAVEPOINT s2;
RESET ROLE;
-- vinculo legitimo para o atacante->consultor legitimo
INSERT INTO public.user_clientes(user_id,cliente_id,is_active,access_level) VALUES (:'attacker',:'cli',true,'execute');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'attacker', true);
\echo == T3 CRIACAO LEGITIMA
SELECT 'T3_CREATE_OK' AS t, * FROM public.create_technical_visit_secure(
  :'cli',:'faz',NULL,NULL,NULL,'vistoria_inicial'::public.tipo_visita,'media'::public.urgencia_consultor,NULL,'11111111-0000-4000-8000-00000000d106');
\echo == T4 RETRY LEGITIMO MESMO ATOR
SELECT 'T4_RETRY' AS t, * FROM public.create_technical_visit_secure(
  :'cli',:'faz',NULL,NULL,NULL,'vistoria_inicial'::public.tipo_visita,'media'::public.urgencia_consultor,NULL,'11111111-0000-4000-8000-00000000d106');
SAVEPOINT s5;
\echo == T5 CLIENT_UUID DE OUTRO ATOR NO MESMO CLIENTE (deve falhar generico, nunca devolver id alheio)
SELECT 'T5_CROSS_ACTOR' AS t, * FROM public.create_technical_visit_secure(
  :'cli',:'faz',NULL,NULL,NULL,'vistoria_inicial'::public.tipo_visita,'media'::public.urgencia_consultor,NULL,:'cuuid');
ROLLBACK TO SAVEPOINT s5;
RESET ROLE;
ROLLBACK;
