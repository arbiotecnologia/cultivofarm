-- Seeds da Fase 2 (opcionais; somente staging). Conforme schema Fase 1 v3:
--   comunicacao_templates: colunas obrigatórias chave, nome, canal, versao, status,
--                          locale='pt-BR', corpo. UNIQUE(chave, canal, versao).
--   comunicacao_regras   : estrategia ∈ {by_role, source_participants, broadcast_role}.
-- Todos os templates ficam em status='draft' e todas as regras ficam enabled=false.
BEGIN;

-- Template WhatsApp (rascunho — metadados WA já preenchidos para permitir ativação
-- futura). Como está draft, CHECKs condicionais NÃO exigem provider_template_status.
INSERT INTO public.comunicacao_templates (
  chave, nome, canal, versao, status, locale, assunto, corpo, variaveis,
  provider_template_name, language_code, parameter_mapping, provider_template_status
) VALUES (
  'produto_pronto_retirada_wa',
  'Produto pronto para retirada (WhatsApp)',
  'whatsapp', 1, 'draft', 'pt-BR',
  NULL,
  'Olá {{nome_destinatario}}, seu pedido {{codigo_os}} está pronto para retirada.',
  '["nome_destinatario","codigo_os"]'::jsonb,
  'produto_pronto_retirada_v1', 'pt_BR',
  '[
    {"index":1,"variavel":"nome_destinatario","tipo":"text"},
    {"index":2,"variavel":"codigo_os","tipo":"text"}
  ]'::jsonb,
  'pending'
) ON CONFLICT (chave, canal, versao) DO NOTHING;

-- Template e-mail (rascunho)
INSERT INTO public.comunicacao_templates (
  chave, nome, canal, versao, status, locale, assunto, corpo, variaveis
) VALUES (
  'produto_pronto_retirada_email',
  'Produto pronto para retirada (E-mail)',
  'email', 1, 'draft', 'pt-BR',
  'Seu pedido {{codigo_os}} está pronto para retirada',
  E'Olá {{nome_destinatario}},\n\nSeu pedido {{codigo_os}} já está disponível para retirada.\n\nAR Bio.',
  '["nome_destinatario","codigo_os"]'::jsonb
) ON CONFLICT (chave, canal, versao) DO NOTHING;

-- Template in_app (rascunho)
INSERT INTO public.comunicacao_templates (
  chave, nome, canal, versao, status, locale, assunto, corpo, variaveis
) VALUES (
  'produto_pronto_retirada_inapp',
  'Produto pronto para retirada (Portal)',
  'in_app', 1, 'draft', 'pt-BR',
  'Pedido pronto para retirada',
  'Seu pedido {{codigo_os}} já está disponível.',
  '["codigo_os"]'::jsonb
) ON CONFLICT (chave, canal, versao) DO NOTHING;

-- Regras (todas DESLIGADAS por padrão). Estratégia válida do enum Fase 1.
INSERT INTO public.comunicacao_regras
  (event_key, canal, estrategia, template_chave, template_versao, prioridade, enabled, perfil)
VALUES
  ('produto_pronto_retirada','whatsapp','source_participants','produto_pronto_retirada_wa',1,10,false,NULL),
  ('produto_pronto_retirada','email',   'source_participants','produto_pronto_retirada_email',1,20,false,NULL),
  ('produto_pronto_retirada','in_app',  'source_participants','produto_pronto_retirada_inapp',1,30,false,NULL)
ON CONFLICT DO NOTHING;

COMMIT;
