-- Seeds Fase 1 — PROPOSTA. Todos em DRAFT e regras DISABLED.
-- Não ativa envios. Objetivo: catálogo inicial editável pelo administrador.
BEGIN;

-- Ocasião 1: produto pronto para retirada (ordens_servico.status = 'pronto_entrega')
INSERT INTO public.comunicacao_templates (chave,nome,canal,versao,status,locale,assunto,corpo,variaveis)
VALUES
('produto_pronto_retirada','Produto pronto para retirada — E-mail','email',1,'draft','pt-BR',
 'Seu pedido está pronto para retirada',
 'Olá {{nome_destinatario}}, seu pedido {{codigo_os}} está pronto para retirada em nossa unidade. Data prevista: {{data_prevista}}.',
 '["nome_destinatario","codigo_os","data_prevista"]'::jsonb),
('produto_pronto_retirada','Produto pronto para retirada — WhatsApp','whatsapp',1,'draft','pt-BR',
 NULL,
 'Olá {{nome_destinatario}}! Seu pedido {{codigo_os}} está pronto para retirada. Data prevista: {{data_prevista}}.',
 '["nome_destinatario","codigo_os","data_prevista"]'::jsonb),
('produto_pronto_retirada','Produto pronto para retirada — Portal','in_app',1,'draft','pt-BR',
 'Produto pronto para retirada',
 'O pedido {{codigo_os}} já pode ser retirado.',
 '["codigo_os"]'::jsonb)
ON CONFLICT DO NOTHING;

-- Ocasião 2: produto pronto para aplicação (ordens_servico.status = 'entregue')
INSERT INTO public.comunicacao_templates (chave,nome,canal,versao,status,locale,assunto,corpo,variaveis)
VALUES
('produto_pronto_aplicacao','Produto pronto para aplicação — E-mail','email',1,'draft','pt-BR',
 'Produto disponível para aplicação',
 'Olá {{nome_destinatario}}, o produto do pedido {{codigo_os}} está disponível na propriedade e pronto para aplicação.',
 '["nome_destinatario","codigo_os"]'::jsonb),
('produto_pronto_aplicacao','Produto pronto para aplicação — Portal','in_app',1,'draft','pt-BR',
 'Produto pronto para aplicação',
 'O produto do pedido {{codigo_os}} já está disponível para aplicação.',
 '["codigo_os"]'::jsonb)
ON CONFLICT DO NOTHING;

-- Ocasião 3: administrative_important_update — um template por canal (por perfil na regra)
INSERT INTO public.comunicacao_templates (chave,nome,canal,versao,status,locale,assunto,corpo,variaveis)
VALUES
('administrative_important_update','Atualização importante — E-mail','email',1,'draft','pt-BR',
 '{{titulo}}',
 'Prezado(a) {{nome_destinatario}},\n\n{{mensagem}}\n\nAtenciosamente,\nEquipe AR Bio.',
 '["titulo","nome_destinatario","mensagem"]'::jsonb),
('administrative_important_update','Atualização importante — Portal','in_app',1,'draft','pt-BR',
 '{{titulo}}',
 '{{mensagem}}',
 '["titulo","mensagem"]'::jsonb)
ON CONFLICT DO NOTHING;

-- Regras propostas (DISABLED) — administrative_important_update para cada app_role
INSERT INTO public.comunicacao_regras (event_key,perfil,estrategia,canal,template_chave,template_versao,enabled,prioridade)
SELECT 'administrative_important_update', r::public.app_role, 'broadcast_role', 'in_app',
       'administrative_important_update', 1, false, 100
FROM unnest(ARRAY[
  'administrador','tecnico_agronomo','producao','administrativo','gestor',
  'cliente_produtor','consultor_tecnico','aplicador','operador_onfarm',
  'financeiro','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico'
]) AS r
ON CONFLICT DO NOTHING;

-- Regras propostas (DISABLED) — pronto retirada/aplicação para cliente_produtor
INSERT INTO public.comunicacao_regras (event_key,perfil,estrategia,canal,template_chave,template_versao,enabled)
VALUES
('produto_pronto_retirada','cliente_produtor','source_participants','email','produto_pronto_retirada',1,false),
('produto_pronto_retirada','cliente_produtor','source_participants','in_app','produto_pronto_retirada',1,false),
('produto_pronto_aplicacao','cliente_produtor','source_participants','in_app','produto_pronto_aplicacao',1,false)
ON CONFLICT DO NOTHING;

COMMIT;
