-- Seeds da Fase 2 (opcionais; somente staging).
-- Rascunhos de templates: nenhum ativa envio (regras enabled=false).
BEGIN;

-- Template WhatsApp com metadados Meta (rascunho)
INSERT INTO public.comunicacao_templates (
  chave, versao, canal, locale, assunto, corpo, variaveis, ativo,
  provider_template_name, language_code, parameter_mapping
) VALUES (
  'produto_pronto_retirada_wa', 1, 'whatsapp', 'pt_BR',
  NULL,
  'Olá {{nome_destinatario}}, seu pedido {{codigo_os}} está pronto para retirada.',
  '["nome_destinatario","codigo_os"]'::jsonb,
  false,
  'produto_pronto_retirada_v1', 'pt_BR',
  '[
    {"index":1,"variavel":"nome_destinatario","tipo":"text"},
    {"index":2,"variavel":"codigo_os","tipo":"text"}
  ]'::jsonb
) ON CONFLICT (chave, versao) DO NOTHING;

-- Template e-mail (rascunho, com assunto obrigatório)
INSERT INTO public.comunicacao_templates (
  chave, versao, canal, locale, assunto, corpo, variaveis, ativo
) VALUES (
  'produto_pronto_retirada_email', 1, 'email', 'pt_BR',
  'Seu pedido {{codigo_os}} está pronto para retirada',
  'Olá {{nome_destinatario}},\n\nSeu pedido {{codigo_os}} já está disponível para retirada.\n\nAR Bio.',
  '["nome_destinatario","codigo_os"]'::jsonb,
  false
) ON CONFLICT (chave, versao) DO NOTHING;

-- Template in_app (rascunho)
INSERT INTO public.comunicacao_templates (
  chave, versao, canal, locale, assunto, corpo, variaveis, ativo
) VALUES (
  'produto_pronto_retirada_inapp', 1, 'in_app', 'pt_BR',
  'Pedido pronto para retirada',
  'Seu pedido {{codigo_os}} já está disponível.',
  '["codigo_os"]'::jsonb,
  false
) ON CONFLICT (chave, versao) DO NOTHING;

-- Regras (todas DESLIGADAS por padrão)
INSERT INTO public.comunicacao_regras
  (event_key, canal, estrategia, template_chave, template_versao, prioridade, enabled, perfil)
VALUES
  ('produto_pronto_retirada','whatsapp','fixed','produto_pronto_retirada_wa',1,10,false,NULL),
  ('produto_pronto_retirada','email','fixed','produto_pronto_retirada_email',1,20,false,NULL),
  ('produto_pronto_retirada','in_app','fixed','produto_pronto_retirada_inapp',1,30,false,NULL)
ON CONFLICT DO NOTHING;

COMMIT;
