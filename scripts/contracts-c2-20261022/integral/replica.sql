SET check_function_bodies=off; SET client_min_messages=warning;
DO $$BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE supabase_auth_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE dashboard_user NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE authenticator NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE supabase_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
ALTER ROLE service_role BYPASSRLS;
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS cf_user_guards_v1;
CREATE SCHEMA IF NOT EXISTS finance_private;
CREATE SCHEMA IF NOT EXISTS platform_private;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'email'$$;
GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid(),auth.role(),auth.email() TO anon,authenticated,service_role;
CREATE TYPE public.access_level_tecnico AS ENUM ('read','execute','manage');
CREATE TYPE public.app_role AS ENUM ('administrador','tecnico_agronomo','producao','administrativo','gestor','cliente_produtor','consultor_tecnico','aplicador','operador_onfarm','financeiro','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin');
CREATE TYPE public.categoria_arquivo_consultor AS ENUM ('praga','doenca','planta_daninha','nematoide','solo','aplicacao','geral','laudo','documento_cliente','recomendacao_anexa','checkin','vistoria','retorno');
CREATE TYPE public.categoria_problema_consultor AS ENUM ('insetos_praga','doencas_fungicas','doencas_bacterianas','nematoides','plantas_daninhas','desequilibrio_biologico_solo','baixa_vitalidade','falha_estande','fitotoxidade','outro');
CREATE TYPE public.cliente_doc_tipo AS ENUM ('contrato_social','procuracao','car_mapa','outro','cnh','cartao_cnpj','inscricao_produtor','rg','comprovante_endereco');
CREATE TYPE public.cliente_status AS ENUM ('prospect','ativo','inativo','bloqueado_financeiro');
CREATE TYPE public.cliente_tipo_pessoa AS ENUM ('fisica','juridica');
CREATE TYPE public.comunicacao_canal AS ENUM ('email','whatsapp','in_app','push');
CREATE TYPE public.comunicacao_evento_status AS ENUM ('received','processed','skipped');
CREATE TYPE public.comunicacao_outbox_status AS ENUM ('pending','processing','sent','failed','cancelled','skipped','dead_letter');
CREATE TYPE public.comunicacao_template_status AS ENUM ('draft','active','archived');
CREATE TYPE public.estrategia_manejo AS ENUM ('biologico','manejo_integrado','monitoramento','correcao_operacional','ajuste_aplicacao','ajuste_janela','outro');
CREATE TYPE public.faturamento_base_status AS ENUM ('PENDENTE','LIBERADO_FATURAMENTO','FATURADO_PARCIAL','FATURADO_TOTAL','CANCELADO');
CREATE TYPE public.modo_aplicacao_consultor AS ENUM ('foliar','aplicacao_no_colo_da_planta','via_solo','tratamento_semente','sulco_plantio','jato_dirigido','outro');
CREATE TYPE public.natureza_registro_consultor AS ENUM ('ocorrencia','visita');
CREATE TYPE public.necessidade_intervencao AS ENUM ('monitorar','intervir_ate_7_dias','intervir_ate_3_dias','intervir_imediatamente');
CREATE TYPE public.nivel_pressao AS ENUM ('baixo','medio','alto','severo');
CREATE TYPE public.nivel_risco AS ENUM ('baixo','medio','alto','critico');
CREATE TYPE public.nivel_severidade AS ENUM ('baixo','medio','alto');
CREATE TYPE public.objetivo_recomendacao AS ENUM ('preventivo','corretivo','reducao_pressao','tratamento_solo','reequilibrio_biologico','suporte_fisiologico','manejo_integrado');
CREATE TYPE public.order_message_author AS ENUM ('parceiro','comercial','admin');
CREATE TYPE public.partner_contact_setor AS ENUM ('comercial','financeiro','operacional','tecnico','administrativo','outro');
CREATE TYPE public.partner_order_priority AS ENUM ('normal','urgente','programado');
CREATE TYPE public.partner_order_status AS ENUM ('rascunho','pendente','solicitado','em_analise_comercial','aprovado','reprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado','cancelado','aguardando_aprovacao_credito','aguardando_ajuste_comercial','aguardando_itens','reprovado_sem_itens','aguardando_cotacao');
CREATE TYPE public.partner_porte AS ENUM ('pequeno','medio','grande');
CREATE TYPE public.partner_regime_tributario AS ENUM ('simples','lucro_presumido','lucro_real','mei','isento');
CREATE TYPE public.partner_segmento AS ENUM ('cooperativa','revenda_agro','consultoria','industria','produtor_direto','outro');
CREATE TYPE public.partner_type_enum AS ENUM ('distribuidor','revenda','cooperativa','produtor_parceiro','canal_estrategico','representante');
CREATE TYPE public.ponto_area_consultor AS ENUM ('entrada_talhao','bordadura','centro_area','reboleira','outro');
CREATE TYPE public.prioridade_os AS ENUM ('baixa','media','alta');
CREATE TYPE public.production_planning_status AS ENUM ('aguardando_planejamento','planejado','em_producao','produzido','entregue','cancelado','replanejar');
CREATE TYPE public.recomendacao_comentario_autor_tipo AS ENUM ('produtor','tecnico','gestor','admin');
CREATE TYPE public.resultado_cq AS ENUM ('aprovado','reprovado');
CREATE TYPE public.risco_produtivo AS ENUM ('baixo','medio','alto','critico');
CREATE TYPE public.status_alerta AS ENUM ('ativo','monitoramento','encerrado');
CREATE TYPE public.status_aprovacao AS ENUM ('pendente','aprovado','reprovado','solicitar_ajuste','ajuste_solicitado','reaberto');
CREATE TYPE public.status_atribuicao AS ENUM ('atribuida','aceita','recusada','concluida');
CREATE TYPE public.status_checkin AS ENUM ('realizado','inconsistente','validado');
CREATE TYPE public.status_diagnostico AS ENUM ('novo','em_analise','diagnostico_concluido');
CREATE TYPE public.status_entrega AS ENUM ('separado','em_rota','entregue','cancelada');
CREATE TYPE public.status_estoque AS ENUM ('disponivel','reservado','expedido','estornado');
CREATE TYPE public.status_lote AS ENUM ('em_producao','aguardando_cq','aprovado','reprovado');
CREATE TYPE public.status_os AS ENUM ('aberta','aprovada','programada','em_producao','em_cq','envase','aguardando_reserva','pronto_entrega','entregue','finalizada');
CREATE TYPE public.status_os_onfarm AS ENUM ('aberta','aprovada','programada','em_producao','em_cq','envase','aguardando_reserva','pronto_entrega','entregue','finalizada','cancelada');
CREATE TYPE public.status_programacao AS ENUM ('aguardando','em_producao','aguardando_cq','aprovado');
CREATE TYPE public.status_registro_consultor AS ENUM ('rascunho','em_andamento','finalizado','enviado_aprovacao','aprovado','convertido_os','arquivado','reprovado');
CREATE TYPE public.tipo_alerta AS ENUM ('praga','doenca','daninha','nematoide','estresse_hidrico');
CREATE TYPE public.tipo_arquivo_consultor AS ENUM ('foto','audio','pdf');
CREATE TYPE public.tipo_checkin AS ENUM ('chegada_fazenda','chegada_talhao','inicio_visita','checkout');
CREATE TYPE public.tipo_demanda_consultor AS ENUM ('praga','doenca','planta_daninha','nematoide','solo','nutricao_biologica','manejo_preventivo','manejo_corretivo','outro');
CREATE TYPE public.tipo_embalagem AS ENUM ('frasco_1L','bombona_5L','bombona_20L');
CREATE TYPE public.tipo_microrganismo AS ENUM ('bacteria','fungo','levedura','consorcio');
CREATE TYPE public.tipo_notificacao_portal AS ENUM ('informativo','alerta','entrega','recomendacao','aplicacao','sistema');
CREATE TYPE public.tipo_problema AS ENUM ('praga','doenca','solo','nutricao','nematoide');
CREATE TYPE public.tipo_produto AS ENUM ('inseticida','fungicida','solo','inoculante','solubilizador');
CREATE TYPE public.tipo_visita AS ENUM ('vistoria_inicial','retorno','monitoramento','pos_aplicacao','emergencia','acompanhamento_programado');
CREATE TYPE public.urgencia_consultor AS ENUM ('baixa','media','alta','critica');
CREATE TYPE public.saas_subscription_status AS ENUM ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED');
CREATE SEQUENCE public.partner_orders_numero_seq;
CREATE TABLE public.entregas ("id" uuid NOT NULL, "ordem_servico_id" uuid, "cliente_id" uuid, "data_saida" date, "motorista" text, "veiculo" text, "status" status_entrega NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "estoque_produto_id" uuid, "lote_id" uuid, "produto_id" uuid, "quantidade_entregue" numeric, "volume_entregue_ml" numeric, "cancelada_por" uuid, "cancelada_em" timestamp with time zone, "motivo_cancelamento" text, "receivable_id" uuid, "confirmada_em" timestamp with time zone, "confirmada_por" uuid, "recebido_por_nome" text, "entregue_em" timestamp with time zone, "recebido_por_cargo" text, "recebido_por_documento" text, "observacoes_confirmacao" text, "confirmado_por" uuid, "comprovante_entrega_obrigatorio" boolean NOT NULL, "financial_status" text, "billing_generated_at" timestamp with time zone, "billing_generated_by" uuid, "not_billable_reason" text, "ordem_servico_onfarm_id" uuid, "os_faturamento_base_id" uuid, "comprovante_status" text NOT NULL, "comprovante_id" uuid, "recebedor_nome" text, "recebedor_documento" text, "recebedor_cargo" text, "recebedor_telefone" text, "assinatura_obrigatoria" boolean NOT NULL, "assinatura_tipo" text, "formulario_gerado_em" timestamp with time zone, "formulario_gerado_por" uuid, "comprovante_anexado_em" timestamp with time zone, "comprovante_anexado_por" uuid, "assinatura_digital_capturada_em" timestamp with time zone, "assinatura_digital_capturada_por" uuid, "recebimento_confirmado_em" timestamp with time zone, "recebimento_confirmado_por" uuid, "validation_token" uuid, "validation_hash" text, "separacao_status" text NOT NULL, "separacao_confirmada_em" timestamp with time zone, "separacao_confirmada_por" uuid, "partner_order_id" uuid, "grupo_entrega_id" uuid, "motorista_telefone" text, "motorista_documento" text, "veiculo_placa" text, "veiculo_tipo" text, "hora_saida_prevista" time without time zone, "data_chegada_prevista" date, "hora_chegada_prevista" time without time zone, "destinatario_nome" text, "destinatario_telefone" text, "destinatario_whatsapp" text, "endereco_origem" text, "endereco_logradouro" text, "endereco_numero" text, "endereco_complemento" text, "endereco_bairro" text, "endereco_cidade" text, "endereco_uf" text, "endereco_cep" text, "endereco_referencia" text, "tipo_entrega" text NOT NULL, "reentrega_origem_id" uuid, "organization_id" uuid, PRIMARY KEY (id));
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.microrganismos ("id" uuid NOT NULL, "nome" text NOT NULL, "tipo" tipo_microrganismo NOT NULL, "created_at" timestamp with time zone NOT NULL, "nome_cientifico" text, "concentracao_ufc_ml" numeric, "concentracao_label" text, "dose_ml_ha" numeric, "valor_dose_brl" numeric(10,2), "fornecedor" text, "safra_referencia" text, "producao_on_farm" boolean, "meio_cultivo" text, "funcao_agronomica" text, "observacoes" text, "ativo" boolean NOT NULL, "b2b_enabled" boolean NOT NULL, "codigo" text, "descricao" text, "preco_tabela" numeric(12,2), "valor_litro_brl" numeric, "product_id" uuid, "updated_at" timestamp with time zone NOT NULL, PRIMARY KEY (id));
ALTER TABLE public.microrganismos ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.ordens_servico ("id" uuid NOT NULL, "cliente_id" uuid, "fazenda_id" uuid, "talhao_id" uuid, "produto_id" uuid, "volume_total_ml" numeric, "area_hectares" numeric, "data_programada" date, "prioridade" prioridade_os NOT NULL, "status" status_os NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "microrganismo_id" uuid, "tipo_item" text NOT NULL, "modo_aplicacao" text, "numero_os" text NOT NULL, "partner_order_id" uuid, "partner_order_item_id" uuid, "origem" text NOT NULL, "organization_id" uuid, PRIMARY KEY (id));
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.produtos ("id" uuid NOT NULL, "nome" text NOT NULL, "tipo" tipo_produto NOT NULL, "dose_ml_ha" numeric, "descricao" text, "modo_acao" text, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "codigo" text, "funcao_completa" text, "modo_aplicacao" text, "valor_ha_brl" numeric(10,2), "versao_catalogo" text, "ativo" boolean, "e_insumo" boolean, "estoque_minimo" numeric, "b2b_enabled" boolean NOT NULL, "valor_dose_brl" numeric, "valor_litro_brl" numeric, "familia_catalogo" text, "classe_catalogo" text, PRIMARY KEY (id));
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bank_accounts ("id" uuid NOT NULL, "name" text NOT NULL, "bank_name" text, "agency" text, "account_number" text, "pix_key" text, "opening_balance" numeric(14,2) NOT NULL, "active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, PRIMARY KEY (id));
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.commercial_price_rules ("id" uuid NOT NULL, "buyer_scope" text NOT NULL, "partner_id" uuid, "customer_id" uuid, "plan_id" uuid, "product_id" uuid, "microrganismo_id" uuid, "unit_type" text NOT NULL, "volume_ml" numeric(12,2), "pricing_mode" text NOT NULL, "condition_price" numeric(14,4), "currency" text NOT NULL, "valid_from" date NOT NULL, "valid_until" date, "active" boolean NOT NULL, "motivo" text, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "created_by" uuid, "updated_by" uuid, "discount_percent" numeric(9,4), "min_quantity" numeric(14,3) NOT NULL, PRIMARY KEY (id));
ALTER TABLE public.commercial_price_rules ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.financial_cost_centers ("id" uuid NOT NULL, "name" text NOT NULL, "code" text, "description" text, "active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, PRIMARY KEY (id));
ALTER TABLE public.financial_cost_centers ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.financial_documents ("id" uuid NOT NULL, "owner_type" text NOT NULL, "owner_id" uuid NOT NULL, "document_type" text NOT NULL, "file_name" text NOT NULL, "storage_path" text NOT NULL, "mime_type" text, "file_size" bigint, "uploaded_by" uuid NOT NULL, "uploaded_at" timestamp with time zone NOT NULL, "deleted_at" timestamp with time zone, "deleted_by" uuid, "delete_reason" text, "fiscal_invoice_id" uuid, "document_origin" text, "fiscal_event_id" uuid, "file_category" text, "environment" text, "version_number" integer, "organization_id" uuid, PRIMARY KEY (id));
ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.financial_receipts ("id" uuid NOT NULL, "receipt_number" text NOT NULL, "receipt_year" integer NOT NULL, "receipt_seq" integer NOT NULL, "payment_id" uuid NOT NULL, "customer_id" uuid, "amount" numeric(14,2) NOT NULL, "payment_date" date NOT NULL, "payment_method_id" uuid, "description" text, "status" text NOT NULL, "cancel_reason" text, "canceled_by" uuid, "canceled_at" timestamp with time zone, "storage_bucket" text, "storage_path" text, "authenticity_code" text NOT NULL, "public_verification_token" uuid NOT NULL, "qr_code_enabled" boolean NOT NULL, "issued_by" uuid NOT NULL, "issued_at" timestamp with time zone NOT NULL, "receivable_id" uuid, "receivable_payment_id" uuid, "organization_id" uuid, PRIMARY KEY (id));
ALTER TABLE public.financial_receipts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.financial_report_exports ("id" uuid NOT NULL, "report_type" text NOT NULL, "format" text NOT NULL, "filters" jsonb NOT NULL, "storage_bucket" text, "storage_path" text, "status" text NOT NULL, "error_message" text, "row_count" integer, "generated_by" uuid NOT NULL, "generated_at" timestamp with time zone NOT NULL, "report_title" text NOT NULL, "file_format" text NOT NULL, "organization_id" uuid, PRIMARY KEY (id));
ALTER TABLE public.financial_report_exports ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.fiscal_invoices ("id" uuid NOT NULL, "receivable_id" uuid, "delivery_id" uuid, "invoice_type" text NOT NULL, "invoice_number" text, "series" text, "access_key" text, "issue_date" date, "total_amount" numeric(14,2), "status" text NOT NULL, "xml_document_id" uuid, "danfe_document_id" uuid, "notes" text, "created_by" uuid NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "document_model" text, "document_origin" text, "environment" text, "provider" text, "provider_reference" text, "idempotency_key" text, "normalized_status" text, "provider_status_raw" text, "source_type" text, "source_id" uuid, "parent_invoice_id" uuid, "substitution_invoice_id" uuid, "authorized_at" timestamp with time zone, "rejected_at" timestamp with time zone, "canceled_at" timestamp with time zone, "cancel_reason" text, "reconciliation_status" text, "company_snapshot" jsonb, "customer_snapshot" jsonb, "fiscal_totals_snapshot" jsonb, "payload_schema_version" integer, "locked_at" timestamp with time zone, "locked_by" uuid, "company_cnpj" text, "draft_version" integer NOT NULL, "homologation_validation_status" text NOT NULL, "homologation_validation_at" timestamp with time zone, "homologation_validation_summary" jsonb NOT NULL, "customer_id" uuid, "fiscal_profile_snapshot" jsonb NOT NULL, "tax_snapshot" jsonb NOT NULL, "direction" text, "fiscal_operation_type" text, "fin_nfe" smallint, "tp_nf_debito" smallint, "tp_nf_credito" smallint, "nature_operation" text, "tax_authority_notes" text, "legal_basis" text, "legal_version" text, "legal_effective_date" date, "icms_due" boolean, "icms_amount" numeric(18,2), "original_recipient_snapshot" jsonb, "partner_order_id" uuid, "sales_channel" text, "debtor_type" text, "debtor_partner_id" uuid, "debtor_customer_id" uuid, "billing_scope" text, "tp_emis" smallint NOT NULL, "company_settings_id" uuid NOT NULL, "organization_id" uuid, PRIMARY KEY (id));
ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.fiscal_official_sources ("id" uuid NOT NULL, "source_key" text NOT NULL, "authority" text NOT NULL, "name" text NOT NULL, "url" text NOT NULL, "doc_version" text, "consulted_at" date, "notes" text, "is_active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "created_by" uuid, "updated_at" timestamp with time zone NOT NULL, PRIMARY KEY (id));
ALTER TABLE public.fiscal_official_sources ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.partner_simulations ("id" uuid NOT NULL, "partner_id" uuid NOT NULL, "created_by" uuid NOT NULL, "titulo" text, "observacoes" text, "total_cheio" numeric NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "status" text NOT NULL, "cultura" text, "area_total_ha" numeric, "objetivo_tecnico" text, "converted_order_id" uuid, "converted_by" uuid, "converted_at" timestamp with time zone, "cliente_id" uuid, "cliente_nome_snapshot" text, "propriedade_nome_snapshot" text, "cliente_cidade_snapshot" text, "cliente_uf_snapshot" text, "valid_until" date, PRIMARY KEY (id));
ALTER TABLE public.partner_simulations ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.payable_payments ("id" uuid NOT NULL, "installment_id" uuid NOT NULL, "payment_date" date NOT NULL, "amount_paid" numeric(14,2) NOT NULL, "payment_method_id" uuid NOT NULL, "bank_account_id" uuid, "discount_amount" numeric(14,2) NOT NULL, "interest_amount" numeric(14,2) NOT NULL, "penalty_amount" numeric(14,2) NOT NULL, "notes" text, "created_by" uuid NOT NULL, "created_at" timestamp with time zone NOT NULL, "is_reversal" boolean NOT NULL, "reversed_payment_id" uuid, "reversal_reason" text, "idempotency_key" text, "request_fingerprint" text, "organization_id" uuid, PRIMARY KEY (id));
ALTER TABLE public.payable_payments ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.recurring_financial_templates ("id" uuid NOT NULL, "type" text NOT NULL, "name" text NOT NULL, "customer_id" uuid, "supplier_id" uuid, "supplier_name" text, "category_id" uuid NOT NULL, "cost_center_id" uuid, "amount" numeric(14,2) NOT NULL, "installment_count" integer NOT NULL, "recurrence_frequency" text NOT NULL, "due_day" integer, "start_date" date NOT NULL, "end_date" date, "next_generation_date" date NOT NULL, "active" boolean NOT NULL, "auto_generate" boolean NOT NULL, "payment_method_id" uuid, "bank_account_id" uuid, "notes" text, "created_by" uuid NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "description" text NOT NULL, "paused_at" timestamp with time zone, "fiscal_invoice_required" boolean, "adjustment_type" text, "adjustment_value" numeric(10,4), "adjustment_index_name" text, "last_adjustment_date" date, "next_adjustment_date" date, "organization_id" uuid, PRIMARY KEY (id));
ALTER TABLE public.recurring_financial_templates ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.saas_plans ("id" uuid NOT NULL, "key" text NOT NULL, "name" text NOT NULL, "description" text, "active" boolean NOT NULL, "is_default" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, PRIMARY KEY (id));
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
CREATE TABLE auth.users ("instance_id" uuid, "id" uuid NOT NULL, "aud" character varying(255), "role" character varying(255), "email" character varying(255), "encrypted_password" character varying(255), "email_confirmed_at" timestamp with time zone, "invited_at" timestamp with time zone, "confirmation_token" character varying(255), "confirmation_sent_at" timestamp with time zone, "recovery_token" character varying(255), "recovery_sent_at" timestamp with time zone, "email_change_token_new" character varying(255), "email_change" character varying(255), "email_change_sent_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "raw_app_meta_data" jsonb, "raw_user_meta_data" jsonb, "is_super_admin" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "phone" text, "phone_confirmed_at" timestamp with time zone, "phone_change" text, "phone_change_token" character varying(255), "phone_change_sent_at" timestamp with time zone, "confirmed_at" timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED, "email_change_token_current" character varying(255), "email_change_confirm_status" smallint, "banned_until" timestamp with time zone, "reauthentication_token" character varying(255), "reauthentication_sent_at" timestamp with time zone, "is_sso_user" boolean NOT NULL, "deleted_at" timestamp with time zone, "is_anonymous" boolean NOT NULL);
CREATE TABLE accounts_payable ("id" uuid NOT NULL, "supplier_id" uuid, "supplier_name" text, "description" text NOT NULL, "category_id" uuid NOT NULL, "cost_center_id" uuid, "total_amount" numeric(14,2) NOT NULL, "issue_date" date NOT NULL, "first_due_date" date NOT NULL, "installment_count" integer NOT NULL, "status" text NOT NULL, "origin_type" text NOT NULL, "origin_id" uuid, "fiscal_document_number" text, "notes" text, "created_by" uuid NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "supplier_invoice_date" date, "recurring_template_id" uuid, "reference_month" date, "auto_generated" boolean NOT NULL, "organization_id" uuid);
CREATE TABLE accounts_payable_installments ("id" uuid NOT NULL, "payable_id" uuid NOT NULL, "installment_number" integer NOT NULL, "due_date" date NOT NULL, "original_amount" numeric(14,2) NOT NULL, "paid_amount" numeric(14,2) NOT NULL, "discount_amount" numeric(14,2) NOT NULL, "interest_amount" numeric(14,2) NOT NULL, "penalty_amount" numeric(14,2) NOT NULL, "net_amount" numeric(14,2) NOT NULL, "status" text NOT NULL, "paid_at" timestamp with time zone, "created_at" timestamp with time zone NOT NULL, "organization_id" uuid);
CREATE TABLE accounts_receivable ("id" uuid NOT NULL, "origin_type" text NOT NULL, "origin_id" uuid, "customer_id" uuid, "description" text NOT NULL, "category_id" uuid NOT NULL, "cost_center_id" uuid, "total_amount" numeric(14,2) NOT NULL, "issue_date" date NOT NULL, "first_due_date" date NOT NULL, "installment_count" integer NOT NULL, "status" text NOT NULL, "fiscal_invoice_required" boolean NOT NULL, "fiscal_invoice_status" text NOT NULL, "notes" text, "created_by" uuid NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "payment_method_id" uuid, "fiscal_invoice_number" text, "fiscal_access_key" text, "fiscal_issue_date" date, "recurring_template_id" uuid, "reference_month" date, "auto_generated" boolean NOT NULL, "partner_id" uuid, "external_payment_id" text, "payment_gateway" text, "pix_qr_code" text, "pix_copia_cola" text, "boleto_url" text, "fiscal_requirement_source" text, "fiscal_policy_id" uuid, "fiscal_exemption_id" uuid, "organization_id" uuid);
CREATE TABLE accounts_receivable_installments ("id" uuid NOT NULL, "receivable_id" uuid NOT NULL, "installment_number" integer NOT NULL, "due_date" date NOT NULL, "original_amount" numeric(14,2) NOT NULL, "received_amount" numeric(14,2) NOT NULL, "discount_amount" numeric(14,2) NOT NULL, "interest_amount" numeric(14,2) NOT NULL, "penalty_amount" numeric(14,2) NOT NULL, "net_amount" numeric(14,2) NOT NULL, "status" text NOT NULL, "paid_at" timestamp with time zone, "created_at" timestamp with time zone NOT NULL, "organization_id" uuid);
CREATE TABLE cf_user_guards_v1.state ("singleton" boolean NOT NULL, "revision" bigint NOT NULL);
CREATE TABLE clientes ("id" uuid NOT NULL, "nome" text NOT NULL, "cpf_cnpj" text, "telefone" text, "email" text, "observacoes" text, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "tipo_pessoa" cliente_tipo_pessoa, "razao_social" text, "nome_fantasia" text, "inscricao_estadual" text, "inscricao_municipal" text, "site" text, "segmento" text, "endereco_cep" text, "endereco_logradouro" text, "endereco_numero" text, "endereco_complemento" text, "endereco_bairro" text, "endereco_municipio" text, "endereco_estado" text, "endereco_latitude" numeric, "endereco_longitude" numeric, "cobranca_mesmo_endereco" boolean, "cobranca_cep" text, "cobranca_logradouro" text, "cobranca_numero" text, "cobranca_complemento" text, "cobranca_bairro" text, "cobranca_municipio" text, "cobranca_estado" text, "contato_financeiro_nome" text, "contato_financeiro_email" text, "contato_financeiro_telefone" text, "status_cliente" cliente_status, "tags" text[], "limite_credito" numeric, "condicao_pagamento" text, "banco_nome" text, "banco_agencia" text, "banco_conta" text, "banco_tipo_conta" text, "banco_pix_chave" text, "banco_pix_tipo" text, "telefones" text[], "codigo_cliente" text NOT NULL, "marca_nome" text, "marca_logo_url" text, "marca_cor_primaria" text, "organization_id" uuid);
CREATE TABLE clientes_audit_log ("id" uuid NOT NULL, "cliente_id" uuid, "action" text NOT NULL, "changed_by" uuid, "changed_at" timestamp with time zone, "old_data" jsonb, "new_data" jsonb, "diff" jsonb);
CREATE TABLE commercial_audit_log ("id" uuid NOT NULL, "usuario_id" uuid, "partner_id" uuid, "order_id" uuid, "acao" text NOT NULL, "dados_anteriores" jsonb, "dados_novos" jsonb, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE commercial_payment_plans ("id" uuid NOT NULL, "name" text NOT NULL, "code" text NOT NULL, "description" text, "plan_type" text NOT NULL, "max_days" integer NOT NULL, "months_count" numeric(6,2) NOT NULL, "installment_count" integer NOT NULL, "discount_percent" numeric(6,3) NOT NULL, "monthly_interest_percent" numeric(6,3) NOT NULL, "interest_type" text NOT NULL, "requires_credit_approval" boolean NOT NULL, "requires_guarantee" boolean NOT NULL, "requires_financial_approval" boolean NOT NULL, "minimum_order_amount" numeric(14,2), "active" boolean NOT NULL, "sort_order" integer NOT NULL, "created_by" uuid, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "pricing_mode" text NOT NULL, "version" integer NOT NULL, "root_plan_id" uuid, "superseded_by_id" uuid, "valid_from" timestamp with time zone NOT NULL, "valid_until" timestamp with time zone, "is_default" boolean NOT NULL, "version_reason" text, "updated_by" uuid);
CREATE TABLE company_fiscal_settings ("id" uuid NOT NULL, "is_active" boolean NOT NULL, "legal_name" text, "trade_name" text, "cnpj" text, "state_registration" text, "municipal_registration" text, "tax_regime" text, "crt" text, "primary_cnae" text, "additional_cnaes" text[], "fiscal_email" text, "phone" text, "postal_code" text, "street" text, "number" text, "complement" text, "neighborhood" text, "city" text, "municipality_ibge_code" text, "state" text, "country_code" text, "nfe_series" text, "nfse_series" text, "fiscal_provider" text NOT NULL, "fiscal_environment" text NOT NULL, "nfe_enabled" boolean NOT NULL, "nfse_enabled" boolean NOT NULL, "production_enabled" boolean NOT NULL, "configuration_status" text NOT NULL, "accounting_validated_at" timestamp with time zone, "accounting_validated_by" uuid, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "created_by" uuid, "updated_by" uuid, "nfe_configuration" jsonb NOT NULL, "nfse_configuration" jsonb NOT NULL, "nfe_provider" text NOT NULL, "nfse_provider" text NOT NULL, "nfe_credential_ref" text, "nfse_credential_ref" text, "certificate_ref" text, "webhook_ref" text, "configuration_notes" text, "configuration_version" integer NOT NULL, "last_validation_at" timestamp with time zone, "last_validation_status" text NOT NULL, "last_validation_summary" jsonb NOT NULL, "rtc_configuration" jsonb NOT NULL, "nfe_series_number" integer, "nfe_environment_code" text, "uf_accreditations" jsonb NOT NULL, "pis_cofins_regime" text, "ipi_taxpayer" boolean NOT NULL, "icms_st_responsible" boolean NOT NULL, "fcp_applicable" boolean NOT NULL, "difal_responsible" boolean NOT NULL, "rtc_scaffolding_enabled" boolean NOT NULL, "nfe_readiness_status" text NOT NULL, "nfe_readiness_checked_at" timestamp with time zone, "nfe_readiness_pendencies" jsonb NOT NULL, "sefaz_homologation_at" timestamp with time zone, "sefaz_homologation_evidence" jsonb, "organization_id" uuid NOT NULL);
CREATE TABLE fazendas ("id" uuid NOT NULL, "cliente_id" uuid NOT NULL, "nome" text NOT NULL, "municipio" text, "estado" text, "area_total" numeric, "latitude" numeric, "longitude" numeric, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "codigo_referencia" text, "consultor_responsavel_id" uuid, "area_produtiva" numeric, "tipo_exploracao" text, "inscricao_estadual_produtor" text, "car" text, "nirf" text, "endereco_acesso" text, "ponto_referencia" text, "distancia_sede_km" numeric, "responsavel_local_nome" text, "responsavel_local_telefone" text, "ativo" boolean NOT NULL, "organization_id" uuid);
CREATE TABLE financial_audit_log ("id" uuid NOT NULL, "entity_type" text NOT NULL, "entity_id" uuid NOT NULL, "action" text NOT NULL, "old_data" jsonb, "new_data" jsonb, "performed_by" uuid, "performed_at" timestamp with time zone NOT NULL, "reason" text);
CREATE TABLE financial_categories ("id" uuid NOT NULL, "name" text NOT NULL, "type" text NOT NULL, "parent_id" uuid, "active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "dre_group" text);
CREATE TABLE financial_governance_audit_log ("id" uuid NOT NULL, "usuario_id" uuid, "partner_id" uuid, "acao" text NOT NULL, "dados_anteriores" jsonb, "dados_novos" jsonb, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE financial_settings ("id" boolean NOT NULL, "require_receipt_on_receivable_payment" boolean NOT NULL, "require_receipt_on_payable_payment" boolean NOT NULL, "updated_at" timestamp with time zone NOT NULL, "updated_by" uuid);
CREATE TABLE fiscal_operation_policies ("id" uuid NOT NULL, "sales_channel" text NOT NULL, "operation_type" text NOT NULL, "uf" text, "requires_invoice" boolean NOT NULL, "document_model" text, "legal_basis" text, "notes" text, "active" boolean NOT NULL, "valid_from" date NOT NULL, "valid_until" date, "created_by" uuid, "updated_by" uuid, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "direction" text, "fin_nfe" smallint, "nature_operation" text, "presence_indicator" smallint, "final_consumer" boolean, "taxpayer_indicator" text, "origin_uf" text, "destination_uf" text, "cfop" text, "crt" text, "ncm_prefix" text, "product_category" text, "priority" integer NOT NULL, "source_id" uuid, "legal_version" text, "policy_status" text NOT NULL, "published_at" timestamp with time zone, "published_by" uuid, "prepared_by" uuid);
CREATE TABLE fiscal_requirement_exemptions ("id" uuid NOT NULL, "scope_type" text NOT NULL, "scope_id" uuid NOT NULL, "motivo" text NOT NULL, "legal_basis" text, "approved_by" uuid NOT NULL, "approved_role" text NOT NULL, "approved_at" timestamp with time zone NOT NULL, "revoked_by" uuid, "revoked_at" timestamp with time zone, "active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE notificacoes_operacionais ("id" uuid NOT NULL, "usuario_id" uuid NOT NULL, "tipo" text NOT NULL, "titulo" text NOT NULL, "mensagem" text, "link" text, "lido" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "source_type" text, "source_id" uuid, "idempotency_key" text);
CREATE TABLE organization_feature_overrides ("id" uuid NOT NULL, "organization_id" uuid NOT NULL, "feature_id" uuid NOT NULL, "mode" text NOT NULL, "limit_value" numeric, "starts_at" timestamp with time zone NOT NULL, "ends_at" timestamp with time zone, "reason" text NOT NULL, "created_by" uuid, "ended_at" timestamp with time zone, "ended_by" uuid, "end_reason" text, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "idempotency_key" uuid, "end_idempotency_key" uuid);
CREATE TABLE organization_subscriptions ("id" uuid NOT NULL, "organization_id" uuid NOT NULL, "plan_id" uuid NOT NULL, "status" saas_subscription_status NOT NULL, "billing_cycle" text, "started_at" timestamp with time zone NOT NULL, "trial_ends_at" timestamp with time zone, "current_period_start" timestamp with time zone, "current_period_end" timestamp with time zone, "cancel_at" timestamp with time zone, "cancelled_at" timestamp with time zone, "suspended_at" timestamp with time zone, "created_by" uuid, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "plan_version_id" uuid, "price_snapshot" numeric(14,2), "currency_snapshot" text, "billing_cycle_snapshot" text, "limits_snapshot" jsonb, "features_snapshot" jsonb, "state_changed_at" timestamp with time zone, "last_correlation_id" uuid);
CREATE TABLE organizations ("id" uuid NOT NULL, "nome" text NOT NULL, "partner_account_id" uuid, "ativo" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "responsavel_user_id" uuid, "responsavel_definido_em" timestamp with time zone, "status" text NOT NULL, "razao_social" text, "nome_fantasia" text, "cnpj" text, "cnpj_normalizado" text, "email_corporativo" text, "onboarding_dados" jsonb NOT NULL, "fuso_horario" text, "onboarding_concluido_em" timestamp with time zone, "ativada_em" timestamp with time zone);
CREATE TABLE partner_accounts ("id" uuid NOT NULL, "client_id" uuid, "codigo" text, "razao_social" text NOT NULL, "nome_fantasia" text, "cnpj" text, "desconto_padrao" numeric(5,2) NOT NULL, "observacoes" text, "ativo" boolean NOT NULL, "deleted_at" timestamp with time zone, "created_by" uuid, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "partner_type" partner_type_enum, "commercial_region" text, "commercial_state" text, "commercial_city" text, "consultor_responsavel" uuid, "origem_parceiro" text, "inscricao_estadual" text, "inscricao_municipal" text, "regime_tributario" partner_regime_tributario, "suframa" text, "segmento" partner_segmento, "porte" partner_porte, "data_inicio_parceria" date, "cep" text, "endereco_logradouro" text, "endereco_numero" text, "endereco_complemento" text, "endereco_bairro" text, "email_comercial" text, "email_financeiro" text, "email_nfe" text, "telefone_comercial" text, "whatsapp_comercial" text, "site" text, "limite_credito_brl" numeric(14,2), "prazo_pagamento_padrao_dias" integer, "condicao_pagamento_padrao" text, "forma_pagamento_preferida" text, "dados_bancarios" jsonb, "comissao_percentual" numeric(5,2), "meta_mensal_brl" numeric(14,2), "endereco_entrega_igual_comercial" boolean NOT NULL, "entrega_cep" text, "entrega_logradouro" text, "entrega_numero" text, "entrega_complemento" text, "entrega_bairro" text, "entrega_cidade" text, "entrega_estado" text, "transportadora_preferida" text, "incoterm" text, "marca_nome" text, "marca_logo_url" text, "marca_cor_primaria" text, "commercial_owner_organization_id" uuid);
CREATE TABLE partner_audit_logs ("id" uuid NOT NULL, "partner_id" uuid, "usuario_id" uuid, "acao" text NOT NULL, "dados_anteriores" jsonb, "dados_novos" jsonb, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE partner_clients ("id" uuid NOT NULL, "partner_id" uuid NOT NULL, "cliente_id" uuid NOT NULL, "assigned_by" uuid, "assigned_at" timestamp with time zone NOT NULL, "active" boolean NOT NULL, "notes" text, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE partner_engagement_metrics ("partner_id" uuid NOT NULL, "ultima_compra" timestamp with time zone, "dias_sem_compra" integer, "pedidos_30d" integer NOT NULL, "pedidos_90d" integer NOT NULL, "top_produtos" jsonb NOT NULL, "campanhas_usadas" jsonb NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE partner_financial_settings ("id" uuid NOT NULL, "partner_id" uuid NOT NULL, "billing_trigger" text NOT NULL, "payment_terms_days" integer NOT NULL, "default_payment_method" text, "credit_limit" numeric(14,2), "block_if_overdue" boolean NOT NULL, "auto_generate_receivable" boolean NOT NULL, "active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "credit_limit_action" text NOT NULL, "overdue_tolerance_days" integer NOT NULL, "credit_alert_threshold_1" integer NOT NULL, "credit_alert_threshold_2" integer NOT NULL);
CREATE TABLE partner_order_audit_logs ("id" uuid NOT NULL, "order_id" uuid, "partner_id" uuid, "usuario_id" uuid, "acao" text NOT NULL, "dados_anteriores" jsonb, "dados_novos" jsonb, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE partner_order_financial_links ("id" uuid NOT NULL, "partner_order_id" uuid NOT NULL, "partner_id" uuid NOT NULL, "receivable_id" uuid NOT NULL, "financial_status" text NOT NULL, "billing_trigger" text, "created_by" uuid, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE partner_order_items ("id" uuid NOT NULL, "order_id" uuid NOT NULL, "product_id" uuid, "quantidade" numeric(12,2) NOT NULL, "preco_unitario" numeric(12,2) NOT NULL, "desconto_percentual" numeric(5,2) NOT NULL, "subtotal" numeric(12,2) NOT NULL, "created_at" timestamp with time zone NOT NULL, "produto_nome_snapshot" text, "produto_codigo_snapshot" text, "preco_tabela_snapshot" numeric(12,2), "desconto_percentual_snapshot" numeric(5,2), "preco_unitario_final_snapshot" numeric(12,2), "unidade_medida" text NOT NULL, "microrganismo_id" uuid, "volume_ml" numeric(12,2), "pricing_mode_snapshot" text, "price_source_snapshot" text, "base_price_snapshot" numeric(14,2), "condition_price_snapshot" numeric(14,2), "plan_discount_percent_snapshot" numeric(9,4), "unit_type_snapshot" text, "volume_ml_snapshot" numeric(12,2), "price_rule_id_snapshot" uuid);
CREATE TABLE partner_order_payment_schedule ("id" uuid NOT NULL, "partner_order_id" uuid NOT NULL, "payment_terms_id" uuid NOT NULL, "installment_number" integer NOT NULL, "due_date" date NOT NULL, "amount" numeric(14,2) NOT NULL, "principal_amount" numeric(14,2), "interest_amount" numeric(14,2), "status" text NOT NULL, "receivable_installment_id" uuid, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE partner_order_payment_terms ("id" uuid NOT NULL, "partner_order_id" uuid NOT NULL, "payment_plan_id" uuid, "plan_name_snapshot" text NOT NULL, "plan_code_snapshot" text NOT NULL, "discount_percent_snapshot" numeric(6,3) NOT NULL, "monthly_interest_percent_snapshot" numeric(6,3) NOT NULL, "months_count_snapshot" numeric(6,2) NOT NULL, "installment_count" integer NOT NULL, "first_due_date" date NOT NULL, "interest_type_snapshot" text NOT NULL, "table_amount" numeric(14,2) NOT NULL, "discount_amount" numeric(14,2) NOT NULL, "net_amount_after_discount" numeric(14,2) NOT NULL, "financial_interest_amount" numeric(14,2) NOT NULL, "final_amount" numeric(14,2) NOT NULL, "approval_status" text NOT NULL, "approved_by" uuid, "approved_at" timestamp with time zone, "approval_notes" text, "created_by" uuid, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "pricing_mode_snapshot" text, "credit_decision_snapshot" jsonb);
CREATE TABLE partner_orders ("id" uuid NOT NULL, "numero" text NOT NULL, "partner_id" uuid NOT NULL, "status" partner_order_status NOT NULL, "subtotal" numeric(12,2) NOT NULL, "desconto_total" numeric(12,2) NOT NULL, "total" numeric(12,2) NOT NULL, "observacoes" text, "created_by" uuid, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "approved_by" uuid, "approved_at" timestamp with time zone, "approval_notes" text, "requested_delivery_date" date, "estimated_delivery_date" date, "commercial_notes" text, "ready_for_production" boolean NOT NULL, "future_financial_link" uuid, "financial_status" text NOT NULL, "receivable_generated" boolean NOT NULL, "receivable_generated_at" timestamp with time zone, "receivable_generated_by" uuid, "payment_due_date" date, "payment_method" text, "credit_block_reason" text, "credit_approved_by" uuid, "credit_approved_at" timestamp with time zone, "credit_approval_notes" text, "priority" partner_order_priority NOT NULL, "itens_pendentes_motivo" text, "itens_pendentes_solicitado_em" timestamp with time zone, "itens_pendentes_solicitado_por" uuid, "itens_pendentes_resolvido_em" timestamp with time zone, "cultura" text, "area_total_ha" numeric, "origin_simulation_id" uuid, "cliente_id" uuid, "payment_plan_id" uuid, "payment_terms_id" uuid, "payment_condition_status" text NOT NULL, "table_amount" numeric(14,2), "commercial_discount_amount" numeric(14,2), "net_amount_after_discount" numeric(14,2), "financial_interest_amount" numeric(14,2), "final_amount_with_interest" numeric(14,2), "requires_financial_approval" boolean NOT NULL, "financial_approval_status" text NOT NULL, "internal_origin_snapshot" jsonb, "internal_economic_snapshot" jsonb);
CREATE TABLE partner_product_prices ("id" uuid NOT NULL, "partner_id" uuid NOT NULL, "product_id" uuid, "preco_tabela" numeric(12,2) NOT NULL, "desconto_percentual" numeric(5,2) NOT NULL, "preco_final" numeric(12,2), "ativo" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "valid_from" date, "valid_until" date, "price_table_name" text, "is_current" boolean NOT NULL, "microrganismo_id" uuid);
CREATE TABLE partner_risk_scores ("id" uuid NOT NULL, "partner_id" uuid NOT NULL, "score" integer NOT NULL, "risk_level" text NOT NULL, "dias_medio_atraso" numeric(8,2) NOT NULL, "titulos_vencidos" integer NOT NULL, "pct_credito_utilizado" numeric(6,2) NOT NULL, "freq_compras_30d" integer NOT NULL, "meses_relacionamento" integer NOT NULL, "calculado_em" timestamp with time zone NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE partner_technician_clients ("id" uuid NOT NULL, "partner_id" uuid NOT NULL, "technician_user_id" uuid NOT NULL, "cliente_id" uuid NOT NULL, "assigned_by" uuid, "assigned_at" timestamp with time zone NOT NULL, "active" boolean NOT NULL, "notes" text, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE partner_user_clients ("id" uuid NOT NULL, "partner_id" uuid NOT NULL, "user_id" uuid NOT NULL, "user_role" text, "cliente_id" uuid NOT NULL, "assignment_type" text NOT NULL, "can_create_simulation" boolean NOT NULL, "can_monitor" boolean NOT NULL, "assigned_by" uuid, "assigned_at" timestamp with time zone NOT NULL, "active" boolean NOT NULL, "notes" text, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE partner_users ("id" uuid NOT NULL, "partner_id" uuid NOT NULL, "user_id" uuid NOT NULL, "created_at" timestamp with time zone NOT NULL, "papel" text NOT NULL, "valid_from" timestamp with time zone NOT NULL, "revoked_at" timestamp with time zone, "revoked_by" uuid, "revoke_reason" text, "tenant_id" uuid, "version" integer NOT NULL);
CREATE TABLE payment_methods ("id" uuid NOT NULL, "name" text NOT NULL, "active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE platform_org_admin_invites ("id" uuid NOT NULL, "organization_id" uuid NOT NULL, "user_id" uuid, "email" text NOT NULL, "nome" text NOT NULL, "cpf_cnpj" text, "telefone" text, "modo_acesso" text NOT NULL, "responsavel_principal" boolean NOT NULL, "invited_by" uuid NOT NULL, "created_at" timestamp with time zone NOT NULL, "status" text NOT NULL, "concluido_em" timestamp with time zone, "request_id" uuid NOT NULL, "updated_at" timestamp with time zone NOT NULL, "attempt_count" integer NOT NULL, "lease_token" uuid, "lease_expires_at" timestamp with time zone, "auth_created_at" timestamp with time zone, "last_error_code" text, "email_delivery_status" text NOT NULL, "email_attempt_count" integer NOT NULL, "email_idempotency_key" uuid NOT NULL, "email_lease_token" uuid, "email_lease_expires_at" timestamp with time zone, "email_last_attempt_at" timestamp with time zone, "email_accepted_at" timestamp with time zone, "email_failed_at" timestamp with time zone, "email_next_attempt_at" timestamp with time zone NOT NULL, "email_last_error_code" text, "access_operation_id" uuid, "access_operation_kind" text, "access_operation_status" text, "access_requested_at" timestamp with time zone, "access_expires_at" timestamp with time zone, "access_valid_after" timestamp with time zone);
CREATE TABLE platform_private.authz_tickets ("txid" bigint NOT NULL, "scope" text NOT NULL, "target" uuid NOT NULL, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE platform_private.b2b_provisioning_receipts ("id" uuid NOT NULL, "actor_id" uuid NOT NULL, "organization_id" uuid NOT NULL, "partner_id" uuid, "external_role" app_role NOT NULL, "cliente_ids" uuid[] NOT NULL, "principal_cliente_id" uuid, "target_snapshot" jsonb NOT NULL, "idempotency_key" uuid NOT NULL, "email" text NOT NULL, "nome" text NOT NULL, "actor_stamp" timestamp with time zone NOT NULL, "actor_iat" bigint NOT NULL, "actor_invite_fence" jsonb NOT NULL, "user_id" uuid NOT NULL, "fence" uuid NOT NULL, "status" text NOT NULL, "lease_until" timestamp with time zone NOT NULL, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE platform_private.provisional_password_state ("user_id" uuid NOT NULL, "pwd_digest" text, "desde" timestamp with time zone NOT NULL, "expires_at" timestamp with time zone);
CREATE TABLE production_order_link ("id" uuid NOT NULL, "partner_order_id" uuid NOT NULL, "partner_order_item_id" uuid NOT NULL, "planning_id" uuid NOT NULL, "ordem_servico_id" uuid NOT NULL, "created_by" uuid, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE production_planning ("id" uuid NOT NULL, "partner_order_id" uuid NOT NULL, "partner_id" uuid NOT NULL, "status" production_planning_status NOT NULL, "planned_start_date" date, "planned_finish_date" date, "production_notes" text, "created_by" uuid, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE production_timeline_events ("id" uuid NOT NULL, "partner_order_id" uuid NOT NULL, "event_type" text NOT NULL, "event_at" timestamp with time zone NOT NULL, "actor_id" uuid, "meta" jsonb NOT NULL);
CREATE TABLE profiles ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "nome" text NOT NULL, "email" text, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "telefone" text, "cargo" text, "cpf_cnpj" text, "ativo" boolean NOT NULL, "cliente_id" uuid, "crea" text, "especialidade" text, "data_admissao" date, "observacoes_internas" text, "organization_id" uuid, "senha_provisoria" boolean NOT NULL);
CREATE TABLE receivable_payments ("id" uuid NOT NULL, "installment_id" uuid NOT NULL, "payment_date" date NOT NULL, "amount_received" numeric(14,2) NOT NULL, "payment_method_id" uuid NOT NULL, "bank_account_id" uuid, "discount_amount" numeric(14,2) NOT NULL, "interest_amount" numeric(14,2) NOT NULL, "penalty_amount" numeric(14,2) NOT NULL, "notes" text, "created_by" uuid NOT NULL, "created_at" timestamp with time zone NOT NULL, "is_reversal" boolean NOT NULL, "reversed_payment_id" uuid, "reversal_reason" text, "idempotency_key" text, "request_fingerprint" text, "organization_id" uuid);
CREATE TABLE saas_features ("id" uuid NOT NULL, "module_id" uuid NOT NULL, "key" text NOT NULL, "name" text NOT NULL, "description" text, "active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL, "commercializable" boolean NOT NULL);
CREATE TABLE saas_modules ("id" uuid NOT NULL, "key" text NOT NULL, "name" text NOT NULL, "description" text, "active" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE saas_plan_version_features ("plan_version_id" uuid NOT NULL, "feature_id" uuid NOT NULL, "enabled" boolean NOT NULL, "limit_value" numeric, "config" jsonb, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE saas_plan_versions ("id" uuid NOT NULL, "plan_id" uuid NOT NULL, "version_number" integer NOT NULL, "name_snapshot" text NOT NULL, "description_snapshot" text, "price_amount" numeric(14,2), "currency" text, "billing_cycle" text, "limits_snapshot" jsonb NOT NULL, "features_snapshot" jsonb NOT NULL, "effective_from" timestamp with time zone, "effective_to" timestamp with time zone, "published_at" timestamp with time zone, "created_by" uuid, "created_at" timestamp with time zone NOT NULL, "publication_reason" text, "correlation_id" uuid, "status" text NOT NULL, "trial_days" integer, "revision" integer NOT NULL, "draft_key" uuid, "publish_key" uuid, "updated_at" timestamp with time zone NOT NULL, "archived_at" timestamp with time zone, "archived_by" uuid, "archive_reason" text);
CREATE TABLE user_access_preferences ("user_id" uuid NOT NULL, "last_context" text, "preferred_context" text, "skip_context_selector" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone NOT NULL);
CREATE TABLE user_clientes ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "cliente_id" uuid NOT NULL, "principal" boolean NOT NULL, "created_at" timestamp with time zone NOT NULL, "is_active" boolean NOT NULL, "access_level" access_level_tecnico NOT NULL, "assigned_by" uuid, "valid_from" timestamp with time zone NOT NULL, "valid_until" timestamp with time zone, "revoked_at" timestamp with time zone, "revoked_by" uuid);
CREATE TABLE user_context_access_logs ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "context_code" text NOT NULL, "action" text NOT NULL, "previous_context" text, "metadata" jsonb NOT NULL, "created_at" timestamp with time zone NOT NULL);
CREATE TABLE user_roles ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" app_role NOT NULL);
CREATE OR REPLACE FUNCTION public._notify_role(p_role app_role, p_tipo text, p_titulo text, p_mensagem text, p_link text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN RETURN; END $function$;
CREATE OR REPLACE FUNCTION public._portal_cliente_user_has_link(p_user uuid, p_cliente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_clientes WHERE user_id = p_user AND cliente_id = p_cliente
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_user AND cliente_id = p_cliente
  );
$function$;
CREATE OR REPLACE FUNCTION public._saas_trg_require_feature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := TG_ARGV[0];
BEGIN
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id AND o.ativo IS TRUE
    WHERE p.user_id = v_uid AND p.ativo IS TRUE AND p.organization_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'saas_context_unavailable: usuário ativo e empresa são obrigatórios'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public._saas_user_has_feature(v_uid, v_key) THEN
    RAISE EXCEPTION 'saas_feature_not_entitled: funcionalidade não contratada ou assinatura indisponível'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public._saas_user_has_feature(_uid uuid, _feature_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM platform_private.entitlements_for_user(_uid) e
    WHERE e.feature_key = _feature_key
  )
$function$;
CREATE OR REPLACE FUNCTION public.admin_provision_user_profile_v1(p_user_id uuid, p_email text, p_nome text, p_roles app_role[], p_cliente_ids uuid[] DEFAULT ARRAY[]::uuid[], p_principal_cliente_id uuid DEFAULT NULL::uuid, p_partner_id uuid DEFAULT NULL::uuid, p_partner_papel text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_cargo text DEFAULT NULL::text, p_cpf_cnpj text DEFAULT NULL::text, p_crea text DEFAULT NULL::text, p_especialidade text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_profile_count integer;
  v_role_count integer;
  v_cliente_count integer;
  v_partner_role_count integer;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL OR p_nome IS NULL THEN
    RAISE EXCEPTION 'invalid_user_payload' USING ERRCODE = '22023';
  END IF;

  v_role_count := COALESCE(cardinality(p_roles), 0);
  IF v_role_count = 0 OR v_role_count > 13 THEN
    RAISE EXCEPTION 'invalid_roles' USING ERRCODE = '22023';
  END IF;

  IF 'superadmin'::public.app_role = ANY(p_roles) THEN
    RAISE EXCEPTION 'superadmin_role_reserved' USING ERRCODE = '42501';
  END IF;

  IF v_role_count <> (SELECT count(DISTINCT r) FROM unnest(p_roles) AS r) THEN
    RAISE EXCEPTION 'duplicate_roles' USING ERRCODE = '22023';
  END IF;

  p_cliente_ids := COALESCE(p_cliente_ids, ARRAY[]::uuid[]);
  v_cliente_count := cardinality(p_cliente_ids);
  IF v_cliente_count > 100
     OR v_cliente_count <> (SELECT count(DISTINCT c) FROM unnest(p_cliente_ids) AS c) THEN
    RAISE EXCEPTION 'invalid_customer_links' USING ERRCODE = '22023';
  END IF;

  IF 'cliente_produtor'::public.app_role = ANY(p_roles) AND v_cliente_count = 0 THEN
    RAISE EXCEPTION 'producer_requires_customer' USING ERRCODE = '23514';
  END IF;

  IF p_principal_cliente_id IS NOT NULL
     AND NOT (p_principal_cliente_id = ANY(p_cliente_ids)) THEN
    RAISE EXCEPTION 'invalid_primary_customer' USING ERRCODE = '23514';
  END IF;

  IF v_cliente_count > 0 AND (
    SELECT count(*) FROM public.clientes c WHERE c.id = ANY(p_cliente_ids)
  ) <> v_cliente_count THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_partner_role_count
  FROM unnest(p_roles) AS r
  WHERE r IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role);

  IF v_partner_role_count > 1 THEN
    RAISE EXCEPTION 'conflicting_partner_roles' USING ERRCODE = '23514';
  END IF;

  IF v_partner_role_count = 1 THEN
    IF p_partner_id IS NULL OR p_partner_papel NOT IN ('gestor', 'tecnico') THEN
      RAISE EXCEPTION 'invalid_partner_link' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.partner_accounts pa WHERE pa.id = p_partner_id) THEN
      RAISE EXCEPTION 'partner_not_found' USING ERRCODE = '23503';
    END IF;
  ELSIF p_partner_id IS NOT NULL OR p_partner_papel IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_partner_link' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_profile_count
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  IF v_profile_count <> 1
     OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.user_clientes uc WHERE uc.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_ready_for_provisioning' USING ERRCODE = '23514';
  END IF;

  UPDATE public.profiles
     SET nome = p_nome,
         email = p_email,
         telefone = NULLIF(p_telefone, ''),
         cargo = NULLIF(p_cargo, ''),
         cpf_cnpj = NULLIF(p_cpf_cnpj, ''),
         crea = NULLIF(p_crea, ''),
         especialidade = NULLIF(p_especialidade, '')
   WHERE user_id = p_user_id;

  IF v_cliente_count > 0 THEN
    INSERT INTO public.user_clientes (user_id, cliente_id, principal)
    SELECT p_user_id, c,
           c = COALESCE(p_principal_cliente_id, p_cliente_ids[1])
    FROM unnest(p_cliente_ids) AS c;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  SELECT p_user_id, r FROM unnest(p_roles) AS r;

  IF v_partner_role_count = 1 THEN
    INSERT INTO public.partner_users (user_id, partner_id, papel)
    VALUES (p_user_id, p_partner_id, p_partner_papel);
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.audit_partner_order_payment_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
BEGIN
  SELECT partner_id INTO v_partner_id FROM public.partner_orders WHERE id = NEW.partner_order_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.partner_order_id, v_partner_id, auth.uid(), 'payment_terms_created', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.partner_order_id, v_partner_id, auth.uid(), 'payment_terms_updated', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.b2b_claim_provisioning(p_partner uuid, p_key uuid, p_email text, p_nome text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT platform_private.b2b_claim_provisioning(p_partner,p_key,p_email,p_nome);
$function$;
CREATE OR REPLACE FUNCTION public.b2b_claim_provisioning(p_partner uuid, p_key uuid, p_email text, p_nome text, p_role app_role, p_clients uuid[], p_primary uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT platform_private.b2b_claim_provisioning(p_partner,p_key,p_email,p_nome,p_role,p_clients,p_primary);
$function$;
CREATE OR REPLACE FUNCTION public.b2b_complete_provisioning_compensation(p_claim uuid, p_fence uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r platform_private.b2b_provisioning_receipts;
BEGIN
 PERFORM platform_private.require_service_role();
 -- Acquire before receipt/profile locks, never wait for the trigger gate afterward.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 SELECT * INTO r FROM platform_private.b2b_provisioning_receipts WHERE id=p_claim FOR UPDATE;
 IF r.id IS NULL OR r.fence IS DISTINCT FROM p_fence OR r.user_id IS DISTINCT FROM p_user OR r.status<>'compensating' THEN
 RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 -- Auth deletion's cascades must have completed; never pretend cleanup succeeded.
 IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN
  RAISE EXCEPTION 'b2b_compensation_pending' USING ERRCODE='42501'; END IF;
 -- Live schema has NO Auth FK on these two links. Delete only exact receipt
 -- descendants after proven own Auth removal; unrelated links fail closed.
 IF EXISTS(SELECT 1 FROM public.partner_users WHERE user_id=p_user AND
 (r.partner_id IS NULL OR partner_id IS DISTINCT FROM r.partner_id OR papel IS DISTINCT FROM 'gestor'))
 OR EXISTS(SELECT 1 FROM public.user_clientes WHERE user_id=p_user AND
 (NOT (cliente_id=ANY(r.cliente_ids)) OR assigned_by IS DISTINCT FROM r.actor_id)) THEN
 RAISE EXCEPTION 'b2b_compensation_pending' USING ERRCODE='42501'; END IF;
 DELETE FROM public.partner_users WHERE user_id=r.user_id AND partner_id=r.partner_id AND papel='gestor';
 DELETE FROM public.user_clientes WHERE user_id=r.user_id AND cliente_id=ANY(r.cliente_ids) AND assigned_by=r.actor_id;
 UPDATE platform_private.b2b_provisioning_receipts SET status='aborted'
 WHERE id=p_claim AND fence=p_fence AND user_id=p_user AND status='compensating';
 IF NOT FOUND THEN RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 RETURN true;
END $function$;
CREATE OR REPLACE FUNCTION public.b2b_finish_provisioning(p_claim uuid, p_fence uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r platform_private.b2b_provisioning_receipts; actor public.profiles; target public.profiles; invitation jsonb; ctx jsonb;
BEGIN
 PERFORM platform_private.require_service_role();
 -- Acquire before receipt/profile locks, never wait for the trigger gate afterward.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 SELECT * INTO r FROM platform_private.b2b_provisioning_receipts WHERE id=p_claim FOR UPDATE;
 IF r.id IS NULL OR r.fence IS DISTINCT FROM p_fence OR r.user_id IS DISTINCT FROM p_user THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.platform_org_admin_invites WHERE user_id=r.actor_id ORDER BY id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_array(id,access_operation_id,access_operation_status,status,access_valid_after) ORDER BY id),'[]'::jsonb) INTO invitation FROM public.platform_org_admin_invites WHERE user_id=r.actor_id;
 IF invitation IS DISTINCT FROM r.actor_invite_fence OR EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=r.actor_id AND (i.access_operation_status='processing' OR i.status='processando' OR (i.access_valid_after IS NOT NULL AND to_timestamp(r.actor_iat)<=i.access_valid_after))) THEN
 RAISE EXCEPTION 'b2b_provisioning_actor_revoked' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.profiles WHERE user_id=r.actor_id FOR UPDATE;
 ctx:=platform_private.external_provisioning_scope(r.actor_id,r.external_role,r.partner_id,r.cliente_ids,r.principal_cliente_id);
 IF ctx->'snapshot' IS DISTINCT FROM r.target_snapshot THEN RAISE EXCEPTION 'external_provisioning_target_changed' USING ERRCODE='42501'; END IF;
 IF actor.organization_id IS DISTINCT FROM r.organization_id OR actor.updated_at IS DISTINCT FROM r.actor_stamp
 OR NOT platform_private.platform_actor_access_ready(r.actor_id)
 OR NOT public.has_role(r.actor_id,'administrador'::public.app_role)
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=r.organization_id AND o.ativo IS TRUE AND o.status='ativa')
 THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF r.status='completed' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=r.user_id AND lower(u.email)=r.email
   AND u.raw_app_meta_data->>'b2b_provisioning_receipt'=r.id::text)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=r.user_id AND organization_id=r.organization_id AND ativo IS TRUE)
  OR (SELECT count(*) FROM public.user_roles WHERE user_id=r.user_id)<>1
  OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=r.user_id AND role=r.external_role)
  OR (SELECT count(*) FROM public.partner_users WHERE user_id=r.user_id)<>(CASE WHEN r.partner_id IS NULL THEN 0 ELSE 1 END)
  OR (r.partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_users WHERE user_id=r.user_id AND partner_id=r.partner_id AND papel='gestor'))
  OR (SELECT count(*) FROM public.user_clientes WHERE user_id=r.user_id)<>cardinality(r.cliente_ids)
  OR EXISTS(SELECT 1 FROM public.user_clientes WHERE user_id=r.user_id AND (NOT (cliente_id=ANY(r.cliente_ids)) OR is_active IS NOT TRUE OR revoked_at IS NOT NULL OR principal IS DISTINCT FROM (cliente_id=r.principal_cliente_id))) THEN
   RAISE EXCEPTION 'b2b_provisioning_target_conflict' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('success',true,'user_id',r.user_id,'replay',true);
 END IF;
 IF r.status<>'claimed' THEN
  RAISE EXCEPTION 'b2b_provisioning_stale' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.profiles WHERE user_id=p_user FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=r.user_id AND lower(u.email)=r.email
   AND u.raw_app_meta_data->>'b2b_provisioning_receipt'=r.id::text)
 OR target.user_id IS NULL OR target.organization_id IS NOT NULL OR target.cliente_id IS NOT NULL
 OR lower(target.email) IS DISTINCT FROM r.email
 OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM public.partner_users WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM public.user_clientes WHERE user_id=p_user) THEN
  RAISE EXCEPTION 'b2b_provisioning_target_conflict' USING ERRCODE='42501'; END IF;
 -- Existing server-only first-access contract; recovery proof required, no operator password.
 UPDATE public.profiles SET organization_id=r.organization_id,nome=r.nome,ativo=true,senha_provisoria=true WHERE user_id=p_user;
 PERFORM public.admin_provision_user_profile_v1(p_user,r.email,r.nome,ARRAY[r.external_role],r.cliente_ids,r.principal_cliente_id,r.partner_id,CASE WHEN r.partner_id IS NULL THEN NULL ELSE 'gestor' END);
 UPDATE public.user_clientes SET is_active=true,assigned_by=r.actor_id WHERE user_id=p_user;

 INSERT INTO platform_private.provisional_password_state(user_id,desde,expires_at)
 VALUES(p_user,clock_timestamp(),NULL);
 UPDATE platform_private.b2b_provisioning_receipts SET status='completed' WHERE id=r.id;
 RETURN jsonb_build_object('success',true,'user_id',p_user,'first_access_pending',true);
END $function$;
CREATE OR REPLACE FUNCTION public.b2b_phase1_order_visible(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.b2b_phase1_order_visible(p_order); $function$;
CREATE OR REPLACE FUNCTION public.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.b2b_phase1_partner_visible(p_partner,p_technical); $function$;
CREATE OR REPLACE FUNCTION public.b2b_prepare_provisioning_compensation(p_claim uuid, p_fence uuid, p_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r platform_private.b2b_provisioning_receipts;
BEGIN
 PERFORM platform_private.require_service_role();
 -- Acquire before receipt/profile locks, never wait for the trigger gate afterward.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 SELECT * INTO r FROM platform_private.b2b_provisioning_receipts WHERE id=p_claim FOR UPDATE;
 IF r.id IS NULL OR r.fence IS DISTINCT FROM p_fence OR r.user_id IS DISTINCT FROM p_user THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF r.status='completed' THEN RETURN 'completed'; END IF;
 IF r.status='aborted' THEN RETURN 'aborted'; END IF;
 UPDATE platform_private.b2b_provisioning_receipts SET status='compensating' WHERE id=r.id;
 RETURN 'compensating';
END $function$;
CREATE OR REPLACE FUNCTION public.b2b_provisioning_preflight(p_partner uuid, p_role text, p_papel text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT platform_private.b2b_provisioning_preflight(p_partner,p_role,p_papel);
$function$;
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_cliente_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_admin boolean;
    v_is_gestor boolean;
    v_is_adm_sys boolean;
    v_is_financeiro boolean;
    v_is_comercial boolean;
    v_is_producao boolean;
    v_is_aplicador boolean;
    v_is_onfarm boolean;
    v_is_consultor boolean;
    v_is_tecnico boolean;
    v_is_cliente boolean;
    v_is_b2b boolean;
    v_is_b2b_tec boolean;
    v_partner_id uuid;
BEGIN
    IF v_user_id IS NULL OR _cliente_id IS NULL THEN
        RETURN FALSE;
    END IF;

    v_is_admin := COALESCE(has_role(v_user_id, 'administrador'::app_role), false);
    v_is_gestor := COALESCE(has_role(v_user_id, 'gestor'::app_role), false);
    v_is_adm_sys := COALESCE(has_role(v_user_id, 'administrativo'::app_role), false);
    v_is_financeiro := COALESCE(has_role(v_user_id, 'financeiro'::app_role), false);
    v_is_comercial := COALESCE(has_role(v_user_id, 'gestor_comercial'::app_role), false);
    v_is_producao := COALESCE(has_role(v_user_id, 'producao'::app_role), false);
    v_is_aplicador := COALESCE(has_role(v_user_id, 'aplicador'::app_role), false);
    v_is_onfarm := COALESCE(has_role(v_user_id, 'operador_onfarm'::app_role), false);
    v_is_consultor := COALESCE(has_role(v_user_id, 'consultor_tecnico'::app_role), false);
    v_is_tecnico := COALESCE(has_role(v_user_id, 'tecnico_agronomo'::app_role), false);
    v_is_cliente := COALESCE(has_role(v_user_id, 'cliente_produtor'::app_role), false);
    v_is_b2b := COALESCE(has_role(v_user_id, 'parceiro_b2b'::app_role), false);
    v_is_b2b_tec := COALESCE(has_role(v_user_id, 'parceiro_b2b_tecnico'::app_role), false);

    IF v_is_admin OR v_is_gestor OR v_is_adm_sys OR v_is_financeiro
       OR v_is_comercial OR v_is_producao OR v_is_aplicador OR v_is_onfarm THEN
        RETURN TRUE;
    END IF;

    IF v_is_cliente THEN
        RETURN COALESCE(_cliente_id = ANY(get_cliente_ids_for_user(v_user_id)), false);
    END IF;

    -- HARDENING: carteira ativa e vigente é obrigatória para papéis técnicos.
    IF v_is_consultor OR v_is_tecnico THEN
        RETURN COALESCE(
          public.has_active_user_cliente_access(
            v_user_id, _cliente_id, ARRAY['read','execute','manage']
          ), false);
    END IF;

    IF v_is_b2b_tec THEN
        v_partner_id := public.get_user_partner_id();
        RETURN COALESCE((
          EXISTS (
            SELECT 1 FROM public.partner_technician_clients ptc
            WHERE ptc.cliente_id = _cliente_id
              AND ptc.technician_user_id = v_user_id
              AND ptc.partner_id = v_partner_id
              AND ptc.active = true
          )), false);
    END IF;

    IF v_is_b2b THEN
        v_partner_id := public.get_user_partner_id();
        RETURN COALESCE((
          EXISTS (
            SELECT 1 FROM public.partner_technician_clients ptc
            WHERE ptc.cliente_id = _cliente_id
              AND ptc.partner_id = v_partner_id
              AND ptc.active = true
          ) OR EXISTS (
            SELECT 1 FROM public.partner_clients pc
            WHERE pc.cliente_id = _cliente_id
              AND pc.partner_id = v_partner_id
              AND pc.active = true
          )), false);
    END IF;

    RETURN FALSE;
END;
$function$;
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_user_id uuid, _cliente_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(public.has_role(_user_id,'administrador'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'gestor_comercial'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'gestor'::app_role), false)
  THEN
    RETURN true;
  END IF;

  -- HARDENING: papéis técnicos exigem carteira ativa e vigente.
  IF COALESCE(public.has_role(_user_id,'tecnico_agronomo'::app_role), false)
     OR COALESCE(public.has_role(_user_id,'consultor_tecnico'::app_role), false)
  THEN
    RETURN COALESCE(
      public.has_active_user_cliente_access(
        _user_id, _cliente_id, ARRAY['read','execute','manage']
      ), false);
  END IF;

  IF COALESCE(public.has_role(_user_id,'parceiro_b2b'::app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM public.partner_clients pc
      JOIN public.partner_users pu ON pu.partner_id = pc.partner_id
      JOIN public.partner_accounts pa ON pa.id = pu.partner_id
      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true
        AND pu.revoked_at IS NULL
        AND pa.ativo = true AND pa.deleted_at IS NULL
        AND pa.commercial_owner_organization_id IS NOT NULL
        AND pu.tenant_id IS NOT NULL
        AND pu.tenant_id = pa.commercial_owner_organization_id
    )), false);
  END IF;

  IF COALESCE(public.has_role(_user_id,'parceiro_b2b_tecnico'::app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM public.partner_user_clients puc
      JOIN public.partner_users pu2 ON pu2.partner_id = puc.partner_id AND pu2.user_id = puc.user_id
      JOIN public.partner_accounts pa2 ON pa2.id = puc.partner_id
      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true
        AND pu2.revoked_at IS NULL
        AND pa2.ativo = true AND pa2.deleted_at IS NULL
        AND pa2.commercial_owner_organization_id IS NOT NULL
        AND pu2.tenant_id IS NOT NULL
        AND pu2.tenant_id = pa2.commercial_owner_organization_id
    ) OR EXISTS (
      SELECT 1 FROM public.partner_technician_clients ptc
      JOIN public.partner_users pu3 ON pu3.partner_id = ptc.partner_id AND pu3.user_id = ptc.technician_user_id
      JOIN public.partner_accounts pa3 ON pa3.id = ptc.partner_id
      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true
        AND pu3.revoked_at IS NULL
        AND pa3.ativo = true AND pa3.deleted_at IS NULL
        AND pa3.commercial_owner_organization_id IS NOT NULL
        AND pu3.tenant_id IS NOT NULL
        AND pu3.tenant_id = pa3.commercial_owner_organization_id
    )), false);
  END IF;

  RETURN COALESCE((EXISTS (
    SELECT 1 FROM public.user_clientes uc
    WHERE uc.user_id = _user_id
      AND uc.cliente_id = _cliente_id
      AND uc.is_active = true
      AND uc.revoked_at IS NULL
      AND (uc.valid_from IS NULL OR uc.valid_from <= now())
      AND (uc.valid_until IS NULL OR uc.valid_until >= now())
  )), false);
END;
$function$;
CREATE OR REPLACE FUNCTION cf_user_guards_v1.acquire_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass,'auth.users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL THEN RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION cf_user_guards_v1.acquire_invitation_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID<>'public.platform_org_admin_invites'::regclass THEN
  RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL THEN
  RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION cf_user_guards_v1.advance_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond'); RETURN NEW; END $function$;
CREATE OR REPLACE FUNCTION cf_user_guards_v1.block_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN RAISE EXCEPTION 'user_bulk_truncate_forbidden' USING ERRCODE='PT409'; END $function$;
CREATE OR REPLACE FUNCTION cf_user_guards_v1.require_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r USING(user_id) WHERE p.ativo IS TRUE AND r.role='administrador') THEN RAISE EXCEPTION 'user_last_active_admin' USING ERRCODE='PT409'; END IF;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION cf_user_guards_v1.touch_invitation_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old_id uuid; new_id uuid; item uuid;
BEGIN
 IF TG_LEVEL<>'ROW' OR TG_RELID<>'public.platform_org_admin_invites'::regclass THEN
  RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'INSERT' THEN old_id:=OLD.user_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.user_id; END IF;
 FOR item IN SELECT DISTINCT x FROM unnest(ARRAY[old_id,new_id]) x WHERE x IS NOT NULL ORDER BY x
 LOOP UPDATE public.profiles SET updated_at=updated_at WHERE user_id=item; END LOOP;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION cf_user_guards_v1.touch_related_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old_id uuid; new_id uuid; item uuid;
BEGIN
 IF TG_LEVEL<>'ROW' OR TG_RELID NOT IN ('public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'INSERT' THEN old_id:=OLD.user_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.user_id; END IF;
 FOR item IN SELECT DISTINCT x FROM unnest(ARRAY[old_id,new_id]) x WHERE x IS NOT NULL ORDER BY x LOOP UPDATE public.profiles SET updated_at=updated_at WHERE user_id=item; END LOOP;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.d51_5_validate_financial_tenant_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_org uuid;
  v_parent_id uuid;
BEGIN
  BEGIN
    v_org := NULLIF(v_new->>'organization_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_INVALID' USING ERRCODE = '23514';
  END;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'accounts_receivable' THEN
    v_parent_id := NULLIF(v_new->>'customer_id', '')::uuid;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.clientes c WHERE c.id = v_parent_id AND c.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_CUSTOMER_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'accounts_receivable_installments' THEN
    v_parent_id := NULLIF(v_new->>'receivable_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_receivable ar WHERE ar.id = v_parent_id AND ar.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIVABLE_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'accounts_payable_installments' THEN
    v_parent_id := NULLIF(v_new->>'payable_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_payable ap WHERE ap.id = v_parent_id AND ap.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_PAYABLE_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'receivable_payments' THEN
    v_parent_id := NULLIF(v_new->>'installment_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_receivable_installments ari WHERE ari.id = v_parent_id AND ari.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIVABLE_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'payable_payments' THEN
    v_parent_id := NULLIF(v_new->>'installment_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_payable_installments api WHERE api.id = v_parent_id AND api.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_PAYABLE_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'financial_receipts' THEN
    v_parent_id := NULLIF(v_new->>'customer_id', '')::uuid;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.clientes c WHERE c.id = v_parent_id AND c.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIPT_CUSTOMER_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    v_parent_id := NULLIF(v_new->>'payment_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.receivable_payments rp WHERE rp.id = v_parent_id AND rp.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIPT_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.enforce_cliente_id_for_produtor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_role app_role;
  v_count int;
BEGIN
  -- Lógica específica para a tabela user_roles
  IF TG_TABLE_NAME = 'user_roles' THEN
    -- Aqui o record NEW possui o campo 'role'
    IF NEW.role = 'cliente_produtor' THEN
      SELECT count(*) INTO v_count
        FROM public.user_clientes WHERE user_id = NEW.user_id;
      IF v_count = 0 THEN
        RAISE EXCEPTION 'Para a função "Produtor (Portal)" é obrigatório vincular o usuário a pelo menos um cliente.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Lógica específica para a tabela user_clientes (que não possui campo 'role')
  IF TG_TABLE_NAME = 'user_clientes' THEN
    v_user := COALESCE(NEW.user_id, OLD.user_id);
    
    -- Verifica se o usuário tem a role de produtor
    SELECT role INTO v_role FROM public.user_roles
      WHERE user_id = v_user AND role = 'cliente_produtor' LIMIT 1;
      
    IF v_role IS NOT NULL THEN
      -- Conta quantos vínculos restariam após a operação
      IF TG_OP = 'DELETE' THEN
        SELECT count(*) INTO v_count FROM public.user_clientes
          WHERE user_id = v_user AND id <> OLD.id;
      ELSE
        SELECT count(*) INTO v_count FROM public.user_clientes
          WHERE user_id = v_user;
      END IF;

      IF v_count = 0 THEN
        RAISE EXCEPTION 'Este usuário é Produtor e precisa permanecer vinculado a pelo menos um cliente.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;$function$;
CREATE OR REPLACE FUNCTION finance_private.protect_allocated_payable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v public.payable_allocation_versions%ROWTYPE; expected_center uuid;
BEGIN
 SELECT * INTO v FROM public.payable_allocation_versions WHERE payable_id=NEW.id ORDER BY version DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NEW.total_amount IS DISTINCT FROM v.total_amount THEN RAISE EXCEPTION 'FIN_ALLOCATION_TOTAL_LOCKED' USING ERRCODE='23514'; END IF;
 expected_center:=CASE WHEN jsonb_array_length(v.allocations)=1 THEN (v.allocations->0->>'cost_center_id')::uuid ELSE NULL END;
 IF NEW.cost_center_id IS DISTINCT FROM expected_center THEN RAISE EXCEPTION 'FIN_ALLOCATION_USE_RPC' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION finance_private.set_payable_allocations(p_payable_id uuid, p_allocations jsonb, p_reason text, p_expected_version integer, p_request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); a public.accounts_payable%ROWTYPE; current_version integer; line jsonb; cc uuid; amt numeric; sm numeric:=0; seen uuid[]:='{}'; normalized jsonb:='[]'; enriched jsonb:='[]'; nm text; cd text; fp text; prior public.payable_allocation_versions%ROWTYPE; result_id uuid;
BEGIN
 IF u IS NULL OR public.is_financial_staff(u) IS NOT TRUE THEN RAISE EXCEPTION 'FIN_ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_request_key IS NULL OR p_expected_version IS NULL OR p_expected_version<0 THEN RAISE EXCEPTION 'FIN_ALLOCATION_REQUEST' USING ERRCODE='23514'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'FIN_ALLOCATION_REASON' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FIN_ALLOCATION_ITEMS' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'FIN_ALLOCATION_ITEMS' USING ERRCODE='23514'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
  IF jsonb_typeof(line) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'FIN_ALLOCATION_ITEMS' USING ERRCODE='23514'; END IF;
  BEGIN cc:=(line->>'cost_center_id')::uuid; amt:=(line->>'amount')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'FIN_ALLOCATION_VALUE' USING ERRCODE='23514'; END;
  IF cc IS NULL OR cc=ANY(seen) OR amt IS NULL OR amt::text IN('NaN','Infinity','-Infinity') OR amt<=0 OR amt<>round(amt,2) THEN RAISE EXCEPTION 'FIN_ALLOCATION_VALUE' USING ERRCODE='23514'; END IF;
  seen:=array_append(seen,cc);sm:=sm+amt;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('cost_center_id',cc,'amount',round(amt,2)));
 END LOOP;
 SELECT jsonb_agg(x ORDER BY x->>'cost_center_id') INTO normalized FROM jsonb_array_elements(normalized) x;
 fp:=md5(jsonb_build_object('items',normalized,'reason',btrim(p_reason),'expected_version',p_expected_version)::text);
 SELECT * INTO a FROM public.accounts_payable WHERE id=p_payable_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIN_ALLOCATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO prior FROM public.payable_allocation_versions WHERE payable_id=p_payable_id AND request_key=p_request_key;
 IF FOUND THEN
  IF prior.request_fingerprint<>fp THEN RAISE EXCEPTION 'FIN_ALLOCATION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('success',true,'id',prior.id,'version',prior.version,'replayed',true);
 END IF;
 IF a.status='CANCELED' THEN RAISE EXCEPTION 'FIN_ALLOCATION_CANCELED' USING ERRCODE='23514'; END IF;
 SELECT coalesce(max(version),0) INTO current_version FROM public.payable_allocation_versions WHERE payable_id=p_payable_id;
 IF current_version<>p_expected_version THEN RAISE EXCEPTION 'FIN_ALLOCATION_STALE' USING ERRCODE='23514'; END IF;
 IF sm<>a.total_amount THEN RAISE EXCEPTION 'FIN_ALLOCATION_SUM' USING ERRCODE='23514'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
  cc:=(line->>'cost_center_id')::uuid;
  SELECT name,code INTO nm,cd FROM public.financial_cost_centers WHERE id=cc AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FIN_ALLOCATION_CENTER_INACTIVE' USING ERRCODE='23514'; END IF;
  enriched:=enriched||jsonb_build_array(line||jsonb_build_object('cost_center_name',nm,'cost_center_code',cd));
 END LOOP;
 INSERT INTO public.payable_allocation_versions(payable_id,version,total_amount,allocations,reason,request_key,request_fingerprint,created_by)
 VALUES(p_payable_id,current_version+1,a.total_amount,enriched,btrim(p_reason),p_request_key,fp,u) RETURNING id INTO result_id;
 UPDATE public.accounts_payable SET cost_center_id=CASE WHEN jsonb_array_length(enriched)=1 THEN (enriched->0->>'cost_center_id')::uuid ELSE NULL END WHERE id=p_payable_id;
 INSERT INTO public.financial_audit_log(entity_type,entity_id,action,old_data,new_data,performed_by,reason)
 VALUES('accounts_payable',p_payable_id,'COST_ALLOCATION_VERSION_CREATED',jsonb_build_object('version',current_version,'cost_center_id',a.cost_center_id),jsonb_build_object('allocation_id',result_id,'version',current_version+1,'reason',btrim(p_reason),'allocations',enriched),u,btrim(p_reason));
 RETURN jsonb_build_object('success',true,'id',result_id,'version',current_version+1,'replayed',false);
END $function$;
CREATE OR REPLACE FUNCTION public.fiscal_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_allowed text[] := ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles',
    'customer_fiscal_profiles','fiscal_invoices','fiscal_invoice_items',
    'fiscal_events','fiscal_idempotency_keys',
    'fiscal_operation_policies','fiscal_tax_rules','fiscal_document_series',
    'fiscal_number_reservations','fiscal_rule_sod_overrides','fiscal_calculation_runs'
  ];
BEGIN
  IF NOT (TG_TABLE_NAME = ANY(v_allowed)) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_actor, public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(OLD)), public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_actor, public.mask_sensitive_jsonb(to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.fiscal_json_has_sensitive_key(p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  k text;
  v jsonb;
  item jsonb;
  sensitive constant text[] := ARRAY[
    'token','password','senha','secret','api_key','apikey',
    'private_key','privatekey','pfx','p12',
    'certificate_content','certificate_pem','pem',
    'authorization','bearer'
  ];
BEGIN
  IF p IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(p) = 'object' THEN
    FOR k, v IN SELECT key, value FROM jsonb_each(p) LOOP
      IF lower(k) = ANY (sensitive) THEN
        RETURN true;
      END IF;
      IF public.fiscal_json_has_sensitive_key(v) THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  ELSIF jsonb_typeof(p) = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p) LOOP
      IF public.fiscal_json_has_sensitive_key(item) THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  END IF;
  RETURN false;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fiscal_rtc_has_sensitive_key(payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  k text; v jsonb; needle text;
  needles text[] := ARRAY[
    'token','password','senha','secret','api_key','apikey',
    'private_key','privatekey','pfx','p12',
    'certificate','certificate_content','certificate_pem','pem',
    'authorization','bearer','access_token','refresh_token','client_secret',
    'production_enabled'];
BEGIN
  IF payload IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(payload) = 'object' THEN
    FOR k, v IN SELECT * FROM jsonb_each(payload) LOOP
      FOREACH needle IN ARRAY needles LOOP
        IF position(needle IN lower(k)) > 0 THEN RETURN true; END IF;
      END LOOP;
      IF public.fiscal_rtc_has_sensitive_key(v) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(payload) = 'array' THEN
    FOR v IN SELECT jsonb_array_elements(payload) LOOP
      IF public.fiscal_rtc_has_sensitive_key(v) THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END; $function$;
CREATE OR REPLACE FUNCTION public.fn_audit_category_dre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.dre_group,'') IS DISTINCT FROM COALESCE(NEW.dre_group,'') THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by)
    VALUES ('FINANCIAL_CATEGORY', NEW.id, 'FINANCIAL_CATEGORY_DRE_UPDATED',
            jsonb_build_object('dre_group', OLD.dre_group),
            jsonb_build_object('dre_group', NEW.dre_group),
            auth.uid());
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_authz_uid_scope_ok(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NULL
      OR (_uid IS NOT NULL AND _uid = auth.uid())
      OR public.has_role(auth.uid(), 'administrador'::app_role);
$function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(p_partner_id uuid, p_new_order_amount numeric DEFAULT 0, p_exclude_order_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit numeric(14,2); v_open numeric(14,2); v_overdue numeric(14,2);
  v_committed numeric(14,2); v_pending numeric(14,2);
  v_new numeric(14,2) := ROUND(COALESCE(p_new_order_amount,0),2);
  v_proj numeric(14,2); v_disp numeric(14,2); v_pct numeric(6,2);
  v_tolerance int; v_block boolean; v_action text; v_reason text;
BEGIN
  SELECT COALESCE(credit_limit,0), COALESCE(overdue_tolerance_days,0),
         COALESCE(block_if_overdue,false), COALESCE(credit_limit_action,'block')
    INTO v_limit, v_tolerance, v_block, v_action
  FROM public.partner_financial_settings WHERE partner_id = p_partner_id;
  v_limit := COALESCE(v_limit,0); v_tolerance := COALESCE(v_tolerance,0);
  v_block := COALESCE(v_block,false); v_action := COALESCE(v_action,'block');

  -- (a) recebiveis em aberto do parceiro
  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_open
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_overdue
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
    AND ari.due_date < (current_date - v_tolerance);

  -- (b) pedidos com compromisso financeiro real e SEM recebivel gerado
  SELECT COALESCE(SUM(ROUND(COALESCE(po.final_amount_with_interest, po.total, 0),2)),0)
    INTO v_committed
  FROM public.partner_orders po
  WHERE po.partner_id = p_partner_id
    AND po.status IN ('aprovado','em_producao','produzido','aguardando_entrega',
                      'confirmado','em_separacao','enviado','entregue')
    AND COALESCE(po.receivable_generated,false) = false
    AND NOT EXISTS (SELECT 1 FROM public.partner_order_financial_links pofl
                    WHERE pofl.partner_order_id = po.id)
    AND (p_exclude_order_id IS NULL OR po.id <> p_exclude_order_id);

  -- (c) H4-001: pedidos vivos ainda nao aprovados ja consomem limite.
  --     Sem isso, N pedidos em analise passavam individualmente no teste
  --     de credito e estouravam o limite ao serem aprovados.
  SELECT COALESCE(SUM(ROUND(COALESCE(po.final_amount_with_interest, po.total, 0),2)),0)
    INTO v_pending
  FROM public.partner_orders po
  WHERE po.partner_id = p_partner_id
    AND po.status IN ('pendente','solicitado','em_analise_comercial',
                      'aguardando_aprovacao_credito','aguardando_ajuste_comercial',
                      'aguardando_itens')
    AND COALESCE(po.receivable_generated,false) = false
    AND NOT EXISTS (SELECT 1 FROM public.partner_order_financial_links pofl
                    WHERE pofl.partner_order_id = po.id)
    AND (p_exclude_order_id IS NULL OR po.id <> p_exclude_order_id);

  v_proj := ROUND(v_open + v_committed + v_pending + v_new, 2);
  v_disp := GREATEST(v_limit - v_proj, 0);
  v_pct  := CASE WHEN v_limit > 0 THEN ROUND((v_proj / v_limit) * 100, 2) ELSE 0 END;

  v_reason := CASE
    WHEN v_block AND v_overdue > 0 THEN 'OVERDUE_BLOCK'
    WHEN v_limit <= 0 THEN 'NO_LIMIT_DEFINED'
    WHEN v_proj > v_limit AND v_action = 'approval_required' THEN 'LIMIT_EXCEEDED_APPROVAL'
    WHEN v_proj > v_limit THEN 'LIMIT_EXCEEDED_BLOCK'
    ELSE 'OK' END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'credit_limit', v_limit,
    'saldo_em_aberto', v_open,
    'saldo_vencido', v_overdue,
    'comprometido_nao_faturado', v_committed,
    'comprometido_pendente', v_pending,
    'novo_pedido', v_new,
    'exposicao_atual', ROUND(v_open + v_committed + v_pending, 2),
    'exposicao_projetada', v_proj,
    'credito_disponivel', v_disp,
    'percentual_utilizado', v_pct,
    'overdue_tolerance_days', v_tolerance,
    'block_if_overdue', v_block,
    'credit_limit_action', v_action,
    'tem_vencidos', v_overdue > 0,
    'reason_code', v_reason
  );
END $function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_guard_credit_approval_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.credit_approved_at IS DISTINCT FROM OLD.credit_approved_at)
     OR (NEW.credit_approved_by IS DISTINCT FROM OLD.credit_approved_by) THEN
    IF COALESCE(current_setting('arbio.b2b_credit_approval', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'credit_approval_fields_immutable: use approve_b2b_credit';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_guard_order_items_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid := COALESCE(NEW.order_id, OLD.order_id);
  v_status public.partner_order_status;
BEGIN
  SELECT status INTO v_status FROM public.partner_orders WHERE id = v_order_id;
  IF v_status IS NOT NULL AND public.fn_b2b_status_is_approved_or_later(v_status) THEN
    RAISE EXCEPTION 'order_items_immutable_after_approval: pedido em status %', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_order_billing_eligibility(p_partner_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_order record; v_terms record; v_quote int; v_noprice int; v_ap text; v_fin text;
BEGIN
  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_partner_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_NOT_FOUND'); END IF;

  IF v_order.status IN ('cancelado','reprovado','reprovado_sem_itens') THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_CANCELED_OR_REJECTED','status',v_order.status);
  END IF;
  IF v_order.status IN ('rascunho','pendente','solicitado','em_analise_comercial',
                        'aguardando_aprovacao_credito','aguardando_ajuste_comercial',
                        'aguardando_itens','aguardando_cotacao') THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_NOT_APPROVED','status',v_order.status);
  END IF;

  v_fin := COALESCE(v_order.financial_approval_status,'not_required');
  IF v_fin = 'pending' THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','FINANCIAL_APPROVAL_PENDING');
  END IF;
  IF v_fin = 'rejected' THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','FINANCIAL_APPROVAL_REJECTED');
  END IF;

  SELECT count(*) FILTER (WHERE COALESCE(pricing_mode_snapshot,'') = 'quote_only'),
         count(*) FILTER (WHERE COALESCE(preco_unitario_final_snapshot, preco_unitario, 0) <= 0)
    INTO v_quote, v_noprice
    FROM public.partner_order_items WHERE order_id = p_partner_order_id;
  IF COALESCE(v_quote,0) > 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','QUOTE_ONLY_ITEMS','count',v_quote);
  END IF;
  IF COALESCE(v_noprice,0) > 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ITEM_WITHOUT_FINAL_PRICE','count',v_noprice);
  END IF;

  -- H6C-001: condição canônica é a vinculada ao pedido; nunca "a mais recente".
  IF v_order.payment_terms_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.partner_order_payment_terms t
                WHERE t.partner_order_id = p_partner_order_id) THEN
      RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_LINKED');
    END IF;
    RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_DEFINED');
  END IF;

  SELECT * INTO v_terms FROM public.partner_order_payment_terms
   WHERE id = v_order.payment_terms_id AND partner_order_id = p_partner_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_INVALID',
                              'payment_terms_id', v_order.payment_terms_id);
  END IF;

  v_ap := COALESCE(v_terms.approval_status,'pending');
  IF NOT (v_ap = 'approved'
          OR (v_ap = 'not_required' AND v_fin = 'not_required'
              AND COALESCE(v_order.requires_financial_approval,false) = false)) THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_APPROVED',
                              'approval_status', v_ap, 'payment_terms_id', v_terms.id);
  END IF;

  IF COALESCE(v_terms.final_amount,0) <= 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','NO_FINAL_AMOUNT');
  END IF;

  RETURN jsonb_build_object('eligible',true,'reason_code','OK',
    'final_amount',v_terms.final_amount,'payment_terms_id',v_terms.id,
    'approval_status', v_ap, 'financial_approval_status', v_fin);
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_order_priceable(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(po.status::text <> 'aguardando_cotacao'
              AND COALESCE(po.payment_condition_status,'') <> 'quote_required'
              AND COALESCE(po.final_amount_with_interest, po.total, 0) > 0
              AND EXISTS (SELECT 1 FROM public.partner_order_payment_terms t
                          WHERE t.partner_order_id = po.id AND t.final_amount > 0)
              AND NOT EXISTS (SELECT 1 FROM public.partner_order_items i
                              WHERE i.order_id = po.id
                                AND COALESCE(i.pricing_mode_snapshot,'') = 'quote_only'), false)
  FROM public.partner_orders po WHERE po.id = p_order_id
$function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_plan_referenced(_plan_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.partner_orders WHERE payment_plan_id = _plan_id)
      OR EXISTS (SELECT 1 FROM public.partner_order_payment_terms WHERE payment_plan_id = _plan_id)
      OR EXISTS (SELECT 1 FROM public.commercial_price_rules WHERE plan_id = _plan_id);
$function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_plan_selectable(_plan_id uuid, _ref timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.commercial_payment_plans p
    WHERE p.id = _plan_id
      AND p.active = true
      AND p.superseded_by_id IS NULL
      AND p.valid_from <= _ref
      AND (p.valid_until IS NULL OR p.valid_until > _ref)
  );
$function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_status_is_approved_or_later(p_status partner_order_status)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_status = 'aprovado' OR public.fn_b2b_status_is_operational(p_status)
$function$;
CREATE OR REPLACE FUNCTION public.fn_b2b_status_is_operational(p_status partner_order_status)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_status IN (
    'em_producao','produzido','aguardando_entrega','confirmado',
    'em_separacao','enviado','entregue','faturado'
  )::boolean
$function$;
CREATE OR REPLACE FUNCTION public.fn_cc_can_prepare(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_uid IS NOT NULL AND (
    public.has_role(p_uid,'administrador'::app_role) OR
    public.has_role(p_uid,'financeiro'::app_role) OR
    public.has_role(p_uid,'gestor_comercial'::app_role));
$function$;
CREATE OR REPLACE FUNCTION public.fn_financial_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb; v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN v_old := to_jsonb(OLD);
  END IF;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES (TG_TABLE_NAME, COALESCE((NEW).id, (OLD).id), TG_OP, v_old, v_new, auth.uid());

  RETURN COALESCE(NEW, OLD);
END $function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_can_read_internal(_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _uid IS NOT NULL AND public.fn_authz_uid_scope_ok(_uid) AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role)
    OR public.has_role(_uid,'financeiro'::app_role));
$function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_cep_is_valid(_cep text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.fn_fiscal_digits(_cep) ~ '^[0-9]{8}$';
$function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_certificate_ref_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_certificate_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.certificate_ref IS NOT DISTINCT FROM OLD.certificate_ref THEN
    RETURN NEW;
  END IF;

  IF NULLIF(BTRIM(NEW.certificate_ref), '') IS NULL THEN
    NEW.certificate_ref := NULL;
    RETURN NEW;
  END IF;

  IF NEW.certificate_ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'certificate_ref_invalid' USING ERRCODE = '22023';
  END IF;

  v_certificate_id := NEW.certificate_ref::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.fiscal_certificates fc
    WHERE fc.id = v_certificate_id
      AND fc.company_settings_id = NEW.id
      AND fc.environment = 'HOMOLOGATION'
      AND fc.status = 'AVAILABLE'
      AND fc.is_active = true
      AND fc.valid_until > now()
  ) THEN
    RAISE EXCEPTION 'certificate_ref_not_active_homologation' USING ERRCODE = '22023';
  END IF;

  NEW.certificate_ref := v_certificate_id::text;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_cnpj_is_valid(_v text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  d text := public.fn_fiscal_digits(_v);
  w1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int := 0; i int; dv1 int; dv2 int;
BEGIN
  IF length(d) <> 14 THEN RETURN false; END IF;
  IF d ~ ('^(' || substr(d,1,1) || '){14}$') THEN RETURN false; END IF;
  FOR i IN 1..12 LOOP s := s + substr(d,i,1)::int * w1[i]; END LOOP;
  dv1 := s % 11; dv1 := CASE WHEN dv1 < 2 THEN 0 ELSE 11 - dv1 END;
  IF dv1 <> substr(d,13,1)::int THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..13 LOOP s := s + substr(d,i,1)::int * w2[i]; END LOOP;
  dv2 := s % 11; dv2 := CASE WHEN dv2 < 2 THEN 0 ELSE 11 - dv2 END;
  RETURN dv2 = substr(d,14,1)::int;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_digits(_v text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(coalesce(_v,''), '[^0-9]', '', 'g');
$function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_emitter_pendencies_row(r company_fiscal_settings)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE out jsonb := '[]'::jsonb; ie_state text;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = r.organization_id AND o.ativo IS TRUE
    ) THEN
      RAISE EXCEPTION 'H15_ORGANIZATION_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  ELSE
    PERFORM public.h15_require_staff();
    IF r.organization_id IS DISTINCT FROM public.h15_actor_organization() THEN
      RAISE EXCEPTION 'H15_COMPANY_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  END IF;

  IF NOT public.fn_fiscal_cnpj_is_valid(r.cnpj) THEN
    out := out || jsonb_build_object('code','EMITTER_CNPJ_INVALID','field','cnpj','severity','BLOCK','message','CNPJ ausente ou com digito verificador invalido.');
  END IF;
  IF nullif(btrim(coalesce(r.legal_name,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_LEGAL_NAME_MISSING','field','legal_name','severity','BLOCK','message','Razao social obrigatoria.');
  END IF;
  IF r.crt IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_CRT_MISSING','field','crt','severity','BLOCK','message','CRT (1,2,3,4) obrigatorio.');
  END IF;
  IF nullif(btrim(coalesce(r.primary_cnae,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_CNAE_MISSING','field','primary_cnae','severity','BLOCK','message','CNAE principal obrigatorio.');
  END IF;
  IF r.pis_cofins_regime IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_PIS_COFINS_REGIME_MISSING','field','pis_cofins_regime','severity','BLOCK','message','Regime de PIS/COFINS obrigatorio para calculo.');
  END IF;
  IF NOT public.fn_fiscal_cep_is_valid(r.postal_code) THEN
    out := out || jsonb_build_object('code','EMITTER_CEP_INVALID','field','postal_code','severity','BLOCK','message','CEP deve ter 8 digitos.');
  END IF;
  IF public.fn_fiscal_uf_ibge_code(r.state) IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_UF_INVALID','field','state','severity','BLOCK','message','UF invalida.');
  ELSIF NOT public.fn_fiscal_ibge_municipio_coerente(r.municipality_ibge_code, r.state) THEN
    out := out || jsonb_build_object('code','EMITTER_IBGE_INCOHERENT','field','municipality_ibge_code','severity','BLOCK','message','Codigo IBGE do municipio ausente ou incoerente com a UF.');
  END IF;
  IF nullif(btrim(coalesce(r.street,'')),'') IS NULL
     OR nullif(btrim(coalesce(r.number,'')),'') IS NULL
     OR nullif(btrim(coalesce(r.neighborhood,'')),'') IS NULL
     OR nullif(btrim(coalesce(r.city,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_ADDRESS_INCOMPLETE','field','address','severity','BLOCK','message','Endereco completo obrigatorio (logradouro, numero, bairro, municipio).');
  END IF;
  IF coalesce(r.country_code,'') NOT IN ('1058','BR') THEN
    out := out || jsonb_build_object('code','EMITTER_COUNTRY_MISSING','field','country_code','severity','BLOCK','message','Pais obrigatorio (1058 - Brasil).');
  END IF;
  ie_state := public.fn_fiscal_ie_check(r.state, r.state_registration);
  IF ie_state IN ('MISSING','INVALID_LENGTH','INVALID_DV','INVALID_FORMAT','INVALID_UF') THEN
    out := out || jsonb_build_object('code','EMITTER_IE_INVALID','field','state_registration','severity','BLOCK','message','Inscricao estadual invalida para a UF: '||ie_state);
  ELSIF ie_state = 'VALID_LENGTH_DV_NOT_IMPLEMENTED' THEN
    out := out || jsonb_build_object('code','EMITTER_IE_DV_NOT_IMPLEMENTED','field','state_registration','severity','WARN','message','IE com formato compativel; digito verificador desta UF nao e verificado automaticamente.');
  END IF;
  IF r.nfe_series_number IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_SERIES_MISSING','field','nfe_series_number','severity','BLOCK','message','Serie da NF-e (1-999) obrigatoria.');
  END IF;
  IF r.nfe_environment_code IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_ENVIRONMENT_MISSING','field','nfe_environment_code','severity','BLOCK','message','Ambiente tpAmb (2 homologacao / 1 producao) obrigatorio.');
  END IF;
  IF jsonb_array_length(r.uf_accreditations) = 0 THEN
    out := out || jsonb_build_object('code','EMITTER_ACCREDITATION_MISSING','field','uf_accreditations','severity','BLOCK','message','Credenciamento por UF nao registrado.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_certificates c
    WHERE c.id::text = r.certificate_ref AND c.company_settings_id = r.id
      AND c.environment = 'HOMOLOGATION' AND c.status = 'AVAILABLE'
      AND c.is_active IS TRUE AND c.revoked_at IS NULL
      AND c.valid_from <= now() AND c.valid_until > now()) THEN
    out := out || jsonb_build_object('code','EMITTER_CERTIFICATE_MISSING','field','certificate_ref','severity','BLOCK','message','Certificado ausente, indisponivel, revogado, vencido ou de outra empresa.');
  END IF;
  IF r.accounting_validated_at IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_ACCOUNTING_NOT_VALIDATED','field','accounting_validated_at','severity','BLOCK','message','Validacao contabil pendente.');
  END IF;
  IF coalesce(r.nfe_environment_code,'2') = '1' THEN
    out := out || jsonb_build_object('code','EMITTER_PRODUCTION_BLOCKED_F3','field','nfe_environment_code','severity','BLOCK',
      'message','Ambiente de producao (tpAmb=1) bloqueado na fase F3: teto e READY_HOMOLOGATION ate fluxo controlado de homologacao SEFAZ.');
  END IF;
  RETURN out;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_ibge_municipio_coerente(_cmun text, _uf text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.fn_fiscal_digits(_cmun) ~ '^[0-9]{7}$'
     AND public.fn_fiscal_uf_ibge_code(_uf) IS NOT NULL
     AND substr(public.fn_fiscal_digits(_cmun),1,2) = public.fn_fiscal_uf_ibge_code(_uf);
$function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_ie_check(_uf text, _ie text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uf text := upper(btrim(coalesce(_uf,'')));
  raw text := upper(btrim(coalesce(_ie,'')));
  d text; len int; s int := 0; i int; dv int; w int;
BEGIN
  IF raw = '' THEN RETURN 'MISSING'; END IF;
  IF raw IN ('ISENTO','ISENTA') THEN RETURN 'ISENTO'; END IF;
  IF public.fn_fiscal_uf_ibge_code(uf) IS NULL THEN RETURN 'INVALID_UF'; END IF;
  d := public.fn_fiscal_digits(raw);
  len := length(d);

  IF (uf = 'AC' AND len <> 13)
  OR (uf = 'AL' AND len <> 9) OR (uf = 'AM' AND len <> 9)
  OR (uf = 'AP' AND len <> 9) OR (uf = 'BA' AND len NOT IN (8,9))
  OR (uf = 'CE' AND len <> 9) OR (uf = 'DF' AND len <> 13)
  OR (uf = 'ES' AND len <> 9) OR (uf = 'GO' AND len <> 9)
  OR (uf = 'MA' AND len <> 9) OR (uf = 'MG' AND len <> 13)
  OR (uf = 'MS' AND len <> 9) OR (uf = 'MT' AND len <> 11)
  OR (uf = 'PA' AND len <> 9) OR (uf = 'PB' AND len <> 9)
  OR (uf = 'PE' AND len NOT IN (9,14)) OR (uf = 'PI' AND len <> 9)
  OR (uf = 'PR' AND len <> 10) OR (uf = 'RJ' AND len <> 8)
  OR (uf = 'RN' AND len NOT IN (9,10)) OR (uf = 'RO' AND len <> 14)
  OR (uf = 'RR' AND len <> 9) OR (uf = 'RS' AND len <> 10)
  OR (uf = 'SC' AND len <> 9) OR (uf = 'SE' AND len <> 9)
  OR (uf = 'SP' AND len NOT IN (12,13)) OR (uf = 'TO' AND len <> 9)
  THEN
    RETURN 'INVALID_LENGTH';
  END IF;

  -- Dígito verificador: subconjunto com algoritmo público e estável.
  IF uf = 'GO' THEN
    IF substr(d,1,2) NOT IN ('10','11','15') THEN RETURN 'INVALID_FORMAT'; END IF;
    s := 0;
    FOR i IN 1..8 LOOP s := s + substr(d,i,1)::int * (10 - i); END LOOP;
    dv := s % 11;
    dv := CASE WHEN dv = 0 THEN 0 WHEN dv = 1 THEN 1 ELSE 11 - dv END;
    RETURN CASE WHEN dv = substr(d,9,1)::int THEN 'VALID_DV' ELSE 'INVALID_DV' END;
  ELSIF uf = 'RJ' THEN
    s := 0; w := 2;
    FOR i IN 1..7 LOOP
      s := s + substr(d,i,1)::int * w;
      w := CASE WHEN w = 7 THEN 2 ELSE w + 1 END;
    END LOOP;
    dv := 11 - (s % 11); IF dv >= 10 THEN dv := 0; END IF;
    RETURN CASE WHEN dv = substr(d,8,1)::int THEN 'VALID_DV' ELSE 'INVALID_DV' END;
  ELSIF uf = 'SC' THEN
    s := 0;
    FOR i IN 1..8 LOOP s := s + substr(d,i,1)::int * (10 - i); END LOOP;
    dv := 11 - (s % 11); IF dv >= 10 THEN dv := 0; END IF;
    RETURN CASE WHEN dv = substr(d,9,1)::int THEN 'VALID_DV' ELSE 'INVALID_DV' END;
  END IF;

  RETURN 'VALID_LENGTH_DV_NOT_IMPLEMENTED';
END $function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_requirement_resolve(p_sales_channel text, p_operation_type text, p_uf text, p_scope_type text DEFAULT NULL::text, p_scope_id uuid DEFAULT NULL::uuid, p_ref_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ex record; v_pol record;
BEGIN
  IF p_scope_type IS NOT NULL AND p_scope_id IS NOT NULL THEN
    SELECT * INTO v_ex FROM public.fiscal_requirement_exemptions
     WHERE active AND scope_type = p_scope_type AND scope_id = p_scope_id LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('required', false, 'status','EXEMPT', 'source','exemption',
        'exemption_id', v_ex.id, 'motivo', v_ex.motivo, 'approved_by', v_ex.approved_by);
    END IF;
  END IF;

  SELECT * INTO v_pol FROM public.fiscal_operation_policies
   WHERE active AND sales_channel = p_sales_channel AND operation_type = p_operation_type
     AND (uf IS NULL OR uf = p_uf)
     AND valid_from <= p_ref_date AND (valid_until IS NULL OR valid_until >= p_ref_date)
   ORDER BY (uf IS NOT NULL) DESC, valid_from DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('required', v_pol.requires_invoice,
      'status', CASE WHEN v_pol.requires_invoice THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
      'source','policy','policy_id', v_pol.id, 'document_model', v_pol.document_model);
  END IF;

  -- Fail-closed: nunca assume NOT_REQUIRED em silêncio
  RETURN jsonb_build_object('required', true, 'status','PENDING_PARAMETRIZATION',
    'source','pending_parametrization', 'policy_id', NULL,
    'motivo','Nenhuma política fiscal cadastrada para o canal/operação/UF — parametrização contábil pendente');
END $function$;
CREATE OR REPLACE FUNCTION public.fn_fiscal_uf_ibge_code(_uf text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE upper(btrim(coalesce(_uf,'')))
    WHEN 'RO' THEN '11' WHEN 'AC' THEN '12' WHEN 'AM' THEN '13' WHEN 'RR' THEN '14'
    WHEN 'PA' THEN '15' WHEN 'AP' THEN '16' WHEN 'TO' THEN '17' WHEN 'MA' THEN '21'
    WHEN 'PI' THEN '22' WHEN 'CE' THEN '23' WHEN 'RN' THEN '24' WHEN 'PB' THEN '25'
    WHEN 'PE' THEN '26' WHEN 'AL' THEN '27' WHEN 'SE' THEN '28' WHEN 'BA' THEN '29'
    WHEN 'MG' THEN '31' WHEN 'ES' THEN '32' WHEN 'RJ' THEN '33' WHEN 'SP' THEN '35'
    WHEN 'PR' THEN '41' WHEN 'SC' THEN '42' WHEN 'RS' THEN '43' WHEN 'MS' THEN '50'
    WHEN 'MT' THEN '51' WHEN 'GO' THEN '52' WHEN 'DF' THEN '53'
    ELSE NULL END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_generate_payable_installments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i int;
  v_qtd int := NEW.installment_count;
  v_base numeric(14,2) := ROUND(NEW.total_amount / v_qtd, 2);
  v_acc numeric(14,2) := 0;
  v_amt numeric(14,2);
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE='23514';
  END IF;
  FOR i IN 1..v_qtd LOOP
    IF i < v_qtd THEN
      v_amt := v_base;
      v_acc := v_acc + v_amt;
    ELSE
      v_amt := NEW.total_amount - v_acc;
    END IF;
    INSERT INTO public.accounts_payable_installments
      (organization_id, payable_id, installment_number, due_date, original_amount, net_amount, status)
    VALUES
      (NEW.organization_id, NEW.id, i, (NEW.first_due_date + ((i-1) || ' months')::interval)::date, v_amt, v_amt, 'OPEN');
  END LOOP;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_generate_receivable_installments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i int;
  v_qtd int := NEW.installment_count;
  v_base numeric(14,2) := ROUND(NEW.total_amount / v_qtd, 2);
  v_acc numeric(14,2) := 0;
  v_amt numeric(14,2);
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  FOR i IN 1..v_qtd LOOP
    IF i < v_qtd THEN
      v_amt := v_base;
      v_acc := v_acc + v_amt;
    ELSE
      v_amt := NEW.total_amount - v_acc;
    END IF;
    INSERT INTO public.accounts_receivable_installments
      (receivable_id, installment_number, due_date, original_amount, net_amount, status, organization_id)
    VALUES
      (NEW.id, i, (NEW.first_due_date + ((i-1) || ' months')::interval)::date, v_amt, v_amt, 'OPEN', NEW.organization_id);
  END LOOP;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_h6_guard_ap_installment_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payable_id IS DISTINCT FROM OLD.payable_id
     OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
     OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Parcela imutavel: titulo, numero, valor original, vencimento, valor liquido e data de criacao nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_h6_guard_ar_installment_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.receivable_id IS DISTINCT FROM OLD.receivable_id
     OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
     OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Parcela imutavel: titulo, numero, valor original, vencimento, valor liquido e data de criacao nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_h6_guard_title_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.installment_count IS DISTINCT FROM OLD.installment_count
     OR NEW.origin_type IS DISTINCT FROM OLD.origin_type
     OR NEW.origin_id IS DISTINCT FROM OLD.origin_id
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.first_due_date IS DISTINCT FROM OLD.first_due_date
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Snapshot financeiro imutavel: valor, parcelas, origem e datas de emissao nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;

  IF TG_TABLE_NAME = 'accounts_receivable'
     AND (to_jsonb(NEW)->>'payment_method_id') IS DISTINCT FROM (to_jsonb(OLD)->>'payment_method_id') THEN
    RAISE EXCEPTION 'Condicao/metodo do titulo e imutavel apos a criacao: use o metodo na baixa (receivable_payments).'
      USING ERRCODE='check_violation';
  END IF;

  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_h6_payments_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.fn_h6d_hard_delete_allowed() THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Baixa financeira nao pode ser excluida: use estorno (fn_reverse_payment).'
      USING ERRCODE='check_violation';
  END IF;
  RAISE EXCEPTION 'Baixa financeira e imutavel: use estorno (fn_reverse_payment).'
    USING ERRCODE='check_violation';
END $function$;
CREATE OR REPLACE FUNCTION public.fn_h6c_set_canonical_payment_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.partner_orders
     SET payment_terms_id = NEW.id
   WHERE id = NEW.partner_order_id
     AND payment_terms_id IS NULL;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_h6d_block_hard_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.fn_h6d_hard_delete_allowed() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Registro financeiro (%) nao pode ser excluido: cancele pelo fluxo formal (rpc_cancel_accounts_receivable / rpc_cancel_accounts_payable).', TG_TABLE_NAME
    USING ERRCODE='check_violation';
END $function$;
CREATE OR REPLACE FUNCTION public.fn_h6d_hard_delete_allowed()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN current_user IN ('postgres', 'supabase_admin')
     AND COALESCE(current_setting('arbio.allow_financial_hard_delete', true), 'off') = 'on';
END $function$;
CREATE OR REPLACE FUNCTION public.fn_recalc_receivable_installment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.accounts_receivable_installments%ROWTYPE;
  v_total_recebido numeric(14,2);
  v_total_desc numeric(14,2);
  v_total_juros numeric(14,2);
  v_total_multa numeric(14,2);
  v_status text;
  v_inst_id uuid := COALESCE(NEW.installment_id, OLD.installment_id);
  v_parent_id uuid;
  v_open int;
  v_partial int;
  v_paid int;
  v_canc int;
  v_total int;
BEGIN
  SELECT * INTO v_inst FROM public.accounts_receivable_installments WHERE id = v_inst_id;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(amount_received),0), COALESCE(SUM(discount_amount),0),
         COALESCE(SUM(interest_amount),0), COALESCE(SUM(penalty_amount),0)
    INTO v_total_recebido, v_total_desc, v_total_juros, v_total_multa
    FROM public.receivable_payments WHERE installment_id = v_inst_id;

  IF (v_total_recebido + v_total_desc) >= (v_inst.original_amount + v_total_juros + v_total_multa) THEN
    v_status := 'PAID';
  ELSIF v_total_recebido > 0 THEN
    v_status := 'PARTIAL';
  ELSE
    v_status := CASE WHEN v_inst.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'OVERDUE' ELSE 'OPEN' END;
  END IF;

  UPDATE public.accounts_receivable_installments
    SET received_amount = v_total_recebido,
        discount_amount = v_total_desc,
        interest_amount = v_total_juros,
        penalty_amount = v_total_multa,
        status = v_status,
        paid_at = CASE WHEN v_status = 'PAID' THEN now() ELSE NULL END
    WHERE id = v_inst_id;

  -- Recalcular pai
  v_parent_id := v_inst.receivable_id;
  SELECT count(*) FILTER (WHERE status='OPEN'),
         count(*) FILTER (WHERE status='PARTIAL'),
         count(*) FILTER (WHERE status='PAID'),
         count(*) FILTER (WHERE status='CANCELED'),
         count(*)
    INTO v_open, v_partial, v_paid, v_canc, v_total
    FROM public.accounts_receivable_installments WHERE receivable_id = v_parent_id;

  UPDATE public.accounts_receivable SET status = CASE
    WHEN v_canc = v_total THEN 'CANCELED'
    WHEN (v_paid + v_canc) = v_total AND v_paid > 0 THEN 'PAID'
    WHEN v_paid > 0 OR v_partial > 0 THEN 'PARTIAL'
    WHEN EXISTS (SELECT 1 FROM public.accounts_receivable_installments WHERE receivable_id = v_parent_id AND status='OVERDUE') THEN 'OVERDUE'
    ELSE 'OPEN'
  END WHERE id = v_parent_id AND status <> 'CANCELED';

  RETURN COALESCE(NEW, OLD);
END $function$;
CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_partner_order_id AND internal_origin_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;

  IF auth.uid() IS NULL THEN
    IF pg_trigger_depth()=0 THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;
  ELSIF NOT public.b2b_phase1_order_visible(p_partner_order_id) THEN RAISE EXCEPTION 'b2b_phase1_scope_denied' USING ERRCODE='42501'; END IF;
  IF NOT (pg_trigger_depth() > 0 or public.has_role(auth.uid(), 'administrador'::public.app_role)
      or public.has_role(auth.uid(), 'gestor'::public.app_role)
      or public.has_role(auth.uid(), 'financeiro'::public.app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_partner_order_id IS NULL THEN
    RAISE EXCEPTION 'partner_order_id_required' USING ERRCODE='P0001';
  END IF;

  -- Serializa concorrencia real (clique duplo / chamadas simultaneas).
  -- Chave unica bigint: assinatura pg_advisory_xact_lock(bigint).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('b2b_receivable:' || p_partner_order_id::text, 0)
  );

  IF NOT public.fn_b2b_order_priceable(p_partner_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required' USING ERRCODE='P0001';
  END IF;

  RETURN public.generate_b2b_receivable_secure_impl(p_partner_order_id);
END $function$;
CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure_impl(p_partner_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_partner record;
  v_settings record;
  v_terms record;
  v_receivable_id uuid;
  v_category_id uuid;
  v_payment_method_id uuid;
  v_existing uuid;
  v_sch record;
  v_ari_id uuid;
  v_installments_json jsonb := '[]'::jsonb;
  v_system_call boolean := (v_uid IS NULL);
  v_gate jsonb;
  v_fiscal jsonb;
  v_uf text;
  v_org uuid;
  v_org_count integer; -- b2b_f1_financial_tenant
BEGIN
  IF NOT v_system_call THEN
    IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'financeiro') OR has_role(v_uid,'gestor') OR has_role(v_uid,'gestor_comercial')) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, usuario_id, acao, dados_novos)
        VALUES (p_partner_order_id, v_uid, 'financeiro_permissao_negada', jsonb_build_object('motivo','sem permissão'));
      RAISE EXCEPTION 'Sem permissão para gerar cobrança B2B';
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_partner_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  -- Deterministic partner ownership, never caller-supplied organization.
  SELECT count(*), min(o.id::text)::uuid INTO v_org_count,v_org
    FROM public.organizations o WHERE o.partner_account_id=v_order.partner_id;
  IF v_org_count <> 1 OR v_org IS NULL THEN
    RAISE EXCEPTION 'B2B_FINANCIAL_TENANT_AMBIGUOUS' USING ERRCODE='42501';
  END IF;
  IF v_uid IS NOT NULL THEN
    PERFORM platform_private.assert_b2b_partner_scope(v_uid,v_order.partner_id);
    IF NOT public.is_platform_superadmin(v_uid) AND public.h15_actor_organization() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'B2B_FINANCIAL_TENANT_MISMATCH' USING ERRCODE='42501';
    END IF;
  END IF;

  -- GATE Fase C: elegibilidade server-side
  v_gate := public.fn_b2b_order_billing_eligibility(p_partner_order_id);
  IF NOT (v_gate->>'eligible')::boolean THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (p_partner_order_id, v_order.partner_id, v_uid, 'financeiro_bloqueado_gate', v_gate);
    RAISE EXCEPTION 'billing_not_eligible:%', v_gate->>'reason_code';
  END IF;

  -- H6C-001: condicao canonica vinculada ao pedido (nunca a mais recente).
  SELECT * INTO v_terms FROM public.partner_order_payment_terms
    WHERE id = NULLIF(v_gate->>'payment_terms_id','')::uuid
      AND partner_order_id = p_partner_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_terms_not_canonical'; END IF;

  SELECT receivable_id INTO v_existing FROM public.partner_order_financial_links WHERE partner_order_id = p_partner_order_id;
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (p_partner_order_id, v_order.partner_id, v_uid, 'financeiro_duplicidade_bloqueada', jsonb_build_object('receivable_id', v_existing));
    RETURN jsonb_build_object('receivable_id', v_existing, 'partner_order_id', p_partner_order_id, 'duplicado', true);
  END IF;

  SELECT * INTO v_partner FROM public.partner_accounts WHERE id = v_order.partner_id;
  SELECT * INTO v_settings FROM public.partner_financial_settings WHERE partner_id = v_order.partner_id;
  IF NOT FOUND THEN
    INSERT INTO public.partner_financial_settings(partner_id) VALUES (v_order.partner_id) RETURNING * INTO v_settings;
  END IF;

  v_uf := to_jsonb(v_partner) ->> 'uf';

  -- Derivação fiscal (fail-closed; nunca NOT_REQUIRED silencioso)
  v_fiscal := public.fn_fiscal_requirement_resolve(
    'b2b_partner', 'venda_mercadoria', v_uf, 'partner_order', p_partner_order_id, CURRENT_DATE);

  SELECT id INTO v_category_id FROM public.financial_categories
   WHERE upper(COALESCE(type::text,'')) IN ('RECEITA','INCOME') AND COALESCE(active,true) = true
   ORDER BY created_at ASC LIMIT 1;
  IF v_category_id IS NULL THEN
    SELECT id INTO v_category_id FROM public.financial_categories ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma categoria financeira cadastrada — cadastre uma categoria de receita antes de gerar cobranças B2B';
  END IF;

  SELECT id INTO v_payment_method_id FROM public.payment_methods
   WHERE lower(name) = lower(COALESCE(v_settings.default_payment_method,'pix')) LIMIT 1;

  INSERT INTO public.accounts_receivable(
    organization_id, origin_type, origin_id, customer_id, partner_id, description,
    category_id, total_amount, issue_date, first_due_date, installment_count,
    status, fiscal_invoice_required, fiscal_invoice_status,
    fiscal_requirement_source, fiscal_policy_id, fiscal_exemption_id,
    payment_method_id, notes, created_by
  ) VALUES (
    v_org, 'B2B_ORDER', p_partner_order_id,
    NULLIF(v_partner.client_id, NULL), v_order.partner_id,
    format('Pedido B2B %s - %s', v_order.numero, COALESCE(v_partner.nome_fantasia, v_partner.razao_social)),
    v_category_id, v_terms.final_amount, CURRENT_DATE, v_terms.first_due_date, v_terms.installment_count,
    'OPEN',
    (v_fiscal->>'required')::boolean,
    v_fiscal->>'status',
    v_fiscal->>'source',
    NULLIF(v_fiscal->>'policy_id','')::uuid,
    NULLIF(v_fiscal->>'exemption_id','')::uuid,
    v_payment_method_id,
    format(E'Condição: %s (%s)\nDesconto: %s%%  Juros: %s%% a.m. x %s meses\nTabela: %s  Líquido: %s  Final: %s\nFiscal: %s (%s)',
           v_terms.plan_name_snapshot, v_terms.plan_code_snapshot,
           v_terms.discount_percent_snapshot, v_terms.monthly_interest_percent_snapshot, v_terms.months_count_snapshot,
           v_terms.table_amount, v_terms.net_amount_after_discount, v_terms.final_amount,
           v_fiscal->>'status', v_fiscal->>'source'),
    COALESCE(v_uid, v_order.created_by)
  ) RETURNING id INTO v_receivable_id;

  -- b2b_f1_fresh_title: no deletion; formal financial history protection preserved.

  FOR v_sch IN
    SELECT * FROM public.partner_order_payment_schedule
     WHERE partner_order_id = p_partner_order_id AND payment_terms_id = v_terms.id
     ORDER BY installment_number
  LOOP
    -- b2b_f1_reuse_installments: generic title trigger already created them.
    IF (SELECT count(*) FROM public.accounts_receivable_installments
         WHERE receivable_id=v_receivable_id AND installment_number=v_sch.installment_number
           AND organization_id=v_org) <> 1 THEN
      RAISE EXCEPTION 'B2B_INSTALLMENT_CARDINALITY_INVALID' USING ERRCODE='23514';
    END IF;
    UPDATE public.accounts_receivable_installments
       SET due_date=v_sch.due_date, original_amount=v_sch.amount,
           interest_amount=COALESCE(v_sch.interest_amount,0), net_amount=v_sch.amount
     WHERE receivable_id=v_receivable_id AND installment_number=v_sch.installment_number
       AND organization_id=v_org
     RETURNING id INTO v_ari_id;

    UPDATE public.partner_order_payment_schedule
       SET status = 'generated', receivable_installment_id = v_ari_id
     WHERE id = v_sch.id;

    v_installments_json := v_installments_json || jsonb_build_array(jsonb_build_object(
      'installment_number', v_sch.installment_number,
      'due_date', v_sch.due_date,
      'amount', v_sch.amount
    ));
  END LOOP;

  INSERT INTO public.partner_order_financial_links(
    partner_order_id, partner_id, receivable_id, financial_status, billing_trigger, created_by
  ) VALUES (
    p_partner_order_id, v_order.partner_id, v_receivable_id, 'gerado', v_settings.billing_trigger, v_uid
  );

  UPDATE public.partner_orders SET
    financial_status = 'gerado',
    receivable_generated = true,
    receivable_generated_at = now(),
    receivable_generated_by = v_uid,
    payment_due_date = v_terms.first_due_date,
    payment_method = COALESCE(v_settings.default_payment_method,'pix')
  WHERE id = p_partner_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (p_partner_order_id, v_order.partner_id, v_uid, 'financeiro_gerado_com_plano',
    jsonb_build_object(
      'receivable_id', v_receivable_id,
      'plan_code', v_terms.plan_code_snapshot,
      'plan_name', v_terms.plan_name_snapshot,
      'table_amount', v_terms.table_amount,
      'discount_amount', v_terms.discount_amount,
      'net_amount', v_terms.net_amount_after_discount,
      'interest_amount', v_terms.financial_interest_amount,
      'final_amount', v_terms.final_amount,
      'first_due_date', v_terms.first_due_date,
      'installment_count', v_terms.installment_count,
      'fiscal', v_fiscal,
      'gate', v_gate,
      'installments', v_installments_json
    ));

  RETURN jsonb_build_object(
    'receivable_id', v_receivable_id,
    'partner_order_id', p_partner_order_id,
    'valor', v_terms.final_amount,
    'vencimento', v_terms.first_due_date,
    'installment_count', v_terms.installment_count,
    'fiscal_invoice_required', (v_fiscal->>'required')::boolean,
    'fiscal_invoice_status', v_fiscal->>'status',
    'fiscal_requirement_source', v_fiscal->>'source',
    'status', 'OPEN'
  );
END 
$function$;
CREATE OR REPLACE FUNCTION public.get_b2b_user_role_for_partner(p_user_id uuid, p_partner_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.is_valid_b2b_partner_user(p_user_id, p_partner_id) THEN
      (SELECT CASE pu.papel
                WHEN 'tecnico' THEN 'parceiro_b2b_tecnico'
                ELSE 'parceiro_b2b'
              END
         FROM public.partner_users pu
        WHERE pu.user_id = p_user_id
          AND pu.partner_id = p_partner_id
          AND pu.revoked_at IS NULL)
    ELSE NULL
  END;
$function$;
CREATE OR REPLACE FUNCTION public.get_cliente_ids_for_user(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.fn_authz_uid_scope_ok(_user_id) THEN ARRAY(
    SELECT uc.cliente_id
      FROM public.user_clientes uc
     WHERE uc.user_id = _user_id
       AND uc.is_active = true
       AND uc.revoked_at IS NULL
       AND (uc.valid_from IS NULL OR uc.valid_from <= now())
       AND (uc.valid_until IS NULL OR uc.valid_until >= now())
    UNION
    SELECT pr.cliente_id
      FROM public.profiles pr
     WHERE pr.user_id = _user_id
       AND pr.cliente_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.user_clientes uc2
          WHERE uc2.user_id = pr.user_id
            AND uc2.cliente_id = pr.cliente_id
            AND uc2.is_active = true
            AND uc2.revoked_at IS NULL
            AND (uc2.valid_from IS NULL OR uc2.valid_from <= now())
            AND (uc2.valid_until IS NULL OR uc2.valid_until >= now())
       )
  ) ELSE ARRAY[]::uuid[] END;
$function$;
CREATE OR REPLACE FUNCTION public.get_my_available_portal_contexts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); org uuid; management boolean:=false; tech boolean:=false; partner boolean:=false; scopes record; contexts text[]:=ARRAY[]::text[]; pref text; last_ctx text; skip boolean:=false; def text;
BEGIN
 IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u) THEN
  RETURN jsonb_build_object('available_contexts',contexts,'default_context',NULL,'must_select_context',false,'has_b2b_access',false,'has_technical_access',false,'is_admin',false,'preferred_context',NULL,'skip_context_selector',false);
 END IF;
 org:=public.h15_actor_organization();
 IF org IS NULL THEN RETURN jsonb_build_object('available_contexts',contexts,'default_context',NULL,'must_select_context',false,'has_b2b_access',false,'has_technical_access',false,'is_admin',false,'preferred_context',NULL,'skip_context_selector',false); END IF;
 SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u AND r.role IN ('administrador','gestor')),
 EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u AND r.role IN ('tecnico_agronomo','consultor_tecnico','aplicador')) INTO management,tech;
 partner:=platform_private.b2b_commercial_context() IS NOT NULL;
 IF management THEN contexts:=array_append(contexts,'admin'); END IF;
 IF partner THEN contexts:=array_append(contexts,'b2b'); END IF;
 IF tech THEN contexts:=array_append(contexts,'technical'); END IF;
 SELECT preferred_context,last_context,skip_context_selector INTO pref,last_ctx,skip FROM public.user_access_preferences WHERE user_id=u;
 IF pref IS NOT NULL AND pref=ANY(contexts) THEN def:=pref;
 ELSIF last_ctx IS NOT NULL AND last_ctx=ANY(contexts) THEN def:=last_ctx;
 ELSIF cardinality(contexts)=1 THEN def:=contexts[1]; END IF;
 IF pref IS NULL OR NOT(pref=ANY(contexts)) THEN pref:=NULL; skip:=false; END IF;
 RETURN jsonb_build_object('available_contexts',contexts,'default_context',def,'must_select_context',cardinality(contexts)>1 AND NOT COALESCE(skip,false),
 'has_b2b_access',management OR partner,'has_technical_access',management OR tech,'is_admin',management,
 'preferred_context',pref,'skip_context_selector',COALESCE(skip,false));
END $function$;
CREATE OR REPLACE FUNCTION public.get_user_partner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN count(*) FILTER (WHERE pu.revoked_at IS NULL) <> 1 THEN NULL
           WHEN bool_or(pa.ativo IS TRUE AND pa.deleted_at IS NULL
                        AND pa.commercial_owner_organization_id IS NOT NULL
                        AND pu.tenant_id IS NOT NULL
                        AND pu.tenant_id = pa.commercial_owner_organization_id)
                FILTER (WHERE pu.revoked_at IS NULL)
           THEN (array_agg(pu.partner_id) FILTER (WHERE pu.revoked_at IS NULL))[1]
         END
  FROM public.partner_users pu
  LEFT JOIN public.partner_accounts pa ON pa.id = pu.partner_id
  WHERE pu.user_id = auth.uid();
$function$;
CREATE OR REPLACE FUNCTION public.guard_commercial_partner_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_owner uuid;
BEGIN
 v_org := public.h15_actor_organization();
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT (public.has_role(auth.uid(),'administrador'::public.app_role) OR public.has_role(auth.uid(),'gestor_comercial'::public.app_role)) THEN RAISE EXCEPTION 'cadastro_context_required' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.commercial_owner_organization_id IS NOT NULL AND NEW.commercial_owner_organization_id IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'cadastro_owner_denied' USING ERRCODE='42501'; END IF;
  NEW.commercial_owner_organization_id:=v_org;
  NEW.created_by:=auth.uid(); NEW.codigo:='PARC-'||NEW.id::text;
 ELSE
  v_owner:=OLD.commercial_owner_organization_id;
  IF v_owner IS NULL THEN SELECT c.organization_id INTO v_owner FROM public.clientes c WHERE c.id=OLD.client_id; END IF;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'cadastro_owner_denied' USING ERRCODE='42501'; END IF;
  IF NEW.commercial_owner_organization_id IS DISTINCT FROM OLD.commercial_owner_organization_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.id IS DISTINCT FROM OLD.id OR NEW.codigo IS DISTINCT FROM OLD.codigo THEN RAISE EXCEPTION 'cadastro_identity_immutable' USING ERRCODE='42501'; END IF;
  -- Individual edit with proven OLD client ownership, never a bulk legacy backfill.
  NEW.commercial_owner_organization_id:=v_owner;
 END IF;
 IF NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=NEW.client_id AND c.organization_id=v_org) THEN RAISE EXCEPTION 'cadastro_client_scope_required' USING ERRCODE='42501'; END IF;
 IF NEW.consultor_responsavel IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.consultor_responsavel AND p.ativo IS TRUE AND p.organization_id=v_org) THEN RAISE EXCEPTION 'cadastro_consultant_scope_denied' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(NEW.razao_social,'')))<2 OR length(NEW.razao_social)>200 THEN RAISE EXCEPTION 'cadastro_invalid_name' USING ERRCODE='22023'; END IF;
 IF NEW.desconto_padrao IS NULL OR NEW.desconto_padrao::text IN ('NaN','Infinity','-Infinity') OR NEW.desconto_padrao<0 OR NEW.desconto_padrao>100
 OR (NEW.comissao_percentual IS NOT NULL AND (NEW.comissao_percentual::text IN ('NaN','Infinity','-Infinity') OR NEW.comissao_percentual<0 OR NEW.comissao_percentual>100))
 OR (NEW.limite_credito_brl IS NOT NULL AND (NEW.limite_credito_brl::text IN ('NaN','Infinity','-Infinity') OR NEW.limite_credito_brl<0))
 OR (NEW.meta_mensal_brl IS NOT NULL AND (NEW.meta_mensal_brl::text IN ('NaN','Infinity','-Infinity') OR NEW.meta_mensal_brl<0)) OR NEW.prazo_pagamento_padrao_dias<0 THEN RAISE EXCEPTION 'cadastro_invalid_commercial_values' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.guard_financial_category_platform_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'superadmin'::public.app_role) THEN
  RAISE EXCEPTION 'FINANCIAL_CATEGORY_PLATFORM_WRITE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_profile_senha_provisoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.senha_provisoria IS TRUE THEN
      RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria THEN
    RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.guard_profile_senha_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF session_user = 'authenticator'
     AND OLD.senha_provisoria IS TRUE AND NEW.senha_provisoria IS DISTINCT FROM TRUE
     AND NOT platform_private.has_ticket('pwd_conclude', NEW.user_id) THEN
    RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING errcode='42501';
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF; IF public.has_role(auth.uid(),'administrador'::public.app_role) THEN RETURN NEW; END IF; IF TG_OP='INSERT' THEN IF NEW.ativo IS DISTINCT FROM true OR NEW.cliente_id IS NOT NULL OR NEW.organization_id IS NOT NULL OR NEW.data_admissao IS NOT NULL OR NEW.observacoes_internas IS NOT NULL THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF; ELSE IF OLD.ativo IS NOT TRUE OR ROW(NEW.id,NEW.user_id,NEW.email,NEW.ativo,NEW.cliente_id,NEW.organization_id,NEW.created_at,NEW.data_admissao,NEW.observacoes_internas) IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.email,OLD.ativo,OLD.cliente_id,OLD.organization_id,OLD.created_at,OLD.data_admissao,OLD.observacoes_internas) THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF; END IF; RETURN NEW; END; $function$;
CREATE OR REPLACE FUNCTION public.guard_profile_tenant_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() = OLD.user_id AND NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_superadmin_role_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_touches boolean := false;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.role = 'superadmin'::public.app_role THEN
    v_touches := true;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.role = 'superadmin'::public.app_role THEN
    v_touches := true;
  END IF;

  IF v_touches AND current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'superadmin_role_reserved'
      USING ERRCODE = '42501',
            HINT = 'O papel de plataforma so pode ser atribuido ou removido pelo mecanismo interno.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_tenant_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  v_org := public.h15_actor_organization();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'tenant_context_required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.organization_id IS NULL THEN
    NEW.organization_id := v_org;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'tenant_scope_violation' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'tenant_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.h15_actor_organization(); $function$;
CREATE OR REPLACE FUNCTION public.h15_company_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'H15_COMPANY_ORGANIZATION_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' AND NEW.organization_id IS DISTINCT FROM public.h15_actor_organization() THEN RAISE EXCEPTION 'H15_COMPANY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.h15_profile_organization_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF current_setting('role',true) IN ('authenticated','anon') THEN
 IF TG_OP='INSERT' THEN
 IF NEW.organization_id IS NOT NULL THEN RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
 RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501';
 END IF;
 END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.h15_require_staff()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF public.h15_actor_organization() IS NULL THEN RAISE EXCEPTION 'H15_ORGANIZATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT coalesce((public.has_role(auth.uid(),'administrador'::public.app_role) OR public.has_role(auth.uid(),'gestor'::public.app_role) OR public.has_role(auth.uid(),'financeiro'::public.app_role)),false) THEN
 RAISE EXCEPTION 'H15_STAFF_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $function$;
CREATE OR REPLACE FUNCTION public.h15_user_organization(p_user uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT p.organization_id
  FROM public.profiles p
  JOIN public.organizations o ON o.id = p.organization_id AND o.ativo IS TRUE
  WHERE p.user_id = p_user AND p.ativo IS TRUE;
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), NEW.email);

  -- Segurança: auto-cadastro NÃO recebe nenhum papel.
  -- O usuário permanece com privilégio mínimo (sem papel -> /acesso-pendente)
  -- até que um administrador atribua explicitamente o perfil adequado.
  -- Usuários criados por admin recebem papéis na própria rotina administrativa.

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.has_active_user_cliente_access(_user_id uuid, _cliente_id uuid, _levels text[] DEFAULT ARRAY['read'::text, 'execute'::text, 'manage'::text])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.fn_authz_uid_scope_ok(_user_id) THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'administrador'::public.app_role) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.user_clientes uc
     WHERE uc.user_id = _user_id
       AND uc.cliente_id = _cliente_id
       AND uc.is_active = true
       AND uc.revoked_at IS NULL
       AND (uc.valid_from IS NULL OR uc.valid_from <= now())
       AND (uc.valid_until IS NULL OR uc.valid_until >= now())
       AND uc.access_level::text = ANY(_levels)
  );
END
$function$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.has_role(_user_id,_role); $function$;
CREATE OR REPLACE FUNCTION public.is_financial_staff(_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.fn_authz_uid_scope_ok(_uid) THEN
    RETURN false;
  END IF;
  RETURN has_role(_uid, 'administrador'::app_role)
      OR has_role(_uid, 'gestor'::app_role)
      OR has_role(_uid, 'financeiro'::app_role);
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_platform_superadmin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id AND r.role = 'superadmin'::public.app_role
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id = pu.partner_id
    WHERE pu.user_id = p_user_id
      AND pu.partner_id = p_partner_id
      AND pu.revoked_at IS NULL
      AND (SELECT count(*)
             FROM public.partner_users pu2
            WHERE pu2.user_id = p_user_id
              AND pu2.revoked_at IS NULL) = 1
      AND pa.ativo = true
      AND pa.deleted_at IS NULL
      AND pa.commercial_owner_organization_id IS NOT NULL
      AND pu.tenant_id = pa.commercial_owner_organization_id
      AND (SELECT count(*)
             FROM public.user_roles ur
            WHERE ur.user_id = p_user_id) = 1
      AND (
        (pu.papel = 'gestor'
          AND public.has_role(p_user_id, 'parceiro_b2b'::app_role)
          AND NOT public.has_role(p_user_id, 'parceiro_b2b_tecnico'::app_role))
        OR
        (pu.papel = 'tecnico'
          AND public.has_role(p_user_id, 'parceiro_b2b_tecnico'::app_role)
          AND NOT public.has_role(p_user_id, 'parceiro_b2b'::app_role))
      )
  );
$function$;
CREATE OR REPLACE FUNCTION public.jsonb_object_keys_count(p jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN 0
           ELSE COALESCE((SELECT count(*)::int FROM jsonb_object_keys(p)), 0)
         END;
$function$;
CREATE OR REPLACE FUNCTION public.link_partner_user(p_partner_id uuid, p_user_id uuid, p_papel text DEFAULT 'gestor'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 -- No partner tenant is inferred from actor, created_by, email or legacy role.
 -- The existing provisioning/edit contracts reject linked roles; there is no
 -- reviewed integrated partner ownership + first-access contract to delegate to.
 RAISE EXCEPTION 'CADASTRO1_PARTNER_CONTRACT_UNAVAILABLE' USING ERRCODE='42501';
END;
$function$;
CREATE OR REPLACE FUNCTION public.mask_sensitive_jsonb(v jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k text;
  val jsonb;
  arr jsonb := '[]'::jsonb;
  item jsonb;
  out_obj jsonb := '{}'::jsonb;
  sensitive text[] := ARRAY[
    'authorization','token','access_token','refresh_token',
    'password','senha','certificate','certificado',
    'private_key','privatekey','secret','client_secret',
    'pfx','p12','api_key','apikey','bearer'
  ];
  s text;
  is_sensitive boolean;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(v) = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
      arr := arr || jsonb_build_array(public.mask_sensitive_jsonb(item));
    END LOOP;
    RETURN arr;
  END IF;
  IF jsonb_typeof(v) = 'object' THEN
    FOR k, val IN SELECT key, value FROM jsonb_each(v) LOOP
      is_sensitive := false;
      FOREACH s IN ARRAY sensitive LOOP
        IF position(s in lower(k)) > 0 THEN is_sensitive := true; EXIT; END IF;
      END LOOP;
      IF is_sensitive THEN
        out_obj := out_obj || jsonb_build_object(k, to_jsonb('***REDACTED***'::text));
      ELSE
        out_obj := out_obj || jsonb_build_object(k, public.mask_sensitive_jsonb(val));
      END IF;
    END LOOP;
    RETURN out_obj;
  END IF;
  RETURN v;
END; $function$;
CREATE OR REPLACE FUNCTION public.notification_p1_visible(uid uuid, st text, sid uuid, cid uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.notification_p1_visible(uid,st,sid,cid); $function$;
CREATE OR REPLACE FUNCTION public.ofo_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'override_imutavel: exceções não podem ser apagadas';
  end if;
  if old.ended_at is not null then
    raise exception 'override_imutavel: exceção já encerrada';
  end if;
  if new.organization_id <> old.organization_id or new.feature_id <> old.feature_id
     or new.mode <> old.mode or new.limit_value is distinct from old.limit_value
     or new.starts_at <> old.starts_at or new.ends_at is distinct from old.ends_at
     or new.reason <> old.reason or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at or new.ended_at is null then
    raise exception 'override_imutavel: somente encerramento é permitido';
  end if;
  new.updated_at := now();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.ofo_stamp_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.created_by := auth.uid();
  new.ended_at := null; new.ended_by := null; new.end_reason := null;
  new.created_at := now(); new.updated_at := now();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.ofo_stamp_end()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.ended_at is not null and old.ended_at is null then new.ended_by := auth.uid(); end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.organizations_guard_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE via_api boolean := session_user = 'authenticator';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'org_invalid: id imutável' USING errcode='42501'; END IF;
  IF NOT via_api THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT platform_private.has_ticket('org_create', '00000000-0000-0000-0000-000000000000'::uuid) THEN
      RAISE EXCEPTION 'org_forbidden: criação apenas via plataforma' USING errcode='42501'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.status, NEW.razao_social, NEW.nome_fantasia, NEW.cnpj, NEW.cnpj_normalizado, NEW.email_corporativo,
      NEW.fuso_horario, NEW.onboarding_dados, NEW.onboarding_concluido_em, NEW.ativada_em, NEW.nome)
     IS DISTINCT FROM
     (OLD.status, OLD.razao_social, OLD.nome_fantasia, OLD.cnpj, OLD.cnpj_normalizado, OLD.email_corporativo,
      OLD.fuso_horario, OLD.onboarding_dados, OLD.onboarding_concluido_em, OLD.ativada_em, OLD.nome)
     AND NOT platform_private.has_ticket('org_write', NEW.id) THEN
    RAISE EXCEPTION 'org_forbidden: alteração apenas via fluxo do servidor' USING errcode='42501';
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.partner_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partner_id uuid;
  v_acao text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'create';
    v_new := to_jsonb(NEW);
    v_partner_id := CASE
      WHEN TG_TABLE_NAME = 'partner_accounts' THEN (v_new->>'id')::uuid
      ELSE (v_new->>'partner_id')::uuid
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_partner_id := CASE
      WHEN TG_TABLE_NAME = 'partner_accounts' THEN (v_new->>'id')::uuid
      ELSE (v_new->>'partner_id')::uuid
    END;
    IF TG_TABLE_NAME = 'partner_accounts' AND (v_old->>'ativo')::boolean = true AND (v_new->>'ativo')::boolean = false THEN
      v_acao := 'delete';
    ELSIF TG_TABLE_NAME = 'partner_accounts' AND (v_old->>'ativo')::boolean = false AND (v_new->>'ativo')::boolean = true THEN
      v_acao := 'restore';
    ELSIF TG_TABLE_NAME = 'partner_product_prices' THEN
      v_acao := 'price_change';
    ELSE
      v_acao := 'update';
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.partner_audit_logs(partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (v_partner_id, auth.uid(), v_acao, v_old, v_new);

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.partner_order_has_production(_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.production_order_link pol
    WHERE pol.partner_order_id = _order_id
  );
$function$;
CREATE OR REPLACE FUNCTION public.partner_orders_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acao text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'order_created';
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_acao := CASE WHEN NEW.status = 'cancelado' THEN 'order_cancelled' ELSE 'status_changed' END;
    ELSE
      v_acao := 'order_updated';
    END IF;
  ELSE
    RETURN NULL;
  END IF;
  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (COALESCE(NEW.id, OLD.id), COALESCE(NEW.partner_id, OLD.partner_id), auth.uid(), v_acao, v_old, v_new);
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.partner_ppp_compute_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.preco_final IS NULL THEN
    NEW.preco_final := ROUND(NEW.preco_tabela * (1 - COALESCE(NEW.desconto_percentual,0)/100.0), 2);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.partner_users_bump_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.partner_users_derive_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_tenant uuid;
BEGIN
 SELECT pa.commercial_owner_organization_id INTO v_tenant
 FROM public.partner_accounts pa WHERE pa.id=NEW.partner_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'partner_users_partner_not_found' USING ERRCODE='23503';
 END IF;
 IF v_tenant IS NULL THEN
  RAISE EXCEPTION 'partner_users_partner_without_tenant' USING ERRCODE='42501';
 END IF;
 IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant THEN
  RAISE EXCEPTION 'partner_users_tenant_mismatch' USING ERRCODE='42501';
 END IF;
 NEW.tenant_id:=v_tenant;
 RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION platform_private.assert_b2b_partner_scope(_uid uuid, _partner uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s record;
BEGIN
  IF _uid IS NULL OR auth.uid() IS NULL OR _uid <> auth.uid() THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';
  END IF;
  IF _partner IS NULL OR NOT EXISTS (SELECT 1 FROM public.partner_accounts pa
       WHERE pa.id = _partner AND pa.ativo = true AND pa.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501';
  END IF;
  IF public.is_platform_superadmin(_uid) THEN RETURN; END IF;
  IF public.has_role(_uid,'parceiro_b2b_tecnico'::app_role) THEN
    RAISE EXCEPTION 'forbidden_financial_terms' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM platform_private.b2b_actor_scope(_uid);
  IF NOT s.profile_ok THEN RAISE EXCEPTION 'inactive_scope' USING ERRCODE='42501'; END IF;
  IF s.org_partner IS DISTINCT FROM _partner OR NOT s.partner_valid THEN
    RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
  END IF;
  IF public.has_role(_uid,'parceiro_b2b'::app_role) THEN
    IF s.user_partner_count <> 1 OR s.user_partner IS DISTINCT FROM _partner THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
    END IF;
    RETURN;
  END IF;
  IF NOT (public.has_role(_uid,'administrador'::app_role) OR public.has_role(_uid,'financeiro'::app_role)
          OR public.has_role(_uid,'gestor_comercial'::app_role)) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501';
  END IF;
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_actor_scope(_uid uuid)
 RETURNS TABLE(profile_ok boolean, org_partner uuid, user_partner uuid, user_partner_count integer, partner_valid boolean, has_catalog boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH pr AS (
    SELECT o.partner_account_id
      FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
     WHERE p.user_id = _uid AND p.ativo = true AND o.ativo = true AND o.status = 'ativa'
     LIMIT 1
  ), pu AS (
    SELECT count(*)::int c, min(partner_id::text)::uuid pid
      FROM public.partner_users
     WHERE user_id = _uid AND revoked_at IS NULL
  ), valid AS (
    -- Caminho fornecedor: vínculo só resolve o parceiro com a cadeia completa
    -- perfil→organização→tenant→proprietário comprovada no servidor.
    SELECT CASE WHEN (SELECT c FROM pu) = 1
                 AND public.is_valid_b2b_partner_user(_uid, (SELECT pid FROM pu))
                 AND EXISTS (
                   SELECT 1
                     FROM public.partner_users puv
                     JOIN public.partner_accounts pa ON pa.id = puv.partner_id
                     JOIN public.organizations owner ON owner.id = pa.commercial_owner_organization_id
                     JOIN public.profiles pf ON pf.user_id = puv.user_id
                     JOIN public.organizations porg ON porg.id = pf.organization_id
                    WHERE puv.user_id = _uid
                      AND puv.partner_id = (SELECT pid FROM pu)
                      AND puv.revoked_at IS NULL
                      AND (puv.valid_from IS NULL OR puv.valid_from <= now())
                      AND pf.ativo = true
                      AND porg.ativo = true AND porg.status = 'ativa'
                      AND pf.organization_id = puv.tenant_id
                      AND puv.tenant_id = pa.commercial_owner_organization_id
                      AND pa.ativo = true AND pa.deleted_at IS NULL
                      AND owner.ativo = true AND owner.status = 'ativa'
                 )
              THEN (SELECT pid FROM pu) END AS pid
  )
  SELECT EXISTS (SELECT 1 FROM pr),
         -- Organização com parceiro explícito prevalece; sem ela, o vínculo autorizado
         -- validado resolve o parceiro. Se ambos existirem e divergirem, org_partner
         -- permanece o da organização e os consumidores negam por mismatch.
         COALESCE((SELECT partner_account_id FROM pr), (SELECT pid FROM valid)),
         (SELECT pid FROM valid),
         (SELECT c FROM pu),
         CASE WHEN (SELECT partner_account_id FROM pr) IS NOT NULL
              THEN EXISTS (SELECT 1 FROM pr JOIN public.partner_accounts pa ON pa.id = pr.partner_account_id
                            WHERE pa.ativo = true AND pa.deleted_at IS NULL)
              ELSE (SELECT pid FROM valid) IS NOT NULL END,
         EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'catalogo_precos');
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_assignment_identity_coherent(p_user uuid, p_partner uuid, p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=p_owner AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p_user)) AND (SELECT count(*) FROM public.user_roles r WHERE r.user_id=p_user)=1 AND (SELECT count(*) FROM public.partner_users pu WHERE pu.user_id=p_user)=1 AND EXISTS(SELECT 1 FROM public.partner_users pu JOIN public.user_roles r ON r.user_id=pu.user_id WHERE pu.user_id=p_user AND pu.partner_id=p_partner AND ((r.role='parceiro_b2b' AND pu.papel='gestor') OR (r.role='parceiro_b2b_tecnico' AND pu.papel='tecnico'))); $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_claim_provisioning(p_partner uuid, p_key uuid, p_email text, p_nome text, p_role app_role DEFAULT 'parceiro_b2b'::app_role, p_clients uuid[] DEFAULT ARRAY[]::uuid[], p_primary uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ctx jsonb; r platform_private.b2b_provisioning_receipts; stamp timestamptz; issued bigint; invitation jsonb; inserted integer;
BEGIN
 -- Same first lock as live statement triggers: gate → receipt/profile → rows.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 IF p_role = 'parceiro_b2b' THEN
 PERFORM public.b2b_provisioning_preflight(p_partner,p_role::text,'gestor'); END IF;
 ctx:=platform_private.external_provisioning_scope(auth.uid(),p_role,p_partner,p_clients,p_primary);
 IF p_key IS NULL OR p_email IS NULL OR p_nome IS NULL OR length(trim(p_nome)) NOT BETWEEN 1 AND 200
 OR length(p_email)>254 OR lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
  RAISE EXCEPTION 'b2b_provisioning_invalid' USING ERRCODE='22023'; END IF;
 issued:=(auth.jwt()->>'iat')::bigint;
 IF issued IS NULL OR issued<=0 OR to_timestamp(issued)>clock_timestamp()+interval '1 minute' THEN
 RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 SELECT updated_at INTO STRICT stamp FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
 PERFORM 1 FROM public.platform_org_admin_invites WHERE user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_array(id,access_operation_id,access_operation_status,status,access_valid_after) ORDER BY id),'[]'::jsonb) INTO invitation FROM public.platform_org_admin_invites WHERE user_id=auth.uid();
 INSERT INTO platform_private.b2b_provisioning_receipts(actor_id,organization_id,partner_id,idempotency_key,email,nome,actor_stamp,actor_iat,actor_invite_fence,external_role,cliente_ids,principal_cliente_id,target_snapshot)
 VALUES(auth.uid(),(ctx->>'organization_id')::uuid,p_partner,p_key,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation,p_role,p_clients,p_primary,ctx->'snapshot')
 ON CONFLICT(actor_id,idempotency_key) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 SELECT * INTO STRICT r FROM platform_private.b2b_provisioning_receipts
 WHERE actor_id=auth.uid() AND idempotency_key=p_key FOR UPDATE;
 IF ROW(r.organization_id,r.partner_id,r.email,r.nome,r.actor_stamp,r.actor_iat,r.actor_invite_fence,r.external_role,r.cliente_ids,r.principal_cliente_id,r.target_snapshot) IS DISTINCT FROM
 ROW((ctx->>'organization_id')::uuid,p_partner,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation,p_role,p_clients,p_primary,ctx->'snapshot') THEN
  RAISE EXCEPTION 'b2b_provisioning_conflict' USING ERRCODE='42501'; END IF;
 -- Never renew/reclaim a timed-out lease: Auth may already exist. Reconcile by ID.
 RETURN jsonb_build_object('claim_id',r.id,'user_id',r.user_id,'fence',r.fence,'status',r.status,
  'lease_valid',r.lease_until>clock_timestamp(),'acquired',inserted=1,'organization_id',r.organization_id);
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_coherent_self_partner(p_partner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT COALESCE((platform_private.b2b_commercial_context()->>'partner_id')::uuid=p_partner,false);
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); org uuid; role_name text; link record; owner uuid; legacy uuid; mode text;
BEGIN
 IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u) THEN RETURN NULL; END IF;
 org:=public.h15_actor_organization();
 IF org IS NULL OR (SELECT count(*) FROM public.user_roles r WHERE r.user_id=u)<>1 THEN RETURN NULL; END IF;
 SELECT r.role::text INTO role_name FROM public.user_roles r WHERE r.user_id=u;
 IF role_name NOT IN ('parceiro_b2b','parceiro_b2b_tecnico') THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM public.partner_users pu WHERE pu.user_id=u AND pu.revoked_at IS NULL)<>1 THEN RETURN NULL; END IF;
 SELECT pu.partner_id,pu.papel,pu.tenant_id INTO link FROM public.partner_users pu WHERE pu.user_id=u AND pu.revoked_at IS NULL;
 IF link.papel IS DISTINCT FROM (CASE WHEN role_name='parceiro_b2b_tecnico' THEN 'tecnico' ELSE 'gestor' END) THEN RETURN NULL; END IF;
 SELECT pa.commercial_owner_organization_id INTO owner FROM public.partner_accounts pa
 WHERE pa.id=link.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
 IF owner IS NULL THEN RETURN NULL; END IF;
 IF link.tenant_id IS NULL OR link.tenant_id IS DISTINCT FROM owner THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='catalogo_precos') THEN RETURN NULL; END IF;
 SELECT o.partner_account_id INTO legacy FROM public.organizations o WHERE o.id=org AND o.ativo IS TRUE AND o.status='ativa';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF owner=org THEN
   IF legacy IS NOT NULL AND legacy IS DISTINCT FROM link.partner_id THEN RETURN NULL; END IF;
   mode:='commercial_owner';
 ELSIF legacy=link.partner_id AND COALESCE(platform_private.b2b_phase1_partner_visible(link.partner_id,true),false) THEN
   mode:='legacy_partner_tenant';
 ELSE RETURN NULL;
 END IF;
 RETURN jsonb_build_object('partner_id',link.partner_id,'organization_id',org,
   'commercial_owner_organization_id',owner,'role',role_name,'papel',link.papel,'mode',mode);
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_partner_projection()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c jsonb; result jsonb; permitted boolean:=false; catalog boolean:=false; sheets boolean:=false; u uuid:=auth.uid();
BEGIN
 c:=platform_private.b2b_commercial_context();
 IF c IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('id',p.id,'codigo',p.codigo,'razao_social',p.razao_social,
   'nome_fantasia',p.nome_fantasia,'ativo',p.ativo,'papel',c->>'papel','mode',c->>'mode')
 INTO result FROM public.partner_accounts p
 WHERE p.id=(c->>'partner_id')::uuid AND p.ativo IS TRUE AND p.deleted_at IS NULL
 AND p.commercial_owner_organization_id=(c->>'commercial_owner_organization_id')::uuid;
 IF result IS NULL THEN RETURN NULL; END IF;
 -- A commercial client alone is NOT a partner capability. Reuse current B2B
 -- chain, including singleton role/link validator; add freshness/owner proof.
 permitted:=COALESCE(platform_private.b2b_phase1_partner_visible((result->>'id')::uuid,true),false)
  AND EXISTS(SELECT 1 FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id=pu.partner_id
    JOIN public.profiles p ON p.user_id=pu.user_id
    JOIN public.organizations o ON o.id=pa.commercial_owner_organization_id
    WHERE pu.user_id=u AND pu.partner_id=(result->>'id')::uuid
      AND pu.revoked_at IS NULL AND pu.valid_from<=now()
      AND pa.ativo AND pa.deleted_at IS NULL AND o.ativo AND o.status='ativa'
      AND p.ativo AND p.organization_id=pu.tenant_id AND pu.tenant_id=o.id
      AND public.is_valid_b2b_partner_user(u,pa.id));
 IF permitted THEN
  catalog:=public.has_role(u,'parceiro_b2b') AND EXISTS(
    SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='catalogo_precos');
  sheets:=EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='fichas_tecnicas');
 END IF;
 RETURN result||jsonb_build_object('capabilities',jsonb_build_object('contract','C2_CAT_V1',
   'catalog_read',catalog,'sheets_read',sheets));
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_direct_partner_row_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT NOT EXISTS (
 SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
 AND (r.role='parceiro_b2b_tecnico'::public.app_role OR
 (r.role='parceiro_b2b'::public.app_role AND EXISTS (
 SELECT 1 FROM public.profiles p
 JOIN public.partner_users pu ON pu.user_id=p.user_id
 JOIN public.partner_accounts pa ON pa.id=pu.partner_id
 WHERE p.user_id=r.user_id AND p.organization_id=pa.commercial_owner_organization_id
 ))));
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_internal_assert_origin(s jsonb, partner uuid, client uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 org:=public.h15_actor_organization();
 IF org IS NULL OR NOT public.fn_cc_can_prepare(uid) OR NOT public._saas_user_has_feature(uid,'pedidos_b2b') THEN RAISE EXCEPTION 'B2B_INTERNAL_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT platform_private.b2b_internal_origin_valid(s) OR s->>'organization_id' IS DISTINCT FROM org::text OR s->>'partner_id' IS DISTINCT FROM partner::text THEN RAISE EXCEPTION 'B2B_INTERNAL_ORIGIN_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_accounts p WHERE p.id=partner AND p.commercial_owner_organization_id=org AND p.ativo IS TRUE AND p.deleted_at IS NULL
 AND (p.client_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p.client_id AND c.organization_id=org))) THEN RAISE EXCEPTION 'B2B_INTERNAL_PARTNER_DENIED' USING ERRCODE='42501'; END IF;
 IF client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=client AND c.organization_id=org) THEN RAISE EXCEPTION 'B2B_INTERNAL_CLIENT_DENIED' USING ERRCODE='42501'; END IF;
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_internal_child_snapshot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old_parent uuid; new_parent uuid; parent uuid; o public.partner_orders; before_value jsonb; after_value jsonb;
BEGIN
 IF TG_TABLE_NAME='partner_order_items' THEN
  IF TG_OP<>'INSERT' THEN old_parent:=OLD.order_id; END IF;
  IF TG_OP<>'DELETE' THEN new_parent:=NEW.order_id; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN old_parent:=OLD.partner_order_id; END IF;
  IF TG_OP<>'DELETE' THEN new_parent:=NEW.partner_order_id; END IF;
 END IF;
 FOR parent IN SELECT DISTINCT x FROM unnest(ARRAY[old_parent,new_parent]) x WHERE x IS NOT NULL ORDER BY x LOOP
  SELECT * INTO o FROM public.partner_orders WHERE id=parent FOR UPDATE;
  IF o.internal_origin_snapshot IS NOT NULL THEN
   PERFORM platform_private.b2b_internal_assert_origin(o.internal_origin_snapshot,o.partner_id,o.cliente_id);
   IF o.status IN ('cancelado','reprovado') THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMINAL_STATUS' USING ERRCODE='42501'; END IF;
   IF o.internal_economic_snapshot IS NOT NULL THEN
    IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
    before_value:=to_jsonb(OLD); after_value:=to_jsonb(NEW);
    IF TG_TABLE_NAME='partner_order_payment_terms' THEN before_value:=before_value-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes']; after_value:=after_value-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes'];
    ELSIF TG_TABLE_NAME='partner_order_payment_schedule' THEN before_value:=before_value-ARRAY['status','receivable_installment_id']; after_value:=after_value-ARRAY['status','receivable_installment_id']; END IF;
    IF before_value IS DISTINCT FROM after_value THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
   END IF;
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_internal_order_snapshot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid; uid uuid:=auth.uid(); cs public.company_fiscal_settings; candidate_count integer; economic jsonb; terms public.partner_order_payment_terms; items jsonb; schedule jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  org:=public.h15_actor_organization();
  IF org IS NULL OR NOT public.fn_cc_can_prepare(uid) OR NOT public._saas_user_has_feature(uid,'pedidos_b2b') THEN RAISE EXCEPTION 'B2B_INTERNAL_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
  -- No client/CNPJ/organizations.partner_account_id inference. All caller snapshots rejected.
  IF NEW.internal_origin_snapshot IS NOT NULL OR NEW.internal_economic_snapshot IS NOT NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_SERVER_ONLY' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO candidate_count FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active IS TRUE;
  IF candidate_count<>1 THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  SELECT * INTO cs FROM public.company_fiscal_settings c WHERE c.organization_id=org AND c.is_active IS TRUE FOR SHARE;
  IF cs.configuration_status IS DISTINCT FROM 'VALIDATED' OR cs.accounting_validated_at IS NULL OR nullif(btrim(cs.legal_name),'') IS NULL OR nullif(btrim(cs.cnpj),'') IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_ISSUER_NOT_VALIDATED' USING ERRCODE='42501'; END IF;
  NEW.internal_origin_snapshot:=jsonb_build_object('schema_version','1','organization_id',org,'creditor_organization_id',org,'issuer_organization_id',org,'company_settings_id',cs.id,'company_configuration_version',cs.configuration_version,'issuer_legal_name',cs.legal_name,'issuer_cnpj',cs.cnpj,'actor_user_id',uid,'partner_id',NEW.partner_id);
  PERFORM platform_private.b2b_internal_assert_origin(NEW.internal_origin_snapshot,NEW.partner_id,NEW.cliente_id);
  IF NEW.ready_for_production IS TRUE THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF; IF NEW.status IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') THEN RAISE EXCEPTION 'B2B_INTERNAL_INITIAL_STATUS_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.internal_origin_snapshot IS DISTINCT FROM OLD.internal_origin_snapshot OR NEW.internal_economic_snapshot IS DISTINCT FROM OLD.internal_economic_snapshot THEN RAISE EXCEPTION 'B2B_INTERNAL_SNAPSHOT_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF OLD.internal_origin_snapshot IS NULL THEN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') THEN RAISE EXCEPTION 'B2B_INTERNAL_LEGACY_ORIGIN_UNPROVEN' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 PERFORM platform_private.b2b_internal_assert_origin(OLD.internal_origin_snapshot,OLD.partner_id,OLD.cliente_id);
 IF NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'B2B_INTERNAL_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF OLD.internal_economic_snapshot IS NOT NULL AND (to_jsonb(NEW)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','ready_for_production','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','approval_notes','estimated_delivery_date','ready_for_production','financial_status','receivable_generated','receivable_generated_at','receivable_generated_by','future_financial_link','commercial_notes']) THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status IN ('cancelado','reprovado') THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMINAL_STATUS' USING ERRCODE='42501'; END IF;
 IF NEW.ready_for_production IS TRUE THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF; IF public.fn_b2b_status_is_operational(NEW.status) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF; IF NEW.ready_for_production IS TRUE AND NEW.status<>'aprovado' THEN RAISE EXCEPTION 'B2B_INTERNAL_UNSEALED_OPERATION' USING ERRCODE='42501'; END IF; IF NEW.status='aprovado' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NOT (public.has_role(uid,'administrador'::public.app_role) OR public.has_role(uid,'gestor_comercial'::public.app_role)) OR OLD.status NOT IN ('em_analise_comercial','solicitado','rascunho') OR NEW.payment_condition_status IS DISTINCT FROM 'defined' THEN RAISE EXCEPTION 'B2B_INTERNAL_APPROVAL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO terms FROM public.partner_order_payment_terms t WHERE t.id=NEW.payment_terms_id AND t.partner_order_id=NEW.id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMS_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NEW.total IS NULL OR NEW.total::text IN ('NaN','Infinity','-Infinity') OR NEW.total<0 OR terms.final_amount IS DISTINCT FROM NEW.total OR NEW.desconto_total<0 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id) OR EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.quantidade IS NULL OR i.quantidade<=0 OR i.quantidade::text IN ('NaN','Infinity','-Infinity') OR i.preco_unitario IS NULL OR i.preco_unitario<0 OR i.preco_unitario::text IN ('NaN','Infinity','-Infinity') OR i.desconto_percentual IS NULL OR i.desconto_percentual<0 OR i.desconto_percentual>100 OR i.desconto_percentual::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(to_jsonb(i)-ARRAY['created_at'] ORDER BY i.id) INTO items FROM public.partner_order_items i WHERE i.order_id=NEW.id;
  SELECT jsonb_agg(to_jsonb(s)-ARRAY['created_at','status','receivable_installment_id'] ORDER BY s.installment_number,s.id) INTO schedule FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND s.payment_terms_id=terms.id;
  IF schedule IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NEW.subtotal IS NULL OR NEW.desconto_total IS NULL OR NEW.subtotal::text IN ('NaN','Infinity','-Infinity') OR NEW.desconto_total::text IN ('NaN','Infinity','-Infinity') OR NEW.subtotal<0 OR NEW.desconto_total<0 OR NEW.desconto_total>NEW.subtotal OR terms.discount_percent_snapshot IS NULL OR terms.discount_percent_snapshot::text IN ('NaN','Infinity','-Infinity') OR terms.discount_percent_snapshot<0 OR terms.discount_percent_snapshot>100 THEN RAISE EXCEPTION 'B2B_INTERNAL_TOTAL_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_items i WHERE i.order_id=NEW.id AND (i.subtotal IS NULL OR i.subtotal<0 OR i.subtotal::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT round(sum(i.subtotal),2) FROM public.partner_order_items i WHERE i.order_id=NEW.id) IS DISTINCT FROM round(terms.net_amount_after_discount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_ITEM_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id AND (s.payment_terms_id IS DISTINCT FROM terms.id OR s.installment_number<=0 OR s.due_date IS NULL OR s.amount IS NULL OR s.principal_amount IS NULL OR s.interest_amount IS NULL OR s.amount<0 OR s.principal_amount<0 OR s.interest_amount<0 OR s.amount::text IN ('NaN','Infinity','-Infinity') OR s.principal_amount::text IN ('NaN','Infinity','-Infinity') OR s.interest_amount::text IN ('NaN','Infinity','-Infinity'))) OR (SELECT count(*) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT count(DISTINCT s.installment_number) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM terms.installment_count::bigint OR (SELECT round(sum(s.amount),2) FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=NEW.id) IS DISTINCT FROM round(terms.final_amount,2) THEN RAISE EXCEPTION 'B2B_INTERNAL_SCHEDULE_INVALID' USING ERRCODE='22023'; END IF;
  economic:=jsonb_build_object('schema_version','1','origin',OLD.internal_origin_snapshot,'items',items,'terms',to_jsonb(terms)-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes'],'schedule',schedule,'subtotal',NEW.subtotal,'discount',NEW.desconto_total,'total',NEW.total,'sealed_by',uid);
  NEW.internal_economic_snapshot:=economic;
 ELSIF NEW.status IS DISTINCT FROM OLD.status AND public.fn_b2b_status_is_operational(NEW.status) AND OLD.internal_economic_snapshot IS NULL THEN RAISE EXCEPTION 'B2B_INTERNAL_UNSEALED_OPERATION' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_internal_origin_valid(s jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT coalesce(jsonb_typeof(s)='object' AND s->>'schema_version'='1'
 AND nullif(s->>'organization_id','') IS NOT NULL
 AND s->>'organization_id'=s->>'creditor_organization_id'
 AND s->>'organization_id'=s->>'issuer_organization_id'
 AND nullif(s->>'company_settings_id','') IS NOT NULL
 AND nullif(s->>'actor_user_id','') IS NOT NULL
 AND nullif(s->>'partner_id','') IS NOT NULL,false)
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_organization_full_row_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT auth.uid() IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
   AND r.role::text IN ('parceiro_b2b','parceiro_b2b_tecnico'));
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_phase1_order_visible(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=p_order AND public.b2b_phase1_partner_visible(o.partner_id,false));
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s record; u uuid := auth.uid();
BEGIN
 IF u IS NULL OR p_partner IS NULL THEN RETURN false; END IF;
 IF public.is_platform_superadmin(u) THEN RETURN true; END IF;
 SELECT * INTO s FROM platform_private.b2b_actor_scope(u);
 IF NOT s.profile_ok OR NOT s.partner_valid OR s.org_partner IS DISTINCT FROM p_partner THEN RETURN false; END IF;
 IF public.has_role(u,'parceiro_b2b_tecnico') THEN
  RETURN p_technical AND s.user_partner_count=1 AND s.user_partner=p_partner;
 END IF;
 IF public.has_role(u,'parceiro_b2b') THEN
  RETURN s.user_partner_count=1 AND s.user_partner=p_partner;
 END IF;
 RETURN true; -- existing permissive policies/RPC role guards still select allowed roles
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_provisioning_preflight(p_partner uuid, p_role text, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); org uuid;
BEGIN
 org:=public.h15_actor_organization();
 IF u IS NULL OR org IS NULL OR NOT platform_private.platform_actor_access_ready(u)
 OR NOT public.has_role(u,'administrador'::public.app_role) THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501';
 END IF;
 IF p_role NOT IN ('parceiro_b2b','parceiro_b2b_tecnico') OR p_role IS NULL
 OR p_papel IS DISTINCT FROM (CASE WHEN p_role='parceiro_b2b_tecnico' THEN 'tecnico' ELSE 'gestor' END)
 OR NOT EXISTS(SELECT 1 FROM public.partner_accounts p WHERE p.id=p_partner
   AND p.commercial_owner_organization_id=org AND p.ativo IS TRUE AND p.deleted_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=org AND o.ativo IS TRUE AND o.status='ativa')
 OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='catalogo_precos') THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('organization_id',org,'partner_id',p_partner,'role',p_role,'papel',p_papel,
 'enabled',false,'reason','b2b_same_tenant_channels_unverified');
END $function$;
CREATE OR REPLACE FUNCTION platform_private.current_user_organization_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT p.organization_id
    INTO v_organization_id
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
     AND p.ativo = true
     AND p.organization_id IS NOT NULL;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização ativa não encontrada' USING ERRCODE = '42501';
  END IF;

  RETURN v_organization_id;
END;
$function$;
CREATE OR REPLACE FUNCTION platform_private.entitlements_for_user(_uid uuid)
 RETURNS TABLE(module_key text, feature_key text, limit_value numeric, config jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH actor AS (
    SELECT p.organization_id
    FROM public.profiles p
    JOIN public.organizations org
      ON org.id = p.organization_id
     AND org.ativo IS TRUE
    WHERE p.user_id = _uid
      AND p.ativo IS TRUE
      AND p.organization_id IS NOT NULL
    ORDER BY p.created_at, p.organization_id
    LIMIT 1
  ), current_subscription AS (
    SELECT s.organization_id, s.plan_version_id
    FROM public.organization_subscriptions s
    JOIN actor a ON a.organization_id = s.organization_id
    JOIN public.saas_plan_versions v
      ON v.id = s.plan_version_id
     AND v.status = 'PUBLISHED'
     AND v.effective_from <= now()
     AND (v.effective_to IS NULL OR v.effective_to > now())
    WHERE s.plan_version_id IS NOT NULL
      AND (
        s.status = 'ACTIVE'
        OR (s.status = 'TRIAL' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now())
      )
      AND (s.cancel_at IS NULL OR s.cancel_at > now())
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT 1
  ), candidates AS (
    SELECT f.id AS feature_id, f.module_id, f.key AS feature_key,
           vf.enabled AS base_enabled, vf.limit_value AS base_limit, vf.config AS base_config
    FROM current_subscription s
    JOIN public.saas_plan_version_features vf ON vf.plan_version_id = s.plan_version_id
    JOIN public.saas_features f ON f.id = vf.feature_id AND f.active IS TRUE
    UNION
    SELECT f.id, f.module_id, f.key, false, NULL::numeric, NULL::jsonb
    FROM current_subscription s
    JOIN public.organization_feature_overrides o ON o.organization_id = s.organization_id
    JOIN public.saas_features f ON f.id = o.feature_id AND f.active IS TRUE
    WHERE o.ended_at IS NULL
      AND o.starts_at <= now()
      AND (o.ends_at IS NULL OR o.ends_at > now())
  ), effective AS (
    SELECT DISTINCT ON (c.feature_id)
      c.feature_id, c.module_id, c.feature_key,
      CASE
        WHEN o.mode = 'REVOKE' THEN false
        WHEN o.mode = 'GRANT' THEN true
        ELSE c.base_enabled
      END AS enabled,
      CASE
        WHEN o.mode = 'GRANT' THEN o.limit_value
        WHEN o.mode = 'REVOKE' THEN NULL::numeric
        ELSE c.base_limit
      END AS effective_limit,
      c.base_config AS effective_config
    FROM candidates c
    CROSS JOIN current_subscription s
    LEFT JOIN LATERAL (
      SELECT x.mode, x.limit_value
      FROM public.organization_feature_overrides x
      WHERE x.organization_id = s.organization_id
        AND x.feature_id = c.feature_id
        AND x.ended_at IS NULL
        AND x.starts_at <= now()
        AND (x.ends_at IS NULL OR x.ends_at > now())
      ORDER BY x.created_at DESC, x.id DESC
      LIMIT 1
    ) o ON true
    ORDER BY c.feature_id
  )
  SELECT m.key::text, e.feature_key::text, e.effective_limit::numeric, e.effective_config
  FROM effective e
  JOIN public.saas_modules m ON m.id = e.module_id AND m.active IS TRUE
  WHERE e.enabled IS TRUE
  ORDER BY m.key, e.feature_key
$function$;
CREATE OR REPLACE FUNCTION platform_private.external_provisioning_scope(p_actor uuid, p_role app_role, p_partner uuid, p_clients uuid[], p_primary uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid; snapshot jsonb;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE user_id=p_actor FOR UPDATE;
 IF p_actor IS NULL OR org IS NULL OR platform_private.platform_actor_access_ready(p_actor) IS NOT TRUE
 OR public.has_role(p_actor,'administrador') IS NOT TRUE OR public.is_platform_superadmin(p_actor) IS TRUE
 THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=org AND ativo IS TRUE AND status='ativa' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF p_role = 'parceiro_b2b' THEN
 IF p_partner IS NULL OR cardinality(p_clients) IS DISTINCT FROM 0 OR p_primary IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(p_actor) WHERE feature_key='catalogo_precos') THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.partner_accounts WHERE id=p_partner FOR SHARE;
 SELECT jsonb_build_object('id',id,'updated_at',updated_at) INTO snapshot FROM public.partner_accounts
 WHERE id=p_partner AND commercial_owner_organization_id=org AND ativo IS TRUE AND deleted_at IS NULL;
 ELSE
 IF p_role IS DISTINCT FROM 'cliente_produtor' OR p_partner IS NOT NULL OR cardinality(p_clients) NOT BETWEEN 1 AND 100
 OR p_clients IS NULL OR array_position(p_clients,NULL) IS NOT NULL
 OR cardinality(p_clients)<>(SELECT count(DISTINCT id) FROM unnest(p_clients) id)
 OR p_primary IS NULL OR NOT (p_primary=ANY(p_clients)) THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 -- Explicit portal creation, never derive portal authority from technical user_clientes.
 PERFORM 1 FROM public.clientes WHERE id=ANY(p_clients) ORDER BY id FOR SHARE;
 IF (SELECT count(*) FROM public.clientes WHERE id=ANY(p_clients) AND organization_id=org AND status_cliente='ativo')<>cardinality(p_clients) THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) ORDER BY id) INTO snapshot FROM public.clientes WHERE id=ANY(p_clients);
 END IF;
 IF platform_private.platform_actor_access_ready(p_actor) IS NOT TRUE OR public.has_role(p_actor,'administrador') IS NOT TRUE THEN RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('organization_id',org,'snapshot',snapshot);
END $function$;
CREATE OR REPLACE FUNCTION platform_private.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id);
$function$;
CREATE OR REPLACE FUNCTION platform_private.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id));
$function$;
CREATE OR REPLACE FUNCTION platform_private.has_ticket(_scope text, _target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM platform_private.authz_tickets
                 WHERE txid = txid_current() AND scope = _scope AND target = _target);
$function$;
CREATE OR REPLACE FUNCTION platform_private.is_same_tenant_user(p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p_target_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles target
       WHERE target.user_id = p_target_user_id
         AND target.organization_id = platform_private.current_user_organization_id()
     );
$function$;
CREATE OR REPLACE FUNCTION platform_private.is_tenant_admin_for_user(p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'administrador'::public.app_role)
     AND NOT public.is_platform_superadmin(auth.uid())
     AND NOT public.is_platform_superadmin(p_target_user_id)
     AND platform_private.is_same_tenant_user(p_target_user_id);
$function$;
CREATE OR REPLACE FUNCTION platform_private.notification_p1_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE org uuid; uid uuid; cid uuid; BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'lido') IS DISTINCT FROM (to_jsonb(OLD)-'lido') THEN RAISE EXCEPTION 'NOTIF_CONTENT_IMMUTABLE' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 -- Unknown source is quarantined, not attributed from recipient or message/link. Preserve parent operations.
 IF NEW.source_type IS NULL OR NEW.source_id IS NULL THEN RETURN NULL; END IF;
 org:=platform_private.notification_source_org(NEW.source_type,NEW.source_id);
 IF TG_TABLE_NAME='notificacoes_operacionais' THEN uid:=NEW.usuario_id; ELSE uid:=NEW.recipient_user_id; cid:=NEW.cliente_id; END IF;
 IF NOT COALESCE(platform_private.notification_user_ok(uid,org),false) THEN RAISE EXCEPTION 'NOTIF_SOURCE_RECIPIENT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF cid IS NOT NULL AND (platform_private.notification_source_client(NEW.source_type,NEW.source_id) IS DISTINCT FROM cid OR NOT public.has_role(uid,'cliente_produtor') OR NOT public._portal_cliente_user_has_link(uid,cid) OR NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=cid AND c.organization_id=org)) THEN RAISE EXCEPTION 'NOTIF_PORTAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NEW.tipo::text='sistema' THEN RAISE EXCEPTION 'NOTIF_GLOBAL_PRODUCER_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW; END $function$;
CREATE OR REPLACE FUNCTION platform_private.notification_p1_visible(uid uuid, st text, sid uuid, cid uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE org uuid; BEGIN
 org:=platform_private.notification_source_org(st,sid);
 IF uid IS DISTINCT FROM auth.uid() OR NOT COALESCE(platform_private.notification_user_ok(uid,org),false) OR public.h15_actor_organization() IS DISTINCT FROM org THEN RETURN false; END IF;
 IF cid IS NOT NULL THEN
IF platform_private.notification_source_client(st,sid) IS DISTINCT FROM cid THEN RETURN false; END IF;
  RETURN public.has_role(uid,'cliente_produtor') AND EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=cid AND c.organization_id=org) AND public._portal_cliente_user_has_link(uid,cid);
 END IF;
 RETURN true; END $function$;
CREATE OR REPLACE FUNCTION platform_private.notification_source_client(st text, sid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE cid uuid; BEGIN CASE st WHEN 'registros_consultor','registro_consultor','monitoramento_vencido' THEN SELECT cliente_id INTO cid FROM public.registros_consultor WHERE id=sid; WHEN 'portal_solicitacoes' THEN SELECT cliente_id INTO cid FROM public.portal_solicitacoes WHERE id=sid; WHEN 'ordem_servico','ordens_servico' THEN SELECT cliente_id INTO cid FROM public.ordens_servico WHERE id=sid; WHEN 'aplicacao','aplicacoes' THEN SELECT o.cliente_id INTO cid FROM public.aplicacoes a JOIN public.ordens_servico o ON o.id=a.ordem_servico_id WHERE a.id=sid AND a.ordem_servico_onfarm_id IS NULL; ELSE RETURN NULL; END CASE; RETURN cid; END $function$;
CREATE OR REPLACE FUNCTION platform_private.notification_source_org(st text, sid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v uuid; BEGIN
 IF sid IS NULL THEN RETURN NULL; END IF;
 CASE st
 WHEN 'registros_consultor','registro_consultor','monitoramento_vencido' THEN SELECT c.organization_id INTO v FROM public.registros_consultor r JOIN public.clientes c ON c.id=r.cliente_id WHERE r.id=sid;
 WHEN 'ordem_servico','ordens_servico' THEN SELECT o.organization_id INTO v FROM public.ordens_servico o JOIN public.clientes c ON c.id=o.cliente_id AND c.organization_id=o.organization_id WHERE o.id=sid;
 WHEN 'portal_solicitacoes' THEN SELECT c.organization_id INTO v FROM public.portal_solicitacoes s JOIN public.clientes c ON c.id=s.cliente_id WHERE s.id=sid;
 WHEN 'programacao_producao' THEN SELECT p.organization_id INTO v FROM public.programacao_producao p WHERE p.id=sid AND ((p.ordem_servico_id IS NOT NULL AND p.ordem_servico_onfarm_id IS NULL AND EXISTS(SELECT 1 FROM public.ordens_servico o JOIN public.clientes c ON c.id=o.cliente_id AND c.organization_id=o.organization_id WHERE o.id=p.ordem_servico_id AND o.organization_id=p.organization_id)) OR (p.ordem_servico_onfarm_id IS NOT NULL AND p.ordem_servico_id IS NULL AND EXISTS(SELECT 1 FROM public.ordens_servico_onfarm o JOIN public.clientes c ON c.id=o.cliente_id WHERE o.id=p.ordem_servico_onfarm_id AND c.organization_id=p.organization_id)));
 WHEN 'estoque_produto' THEN RETURN NULL;
 WHEN 'aplicacao','aplicacoes' THEN SELECT a.organization_id INTO v FROM public.aplicacoes a JOIN public.ordens_servico o ON o.id=a.ordem_servico_id AND o.organization_id=a.organization_id JOIN public.clientes c ON c.id=o.cliente_id AND c.organization_id=o.organization_id WHERE a.id=sid AND a.ordem_servico_onfarm_id IS NULL;
 WHEN 'partner_orders' THEN SELECT c.organization_id INTO v FROM public.partner_orders o JOIN public.partner_accounts p ON p.id=o.partner_id AND p.ativo IS TRUE AND p.deleted_at IS NULL JOIN public.clientes c ON c.id=p.client_id WHERE o.id=sid;
 WHEN 'partner_simulations' THEN SELECT c.organization_id INTO v FROM public.partner_simulations s JOIN public.partner_accounts p ON p.id=s.partner_id AND p.ativo IS TRUE AND p.deleted_at IS NULL JOIN public.clientes c ON c.id=p.client_id WHERE s.id=sid;
 ELSE RETURN NULL; END CASE;
 IF NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v AND o.ativo IS TRUE) THEN RETURN NULL; END IF;
 RETURN v; END $function$;
CREATE OR REPLACE FUNCTION platform_private.notification_user_ok(uid uuid, org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT org IS NOT NULL AND public.h15_user_organization(uid)=org AND platform_private.platform_actor_access_ready(uid); $function$;
CREATE OR REPLACE FUNCTION platform_private.platform_actor_access_ready(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE)
 AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND auth.uid()=p_user AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after)));
$function$;
CREATE OR REPLACE FUNCTION platform_private.require_service_role()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE v_role text;
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
                     nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role <> 'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
END $function$;
CREATE OR REPLACE FUNCTION public.recalc_partner_order_production(p_partner_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_planning_id   uuid;
  v_partner_id    uuid;
  v_numero        text;
  v_total         int;
  v_em_producao   int;
  v_produzidos    int;
  v_entregues     int;
  v_new_status    production_planning_status;
  v_old_status    production_planning_status;
BEGIN
  SELECT pp.id, pp.status, po.partner_id, po.numero
    INTO v_planning_id, v_old_status, v_partner_id, v_numero
  FROM public.production_planning pp
  JOIN public.partner_orders     po ON po.id = pp.partner_order_id
  WHERE pp.partner_order_id = p_partner_order_id;

  IF v_planning_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE os.status IN ('em_producao','em_cq','envase','pronto_entrega','entregue','finalizada')),
    COUNT(*) FILTER (WHERE os.status IN ('pronto_entrega','entregue','finalizada')),
    COUNT(*) FILTER (WHERE os.status IN ('entregue','finalizada'))
  INTO v_total, v_em_producao, v_produzidos, v_entregues
  FROM public.production_order_link l
  JOIN public.ordens_servico os ON os.id = l.ordem_servico_id
  WHERE l.partner_order_id = p_partner_order_id;

  IF v_total = 0 THEN
    v_new_status := 'aguardando_planejamento';
  ELSIF v_entregues = v_total THEN
    v_new_status := 'entregue';
  ELSIF v_produzidos = v_total THEN
    v_new_status := 'produzido';
  ELSIF v_em_producao > 0 THEN
    v_new_status := 'em_producao';
  ELSE
    v_new_status := 'planejado';
  END IF;

  IF v_new_status IS DISTINCT FROM v_old_status THEN
    UPDATE public.production_planning
       SET status = v_new_status,
           updated_at = now()
     WHERE id = v_planning_id;

    INSERT INTO public.production_timeline_events (partner_order_id, event_type, meta)
    VALUES (
      p_partner_order_id,
      CASE v_new_status
        WHEN 'planejado'   THEN 'op_gerada'
        WHEN 'em_producao' THEN 'producao_iniciada'
        WHEN 'produzido'   THEN 'producao_finalizada'
        WHEN 'entregue'    THEN 'entrega_realizada'
        ELSE 'status_alterado'
      END,
      jsonb_build_object(
        'from', v_old_status::text,
        'to',   v_new_status::text,
        'total_ops', v_total,
        'em_producao', v_em_producao,
        'produzidos', v_produzidos,
        'entregues', v_entregues
      )
    );

    IF v_new_status IN ('em_producao','produzido','entregue') THEN
      INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo, mensagem, link)
      SELECT pu.user_id,
             'pedido_b2b',
             CASE v_new_status
               WHEN 'em_producao' THEN 'Pedido ' || v_numero || ' em produção'
               WHEN 'produzido'   THEN 'Pedido ' || v_numero || ' pronto para expedição'
               WHEN 'entregue'    THEN 'Pedido ' || v_numero || ' entregue'
             END,
             CASE v_new_status
               WHEN 'em_producao' THEN 'A produção do seu pedido foi iniciada.'
               WHEN 'produzido'   THEN 'Produção concluída. Aguardando envase e expedição.'
               WHEN 'entregue'    THEN 'Seu pedido foi entregue.'
             END,
             '/portal-parceiro/pedidos'
        FROM public.partner_users pu
       WHERE pu.partner_id = v_partner_id;
    END IF;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.recalc_partner_prices_on_default_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.desconto_padrao IS DISTINCT FROM OLD.desconto_padrao THEN
    UPDATE public.partner_product_prices
       SET desconto_percentual = NEW.desconto_padrao,
           preco_final = ROUND(preco_tabela * (1 - NEW.desconto_padrao/100.0), 2),
           updated_at = now()
     WHERE partner_id = NEW.id
       AND ativo = true
       AND desconto_percentual IS NOT DISTINCT FROM OLD.desconto_padrao;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.recalc_partner_risk_score(p_partner_id uuid)
 RETURNS partner_risk_scores
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dias_atraso numeric := 0;
  v_vencidos int := 0;
  v_pct numeric := 0;
  v_freq int := 0;
  v_meses int := 0;
  v_limite numeric := 0;
  v_aberto numeric := 0;
  v_score int := 0;
  v_level text := 'baixo';
  v_row public.partner_risk_scores;
BEGIN
  -- H7O: dentro de trigger (pg_trigger_depth()>0) ou sessão interna (sem JWT) segue livre;
  -- chamada autenticada direta exige staff financeiro.
  IF pg_trigger_depth() = 0 AND auth.uid() IS NOT NULL AND NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H7O: recálculo de score de risco restrito ao staff financeiro.';
  END IF;

  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'partner_id required'; END IF;

  SELECT COALESCE(AVG(GREATEST(0, CURRENT_DATE - ari.due_date)),0)::numeric,
         COUNT(*) FILTER (WHERE ari.status='OVERDUE' OR (ari.status IN ('OPEN','PARTIAL') AND ari.due_date < CURRENT_DATE))
    INTO v_dias_atraso, v_vencidos
  FROM accounts_receivable ar
  JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id = p_partner_id
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT COALESCE(credit_limit,0) INTO v_limite FROM partner_financial_settings WHERE partner_id = p_partner_id;
  v_limite := COALESCE(v_limite,0);

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_aberto
  FROM accounts_receivable ar
  JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id = p_partner_id
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  v_pct := CASE WHEN v_limite > 0 THEN LEAST(100,(v_aberto/v_limite)*100) ELSE 0 END;

  SELECT COUNT(*) INTO v_freq FROM partner_orders
   WHERE partner_id = p_partner_id AND created_at >= now() - interval '30 days'
     AND status NOT IN ('cancelado','reprovado');

  SELECT GREATEST(0, EXTRACT(YEAR FROM age(now(), pa.created_at))*12 + EXTRACT(MONTH FROM age(now(), pa.created_at)))::int
    INTO v_meses FROM partner_accounts pa WHERE id = p_partner_id;

  -- score (peso): atraso 35, vencidos 25, util 20, freq -10, relacionamento -10
  v_score := LEAST(100, GREATEST(0,
      ROUND(LEAST(v_dias_atraso/90.0,1)*35)
    + ROUND(LEAST(v_vencidos/5.0,1)*25)
    + ROUND((v_pct/100.0)*20)
    - ROUND(LEAST(v_freq/10.0,1)*10)
    - ROUND(LEAST(COALESCE(v_meses,0)/24.0,1)*10)
  ));
  v_level := CASE
    WHEN v_score <= 30 THEN 'baixo'
    WHEN v_score <= 60 THEN 'medio'
    WHEN v_score <= 80 THEN 'alto'
    ELSE 'critico' END;

  INSERT INTO partner_risk_scores (partner_id, score, risk_level, dias_medio_atraso, titulos_vencidos, pct_credito_utilizado, freq_compras_30d, meses_relacionamento, calculado_em)
  VALUES (p_partner_id, v_score, v_level, v_dias_atraso, v_vencidos, v_pct, v_freq, COALESCE(v_meses,0), now())
  ON CONFLICT (partner_id) DO UPDATE SET
    score = EXCLUDED.score,
    risk_level = EXCLUDED.risk_level,
    dias_medio_atraso = EXCLUDED.dias_medio_atraso,
    titulos_vencidos = EXCLUDED.titulos_vencidos,
    pct_credito_utilizado = EXCLUDED.pct_credito_utilizado,
    freq_compras_30d = EXCLUDED.freq_compras_30d,
    meses_relacionamento = EXCLUDED.meses_relacionamento,
    calculado_em = now()
  RETURNING * INTO v_row;

  INSERT INTO financial_governance_audit_log(usuario_id, partner_id, acao, dados_novos)
  VALUES (auth.uid(), p_partner_id, 'score_recalculado', to_jsonb(v_row));

  RETURN v_row;
END;$function$;
CREATE OR REPLACE FUNCTION public.refresh_partner_engagement(p_partner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_last timestamptz; v_30 int; v_90 int;
BEGIN
  SELECT MAX(created_at), COUNT(*) FILTER (WHERE created_at > now() - interval '30 days'),
         COUNT(*) FILTER (WHERE created_at > now() - interval '90 days')
  INTO v_last, v_30, v_90
  FROM public.partner_orders WHERE partner_id = p_partner_id;

  INSERT INTO public.partner_engagement_metrics(partner_id, ultima_compra, dias_sem_compra, pedidos_30d, pedidos_90d, updated_at)
  VALUES (p_partner_id, v_last,
          CASE WHEN v_last IS NULL THEN NULL ELSE EXTRACT(DAY FROM now() - v_last)::int END,
          COALESCE(v_30,0), COALESCE(v_90,0), now())
  ON CONFLICT (partner_id) DO UPDATE SET
    ultima_compra = EXCLUDED.ultima_compra,
    dias_sem_compra = EXCLUDED.dias_sem_compra,
    pedidos_30d = EXCLUDED.pedidos_30d,
    pedidos_90d = EXCLUDED.pedidos_90d,
    updated_at = now();
END $function$;
CREATE OR REPLACE FUNCTION public.register_my_login_redirect_secure(p_context text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_available jsonb;
BEGIN
  IF v_uid IS NULL OR NOT platform_private.platform_actor_access_ready(v_uid) OR public.h15_actor_organization() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_context IS NULL OR p_context NOT IN ('b2b','technical','admin') THEN
    RAISE EXCEPTION 'invalid context %', p_context;
  END IF;

  v_available := public.get_my_available_portal_contexts();

  IF NOT (v_available->'available_contexts' ? p_context) THEN
    INSERT INTO public.user_context_access_logs (
      user_id, context_code, action, previous_context, metadata
    ) VALUES (
      v_uid, p_context, 'access_denied', NULL,
      jsonb_build_object('reason','context_not_available','source','login_redirect')
    );

    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'context_not_available',
      'context', p_context
    );
  END IF;

  -- Metadata fixa; frontend não escolhe.
  INSERT INTO public.user_context_access_logs (
    user_id, context_code, action, previous_context, metadata
  ) VALUES (
    v_uid, p_context, 'login_redirect', NULL,
    jsonb_build_object('source','auto')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'context', p_context,
    'action', 'login_redirect'
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_portal_partner_financial()
 RETURNS TABLE(partner_order_id uuid, numero text, receivable_id uuid, total numeric, vencimento date, financial_status text, payment_method text, ar_status text, installments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    po.id, po.numero, ar.id, po.total, po.payment_due_date, po.financial_status, po.payment_method, ar.status,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', i.installment_number, 'vencimento', i.due_date,
        'valor', i.original_amount, 'recebido', i.received_amount, 'status', i.status
      ) ORDER BY i.installment_number)
      FROM public.accounts_receivable_installments i WHERE i.receivable_id = ar.id
    ), '[]'::jsonb)
  FROM public.partner_orders po
  JOIN public.partner_order_financial_links l ON l.partner_order_id = po.id
  JOIN public.accounts_receivable ar ON ar.id = l.receivable_id
  WHERE po.partner_id IN (SELECT partner_id FROM public.partner_users WHERE user_id = v_uid)
  ORDER BY po.created_at DESC;
END $function$;
CREATE OR REPLACE FUNCTION public.rpc_portal_partner_financial(p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(partner_order_id uuid, numero text, receivable_id uuid, total numeric, vencimento date, financial_status text, payment_method text, ar_status text, installments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean := (has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor_comercial'::app_role));
  v_filter_partner uuid;
BEGIN
  IF p_partner_id IS NOT NULL THEN
    IF NOT v_is_staff THEN
      -- Parceiro só pode ver o próprio; ignora tentativa de simular
      v_filter_partner := NULL;
    ELSE
      v_filter_partner := p_partner_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    po.id, po.numero, ar.id, po.total, po.payment_due_date, po.financial_status, po.payment_method, ar.status,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', i.installment_number, 'vencimento', i.due_date,
        'valor', i.original_amount, 'recebido', i.received_amount, 'status', i.status
      ) ORDER BY i.installment_number)
      FROM public.accounts_receivable_installments i WHERE i.receivable_id = ar.id
    ), '[]'::jsonb)
  FROM public.partner_orders po
  JOIN public.partner_order_financial_links l ON l.partner_order_id = po.id
  JOIN public.accounts_receivable ar ON ar.id = l.receivable_id
  WHERE
    (
      v_filter_partner IS NOT NULL AND po.partner_id = v_filter_partner
    )
    OR (
      v_filter_partner IS NULL AND po.partner_id IN (SELECT partner_id FROM public.partner_users WHERE user_id = v_uid)
    )
  ORDER BY po.created_at DESC;
END $function$;
CREATE OR REPLACE FUNCTION public.saas_feature_override_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'saas_history_immutable: exceções não podem ser apagadas' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.feature_id IS DISTINCT FROM OLD.feature_id
    OR NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.limit_value IS DISTINCT FROM OLD.limit_value
    OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
    OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.ended_at IS NOT NULL
    OR NEW.ended_at IS NULL
    OR NEW.ended_by IS NULL
    OR NULLIF(btrim(NEW.end_reason), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'saas_history_immutable: somente encerramento auditado é permitido' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public.saas_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'saas_history_immutable: dados de assinatura não podem ser apagados' USING ERRCODE='42501';
END;
$function$;
CREATE OR REPLACE FUNCTION public.saas_plan_version_feature_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_plan uuid; v_status text;
BEGIN
  SELECT plan_id,status INTO v_plan,v_status FROM public.saas_plan_versions WHERE id=COALESCE(NEW.plan_version_id,OLD.plan_version_id);
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'saas_version_immutable: conteúdo publicado não pode ser alterado'; END IF;
  IF session_user='authenticator' AND NOT platform_private.has_ticket('saas_plan_version_write',v_plan) THEN
    RAISE EXCEPTION 'platform_forbidden: conteúdo alterado fora do fluxo autorizado' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public.saas_plan_version_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF session_user = 'authenticator' AND NOT platform_private.has_ticket('saas_plan_version_create', NEW.plan_id) THEN
    RAISE EXCEPTION 'platform_forbidden: versão criada fora do fluxo autorizado' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.saas_plan_version_no_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.status IN ('PUBLISHED','ARCHIVED') THEN
    IF OLD.status='PUBLISHED' AND NEW.status='ARCHIVED'
       AND platform_private.has_ticket('saas_plan_version_archive',OLD.plan_id) THEN RETURN NEW; END IF;
    -- Única alteração permitida em versão publicada: encerrar a vigência aberta
    -- desta versão exata, pela publicação da sucessora, sem tocar em outro campo.
    IF OLD.status='PUBLISHED' AND NEW.status='PUBLISHED'
       AND OLD.effective_to IS NULL AND NEW.effective_to IS NOT NULL
       AND NEW.effective_to > OLD.effective_from
       AND (to_jsonb(NEW) - 'effective_to' - 'updated_at') = (to_jsonb(OLD) - 'effective_to' - 'updated_at')
       AND platform_private.has_ticket('saas_plan_version_supersede',OLD.id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'saas_version_immutable: versão publicada não pode ser alterada';
  END IF;
  IF OLD.status='DRAFT' AND NOT platform_private.has_ticket('saas_plan_version_write',OLD.plan_id) THEN
    RAISE EXCEPTION 'platform_forbidden: rascunho alterado fora do fluxo autorizado' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $function$;
CREATE OR REPLACE FUNCTION public.saas_subscription_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_reason text;
  v_action text;
  v_correlation uuid;
BEGIN
  v_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    IF v_old = v_new THEN RETURN NEW; END IF;
  END IF;
  v_reason := nullif(current_setting('app.saas_change_reason', true), '');
  v_action := nullif(current_setting('app.saas_change_action', true), '');
  BEGIN
    v_correlation := nullif(current_setting('app.saas_correlation_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_correlation := NULL;
  END;
  INSERT INTO public.organization_subscription_history(
    subscription_id, organization_id, actor_user_id, source, reason,
    old_values, new_values, action, correlation_id,
    previous_status, new_status, previous_plan_id, new_plan_id,
    previous_plan_version_id, new_plan_version_id,
    price_snapshot, currency_snapshot, billing_cycle_snapshot, limits_snapshot
  ) VALUES (
    NEW.id, NEW.organization_id, auth.uid(),
    CASE WHEN v_action = 'expire_trial' THEN 'system' ELSE 'rpc' END,
    COALESCE(v_reason, CASE WHEN TG_OP = 'INSERT' THEN 'subscription_created' ELSE 'subscription_updated' END),
    v_old, v_new, COALESCE(v_action, lower(TG_OP)), v_correlation,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_id ELSE NULL END,
    NEW.plan_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_version_id ELSE NULL END,
    NEW.plan_version_id,
    NEW.price_snapshot, NEW.currency_snapshot, NEW.billing_cycle_snapshot, NEW.limits_snapshot
  );
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.saas_subscription_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF session_user = 'authenticator' AND NOT platform_private.has_ticket('saas_subscription_write', NEW.organization_id) THEN
    RAISE EXCEPTION 'platform_forbidden: assinatura alterada fora do fluxo autorizado' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.saas_subscription_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'organization_subscriptions não pode ser removida; use status CANCELLED/EXPIRED'
    USING ERRCODE = '42501';
END;
$function$;
CREATE OR REPLACE FUNCTION public.saas_subscription_require_published_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_status text; v_trial_days integer;
BEGIN
 IF NEW.plan_version_id IS NULL THEN RETURN NEW; END IF;
 SELECT status,trial_days INTO v_status,v_trial_days FROM public.saas_plan_versions WHERE id=NEW.plan_version_id;
 IF v_status IS DISTINCT FROM 'PUBLISHED' THEN RAISE EXCEPTION 'platform_invalid: assinatura exige versão publicada' USING ERRCODE='22023'; END IF;
 IF NEW.status='TRIAL' AND TG_OP='INSERT' THEN
  IF v_trial_days IS NULL THEN RAISE EXCEPTION 'platform_invalid: versão sem período de teste'; END IF;
  NEW.trial_ends_at:=coalesce(NEW.started_at,now())+make_interval(days=>v_trial_days);
 END IF;
 RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.saas_trial_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP='INSERT' AND NEW.status='TRIAL' AND NEW.plan_version_id IS NOT NULL AND (NEW.started_at IS NULL OR NEW.trial_ends_at IS NULL OR NEW.trial_ends_at<>NEW.started_at+interval '14 days') THEN
    RAISE EXCEPTION 'platform_invalid: trial novo deve ter exatamente 14 dias' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_codigo_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.codigo_cliente IS NULL OR NEW.codigo_cliente = '' THEN
    NEW.codigo_cliente := lpad(nextval('public.clientes_codigo_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_my_context_preference(p_context text, p_remember boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_previous text;
  v_action text;
  v_available jsonb;
BEGIN
  IF v_uid IS NULL OR NOT platform_private.platform_actor_access_ready(v_uid) OR public.h15_actor_organization() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_context IS NULL OR p_context NOT IN ('b2b','technical','admin') THEN
    RAISE EXCEPTION 'invalid context %', p_context;
  END IF;

  v_available := public.get_my_available_portal_contexts();

  IF NOT (v_available->'available_contexts' ? p_context) THEN
    -- Grava auditoria e retorna erro em JSON (sem RAISE).
    -- Sem exception, sem rollback: o INSERT persiste.
    INSERT INTO public.user_context_access_logs (
      user_id, context_code, action, previous_context, metadata
    ) VALUES (
      v_uid, p_context, 'access_denied', NULL,
      jsonb_build_object('reason','context_not_available')
    );

    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'context_not_available',
      'context', p_context
    );
  END IF;

  SELECT last_context INTO v_previous
  FROM public.user_access_preferences
  WHERE user_id = v_uid;

  -- Upsert com semântica correta para p_remember=false (limpar preferência)
  INSERT INTO public.user_access_preferences (
    user_id, last_context, preferred_context, skip_context_selector
  ) VALUES (
    v_uid,
    p_context,
    CASE WHEN p_remember THEN p_context ELSE NULL END,
    COALESCE(p_remember, false)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET last_context = EXCLUDED.last_context,
        preferred_context = CASE
          WHEN p_remember THEN EXCLUDED.last_context
          ELSE NULL
        END,
        skip_context_selector = COALESCE(p_remember, false),
        updated_at = now();

  v_action := CASE
    WHEN v_previous IS NULL THEN 'context_selected'
    WHEN v_previous = p_context THEN 'context_selected'
    ELSE 'context_switched'
  END;

  INSERT INTO public.user_context_access_logs (
    user_id, context_code, action, previous_context, metadata
  ) VALUES (
    v_uid, p_context, v_action, v_previous,
    jsonb_build_object('remember', COALESCE(p_remember, false))
  );

  RETURN jsonb_build_object(
    'ok', true,
    'context', p_context,
    'remembered', COALESCE(p_remember, false)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_partner_user_papel(p_link_id uuid, p_papel text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_role public.app_role;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial')) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  IF p_papel NOT IN ('gestor','tecnico') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_papel;
  END IF;

  UPDATE public.partner_users SET papel = p_papel WHERE id = p_link_id
    RETURNING user_id INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Vínculo não encontrado';
  END IF;

  v_role := CASE WHEN p_papel = 'tecnico' THEN 'parceiro_b2b_tecnico'::public.app_role
                 ELSE 'parceiro_b2b'::public.app_role END;

  DELETE FROM public.user_roles
   WHERE user_id = v_user_id
     AND role IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role);

  INSERT INTO public.user_roles(user_id, role)
  VALUES (v_user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_puc_to_ptc_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assignment_type = 'tecnico'
     AND (NEW.user_role = 'parceiro_b2b_tecnico' OR public.has_role(NEW.user_id, 'parceiro_b2b_tecnico'::app_role))
  THEN
    INSERT INTO public.partner_technician_clients (partner_id, technician_user_id, cliente_id, assigned_by, active, notes)
    VALUES (NEW.partner_id, NEW.user_id, NEW.cliente_id, NEW.assigned_by, NEW.active, NEW.notes)
    ON CONFLICT (partner_id, technician_user_id, cliente_id)
    DO UPDATE SET active = EXCLUDED.active, updated_at = now(), notes = EXCLUDED.notes;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_user_cliente_principal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_users uuid[] := '{}';
  v_principal uuid;
  v_marked uuid;
BEGIN
  -- Reconcilia TODOS os usuários afetados: NEW e OLD (UPDATE de user_id
  -- reconcilia o usuário antigo e o novo; nenhum dado é reatribuído).
  -- Coleta por evento: cada trigger statement só executa o branch cuja
  -- transition table existe (plpgsql planeja cada statement na 1ª execução).
  IF TG_OP = 'INSERT' THEN
    FOR v_user IN SELECT DISTINCT n.user_id FROM new_rows n LOOP
      v_users := v_users || v_user;
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR v_user IN SELECT DISTINCT o.user_id FROM old_rows o LOOP
      v_users := v_users || v_user;
    END LOOP;
  ELSE
    FOR v_user IN
      SELECT n.user_id FROM new_rows n
      UNION
      SELECT o.user_id FROM old_rows o
    LOOP
      v_users := v_users || v_user;
    END LOOP;
  END IF;

  FOREACH v_user IN ARRAY v_users LOOP
    -- 1) Rebaixa principais não vigentes (inativo, revogado, futuro, expirado).
    --    Só emite UPDATE quando há trabalho: é o que encerra a recursão.
    IF EXISTS (
      SELECT 1 FROM public.user_clientes
       WHERE user_id = v_user AND principal = true
         AND NOT (is_active AND revoked_at IS NULL
                  AND valid_from <= now()
                  AND (valid_until IS NULL OR valid_until >= now()))
    ) THEN
      UPDATE public.user_clientes
         SET principal = false
       WHERE user_id = v_user
         AND principal = true
         AND NOT (is_active AND revoked_at IS NULL
                  AND valid_from <= now()
                  AND (valid_until IS NULL OR valid_until >= now()));
    END IF;

    -- 2) Principal explicitamente marcado e vigente neste comando vence;
    --    desempate determinístico (created_at, id) se houver mais de um
    IF TG_OP = 'DELETE' THEN
      v_marked := NULL;
    ELSE
      SELECT uc.id INTO v_marked
        FROM new_rows n
        JOIN public.user_clientes uc ON uc.id = n.id
       WHERE n.user_id = v_user AND n.principal
         AND uc.is_active AND uc.revoked_at IS NULL
         AND uc.valid_from <= now()
         AND (uc.valid_until IS NULL OR uc.valid_until >= now())
       ORDER BY uc.created_at ASC, uc.id ASC
       LIMIT 1;
    END IF;
    IF v_marked IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.user_clientes
                    WHERE user_id = v_user AND id <> v_marked AND principal = true) THEN
      UPDATE public.user_clientes
         SET principal = false
       WHERE user_id = v_user
         AND id <> v_marked
         AND principal = true;
    END IF;

    -- 3) Garante exatamente um principal vigente (mais antigo; desempate por id)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_clientes
       WHERE user_id = v_user AND principal = true
         AND is_active AND revoked_at IS NULL
         AND valid_from <= now()
         AND (valid_until IS NULL OR valid_until >= now())
    ) AND EXISTS (
      SELECT 1 FROM public.user_clientes
       WHERE user_id = v_user
         AND is_active AND revoked_at IS NULL
         AND valid_from <= now()
         AND (valid_until IS NULL OR valid_until >= now())
    ) THEN
      UPDATE public.user_clientes
         SET principal = true
       WHERE id = (
         SELECT id FROM public.user_clientes
          WHERE user_id = v_user
            AND is_active AND revoked_at IS NULL
            AND valid_from <= now()
            AND (valid_until IS NULL OR valid_until >= now())
          ORDER BY created_at ASC, id ASC
          LIMIT 1
       );
    END IF;

    -- 4) profiles.cliente_id SOMENTE com principal vigente (ou NULL);
    --    nunca aponta para vínculo histórico/revogado
    SELECT cliente_id INTO v_principal
      FROM public.user_clientes
     WHERE user_id = v_user AND principal = true
       AND is_active AND revoked_at IS NULL
       AND valid_from <= now()
       AND (valid_until IS NULL OR valid_until >= now())
     LIMIT 1;

    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE user_id = v_user AND cliente_id IS DISTINCT FROM v_principal) THEN
      UPDATE public.profiles
         SET cliente_id = v_principal
       WHERE user_id = v_user
         AND cliente_id IS DISTINCT FROM v_principal;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_audit_partner_order_commercial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.priority IS DISTINCT FROM OLD.priority OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.commercial_audit_log(usuario_id, partner_id, order_id, acao, dados_anteriores, dados_novos)
    VALUES (
      auth.uid(), NEW.partner_id, NEW.id, 'partner_orders.commercial_change',
      jsonb_build_object('status', OLD.status, 'priority', OLD.priority),
      jsonb_build_object('status', NEW.status, 'priority', NEW.priority)
    );
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_auto_b2b_receivable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
  v_should boolean := false;
BEGIN
  SELECT * INTO v_settings FROM public.partner_financial_settings WHERE partner_id = NEW.partner_id AND active = true;
  IF NOT FOUND OR NOT v_settings.auto_generate_receivable THEN RETURN NEW; END IF;
  IF NEW.receivable_generated THEN RETURN NEW; END IF;

  IF v_settings.billing_trigger = 'na_aprovacao' AND NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM 'aprovado' THEN
    v_should := true;
  ELSIF v_settings.billing_trigger = 'na_entrega' AND NEW.status = 'entregue' AND OLD.status IS DISTINCT FROM 'entregue' THEN
    v_should := true;
  ELSIF v_settings.billing_trigger = 'na_producao_finalizada' AND NEW.status = 'produzido' AND OLD.status IS DISTINCT FROM 'produzido' THEN
    v_should := true;
  END IF;

  IF v_should THEN
    BEGIN
      PERFORM public.generate_b2b_receivable_secure(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)
      VALUES (NEW.id, NEW.partner_id, 'financeiro_auto_falhou', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_b2b_block_receivable_before_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status partner_order_status;
BEGIN
  IF NEW.partner_order_id IS NULL THEN RETURN NEW; END IF;
  SELECT status INTO v_status FROM public.partner_orders WHERE id = NEW.partner_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF NOT public.fn_b2b_status_is_approved_or_later(v_status) THEN
    RAISE EXCEPTION 'receivable_requires_approved_order: status=%', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.tg_b2b_enforce_plan_selectable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_plan_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.payment_plan_id IS NOT DISTINCT FROM OLD.payment_plan_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.fn_b2b_plan_selectable(NEW.payment_plan_id) THEN
    RAISE EXCEPTION 'plan_not_selectable';
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.tg_block_partner_order_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.partner_order_has_production(OLD.id) THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores)
    VALUES (OLD.id, OLD.partner_id, auth.uid(), 'exclusao_bloqueada', to_jsonb(OLD));
    RAISE EXCEPTION 'Pedido com Ordem de Produção vinculada não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_block_partner_order_edit_after_op()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_locked boolean;
BEGIN
  v_locked := public.partner_order_has_production(OLD.id);
  IF NOT v_locked THEN
    RETURN NEW;
  END IF;

  -- Campos sempre permitidos
  -- status, ready_for_production, approved_by, approved_at, approval_notes,
  -- estimated_delivery_date, observacoes, updated_at, future_financial_link

  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.desconto_total IS DISTINCT FROM OLD.desconto_total
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.requested_delivery_date IS DISTINCT FROM OLD.requested_delivery_date
  THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (OLD.id, OLD.partner_id, auth.uid(), 'edicao_bloqueada',
            to_jsonb(OLD), to_jsonb(NEW));
    RAISE EXCEPTION 'Este pedido já possui Ordem de Produção vinculada e não pode mais ser alterado.';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_block_partner_order_items_after_op()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF public.partner_order_has_production(v_order_id) THEN
    INSERT INTO public.partner_order_audit_logs (order_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (v_order_id, auth.uid(),
            CASE WHEN TG_OP='DELETE' THEN 'exclusao_item_bloqueada' ELSE 'edicao_item_bloqueada' END,
            CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
            CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
    RAISE EXCEPTION 'Itens do pedido não podem ser alterados após a geração da Ordem de Produção.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_block_planning_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.production_order_link WHERE planning_id = OLD.id) THEN
    RAISE EXCEPTION 'Planejamento com OP gerada não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_block_pofl_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Rollback controlado: somente administrador e somente apos cancelamento
  -- canonico do recebivel (cancel_b2b_receivable_secure).
  IF COALESCE(OLD.financial_status, '') = 'cancelado'
     AND auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'administrador'::app_role) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Vínculo financeiro não pode ser excluído';
END $function$;
CREATE OR REPLACE FUNCTION public.tg_block_production_link_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_os_status text;
BEGIN
  SELECT status::text INTO v_os_status FROM public.ordens_servico WHERE id = OLD.ordem_servico_id;
  IF v_os_status IS NOT NULL AND v_os_status <> 'aberta' THEN
    RAISE EXCEPTION 'Vínculo de produção não pode ser excluído após início/finalização da produção.';
  END IF;
  RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_commercial_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pid uuid;
  v_oid uuid;
BEGIN
  v_pid := COALESCE((to_jsonb(NEW)->>'partner_id')::uuid, (to_jsonb(OLD)->>'partner_id')::uuid);
  v_oid := COALESCE((to_jsonb(NEW)->>'order_id')::uuid, (to_jsonb(OLD)->>'order_id')::uuid);
  IF TG_TABLE_NAME = 'partner_orders' THEN
    v_oid := COALESCE(NEW.id, OLD.id);
  END IF;
  INSERT INTO public.commercial_audit_log(usuario_id, partner_id, order_id, acao, dados_anteriores, dados_novos)
  VALUES (
    auth.uid(),
    v_pid,
    v_oid,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END $function$;
CREATE OR REPLACE FUNCTION public.tg_commercial_conditions_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_cpp_guard_financial_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.fn_b2b_plan_referenced(OLD.id) THEN
      RAISE EXCEPTION 'plan_referenced_delete_blocked';
    END IF;
    RETURN OLD;
  END IF;

  IF public.fn_b2b_plan_referenced(OLD.id) AND (
       NEW.discount_percent IS DISTINCT FROM OLD.discount_percent
    OR NEW.monthly_interest_percent IS DISTINCT FROM OLD.monthly_interest_percent
    OR NEW.interest_type IS DISTINCT FROM OLD.interest_type
    OR NEW.installment_count IS DISTINCT FROM OLD.installment_count
    OR NEW.months_count IS DISTINCT FROM OLD.months_count
    OR NEW.max_days IS DISTINCT FROM OLD.max_days
    OR NEW.pricing_mode IS DISTINCT FROM OLD.pricing_mode
    OR NEW.minimum_order_amount IS DISTINCT FROM OLD.minimum_order_amount
    OR NEW.plan_type IS DISTINCT FROM OLD.plan_type
  ) THEN
    RAISE EXCEPTION 'plan_financial_immutable_create_new_version';
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.tg_create_default_pfs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.partner_financial_settings(partner_id) VALUES (NEW.id)
  ON CONFLICT (partner_id) DO NOTHING;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_fiscal_cfs_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
  v_new   jsonb;
  v_old   jsonb;
BEGIN
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_new := jsonb_build_object(
      'id',                     NEW.id,
      'configuration_status',   NEW.configuration_status,
      'fiscal_environment',     NEW.fiscal_environment,
      'nfe_provider',           NEW.nfe_provider,
      'nfse_provider',          NEW.nfse_provider,
      'nfe_enabled',            NEW.nfe_enabled,
      'nfse_enabled',           NEW.nfse_enabled,
      'production_enabled',     NEW.production_enabled,
      'configuration_version',  NEW.configuration_version,
      'last_validation_status', NEW.last_validation_status,
      'nfe_config_field_count',  public.jsonb_object_keys_count(NEW.nfe_configuration),
      'nfse_config_field_count', public.jsonb_object_keys_count(NEW.nfse_configuration),
      'has_nfe_credential_ref',  (NEW.nfe_credential_ref  IS NOT NULL),
      'has_nfse_credential_ref', (NEW.nfse_credential_ref IS NOT NULL),
      'has_certificate_ref',     (NEW.certificate_ref     IS NOT NULL),
      'has_webhook_ref',         (NEW.webhook_ref         IS NOT NULL),
      'has_configuration_notes', (NEW.configuration_notes IS NOT NULL)
    );
    INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_actor, v_new);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := jsonb_build_object(
      'id',                     OLD.id,
      'configuration_status',   OLD.configuration_status,
      'fiscal_environment',     OLD.fiscal_environment,
      'nfe_provider',           OLD.nfe_provider,
      'nfse_provider',          OLD.nfse_provider,
      'nfe_enabled',            OLD.nfe_enabled,
      'nfse_enabled',           OLD.nfse_enabled,
      'production_enabled',     OLD.production_enabled,
      'configuration_version',  OLD.configuration_version,
      'last_validation_status', OLD.last_validation_status,
      'nfe_config_field_count',  public.jsonb_object_keys_count(OLD.nfe_configuration),
      'nfse_config_field_count', public.jsonb_object_keys_count(OLD.nfse_configuration),
      'has_nfe_credential_ref',  (OLD.nfe_credential_ref  IS NOT NULL),
      'has_nfse_credential_ref', (OLD.nfse_credential_ref IS NOT NULL),
      'has_certificate_ref',     (OLD.certificate_ref     IS NOT NULL),
      'has_webhook_ref',         (OLD.webhook_ref         IS NOT NULL),
      'has_configuration_notes', (OLD.configuration_notes IS NOT NULL)
    );
    v_new := jsonb_build_object(
      'id',                     NEW.id,
      'configuration_status',   NEW.configuration_status,
      'fiscal_environment',     NEW.fiscal_environment,
      'nfe_provider',           NEW.nfe_provider,
      'nfse_provider',          NEW.nfse_provider,
      'nfe_enabled',            NEW.nfe_enabled,
      'nfse_enabled',           NEW.nfse_enabled,
      'production_enabled',     NEW.production_enabled,
      'configuration_version',  NEW.configuration_version,
      'last_validation_status', NEW.last_validation_status,
      'nfe_config_field_count',  public.jsonb_object_keys_count(NEW.nfe_configuration),
      'nfse_config_field_count', public.jsonb_object_keys_count(NEW.nfse_configuration),
      'has_nfe_credential_ref',  (NEW.nfe_credential_ref  IS NOT NULL),
      'has_nfse_credential_ref', (NEW.nfse_credential_ref IS NOT NULL),
      'has_certificate_ref',     (NEW.certificate_ref     IS NOT NULL),
      'has_webhook_ref',         (NEW.webhook_ref         IS NOT NULL),
      'has_configuration_notes', (NEW.configuration_notes IS NOT NULL)
    );
    INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_actor, v_old, v_new);
    RETURN NEW;
  END IF;

  -- DELETE não é auditado por este trigger (policy nega DELETE nesta tabela).
  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_fiscal_emitter_refresh_readiness()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.nfe_readiness_pendencies := public.fn_fiscal_emitter_pendencies_row(NEW);
  NEW.nfe_readiness_status := CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.nfe_readiness_pendencies) e WHERE e->>'severity'='BLOCK') THEN 'NOT_READY'
    WHEN jsonb_array_length(NEW.nfe_readiness_pendencies) > 0 THEN 'PARTIAL'
    ELSE 'READY_HOMOLOGATION' END;  -- teto absoluto da F3
  NEW.nfe_readiness_checked_at := now();
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_fiscal_homologation_evidence_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.sefaz_homologation_at IS DISTINCT FROM OLD.sefaz_homologation_at)
     OR (NEW.sefaz_homologation_evidence IS DISTINCT FROM OLD.sefaz_homologation_evidence) THEN
    IF coalesce(current_setting('fiscal.homologation_ctx', true), '') <> 'controlled-rpc' THEN
      RAISE EXCEPTION 'FISCAL_HOMOLOGATION_EVIDENCE_IMMUTABLE: prova de homologacao SEFAZ nao pode ser alterada por UPDATE direto.'
        USING HINT = 'A transicao ocorrera somente por RPC controlada e auditada em fase posterior.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_fiscal_operation_policy_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.policy_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'FISCAL_POLICY_IMMUTABLE: politica publicada nao pode ser excluida (id=%)', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.policy_status = 'PUBLISHED' AND NEW.policy_status = 'PUBLISHED' THEN
    IF (OLD.cfop, OLD.nature_operation, OLD.direction, OLD.origin_uf, OLD.destination_uf,
        OLD.crt, OLD.ncm_prefix, OLD.final_consumer, OLD.taxpayer_indicator,
        OLD.valid_from, OLD.valid_until, OLD.source_id, OLD.legal_basis)
       IS DISTINCT FROM
       (NEW.cfop, NEW.nature_operation, NEW.direction, NEW.origin_uf, NEW.destination_uf,
        NEW.crt, NEW.ncm_prefix, NEW.final_consumer, NEW.taxpayer_indicator,
        NEW.valid_from, NEW.valid_until, NEW.source_id, NEW.legal_basis) THEN
      RAISE EXCEPTION 'FISCAL_POLICY_IMMUTABLE: politica publicada e imutavel; crie nova vigencia (id=%)', OLD.id;
    END IF;
  END IF;
  IF OLD.policy_status = 'PUBLISHED' AND NEW.policy_status = 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_POLICY_IMMUTABLE: politica publicada nao retorna a DRAFT (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_governance_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid;
BEGIN
  v_partner := CASE WHEN TG_TABLE_NAME='partner_financial_settings' THEN COALESCE(NEW.partner_id, OLD.partner_id) ELSE NULL END;
  INSERT INTO financial_governance_audit_log(usuario_id, partner_id, acao, dados_anteriores, dados_novos)
  VALUES (auth.uid(), v_partner,
    TG_TABLE_NAME || '_' || lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;$function$;
CREATE OR REPLACE FUNCTION public.tg_notify_payment_terms_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_should_notify boolean := false;
  v_msg text;
BEGIN
  IF NEW.requires_financial_approval IS DISTINCT FROM true
     OR NEW.financial_approval_status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := true;
  ELSE
    -- Só notifica quando entra em pending vindo de outro estado
    IF COALESCE(OLD.requires_financial_approval, false) = false
       OR COALESCE(OLD.financial_approval_status, 'not_required') <> 'pending' THEN
      v_should_notify := true;
    END IF;
  END IF;

  IF NOT v_should_notify THEN
    RETURN NEW;
  END IF;

  v_msg := format('Pedido B2B %s aguarda aprovação da condição de pagamento.', COALESCE(NEW.numero,''));

  PERFORM public._notify_role(
    'financeiro'::app_role,
    'b2b_payment_terms_pending',
    'Aprovação financeira pendente',
    v_msg,
    '/comercial/pedidos-b2b'
  );
  PERFORM public._notify_role(
    'administrador'::app_role,
    'b2b_payment_terms_pending',
    'Aprovação financeira pendente',
    v_msg,
    '/comercial/pedidos-b2b'
  );
  PERFORM public._notify_role(
    'gestor_comercial'::app_role,
    'b2b_payment_terms_pending',
    'Aprovação financeira pendente',
    v_msg,
    '/comercial/pedidos-b2b'
  );

  -- Notifica também o criador do pedido, se identificado
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link, lido)
    VALUES (
      NEW.created_by,
      'b2b_payment_terms_pending',
      'Aprovação financeira pendente',
      v_msg,
      '/comercial/pedidos-b2b',
      false
    );
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_partner_order_items_resolve_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status partner_order_status;
  v_pid uuid;
BEGIN
  SELECT status, partner_id INTO v_status, v_pid
    FROM public.partner_orders WHERE id = NEW.order_id FOR UPDATE;

  IF v_status = 'aguardando_itens' THEN
    UPDATE public.partner_orders
       SET status = 'em_analise_comercial',
           itens_pendentes_resolvido_em = now(),
           updated_at = now()
     WHERE id = NEW.order_id
       AND status = 'aguardando_itens';

    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.order_id, v_pid, auth.uid(), 'items_added',
            jsonb_build_object('status','aguardando_itens'),
            jsonb_build_object('status','em_analise_comercial','item_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_partner_orders_credit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_amount numeric(14,2);
  v_should_check boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('rascunho') THEN v_should_check := true; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.credit_approved_by IS NOT NULL
       AND NEW.status = 'em_analise_comercial'
       AND OLD.status = 'aguardando_aprovacao_credito'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    IF OLD.credit_approved_by IS NOT NULL
       AND NEW.status = 'aprovado'
       AND OLD.status = 'em_analise_comercial'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('em_analise_comercial','aprovado') THEN
      v_should_check := true;
    ELSIF (NEW.total IS DISTINCT FROM OLD.total
        OR NEW.final_amount_with_interest IS DISTINCT FROM OLD.final_amount_with_interest)
       AND NEW.status IN ('em_analise_comercial','aprovado','aguardando_aprovacao_credito') THEN
      v_should_check := true;
    END IF;
  END IF;

  IF NOT v_should_check THEN RETURN NEW; END IF;

  -- Serializa a avaliacao de credito por parceiro dentro da transacao corrente.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || NEW.partner_id::text, 0));

  v_amount := ROUND(COALESCE(NEW.final_amount_with_interest, NEW.total, 0), 2);
  v := public.fn_b2b_credit_exposure(NEW.partner_id, v_amount, NEW.id);

  IF (v->>'block_if_overdue')::boolean AND (v->>'tem_vencidos')::boolean THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := 'inadimplencia';
    RETURN NEW;
  END IF;

  IF COALESCE((v->>'credit_limit')::numeric,0) > 0
     AND (v->>'exposicao_projetada')::numeric > (v->>'credit_limit')::numeric THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := CASE
      WHEN (v->>'credit_limit_action') = 'approval_required' THEN 'limite_excedido'
      ELSE 'limite_excedido_bloqueado'
    END;
  END IF;

  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_partner_orders_require_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NEW.status = 'aprovado' AND (OLD.status IS DISTINCT FROM 'aprovado') THEN
    SELECT count(*) INTO v_count
      FROM public.partner_order_items
     WHERE order_id = NEW.id;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'no_items: pedido sem itens — não pode ser aprovado';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_pfs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$;
CREATE OR REPLACE FUNCTION public.tg_pofl_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$;
CREATE OR REPLACE FUNCTION public.tg_ptc_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;
CREATE OR REPLACE FUNCTION public.tg_recalc_planning_from_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.recalc_partner_order_production(NEW.partner_order_id);
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_recalc_risk_on_ar_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid;
BEGIN
  SELECT ar.partner_id INTO v_partner
  FROM public.accounts_receivable ar
  WHERE ar.id = COALESCE(NEW.receivable_id, OLD.receivable_id)
    AND ar.origin_type = 'B2B_ORDER';
  IF v_partner IS NOT NULL THEN
    PERFORM public.recalc_partner_risk_score(v_partner);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_refresh_engagement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.refresh_partner_engagement(COALESCE(NEW.partner_id, OLD.partner_id));
  RETURN COALESCE(NEW, OLD);
END $function$;
CREATE OR REPLACE FUNCTION public.tg_set_current_price_table()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE public.partner_product_prices
       SET is_current = false, ativo = false, updated_at = now()
     WHERE partner_id = NEW.partner_id
       AND product_id = NEW.product_id
       AND id <> NEW.id
       AND is_current = true;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_sync_b2b_financial_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link record;
  v_new text;
BEGIN
  SELECT * INTO v_link FROM public.partner_order_financial_links WHERE receivable_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_new := CASE NEW.status
    WHEN 'PAID' THEN 'recebido'
    WHEN 'PARTIAL' THEN 'parcial'
    WHEN 'OVERDUE' THEN 'vencido'
    WHEN 'CANCELED' THEN 'cancelado'
    ELSE 'gerado'
  END;

  UPDATE public.partner_orders SET financial_status = v_new WHERE id = v_link.partner_order_id;
  UPDATE public.partner_order_financial_links SET financial_status = v_new WHERE id = v_link.id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)
  VALUES (v_link.partner_order_id, v_link.partner_id, 'financeiro_status_alterado',
    jsonb_build_object('ar_status', NEW.status, 'novo', v_new));

  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_unique_current_price_table()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_current THEN
    UPDATE public.partner_product_prices
       SET is_current = false
     WHERE partner_id = NEW.partner_id
       AND product_id = NEW.product_id
       AND id <> NEW.id
       AND is_current = true;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_user_access_preferences_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_clientes_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    old_val JSONB := NULL;
    new_val JSONB := NULL;
    v_diff JSONB := '{}'::jsonb;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        old_val := to_jsonb(OLD);
        new_val := to_jsonb(NEW);
        SELECT jsonb_object_agg(key, value) INTO v_diff FROM jsonb_each(new_val) WHERE new_val->key IS DISTINCT FROM old_val->key;
    ELSIF (TG_OP = 'INSERT') THEN
        new_val := to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        old_val := to_jsonb(OLD);
    END IF;

    INSERT INTO public.clientes_audit_log (cliente_id, action, changed_by, old_data, new_data, diff)
    VALUES (COALESCE(NEW.id, OLD.id), TG_OP, auth.uid(), old_val, new_val, v_diff);
    
    RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_partner_order_timeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, actor_id, meta)
    VALUES (NEW.id, 'pedido_criado', NEW.created_at, NEW.created_by, '{}'::jsonb);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'aprovado' THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'pedido_aprovado', now(), '{}'::jsonb);
    ELSIF NEW.status = 'em_producao' THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'producao_iniciada', now(), '{}'::jsonb);
    ELSIF NEW.status IN ('produzido','aguardando_entrega') THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'producao_finalizada', now(), '{}'::jsonb);
    ELSIF NEW.status = 'entregue' THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'entrega_realizada', now(), '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_partner_order_to_planning_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ready_for_production = true AND (OLD.ready_for_production IS DISTINCT FROM NEW.ready_for_production) THEN
    INSERT INTO public.production_planning (partner_order_id, partner_id, status, created_by)
    VALUES (NEW.id, NEW.partner_id, 'aguardando_planejamento', NEW.approved_by)
    ON CONFLICT (partner_order_id) DO NOTHING;

    INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
    VALUES (NEW.id, 'planejamento_criado', NEW.approved_by, jsonb_build_object('approved_at', NEW.approved_at));
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;
CREATE OR REPLACE FUNCTION public.validate_partner_user_client_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Preenche user_role automaticamente se vazio
  IF NEW.user_role IS NULL THEN
    NEW.user_role := public.get_b2b_user_role_for_partner(NEW.user_id, NEW.partner_id);
  END IF;

  -- Usuário deve pertencer ao parceiro
  IF NOT public.is_valid_b2b_partner_user(NEW.user_id, NEW.partner_id) THEN
    RAISE EXCEPTION 'Usuário % não é um usuário B2B válido do parceiro %', NEW.user_id, NEW.partner_id;
  END IF;

  -- Cliente deve estar vinculado ao parceiro (ativo) em partner_clients
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_clients pc
    WHERE pc.partner_id = NEW.partner_id
      AND pc.cliente_id = NEW.cliente_id
      AND pc.active = true
  ) THEN
    RAISE EXCEPTION 'Cliente % não está vinculado ao parceiro %', NEW.cliente_id, NEW.partner_id;
  END IF;

  RETURN NEW;
END;
$function$;
ALTER TABLE auth.users ALTER COLUMN "phone" SET DEFAULT NULL::character varying;
ALTER TABLE auth.users ALTER COLUMN "phone_change" SET DEFAULT ''::character varying;
ALTER TABLE auth.users ALTER COLUMN "phone_change_token" SET DEFAULT ''::character varying;
ALTER TABLE auth.users ALTER COLUMN "email_change_token_current" SET DEFAULT ''::character varying;
ALTER TABLE auth.users ALTER COLUMN "email_change_confirm_status" SET DEFAULT 0;
ALTER TABLE auth.users ALTER COLUMN "reauthentication_token" SET DEFAULT ''::character varying;
ALTER TABLE auth.users ALTER COLUMN "is_sso_user" SET DEFAULT false;
ALTER TABLE auth.users ALTER COLUMN "is_anonymous" SET DEFAULT false;
ALTER TABLE accounts_payable ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE accounts_payable ALTER COLUMN "issue_date" SET DEFAULT CURRENT_DATE;
ALTER TABLE accounts_payable ALTER COLUMN "installment_count" SET DEFAULT 1;
ALTER TABLE accounts_payable ALTER COLUMN "status" SET DEFAULT 'OPEN'::text;
ALTER TABLE accounts_payable ALTER COLUMN "origin_type" SET DEFAULT 'MANUAL'::text;
ALTER TABLE accounts_payable ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE accounts_payable ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE accounts_payable ALTER COLUMN "auto_generated" SET DEFAULT false;
ALTER TABLE accounts_payable_installments ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE accounts_payable_installments ALTER COLUMN "paid_amount" SET DEFAULT 0;
ALTER TABLE accounts_payable_installments ALTER COLUMN "discount_amount" SET DEFAULT 0;
ALTER TABLE accounts_payable_installments ALTER COLUMN "interest_amount" SET DEFAULT 0;
ALTER TABLE accounts_payable_installments ALTER COLUMN "penalty_amount" SET DEFAULT 0;
ALTER TABLE accounts_payable_installments ALTER COLUMN "status" SET DEFAULT 'OPEN'::text;
ALTER TABLE accounts_payable_installments ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE accounts_receivable ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE accounts_receivable ALTER COLUMN "issue_date" SET DEFAULT CURRENT_DATE;
ALTER TABLE accounts_receivable ALTER COLUMN "installment_count" SET DEFAULT 1;
ALTER TABLE accounts_receivable ALTER COLUMN "status" SET DEFAULT 'OPEN'::text;
ALTER TABLE accounts_receivable ALTER COLUMN "fiscal_invoice_required" SET DEFAULT false;
ALTER TABLE accounts_receivable ALTER COLUMN "fiscal_invoice_status" SET DEFAULT 'NOT_REQUIRED'::text;
ALTER TABLE accounts_receivable ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE accounts_receivable ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE accounts_receivable ALTER COLUMN "auto_generated" SET DEFAULT false;
ALTER TABLE accounts_receivable_installments ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE accounts_receivable_installments ALTER COLUMN "received_amount" SET DEFAULT 0;
ALTER TABLE accounts_receivable_installments ALTER COLUMN "discount_amount" SET DEFAULT 0;
ALTER TABLE accounts_receivable_installments ALTER COLUMN "interest_amount" SET DEFAULT 0;
ALTER TABLE accounts_receivable_installments ALTER COLUMN "penalty_amount" SET DEFAULT 0;
ALTER TABLE accounts_receivable_installments ALTER COLUMN "status" SET DEFAULT 'OPEN'::text;
ALTER TABLE accounts_receivable_installments ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE clientes ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE clientes ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE clientes ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE clientes ALTER COLUMN "tipo_pessoa" SET DEFAULT 'juridica'::cliente_tipo_pessoa;
ALTER TABLE clientes ALTER COLUMN "cobranca_mesmo_endereco" SET DEFAULT true;
ALTER TABLE clientes ALTER COLUMN "status_cliente" SET DEFAULT 'ativo'::cliente_status;
ALTER TABLE clientes ALTER COLUMN "tags" SET DEFAULT '{}'::text[];
ALTER TABLE clientes ALTER COLUMN "telefones" SET DEFAULT '{}'::text[];
ALTER TABLE clientes_audit_log ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE clientes_audit_log ALTER COLUMN "changed_at" SET DEFAULT now();
ALTER TABLE commercial_audit_log ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE commercial_audit_log ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE commercial_payment_plans ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE commercial_payment_plans ALTER COLUMN "max_days" SET DEFAULT 0;
ALTER TABLE commercial_payment_plans ALTER COLUMN "months_count" SET DEFAULT 0;
ALTER TABLE commercial_payment_plans ALTER COLUMN "installment_count" SET DEFAULT 1;
ALTER TABLE commercial_payment_plans ALTER COLUMN "discount_percent" SET DEFAULT 0;
ALTER TABLE commercial_payment_plans ALTER COLUMN "monthly_interest_percent" SET DEFAULT 0;
ALTER TABLE commercial_payment_plans ALTER COLUMN "interest_type" SET DEFAULT 'compound'::text;
ALTER TABLE commercial_payment_plans ALTER COLUMN "requires_credit_approval" SET DEFAULT false;
ALTER TABLE commercial_payment_plans ALTER COLUMN "requires_guarantee" SET DEFAULT false;
ALTER TABLE commercial_payment_plans ALTER COLUMN "requires_financial_approval" SET DEFAULT false;
ALTER TABLE commercial_payment_plans ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE commercial_payment_plans ALTER COLUMN "sort_order" SET DEFAULT 0;
ALTER TABLE commercial_payment_plans ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE commercial_payment_plans ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE commercial_payment_plans ALTER COLUMN "pricing_mode" SET DEFAULT 'discount_from_base'::text;
ALTER TABLE commercial_payment_plans ALTER COLUMN "version" SET DEFAULT 1;
ALTER TABLE commercial_payment_plans ALTER COLUMN "valid_from" SET DEFAULT now();
ALTER TABLE commercial_payment_plans ALTER COLUMN "is_default" SET DEFAULT false;
ALTER TABLE company_fiscal_settings ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE company_fiscal_settings ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE company_fiscal_settings ALTER COLUMN "country_code" SET DEFAULT 'BR'::text;
ALTER TABLE company_fiscal_settings ALTER COLUMN "fiscal_provider" SET DEFAULT 'NONE'::text;
ALTER TABLE company_fiscal_settings ALTER COLUMN "fiscal_environment" SET DEFAULT 'NOT_CONFIGURED'::text;
ALTER TABLE company_fiscal_settings ALTER COLUMN "nfe_enabled" SET DEFAULT false;
ALTER TABLE company_fiscal_settings ALTER COLUMN "nfse_enabled" SET DEFAULT false;
ALTER TABLE company_fiscal_settings ALTER COLUMN "production_enabled" SET DEFAULT false;
ALTER TABLE company_fiscal_settings ALTER COLUMN "configuration_status" SET DEFAULT 'DRAFT'::text;
ALTER TABLE company_fiscal_settings ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE company_fiscal_settings ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE company_fiscal_settings ALTER COLUMN "nfe_configuration" SET DEFAULT '{}'::jsonb;
ALTER TABLE company_fiscal_settings ALTER COLUMN "nfse_configuration" SET DEFAULT '{}'::jsonb;
ALTER TABLE company_fiscal_settings ALTER COLUMN "nfe_provider" SET DEFAULT 'NONE'::text;
ALTER TABLE company_fiscal_settings ALTER COLUMN "nfse_provider" SET DEFAULT 'NONE'::text;
ALTER TABLE company_fiscal_settings ALTER COLUMN "configuration_version" SET DEFAULT 1;
ALTER TABLE company_fiscal_settings ALTER COLUMN "last_validation_status" SET DEFAULT 'NOT_VALIDATED'::text;
ALTER TABLE company_fiscal_settings ALTER COLUMN "last_validation_summary" SET DEFAULT '{}'::jsonb;
ALTER TABLE company_fiscal_settings ALTER COLUMN "rtc_configuration" SET DEFAULT '{}'::jsonb;
ALTER TABLE company_fiscal_settings ALTER COLUMN "uf_accreditations" SET DEFAULT '[]'::jsonb;
ALTER TABLE company_fiscal_settings ALTER COLUMN "ipi_taxpayer" SET DEFAULT false;
ALTER TABLE company_fiscal_settings ALTER COLUMN "icms_st_responsible" SET DEFAULT false;
ALTER TABLE company_fiscal_settings ALTER COLUMN "fcp_applicable" SET DEFAULT false;
ALTER TABLE company_fiscal_settings ALTER COLUMN "difal_responsible" SET DEFAULT false;
ALTER TABLE company_fiscal_settings ALTER COLUMN "rtc_scaffolding_enabled" SET DEFAULT false;
ALTER TABLE company_fiscal_settings ALTER COLUMN "nfe_readiness_status" SET DEFAULT 'NOT_READY'::text;
ALTER TABLE company_fiscal_settings ALTER COLUMN "nfe_readiness_pendencies" SET DEFAULT '[]'::jsonb;
ALTER TABLE fazendas ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE fazendas ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE fazendas ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE fazendas ALTER COLUMN "ativo" SET DEFAULT true;
ALTER TABLE financial_audit_log ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE financial_audit_log ALTER COLUMN "performed_at" SET DEFAULT now();
ALTER TABLE financial_categories ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE financial_categories ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE financial_categories ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE financial_categories ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE financial_governance_audit_log ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE financial_governance_audit_log ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE financial_settings ALTER COLUMN "id" SET DEFAULT true;
ALTER TABLE financial_settings ALTER COLUMN "require_receipt_on_receivable_payment" SET DEFAULT false;
ALTER TABLE financial_settings ALTER COLUMN "require_receipt_on_payable_payment" SET DEFAULT false;
ALTER TABLE financial_settings ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE fiscal_operation_policies ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE fiscal_operation_policies ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE fiscal_operation_policies ALTER COLUMN "valid_from" SET DEFAULT CURRENT_DATE;
ALTER TABLE fiscal_operation_policies ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE fiscal_operation_policies ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE fiscal_operation_policies ALTER COLUMN "priority" SET DEFAULT 100;
ALTER TABLE fiscal_operation_policies ALTER COLUMN "policy_status" SET DEFAULT 'DRAFT'::text;
ALTER TABLE fiscal_requirement_exemptions ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE fiscal_requirement_exemptions ALTER COLUMN "approved_at" SET DEFAULT now();
ALTER TABLE fiscal_requirement_exemptions ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE fiscal_requirement_exemptions ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE fiscal_requirement_exemptions ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE notificacoes_operacionais ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE notificacoes_operacionais ALTER COLUMN "lido" SET DEFAULT false;
ALTER TABLE notificacoes_operacionais ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE organization_feature_overrides ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE organization_feature_overrides ALTER COLUMN "starts_at" SET DEFAULT now();
ALTER TABLE organization_feature_overrides ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE organization_feature_overrides ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE organization_subscriptions ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE organization_subscriptions ALTER COLUMN "status" SET DEFAULT 'TRIAL'::saas_subscription_status;
ALTER TABLE organization_subscriptions ALTER COLUMN "started_at" SET DEFAULT now();
ALTER TABLE organization_subscriptions ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE organization_subscriptions ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE organizations ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE organizations ALTER COLUMN "ativo" SET DEFAULT true;
ALTER TABLE organizations ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE organizations ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE organizations ALTER COLUMN "status" SET DEFAULT 'ativa'::text;
ALTER TABLE organizations ALTER COLUMN "onboarding_dados" SET DEFAULT '{}'::jsonb;
ALTER TABLE partner_accounts ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_accounts ALTER COLUMN "desconto_padrao" SET DEFAULT 0;
ALTER TABLE partner_accounts ALTER COLUMN "ativo" SET DEFAULT true;
ALTER TABLE partner_accounts ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_accounts ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_accounts ALTER COLUMN "endereco_entrega_igual_comercial" SET DEFAULT true;
ALTER TABLE partner_audit_logs ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_audit_logs ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_clients ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_clients ALTER COLUMN "assigned_at" SET DEFAULT now();
ALTER TABLE partner_clients ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE partner_clients ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_clients ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_engagement_metrics ALTER COLUMN "pedidos_30d" SET DEFAULT 0;
ALTER TABLE partner_engagement_metrics ALTER COLUMN "pedidos_90d" SET DEFAULT 0;
ALTER TABLE partner_engagement_metrics ALTER COLUMN "top_produtos" SET DEFAULT '[]'::jsonb;
ALTER TABLE partner_engagement_metrics ALTER COLUMN "campanhas_usadas" SET DEFAULT '[]'::jsonb;
ALTER TABLE partner_engagement_metrics ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_financial_settings ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_financial_settings ALTER COLUMN "billing_trigger" SET DEFAULT 'na_entrega'::text;
ALTER TABLE partner_financial_settings ALTER COLUMN "payment_terms_days" SET DEFAULT 7;
ALTER TABLE partner_financial_settings ALTER COLUMN "default_payment_method" SET DEFAULT 'pix'::text;
ALTER TABLE partner_financial_settings ALTER COLUMN "block_if_overdue" SET DEFAULT false;
ALTER TABLE partner_financial_settings ALTER COLUMN "auto_generate_receivable" SET DEFAULT true;
ALTER TABLE partner_financial_settings ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE partner_financial_settings ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_financial_settings ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_financial_settings ALTER COLUMN "credit_limit_action" SET DEFAULT 'block'::text;
ALTER TABLE partner_financial_settings ALTER COLUMN "overdue_tolerance_days" SET DEFAULT 0;
ALTER TABLE partner_financial_settings ALTER COLUMN "credit_alert_threshold_1" SET DEFAULT 80;
ALTER TABLE partner_financial_settings ALTER COLUMN "credit_alert_threshold_2" SET DEFAULT 90;
ALTER TABLE partner_order_audit_logs ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_order_audit_logs ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_order_financial_links ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_order_financial_links ALTER COLUMN "financial_status" SET DEFAULT 'gerado'::text;
ALTER TABLE partner_order_financial_links ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_order_financial_links ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_order_items ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_order_items ALTER COLUMN "preco_unitario" SET DEFAULT 0;
ALTER TABLE partner_order_items ALTER COLUMN "desconto_percentual" SET DEFAULT 0;
ALTER TABLE partner_order_items ALTER COLUMN "subtotal" SET DEFAULT 0;
ALTER TABLE partner_order_items ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_order_items ALTER COLUMN "unidade_medida" SET DEFAULT 'unidade'::text;
ALTER TABLE partner_order_payment_schedule ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_order_payment_schedule ALTER COLUMN "status" SET DEFAULT 'planned'::text;
ALTER TABLE partner_order_payment_schedule ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_order_payment_terms ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_order_payment_terms ALTER COLUMN "installment_count" SET DEFAULT 1;
ALTER TABLE partner_order_payment_terms ALTER COLUMN "interest_type_snapshot" SET DEFAULT 'compound'::text;
ALTER TABLE partner_order_payment_terms ALTER COLUMN "table_amount" SET DEFAULT 0;
ALTER TABLE partner_order_payment_terms ALTER COLUMN "discount_amount" SET DEFAULT 0;
ALTER TABLE partner_order_payment_terms ALTER COLUMN "net_amount_after_discount" SET DEFAULT 0;
ALTER TABLE partner_order_payment_terms ALTER COLUMN "financial_interest_amount" SET DEFAULT 0;
ALTER TABLE partner_order_payment_terms ALTER COLUMN "final_amount" SET DEFAULT 0;
ALTER TABLE partner_order_payment_terms ALTER COLUMN "approval_status" SET DEFAULT 'not_required'::text;
ALTER TABLE partner_order_payment_terms ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_order_payment_terms ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_orders ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_orders ALTER COLUMN "numero" SET DEFAULT ('PB-'::text || lpad((nextval('partner_orders_numero_seq'::regclass))::text, 6, '0'::text));
ALTER TABLE partner_orders ALTER COLUMN "status" SET DEFAULT 'pendente'::partner_order_status;
ALTER TABLE partner_orders ALTER COLUMN "subtotal" SET DEFAULT 0;
ALTER TABLE partner_orders ALTER COLUMN "desconto_total" SET DEFAULT 0;
ALTER TABLE partner_orders ALTER COLUMN "total" SET DEFAULT 0;
ALTER TABLE partner_orders ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_orders ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_orders ALTER COLUMN "ready_for_production" SET DEFAULT false;
ALTER TABLE partner_orders ALTER COLUMN "financial_status" SET DEFAULT 'pendente'::text;
ALTER TABLE partner_orders ALTER COLUMN "receivable_generated" SET DEFAULT false;
ALTER TABLE partner_orders ALTER COLUMN "priority" SET DEFAULT 'normal'::partner_order_priority;
ALTER TABLE partner_orders ALTER COLUMN "payment_condition_status" SET DEFAULT 'pending'::text;
ALTER TABLE partner_orders ALTER COLUMN "table_amount" SET DEFAULT 0;
ALTER TABLE partner_orders ALTER COLUMN "commercial_discount_amount" SET DEFAULT 0;
ALTER TABLE partner_orders ALTER COLUMN "net_amount_after_discount" SET DEFAULT 0;
ALTER TABLE partner_orders ALTER COLUMN "financial_interest_amount" SET DEFAULT 0;
ALTER TABLE partner_orders ALTER COLUMN "final_amount_with_interest" SET DEFAULT 0;
ALTER TABLE partner_orders ALTER COLUMN "requires_financial_approval" SET DEFAULT false;
ALTER TABLE partner_orders ALTER COLUMN "financial_approval_status" SET DEFAULT 'not_required'::text;
ALTER TABLE partner_product_prices ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_product_prices ALTER COLUMN "preco_tabela" SET DEFAULT 0;
ALTER TABLE partner_product_prices ALTER COLUMN "desconto_percentual" SET DEFAULT 0;
ALTER TABLE partner_product_prices ALTER COLUMN "ativo" SET DEFAULT true;
ALTER TABLE partner_product_prices ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_product_prices ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_product_prices ALTER COLUMN "is_current" SET DEFAULT true;
ALTER TABLE partner_risk_scores ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_risk_scores ALTER COLUMN "score" SET DEFAULT 0;
ALTER TABLE partner_risk_scores ALTER COLUMN "risk_level" SET DEFAULT 'baixo'::text;
ALTER TABLE partner_risk_scores ALTER COLUMN "dias_medio_atraso" SET DEFAULT 0;
ALTER TABLE partner_risk_scores ALTER COLUMN "titulos_vencidos" SET DEFAULT 0;
ALTER TABLE partner_risk_scores ALTER COLUMN "pct_credito_utilizado" SET DEFAULT 0;
ALTER TABLE partner_risk_scores ALTER COLUMN "freq_compras_30d" SET DEFAULT 0;
ALTER TABLE partner_risk_scores ALTER COLUMN "meses_relacionamento" SET DEFAULT 0;
ALTER TABLE partner_risk_scores ALTER COLUMN "calculado_em" SET DEFAULT now();
ALTER TABLE partner_risk_scores ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_risk_scores ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_technician_clients ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_technician_clients ALTER COLUMN "assigned_at" SET DEFAULT now();
ALTER TABLE partner_technician_clients ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE partner_technician_clients ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_technician_clients ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_user_clients ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_user_clients ALTER COLUMN "assignment_type" SET DEFAULT 'monitoramento'::text;
ALTER TABLE partner_user_clients ALTER COLUMN "can_create_simulation" SET DEFAULT true;
ALTER TABLE partner_user_clients ALTER COLUMN "can_monitor" SET DEFAULT true;
ALTER TABLE partner_user_clients ALTER COLUMN "assigned_at" SET DEFAULT now();
ALTER TABLE partner_user_clients ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE partner_user_clients ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_user_clients ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE partner_users ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE partner_users ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE partner_users ALTER COLUMN "papel" SET DEFAULT 'gestor'::text;
ALTER TABLE partner_users ALTER COLUMN "valid_from" SET DEFAULT now();
ALTER TABLE partner_users ALTER COLUMN "version" SET DEFAULT 1;
ALTER TABLE payment_methods ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE payment_methods ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE payment_methods ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE platform_org_admin_invites ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE platform_org_admin_invites ALTER COLUMN "responsavel_principal" SET DEFAULT true;
ALTER TABLE platform_org_admin_invites ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE platform_org_admin_invites ALTER COLUMN "status" SET DEFAULT 'pendente'::text;
ALTER TABLE platform_org_admin_invites ALTER COLUMN "request_id" SET DEFAULT gen_random_uuid();
ALTER TABLE platform_org_admin_invites ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE platform_org_admin_invites ALTER COLUMN "attempt_count" SET DEFAULT 0;
ALTER TABLE platform_org_admin_invites ALTER COLUMN "email_delivery_status" SET DEFAULT 'pending'::text;
ALTER TABLE platform_org_admin_invites ALTER COLUMN "email_attempt_count" SET DEFAULT 0;
ALTER TABLE platform_org_admin_invites ALTER COLUMN "email_idempotency_key" SET DEFAULT gen_random_uuid();
ALTER TABLE platform_org_admin_invites ALTER COLUMN "email_next_attempt_at" SET DEFAULT now();
ALTER TABLE platform_private.authz_tickets ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE platform_private.b2b_provisioning_receipts ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE platform_private.b2b_provisioning_receipts ALTER COLUMN "external_role" SET DEFAULT 'parceiro_b2b'::app_role;
ALTER TABLE platform_private.b2b_provisioning_receipts ALTER COLUMN "cliente_ids" SET DEFAULT ARRAY[]::uuid[];
ALTER TABLE platform_private.b2b_provisioning_receipts ALTER COLUMN "target_snapshot" SET DEFAULT '{}'::jsonb;
ALTER TABLE platform_private.b2b_provisioning_receipts ALTER COLUMN "user_id" SET DEFAULT gen_random_uuid();
ALTER TABLE platform_private.b2b_provisioning_receipts ALTER COLUMN "fence" SET DEFAULT gen_random_uuid();
ALTER TABLE platform_private.b2b_provisioning_receipts ALTER COLUMN "status" SET DEFAULT 'claimed'::text;
ALTER TABLE platform_private.b2b_provisioning_receipts ALTER COLUMN "lease_until" SET DEFAULT (clock_timestamp() + '00:05:00'::interval);
ALTER TABLE platform_private.b2b_provisioning_receipts ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();
ALTER TABLE platform_private.provisional_password_state ALTER COLUMN "desde" SET DEFAULT now();
ALTER TABLE platform_private.provisional_password_state ALTER COLUMN "expires_at" SET DEFAULT (now() + '24:00:00'::interval);
ALTER TABLE production_order_link ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE production_order_link ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE production_planning ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE production_planning ALTER COLUMN "status" SET DEFAULT 'aguardando_planejamento'::production_planning_status;
ALTER TABLE production_planning ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE production_planning ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE production_timeline_events ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE production_timeline_events ALTER COLUMN "event_at" SET DEFAULT now();
ALTER TABLE production_timeline_events ALTER COLUMN "meta" SET DEFAULT '{}'::jsonb;
ALTER TABLE profiles ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE profiles ALTER COLUMN "nome" SET DEFAULT ''::text;
ALTER TABLE profiles ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE profiles ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE profiles ALTER COLUMN "ativo" SET DEFAULT true;
ALTER TABLE profiles ALTER COLUMN "senha_provisoria" SET DEFAULT false;
ALTER TABLE receivable_payments ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE receivable_payments ALTER COLUMN "payment_date" SET DEFAULT CURRENT_DATE;
ALTER TABLE receivable_payments ALTER COLUMN "discount_amount" SET DEFAULT 0;
ALTER TABLE receivable_payments ALTER COLUMN "interest_amount" SET DEFAULT 0;
ALTER TABLE receivable_payments ALTER COLUMN "penalty_amount" SET DEFAULT 0;
ALTER TABLE receivable_payments ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE receivable_payments ALTER COLUMN "is_reversal" SET DEFAULT false;
ALTER TABLE saas_features ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE saas_features ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE saas_features ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE saas_features ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE saas_features ALTER COLUMN "commercializable" SET DEFAULT false;
ALTER TABLE saas_modules ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE saas_modules ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE saas_modules ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE saas_modules ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE saas_plan_version_features ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE saas_plan_versions ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE saas_plan_versions ALTER COLUMN "limits_snapshot" SET DEFAULT '{}'::jsonb;
ALTER TABLE saas_plan_versions ALTER COLUMN "features_snapshot" SET DEFAULT '[]'::jsonb;
ALTER TABLE saas_plan_versions ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE saas_plan_versions ALTER COLUMN "status" SET DEFAULT 'DRAFT'::text;
ALTER TABLE saas_plan_versions ALTER COLUMN "revision" SET DEFAULT 1;
ALTER TABLE saas_plan_versions ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE user_access_preferences ALTER COLUMN "skip_context_selector" SET DEFAULT false;
ALTER TABLE user_access_preferences ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE user_access_preferences ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE user_clientes ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE user_clientes ALTER COLUMN "principal" SET DEFAULT false;
ALTER TABLE user_clientes ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE user_clientes ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE user_clientes ALTER COLUMN "access_level" SET DEFAULT 'execute'::access_level_tecnico;
ALTER TABLE user_clientes ALTER COLUMN "valid_from" SET DEFAULT now();
ALTER TABLE user_context_access_logs ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE user_context_access_logs ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;
ALTER TABLE user_context_access_logs ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE user_roles ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE auth.users ADD CONSTRAINT "users_email_change_confirm_status_check" CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)));
ALTER TABLE auth.users ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
ALTER TABLE auth.users ADD CONSTRAINT "users_phone_key" UNIQUE (phone);
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_installment_count_check" CHECK ((installment_count >= 1));
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_origin_type_check" CHECK ((origin_type = ANY (ARRAY['MANUAL'::text, 'PURCHASE'::text, 'FREIGHT'::text, 'COMMISSION'::text, 'RECURRING'::text, 'TAX'::text])));
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'PARTIAL'::text, 'PAID'::text, 'CANCELED'::text, 'OVERDUE'::text])));
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_total_amount_check" CHECK ((total_amount >= (0)::numeric));
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_pkey" PRIMARY KEY (id);
ALTER TABLE accounts_payable_installments ADD CONSTRAINT "accounts_payable_installments_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'PARTIAL'::text, 'PAID'::text, 'CANCELED'::text, 'OVERDUE'::text])));
ALTER TABLE accounts_payable_installments ADD CONSTRAINT "accounts_payable_installments_pkey" PRIMARY KEY (id);
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_fiscal_invoice_status_check" CHECK ((fiscal_invoice_status = ANY (ARRAY['NOT_REQUIRED'::text, 'PENDING'::text, 'ISSUED'::text, 'CANCELED'::text, 'PENDING_PARAMETRIZATION'::text, 'EXEMPT'::text])));
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_installment_count_check" CHECK ((installment_count >= 1));
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_origin_type_check" CHECK ((origin_type = ANY (ARRAY['DELIVERY'::text, 'SERVICE'::text, 'MANUAL'::text, 'RECURRING'::text, 'CONTRACT'::text, 'B2B_ORDER'::text])));
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'PARTIAL'::text, 'PAID'::text, 'CANCELED'::text, 'OVERDUE'::text])));
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_total_amount_check" CHECK ((total_amount >= (0)::numeric));
ALTER TABLE accounts_receivable ADD CONSTRAINT "ar_customer_or_partner" CHECK (((customer_id IS NOT NULL) OR (partner_id IS NOT NULL)));
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_pkey" PRIMARY KEY (id);
ALTER TABLE accounts_receivable_installments ADD CONSTRAINT "accounts_receivable_installments_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'PARTIAL'::text, 'PAID'::text, 'CANCELED'::text, 'OVERDUE'::text])));
ALTER TABLE accounts_receivable_installments ADD CONSTRAINT "accounts_receivable_installments_pkey" PRIMARY KEY (id);
ALTER TABLE cf_user_guards_v1.state ADD CONSTRAINT "state_singleton_check" CHECK (singleton);
ALTER TABLE cf_user_guards_v1.state ADD CONSTRAINT "state_pkey" PRIMARY KEY (singleton);
ALTER TABLE clientes ADD CONSTRAINT "clientes_marca_cor_hex" CHECK (((marca_cor_primaria IS NULL) OR (marca_cor_primaria ~ '^#[0-9a-fA-F]{6}$'::text)));
ALTER TABLE clientes ADD CONSTRAINT "clientes_marca_nome_len" CHECK (((marca_nome IS NULL) OR ((char_length(btrim(marca_nome)) >= 2) AND (char_length(btrim(marca_nome)) <= 80))));
ALTER TABLE clientes ADD CONSTRAINT "clientes_pkey" PRIMARY KEY (id);
ALTER TABLE clientes_audit_log ADD CONSTRAINT "clientes_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE commercial_audit_log ADD CONSTRAINT "commercial_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "commercial_payment_plans_discount_percent_check" CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric)));
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "commercial_payment_plans_installment_count_check" CHECK ((installment_count >= 1));
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "commercial_payment_plans_interest_type_check" CHECK ((interest_type = ANY (ARRAY['none'::text, 'simple'::text, 'compound'::text])));
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "commercial_payment_plans_monthly_interest_percent_check" CHECK ((monthly_interest_percent >= (0)::numeric));
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "commercial_payment_plans_plan_type_check" CHECK ((plan_type = ANY (ARRAY['cash'::text, 'short_term'::text, 'medium_term'::text, 'extended_term'::text, 'harvest'::text, 'custom'::text])));
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "cpp_nonnegative_chk" CHECK (((max_days >= 0) AND (months_count >= (0)::numeric) AND (sort_order >= 0) AND (version >= 1) AND ((minimum_order_amount IS NULL) OR (minimum_order_amount >= (0)::numeric))));
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "cpp_pricing_mode_chk" CHECK ((pricing_mode = ANY (ARRAY['discount_from_base'::text, 'fixed_item_price'::text, 'quote_only'::text])));
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "cpp_validity_window_chk" CHECK (((valid_until IS NULL) OR (valid_until > valid_from)));
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "commercial_payment_plans_pkey" PRIMARY KEY (id);
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "commercial_payment_plans_code_key" UNIQUE (code);
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_configuration_notes_len" CHECK (((configuration_notes IS NULL) OR (length(configuration_notes) <= 4000)));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_configuration_version_positive" CHECK ((configuration_version > 0));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_crt_domain" CHECK (((crt IS NULL) OR (crt = ANY (ARRAY['1'::text, '2'::text, '3'::text, '4'::text]))));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_homologation_no_secret_chk" CHECK (((sefaz_homologation_evidence IS NULL) OR (NOT fiscal_json_has_sensitive_key(sefaz_homologation_evidence))));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_last_validation_status_domain" CHECK ((last_validation_status = ANY (ARRAY['NOT_VALIDATED'::text, 'INCOMPLETE'::text, 'READY_FOR_HOMOLOGATION'::text, 'VALIDATED_HOMOLOGATION'::text, 'BLOCKED'::text])));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_last_validation_summary_is_object" CHECK ((jsonb_typeof(last_validation_summary) = 'object'::text));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_nfe_configuration_is_object" CHECK ((jsonb_typeof(nfe_configuration) = 'object'::text));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_nfe_environment_code_domain" CHECK (((nfe_environment_code IS NULL) OR (nfe_environment_code = ANY (ARRAY['1'::text, '2'::text]))));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_nfe_provider_domain" CHECK ((nfe_provider = ANY (ARRAY['NONE'::text, 'NOT_CONFIGURED'::text, 'FOCUS_NFE'::text, 'PLUGNOTAS'::text, 'SEFAZ_DIRETO'::text, 'NFSE_NACIONAL'::text, 'MUNICIPAL'::text, 'OTHER_FUTURE'::text])));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_nfe_readiness_domain" CHECK ((nfe_readiness_status = ANY (ARRAY['NOT_READY'::text, 'PARTIAL'::text, 'READY_HOMOLOGATION'::text, 'READY_PRODUCTION'::text, 'BLOCKED'::text])));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_nfe_readiness_pendencies_shape" CHECK ((jsonb_typeof(nfe_readiness_pendencies) = 'array'::text));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_nfe_series_number_range" CHECK (((nfe_series_number IS NULL) OR ((nfe_series_number >= 1) AND (nfe_series_number <= 999))));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_nfse_configuration_is_object" CHECK ((jsonb_typeof(nfse_configuration) = 'object'::text));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_nfse_provider_domain" CHECK ((nfse_provider = ANY (ARRAY['NONE'::text, 'NOT_CONFIGURED'::text, 'FOCUS_NFE'::text, 'PLUGNOTAS'::text, 'SEFAZ_DIRETO'::text, 'NFSE_NACIONAL'::text, 'MUNICIPAL'::text, 'OTHER_FUTURE'::text])));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_no_sensitive_keys_in_jsonb" CHECK (((NOT fiscal_json_has_sensitive_key(nfe_configuration)) AND (NOT fiscal_json_has_sensitive_key(nfse_configuration)) AND (NOT fiscal_json_has_sensitive_key(last_validation_summary))));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_pis_cofins_regime_domain" CHECK (((pis_cofins_regime IS NULL) OR (pis_cofins_regime = ANY (ARRAY['CUMULATIVO'::text, 'NAO_CUMULATIVO'::text, 'MISTO'::text, 'SIMPLES_NACIONAL'::text]))));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_refs_shape" CHECK ((((nfe_credential_ref IS NULL) OR ((length(nfe_credential_ref) >= 1) AND (length(nfe_credential_ref) <= 120) AND (nfe_credential_ref ~ '^[A-Za-z0-9_.:\-]+$'::text))) AND ((nfse_credential_ref IS NULL) OR ((length(nfse_credential_ref) >= 1) AND (length(nfse_credential_ref) <= 120) AND (nfse_credential_ref ~ '^[A-Za-z0-9_.:\-]+$'::text))) AND ((certificate_ref IS NULL) OR ((length(certificate_ref) >= 1) AND (length(certificate_ref) <= 120) AND (certificate_ref ~ '^[A-Za-z0-9_.:\-]+$'::text))) AND ((webhook_ref IS NULL) OR ((length(webhook_ref) >= 1) AND (length(webhook_ref) <= 120) AND (webhook_ref ~ '^[A-Za-z0-9_.:\-]+$'::text)))));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "cfs_uf_accreditations_shape" CHECK (((jsonb_typeof(uf_accreditations) = 'array'::text) AND (NOT fiscal_json_has_sensitive_key(jsonb_build_object('v', uf_accreditations)))));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "company_fiscal_settings_configuration_status_check" CHECK ((configuration_status = ANY (ARRAY['DRAFT'::text, 'PENDING_ACCOUNTING'::text, 'VALIDATED'::text, 'BLOCKED'::text])));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "company_fiscal_settings_fiscal_environment_check" CHECK ((fiscal_environment = ANY (ARRAY['NOT_CONFIGURED'::text, 'HOMOLOGATION'::text, 'PRODUCTION'::text])));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "company_fiscal_settings_fiscal_provider_check" CHECK ((fiscal_provider = ANY (ARRAY['NONE'::text, 'NOT_CONFIGURED'::text, 'FOCUS_NFE'::text, 'SEFAZ_DIRETO'::text, 'NFSE_NACIONAL'::text, 'MUNICIPAL'::text])));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "company_fiscal_settings_rtc_config_no_secret_chk" CHECK ((NOT fiscal_rtc_has_sensitive_key(rtc_configuration)));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "company_fiscal_settings_rtc_config_object_chk" CHECK ((jsonb_typeof(rtc_configuration) = 'object'::text));
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "company_fiscal_settings_pkey" PRIMARY KEY (id);
ALTER TABLE fazendas ADD CONSTRAINT "fazendas_latitude_check" CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))));
ALTER TABLE fazendas ADD CONSTRAINT "fazendas_longitude_check" CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))));
ALTER TABLE fazendas ADD CONSTRAINT "fazendas_pkey" PRIMARY KEY (id);
ALTER TABLE financial_audit_log ADD CONSTRAINT "financial_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE financial_categories ADD CONSTRAINT "chk_dre_group" CHECK (((dre_group IS NULL) OR (dre_group = ANY (ARRAY['RECEITA_BRUTA'::text, 'DEDUCOES'::text, 'CUSTO_PRODUCAO'::text, 'DESPESA_VARIAVEL'::text, 'DESPESA_FIXA'::text, 'DESPESA_ADMINISTRATIVA'::text, 'DESPESA_COMERCIAL'::text, 'DESPESA_FINANCEIRA'::text, 'IMPOSTOS'::text, 'OUTRAS_RECEITAS'::text, 'OUTRAS_DESPESAS'::text]))));
ALTER TABLE financial_categories ADD CONSTRAINT "financial_categories_type_check" CHECK ((type = ANY (ARRAY['RECEITA'::text, 'DESPESA'::text, 'AMBOS'::text])));
ALTER TABLE financial_categories ADD CONSTRAINT "financial_categories_pkey" PRIMARY KEY (id);
ALTER TABLE financial_governance_audit_log ADD CONSTRAINT "financial_governance_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE financial_settings ADD CONSTRAINT "financial_settings_id_check" CHECK ((id = true));
ALTER TABLE financial_settings ADD CONSTRAINT "financial_settings_pkey" PRIMARY KEY (id);
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fiscal_operation_policies_sales_channel_check" CHECK ((sales_channel = ANY (ARRAY['b2b_partner'::text, 'direct_producer'::text, 'internal'::text])));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fop_cfop_format" CHECK (((cfop IS NULL) OR (cfop ~ '^[1-7][0-9]{3}$'::text)));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fop_crt_domain" CHECK (((crt IS NULL) OR (crt = ANY (ARRAY['1'::text, '2'::text, '3'::text, '4'::text]))));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fop_direction_domain" CHECK (((direction IS NULL) OR (direction = ANY (ARRAY['IN'::text, 'OUT'::text]))));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fop_fin_nfe_domain" CHECK (((fin_nfe IS NULL) OR ((fin_nfe >= 1) AND (fin_nfe <= 4))));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fop_presence_domain" CHECK (((presence_indicator IS NULL) OR ((presence_indicator >= 0) AND (presence_indicator <= 9))));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fop_published_requires_evidence" CHECK (((policy_status <> 'PUBLISHED'::text) OR ((cfop IS NOT NULL) AND (nature_operation IS NOT NULL) AND (direction IS NOT NULL) AND (document_model = '55'::text) AND (source_id IS NOT NULL) AND (NULLIF(btrim(COALESCE(legal_basis, ''::text)), ''::text) IS NOT NULL) AND (published_at IS NOT NULL) AND (published_by IS NOT NULL))));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fop_status_domain" CHECK ((policy_status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'SUPERSEDED'::text])));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fop_ufs_domain" CHECK ((((origin_uf IS NULL) OR (fn_fiscal_uf_ibge_code(origin_uf) IS NOT NULL)) AND ((destination_uf IS NULL) OR (destination_uf = 'EX'::text) OR (fn_fiscal_uf_ibge_code(destination_uf) IS NOT NULL))));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fop_validity_ck" CHECK (((valid_until IS NULL) OR (valid_until >= valid_from)));
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fiscal_operation_policies_pkey" PRIMARY KEY (id);
ALTER TABLE fiscal_requirement_exemptions ADD CONSTRAINT "fiscal_requirement_exemptions_motivo_check" CHECK ((length(btrim(motivo)) > 0));
ALTER TABLE fiscal_requirement_exemptions ADD CONSTRAINT "fiscal_requirement_exemptions_scope_type_check" CHECK ((scope_type = ANY (ARRAY['partner_order'::text, 'receivable'::text, 'partner'::text, 'customer'::text])));
ALTER TABLE fiscal_requirement_exemptions ADD CONSTRAINT "fiscal_requirement_exemptions_pkey" PRIMARY KEY (id);
ALTER TABLE notificacoes_operacionais ADD CONSTRAINT "notificacoes_operacionais_pkey" PRIMARY KEY (id);
ALTER TABLE organization_feature_overrides ADD CONSTRAINT "ofo_period_chk" CHECK (((ends_at IS NULL) OR (ends_at > starts_at)));
ALTER TABLE organization_feature_overrides ADD CONSTRAINT "organization_feature_overrides_limit_value_check" CHECK (((limit_value IS NULL) OR (limit_value >= (0)::numeric)));
ALTER TABLE organization_feature_overrides ADD CONSTRAINT "organization_feature_overrides_mode_check" CHECK ((mode = ANY (ARRAY['GRANT'::text, 'REVOKE'::text])));
ALTER TABLE organization_feature_overrides ADD CONSTRAINT "organization_feature_overrides_reason_check" CHECK ((length(btrim(reason)) >= 5));
ALTER TABLE organization_feature_overrides ADD CONSTRAINT "organization_feature_overrides_pkey" PRIMARY KEY (id);
ALTER TABLE organization_subscriptions ADD CONSTRAINT "org_subscriptions_billing_cycle_valid" CHECK (((billing_cycle IS NULL) OR (billing_cycle = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'semiannual'::text, 'annual'::text, 'custom'::text]))));
ALTER TABLE organization_subscriptions ADD CONSTRAINT "org_subscriptions_cancelled_consistency" CHECK (((status <> 'CANCELLED'::saas_subscription_status) OR (cancelled_at IS NOT NULL)));
ALTER TABLE organization_subscriptions ADD CONSTRAINT "org_subscriptions_currency_snapshot_format" CHECK (((currency_snapshot IS NULL) OR (currency_snapshot ~ '^[A-Z]{3}$'::text)));
ALTER TABLE organization_subscriptions ADD CONSTRAINT "org_subscriptions_cycle_snapshot_valid" CHECK (((billing_cycle_snapshot IS NULL) OR (billing_cycle_snapshot = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'semiannual'::text, 'annual'::text, 'custom'::text]))));
ALTER TABLE organization_subscriptions ADD CONSTRAINT "org_subscriptions_features_snapshot_array" CHECK (((features_snapshot IS NULL) OR (jsonb_typeof(features_snapshot) = 'array'::text)));
ALTER TABLE organization_subscriptions ADD CONSTRAINT "org_subscriptions_limits_snapshot_object" CHECK (((limits_snapshot IS NULL) OR (jsonb_typeof(limits_snapshot) = 'object'::text)));
ALTER TABLE organization_subscriptions ADD CONSTRAINT "org_subscriptions_period_order" CHECK (((current_period_start IS NULL) OR (current_period_end IS NULL) OR (current_period_end > current_period_start)));
ALTER TABLE organization_subscriptions ADD CONSTRAINT "org_subscriptions_price_snapshot_nonnegative" CHECK (((price_snapshot IS NULL) OR (price_snapshot >= (0)::numeric)));
ALTER TABLE organization_subscriptions ADD CONSTRAINT "org_subscriptions_suspended_consistency" CHECK (((status <> 'SUSPENDED'::saas_subscription_status) OR (suspended_at IS NOT NULL)));
ALTER TABLE organization_subscriptions ADD CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE organizations ADD CONSTRAINT "organizations_status_chk" CHECK ((status = ANY (ARRAY['rascunho'::text, 'aguardando_ativacao'::text, 'onboarding'::text, 'ativa'::text, 'suspensa'::text, 'cancelada'::text])));
ALTER TABLE organizations ADD CONSTRAINT "organizations_pkey" PRIMARY KEY (id);
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_comissao_range" CHECK (((comissao_percentual IS NULL) OR ((comissao_percentual >= (0)::numeric) AND (comissao_percentual <= (100)::numeric))));
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_desconto_padrao_check" CHECK (((desconto_padrao >= (0)::numeric) AND (desconto_padrao <= (100)::numeric)));
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_limite_credito_pos" CHECK (((limite_credito_brl IS NULL) OR (limite_credito_brl >= (0)::numeric)));
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_marca_cor_hex" CHECK (((marca_cor_primaria IS NULL) OR (marca_cor_primaria ~ '^#[0-9a-fA-F]{6}$'::text)));
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_marca_nome_len" CHECK (((marca_nome IS NULL) OR ((char_length(btrim(marca_nome)) >= 2) AND (char_length(btrim(marca_nome)) <= 80))));
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_pkey" PRIMARY KEY (id);
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_codigo_key" UNIQUE (codigo);
ALTER TABLE partner_audit_logs ADD CONSTRAINT "partner_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE partner_clients ADD CONSTRAINT "partner_clients_pkey" PRIMARY KEY (id);
ALTER TABLE partner_clients ADD CONSTRAINT "partner_clients_unique" UNIQUE (partner_id, cliente_id);
ALTER TABLE partner_engagement_metrics ADD CONSTRAINT "partner_engagement_metrics_pkey" PRIMARY KEY (partner_id);
ALTER TABLE partner_financial_settings ADD CONSTRAINT "partner_financial_settings_billing_trigger_check" CHECK ((billing_trigger = ANY (ARRAY['na_aprovacao'::text, 'na_producao_finalizada'::text, 'na_entrega'::text, 'manual'::text])));
ALTER TABLE partner_financial_settings ADD CONSTRAINT "partner_financial_settings_default_payment_method_check" CHECK ((default_payment_method = ANY (ARRAY['pix'::text, 'boleto'::text, 'transferencia'::text, 'dinheiro'::text, 'cartao'::text, 'prazo'::text])));
ALTER TABLE partner_financial_settings ADD CONSTRAINT "partner_financial_settings_payment_terms_days_check" CHECK ((payment_terms_days >= 0));
ALTER TABLE partner_financial_settings ADD CONSTRAINT "pfs_credit_limit_action_check" CHECK ((credit_limit_action = ANY (ARRAY['block'::text, 'approval_required'::text])));
ALTER TABLE partner_financial_settings ADD CONSTRAINT "pfs_tolerance_check" CHECK ((overdue_tolerance_days >= 0));
ALTER TABLE partner_financial_settings ADD CONSTRAINT "partner_financial_settings_pkey" PRIMARY KEY (id);
ALTER TABLE partner_financial_settings ADD CONSTRAINT "partner_financial_settings_partner_id_key" UNIQUE (partner_id);
ALTER TABLE partner_order_audit_logs ADD CONSTRAINT "partner_order_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE partner_order_financial_links ADD CONSTRAINT "partner_order_financial_links_pkey" PRIMARY KEY (id);
ALTER TABLE partner_order_financial_links ADD CONSTRAINT "partner_order_financial_links_partner_order_id_key" UNIQUE (partner_order_id);
ALTER TABLE partner_order_items ADD CONSTRAINT "partner_order_items_quantidade_check" CHECK ((quantidade > (0)::numeric));
ALTER TABLE partner_order_items ADD CONSTRAINT "partner_order_items_unidade_check" CHECK ((unidade_medida = ANY (ARRAY['ml'::text, 'litro'::text, 'hectare'::text, 'dose'::text, 'unidade'::text])));
ALTER TABLE partner_order_items ADD CONSTRAINT "poi_item_xor" CHECK ((((product_id IS NOT NULL) AND (microrganismo_id IS NULL)) OR ((product_id IS NULL) AND (microrganismo_id IS NOT NULL))));
ALTER TABLE partner_order_items ADD CONSTRAINT "partner_order_items_pkey" PRIMARY KEY (id);
ALTER TABLE partner_order_payment_schedule ADD CONSTRAINT "partner_order_payment_schedule_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'generated'::text, 'canceled'::text])));
ALTER TABLE partner_order_payment_schedule ADD CONSTRAINT "partner_order_payment_schedule_pkey" PRIMARY KEY (id);
ALTER TABLE partner_order_payment_terms ADD CONSTRAINT "partner_order_payment_terms_approval_status_check" CHECK ((approval_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE partner_order_payment_terms ADD CONSTRAINT "partner_order_payment_terms_pkey" PRIMARY KEY (id);
ALTER TABLE partner_orders ADD CONSTRAINT "partner_orders_financial_status_check" CHECK ((financial_status = ANY (ARRAY['pendente'::text, 'gerado'::text, 'parcial'::text, 'recebido'::text, 'vencido'::text, 'cancelado'::text])));
ALTER TABLE partner_orders ADD CONSTRAINT "partner_orders_pkey" PRIMARY KEY (id);
ALTER TABLE partner_orders ADD CONSTRAINT "partner_orders_numero_key" UNIQUE (numero);
ALTER TABLE partner_product_prices ADD CONSTRAINT "partner_product_prices_desconto_percentual_check" CHECK (((desconto_percentual >= (0)::numeric) AND (desconto_percentual <= (100)::numeric)));
ALTER TABLE partner_product_prices ADD CONSTRAINT "ppp_item_xor" CHECK ((((product_id IS NOT NULL) AND (microrganismo_id IS NULL)) OR ((product_id IS NULL) AND (microrganismo_id IS NOT NULL))));
ALTER TABLE partner_product_prices ADD CONSTRAINT "partner_product_prices_pkey" PRIMARY KEY (id);
ALTER TABLE partner_risk_scores ADD CONSTRAINT "prs_risk_level" CHECK ((risk_level = ANY (ARRAY['baixo'::text, 'medio'::text, 'alto'::text, 'critico'::text])));
ALTER TABLE partner_risk_scores ADD CONSTRAINT "prs_score_range" CHECK (((score >= 0) AND (score <= 100)));
ALTER TABLE partner_risk_scores ADD CONSTRAINT "partner_risk_scores_pkey" PRIMARY KEY (id);
ALTER TABLE partner_risk_scores ADD CONSTRAINT "partner_risk_scores_partner_id_key" UNIQUE (partner_id);
ALTER TABLE partner_technician_clients ADD CONSTRAINT "partner_technician_clients_pkey" PRIMARY KEY (id);
ALTER TABLE partner_technician_clients ADD CONSTRAINT "partner_technician_clients_unique" UNIQUE (partner_id, technician_user_id, cliente_id);
ALTER TABLE partner_user_clients ADD CONSTRAINT "partner_user_clients_assignment_type_check" CHECK ((assignment_type = ANY (ARRAY['monitoramento'::text, 'tecnico'::text, 'comercial'::text, 'gestao'::text])));
ALTER TABLE partner_user_clients ADD CONSTRAINT "partner_user_clients_pkey" PRIMARY KEY (id);
ALTER TABLE partner_user_clients ADD CONSTRAINT "partner_user_clients_unique" UNIQUE (partner_id, user_id, cliente_id);
ALTER TABLE partner_users ADD CONSTRAINT "partner_users_papel_check" CHECK ((papel = ANY (ARRAY['gestor'::text, 'tecnico'::text])));
ALTER TABLE partner_users ADD CONSTRAINT "partner_users_revocation_coherence_chk" CHECK ((((revoked_at IS NULL) AND (revoked_by IS NULL) AND (revoke_reason IS NULL)) OR ((revoked_at IS NOT NULL) AND (revoked_by IS NOT NULL) AND (revoke_reason IS NOT NULL) AND (btrim(revoke_reason) <> ''::text))));
ALTER TABLE partner_users ADD CONSTRAINT "partner_users_validity_window_chk" CHECK (((revoked_at IS NULL) OR (revoked_at >= valid_from)));
ALTER TABLE partner_users ADD CONSTRAINT "partner_users_version_positive_chk" CHECK ((version >= 1));
ALTER TABLE partner_users ADD CONSTRAINT "partner_users_pkey" PRIMARY KEY (id);
ALTER TABLE partner_users ADD CONSTRAINT "partner_users_user_id_key" UNIQUE (user_id);
ALTER TABLE payment_methods ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY (id);
ALTER TABLE platform_org_admin_invites ADD CONSTRAINT "platform_org_admin_invites_email_attempt_count_chk" CHECK (((email_attempt_count >= 0) AND (email_attempt_count <= 50)));
ALTER TABLE platform_org_admin_invites ADD CONSTRAINT "platform_org_admin_invites_email_delivery_status_chk" CHECK ((email_delivery_status = ANY (ARRAY['pending'::text, 'sending'::text, 'accepted'::text, 'failed'::text, 'ambiguous'::text])));
ALTER TABLE platform_org_admin_invites ADD CONSTRAINT "platform_org_admin_invites_email_error_code_chk" CHECK (((email_last_error_code IS NULL) OR ((length(email_last_error_code) >= 1) AND (length(email_last_error_code) <= 80))));
ALTER TABLE platform_org_admin_invites ADD CONSTRAINT "platform_org_admin_invites_modo_acesso_check" CHECK ((modo_acesso = ANY (ARRAY['link'::text, 'senha_temporaria'::text])));
ALTER TABLE platform_org_admin_invites ADD CONSTRAINT "platform_org_admin_invites_status_chk" CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'falhou'::text, 'ativo'::text])));
ALTER TABLE platform_org_admin_invites ADD CONSTRAINT "platform_org_admin_invites_pkey" PRIMARY KEY (id);
ALTER TABLE platform_private.authz_tickets ADD CONSTRAINT "authz_tickets_pkey" PRIMARY KEY (txid, scope, target);
ALTER TABLE platform_private.b2b_provisioning_receipts ADD CONSTRAINT "b2b_provisioning_receipts_pkey" PRIMARY KEY (id);
ALTER TABLE platform_private.b2b_provisioning_receipts ADD CONSTRAINT "b2b_provisioning_receipts_actor_id_idempotency_key_key" UNIQUE (actor_id, idempotency_key);
ALTER TABLE platform_private.b2b_provisioning_receipts ADD CONSTRAINT "b2b_provisioning_receipts_email_key" UNIQUE (email);
ALTER TABLE platform_private.b2b_provisioning_receipts ADD CONSTRAINT "b2b_provisioning_receipts_user_id_key" UNIQUE (user_id);
ALTER TABLE platform_private.provisional_password_state ADD CONSTRAINT "provisional_password_state_pkey" PRIMARY KEY (user_id);
ALTER TABLE production_order_link ADD CONSTRAINT "production_order_link_pkey" PRIMARY KEY (id);
ALTER TABLE production_order_link ADD CONSTRAINT "production_order_link_partner_order_item_id_key" UNIQUE (partner_order_item_id);
ALTER TABLE production_planning ADD CONSTRAINT "production_planning_pkey" PRIMARY KEY (id);
ALTER TABLE production_planning ADD CONSTRAINT "production_planning_partner_order_id_key" UNIQUE (partner_order_id);
ALTER TABLE production_timeline_events ADD CONSTRAINT "production_timeline_events_pkey" PRIMARY KEY (id);
ALTER TABLE profiles ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE profiles ADD CONSTRAINT "profiles_user_id_key" UNIQUE (user_id);
ALTER TABLE receivable_payments ADD CONSTRAINT "receivable_payments_amount_sign_check" CHECK ((((COALESCE(is_reversal, false) = false) AND (amount_received > (0)::numeric)) OR ((is_reversal = true) AND (amount_received < (0)::numeric))));
ALTER TABLE receivable_payments ADD CONSTRAINT "receivable_payments_reversal_consistency_check" CHECK ((((COALESCE(is_reversal, false) = false) AND (reversed_payment_id IS NULL)) OR ((is_reversal = true) AND (reversed_payment_id IS NOT NULL))));
ALTER TABLE receivable_payments ADD CONSTRAINT "receivable_payments_pkey" PRIMARY KEY (id);
ALTER TABLE saas_features ADD CONSTRAINT "saas_features_key_format" CHECK ((key ~ '^[a-z][a-z0-9_.]{1,95}$'::text));
ALTER TABLE saas_features ADD CONSTRAINT "saas_features_name_nonblank" CHECK ((btrim(name) <> ''::text));
ALTER TABLE saas_features ADD CONSTRAINT "saas_features_pkey" PRIMARY KEY (id);
ALTER TABLE saas_features ADD CONSTRAINT "saas_features_key_unique" UNIQUE (key);
ALTER TABLE saas_modules ADD CONSTRAINT "saas_modules_key_format" CHECK ((key ~ '^[a-z][a-z0-9_]{1,63}$'::text));
ALTER TABLE saas_modules ADD CONSTRAINT "saas_modules_name_nonblank" CHECK ((btrim(name) <> ''::text));
ALTER TABLE saas_modules ADD CONSTRAINT "saas_modules_pkey" PRIMARY KEY (id);
ALTER TABLE saas_modules ADD CONSTRAINT "saas_modules_key_unique" UNIQUE (key);
ALTER TABLE saas_plan_version_features ADD CONSTRAINT "saas_plan_version_features_config_object" CHECK (((config IS NULL) OR (jsonb_typeof(config) = 'object'::text)));
ALTER TABLE saas_plan_version_features ADD CONSTRAINT "saas_plan_version_features_limit_nonnegative" CHECK (((limit_value IS NULL) OR (limit_value >= (0)::numeric)));
ALTER TABLE saas_plan_version_features ADD CONSTRAINT "saas_plan_version_features_pkey" PRIMARY KEY (plan_version_id, feature_id);
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_archive_shape" CHECK (((status <> 'ARCHIVED'::text) OR ((archived_at IS NOT NULL) AND (archived_by IS NOT NULL) AND (length(btrim(archive_reason)) >= 5))));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_currency_format" CHECK (((currency IS NULL) OR (currency ~ '^[A-Z]{3}$'::text)));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_cycle_valid" CHECK (((billing_cycle IS NULL) OR (billing_cycle = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'semiannual'::text, 'annual'::text, 'custom'::text]))));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_features_array" CHECK ((jsonb_typeof(features_snapshot) = 'array'::text));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_limits_object" CHECK ((jsonb_typeof(limits_snapshot) = 'object'::text));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_number_positive" CHECK ((version_number > 0));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_period_valid" CHECK (((effective_to IS NULL) OR (effective_to > effective_from)));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_price_nonnegative" CHECK (((price_amount IS NULL) OR (price_amount >= (0)::numeric)));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_publication_reason_length" CHECK (((publication_reason IS NULL) OR ((char_length(btrim(publication_reason)) >= 2) AND (char_length(btrim(publication_reason)) <= 500))));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_publish_shape" CHECK (((status = 'DRAFT'::text) OR ((price_amount IS NOT NULL) AND (currency IS NOT NULL) AND (billing_cycle IS NOT NULL) AND (trial_days IS NOT NULL) AND (effective_from IS NOT NULL) AND (published_at IS NOT NULL) AND (jsonb_typeof(limits_snapshot) = 'object'::text) AND (jsonb_array_length(features_snapshot) > 0))));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_revision_positive" CHECK ((revision > 0));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_status_valid" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ARCHIVED'::text])));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_trial_days_valid" CHECK (((trial_days IS NULL) OR ((trial_days >= 1) AND (trial_days <= 365))));
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_pkey" PRIMARY KEY (id);
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_plan_number_unique" UNIQUE (plan_id, version_number);
ALTER TABLE user_access_preferences ADD CONSTRAINT "user_access_preferences_last_context_chk" CHECK (((last_context IS NULL) OR (last_context = ANY (ARRAY['b2b'::text, 'technical'::text, 'admin'::text]))));
ALTER TABLE user_access_preferences ADD CONSTRAINT "user_access_preferences_preferred_context_chk" CHECK (((preferred_context IS NULL) OR (preferred_context = ANY (ARRAY['b2b'::text, 'technical'::text, 'admin'::text]))));
ALTER TABLE user_access_preferences ADD CONSTRAINT "user_access_preferences_pkey" PRIMARY KEY (user_id);
ALTER TABLE user_clientes ADD CONSTRAINT "user_clientes_pkey" PRIMARY KEY (id);
ALTER TABLE user_clientes ADD CONSTRAINT "user_clientes_user_id_cliente_id_key" UNIQUE (user_id, cliente_id);
ALTER TABLE user_context_access_logs ADD CONSTRAINT "user_context_access_logs_action_chk" CHECK ((action = ANY (ARRAY['login_redirect'::text, 'context_selected'::text, 'context_switched'::text, 'access_denied'::text])));
ALTER TABLE user_context_access_logs ADD CONSTRAINT "user_context_access_logs_context_chk" CHECK ((context_code = ANY (ARRAY['b2b'::text, 'technical'::text, 'producer'::text, 'none'::text, 'admin'::text])));
ALTER TABLE user_context_access_logs ADD CONSTRAINT "user_context_access_logs_previous_chk" CHECK (((previous_context IS NULL) OR (previous_context = ANY (ARRAY['b2b'::text, 'technical'::text, 'producer'::text, 'none'::text, 'admin'::text]))));
ALTER TABLE user_context_access_logs ADD CONSTRAINT "user_context_access_logs_pkey" PRIMARY KEY (id);
ALTER TABLE user_roles ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id);
ALTER TABLE user_roles ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE (user_id, role);
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_category_id_fkey" FOREIGN KEY (category_id) REFERENCES financial_categories(id);
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_cost_center_id_fkey" FOREIGN KEY (cost_center_id) REFERENCES financial_cost_centers(id);
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE accounts_payable ADD CONSTRAINT "accounts_payable_recurring_template_id_fkey" FOREIGN KEY (recurring_template_id) REFERENCES recurring_financial_templates(id);
ALTER TABLE accounts_payable_installments ADD CONSTRAINT "accounts_payable_installments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE accounts_payable_installments ADD CONSTRAINT "accounts_payable_installments_payable_id_fkey" FOREIGN KEY (payable_id) REFERENCES accounts_payable(id) ON DELETE CASCADE;
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_category_id_fkey" FOREIGN KEY (category_id) REFERENCES financial_categories(id);
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_cost_center_id_fkey" FOREIGN KEY (cost_center_id) REFERENCES financial_cost_centers(id);
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES clientes(id);
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_fiscal_exemption_id_fkey" FOREIGN KEY (fiscal_exemption_id) REFERENCES fiscal_requirement_exemptions(id);
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id);
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_payment_method_id_fkey" FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);
ALTER TABLE accounts_receivable ADD CONSTRAINT "accounts_receivable_recurring_template_id_fkey" FOREIGN KEY (recurring_template_id) REFERENCES recurring_financial_templates(id);
ALTER TABLE accounts_receivable_installments ADD CONSTRAINT "accounts_receivable_installments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE accounts_receivable_installments ADD CONSTRAINT "accounts_receivable_installments_receivable_id_fkey" FOREIGN KEY (receivable_id) REFERENCES accounts_receivable(id) ON DELETE CASCADE;
ALTER TABLE clientes ADD CONSTRAINT "clientes_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE clientes_audit_log ADD CONSTRAINT "clientes_audit_log_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES profiles(user_id);
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "commercial_payment_plans_root_plan_id_fkey" FOREIGN KEY (root_plan_id) REFERENCES commercial_payment_plans(id) ON DELETE RESTRICT;
ALTER TABLE commercial_payment_plans ADD CONSTRAINT "commercial_payment_plans_superseded_by_id_fkey" FOREIGN KEY (superseded_by_id) REFERENCES commercial_payment_plans(id) ON DELETE RESTRICT;
ALTER TABLE company_fiscal_settings ADD CONSTRAINT "company_fiscal_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE fazendas ADD CONSTRAINT "fazendas_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
ALTER TABLE fazendas ADD CONSTRAINT "fazendas_consultor_responsavel_id_fkey" FOREIGN KEY (consultor_responsavel_id) REFERENCES profiles(user_id);
ALTER TABLE fazendas ADD CONSTRAINT "fazendas_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE financial_audit_log ADD CONSTRAINT "financial_audit_log_performed_by_fkey" FOREIGN KEY (performed_by) REFERENCES auth.users(id);
ALTER TABLE financial_categories ADD CONSTRAINT "financial_categories_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES financial_categories(id) ON DELETE SET NULL;
ALTER TABLE fiscal_operation_policies ADD CONSTRAINT "fiscal_operation_policies_source_id_fkey" FOREIGN KEY (source_id) REFERENCES fiscal_official_sources(id);
ALTER TABLE organization_feature_overrides ADD CONSTRAINT "organization_feature_overrides_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES saas_features(id) ON DELETE RESTRICT;
ALTER TABLE organization_feature_overrides ADD CONSTRAINT "organization_feature_overrides_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE organization_subscriptions ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE organization_subscriptions ADD CONSTRAINT "organization_subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES saas_plans(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE organization_subscriptions ADD CONSTRAINT "organization_subscriptions_plan_version_id_fkey" FOREIGN KEY (plan_version_id) REFERENCES saas_plan_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE organizations ADD CONSTRAINT "organizations_partner_account_id_fkey" FOREIGN KEY (partner_account_id) REFERENCES partner_accounts(id) ON DELETE SET NULL;
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_commercial_owner_organization_id_fkey" FOREIGN KEY (commercial_owner_organization_id) REFERENCES organizations(id);
ALTER TABLE partner_accounts ADD CONSTRAINT "partner_accounts_consultor_responsavel_fkey" FOREIGN KEY (consultor_responsavel) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE partner_clients ADD CONSTRAINT "partner_clients_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
ALTER TABLE partner_clients ADD CONSTRAINT "partner_clients_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE CASCADE;
ALTER TABLE partner_engagement_metrics ADD CONSTRAINT "partner_engagement_metrics_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE CASCADE;
ALTER TABLE partner_financial_settings ADD CONSTRAINT "partner_financial_settings_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE CASCADE;
ALTER TABLE partner_order_financial_links ADD CONSTRAINT "partner_order_financial_links_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id);
ALTER TABLE partner_order_financial_links ADD CONSTRAINT "partner_order_financial_links_partner_order_id_fkey" FOREIGN KEY (partner_order_id) REFERENCES partner_orders(id) ON DELETE RESTRICT;
ALTER TABLE partner_order_financial_links ADD CONSTRAINT "partner_order_financial_links_receivable_id_fkey" FOREIGN KEY (receivable_id) REFERENCES accounts_receivable(id) ON DELETE RESTRICT;
ALTER TABLE partner_order_items ADD CONSTRAINT "partner_order_items_microrganismo_id_fkey" FOREIGN KEY (microrganismo_id) REFERENCES microrganismos(id);
ALTER TABLE partner_order_items ADD CONSTRAINT "partner_order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES partner_orders(id) ON DELETE CASCADE;
ALTER TABLE partner_order_items ADD CONSTRAINT "partner_order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES produtos(id);
ALTER TABLE partner_order_items ADD CONSTRAINT "poi_price_rule_snapshot_fk" FOREIGN KEY (price_rule_id_snapshot) REFERENCES commercial_price_rules(id) ON DELETE SET NULL;
ALTER TABLE partner_order_payment_schedule ADD CONSTRAINT "partner_order_payment_schedule_partner_order_id_fkey" FOREIGN KEY (partner_order_id) REFERENCES partner_orders(id) ON DELETE CASCADE;
ALTER TABLE partner_order_payment_schedule ADD CONSTRAINT "partner_order_payment_schedule_payment_terms_id_fkey" FOREIGN KEY (payment_terms_id) REFERENCES partner_order_payment_terms(id) ON DELETE CASCADE;
ALTER TABLE partner_order_payment_schedule ADD CONSTRAINT "partner_order_payment_schedule_receivable_installment_id_fkey" FOREIGN KEY (receivable_installment_id) REFERENCES accounts_receivable_installments(id) ON DELETE SET NULL;
ALTER TABLE partner_order_payment_terms ADD CONSTRAINT "partner_order_payment_terms_partner_order_id_fkey" FOREIGN KEY (partner_order_id) REFERENCES partner_orders(id) ON DELETE CASCADE;
ALTER TABLE partner_order_payment_terms ADD CONSTRAINT "partner_order_payment_terms_payment_plan_id_fkey" FOREIGN KEY (payment_plan_id) REFERENCES commercial_payment_plans(id);
ALTER TABLE partner_orders ADD CONSTRAINT "partner_orders_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE partner_orders ADD CONSTRAINT "partner_orders_credit_approved_by_fkey" FOREIGN KEY (credit_approved_by) REFERENCES auth.users(id);
ALTER TABLE partner_orders ADD CONSTRAINT "partner_orders_origin_simulation_id_fkey" FOREIGN KEY (origin_simulation_id) REFERENCES partner_simulations(id) ON DELETE SET NULL;
ALTER TABLE partner_orders ADD CONSTRAINT "partner_orders_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE RESTRICT;
ALTER TABLE partner_orders ADD CONSTRAINT "partner_orders_payment_plan_id_fkey" FOREIGN KEY (payment_plan_id) REFERENCES commercial_payment_plans(id);
ALTER TABLE partner_orders ADD CONSTRAINT "partner_orders_payment_terms_id_fkey" FOREIGN KEY (payment_terms_id) REFERENCES partner_order_payment_terms(id);
ALTER TABLE partner_product_prices ADD CONSTRAINT "partner_product_prices_microrganismo_id_fkey" FOREIGN KEY (microrganismo_id) REFERENCES microrganismos(id) ON DELETE CASCADE;
ALTER TABLE partner_product_prices ADD CONSTRAINT "partner_product_prices_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE CASCADE;
ALTER TABLE partner_product_prices ADD CONSTRAINT "partner_product_prices_product_id_fkey" FOREIGN KEY (product_id) REFERENCES produtos(id);
ALTER TABLE partner_risk_scores ADD CONSTRAINT "partner_risk_scores_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE CASCADE;
ALTER TABLE partner_technician_clients ADD CONSTRAINT "partner_technician_clients_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
ALTER TABLE partner_technician_clients ADD CONSTRAINT "partner_technician_clients_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE CASCADE;
ALTER TABLE partner_user_clients ADD CONSTRAINT "partner_user_clients_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
ALTER TABLE partner_user_clients ADD CONSTRAINT "partner_user_clients_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE CASCADE;
ALTER TABLE partner_users ADD CONSTRAINT "partner_users_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE CASCADE;
ALTER TABLE platform_org_admin_invites ADD CONSTRAINT "platform_org_admin_invites_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE production_order_link ADD CONSTRAINT "production_order_link_ordem_servico_id_fkey" FOREIGN KEY (ordem_servico_id) REFERENCES ordens_servico(id) ON DELETE CASCADE;
ALTER TABLE production_order_link ADD CONSTRAINT "production_order_link_partner_order_id_fkey" FOREIGN KEY (partner_order_id) REFERENCES partner_orders(id) ON DELETE CASCADE;
ALTER TABLE production_order_link ADD CONSTRAINT "production_order_link_partner_order_item_id_fkey" FOREIGN KEY (partner_order_item_id) REFERENCES partner_order_items(id) ON DELETE CASCADE;
ALTER TABLE production_order_link ADD CONSTRAINT "production_order_link_planning_id_fkey" FOREIGN KEY (planning_id) REFERENCES production_planning(id) ON DELETE CASCADE;
ALTER TABLE production_planning ADD CONSTRAINT "production_planning_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE CASCADE;
ALTER TABLE production_planning ADD CONSTRAINT "production_planning_partner_order_id_fkey" FOREIGN KEY (partner_order_id) REFERENCES partner_orders(id) ON DELETE CASCADE;
ALTER TABLE production_timeline_events ADD CONSTRAINT "production_timeline_events_partner_order_id_fkey" FOREIGN KEY (partner_order_id) REFERENCES partner_orders(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD CONSTRAINT "profiles_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE receivable_payments ADD CONSTRAINT "receivable_payments_bank_account_id_fkey" FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);
ALTER TABLE receivable_payments ADD CONSTRAINT "receivable_payments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE receivable_payments ADD CONSTRAINT "receivable_payments_installment_id_fkey" FOREIGN KEY (installment_id) REFERENCES accounts_receivable_installments(id) ON DELETE CASCADE;
ALTER TABLE receivable_payments ADD CONSTRAINT "receivable_payments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE receivable_payments ADD CONSTRAINT "receivable_payments_payment_method_id_fkey" FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);
ALTER TABLE receivable_payments ADD CONSTRAINT "receivable_payments_reversed_payment_id_fkey" FOREIGN KEY (reversed_payment_id) REFERENCES receivable_payments(id);
ALTER TABLE saas_features ADD CONSTRAINT "saas_features_module_id_fkey" FOREIGN KEY (module_id) REFERENCES saas_modules(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE saas_plan_version_features ADD CONSTRAINT "saas_plan_version_features_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES saas_features(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE saas_plan_version_features ADD CONSTRAINT "saas_plan_version_features_plan_version_id_fkey" FOREIGN KEY (plan_version_id) REFERENCES saas_plan_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE saas_plan_versions ADD CONSTRAINT "saas_plan_versions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES saas_plans(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE user_access_preferences ADD CONSTRAINT "user_access_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_clientes ADD CONSTRAINT "user_clientes_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
ALTER TABLE user_context_access_logs ADD CONSTRAINT "user_context_access_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_roles ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);
CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);
CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);
CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));
CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);
CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);
CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);
CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);
CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);
CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);
CREATE INDEX idx_users_email ON auth.users USING btree (email);
CREATE TRIGGER a00_cf_user_gate BEFORE DELETE ON auth.users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON auth.users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ap_refmonth ON public.accounts_payable USING btree (reference_month);
CREATE INDEX idx_ap_status ON public.accounts_payable USING btree (status);
CREATE INDEX idx_ap_created_at ON public.accounts_payable USING btree (created_at DESC);
CREATE INDEX accounts_payable_organization_id_idx ON public.accounts_payable USING btree (organization_id);
CREATE INDEX idx_ap_status_due ON public.accounts_payable USING btree (status, first_due_date);
CREATE INDEX idx_ap_supplier_status ON public.accounts_payable USING btree (supplier_id, status);
CREATE TRIGGER protect_payable_allocation BEFORE UPDATE OF total_amount, cost_center_id ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION finance_private.protect_allocated_payable();
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION guard_tenant_organization_id();
CREATE TRIGGER trg_ap_gen_installments AFTER INSERT ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION fn_generate_payable_installments();
CREATE TRIGGER trg_ap_uat BEFORE UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_audit_ap AFTER INSERT OR DELETE OR UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION fn_financial_audit();
CREATE TRIGGER trg_h6_ap_snapshot BEFORE UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION fn_h6_guard_title_snapshot();
CREATE TRIGGER trg_h6d_ap_no_delete BEFORE DELETE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION fn_h6d_block_hard_delete();
CREATE TRIGGER trg_saas_gate BEFORE INSERT OR UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION _saas_trg_require_feature('contas_pagar');
ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_payable_insert_financial" ON accounts_payable AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "accounts_payable_select_financial" ON accounts_payable AS PERMISSIVE FOR SELECT TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "accounts_payable_update_financial" ON accounts_payable AS PERMISSIVE FOR UPDATE TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid))) WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "financial_rpc_only_delete" ON accounts_payable AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "financial_rpc_only_insert" ON accounts_payable AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "financial_rpc_only_update" ON accounts_payable AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "tenant_isolation_d51_5" ON accounts_payable AS RESTRICTIVE FOR ALL TO authenticated USING (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization()))) WITH CHECK (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization())));
CREATE INDEX idx_ap_inst_status ON public.accounts_payable_installments USING btree (status);
CREATE INDEX accounts_payable_installments_organization_id_idx ON public.accounts_payable_installments USING btree (organization_id);
CREATE INDEX idx_ap_inst_due ON public.accounts_payable_installments USING btree (due_date);
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, payable_id ON public.accounts_payable_installments FOR EACH ROW EXECUTE FUNCTION d51_5_validate_financial_tenant_links();
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.accounts_payable_installments FOR EACH ROW EXECUTE FUNCTION guard_tenant_organization_id();
CREATE TRIGGER trg_h6_api_snapshot BEFORE UPDATE ON public.accounts_payable_installments FOR EACH ROW EXECUTE FUNCTION fn_h6_guard_ap_installment_snapshot();
CREATE TRIGGER trg_h6d_api_no_delete BEFORE DELETE ON public.accounts_payable_installments FOR EACH ROW EXECUTE FUNCTION fn_h6d_block_hard_delete();
ALTER TABLE accounts_payable_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_payable_installments_insert_financial" ON accounts_payable_installments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "accounts_payable_installments_select_financial" ON accounts_payable_installments AS PERMISSIVE FOR SELECT TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "accounts_payable_installments_update_financial" ON accounts_payable_installments AS PERMISSIVE FOR UPDATE TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid))) WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "financial_rpc_only_delete" ON accounts_payable_installments AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "financial_rpc_only_insert" ON accounts_payable_installments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "financial_rpc_only_update" ON accounts_payable_installments AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "tenant_isolation_d51_5" ON accounts_payable_installments AS RESTRICTIVE FOR ALL TO authenticated USING (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization()))) WITH CHECK (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization())));
CREATE UNIQUE INDEX ux_ar_one_per_delivery ON public.accounts_receivable USING btree (origin_id) WHERE ((origin_type = 'DELIVERY'::text) AND (status <> 'CANCELED'::text));
CREATE INDEX idx_ar_refmonth ON public.accounts_receivable USING btree (reference_month);
CREATE INDEX accounts_receivable_organization_id_idx ON public.accounts_receivable USING btree (organization_id);
CREATE INDEX idx_ar_status_due ON public.accounts_receivable USING btree (status, first_due_date);
CREATE INDEX idx_ar_status ON public.accounts_receivable USING btree (status);
CREATE INDEX idx_ar_customer_status ON public.accounts_receivable USING btree (customer_id, status);
CREATE INDEX idx_ar_partner_b2b ON public.accounts_receivable USING btree (partner_id) WHERE (origin_type = 'B2B_ORDER'::text);
CREATE INDEX idx_ar_created_at ON public.accounts_receivable USING btree (created_at DESC);
CREATE INDEX idx_ar_customer ON public.accounts_receivable USING btree (customer_id);
CREATE UNIQUE INDEX ux_ar_one_active_per_b2b_order ON public.accounts_receivable USING btree (origin_id) WHERE ((origin_type = 'B2B_ORDER'::text) AND (status <> 'CANCELED'::text));
CREATE INDEX idx_ar_issue_date ON public.accounts_receivable USING btree (issue_date);
CREATE INDEX idx_ar_origin ON public.accounts_receivable USING btree (origin_type, origin_id);
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, customer_id ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION d51_5_validate_financial_tenant_links();
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION guard_tenant_organization_id();
CREATE TRIGGER trg_ar_gen_installments AFTER INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION fn_generate_receivable_installments();
CREATE TRIGGER trg_ar_uat BEFORE UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_audit_ar AFTER INSERT OR DELETE OR UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION fn_financial_audit();
CREATE TRIGGER trg_h6_ar_snapshot BEFORE UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION fn_h6_guard_title_snapshot();
CREATE TRIGGER trg_h6d_ar_no_delete BEFORE DELETE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION fn_h6d_block_hard_delete();
CREATE TRIGGER trg_saas_gate BEFORE INSERT OR UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION _saas_trg_require_feature('contas_receber');
CREATE TRIGGER trg_sync_b2b_financial_status AFTER UPDATE OF status ON public.accounts_receivable FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION tg_sync_b2b_financial_status();
ALTER TABLE accounts_receivable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_receivable_insert_financial" ON accounts_receivable AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "accounts_receivable_select_financial" ON accounts_receivable AS PERMISSIVE FOR SELECT TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "accounts_receivable_update_financial" ON accounts_receivable AS PERMISSIVE FOR UPDATE TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid))) WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "ar_b2b_readers" ON accounts_receivable AS PERMISSIVE FOR SELECT TO authenticated USING (((origin_type = 'B2B_ORDER'::text) AND (platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'administrativo'::app_role))));
CREATE POLICY "ar_partner_select_own_b2b" ON accounts_receivable AS PERMISSIVE FOR SELECT TO authenticated USING (((origin_type = 'B2B_ORDER'::text) AND platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = ( SELECT ((platform_private.b2b_commercial_context() ->> 'partner_id'::text))::uuid AS uuid))));
CREATE POLICY "ar_producer_read" ON accounts_receivable AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'cliente_produtor'::app_role) AND (customer_id = ANY (get_cliente_ids_for_user(( SELECT auth.uid() AS uid)))) AND (partner_id IS NULL) AND (origin_type IS DISTINCT FROM 'B2B_ORDER'::text)));
CREATE POLICY "financial_rpc_only_delete" ON accounts_receivable AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "financial_rpc_only_insert" ON accounts_receivable AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "financial_rpc_only_update" ON accounts_receivable AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "tenant_isolation_d51_5" ON accounts_receivable AS RESTRICTIVE FOR ALL TO authenticated USING (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization()))) WITH CHECK (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization())));
CREATE INDEX accounts_receivable_installments_organization_id_idx ON public.accounts_receivable_installments USING btree (organization_id);
CREATE INDEX idx_ar_inst_due ON public.accounts_receivable_installments USING btree (due_date);
CREATE INDEX idx_ari_receivable ON public.accounts_receivable_installments USING btree (receivable_id);
CREATE INDEX idx_ar_inst_status ON public.accounts_receivable_installments USING btree (status);
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, receivable_id ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION d51_5_validate_financial_tenant_links();
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION guard_tenant_organization_id();
CREATE TRIGGER trg_h6_ari_snapshot BEFORE UPDATE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION fn_h6_guard_ar_installment_snapshot();
CREATE TRIGGER trg_h6d_ari_no_delete BEFORE DELETE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION fn_h6d_block_hard_delete();
CREATE TRIGGER trg_recalc_risk_on_ar_change AFTER INSERT OR UPDATE OF status, received_amount ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION tg_recalc_risk_on_ar_change();
ALTER TABLE accounts_receivable_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_receivable_installments_insert_financial" ON accounts_receivable_installments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "accounts_receivable_installments_select_financial" ON accounts_receivable_installments AS PERMISSIVE FOR SELECT TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "accounts_receivable_installments_update_financial" ON accounts_receivable_installments AS PERMISSIVE FOR UPDATE TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid))) WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "ari_b2b_readers" ON accounts_receivable_installments AS PERMISSIVE FOR SELECT TO authenticated USING (((platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'administrativo'::app_role)) AND (EXISTS ( SELECT 1
   FROM accounts_receivable ar
  WHERE ((ar.id = accounts_receivable_installments.receivable_id) AND (ar.origin_type = 'B2B_ORDER'::text))))));
CREATE POLICY "ari_partner_select_own_b2b" ON accounts_receivable_installments AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (EXISTS ( SELECT 1
   FROM accounts_receivable ar
  WHERE ((ar.id = accounts_receivable_installments.receivable_id) AND (ar.origin_type = 'B2B_ORDER'::text) AND (ar.partner_id = ( SELECT ((platform_private.b2b_commercial_context() ->> 'partner_id'::text))::uuid AS uuid)))))));
CREATE POLICY "ari_producer_read" ON accounts_receivable_installments AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'cliente_produtor'::app_role) AND (EXISTS ( SELECT 1
   FROM accounts_receivable ar
  WHERE ((ar.id = accounts_receivable_installments.receivable_id) AND (ar.customer_id = ANY (get_cliente_ids_for_user(( SELECT auth.uid() AS uid)))) AND (ar.partner_id IS NULL) AND (ar.origin_type IS DISTINCT FROM 'B2B_ORDER'::text))))));
CREATE POLICY "financial_rpc_only_delete" ON accounts_receivable_installments AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "financial_rpc_only_insert" ON accounts_receivable_installments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "financial_rpc_only_update" ON accounts_receivable_installments AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "tenant_isolation_d51_5" ON accounts_receivable_installments AS RESTRICTIVE FOR ALL TO authenticated USING (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization()))) WITH CHECK (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization())));
ALTER TABLE cf_user_guards_v1.state ENABLE ROW LEVEL SECURITY;
CREATE INDEX clientes_organization_id_idx ON public.clientes USING btree (organization_id);
CREATE UNIQUE INDEX clientes_tenant_document_unique ON public.clientes USING btree (organization_id, upper(regexp_replace(cpf_cnpj, '[[:space:]./-]'::text, ''::text, 'g'::text))) WHERE ((organization_id IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM cpf_cnpj), ''::text) IS NOT NULL));
CREATE UNIQUE INDEX clientes_codigo_cliente_key ON public.clientes USING btree (codigo_cliente);
CREATE TRIGGER clientes_audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION trg_clientes_audit();
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION guard_tenant_organization_id();
CREATE TRIGGER trg_set_codigo_cliente BEFORE INSERT ON public.clientes FOR EACH ROW EXECUTE FUNCTION set_codigo_cliente();
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read access" ON clientes AS PERMISSIVE FOR SELECT TO authenticated USING (can_user_access_cliente(id));
CREATE POLICY "Tenant writers manage clients" ON clientes AS PERMISSIVE FOR ALL TO authenticated USING (((organization_id = platform_private.h15_actor_organization()) AND (platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role) OR platform_private.has_role(auth.uid(), 'gestor_comercial'::app_role)))) WITH CHECK (((organization_id = platform_private.h15_actor_organization()) AND (platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role) OR platform_private.has_role(auth.uid(), 'gestor_comercial'::app_role))));
CREATE POLICY "tenant_isolation_d51_5" ON clientes AS RESTRICTIVE FOR ALL TO authenticated USING (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization()))) WITH CHECK (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization())));
ALTER TABLE clientes_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura auditoria para gestores" ON clientes_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role)));
CREATE INDEX idx_commercial_audit_partner ON public.commercial_audit_log USING btree (partner_id, created_at DESC);
CREATE INDEX idx_commercial_audit_order ON public.commercial_audit_log USING btree (order_id, created_at DESC);
ALTER TABLE commercial_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cau_admin_select" ON commercial_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "cau_authenticated_insert" ON commercial_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE INDEX idx_cpp_validity ON public.commercial_payment_plans USING btree (active, valid_from, valid_until);
CREATE UNIQUE INDEX uq_cpp_single_default ON public.commercial_payment_plans USING btree ((true)) WHERE is_default;
CREATE INDEX idx_payment_plans_active_sort ON public.commercial_payment_plans USING btree (active, sort_order);
CREATE INDEX idx_cpp_root_version ON public.commercial_payment_plans USING btree (root_plan_id, version DESC);
CREATE TRIGGER trg_cpp_guard_financial BEFORE DELETE OR UPDATE ON public.commercial_payment_plans FOR EACH ROW EXECUTE FUNCTION tg_cpp_guard_financial_immutability();
CREATE TRIGGER trg_cpp_updated_at BEFORE UPDATE ON public.commercial_payment_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE commercial_payment_plans ENABLE ROW LEVEL SECURITY;
CREATE INDEX ix_company_fiscal_settings_organization ON public.company_fiscal_settings USING btree (organization_id);
CREATE UNIQUE INDEX ux_company_fiscal_settings_active_organization ON public.company_fiscal_settings USING btree (organization_id) WHERE (is_active IS TRUE);
CREATE TRIGGER h15_company_integrity BEFORE INSERT OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION h15_company_integrity();
CREATE TRIGGER tg_fiscal_cfs_audit AFTER INSERT OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION tg_fiscal_cfs_audit();
CREATE TRIGGER trg_fiscal_certificate_ref_guard BEFORE INSERT OR UPDATE OF certificate_ref ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION fn_fiscal_certificate_ref_guard();
CREATE TRIGGER trg_fiscal_emitter_readiness BEFORE INSERT OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION tg_fiscal_emitter_refresh_readiness();
CREATE TRIGGER trg_fiscal_homologation_evidence_guard BEFORE UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION tg_fiscal_homologation_evidence_guard();
ALTER TABLE company_fiscal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_fiscal_settings_delete" ON company_fiscal_settings AS PERMISSIVE FOR DELETE TO authenticated USING ((false AND (organization_id = platform_private.h15_actor_organization())));
CREATE POLICY "company_fiscal_settings_insert" ON company_fiscal_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) AND (organization_id = platform_private.h15_actor_organization())));
CREATE POLICY "company_fiscal_settings_read" ON company_fiscal_settings AS PERMISSIVE FOR SELECT TO authenticated USING (((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role)) AND (organization_id = platform_private.h15_actor_organization())));
CREATE POLICY "company_fiscal_settings_update" ON company_fiscal_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) AND (organization_id = platform_private.h15_actor_organization()))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) AND (organization_id = platform_private.h15_actor_organization())));
CREATE INDEX idx_fazendas_cliente_id ON public.fazendas USING btree (cliente_id);
CREATE UNIQUE INDEX idx_fazendas_cliente_codigo ON public.fazendas USING btree (cliente_id, codigo_referencia) WHERE (codigo_referencia IS NOT NULL);
CREATE INDEX fazendas_organization_id_idx ON public.fazendas USING btree (organization_id);
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.fazendas FOR EACH ROW EXECUTE FUNCTION guard_tenant_organization_id();
CREATE TRIGGER update_fazendas_updated_at BEFORE UPDATE ON public.fazendas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE fazendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fazendas read access" ON fazendas AS PERMISSIVE FOR SELECT TO authenticated USING (can_user_access_cliente(cliente_id));
CREATE POLICY "Tenant writers manage farms" ON fazendas AS PERMISSIVE FOR ALL TO authenticated USING (((organization_id = platform_private.h15_actor_organization()) AND (platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role)))) WITH CHECK (((organization_id = platform_private.h15_actor_organization()) AND (platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role))));
CREATE POLICY "tenant_isolation_d51_5" ON fazendas AS RESTRICTIVE FOR ALL TO authenticated USING (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization()))) WITH CHECK (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization())));
CREATE INDEX idx_fal_entity ON public.financial_audit_log USING btree (entity_type, entity_id);
ALTER TABLE financial_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Financial staff read audit" ON financial_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "financial_audit_source_tenant_scope" ON financial_audit_log AS RESTRICTIVE FOR SELECT TO authenticated USING (((( SELECT h15_actor_organization() AS h15_actor_organization) IS NOT NULL) AND
CASE
    WHEN ((action = 'FINANCIAL_INSTALLMENTS_CUSTOMIZED'::text) AND (entity_type = 'accounts_receivable_installments'::text)) THEN (EXISTS ( SELECT 1
       FROM accounts_receivable source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN ((action = 'FINANCIAL_INSTALLMENTS_CUSTOMIZED'::text) AND (entity_type = 'accounts_payable_installments'::text)) THEN (EXISTS ( SELECT 1
       FROM accounts_payable source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'accounts_receivable'::text) THEN (EXISTS ( SELECT 1
       FROM accounts_receivable source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'accounts_payable'::text) THEN (EXISTS ( SELECT 1
       FROM accounts_payable source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'accounts_receivable_installments'::text) THEN (EXISTS ( SELECT 1
       FROM accounts_receivable_installments source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'accounts_payable_installments'::text) THEN (EXISTS ( SELECT 1
       FROM accounts_payable_installments source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'receivable_payments'::text) THEN (EXISTS ( SELECT 1
       FROM receivable_payments source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'payable_payments'::text) THEN (EXISTS ( SELECT 1
       FROM payable_payments source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'financial_documents'::text) THEN (EXISTS ( SELECT 1
       FROM financial_documents source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'financial_receipts'::text) THEN (EXISTS ( SELECT 1
       FROM financial_receipts source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'financial_report_exports'::text) THEN (EXISTS ( SELECT 1
       FROM financial_report_exports source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = 'fiscal_invoices'::text) THEN (EXISTS ( SELECT 1
       FROM fiscal_invoices source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = ANY (ARRAY['recurring_financial_templates'::text, 'RECURRING_TEMPLATE'::text])) THEN (EXISTS ( SELECT 1
       FROM recurring_financial_templates source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    WHEN (entity_type = ANY (ARRAY['entrega'::text, 'entregas'::text])) THEN (EXISTS ( SELECT 1
       FROM entregas source
      WHERE ((source.id = financial_audit_log.entity_id) AND (source.organization_id = ( SELECT h15_actor_organization() AS h15_actor_organization)))))
    ELSE false
END));
CREATE INDEX idx_financial_categories_dre_group ON public.financial_categories USING btree (dre_group);
CREATE TRIGGER guard_financial_category_platform_write BEFORE INSERT OR DELETE OR UPDATE ON public.financial_categories FOR EACH ROW EXECUTE FUNCTION guard_financial_category_platform_write();
CREATE TRIGGER trg_audit_category_dre AFTER UPDATE ON public.financial_categories FOR EACH ROW EXECUTE FUNCTION fn_audit_category_dre();
CREATE TRIGGER trg_fc_uat BEFORE UPDATE ON public.financial_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE financial_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Financial staff full access" ON financial_categories AS PERMISSIVE FOR ALL TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid))) WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE INDEX idx_fgal_partner ON public.financial_governance_audit_log USING btree (partner_id);
CREATE INDEX idx_fgal_created ON public.financial_governance_audit_log USING btree (created_at DESC);
ALTER TABLE financial_governance_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fgal_b2b_readers" ON financial_governance_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'administrativo'::app_role)));
CREATE POLICY "fgal_insert_system" ON financial_governance_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY "fgal_select_staff" ON financial_governance_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role)));
ALTER TABLE financial_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Financial staff can read settings" ON financial_settings AS PERMISSIVE FOR SELECT TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "d51_5_financial_settings_global_mutation" ON financial_settings AS RESTRICTIVE FOR ALL TO authenticated USING (is_platform_superadmin(auth.uid())) WITH CHECK (is_platform_superadmin(auth.uid()));
CREATE POLICY "fs_write_staff" ON financial_settings AS PERMISSIVE FOR UPDATE TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid))) WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE UNIQUE INDEX fop_active_uq ON public.fiscal_operation_policies USING btree (sales_channel, operation_type, COALESCE(uf, '*'::text), COALESCE(origin_uf, '*'::text), COALESCE(destination_uf, '*'::text), COALESCE(document_model, '*'::text), COALESCE(taxpayer_indicator, '*'::text), COALESCE(final_consumer, false), valid_from) WHERE active;
CREATE INDEX ix_fop_resolution ON public.fiscal_operation_policies USING btree (document_model, direction, origin_uf, destination_uf, priority) WHERE (policy_status = 'PUBLISHED'::text);
CREATE TRIGGER tg_fiscal_operation_policies_audit AFTER INSERT OR DELETE OR UPDATE ON public.fiscal_operation_policies FOR EACH ROW EXECUTE FUNCTION fiscal_audit_trigger();
CREATE TRIGGER trg_f3_audit_fiscal_operation_policies AFTER INSERT OR DELETE OR UPDATE ON public.fiscal_operation_policies FOR EACH ROW EXECUTE FUNCTION fiscal_audit_trigger();
CREATE TRIGGER trg_fiscal_operation_policy_immutable BEFORE DELETE OR UPDATE ON public.fiscal_operation_policies FOR EACH ROW EXECUTE FUNCTION tg_fiscal_operation_policy_immutable();
CREATE TRIGGER trg_fop_touch BEFORE UPDATE ON public.fiscal_operation_policies FOR EACH ROW EXECUTE FUNCTION tg_commercial_conditions_touch();
ALTER TABLE fiscal_operation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f3_internal_read_fiscal_operation_policies" ON fiscal_operation_policies AS PERMISSIVE FOR SELECT TO authenticated USING (fn_fiscal_can_read_internal());
CREATE UNIQUE INDEX fre_active_uq ON public.fiscal_requirement_exemptions USING btree (scope_type, scope_id) WHERE active;
CREATE TRIGGER trg_fre_touch BEFORE UPDATE ON public.fiscal_requirement_exemptions FOR EACH ROW EXECUTE FUNCTION tg_commercial_conditions_touch();
ALTER TABLE fiscal_requirement_exemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fre_admin_read" ON fiscal_requirement_exemptions AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role)));
CREATE UNIQUE INDEX ux_notif_op_idempotency ON public.notificacoes_operacionais USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_notif_op_usuario_lido_created ON public.notificacoes_operacionais USING btree (usuario_id, lido, created_at DESC);
CREATE TRIGGER notification_p1_guard BEFORE INSERT OR UPDATE ON public.notificacoes_operacionais FOR EACH ROW EXECUTE FUNCTION platform_private.notification_p1_guard();
ALTER TABLE notificacoes_operacionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny direct delete on notificacoes_operacionais" ON notificacoes_operacionais AS PERMISSIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "Deny direct insert on notificacoes_operacionais" ON notificacoes_operacionais AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "notification_p1_op_isolation" ON notificacoes_operacionais AS RESTRICTIVE FOR ALL TO authenticated USING (platform_private.notification_p1_visible(usuario_id, source_type, source_id)) WITH CHECK (platform_private.notification_p1_visible(usuario_id, source_type, source_id));
CREATE POLICY "user_select_own_notif_op" ON notificacoes_operacionais AS PERMISSIVE FOR SELECT TO public USING ((usuario_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "user_update_own_notif_op" ON notificacoes_operacionais AS PERMISSIVE FOR UPDATE TO authenticated USING ((usuario_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((usuario_id = ( SELECT auth.uid() AS uid)));
CREATE INDEX ofo_org_idx ON public.organization_feature_overrides USING btree (organization_id);
CREATE UNIQUE INDEX uq_organization_feature_overrides_idempotency ON public.organization_feature_overrides USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX ofo_feature_idx ON public.organization_feature_overrides USING btree (feature_id);
CREATE UNIQUE INDEX ofo_one_open_per_feature ON public.organization_feature_overrides USING btree (organization_id, feature_id) WHERE (ended_at IS NULL);
CREATE UNIQUE INDEX uq_organization_feature_overrides_end_idempotency ON public.organization_feature_overrides USING btree (end_idempotency_key) WHERE (end_idempotency_key IS NOT NULL);
CREATE TRIGGER ofo_guard_trg BEFORE DELETE OR UPDATE ON public.organization_feature_overrides FOR EACH ROW EXECUTE FUNCTION ofo_guard();
CREATE TRIGGER ofo_stamp_author_trg BEFORE INSERT ON public.organization_feature_overrides FOR EACH ROW EXECUTE FUNCTION ofo_stamp_author();
CREATE TRIGGER ofo_stamp_end_trg BEFORE UPDATE ON public.organization_feature_overrides FOR EACH ROW EXECUTE FUNCTION ofo_stamp_end();
CREATE TRIGGER saas_feature_override_guard_trg BEFORE DELETE OR UPDATE ON public.organization_feature_overrides FOR EACH ROW EXECUTE FUNCTION saas_feature_override_guard();
ALTER TABLE organization_feature_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin cria exceções" ON organization_feature_overrides AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_superadmin(auth.uid()));
CREATE POLICY "Superadmin encerra exceções" ON organization_feature_overrides AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_superadmin(auth.uid())) WITH CHECK (is_platform_superadmin(auth.uid()));
CREATE POLICY "Superadmin le exceções" ON organization_feature_overrides AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_superadmin(auth.uid()));
CREATE INDEX idx_org_subscriptions_trial_due ON public.organization_subscriptions USING btree (status, trial_ends_at) WHERE (status = 'TRIAL'::saas_subscription_status);
CREATE INDEX idx_org_subscriptions_plan_id ON public.organization_subscriptions USING btree (plan_id);
CREATE INDEX idx_org_subscriptions_status ON public.organization_subscriptions USING btree (status);
CREATE UNIQUE INDEX uq_org_subscriptions_one_current ON public.organization_subscriptions USING btree (organization_id) WHERE (status = ANY (ARRAY['TRIAL'::saas_subscription_status, 'ACTIVE'::saas_subscription_status, 'PAST_DUE'::saas_subscription_status, 'SUSPENDED'::saas_subscription_status]));
CREATE INDEX idx_org_subscriptions_org_status ON public.organization_subscriptions USING btree (organization_id, status);
CREATE INDEX idx_org_subscriptions_plan_version ON public.organization_subscriptions USING btree (plan_version_id);
CREATE TRIGGER organization_subscriptions_no_delete_trg BEFORE DELETE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION saas_no_delete();
CREATE TRIGGER saas_subscription_guard_trg BEFORE INSERT OR UPDATE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION saas_subscription_guard();
CREATE TRIGGER saas_subscription_require_published_version_trg BEFORE INSERT OR UPDATE OF plan_version_id, status, started_at ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION saas_subscription_require_published_version();
CREATE TRIGGER saas_trial_validate_trg BEFORE INSERT ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION saas_trial_validate();
CREATE TRIGGER trg_org_subscriptions_audit AFTER INSERT OR UPDATE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION saas_subscription_audit();
CREATE TRIGGER trg_org_subscriptions_no_delete BEFORE DELETE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION saas_subscription_no_delete();
CREATE TRIGGER trg_organization_subscriptions_updated_at BEFORE UPDATE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin altera assinatura" ON organization_subscriptions AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_superadmin(auth.uid())) WITH CHECK (is_platform_superadmin(auth.uid()));
CREATE POLICY "Superadmin cria assinatura" ON organization_subscriptions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_superadmin(auth.uid()));
CREATE POLICY "Superadmin lê assinaturas" ON organization_subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_superadmin(( SELECT auth.uid() AS uid)));
CREATE POLICY "saas_platform_read" ON organization_subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_superadmin(( SELECT auth.uid() AS uid)));
CREATE POLICY "saas_tenant_admin_read_own_org" ON organization_subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) AND (organization_id = platform_private.h15_actor_organization())));
CREATE UNIQUE INDEX organizations_partner_account_uidx ON public.organizations USING btree (partner_account_id) WHERE (partner_account_id IS NOT NULL);
CREATE INDEX organizations_responsavel_user_id_idx ON public.organizations USING btree (responsavel_user_id);
CREATE UNIQUE INDEX uq_organizations_cnpj_normalizado ON public.organizations USING btree (cnpj_normalizado) WHERE (cnpj_normalizado IS NOT NULL);
CREATE TRIGGER trg_organizations_guard_status BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION organizations_guard_status();
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin le empresas" ON organizations AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_superadmin(auth.uid()));
CREATE POLICY "b2b_organization_full_row_containment" ON organizations AS RESTRICTIVE FOR SELECT TO authenticated USING (platform_private.b2b_organization_full_row_allowed());
CREATE POLICY "organizations_select_scoped" ON organizations AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.organization_id = organizations.id)))));
CREATE INDEX idx_partner_accounts_consultor ON public.partner_accounts USING btree (consultor_responsavel);
CREATE INDEX idx_partner_accounts_client ON public.partner_accounts USING btree (client_id);
CREATE INDEX idx_partner_accounts_type ON public.partner_accounts USING btree (partner_type);
CREATE INDEX idx_partner_accounts_ativo ON public.partner_accounts USING btree (ativo);
CREATE INDEX idx_partner_accounts_codigo ON public.partner_accounts USING btree (codigo);
CREATE INDEX idx_partner_accounts_region ON public.partner_accounts USING btree (commercial_region);
CREATE TRIGGER commercial_partner_registration_guard BEFORE INSERT OR UPDATE ON public.partner_accounts FOR EACH ROW EXECUTE FUNCTION guard_commercial_partner_registration();
CREATE TRIGGER trg_create_default_pfs AFTER INSERT ON public.partner_accounts FOR EACH ROW EXECUTE FUNCTION tg_create_default_pfs();
CREATE TRIGGER trg_partner_accounts_audit AFTER INSERT OR UPDATE ON public.partner_accounts FOR EACH ROW EXECUTE FUNCTION partner_audit_trigger();
CREATE TRIGGER trg_partner_accounts_updated_at BEFORE UPDATE ON public.partner_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_recalc_partner_prices_on_default_change AFTER UPDATE OF desconto_padrao ON public.partner_accounts FOR EACH ROW EXECUTE FUNCTION recalc_partner_prices_on_default_change();
ALTER TABLE partner_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "b2b_direct_partner_row_containment" ON partner_accounts AS RESTRICTIVE FOR ALL TO authenticated USING (platform_private.b2b_direct_partner_row_allowed()) WITH CHECK (platform_private.b2b_direct_partner_row_allowed());
CREATE POLICY "d51_5_partner_accounts_tenant_guard" ON partner_accounts AS RESTRICTIVE FOR ALL TO authenticated USING ((platform_private.b2b_coherent_self_partner(id) OR ((commercial_owner_organization_id = h15_actor_organization()) AND ((client_id IS NULL) OR (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = partner_accounts.client_id) AND (c.organization_id = partner_accounts.commercial_owner_organization_id)))))) OR ((commercial_owner_organization_id IS NULL) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = partner_accounts.client_id) AND (c.organization_id = h15_actor_organization()))))))) WITH CHECK (((commercial_owner_organization_id = h15_actor_organization()) AND ((client_id IS NULL) OR (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = partner_accounts.client_id) AND (c.organization_id = partner_accounts.commercial_owner_organization_id)))))));
CREATE POLICY "partner_accounts_insert" ON partner_accounts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "partner_accounts_select" ON partner_accounts AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "partner_accounts_self_select" ON partner_accounts AS PERMISSIVE FOR SELECT TO public USING (platform_private.b2b_coherent_self_partner(id));
CREATE POLICY "partner_accounts_update" ON partner_accounts AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE INDEX idx_pal_partner ON public.partner_audit_logs USING btree (partner_id, created_at DESC);
ALTER TABLE partner_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pal_select" ON partner_audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE INDEX idx_partner_clients_partner_active ON public.partner_clients USING btree (partner_id, active);
CREATE INDEX idx_partner_clients_active ON public.partner_clients USING btree (active);
CREATE INDEX idx_partner_clients_partner ON public.partner_clients USING btree (partner_id);
CREATE INDEX idx_partner_clients_cliente ON public.partner_clients USING btree (cliente_id);
CREATE INDEX idx_partner_clients_partner_cliente_active ON public.partner_clients USING btree (partner_id, cliente_id, active);
CREATE TRIGGER trg_partner_clients_updated BEFORE UPDATE ON public.partner_clients FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
ALTER TABLE partner_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bf02_assignment_contract_containment" ON partner_clients AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "pc_insert" ON partner_clients AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "pc_select" ON partner_clients AS PERMISSIVE FOR SELECT TO public USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id())) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b_tecnico'::app_role) AND (EXISTS ( SELECT 1
   FROM partner_user_clients puc
  WHERE ((puc.partner_id = partner_clients.partner_id) AND (puc.cliente_id = partner_clients.cliente_id) AND (puc.user_id = ( SELECT auth.uid() AS uid)) AND (puc.active = true)))))));
CREATE POLICY "pc_update" ON partner_clients AS PERMISSIVE FOR UPDATE TO public USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
ALTER TABLE partner_engagement_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pem_admin" ON partner_engagement_metrics AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "pem_self" ON partner_engagement_metrics AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id())));
CREATE INDEX idx_pfs_partner ON public.partner_financial_settings USING btree (partner_id);
CREATE TRIGGER trg_pfs_governance_audit AFTER INSERT OR DELETE OR UPDATE ON public.partner_financial_settings FOR EACH ROW EXECUTE FUNCTION tg_governance_audit();
CREATE TRIGGER trg_pfs_updated_at BEFORE UPDATE ON public.partner_financial_settings FOR EACH ROW EXECUTE FUNCTION tg_pfs_updated_at();
ALTER TABLE partner_financial_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "b2b_financial_settings_tenant_guard" ON partner_financial_settings AS RESTRICTIVE FOR ALL TO authenticated USING ((( SELECT is_platform_superadmin(auth.uid()) AS is_platform_superadmin) OR ((NOT ( SELECT platform_private.has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role) AS has_role)) AND (EXISTS ( SELECT 1
   FROM ((profiles p
     JOIN organizations o ON ((o.id = p.organization_id)))
     JOIN partner_accounts pa ON ((pa.id = o.partner_account_id)))
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.ativo = true) AND (o.ativo = true) AND (o.status = 'ativa'::text) AND (pa.id = partner_financial_settings.partner_id) AND (pa.ativo = true) AND (pa.deleted_at IS NULL))))))) WITH CHECK ((( SELECT is_platform_superadmin(auth.uid()) AS is_platform_superadmin) OR ((NOT ( SELECT platform_private.has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role) AS has_role)) AND (EXISTS ( SELECT 1
   FROM ((profiles p
     JOIN organizations o ON ((o.id = p.organization_id)))
     JOIN partner_accounts pa ON ((pa.id = o.partner_account_id)))
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.ativo = true) AND (o.ativo = true) AND (o.status = 'ativa'::text) AND (pa.id = partner_financial_settings.partner_id) AND (pa.ativo = true) AND (pa.deleted_at IS NULL)))))));
CREATE POLICY "pfs_admin_fin_insert" ON partner_financial_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "pfs_admin_fin_select" ON partner_financial_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "pfs_admin_fin_update" ON partner_financial_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "pfs_b2b_readers" ON partner_financial_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'administrativo'::app_role)));
CREATE INDEX idx_poal_partner ON public.partner_order_audit_logs USING btree (partner_id, created_at DESC);
CREATE INDEX idx_poal_order ON public.partner_order_audit_logs USING btree (order_id, created_at DESC);
ALTER TABLE partner_order_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poal_select" ON partner_order_audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE INDEX idx_pofl_partner ON public.partner_order_financial_links USING btree (partner_id);
CREATE INDEX idx_pofl_receivable ON public.partner_order_financial_links USING btree (receivable_id);
CREATE TRIGGER trg_b2b_block_receivable_before_approval BEFORE INSERT ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION tg_b2b_block_receivable_before_approval();
CREATE TRIGGER trg_block_pofl_delete BEFORE DELETE ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION tg_block_pofl_delete();
CREATE TRIGGER trg_pofl_updated_at BEFORE UPDATE ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION tg_pofl_updated_at();
ALTER TABLE partner_order_financial_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "b2b_phase1_tenant_guard" ON partner_order_financial_links AS RESTRICTIVE FOR ALL TO authenticated USING ((platform_private.b2b_phase1_order_visible(partner_order_id) AND platform_private.b2b_phase1_partner_visible(partner_id, false))) WITH CHECK ((platform_private.b2b_phase1_order_visible(partner_order_id) AND platform_private.b2b_phase1_partner_visible(partner_id, false)));
CREATE POLICY "pofl_admin_fin_all" ON partner_order_financial_links AS PERMISSIVE FOR ALL TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "pofl_b2b_readers" ON partner_order_financial_links AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'administrativo'::app_role)));
CREATE POLICY "pofl_partner_select_own" ON partner_order_financial_links AS PERMISSIVE FOR SELECT TO authenticated USING ((partner_id IN ( SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = ( SELECT auth.uid() AS uid)))));
CREATE INDEX idx_partner_order_items_microrganismo ON public.partner_order_items USING btree (microrganismo_id);
CREATE INDEX idx_partner_order_items_product ON public.partner_order_items USING btree (product_id);
CREATE INDEX idx_partner_order_items_order ON public.partner_order_items USING btree (order_id);
CREATE TRIGGER trg_00_b2b_internal_snapshot BEFORE INSERT OR DELETE OR UPDATE ON public.partner_order_items FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_child_snapshot_guard();
CREATE TRIGGER trg_b2b_order_items_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.partner_order_items FOR EACH ROW EXECUTE FUNCTION fn_b2b_guard_order_items_immutable();
CREATE TRIGGER trg_block_partner_order_items_after_op BEFORE INSERT OR DELETE OR UPDATE ON public.partner_order_items FOR EACH ROW EXECUTE FUNCTION tg_block_partner_order_items_after_op();
CREATE TRIGGER trg_partner_order_items_resolve_pending AFTER INSERT ON public.partner_order_items FOR EACH ROW EXECUTE FUNCTION tg_partner_order_items_resolve_pending();
ALTER TABLE partner_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "b2b_phase1_tenant_guard" ON partner_order_items AS RESTRICTIVE FOR ALL TO authenticated USING (platform_private.b2b_phase1_order_visible(order_id)) WITH CHECK (platform_private.b2b_phase1_order_visible(order_id));
CREATE POLICY "partner_order_items_delete" ON partner_order_items AS PERMISSIVE FOR DELETE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "partner_order_items_insert" ON partner_order_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "partner_order_items_select" ON partner_order_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM partner_orders o
  WHERE ((o.id = partner_order_items.order_id) AND (platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (o.partner_id = get_user_partner_id())))))));
CREATE POLICY "partner_order_items_update" ON partner_order_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE INDEX idx_payment_schedule_order ON public.partner_order_payment_schedule USING btree (partner_order_id);
CREATE INDEX idx_payment_schedule_due ON public.partner_order_payment_schedule USING btree (due_date);
CREATE TRIGGER trg_00_b2b_internal_snapshot BEFORE INSERT OR DELETE OR UPDATE ON public.partner_order_payment_schedule FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_child_snapshot_guard();
ALTER TABLE partner_order_payment_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "b2b_phase1_tenant_guard" ON partner_order_payment_schedule AS RESTRICTIVE FOR ALL TO authenticated USING (platform_private.b2b_phase1_order_visible(partner_order_id)) WITH CHECK (platform_private.b2b_phase1_order_visible(partner_order_id));
CREATE POLICY "pops_insert" ON partner_order_payment_schedule AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "pops_select" ON partner_order_payment_schedule AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (EXISTS ( SELECT 1
   FROM (partner_orders po
     JOIN partner_users pu ON ((pu.partner_id = po.partner_id)))
  WHERE ((po.id = partner_order_payment_schedule.partner_order_id) AND (pu.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "pops_update" ON partner_order_payment_schedule AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE INDEX idx_payment_terms_order ON public.partner_order_payment_terms USING btree (partner_order_id);
CREATE TRIGGER trg_00_b2b_internal_snapshot BEFORE INSERT OR DELETE OR UPDATE ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_child_snapshot_guard();
CREATE TRIGGER trg_b2b_plan_selectable_terms BEFORE INSERT OR UPDATE OF payment_plan_id ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION tg_b2b_enforce_plan_selectable();
CREATE TRIGGER trg_h6c_set_canonical_payment_terms AFTER INSERT ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION fn_h6c_set_canonical_payment_terms();
CREATE TRIGGER trg_popt_audit AFTER INSERT OR UPDATE ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION audit_partner_order_payment_terms();
CREATE TRIGGER trg_popt_updated_at BEFORE UPDATE ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE partner_order_payment_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "b2b_phase1_tenant_guard" ON partner_order_payment_terms AS RESTRICTIVE FOR ALL TO authenticated USING (platform_private.b2b_phase1_order_visible(partner_order_id)) WITH CHECK (platform_private.b2b_phase1_order_visible(partner_order_id));
CREATE POLICY "popt_insert" ON partner_order_payment_terms AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "popt_select" ON partner_order_payment_terms AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (EXISTS ( SELECT 1
   FROM (partner_orders po
     JOIN partner_users pu ON ((pu.partner_id = po.partner_id)))
  WHERE ((po.id = partner_order_payment_terms.partner_order_id) AND (pu.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "popt_update" ON partner_order_payment_terms AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE INDEX idx_partner_orders_cliente ON public.partner_orders USING btree (cliente_id);
CREATE INDEX idx_partner_orders_partner ON public.partner_orders USING btree (partner_id);
CREATE INDEX idx_partner_orders_payment_plan ON public.partner_orders USING btree (payment_plan_id);
CREATE INDEX idx_partner_orders_priority ON public.partner_orders USING btree (priority);
CREATE INDEX idx_partner_orders_full ON public.partner_orders USING btree (partner_id, status, priority, created_at DESC);
CREATE INDEX idx_partner_orders_origin_simulation ON public.partner_orders USING btree (origin_simulation_id);
CREATE INDEX idx_partner_orders_status ON public.partner_orders USING btree (status);
CREATE INDEX idx_partner_orders_payment_approval ON public.partner_orders USING btree (payment_condition_status, financial_approval_status);
CREATE INDEX idx_partner_orders_created ON public.partner_orders USING btree (created_at DESC);
CREATE TRIGGER partner_order_timeline_ins AFTER INSERT ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION trg_partner_order_timeline();
CREATE TRIGGER partner_order_timeline_upd AFTER UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION trg_partner_order_timeline();
CREATE TRIGGER trg_00_b2b_internal_snapshot BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_order_snapshot_guard();
CREATE TRIGGER trg_audit_po_commercial AFTER UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_audit_partner_order_commercial();
CREATE TRIGGER trg_auto_b2b_receivable AFTER UPDATE OF status ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_auto_b2b_receivable();
CREATE TRIGGER trg_b2b_guard_credit_approval_fields BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION fn_b2b_guard_credit_approval_fields();
CREATE TRIGGER trg_b2b_plan_selectable_orders BEFORE INSERT OR UPDATE OF payment_plan_id ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_b2b_enforce_plan_selectable();
CREATE TRIGGER trg_block_partner_order_delete BEFORE DELETE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_block_partner_order_delete();
CREATE TRIGGER trg_block_partner_order_edit_after_op BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_block_partner_order_edit_after_op();
CREATE TRIGGER trg_notify_payment_terms_pending AFTER INSERT OR UPDATE OF requires_financial_approval, financial_approval_status ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_notify_payment_terms_pending();
CREATE TRIGGER trg_partner_order_to_planning AFTER UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION trg_partner_order_to_planning_fn();
CREATE TRIGGER trg_partner_orders_audit AFTER INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION partner_orders_audit_trigger();
CREATE TRIGGER trg_partner_orders_credit_guard BEFORE INSERT OR UPDATE OF status, total ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_partner_orders_credit_guard();
CREATE TRIGGER trg_partner_orders_require_items BEFORE UPDATE OF status ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_partner_orders_require_items();
CREATE TRIGGER trg_partner_orders_updated_at BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_refresh_engagement AFTER INSERT OR DELETE OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_refresh_engagement();
CREATE TRIGGER trg_saas_gate BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION _saas_trg_require_feature('pedidos_b2b');
ALTER TABLE partner_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Financeiro read partner_orders" ON partner_orders AS PERMISSIVE FOR SELECT TO authenticated USING (platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role));
CREATE POLICY "b2b_phase1_tenant_guard" ON partner_orders AS RESTRICTIVE FOR ALL TO authenticated USING (platform_private.b2b_phase1_partner_visible(partner_id, false)) WITH CHECK (platform_private.b2b_phase1_partner_visible(partner_id, false));
CREATE POLICY "partner_orders_insert" ON partner_orders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "partner_orders_select" ON partner_orders AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id()))));
CREATE POLICY "partner_orders_update" ON partner_orders AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE UNIQUE INDEX uniq_partner_product_current ON public.partner_product_prices USING btree (partner_id, product_id) WHERE (is_current = true);
CREATE UNIQUE INDEX ppp_partner_product_uniq ON public.partner_product_prices USING btree (partner_id, product_id) WHERE (product_id IS NOT NULL);
CREATE INDEX idx_ppp_product ON public.partner_product_prices USING btree (product_id);
CREATE INDEX idx_ppp_partner ON public.partner_product_prices USING btree (partner_id);
CREATE INDEX idx_ppp_ativo ON public.partner_product_prices USING btree (ativo);
CREATE UNIQUE INDEX ppp_partner_microrganismo_uniq ON public.partner_product_prices USING btree (partner_id, microrganismo_id) WHERE (microrganismo_id IS NOT NULL);
CREATE INDEX idx_ppp_current ON public.partner_product_prices USING btree (partner_id, product_id) WHERE is_current;
CREATE TRIGGER trg_audit_ppp AFTER INSERT OR DELETE OR UPDATE ON public.partner_product_prices FOR EACH ROW EXECUTE FUNCTION tg_commercial_audit();
CREATE TRIGGER trg_ppp_audit AFTER INSERT OR UPDATE ON public.partner_product_prices FOR EACH ROW EXECUTE FUNCTION partner_audit_trigger();
CREATE TRIGGER trg_ppp_compute_final BEFORE INSERT OR UPDATE ON public.partner_product_prices FOR EACH ROW EXECUTE FUNCTION partner_ppp_compute_final();
CREATE TRIGGER trg_ppp_updated_at BEFORE UPDATE ON public.partner_product_prices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_set_current_price_table BEFORE INSERT OR UPDATE OF is_current ON public.partner_product_prices FOR EACH ROW EXECUTE FUNCTION tg_set_current_price_table();
CREATE TRIGGER trg_unique_current_price_table AFTER INSERT OR UPDATE OF is_current, partner_id, product_id ON public.partner_product_prices FOR EACH ROW EXECUTE FUNCTION tg_unique_current_price_table();
ALTER TABLE partner_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_prices_partner_scope_guard" ON partner_product_prices AS RESTRICTIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM partner_accounts pa
  WHERE (pa.id = partner_product_prices.partner_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM partner_accounts pa
  WHERE (pa.id = partner_product_prices.partner_id))));
CREATE POLICY "partner_product_prices_select" ON partner_product_prices AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "ppp_insert" ON partner_product_prices AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY "ppp_self_select" ON partner_product_prices AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id())));
CREATE POLICY "ppp_update" ON partner_product_prices AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE INDEX idx_prs_level ON public.partner_risk_scores USING btree (risk_level);
CREATE INDEX idx_prs_partner ON public.partner_risk_scores USING btree (partner_id);
CREATE TRIGGER trg_prs_updated_at BEFORE UPDATE ON public.partner_risk_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE partner_risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prs_select_staff" ON partner_risk_scores AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role)));
CREATE INDEX idx_ptc_partner_tech_active ON public.partner_technician_clients USING btree (partner_id, technician_user_id, active);
CREATE INDEX idx_ptc_cliente ON public.partner_technician_clients USING btree (cliente_id);
CREATE INDEX idx_ptc_active ON public.partner_technician_clients USING btree (active);
CREATE INDEX idx_ptc_partner ON public.partner_technician_clients USING btree (partner_id);
CREATE INDEX idx_ptc_partner_cliente_active ON public.partner_technician_clients USING btree (partner_id, cliente_id, active);
CREATE INDEX idx_ptc_tech ON public.partner_technician_clients USING btree (technician_user_id);
CREATE TRIGGER trg_ptc_updated_at BEFORE UPDATE ON public.partner_technician_clients FOR EACH ROW EXECUTE FUNCTION tg_ptc_updated_at();
ALTER TABLE partner_technician_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ptc_insert" ON partner_technician_clients AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id()) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.user_id = partner_technician_clients.technician_user_id) AND (pu.partner_id = partner_technician_clients.partner_id)))))));
CREATE POLICY "ptc_select" ON partner_technician_clients AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id())) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b_tecnico'::app_role) AND (technician_user_id = ( SELECT auth.uid() AS uid)) AND (active = true))));
CREATE POLICY "ptc_update" ON partner_technician_clients AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id())))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id()))));
CREATE INDEX idx_puc_partner_cliente_active ON public.partner_user_clients USING btree (partner_id, cliente_id, active);
CREATE INDEX idx_puc_active ON public.partner_user_clients USING btree (active);
CREATE INDEX idx_puc_user ON public.partner_user_clients USING btree (user_id);
CREATE INDEX idx_puc_partner ON public.partner_user_clients USING btree (partner_id);
CREATE INDEX idx_puc_partner_user_active ON public.partner_user_clients USING btree (partner_id, user_id, active);
CREATE INDEX idx_puc_cliente ON public.partner_user_clients USING btree (cliente_id);
CREATE TRIGGER trg_puc_updated BEFORE UPDATE ON public.partner_user_clients FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER trg_sync_puc_to_ptc AFTER INSERT OR UPDATE ON public.partner_user_clients FOR EACH ROW EXECUTE FUNCTION sync_puc_to_ptc_fn();
CREATE TRIGGER trg_validate_puc BEFORE INSERT OR UPDATE ON public.partner_user_clients FOR EACH ROW EXECUTE FUNCTION validate_partner_user_client_fn();
ALTER TABLE partner_user_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bf02_assignment_contract_containment" ON partner_user_clients AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "puc_insert" ON partner_user_clients AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id()))));
CREATE POLICY "puc_select" ON partner_user_clients AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id())) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b_tecnico'::app_role) AND (user_id = ( SELECT auth.uid() AS uid)) AND (active = true))));
CREATE POLICY "puc_update" ON partner_user_clients AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id())))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id()))));
CREATE INDEX idx_partner_users_tenant_id ON public.partner_users USING btree (tenant_id);
CREATE INDEX idx_partner_users_user_id ON public.partner_users USING btree (user_id);
CREATE INDEX idx_partner_users_active ON public.partner_users USING btree (user_id, partner_id) WHERE (revoked_at IS NULL);
CREATE INDEX idx_partner_users_partner ON public.partner_users USING btree (partner_id);
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.partner_users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.partner_users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER a10_partner_users_derive_tenant BEFORE INSERT OR UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION partner_users_derive_tenant();
CREATE TRIGGER a20_partner_users_bump_version BEFORE UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION partner_users_bump_version();
CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
ALTER TABLE partner_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins can read same organization partner links" ON partner_users AS PERMISSIVE FOR SELECT TO authenticated USING (platform_private.is_tenant_admin_for_user(user_id));
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Financial staff full access" ON payment_methods AS PERMISSIVE FOR ALL TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid))) WITH CHECK (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE INDEX platform_org_admin_invites_lease_idx ON public.platform_org_admin_invites USING btree (status, lease_expires_at) WHERE (status = ANY (ARRAY['pendente'::text, 'processando'::text, 'falhou'::text]));
CREATE UNIQUE INDEX platform_org_admin_invites_request_uidx ON public.platform_org_admin_invites USING btree (request_id);
CREATE UNIQUE INDEX platform_org_admin_invites_email_uidx ON public.platform_org_admin_invites USING btree (lower(email));
CREATE INDEX platform_org_admin_invites_email_delivery_idx ON public.platform_org_admin_invites USING btree (email_delivery_status, email_next_attempt_at, email_lease_expires_at) WHERE ((modo_acesso = 'link'::text) AND (email_delivery_status = ANY (ARRAY['pending'::text, 'sending'::text, 'failed'::text])));
CREATE INDEX platform_org_admin_invites_org_idx ON public.platform_org_admin_invites USING btree (organization_id);
CREATE TRIGGER a00_cf_invitation_gate BEFORE INSERT OR DELETE OR UPDATE ON public.platform_org_admin_invites FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_invitation_gate();
CREATE TRIGGER a00_cf_invitation_no_truncate BEFORE TRUNCATE ON public.platform_org_admin_invites FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER z90_cf_invitation_profile_stamp AFTER INSERT OR DELETE OR UPDATE ON public.platform_org_admin_invites FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_invitation_profiles();
ALTER TABLE platform_org_admin_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_org_admin_invites_service_only" ON platform_org_admin_invites AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "platform_org_admin_invites_superadmin_read" ON platform_org_admin_invites AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_superadmin(auth.uid()));
ALTER TABLE platform_private.authz_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.b2b_provisioning_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.provisional_password_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provisional_password_state_deny" ON platform_private.provisional_password_state AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX idx_polink_partner_order ON public.production_order_link USING btree (partner_order_id);
CREATE INDEX idx_polink_os ON public.production_order_link USING btree (ordem_servico_id);
CREATE TRIGGER trg_block_production_link_delete BEFORE DELETE ON public.production_order_link FOR EACH ROW EXECUTE FUNCTION tg_block_production_link_delete();
CREATE TRIGGER trg_recalc_planning_from_link AFTER INSERT ON public.production_order_link FOR EACH ROW EXECUTE FUNCTION tg_recalc_planning_from_link();
ALTER TABLE production_order_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY "polink_insert_producao" ON production_order_link AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'producao'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role)));
CREATE POLICY "polink_select_staff" ON production_order_link AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'producao'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role)));
CREATE POLICY "polink_update_producao" ON production_order_link AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'producao'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role))) WITH CHECK ((platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'producao'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role)));
CREATE INDEX idx_planning_partner ON public.production_planning USING btree (partner_id);
CREATE INDEX idx_planning_status ON public.production_planning USING btree (status);
CREATE TRIGGER trg_block_planning_delete BEFORE DELETE ON public.production_planning FOR EACH ROW EXECUTE FUNCTION tg_block_planning_delete();
CREATE TRIGGER trg_planning_updated_at BEFORE UPDATE ON public.production_planning FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE production_planning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "d51_5_production_planning_tenant_guard" ON production_planning AS RESTRICTIVE FOR ALL TO authenticated USING (((partner_id = get_user_partner_id()) OR (EXISTS ( SELECT 1
   FROM (partner_accounts pa
     JOIN clientes c ON ((c.id = pa.client_id)))
  WHERE ((pa.id = production_planning.partner_id) AND (c.organization_id = platform_private.h15_actor_organization())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (partner_accounts pa
     JOIN clientes c ON ((c.id = pa.client_id)))
  WHERE ((pa.id = production_planning.partner_id) AND (c.organization_id = platform_private.h15_actor_organization())))));
CREATE POLICY "planning_insert_producao" ON production_planning AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'producao'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role)));
CREATE POLICY "planning_select_staff" ON production_planning AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'producao'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role)));
CREATE POLICY "planning_update_producao" ON production_planning AS PERMISSIVE FOR UPDATE TO authenticated USING ((platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'producao'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role))) WITH CHECK ((platform_private.has_role(auth.uid(), 'administrador'::app_role) OR platform_private.has_role(auth.uid(), 'producao'::app_role) OR platform_private.has_role(auth.uid(), 'gestor'::app_role)));
CREATE INDEX idx_ptl_partner_order ON public.production_timeline_events USING btree (partner_order_id, event_at DESC);
ALTER TABLE production_timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ptl_insert_staff" ON production_timeline_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'producao'::app_role)));
CREATE POLICY "ptl_select_staff_or_partner" ON production_timeline_events AS PERMISSIVE FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'producao'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR (EXISTS ( SELECT 1
   FROM (partner_orders po
     JOIN partner_users pu ON ((pu.partner_id = po.partner_id)))
  WHERE ((po.id = production_timeline_events.partner_order_id) AND (pu.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE INDEX idx_profiles_user_id_covering ON public.profiles USING btree (user_id) INCLUDE (nome, email);
CREATE INDEX idx_profiles_ativo ON public.profiles USING btree (ativo);
CREATE INDEX profiles_organization_id_idx ON public.profiles USING btree (organization_id);
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER guard_profile_senha_provisoria BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_senha_provisoria();
CREATE TRIGGER guard_profile_senha_ticket BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_senha_ticket();
CREATE TRIGGER guard_profile_sensitive_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_sensitive_fields();
CREATE TRIGGER h15_profile_organization_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION h15_profile_organization_guard();
CREATE TRIGGER trg_guard_profile_tenant_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_tenant_fields();
CREATE TRIGGER trg_profiles_enforce_cliente BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION enforce_cliente_id_for_produtor();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER z99_cf_profile_stamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp();
CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins can update same organization profiles" ON profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (platform_private.is_tenant_admin_for_user(user_id)) WITH CHECK (platform_private.is_tenant_admin_for_user(user_id));
CREATE POLICY "Tenant admins can view same organization profiles" ON profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR platform_private.is_tenant_admin_for_user(user_id)));
CREATE POLICY "Users can insert own profile" ON profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own non sensitive profile fields" ON profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view own profile" ON profiles AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE UNIQUE INDEX ux_rp_idempotency ON public.receivable_payments USING btree (installment_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_rp_date ON public.receivable_payments USING btree (payment_date);
CREATE UNIQUE INDEX ux_receivable_payments_one_reversal ON public.receivable_payments USING btree (reversed_payment_id) WHERE ((is_reversal = true) AND (reversed_payment_id IS NOT NULL));
CREATE INDEX receivable_payments_organization_id_idx ON public.receivable_payments USING btree (organization_id);
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, installment_id ON public.receivable_payments FOR EACH ROW EXECUTE FUNCTION d51_5_validate_financial_tenant_links();
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.receivable_payments FOR EACH ROW EXECUTE FUNCTION guard_tenant_organization_id();
CREATE TRIGGER trg_audit_rp AFTER INSERT OR DELETE OR UPDATE ON public.receivable_payments FOR EACH ROW EXECUTE FUNCTION fn_financial_audit();
CREATE TRIGGER trg_h6_rp_append_only BEFORE DELETE OR UPDATE ON public.receivable_payments FOR EACH ROW EXECUTE FUNCTION fn_h6_payments_append_only();
CREATE TRIGGER trg_recalc_ar_inst AFTER INSERT OR DELETE OR UPDATE ON public.receivable_payments FOR EACH ROW EXECUTE FUNCTION fn_recalc_receivable_installment();
ALTER TABLE receivable_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp_select_financial" ON receivable_payments AS PERMISSIVE FOR SELECT TO authenticated USING (is_financial_staff(( SELECT auth.uid() AS uid)));
CREATE POLICY "tenant_isolation_d51_5" ON receivable_payments AS RESTRICTIVE FOR ALL TO authenticated USING (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization()))) WITH CHECK (((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization())));
CREATE INDEX idx_saas_features_module_id ON public.saas_features USING btree (module_id);
CREATE INDEX idx_saas_features_active ON public.saas_features USING btree (active);
CREATE TRIGGER trg_saas_features_updated_at BEFORE UPDATE ON public.saas_features FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE saas_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saas_admin_read" ON saas_features AS PERMISSIVE FOR SELECT TO authenticated USING (platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role));
CREATE POLICY "saas_platform_read" ON saas_features AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_superadmin(( SELECT auth.uid() AS uid)));
CREATE TRIGGER trg_saas_modules_updated_at BEFORE UPDATE ON public.saas_modules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE saas_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saas_admin_read" ON saas_modules AS PERMISSIVE FOR SELECT TO authenticated USING (platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role));
CREATE POLICY "saas_platform_read" ON saas_modules AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_superadmin(( SELECT auth.uid() AS uid)));
CREATE INDEX idx_saas_plan_version_features_feature ON public.saas_plan_version_features USING btree (feature_id);
CREATE TRIGGER saas_plan_version_features_no_mutation BEFORE INSERT OR DELETE OR UPDATE ON public.saas_plan_version_features FOR EACH ROW EXECUTE FUNCTION saas_plan_version_feature_guard();
ALTER TABLE saas_plan_version_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saas_plan_version_features_platform_read" ON saas_plan_version_features AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_superadmin(( SELECT auth.uid() AS uid)));
CREATE POLICY "saas_plan_version_features_platform_write" ON saas_plan_version_features AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_superadmin(( SELECT auth.uid() AS uid))) WITH CHECK (is_platform_superadmin(( SELECT auth.uid() AS uid)));
CREATE POLICY "saas_plan_version_features_tenant_read_current" ON saas_plan_version_features AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM organization_subscriptions s
  WHERE ((s.plan_version_id = saas_plan_version_features.plan_version_id) AND (s.organization_id = platform_private.h15_actor_organization()) AND platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role)))));
CREATE INDEX idx_saas_plan_versions_plan_effective ON public.saas_plan_versions USING btree (plan_id, effective_from DESC);
CREATE UNIQUE INDEX uq_saas_plan_versions_effective_from ON public.saas_plan_versions USING btree (plan_id, effective_from);
CREATE UNIQUE INDEX uq_saas_plan_versions_publish_key ON public.saas_plan_versions USING btree (publish_key) WHERE (publish_key IS NOT NULL);
CREATE UNIQUE INDEX uq_saas_plan_versions_one_draft_per_plan ON public.saas_plan_versions USING btree (plan_id) WHERE (status = 'DRAFT'::text);
CREATE UNIQUE INDEX uq_saas_plan_versions_draft_key ON public.saas_plan_versions USING btree (draft_key) WHERE (draft_key IS NOT NULL);
CREATE UNIQUE INDEX uq_saas_plan_versions_correlation ON public.saas_plan_versions USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);
CREATE INDEX idx_saas_plan_versions_status_effective ON public.saas_plan_versions USING btree (status, effective_from DESC);
CREATE TRIGGER saas_plan_version_guard_trg BEFORE INSERT ON public.saas_plan_versions FOR EACH ROW EXECUTE FUNCTION saas_plan_version_guard();
CREATE TRIGGER saas_plan_version_no_mutation BEFORE DELETE OR UPDATE ON public.saas_plan_versions FOR EACH ROW EXECUTE FUNCTION saas_plan_version_no_mutation();
ALTER TABLE saas_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saas_plan_versions_platform_insert" ON saas_plan_versions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_platform_superadmin(( SELECT auth.uid() AS uid)) AND (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "saas_plan_versions_platform_read" ON saas_plan_versions AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_superadmin(( SELECT auth.uid() AS uid)));
CREATE POLICY "saas_plan_versions_platform_update" ON saas_plan_versions AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_superadmin(( SELECT auth.uid() AS uid))) WITH CHECK (is_platform_superadmin(( SELECT auth.uid() AS uid)));
CREATE POLICY "saas_plan_versions_tenant_read_current" ON saas_plan_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM organization_subscriptions s
  WHERE ((s.plan_version_id = saas_plan_versions.id) AND (s.organization_id = platform_private.h15_actor_organization()) AND platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role)))));
CREATE TRIGGER trg_user_access_preferences_touch BEFORE UPDATE ON public.user_access_preferences FOR EACH ROW EXECUTE FUNCTION tg_user_access_preferences_touch();
ALTER TABLE user_access_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own access preferences" ON user_access_preferences AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE UNIQUE INDEX uq_user_clientes_principal ON public.user_clientes USING btree (user_id) WHERE (principal = true);
CREATE INDEX idx_user_clientes_valid_until ON public.user_clientes USING btree (valid_until) WHERE (valid_until IS NOT NULL);
CREATE INDEX idx_user_clientes_cliente ON public.user_clientes USING btree (cliente_id);
CREATE INDEX idx_user_clientes_cliente_active ON public.user_clientes USING btree (cliente_id) WHERE (is_active = true);
CREATE INDEX idx_user_clientes_user ON public.user_clientes USING btree (user_id);
CREATE INDEX idx_user_clientes_user_cliente_active ON public.user_clientes USING btree (user_id, cliente_id) WHERE (is_active = true);
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.user_clientes FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER trg_user_clientes_sync_del AFTER DELETE ON public.user_clientes REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_user_cliente_principal();
CREATE TRIGGER trg_user_clientes_sync_ins AFTER INSERT ON public.user_clientes REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_user_cliente_principal();
CREATE TRIGGER trg_user_clientes_sync_upd AFTER UPDATE ON public.user_clientes REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_user_cliente_principal();
CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
ALTER TABLE user_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins can read same organization user links" ON user_clientes AS PERMISSIVE FOR SELECT TO authenticated USING (platform_private.is_tenant_admin_for_user(user_id));
CREATE POLICY "user_clientes self select" ON user_clientes AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE INDEX idx_user_context_logs_user_created ON public.user_context_access_logs USING btree (user_id, created_at DESC);
ALTER TABLE user_context_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own context logs" ON user_context_access_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role)));
CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER trg_guard_superadmin_role_assignment BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION guard_superadmin_role_assignment();
CREATE TRIGGER trg_user_roles_enforce_cliente BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION enforce_cliente_id_for_produtor();
CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins can delete same organization roles" ON user_roles AS PERMISSIVE FOR DELETE TO authenticated USING (((role <> 'superadmin'::app_role) AND platform_private.is_tenant_admin_for_user(user_id)));
CREATE POLICY "Tenant admins can insert same organization roles" ON user_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((role <> 'superadmin'::app_role) AND platform_private.is_tenant_admin_for_user(user_id)));
CREATE POLICY "Tenant admins can read same organization roles" ON user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (platform_private.is_tenant_admin_for_user(user_id));
CREATE POLICY "Tenant admins can update same organization roles" ON user_roles AS PERMISSIVE FOR UPDATE TO authenticated USING (((role <> 'superadmin'::app_role) AND platform_private.is_tenant_admin_for_user(user_id))) WITH CHECK (((role <> 'superadmin'::app_role) AND platform_private.is_tenant_admin_for_user(user_id)));
CREATE POLICY "Users can view own roles" ON user_roles AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER TABLE auth.users OWNER TO supabase_auth_admin;
REVOKE ALL ON auth.users FROM PUBLIC, supabase_auth_admin;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON auth.users TO supabase_auth_admin;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON auth.users TO dashboard_user;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON auth.users TO postgres;
GRANT SELECT ON auth.users TO postgres WITH GRANT OPTION;
ALTER TABLE accounts_payable OWNER TO postgres;
REVOKE ALL ON accounts_payable FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_payable TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_payable TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_payable TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_payable TO service_role;
ALTER TABLE accounts_payable_installments OWNER TO postgres;
REVOKE ALL ON accounts_payable_installments FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_payable_installments TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_payable_installments TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_payable_installments TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_payable_installments TO service_role;
ALTER TABLE accounts_receivable OWNER TO postgres;
REVOKE ALL ON accounts_receivable FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_receivable TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_receivable TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_receivable TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_receivable TO service_role;
ALTER TABLE accounts_receivable_installments OWNER TO postgres;
REVOKE ALL ON accounts_receivable_installments FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_receivable_installments TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_receivable_installments TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_receivable_installments TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON accounts_receivable_installments TO service_role;
ALTER TABLE cf_user_guards_v1.state OWNER TO postgres;
REVOKE ALL ON cf_user_guards_v1.state FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON cf_user_guards_v1.state TO postgres;
ALTER TABLE clientes OWNER TO postgres;
REVOKE ALL ON clientes FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON clientes TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON clientes TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON clientes TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON clientes TO service_role;
ALTER TABLE clientes_audit_log OWNER TO postgres;
REVOKE ALL ON clientes_audit_log FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON clientes_audit_log TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON clientes_audit_log TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON clientes_audit_log TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON clientes_audit_log TO service_role;
ALTER TABLE commercial_audit_log OWNER TO postgres;
REVOKE ALL ON commercial_audit_log FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON commercial_audit_log TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON commercial_audit_log TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON commercial_audit_log TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON commercial_audit_log TO service_role;
ALTER TABLE commercial_payment_plans OWNER TO postgres;
REVOKE ALL ON commercial_payment_plans FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON commercial_payment_plans TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON commercial_payment_plans TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON commercial_payment_plans TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON commercial_payment_plans TO service_role;
ALTER TABLE company_fiscal_settings OWNER TO postgres;
REVOKE ALL ON company_fiscal_settings FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON company_fiscal_settings TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON company_fiscal_settings TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON company_fiscal_settings TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON company_fiscal_settings TO service_role;
ALTER TABLE fazendas OWNER TO postgres;
REVOKE ALL ON fazendas FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fazendas TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fazendas TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fazendas TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fazendas TO service_role;
ALTER TABLE financial_audit_log OWNER TO postgres;
REVOKE ALL ON financial_audit_log FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_audit_log TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_audit_log TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_audit_log TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_audit_log TO service_role;
ALTER TABLE financial_categories OWNER TO postgres;
REVOKE ALL ON financial_categories FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_categories TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_categories TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_categories TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_categories TO service_role;
ALTER TABLE financial_governance_audit_log OWNER TO postgres;
REVOKE ALL ON financial_governance_audit_log FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_governance_audit_log TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_governance_audit_log TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_governance_audit_log TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_governance_audit_log TO service_role;
ALTER TABLE financial_settings OWNER TO postgres;
REVOKE ALL ON financial_settings FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_settings TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON financial_settings TO service_role;
GRANT SELECT, UPDATE ON financial_settings TO authenticated;
ALTER TABLE fiscal_operation_policies OWNER TO postgres;
REVOKE ALL ON fiscal_operation_policies FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fiscal_operation_policies TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fiscal_operation_policies TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fiscal_operation_policies TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fiscal_operation_policies TO service_role;
ALTER TABLE fiscal_requirement_exemptions OWNER TO postgres;
REVOKE ALL ON fiscal_requirement_exemptions FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fiscal_requirement_exemptions TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fiscal_requirement_exemptions TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fiscal_requirement_exemptions TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fiscal_requirement_exemptions TO service_role;
ALTER TABLE notificacoes_operacionais OWNER TO postgres;
REVOKE ALL ON notificacoes_operacionais FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON notificacoes_operacionais TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON notificacoes_operacionais TO anon;
GRANT INSERT, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON notificacoes_operacionais TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON notificacoes_operacionais TO service_role;
ALTER TABLE organization_feature_overrides OWNER TO postgres;
REVOKE ALL ON organization_feature_overrides FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON organization_feature_overrides TO postgres;
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON organization_feature_overrides TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON organization_feature_overrides TO service_role;
ALTER TABLE organization_subscriptions OWNER TO postgres;
REVOKE ALL ON organization_subscriptions FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON organization_subscriptions TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON organization_subscriptions TO service_role;
GRANT SELECT ON organization_subscriptions TO authenticated;
ALTER TABLE organizations OWNER TO postgres;
REVOKE ALL ON organizations FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON organizations TO postgres;
GRANT REFERENCES, TRIGGER, MAINTAIN ON organizations TO anon;
GRANT SELECT, REFERENCES, TRIGGER, MAINTAIN ON organizations TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON organizations TO service_role;
ALTER TABLE partner_accounts OWNER TO postgres;
REVOKE ALL ON partner_accounts FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_accounts TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_accounts TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_accounts TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_accounts TO service_role;
ALTER TABLE partner_audit_logs OWNER TO postgres;
REVOKE ALL ON partner_audit_logs FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_audit_logs TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_audit_logs TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_audit_logs TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_audit_logs TO service_role;
ALTER TABLE partner_clients OWNER TO postgres;
REVOKE ALL ON partner_clients FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_clients TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_clients TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_clients TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_clients TO service_role;
ALTER TABLE partner_engagement_metrics OWNER TO postgres;
REVOKE ALL ON partner_engagement_metrics FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_engagement_metrics TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_engagement_metrics TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_engagement_metrics TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_engagement_metrics TO service_role;
ALTER TABLE partner_financial_settings OWNER TO postgres;
REVOKE ALL ON partner_financial_settings FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_financial_settings TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_financial_settings TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_financial_settings TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_financial_settings TO service_role;
ALTER TABLE partner_order_audit_logs OWNER TO postgres;
REVOKE ALL ON partner_order_audit_logs FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_audit_logs TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_audit_logs TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_audit_logs TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_audit_logs TO service_role;
ALTER TABLE partner_order_financial_links OWNER TO postgres;
REVOKE ALL ON partner_order_financial_links FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_financial_links TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_financial_links TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_financial_links TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_financial_links TO service_role;
ALTER TABLE partner_order_items OWNER TO postgres;
REVOKE ALL ON partner_order_items FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_items TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_items TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_items TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_items TO service_role;
ALTER TABLE partner_order_payment_schedule OWNER TO postgres;
REVOKE ALL ON partner_order_payment_schedule FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_payment_schedule TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_payment_schedule TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_payment_schedule TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_payment_schedule TO service_role;
ALTER TABLE partner_order_payment_terms OWNER TO postgres;
REVOKE ALL ON partner_order_payment_terms FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_payment_terms TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_payment_terms TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_payment_terms TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_order_payment_terms TO service_role;
ALTER TABLE partner_orders OWNER TO postgres;
REVOKE ALL ON partner_orders FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_orders TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_orders TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_orders TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_orders TO service_role;
ALTER TABLE partner_product_prices OWNER TO postgres;
REVOKE ALL ON partner_product_prices FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_product_prices TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_product_prices TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_product_prices TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_product_prices TO service_role;
ALTER TABLE partner_risk_scores OWNER TO postgres;
REVOKE ALL ON partner_risk_scores FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_risk_scores TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_risk_scores TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_risk_scores TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_risk_scores TO service_role;
ALTER TABLE partner_technician_clients OWNER TO postgres;
REVOKE ALL ON partner_technician_clients FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_technician_clients TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_technician_clients TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_technician_clients TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_technician_clients TO service_role;
ALTER TABLE partner_user_clients OWNER TO postgres;
REVOKE ALL ON partner_user_clients FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_user_clients TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_user_clients TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_user_clients TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_user_clients TO service_role;
ALTER TABLE partner_users OWNER TO postgres;
REVOKE ALL ON partner_users FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_users TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_users TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_users TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON partner_users TO service_role;
ALTER TABLE payment_methods OWNER TO postgres;
REVOKE ALL ON payment_methods FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON payment_methods TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON payment_methods TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON payment_methods TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON payment_methods TO service_role;
ALTER TABLE platform_org_admin_invites OWNER TO postgres;
REVOKE ALL ON platform_org_admin_invites FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON platform_org_admin_invites TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON platform_org_admin_invites TO service_role;
GRANT SELECT ON platform_org_admin_invites TO authenticated;
ALTER TABLE platform_private.authz_tickets OWNER TO postgres;
REVOKE ALL ON platform_private.authz_tickets FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON platform_private.authz_tickets TO postgres;
ALTER TABLE platform_private.b2b_provisioning_receipts OWNER TO postgres;
REVOKE ALL ON platform_private.b2b_provisioning_receipts FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON platform_private.b2b_provisioning_receipts TO postgres;
ALTER TABLE platform_private.provisional_password_state OWNER TO postgres;
REVOKE ALL ON platform_private.provisional_password_state FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON platform_private.provisional_password_state TO postgres;
GRANT SELECT ON platform_private.provisional_password_state TO service_role;
ALTER TABLE production_order_link OWNER TO postgres;
REVOKE ALL ON production_order_link FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_order_link TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_order_link TO anon;
GRANT INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_order_link TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_order_link TO service_role;
ALTER TABLE production_planning OWNER TO postgres;
REVOKE ALL ON production_planning FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_planning TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_planning TO anon;
GRANT INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_planning TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_planning TO service_role;
ALTER TABLE production_timeline_events OWNER TO postgres;
REVOKE ALL ON production_timeline_events FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_timeline_events TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_timeline_events TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_timeline_events TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON production_timeline_events TO service_role;
ALTER TABLE profiles OWNER TO postgres;
REVOKE ALL ON profiles FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON profiles TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON profiles TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON profiles TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON profiles TO service_role;
ALTER TABLE receivable_payments OWNER TO postgres;
REVOKE ALL ON receivable_payments FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON receivable_payments TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON receivable_payments TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON receivable_payments TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON receivable_payments TO service_role;
ALTER TABLE saas_features OWNER TO postgres;
REVOKE ALL ON saas_features FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_features TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_features TO service_role;
GRANT SELECT ON saas_features TO authenticated;
ALTER TABLE saas_modules OWNER TO postgres;
REVOKE ALL ON saas_modules FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_modules TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_modules TO service_role;
GRANT SELECT ON saas_modules TO authenticated;
ALTER TABLE saas_plan_version_features OWNER TO postgres;
REVOKE ALL ON saas_plan_version_features FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_plan_version_features TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_plan_version_features TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_plan_version_features TO service_role;
ALTER TABLE saas_plan_versions OWNER TO postgres;
REVOKE ALL ON saas_plan_versions FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_plan_versions TO postgres;
GRANT INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_plan_versions TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON saas_plan_versions TO service_role;
ALTER TABLE user_access_preferences OWNER TO postgres;
REVOKE ALL ON user_access_preferences FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_access_preferences TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_access_preferences TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_access_preferences TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_access_preferences TO service_role;
ALTER TABLE user_clientes OWNER TO postgres;
REVOKE ALL ON user_clientes FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_clientes TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_clientes TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_clientes TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_clientes TO service_role;
ALTER TABLE user_context_access_logs OWNER TO postgres;
REVOKE ALL ON user_context_access_logs FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_context_access_logs TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_context_access_logs TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_context_access_logs TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_context_access_logs TO service_role;
ALTER TABLE user_roles OWNER TO postgres;
REVOKE ALL ON user_roles FROM PUBLIC, postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_roles TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_roles TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_roles TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON user_roles TO service_role;
ALTER FUNCTION public._notify_role(app_role,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._notify_role(app_role,text,text,text,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public._notify_role(app_role,text,text,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public._notify_role(app_role,text,text,text,text) TO service_role;
ALTER FUNCTION public._portal_cliente_user_has_link(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._portal_cliente_user_has_link(uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public._portal_cliente_user_has_link(uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public._portal_cliente_user_has_link(uuid,uuid) TO service_role;
ALTER FUNCTION public._saas_trg_require_feature() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._saas_trg_require_feature() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public._saas_trg_require_feature() TO postgres;
GRANT EXECUTE ON FUNCTION public._saas_trg_require_feature() TO service_role;
ALTER FUNCTION public._saas_user_has_feature(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._saas_user_has_feature(uuid,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public._saas_user_has_feature(uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public._saas_user_has_feature(uuid,text) TO service_role;
ALTER FUNCTION public.admin_provision_user_profile_v1(uuid,text,text,app_role[],uuid[],uuid,uuid,text,text,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_provision_user_profile_v1(uuid,text,text,app_role[],uuid[],uuid,uuid,text,text,text,text,text,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.admin_provision_user_profile_v1(uuid,text,text,app_role[],uuid[],uuid,uuid,text,text,text,text,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.admin_provision_user_profile_v1(uuid,text,text,app_role[],uuid[],uuid,uuid,text,text,text,text,text,text) TO service_role;
ALTER FUNCTION public.audit_partner_order_payment_terms() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_partner_order_payment_terms() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.audit_partner_order_payment_terms() TO postgres;
GRANT EXECUTE ON FUNCTION public.audit_partner_order_payment_terms() TO service_role;
ALTER FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text) TO postgres;
ALTER FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text,app_role,uuid[],uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text,app_role,uuid[],uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text,app_role,uuid[],uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text,app_role,uuid[],uuid) TO authenticated;
ALTER FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) TO service_role;
ALTER FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) TO service_role;
ALTER FUNCTION public.b2b_phase1_order_visible(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.b2b_phase1_order_visible(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.b2b_phase1_order_visible(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.b2b_phase1_order_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.b2b_phase1_order_visible(uuid) TO service_role;
ALTER FUNCTION public.b2b_phase1_partner_visible(uuid,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.b2b_phase1_partner_visible(uuid,boolean) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.b2b_phase1_partner_visible(uuid,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.b2b_phase1_partner_visible(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.b2b_phase1_partner_visible(uuid,boolean) TO service_role;
ALTER FUNCTION public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid) TO service_role;
ALTER FUNCTION public.b2b_provisioning_preflight(uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.b2b_provisioning_preflight(uuid,text,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.b2b_provisioning_preflight(uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.b2b_provisioning_preflight(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.b2b_provisioning_preflight(uuid,text,text) TO service_role;
ALTER FUNCTION public.can_user_access_cliente(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_user_access_cliente(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid) TO authenticated;
ALTER FUNCTION public.can_user_access_cliente(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_user_access_cliente(uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid,uuid) TO authenticated;
ALTER FUNCTION cf_user_guards_v1.acquire_gate() OWNER TO postgres;
REVOKE ALL ON FUNCTION cf_user_guards_v1.acquire_gate() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION cf_user_guards_v1.acquire_gate() TO postgres;
ALTER FUNCTION cf_user_guards_v1.acquire_invitation_gate() OWNER TO postgres;
REVOKE ALL ON FUNCTION cf_user_guards_v1.acquire_invitation_gate() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION cf_user_guards_v1.acquire_invitation_gate() TO postgres;
ALTER FUNCTION cf_user_guards_v1.advance_stamp() OWNER TO postgres;
REVOKE ALL ON FUNCTION cf_user_guards_v1.advance_stamp() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION cf_user_guards_v1.advance_stamp() TO postgres;
ALTER FUNCTION cf_user_guards_v1.block_truncate() OWNER TO postgres;
REVOKE ALL ON FUNCTION cf_user_guards_v1.block_truncate() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION cf_user_guards_v1.block_truncate() TO postgres;
ALTER FUNCTION cf_user_guards_v1.require_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION cf_user_guards_v1.require_admin() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION cf_user_guards_v1.require_admin() TO postgres;
ALTER FUNCTION cf_user_guards_v1.touch_invitation_profiles() OWNER TO postgres;
REVOKE ALL ON FUNCTION cf_user_guards_v1.touch_invitation_profiles() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION cf_user_guards_v1.touch_invitation_profiles() TO postgres;
ALTER FUNCTION cf_user_guards_v1.touch_related_profiles() OWNER TO postgres;
REVOKE ALL ON FUNCTION cf_user_guards_v1.touch_related_profiles() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION cf_user_guards_v1.touch_related_profiles() TO postgres;
ALTER FUNCTION public.d51_5_validate_financial_tenant_links() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.d51_5_validate_financial_tenant_links() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.d51_5_validate_financial_tenant_links() TO postgres;
GRANT EXECUTE ON FUNCTION public.d51_5_validate_financial_tenant_links() TO service_role;
ALTER FUNCTION public.enforce_cliente_id_for_produtor() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_cliente_id_for_produtor() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.enforce_cliente_id_for_produtor() TO postgres;
GRANT EXECUTE ON FUNCTION public.enforce_cliente_id_for_produtor() TO service_role;
ALTER FUNCTION finance_private.protect_allocated_payable() OWNER TO postgres;
REVOKE ALL ON FUNCTION finance_private.protect_allocated_payable() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION finance_private.protect_allocated_payable() TO postgres;
ALTER FUNCTION finance_private.set_payable_allocations(uuid,jsonb,text,integer,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION finance_private.set_payable_allocations(uuid,jsonb,text,integer,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION finance_private.set_payable_allocations(uuid,jsonb,text,integer,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION finance_private.set_payable_allocations(uuid,jsonb,text,integer,uuid) TO authenticated;
ALTER FUNCTION public.fiscal_audit_trigger() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fiscal_audit_trigger() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fiscal_audit_trigger() TO postgres;
GRANT EXECUTE ON FUNCTION public.fiscal_audit_trigger() TO service_role;
ALTER FUNCTION public.fiscal_json_has_sensitive_key(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fiscal_json_has_sensitive_key(jsonb) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fiscal_json_has_sensitive_key(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_json_has_sensitive_key(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.fiscal_json_has_sensitive_key(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.fiscal_json_has_sensitive_key(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_json_has_sensitive_key(jsonb) TO service_role;
ALTER FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) TO service_role;
ALTER FUNCTION public.fn_audit_category_dre() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_audit_category_dre() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_audit_category_dre() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_audit_category_dre() TO service_role;
ALTER FUNCTION public.fn_authz_uid_scope_ok(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_authz_uid_scope_ok(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_authz_uid_scope_ok(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_authz_uid_scope_ok(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_authz_uid_scope_ok(uuid) TO authenticated;
ALTER FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) TO service_role;
ALTER FUNCTION public.fn_b2b_guard_credit_approval_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_b2b_guard_credit_approval_fields() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_guard_credit_approval_fields() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_guard_credit_approval_fields() TO service_role;
ALTER FUNCTION public.fn_b2b_guard_order_items_immutable() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_b2b_guard_order_items_immutable() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_guard_order_items_immutable() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_guard_order_items_immutable() TO service_role;
ALTER FUNCTION public.fn_b2b_order_billing_eligibility(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_b2b_order_billing_eligibility(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_billing_eligibility(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_billing_eligibility(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_billing_eligibility(uuid) TO authenticated;
ALTER FUNCTION public.fn_b2b_order_priceable(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_b2b_order_priceable(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_priceable(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_priceable(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_priceable(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_priceable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_priceable(uuid) TO service_role;
ALTER FUNCTION public.fn_b2b_plan_referenced(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_b2b_plan_referenced(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_referenced(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_referenced(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_referenced(uuid) TO authenticated;
ALTER FUNCTION public.fn_b2b_plan_selectable(uuid,timestamp with time zone) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_b2b_plan_selectable(uuid,timestamp with time zone) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_selectable(uuid,timestamp with time zone) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_selectable(uuid,timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_selectable(uuid,timestamp with time zone) TO authenticated;
ALTER FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status) TO service_role;
ALTER FUNCTION public.fn_b2b_status_is_operational(partner_order_status) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_b2b_status_is_operational(partner_order_status) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_operational(partner_order_status) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_operational(partner_order_status) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_operational(partner_order_status) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_operational(partner_order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_operational(partner_order_status) TO service_role;
ALTER FUNCTION public.fn_cc_can_prepare(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_cc_can_prepare(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_cc_can_prepare(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_cc_can_prepare(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cc_can_prepare(uuid) TO authenticated;
ALTER FUNCTION public.fn_financial_audit() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_financial_audit() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_financial_audit() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_financial_audit() TO service_role;
ALTER FUNCTION public.fn_fiscal_can_read_internal(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_can_read_internal(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_can_read_internal(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_can_read_internal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_can_read_internal(uuid) TO authenticated;
ALTER FUNCTION public.fn_fiscal_cep_is_valid(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_cep_is_valid(text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cep_is_valid(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cep_is_valid(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cep_is_valid(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cep_is_valid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cep_is_valid(text) TO service_role;
ALTER FUNCTION public.fn_fiscal_certificate_ref_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_certificate_ref_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_certificate_ref_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_certificate_ref_guard() TO service_role;
ALTER FUNCTION public.fn_fiscal_cnpj_is_valid(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_cnpj_is_valid(text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cnpj_is_valid(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cnpj_is_valid(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cnpj_is_valid(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cnpj_is_valid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cnpj_is_valid(text) TO service_role;
ALTER FUNCTION public.fn_fiscal_digits(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_digits(text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_digits(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_digits(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_digits(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_digits(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_digits(text) TO service_role;
ALTER FUNCTION public.fn_fiscal_emitter_pendencies_row(company_fiscal_settings) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_emitter_pendencies_row(company_fiscal_settings) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_emitter_pendencies_row(company_fiscal_settings) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_emitter_pendencies_row(company_fiscal_settings) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_emitter_pendencies_row(company_fiscal_settings) TO authenticated;
ALTER FUNCTION public.fn_fiscal_ibge_municipio_coerente(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_ibge_municipio_coerente(text,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ibge_municipio_coerente(text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ibge_municipio_coerente(text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ibge_municipio_coerente(text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ibge_municipio_coerente(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ibge_municipio_coerente(text,text) TO service_role;
ALTER FUNCTION public.fn_fiscal_ie_check(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_ie_check(text,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ie_check(text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ie_check(text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ie_check(text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ie_check(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ie_check(text,text) TO service_role;
ALTER FUNCTION public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date) TO authenticated;
ALTER FUNCTION public.fn_fiscal_uf_ibge_code(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_fiscal_uf_ibge_code(text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_uf_ibge_code(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_uf_ibge_code(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_uf_ibge_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_uf_ibge_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_uf_ibge_code(text) TO service_role;
ALTER FUNCTION public.fn_generate_payable_installments() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_generate_payable_installments() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_generate_payable_installments() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_generate_payable_installments() TO service_role;
ALTER FUNCTION public.fn_generate_receivable_installments() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_generate_receivable_installments() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_generate_receivable_installments() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_generate_receivable_installments() TO service_role;
ALTER FUNCTION public.fn_h6_guard_ap_installment_snapshot() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_h6_guard_ap_installment_snapshot() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6_guard_ap_installment_snapshot() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6_guard_ap_installment_snapshot() TO service_role;
ALTER FUNCTION public.fn_h6_guard_ar_installment_snapshot() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_h6_guard_ar_installment_snapshot() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6_guard_ar_installment_snapshot() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6_guard_ar_installment_snapshot() TO service_role;
ALTER FUNCTION public.fn_h6_guard_title_snapshot() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_h6_guard_title_snapshot() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6_guard_title_snapshot() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6_guard_title_snapshot() TO service_role;
ALTER FUNCTION public.fn_h6_payments_append_only() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_h6_payments_append_only() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6_payments_append_only() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6_payments_append_only() TO service_role;
ALTER FUNCTION public.fn_h6c_set_canonical_payment_terms() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_h6c_set_canonical_payment_terms() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6c_set_canonical_payment_terms() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6c_set_canonical_payment_terms() TO service_role;
ALTER FUNCTION public.fn_h6d_block_hard_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_h6d_block_hard_delete() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6d_block_hard_delete() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6d_block_hard_delete() TO service_role;
ALTER FUNCTION public.fn_h6d_hard_delete_allowed() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_h6d_hard_delete_allowed() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6d_hard_delete_allowed() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_h6d_hard_delete_allowed() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_h6d_hard_delete_allowed() TO authenticated;
ALTER FUNCTION public.fn_recalc_receivable_installment() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_recalc_receivable_installment() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.fn_recalc_receivable_installment() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_recalc_receivable_installment() TO service_role;
ALTER FUNCTION public.generate_b2b_receivable_secure(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) TO authenticated;
ALTER FUNCTION public.generate_b2b_receivable_secure_impl(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;
ALTER FUNCTION public.get_b2b_user_role_for_partner(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_b2b_user_role_for_partner(uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.get_b2b_user_role_for_partner(uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_b2b_user_role_for_partner(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_b2b_user_role_for_partner(uuid,uuid) TO authenticated;
ALTER FUNCTION public.get_cliente_ids_for_user(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_cliente_ids_for_user(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.get_cliente_ids_for_user(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_cliente_ids_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cliente_ids_for_user(uuid) TO authenticated;
ALTER FUNCTION public.get_my_available_portal_contexts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_my_available_portal_contexts() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.get_my_available_portal_contexts() TO postgres;
GRANT EXECUTE ON FUNCTION public.get_my_available_portal_contexts() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_available_portal_contexts() TO authenticated;
ALTER FUNCTION public.get_user_partner_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_user_partner_id() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.get_user_partner_id() TO postgres;
GRANT EXECUTE ON FUNCTION public.get_user_partner_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_partner_id() TO authenticated;
ALTER FUNCTION public.guard_commercial_partner_registration() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_commercial_partner_registration() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.guard_commercial_partner_registration() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_commercial_partner_registration() TO service_role;
ALTER FUNCTION public.guard_financial_category_platform_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_financial_category_platform_write() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.guard_financial_category_platform_write() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_financial_category_platform_write() TO service_role;
ALTER FUNCTION public.guard_profile_senha_provisoria() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_profile_senha_provisoria() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.guard_profile_senha_provisoria() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_profile_senha_provisoria() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_profile_senha_provisoria() TO anon;
GRANT EXECUTE ON FUNCTION public.guard_profile_senha_provisoria() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_profile_senha_provisoria() TO service_role;
ALTER FUNCTION public.guard_profile_senha_ticket() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_profile_senha_ticket() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.guard_profile_senha_ticket() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_profile_senha_ticket() TO service_role;
ALTER FUNCTION public.guard_profile_sensitive_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_profile_sensitive_fields() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.guard_profile_sensitive_fields() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_profile_sensitive_fields() TO service_role;
ALTER FUNCTION public.guard_profile_tenant_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_profile_tenant_fields() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.guard_profile_tenant_fields() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_profile_tenant_fields() TO service_role;
ALTER FUNCTION public.guard_superadmin_role_assignment() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_superadmin_role_assignment() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.guard_superadmin_role_assignment() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_superadmin_role_assignment() TO service_role;
ALTER FUNCTION public.guard_tenant_organization_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_tenant_organization_id() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.guard_tenant_organization_id() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_tenant_organization_id() TO service_role;
ALTER FUNCTION public.h15_actor_organization() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.h15_actor_organization() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.h15_actor_organization() TO postgres;
GRANT EXECUTE ON FUNCTION public.h15_actor_organization() TO authenticated;
GRANT EXECUTE ON FUNCTION public.h15_actor_organization() TO service_role;
ALTER FUNCTION public.h15_company_integrity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.h15_company_integrity() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.h15_company_integrity() TO postgres;
GRANT EXECUTE ON FUNCTION public.h15_company_integrity() TO service_role;
ALTER FUNCTION public.h15_profile_organization_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.h15_profile_organization_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.h15_profile_organization_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.h15_profile_organization_guard() TO service_role;
ALTER FUNCTION public.h15_require_staff() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.h15_require_staff() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.h15_require_staff() TO postgres;
GRANT EXECUTE ON FUNCTION public.h15_require_staff() TO service_role;
ALTER FUNCTION public.h15_user_organization(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.h15_user_organization(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.h15_user_organization(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.h15_user_organization(uuid) TO service_role;
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
ALTER FUNCTION public.has_active_user_cliente_access(uuid,uuid,text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_active_user_cliente_access(uuid,uuid,text[]) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.has_active_user_cliente_access(uuid,uuid,text[]) TO postgres;
GRANT EXECUTE ON FUNCTION public.has_active_user_cliente_access(uuid,uuid,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_user_cliente_access(uuid,uuid,text[]) TO authenticated;
ALTER FUNCTION public.has_role(uuid,app_role) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_role(uuid,app_role) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,app_role) TO postgres;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,app_role) TO service_role;
ALTER FUNCTION public.is_financial_staff(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_financial_staff(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.is_financial_staff(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_financial_staff(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_financial_staff(uuid) TO authenticated;
ALTER FUNCTION public.is_platform_superadmin(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_platform_superadmin(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.is_platform_superadmin(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_platform_superadmin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_superadmin(uuid) TO service_role;
ALTER FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) TO authenticated;
ALTER FUNCTION public.jsonb_object_keys_count(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.jsonb_object_keys_count(jsonb) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.jsonb_object_keys_count(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsonb_object_keys_count(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.jsonb_object_keys_count(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.jsonb_object_keys_count(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_object_keys_count(jsonb) TO service_role;
ALTER FUNCTION public.link_partner_user(uuid,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.link_partner_user(uuid,uuid,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.link_partner_user(uuid,uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.link_partner_user(uuid,uuid,text) TO service_role;
ALTER FUNCTION public.mask_sensitive_jsonb(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mask_sensitive_jsonb(jsonb) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.mask_sensitive_jsonb(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.mask_sensitive_jsonb(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.mask_sensitive_jsonb(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.mask_sensitive_jsonb(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_sensitive_jsonb(jsonb) TO service_role;
ALTER FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) TO service_role;
ALTER FUNCTION public.ofo_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ofo_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.ofo_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.ofo_guard() TO service_role;
ALTER FUNCTION public.ofo_stamp_author() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ofo_stamp_author() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.ofo_stamp_author() TO postgres;
GRANT EXECUTE ON FUNCTION public.ofo_stamp_author() TO service_role;
ALTER FUNCTION public.ofo_stamp_end() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ofo_stamp_end() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.ofo_stamp_end() TO postgres;
GRANT EXECUTE ON FUNCTION public.ofo_stamp_end() TO service_role;
ALTER FUNCTION public.organizations_guard_status() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.organizations_guard_status() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.organizations_guard_status() TO postgres;
GRANT EXECUTE ON FUNCTION public.organizations_guard_status() TO service_role;
ALTER FUNCTION public.partner_audit_trigger() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.partner_audit_trigger() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.partner_audit_trigger() TO postgres;
GRANT EXECUTE ON FUNCTION public.partner_audit_trigger() TO service_role;
ALTER FUNCTION public.partner_order_has_production(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.partner_order_has_production(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.partner_order_has_production(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.partner_order_has_production(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_order_has_production(uuid) TO authenticated;
ALTER FUNCTION public.partner_orders_audit_trigger() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.partner_orders_audit_trigger() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.partner_orders_audit_trigger() TO postgres;
GRANT EXECUTE ON FUNCTION public.partner_orders_audit_trigger() TO service_role;
ALTER FUNCTION public.partner_ppp_compute_final() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.partner_ppp_compute_final() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.partner_ppp_compute_final() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_ppp_compute_final() TO postgres;
GRANT EXECUTE ON FUNCTION public.partner_ppp_compute_final() TO anon;
GRANT EXECUTE ON FUNCTION public.partner_ppp_compute_final() TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_ppp_compute_final() TO service_role;
ALTER FUNCTION public.partner_users_bump_version() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.partner_users_bump_version() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.partner_users_bump_version() TO postgres;
GRANT EXECUTE ON FUNCTION public.partner_users_bump_version() TO service_role;
ALTER FUNCTION public.partner_users_derive_tenant() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.partner_users_derive_tenant() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.partner_users_derive_tenant() TO postgres;
GRANT EXECUTE ON FUNCTION public.partner_users_derive_tenant() TO service_role;
ALTER FUNCTION platform_private.assert_b2b_partner_scope(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.assert_b2b_partner_scope(uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.assert_b2b_partner_scope(uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.assert_b2b_partner_scope(uuid,uuid) TO service_role;
ALTER FUNCTION platform_private.b2b_actor_scope(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_actor_scope(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_actor_scope(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_actor_scope(uuid) TO service_role;
ALTER FUNCTION platform_private.b2b_assignment_identity_coherent(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_assignment_identity_coherent(uuid,uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_assignment_identity_coherent(uuid,uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_assignment_identity_coherent(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_assignment_identity_coherent(uuid,uuid,uuid) TO service_role;
ALTER FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,app_role,uuid[],uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,app_role,uuid[],uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,app_role,uuid[],uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,app_role,uuid[],uuid) TO authenticated;
ALTER FUNCTION platform_private.b2b_coherent_self_partner(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_coherent_self_partner(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_coherent_self_partner(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_coherent_self_partner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_coherent_self_partner(uuid) TO service_role;
ALTER FUNCTION platform_private.b2b_commercial_context() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_commercial_context() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_context() TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_context() TO service_role;
GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_context() TO authenticated;
ALTER FUNCTION platform_private.b2b_commercial_partner_projection() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_commercial_partner_projection() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_partner_projection() TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_partner_projection() TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_partner_projection() TO service_role;
ALTER FUNCTION platform_private.b2b_direct_partner_row_allowed() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_direct_partner_row_allowed() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_direct_partner_row_allowed() TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_direct_partner_row_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_direct_partner_row_allowed() TO service_role;
ALTER FUNCTION platform_private.b2b_internal_assert_origin(jsonb,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_internal_assert_origin(jsonb,uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_assert_origin(jsonb,uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_assert_origin(jsonb,uuid,uuid) TO service_role;
ALTER FUNCTION platform_private.b2b_internal_child_snapshot_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_internal_child_snapshot_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_child_snapshot_guard() TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_child_snapshot_guard() TO service_role;
ALTER FUNCTION platform_private.b2b_internal_order_snapshot_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_internal_order_snapshot_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_order_snapshot_guard() TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_order_snapshot_guard() TO service_role;
ALTER FUNCTION platform_private.b2b_internal_origin_valid(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_internal_origin_valid(jsonb) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_origin_valid(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_origin_valid(jsonb) TO service_role;
ALTER FUNCTION platform_private.b2b_organization_full_row_allowed() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_organization_full_row_allowed() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_organization_full_row_allowed() TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_organization_full_row_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_organization_full_row_allowed() TO service_role;
ALTER FUNCTION platform_private.b2b_phase1_order_visible(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_phase1_order_visible(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_phase1_order_visible(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_phase1_order_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_phase1_order_visible(uuid) TO service_role;
ALTER FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) TO service_role;
ALTER FUNCTION platform_private.b2b_provisioning_preflight(uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.b2b_provisioning_preflight(uuid,text,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_provisioning_preflight(uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.b2b_provisioning_preflight(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_provisioning_preflight(uuid,text,text) TO service_role;
ALTER FUNCTION platform_private.current_user_organization_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.current_user_organization_id() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.current_user_organization_id() TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.current_user_organization_id() TO service_role;
ALTER FUNCTION platform_private.entitlements_for_user(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.entitlements_for_user(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.entitlements_for_user(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.entitlements_for_user(uuid) TO service_role;
ALTER FUNCTION platform_private.external_provisioning_scope(uuid,app_role,uuid,uuid[],uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.external_provisioning_scope(uuid,app_role,uuid,uuid[],uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.external_provisioning_scope(uuid,app_role,uuid,uuid[],uuid) TO postgres;
ALTER FUNCTION platform_private.h15_actor_organization() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.h15_actor_organization() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.h15_actor_organization() TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.h15_actor_organization() TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.h15_actor_organization() TO service_role;
ALTER FUNCTION platform_private.has_role(uuid,app_role) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.has_role(uuid,app_role) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.has_role(uuid,app_role) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.has_role(uuid,app_role) TO service_role;
GRANT EXECUTE ON FUNCTION platform_private.has_role(uuid,app_role) TO authenticated;
ALTER FUNCTION platform_private.has_ticket(text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.has_ticket(text,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.has_ticket(text,uuid) TO postgres;
ALTER FUNCTION platform_private.is_same_tenant_user(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.is_same_tenant_user(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.is_same_tenant_user(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.is_same_tenant_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.is_same_tenant_user(uuid) TO service_role;
ALTER FUNCTION platform_private.is_tenant_admin_for_user(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.is_tenant_admin_for_user(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.is_tenant_admin_for_user(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.is_tenant_admin_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.is_tenant_admin_for_user(uuid) TO service_role;
ALTER FUNCTION platform_private.notification_p1_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.notification_p1_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_p1_guard() TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_p1_guard() TO service_role;
ALTER FUNCTION platform_private.notification_p1_visible(uuid,text,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.notification_p1_visible(uuid,text,uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_p1_visible(uuid,text,uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_p1_visible(uuid,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.notification_p1_visible(uuid,text,uuid,uuid) TO service_role;
ALTER FUNCTION platform_private.notification_source_client(text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.notification_source_client(text,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_source_client(text,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_source_client(text,uuid) TO service_role;
ALTER FUNCTION platform_private.notification_source_org(text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.notification_source_org(text,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_source_org(text,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_source_org(text,uuid) TO service_role;
ALTER FUNCTION platform_private.notification_user_ok(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.notification_user_ok(uuid,uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_user_ok(uuid,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.notification_user_ok(uuid,uuid) TO service_role;
ALTER FUNCTION platform_private.platform_actor_access_ready(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.platform_actor_access_ready(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.platform_actor_access_ready(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION platform_private.platform_actor_access_ready(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.platform_actor_access_ready(uuid) TO service_role;
ALTER FUNCTION platform_private.require_service_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_private.require_service_role() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION platform_private.require_service_role() TO postgres;
ALTER FUNCTION public.recalc_partner_order_production(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.recalc_partner_order_production(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.recalc_partner_order_production(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.recalc_partner_order_production(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalc_partner_order_production(uuid) TO authenticated;
ALTER FUNCTION public.recalc_partner_prices_on_default_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.recalc_partner_prices_on_default_change() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.recalc_partner_prices_on_default_change() TO postgres;
GRANT EXECUTE ON FUNCTION public.recalc_partner_prices_on_default_change() TO service_role;
ALTER FUNCTION public.recalc_partner_risk_score(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.recalc_partner_risk_score(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.recalc_partner_risk_score(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.recalc_partner_risk_score(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalc_partner_risk_score(uuid) TO authenticated;
ALTER FUNCTION public.refresh_partner_engagement(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.refresh_partner_engagement(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.refresh_partner_engagement(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.refresh_partner_engagement(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_partner_engagement(uuid) TO authenticated;
ALTER FUNCTION public.register_my_login_redirect_secure(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.register_my_login_redirect_secure(text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.register_my_login_redirect_secure(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.register_my_login_redirect_secure(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_my_login_redirect_secure(text) TO authenticated;
ALTER FUNCTION public.rpc_portal_partner_financial() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_portal_partner_financial() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_portal_partner_financial() TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_portal_partner_financial() TO service_role;
ALTER FUNCTION public.rpc_portal_partner_financial(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_portal_partner_financial(uuid) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_portal_partner_financial(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_portal_partner_financial(uuid) TO service_role;
ALTER FUNCTION public.saas_feature_override_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_feature_override_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_feature_override_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_feature_override_guard() TO service_role;
ALTER FUNCTION public.saas_no_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_no_delete() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_no_delete() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_no_delete() TO service_role;
ALTER FUNCTION public.saas_plan_version_feature_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_plan_version_feature_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_plan_version_feature_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_plan_version_feature_guard() TO service_role;
ALTER FUNCTION public.saas_plan_version_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_plan_version_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_plan_version_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_plan_version_guard() TO service_role;
ALTER FUNCTION public.saas_plan_version_no_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_plan_version_no_mutation() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_plan_version_no_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_plan_version_no_mutation() TO service_role;
ALTER FUNCTION public.saas_subscription_audit() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_subscription_audit() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_subscription_audit() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_subscription_audit() TO service_role;
ALTER FUNCTION public.saas_subscription_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_subscription_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_subscription_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_subscription_guard() TO service_role;
ALTER FUNCTION public.saas_subscription_no_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_subscription_no_delete() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_subscription_no_delete() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_subscription_no_delete() TO service_role;
ALTER FUNCTION public.saas_subscription_require_published_version() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_subscription_require_published_version() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_subscription_require_published_version() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_subscription_require_published_version() TO service_role;
ALTER FUNCTION public.saas_trial_validate() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_trial_validate() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.saas_trial_validate() TO postgres;
GRANT EXECUTE ON FUNCTION public.saas_trial_validate() TO service_role;
ALTER FUNCTION public.set_codigo_cliente() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_codigo_cliente() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.set_codigo_cliente() TO postgres;
GRANT EXECUTE ON FUNCTION public.set_codigo_cliente() TO service_role;
ALTER FUNCTION public.set_my_context_preference(text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_my_context_preference(text,boolean) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.set_my_context_preference(text,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_my_context_preference(text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_my_context_preference(text,boolean) TO authenticated;
ALTER FUNCTION public.set_partner_user_papel(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_partner_user_papel(uuid,text) FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.set_partner_user_papel(uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_partner_user_papel(uuid,text) TO service_role;
ALTER FUNCTION public.sync_puc_to_ptc_fn() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_puc_to_ptc_fn() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.sync_puc_to_ptc_fn() TO postgres;
GRANT EXECUTE ON FUNCTION public.sync_puc_to_ptc_fn() TO service_role;
ALTER FUNCTION public.sync_user_cliente_principal() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_user_cliente_principal() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.sync_user_cliente_principal() TO postgres;
GRANT EXECUTE ON FUNCTION public.sync_user_cliente_principal() TO service_role;
ALTER FUNCTION public.tg_audit_partner_order_commercial() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_audit_partner_order_commercial() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_audit_partner_order_commercial() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_audit_partner_order_commercial() TO service_role;
ALTER FUNCTION public.tg_auto_b2b_receivable() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_auto_b2b_receivable() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_auto_b2b_receivable() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_auto_b2b_receivable() TO service_role;
ALTER FUNCTION public.tg_b2b_block_receivable_before_approval() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_b2b_block_receivable_before_approval() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_b2b_block_receivable_before_approval() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_b2b_block_receivable_before_approval() TO service_role;
ALTER FUNCTION public.tg_b2b_enforce_plan_selectable() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_b2b_enforce_plan_selectable() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_b2b_enforce_plan_selectable() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_b2b_enforce_plan_selectable() TO service_role;
ALTER FUNCTION public.tg_block_partner_order_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_block_partner_order_delete() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_partner_order_delete() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_partner_order_delete() TO service_role;
ALTER FUNCTION public.tg_block_partner_order_edit_after_op() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_block_partner_order_edit_after_op() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_partner_order_edit_after_op() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_partner_order_edit_after_op() TO service_role;
ALTER FUNCTION public.tg_block_partner_order_items_after_op() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_block_partner_order_items_after_op() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_partner_order_items_after_op() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_partner_order_items_after_op() TO service_role;
ALTER FUNCTION public.tg_block_planning_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_block_planning_delete() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_planning_delete() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_planning_delete() TO service_role;
ALTER FUNCTION public.tg_block_pofl_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_block_pofl_delete() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_pofl_delete() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_pofl_delete() TO service_role;
ALTER FUNCTION public.tg_block_production_link_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_block_production_link_delete() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_production_link_delete() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_block_production_link_delete() TO service_role;
ALTER FUNCTION public.tg_commercial_audit() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_commercial_audit() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_commercial_audit() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_commercial_audit() TO service_role;
ALTER FUNCTION public.tg_commercial_conditions_touch() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_commercial_conditions_touch() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_commercial_conditions_touch() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_commercial_conditions_touch() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_commercial_conditions_touch() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_commercial_conditions_touch() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_commercial_conditions_touch() TO service_role;
ALTER FUNCTION public.tg_cpp_guard_financial_immutability() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_cpp_guard_financial_immutability() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_cpp_guard_financial_immutability() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_cpp_guard_financial_immutability() TO service_role;
ALTER FUNCTION public.tg_create_default_pfs() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_create_default_pfs() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_create_default_pfs() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_create_default_pfs() TO service_role;
ALTER FUNCTION public.tg_fiscal_cfs_audit() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_fiscal_cfs_audit() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_cfs_audit() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_cfs_audit() TO service_role;
ALTER FUNCTION public.tg_fiscal_emitter_refresh_readiness() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_fiscal_emitter_refresh_readiness() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_emitter_refresh_readiness() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_emitter_refresh_readiness() TO service_role;
ALTER FUNCTION public.tg_fiscal_homologation_evidence_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_fiscal_homologation_evidence_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_homologation_evidence_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_homologation_evidence_guard() TO service_role;
ALTER FUNCTION public.tg_fiscal_operation_policy_immutable() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_fiscal_operation_policy_immutable() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_operation_policy_immutable() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_operation_policy_immutable() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_operation_policy_immutable() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_operation_policy_immutable() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_fiscal_operation_policy_immutable() TO service_role;
ALTER FUNCTION public.tg_governance_audit() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_governance_audit() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_governance_audit() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_governance_audit() TO service_role;
ALTER FUNCTION public.tg_notify_payment_terms_pending() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_notify_payment_terms_pending() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_notify_payment_terms_pending() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_notify_payment_terms_pending() TO service_role;
ALTER FUNCTION public.tg_partner_order_items_resolve_pending() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_partner_order_items_resolve_pending() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_partner_order_items_resolve_pending() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_partner_order_items_resolve_pending() TO service_role;
ALTER FUNCTION public.tg_partner_orders_credit_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_partner_orders_credit_guard() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_partner_orders_credit_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_partner_orders_credit_guard() TO service_role;
ALTER FUNCTION public.tg_partner_orders_require_items() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_partner_orders_require_items() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_partner_orders_require_items() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_partner_orders_require_items() TO service_role;
ALTER FUNCTION public.tg_pfs_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_pfs_updated_at() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_pfs_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_pfs_updated_at() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_pfs_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_pfs_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_pfs_updated_at() TO service_role;
ALTER FUNCTION public.tg_pofl_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_pofl_updated_at() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_pofl_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_pofl_updated_at() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_pofl_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_pofl_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_pofl_updated_at() TO service_role;
ALTER FUNCTION public.tg_ptc_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_ptc_updated_at() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_ptc_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_ptc_updated_at() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_ptc_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_ptc_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_ptc_updated_at() TO service_role;
ALTER FUNCTION public.tg_recalc_planning_from_link() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_recalc_planning_from_link() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_recalc_planning_from_link() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_recalc_planning_from_link() TO service_role;
ALTER FUNCTION public.tg_recalc_risk_on_ar_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_recalc_risk_on_ar_change() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_recalc_risk_on_ar_change() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_recalc_risk_on_ar_change() TO service_role;
ALTER FUNCTION public.tg_refresh_engagement() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_refresh_engagement() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_refresh_engagement() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_refresh_engagement() TO service_role;
ALTER FUNCTION public.tg_set_current_price_table() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_set_current_price_table() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_set_current_price_table() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_set_current_price_table() TO service_role;
ALTER FUNCTION public.tg_set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO service_role;
ALTER FUNCTION public.tg_sync_b2b_financial_status() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_sync_b2b_financial_status() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_sync_b2b_financial_status() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_sync_b2b_financial_status() TO service_role;
ALTER FUNCTION public.tg_unique_current_price_table() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_unique_current_price_table() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_unique_current_price_table() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_unique_current_price_table() TO service_role;
ALTER FUNCTION public.tg_user_access_preferences_touch() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tg_user_access_preferences_touch() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.tg_user_access_preferences_touch() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_user_access_preferences_touch() TO postgres;
GRANT EXECUTE ON FUNCTION public.tg_user_access_preferences_touch() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_user_access_preferences_touch() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_user_access_preferences_touch() TO service_role;
ALTER FUNCTION public.trg_clientes_audit() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_clientes_audit() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.trg_clientes_audit() TO postgres;
GRANT EXECUTE ON FUNCTION public.trg_clientes_audit() TO service_role;
ALTER FUNCTION public.trg_partner_order_timeline() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_partner_order_timeline() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.trg_partner_order_timeline() TO postgres;
GRANT EXECUTE ON FUNCTION public.trg_partner_order_timeline() TO service_role;
ALTER FUNCTION public.trg_partner_order_to_planning_fn() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_partner_order_to_planning_fn() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.trg_partner_order_to_planning_fn() TO postgres;
GRANT EXECUTE ON FUNCTION public.trg_partner_order_to_planning_fn() TO service_role;
ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO postgres;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
ALTER FUNCTION public.validate_partner_user_client_fn() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_partner_user_client_fn() FROM PUBLIC, postgres;
GRANT EXECUTE ON FUNCTION public.validate_partner_user_client_fn() TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_partner_user_client_fn() TO service_role;
GRANT USAGE ON SEQUENCE public.partner_orders_numero_seq TO authenticated, service_role;
INSERT INTO cf_user_guards_v1.state DEFAULT VALUES;
