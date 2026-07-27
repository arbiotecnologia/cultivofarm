-- Subfase 1C — Reexecução real do seed (idempotência)
-- Executar SOMENTE em staging ikaauvsflpmamgxmkhoq dentro de sentinel rollback.
-- Reproduz a lógica dos blocos DO $seed$ / DO $rules$ da migration
-- 20260727210659_f75ea9d9-d440-494e-b309-4dc793eec37b.sql sem reaplicar
-- migration histórica pelo framework.
BEGIN;

-- Baseline
SELECT count(*) AS templates_before FROM public.comunicacao_templates WHERE chave LIKE 'solic\_%' ESCAPE '\';
SELECT count(*) AS regras_before FROM public.comunicacao_regras WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\';

-- Bloco 1: templates (idêntico ao seed original)
DO $seed$
DECLARE
  r RECORD;
  v_vars jsonb := '["nome_destinatario","numero","tipo_demanda","urgencia","status_novo","solicitacao_id"]'::jsonb;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('solic_produtor_criada','in_app','active',NULL,'Sua solicitação {{numero}} foi registrada ({{tipo_demanda}}, urgência {{urgencia}}). Acompanhe pelo portal.'),
      ('solic_produtor_atribuida','in_app','active',NULL,'Sua solicitação {{numero}} foi atribuída a um consultor. Status: {{status_novo}}.'),
      ('solic_produtor_checkin','in_app','active',NULL,'O consultor realizou check-in para atender sua solicitação {{numero}}.'),
      ('solic_produtor_em_visita','in_app','active',NULL,'O atendimento da sua solicitação {{numero}} está em andamento.'),
      ('solic_produtor_aguardando_os','in_app','active',NULL,'Sua solicitação {{numero}} está aguardando geração de ordem de serviço.'),
      ('solic_produtor_concluida','in_app','active',NULL,'Sua solicitação {{numero}} foi concluída.'),
      ('solic_produtor_cancelada','in_app','active',NULL,'Sua solicitação {{numero}} foi cancelada.'),
      ('solic_consultor_atribuida','in_app','active',NULL,'Solicitação {{numero}} atribuída a você ({{tipo_demanda}}, urgência {{urgencia}}).'),
      ('solic_consultor_cancelada','in_app','active',NULL,'Solicitação {{numero}} atribuída a você foi cancelada.'),
      ('solic_admin_criada','in_app','active',NULL,'Nova solicitação {{numero}} registrada ({{tipo_demanda}}, urgência {{urgencia}}).'),
      ('solic_admin_urgencia_critica','in_app','active',NULL,'Solicitação {{numero}} está em URGÊNCIA CRÍTICA. Ação imediata.'),
      ('solic_produtor_criada','email','draft','Solicitação {{numero}} registrada','Olá {{nome_destinatario}}, sua solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) foi registrada.'),
      ('solic_produtor_atribuida','email','draft','Solicitação {{numero}} atribuída','Olá {{nome_destinatario}}, sua solicitação {{numero}} foi atribuída. Status: {{status_novo}}.'),
      ('solic_produtor_checkin','email','draft','Consultor a caminho — {{numero}}','Olá {{nome_destinatario}}, o consultor realizou check-in para atender sua solicitação {{numero}}.'),
      ('solic_produtor_em_visita','email','draft','Atendimento em andamento — {{numero}}','Olá {{nome_destinatario}}, o atendimento da solicitação {{numero}} está em andamento.'),
      ('solic_produtor_aguardando_os','email','draft','Aguardando ordem de serviço — {{numero}}','Olá {{nome_destinatario}}, sua solicitação {{numero}} está aguardando geração de OS.'),
      ('solic_produtor_concluida','email','draft','Solicitação {{numero}} concluída','Olá {{nome_destinatario}}, sua solicitação {{numero}} foi concluída.'),
      ('solic_produtor_cancelada','email','draft','Solicitação {{numero}} cancelada','Olá {{nome_destinatario}}, sua solicitação {{numero}} foi cancelada.'),
      ('solic_consultor_atribuida','email','draft','Nova atribuição — {{numero}}','Olá {{nome_destinatario}}, a solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) foi atribuída a você.'),
      ('solic_consultor_cancelada','email','draft','Atribuição cancelada — {{numero}}','Olá {{nome_destinatario}}, a solicitação {{numero}} atribuída a você foi cancelada.'),
      ('solic_admin_criada','email','draft','Nova solicitação — {{numero}}','Nova solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) registrada.'),
      ('solic_admin_urgencia_critica','email','draft','URGÊNCIA CRÍTICA — {{numero}}','Solicitação {{numero}} em urgência crítica. Ação imediata.'),
      ('solic_produtor_atribuida','whatsapp','draft',NULL,'AR Bio: sua solicitação {{numero}} foi atribuída a um consultor.'),
      ('solic_produtor_checkin','whatsapp','draft',NULL,'AR Bio: consultor a caminho para atender sua solicitação {{numero}}.'),
      ('solic_produtor_concluida','whatsapp','draft',NULL,'AR Bio: sua solicitação {{numero}} foi concluída.'),
      ('solic_produtor_cancelada','whatsapp','draft',NULL,'AR Bio: sua solicitação {{numero}} foi cancelada.')
    ) AS t(chave, canal, status, assunto, corpo)
  LOOP
    INSERT INTO public.comunicacao_templates(chave, canal, versao, status, locale, nome, assunto, corpo, variaveis)
    VALUES (r.chave, r.canal::public.comunicacao_canal, 1, r.status::public.comunicacao_template_status,
            'pt-BR', r.chave || ' (' || r.canal || ')', r.assunto, r.corpo, v_vars)
    ON CONFLICT (chave, canal, versao) DO NOTHING;
  END LOOP;
END $seed$;

-- Bloco 2: regras (idêntico ao seed original — todas enabled=false via NOT EXISTS)
DO $rules$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('solicitacao_criada',              'in_app','source_cliente',      NULL::text,      'solic_produtor_criada',         100),
      ('solicitacao_atribuida',           'in_app','source_cliente',      NULL,            'solic_produtor_atribuida',      100),
      ('solicitacao_checkin_realizado',   'in_app','source_cliente',      NULL,            'solic_produtor_checkin',        100),
      ('solicitacao_em_visita',           'in_app','source_cliente',      NULL,            'solic_produtor_em_visita',      100),
      ('solicitacao_aguardando_os',       'in_app','source_cliente',      NULL,            'solic_produtor_aguardando_os',  100),
      ('solicitacao_concluida',           'in_app','source_cliente',      NULL,            'solic_produtor_concluida',      100),
      ('solicitacao_cancelada',           'in_app','source_cliente',      NULL,            'solic_produtor_cancelada',      100),
      ('solicitacao_atribuida',           'in_app','assigned_consultant', NULL,            'solic_consultor_atribuida',     110),
      ('solicitacao_cancelada',           'in_app','assigned_consultant', NULL,            'solic_consultor_cancelada',     110),
      ('solicitacao_criada',              'in_app','by_role',             'administrador', 'solic_admin_criada',            120),
      ('solicitacao_urgencia_critica',    'in_app','by_role',             'administrador', 'solic_admin_urgencia_critica',  120)
    ) AS t(event_key, canal, estrategia, perfil, template_chave, prioridade)
  LOOP
    IF r.perfil IS NULL THEN
      INSERT INTO public.comunicacao_regras(event_key, canal, estrategia, perfil, template_chave, template_versao, condicoes, prioridade, enabled, cooldown_seconds)
      SELECT r.event_key, r.canal::public.comunicacao_canal, r.estrategia, NULL, r.template_chave, 1, '{}'::jsonb, r.prioridade, false, 0
      WHERE NOT EXISTS (
        SELECT 1 FROM public.comunicacao_regras g
         WHERE g.event_key=r.event_key AND g.canal=r.canal::public.comunicacao_canal
           AND g.estrategia=r.estrategia AND g.template_chave=r.template_chave AND g.perfil IS NULL);
    ELSE
      INSERT INTO public.comunicacao_regras(event_key, canal, estrategia, perfil, template_chave, template_versao, condicoes, prioridade, enabled, cooldown_seconds)
      SELECT r.event_key, r.canal::public.comunicacao_canal, r.estrategia, r.perfil::public.app_role, r.template_chave, 1, '{}'::jsonb, r.prioridade, false, 0
      WHERE NOT EXISTS (
        SELECT 1 FROM public.comunicacao_regras g
         WHERE g.event_key=r.event_key AND g.canal=r.canal::public.comunicacao_canal
           AND g.estrategia=r.estrategia AND g.template_chave=r.template_chave AND g.perfil=r.perfil::public.app_role);
    END IF;
  END LOOP;
END $rules$;

-- Assertivas pós-reexecução
SELECT count(*) AS templates_after FROM public.comunicacao_templates WHERE chave LIKE 'solic\_%' ESCAPE '\';
SELECT count(*) AS regras_after FROM public.comunicacao_regras WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\';
SELECT count(*) AS regras_enabled FROM public.comunicacao_regras WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\' AND enabled=true;
SELECT count(*) AS versoes_novas FROM public.comunicacao_templates WHERE chave LIKE 'solic\_%' ESCAPE '\' AND versao > 1;
SELECT chave, canal, count(*) AS dup FROM public.comunicacao_templates WHERE chave LIKE 'solic\_%' ESCAPE '\'
  GROUP BY chave, canal HAVING count(*) > 1;
SELECT event_key, canal, estrategia, coalesce(perfil::text,'∅') AS perfil, template_chave, count(*) AS dup
  FROM public.comunicacao_regras WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\'
  GROUP BY 1,2,3,4,5 HAVING count(*) > 1;

ROLLBACK;
