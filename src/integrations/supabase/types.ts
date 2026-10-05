export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _f42_harness_fixtures: {
        Row: {
          created_at: string
          entity: string
          entity_id: string | null
          entity_text: string | null
          id: number
          tag: string
        }
        Insert: {
          created_at?: string
          entity: string
          entity_id?: string | null
          entity_text?: string | null
          id?: number
          tag: string
        }
        Update: {
          created_at?: string
          entity?: string
          entity_id?: string | null
          entity_text?: string | null
          id?: number
          tag?: string
        }
        Relationships: []
      }
      _motor_b2b_pre_phase1_snapshot: {
        Row: {
          acl: string | null
          captured_at: string
          checksum_md5: string
          created_at: string
          definition: string
          id: string
          identity_args: string
          obj_comment: string | null
          owner_name: string
          proconfig: string | null
          project_ref: string
          proname: string
          result_type: string
          security_definer: boolean
        }
        Insert: {
          acl?: string | null
          captured_at?: string
          checksum_md5: string
          created_at?: string
          definition: string
          id?: string
          identity_args: string
          obj_comment?: string | null
          owner_name: string
          proconfig?: string | null
          project_ref: string
          proname: string
          result_type: string
          security_definer: boolean
        }
        Update: {
          acl?: string | null
          captured_at?: string
          checksum_md5?: string
          created_at?: string
          definition?: string
          id?: string
          identity_args?: string
          obj_comment?: string | null
          owner_name?: string
          proconfig?: string | null
          project_ref?: string
          proname?: string
          result_type?: string
          security_definer?: boolean
        }
        Relationships: []
      }
      accounts_payable: {
        Row: {
          auto_generated: boolean
          category_id: string
          cost_center_id: string | null
          created_at: string
          created_by: string
          description: string
          first_due_date: string
          fiscal_document_number: string | null
          id: string
          installment_count: number
          issue_date: string
          notes: string | null
          organization_id: string | null
          origin_id: string | null
          origin_type: string
          recurring_template_id: string | null
          reference_month: string | null
          status: string
          supplier_id: string | null
          supplier_invoice_date: string | null
          supplier_name: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean
          category_id: string
          cost_center_id?: string | null
          created_at?: string
          created_by: string
          description: string
          first_due_date: string
          fiscal_document_number?: string | null
          id?: string
          installment_count?: number
          issue_date?: string
          notes?: string | null
          organization_id?: string | null
          origin_id?: string | null
          origin_type?: string
          recurring_template_id?: string | null
          reference_month?: string | null
          status?: string
          supplier_id?: string | null
          supplier_invoice_date?: string | null
          supplier_name?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean
          category_id?: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          first_due_date?: string
          fiscal_document_number?: string | null
          id?: string
          installment_count?: number
          issue_date?: string
          notes?: string | null
          organization_id?: string | null
          origin_id?: string | null
          origin_type?: string
          recurring_template_id?: string | null
          reference_month?: string | null
          status?: string
          supplier_id?: string | null
          supplier_invoice_date?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "financial_cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_recurring_template_id_fkey"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "recurring_financial_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_payable_installments: {
        Row: {
          created_at: string
          discount_amount: number
          due_date: string
          id: string
          installment_number: number
          interest_amount: number
          net_amount: number
          organization_id: string | null
          original_amount: number
          paid_amount: number
          paid_at: string | null
          payable_id: string
          penalty_amount: number
          status: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          due_date: string
          id?: string
          installment_number: number
          interest_amount?: number
          net_amount: number
          organization_id?: string | null
          original_amount: number
          paid_amount?: number
          paid_at?: string | null
          payable_id: string
          penalty_amount?: number
          status?: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          due_date?: string
          id?: string
          installment_number?: number
          interest_amount?: number
          net_amount?: number
          organization_id?: string | null
          original_amount?: number
          paid_amount?: number
          paid_at?: string | null
          payable_id?: string
          penalty_amount?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_installments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_installments_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          auto_generated: boolean
          boleto_url: string | null
          category_id: string
          cost_center_id: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          description: string
          external_payment_id: string | null
          first_due_date: string
          fiscal_access_key: string | null
          fiscal_exemption_id: string | null
          fiscal_invoice_number: string | null
          fiscal_invoice_required: boolean
          fiscal_invoice_status: string
          fiscal_issue_date: string | null
          fiscal_policy_id: string | null
          fiscal_requirement_source: string | null
          id: string
          installment_count: number
          issue_date: string
          notes: string | null
          organization_id: string | null
          origin_id: string | null
          origin_type: string
          partner_id: string | null
          payment_gateway: string | null
          payment_method_id: string | null
          pix_copia_cola: string | null
          pix_qr_code: string | null
          recurring_template_id: string | null
          reference_month: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean
          boleto_url?: string | null
          category_id: string
          cost_center_id?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          description: string
          external_payment_id?: string | null
          first_due_date: string
          fiscal_access_key?: string | null
          fiscal_exemption_id?: string | null
          fiscal_invoice_number?: string | null
          fiscal_invoice_required?: boolean
          fiscal_invoice_status?: string
          fiscal_issue_date?: string | null
          fiscal_policy_id?: string | null
          fiscal_requirement_source?: string | null
          id?: string
          installment_count?: number
          issue_date?: string
          notes?: string | null
          organization_id?: string | null
          origin_id?: string | null
          origin_type: string
          partner_id?: string | null
          payment_gateway?: string | null
          payment_method_id?: string | null
          pix_copia_cola?: string | null
          pix_qr_code?: string | null
          recurring_template_id?: string | null
          reference_month?: string | null
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean
          boleto_url?: string | null
          category_id?: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          description?: string
          external_payment_id?: string | null
          first_due_date?: string
          fiscal_access_key?: string | null
          fiscal_exemption_id?: string | null
          fiscal_invoice_number?: string | null
          fiscal_invoice_required?: boolean
          fiscal_invoice_status?: string
          fiscal_issue_date?: string | null
          fiscal_policy_id?: string | null
          fiscal_requirement_source?: string | null
          id?: string
          installment_count?: number
          issue_date?: string
          notes?: string | null
          organization_id?: string | null
          origin_id?: string | null
          origin_type?: string
          partner_id?: string | null
          payment_gateway?: string | null
          payment_method_id?: string | null
          pix_copia_cola?: string | null
          pix_qr_code?: string | null
          recurring_template_id?: string | null
          reference_month?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "financial_cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_fiscal_exemption_id_fkey"
            columns: ["fiscal_exemption_id"]
            isOneToOne: false
            referencedRelation: "fiscal_requirement_exemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "accounts_receivable_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "accounts_receivable_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "accounts_receivable_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "accounts_receivable_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "accounts_receivable_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "accounts_receivable_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_recurring_template_id_fkey"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "recurring_financial_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable_installments: {
        Row: {
          created_at: string
          discount_amount: number
          due_date: string
          id: string
          installment_number: number
          interest_amount: number
          net_amount: number
          organization_id: string | null
          original_amount: number
          paid_at: string | null
          penalty_amount: number
          receivable_id: string
          received_amount: number
          status: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          due_date: string
          id?: string
          installment_number: number
          interest_amount?: number
          net_amount: number
          organization_id?: string | null
          original_amount: number
          paid_at?: string | null
          penalty_amount?: number
          receivable_id: string
          received_amount?: number
          status?: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          due_date?: string
          id?: string
          installment_number?: number
          interest_amount?: number
          net_amount?: number
          organization_id?: string | null
          original_amount?: number
          paid_at?: string | null
          penalty_amount?: number
          receivable_id?: string
          received_amount?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_installments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_installments_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_sync_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          external_event_id: string | null
          id: string
          last_synced_at: string | null
          provider: string
          solicitacao_id: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          external_event_id?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          solicitacao_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          external_event_id?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          solicitacao_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_sync_log_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "portal_solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_refresh_jobs: {
        Row: {
          concluido_em: string | null
          erro: string | null
          escopo: Json
          id: string
          iniciado_em: string
          iniciado_por: string | null
          itens_com_sugestao: number
          itens_falhos: number
          itens_processados: number
          modelo_ia: string | null
          status: string
          total_itens: number
        }
        Insert: {
          concluido_em?: string | null
          erro?: string | null
          escopo?: Json
          id?: string
          iniciado_em?: string
          iniciado_por?: string | null
          itens_com_sugestao?: number
          itens_falhos?: number
          itens_processados?: number
          modelo_ia?: string | null
          status?: string
          total_itens?: number
        }
        Update: {
          concluido_em?: string | null
          erro?: string | null
          escopo?: Json
          id?: string
          iniciado_em?: string
          iniciado_por?: string | null
          itens_com_sugestao?: number
          itens_falhos?: number
          itens_processados?: number
          modelo_ia?: string | null
          status?: string
          total_itens?: number
        }
        Relationships: []
      }
      alertas_acoes: {
        Row: {
          acao: string
          alerta_id: string
          created_at: string
          id: string
          metadata: Json
          observacao: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          alerta_id: string
          created_at?: string
          id?: string
          metadata?: Json
          observacao?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          alerta_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          observacao?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_acoes_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "alertas_operacionais"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_agronomicos: {
        Row: {
          created_at: string
          data_alerta: string
          data_vencimento: string | null
          descricao: string | null
          fazenda_id: string
          id: string
          nivel_risco: Database["public"]["Enums"]["nivel_risco"]
          registro_origem_id: string | null
          status: Database["public"]["Enums"]["status_alerta"]
          talhao_id: string | null
          tipo_alerta: Database["public"]["Enums"]["tipo_alerta"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_alerta?: string
          data_vencimento?: string | null
          descricao?: string | null
          fazenda_id: string
          id?: string
          nivel_risco?: Database["public"]["Enums"]["nivel_risco"]
          registro_origem_id?: string | null
          status?: Database["public"]["Enums"]["status_alerta"]
          talhao_id?: string | null
          tipo_alerta: Database["public"]["Enums"]["tipo_alerta"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_alerta?: string
          data_vencimento?: string | null
          descricao?: string | null
          fazenda_id?: string
          id?: string
          nivel_risco?: Database["public"]["Enums"]["nivel_risco"]
          registro_origem_id?: string | null
          status?: Database["public"]["Enums"]["status_alerta"]
          talhao_id?: string | null
          tipo_alerta?: Database["public"]["Enums"]["tipo_alerta"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_agronomicos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_agronomicos_registro_origem_id_fkey"
            columns: ["registro_origem_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_agronomicos_talhao_id_fkey"
            columns: ["talhao_id"]
            isOneToOne: false
            referencedRelation: "talhoes"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_execucoes: {
        Row: {
          created_at: string
          duracao_ms: number | null
          erro: string | null
          executado_por: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          metadata: Json
          origem: string
          status: string
          tipo_execucao: string
          total_atualizados: number
          total_criados: number
          total_ignorados_por_regra: number
          total_processados: number
          total_resolvidos_automaticamente: number
        }
        Insert: {
          created_at?: string
          duracao_ms?: number | null
          erro?: string | null
          executado_por?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          metadata?: Json
          origem?: string
          status?: string
          tipo_execucao?: string
          total_atualizados?: number
          total_criados?: number
          total_ignorados_por_regra?: number
          total_processados?: number
          total_resolvidos_automaticamente?: number
        }
        Update: {
          created_at?: string
          duracao_ms?: number | null
          erro?: string | null
          executado_por?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          metadata?: Json
          origem?: string
          status?: string
          tipo_execucao?: string
          total_atualizados?: number
          total_criados?: number
          total_ignorados_por_regra?: number
          total_processados?: number
          total_resolvidos_automaticamente?: number
        }
        Relationships: []
      }
      alertas_leituras: {
        Row: {
          alerta_id: string
          id: string
          lido_em: string
          user_id: string
        }
        Insert: {
          alerta_id: string
          id?: string
          lido_em?: string
          user_id: string
        }
        Update: {
          alerta_id?: string
          id?: string
          lido_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_leituras_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "alertas_operacionais"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_notificacao_config: {
        Row: {
          ativo: boolean
          canal: string
          cooldown_minutos: number
          created_at: string
          dia_semana_resumo: number | null
          dias_semana: number[] | null
          enviar_resumo: boolean
          gravidades: string[]
          horario_fim: string | null
          horario_inicio: string | null
          horario_resumo: string | null
          id: string
          incluir_alertas_media: boolean
          incluir_informativos: boolean
          max_envios_por_alerta: number
          metadata: Json
          origens: string[] | null
          resumo_diario_ativo: boolean
          resumo_semanal_ativo: boolean
          tipos: string[] | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          canal?: string
          cooldown_minutos?: number
          created_at?: string
          dia_semana_resumo?: number | null
          dias_semana?: number[] | null
          enviar_resumo?: boolean
          gravidades?: string[]
          horario_fim?: string | null
          horario_inicio?: string | null
          horario_resumo?: string | null
          id?: string
          incluir_alertas_media?: boolean
          incluir_informativos?: boolean
          max_envios_por_alerta?: number
          metadata?: Json
          origens?: string[] | null
          resumo_diario_ativo?: boolean
          resumo_semanal_ativo?: boolean
          tipos?: string[] | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          canal?: string
          cooldown_minutos?: number
          created_at?: string
          dia_semana_resumo?: number | null
          dias_semana?: number[] | null
          enviar_resumo?: boolean
          gravidades?: string[]
          horario_fim?: string | null
          horario_inicio?: string | null
          horario_resumo?: string | null
          id?: string
          incluir_alertas_media?: boolean
          incluir_informativos?: boolean
          max_envios_por_alerta?: number
          metadata?: Json
          origens?: string[] | null
          resumo_diario_ativo?: boolean
          resumo_semanal_ativo?: boolean
          tipos?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      alertas_notificacao_destinatarios: {
        Row: {
          ativo: boolean
          canal: string
          created_at: string
          email: string | null
          gravidades: string[] | null
          id: string
          metadata: Json
          nome: string
          origens: string[] | null
          receber_resumo: boolean
          roles_permitidas: string[] | null
          telefone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          canal?: string
          created_at?: string
          email?: string | null
          gravidades?: string[] | null
          id?: string
          metadata?: Json
          nome: string
          origens?: string[] | null
          receber_resumo?: boolean
          roles_permitidas?: string[] | null
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          canal?: string
          created_at?: string
          email?: string | null
          gravidades?: string[] | null
          id?: string
          metadata?: Json
          nome?: string
          origens?: string[] | null
          receber_resumo?: boolean
          roles_permitidas?: string[] | null
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      alertas_notificacoes: {
        Row: {
          alerta_id: string
          assunto: string | null
          canal: string
          created_at: string
          destinatario_id: string | null
          destino: string
          enviado_em: string | null
          erro: string | null
          id: string
          mensagem: string
          metadata: Json
          provider: string | null
          provider_message_id: string | null
          status: string
          tentativa: number
        }
        Insert: {
          alerta_id: string
          assunto?: string | null
          canal: string
          created_at?: string
          destinatario_id?: string | null
          destino: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          mensagem: string
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          status?: string
          tentativa?: number
        }
        Update: {
          alerta_id?: string
          assunto?: string | null
          canal?: string
          created_at?: string
          destinatario_id?: string | null
          destino?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          mensagem?: string
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          status?: string
          tentativa?: number
        }
        Relationships: [
          {
            foreignKeyName: "alertas_notificacoes_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "alertas_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_notificacoes_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "alertas_notificacao_destinatarios"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_operacionais: {
        Row: {
          chave_dedupe: string | null
          cliente_id: string | null
          consultor_id: string | null
          created_at: string
          criado_por: string | null
          descricao: string
          entrega_id: string | null
          escalonado: boolean
          escalonado_em: string | null
          escalonado_para: string | null
          fazenda_id: string | null
          gravidade: string
          id: string
          ignorado_em: string | null
          ignorado_por: string | null
          lote_id: string | null
          metadata: Json
          origem: string
          os_id: string | null
          os_origem: string | null
          primeira_resposta_em: string | null
          prioridade_score: number
          proxima_acao: string | null
          referencia_id: string | null
          referencia_tabela: string | null
          registro_consultor_id: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          responsavel_id: string | null
          sla_config_id: string | null
          sla_primeira_resposta_em: string | null
          sla_resolucao_em: string | null
          sla_vencido: boolean
          sla_vencido_em: string | null
          solicitacao_id: string | null
          status: string
          talhao_id: string | null
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          chave_dedupe?: string | null
          cliente_id?: string | null
          consultor_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao: string
          entrega_id?: string | null
          escalonado?: boolean
          escalonado_em?: string | null
          escalonado_para?: string | null
          fazenda_id?: string | null
          gravidade?: string
          id?: string
          ignorado_em?: string | null
          ignorado_por?: string | null
          lote_id?: string | null
          metadata?: Json
          origem: string
          os_id?: string | null
          os_origem?: string | null
          primeira_resposta_em?: string | null
          prioridade_score?: number
          proxima_acao?: string | null
          referencia_id?: string | null
          referencia_tabela?: string | null
          registro_consultor_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          responsavel_id?: string | null
          sla_config_id?: string | null
          sla_primeira_resposta_em?: string | null
          sla_resolucao_em?: string | null
          sla_vencido?: boolean
          sla_vencido_em?: string | null
          solicitacao_id?: string | null
          status?: string
          talhao_id?: string | null
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          chave_dedupe?: string | null
          cliente_id?: string | null
          consultor_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string
          entrega_id?: string | null
          escalonado?: boolean
          escalonado_em?: string | null
          escalonado_para?: string | null
          fazenda_id?: string | null
          gravidade?: string
          id?: string
          ignorado_em?: string | null
          ignorado_por?: string | null
          lote_id?: string | null
          metadata?: Json
          origem?: string
          os_id?: string | null
          os_origem?: string | null
          primeira_resposta_em?: string | null
          prioridade_score?: number
          proxima_acao?: string | null
          referencia_id?: string | null
          referencia_tabela?: string | null
          registro_consultor_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          responsavel_id?: string | null
          sla_config_id?: string | null
          sla_primeira_resposta_em?: string | null
          sla_resolucao_em?: string | null
          sla_vencido?: boolean
          sla_vencido_em?: string | null
          solicitacao_id?: string | null
          status?: string
          talhao_id?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_operacionais_sla_config_id_fkey"
            columns: ["sla_config_id"]
            isOneToOne: false
            referencedRelation: "alertas_sla_config"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_regras: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          gravidade_padrao: string
          id: string
          nome: string
          origem: string
          parametros: Json
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          gravidade_padrao?: string
          id?: string
          nome: string
          origem: string
          parametros?: Json
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          gravidade_padrao?: string
          id?: string
          nome?: string
          origem?: string
          parametros?: Json
          updated_at?: string
        }
        Relationships: []
      }
      alertas_resumos: {
        Row: {
          assunto: string | null
          canal: string
          conteudo: string
          created_at: string
          destinatario_id: string | null
          destino: string
          enviado_em: string | null
          erro: string | null
          id: string
          metadata: Json
          periodo_fim: string
          periodo_inicio: string
          provider: string | null
          provider_message_id: string | null
          status: string
          tipo_resumo: string
          total_abertos: number
          total_alertas: number
          total_alta: number
          total_baixa: number
          total_criticos: number
          total_falhas_execucao: number
          total_informativos: number
          total_media: number
          total_resolvidos: number
        }
        Insert: {
          assunto?: string | null
          canal?: string
          conteudo: string
          created_at?: string
          destinatario_id?: string | null
          destino: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          metadata?: Json
          periodo_fim: string
          periodo_inicio: string
          provider?: string | null
          provider_message_id?: string | null
          status?: string
          tipo_resumo?: string
          total_abertos?: number
          total_alertas?: number
          total_alta?: number
          total_baixa?: number
          total_criticos?: number
          total_falhas_execucao?: number
          total_informativos?: number
          total_media?: number
          total_resolvidos?: number
        }
        Update: {
          assunto?: string | null
          canal?: string
          conteudo?: string
          created_at?: string
          destinatario_id?: string | null
          destino?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          metadata?: Json
          periodo_fim?: string
          periodo_inicio?: string
          provider?: string | null
          provider_message_id?: string | null
          status?: string
          tipo_resumo?: string
          total_abertos?: number
          total_alertas?: number
          total_alta?: number
          total_baixa?: number
          total_criticos?: number
          total_falhas_execucao?: number
          total_informativos?: number
          total_media?: number
          total_resolvidos?: number
        }
        Relationships: [
          {
            foreignKeyName: "alertas_resumos_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "alertas_notificacao_destinatarios"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_sla_config: {
        Row: {
          aplica_horario_comercial: boolean
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          dias_semana: number[] | null
          escalonar_apos_minutos: number | null
          gravidade: string
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          metadata: Json
          nome: string
          notificar_gestor: boolean
          notificar_responsavel: boolean
          nova_gravidade_apos_sla: string | null
          origem: string | null
          prazo_primeira_resposta_minutos: number | null
          prazo_resolucao_minutos: number
          tipo_alerta: string | null
          updated_at: string
        }
        Insert: {
          aplica_horario_comercial?: boolean
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          dias_semana?: number[] | null
          escalonar_apos_minutos?: number | null
          gravidade: string
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          metadata?: Json
          nome: string
          notificar_gestor?: boolean
          notificar_responsavel?: boolean
          nova_gravidade_apos_sla?: string | null
          origem?: string | null
          prazo_primeira_resposta_minutos?: number | null
          prazo_resolucao_minutos: number
          tipo_alerta?: string | null
          updated_at?: string
        }
        Update: {
          aplica_horario_comercial?: boolean
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          dias_semana?: number[] | null
          escalonar_apos_minutos?: number | null
          gravidade?: string
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          metadata?: Json
          nome?: string
          notificar_gestor?: boolean
          notificar_responsavel?: boolean
          nova_gravidade_apos_sla?: string | null
          origem?: string | null
          prazo_primeira_resposta_minutos?: number | null
          prazo_resolucao_minutos?: number
          tipo_alerta?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      alertas_sla_eventos: {
        Row: {
          alerta_id: string
          config_id: string | null
          created_at: string
          criado_por: string | null
          escalonado_em: string | null
          evento: string
          gestor_notificado: boolean
          gravidade_anterior: string | null
          gravidade_nova: string | null
          id: string
          metadata: Json
          observacao: string | null
          prazo_primeira_resposta_em: string | null
          prazo_resolucao_em: string | null
          responsavel_id: string | null
          vencido_em: string | null
        }
        Insert: {
          alerta_id: string
          config_id?: string | null
          created_at?: string
          criado_por?: string | null
          escalonado_em?: string | null
          evento: string
          gestor_notificado?: boolean
          gravidade_anterior?: string | null
          gravidade_nova?: string | null
          id?: string
          metadata?: Json
          observacao?: string | null
          prazo_primeira_resposta_em?: string | null
          prazo_resolucao_em?: string | null
          responsavel_id?: string | null
          vencido_em?: string | null
        }
        Update: {
          alerta_id?: string
          config_id?: string | null
          created_at?: string
          criado_por?: string | null
          escalonado_em?: string | null
          evento?: string
          gestor_notificado?: boolean
          gravidade_anterior?: string | null
          gravidade_nova?: string | null
          id?: string
          metadata?: Json
          observacao?: string | null
          prazo_primeira_resposta_em?: string | null
          prazo_resolucao_em?: string | null
          responsavel_id?: string | null
          vencido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_sla_eventos_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "alertas_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_sla_eventos_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "alertas_sla_config"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicacao_emails: {
        Row: {
          aplicacao_id: string
          created_at: string
          email: string
          enviado_por: string | null
          id: string
          idempotency_key: string | null
          status: string | null
        }
        Insert: {
          aplicacao_id: string
          created_at?: string
          email: string
          enviado_por?: string | null
          id?: string
          idempotency_key?: string | null
          status?: string | null
        }
        Update: {
          aplicacao_id?: string
          created_at?: string
          email?: string
          enviado_por?: string | null
          id?: string
          idempotency_key?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicacao_emails_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["aplicacao_id"]
          },
          {
            foreignKeyName: "aplicacao_emails_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacao_emails_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["aplicacao_id"]
          },
          {
            foreignKeyName: "aplicacao_emails_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["aplicacao_id"]
          },
        ]
      }
      aplicacao_evidencias: {
        Row: {
          aplicacao_id: string
          created_at: string
          created_by: string | null
          id: string
          legenda: string | null
          mime: string | null
          storage_path: string
          tamanho_bytes: number | null
          tipo: string
          url: string | null
          versao_origem_id: string | null
        }
        Insert: {
          aplicacao_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          legenda?: string | null
          mime?: string | null
          storage_path: string
          tamanho_bytes?: number | null
          tipo?: string
          url?: string | null
          versao_origem_id?: string | null
        }
        Update: {
          aplicacao_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          legenda?: string | null
          mime?: string | null
          storage_path?: string
          tamanho_bytes?: number | null
          tipo?: string
          url?: string | null
          versao_origem_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicacao_evidencias_versao_origem_id_fkey"
            columns: ["versao_origem_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["aplicacao_id"]
          },
          {
            foreignKeyName: "aplicacao_evidencias_versao_origem_id_fkey"
            columns: ["versao_origem_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacao_evidencias_versao_origem_id_fkey"
            columns: ["versao_origem_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["aplicacao_id"]
          },
          {
            foreignKeyName: "aplicacao_evidencias_versao_origem_id_fkey"
            columns: ["versao_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["aplicacao_id"]
          },
        ]
      }
      aplicacao_evidencias_vinculos: {
        Row: {
          aplicacao_id: string
          created_at: string | null
          evidencia_id: string
        }
        Insert: {
          aplicacao_id: string
          created_at?: string | null
          evidencia_id: string
        }
        Update: {
          aplicacao_id?: string
          created_at?: string | null
          evidencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aplicacao_evidencias_vinculos_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["aplicacao_id"]
          },
          {
            foreignKeyName: "aplicacao_evidencias_vinculos_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacao_evidencias_vinculos_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["aplicacao_id"]
          },
          {
            foreignKeyName: "aplicacao_evidencias_vinculos_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["aplicacao_id"]
          },
          {
            foreignKeyName: "aplicacao_evidencias_vinculos_evidencia_id_fkey"
            columns: ["evidencia_id"]
            isOneToOne: false
            referencedRelation: "aplicacao_evidencias"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicacoes: {
        Row: {
          area_aplicada_ha: number | null
          assinatura_responsavel_url: string | null
          bico_tipo: string | null
          condicoes_climaticas: string | null
          created_at: string
          created_by: string | null
          data_aplicacao: string
          dose_aplicada: number | null
          email_envio: string | null
          equipamento: string | null
          equipamento_modelo: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          is_latest: boolean
          latitude: number | null
          longitude: number | null
          lote_usado_id: string | null
          modo_aplicacao: string | null
          motivo_retificacao: string | null
          observacoes: string | null
          ordem_servico_id: string | null
          ordem_servico_onfarm_id: string | null
          organization_id: string | null
          parent_id: string | null
          pressao_bar: number | null
          produto_usado_id: string | null
          responsavel: string | null
          responsavel_id: string | null
          resultado_inicial: string | null
          temperatura_c: number | null
          umidade_pct: number | null
          updated_at: string
          vento_kmh: number | null
          versao: number
          volume_calda_l_ha: number | null
          volume_total_aplicado_ml: number | null
        }
        Insert: {
          area_aplicada_ha?: number | null
          assinatura_responsavel_url?: string | null
          bico_tipo?: string | null
          condicoes_climaticas?: string | null
          created_at?: string
          created_by?: string | null
          data_aplicacao?: string
          dose_aplicada?: number | null
          email_envio?: string | null
          equipamento?: string | null
          equipamento_modelo?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          is_latest?: boolean
          latitude?: number | null
          longitude?: number | null
          lote_usado_id?: string | null
          modo_aplicacao?: string | null
          motivo_retificacao?: string | null
          observacoes?: string | null
          ordem_servico_id?: string | null
          ordem_servico_onfarm_id?: string | null
          organization_id?: string | null
          parent_id?: string | null
          pressao_bar?: number | null
          produto_usado_id?: string | null
          responsavel?: string | null
          responsavel_id?: string | null
          resultado_inicial?: string | null
          temperatura_c?: number | null
          umidade_pct?: number | null
          updated_at?: string
          vento_kmh?: number | null
          versao?: number
          volume_calda_l_ha?: number | null
          volume_total_aplicado_ml?: number | null
        }
        Update: {
          area_aplicada_ha?: number | null
          assinatura_responsavel_url?: string | null
          bico_tipo?: string | null
          condicoes_climaticas?: string | null
          created_at?: string
          created_by?: string | null
          data_aplicacao?: string
          dose_aplicada?: number | null
          email_envio?: string | null
          equipamento?: string | null
          equipamento_modelo?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          is_latest?: boolean
          latitude?: number | null
          longitude?: number | null
          lote_usado_id?: string | null
          modo_aplicacao?: string | null
          motivo_retificacao?: string | null
          observacoes?: string | null
          ordem_servico_id?: string | null
          ordem_servico_onfarm_id?: string | null
          organization_id?: string | null
          parent_id?: string | null
          pressao_bar?: number | null
          produto_usado_id?: string | null
          responsavel?: string | null
          responsavel_id?: string | null
          resultado_inicial?: string | null
          temperatura_c?: number | null
          umidade_pct?: number | null
          updated_at?: string
          vento_kmh?: number | null
          versao?: number
          volume_calda_l_ha?: number | null
          volume_total_aplicado_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicacoes_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacoes_ordem_servico_onfarm_id_fkey"
            columns: ["ordem_servico_onfarm_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_fluxo_visita_tecnica"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "aplicacoes_ordem_servico_onfarm_id_fkey"
            columns: ["ordem_servico_onfarm_id"]
            isOneToOne: false
            referencedRelation: "mv_fluxo_visita_tecnica"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "aplicacoes_ordem_servico_onfarm_id_fkey"
            columns: ["ordem_servico_onfarm_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico_onfarm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacoes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["aplicacao_id"]
          },
          {
            foreignKeyName: "aplicacoes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacoes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["aplicacao_id"]
          },
          {
            foreignKeyName: "aplicacoes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["aplicacao_id"]
          },
        ]
      }
      aprovacoes_tecnicas: {
        Row: {
          aprovado_por: string | null
          aprovado_por_role: Database["public"]["Enums"]["app_role"] | null
          comentario_gestor: string | null
          created_at: string
          data_aprovacao: string | null
          id: string
          override: boolean | null
          registro_consultor_id: string
          status_aprovacao: Database["public"]["Enums"]["status_aprovacao"]
        }
        Insert: {
          aprovado_por?: string | null
          aprovado_por_role?: Database["public"]["Enums"]["app_role"] | null
          comentario_gestor?: string | null
          created_at?: string
          data_aprovacao?: string | null
          id?: string
          override?: boolean | null
          registro_consultor_id: string
          status_aprovacao?: Database["public"]["Enums"]["status_aprovacao"]
        }
        Update: {
          aprovado_por?: string | null
          aprovado_por_role?: Database["public"]["Enums"]["app_role"] | null
          comentario_gestor?: string | null
          created_at?: string
          data_aprovacao?: string | null
          id?: string
          override?: boolean | null
          registro_consultor_id?: string
          status_aprovacao?: Database["public"]["Enums"]["status_aprovacao"]
        }
        Relationships: [
          {
            foreignKeyName: "aprovacoes_tecnicas_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "aprovacoes_tecnicas_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      arquivos: {
        Row: {
          arquivo_url: string
          data_upload: string
          descricao: string | null
          entidade_id: string
          entidade_tipo: string
          id: string
        }
        Insert: {
          arquivo_url: string
          data_upload?: string
          descricao?: string | null
          entidade_id: string
          entidade_tipo: string
          id?: string
        }
        Update: {
          arquivo_url?: string
          data_upload?: string
          descricao?: string | null
          entidade_id?: string
          entidade_tipo?: string
          id?: string
        }
        Relationships: []
      }
      audit_senha_log: {
        Row: {
          created_at: string
          executor_id: string | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          created_at?: string
          executor_id?: string | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          created_at?: string
          executor_id?: string | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_senha_log_executor_id_fkey"
            columns: ["executor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audit_senha_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      auditoria_duplicidade: {
        Row: {
          client_uuid: string | null
          created_at: string | null
          id: string
          item_id: string
          motivo: string | null
          resolvido: boolean | null
          tabela_origem: string
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string | null
          id?: string
          item_id: string
          motivo?: string | null
          resolvido?: boolean | null
          tabela_origem: string
        }
        Update: {
          client_uuid?: string | null
          created_at?: string | null
          id?: string
          item_id?: string
          motivo?: string | null
          resolvido?: boolean | null
          tabela_origem?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          active: boolean
          agency: string | null
          bank_name: string | null
          created_at: string
          id: string
          name: string
          opening_balance: number
          pix_key: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          active?: boolean
          agency?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          pix_key?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          active?: boolean
          agency?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          pix_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bi_filtro_config: {
        Row: {
          ativo: boolean
          created_at: string
          filtros: Json
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          filtros?: Json
          id?: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          filtros?: Json
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bi_refresh_audit: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          executed_at: string
          executed_by: string
          id: string
          success: boolean
          target: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          executed_by: string
          id?: string
          success?: boolean
          target: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          executed_by?: string
          id?: string
          success?: boolean
          target?: string
        }
        Relationships: []
      }
      bi_user_preferences: {
        Row: {
          created_at: string | null
          filtros: Json
          id: string
          is_default: boolean | null
          nome: string
          secao: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          filtros?: Json
          id?: string
          is_default?: boolean | null
          nome: string
          secao?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          filtros?: Json
          id?: string
          is_default?: boolean | null
          nome?: string
          secao?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      catalog_access_events: {
        Row: {
          created_at: string
          entidade_id: string
          entidade_tipo: string
          id: string
          origem: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entidade_id: string
          entidade_tipo: string
          id?: string
          origem?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entidade_id?: string
          entidade_tipo?: string
          id?: string
          origem?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      catalog_platform_admin_audit: {
        Row: {
          actor_id: string
          completed_at: string | null
          correlation_id: string
          counts_after: Json
          counts_before: Json
          created_at: string
          id: string
          operation: string
          reason: string
          status: string
        }
        Insert: {
          actor_id: string
          completed_at?: string | null
          correlation_id: string
          counts_after?: Json
          counts_before?: Json
          created_at?: string
          id?: string
          operation: string
          reason: string
          status: string
        }
        Update: {
          actor_id?: string
          completed_at?: string | null
          correlation_id?: string
          counts_after?: Json
          counts_before?: Json
          created_at?: string
          id?: string
          operation?: string
          reason?: string
          status?: string
        }
        Relationships: []
      }
      catalog_technical_audit_logs: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          entidade_id: string
          entidade_tipo: string
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade_id: string
          entidade_tipo: string
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade_id?: string
          entidade_tipo?: string
          id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      catalog_technical_sources: {
        Row: {
          created_at: string
          created_by: string | null
          data_consulta: string | null
          entidade_id: string
          entidade_tipo: string
          fonte_tipo: string
          fonte_titulo: string
          fonte_url: string | null
          id: string
          idioma_original: string | null
          nivel_confianca: string
          observacoes: string | null
          pais_origem: string | null
          resumo_evidencia: string | null
          source_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_consulta?: string | null
          entidade_id: string
          entidade_tipo: string
          fonte_tipo: string
          fonte_titulo: string
          fonte_url?: string | null
          id?: string
          idioma_original?: string | null
          nivel_confianca?: string
          observacoes?: string | null
          pais_origem?: string | null
          resumo_evidencia?: string | null
          source_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_consulta?: string | null
          entidade_id?: string
          entidade_tipo?: string
          fonte_tipo?: string
          fonte_titulo?: string
          fonte_url?: string | null
          id?: string
          idioma_original?: string | null
          nivel_confianca?: string
          observacoes?: string | null
          pais_origem?: string | null
          resumo_evidencia?: string | null
          source_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      catalogo_alvos: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          nome_cientifico: string | null
          nome_normalizado: string
          sinonimos: string[]
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          nome_cientifico?: string | null
          nome_normalizado: string
          sinonimos?: string[]
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          nome_cientifico?: string | null
          nome_normalizado?: string
          sinonimos?: string[]
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_problemas: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          criado_por: string | null
          cultura_alvo: string | null
          id: string
          nome: string
          nome_cientifico: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          criado_por?: string | null
          cultura_alvo?: string | null
          id?: string
          nome: string
          nome_cientifico?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          criado_por?: string | null
          cultura_alvo?: string | null
          id?: string
          nome?: string
          nome_cientifico?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_volumes: {
        Row: {
          ativo: boolean
          created_at: string
          doses_por_volume: number | null
          id: string
          item_tipo: string
          microrganismo_id: string | null
          moeda: string
          ordem: number
          preco_brl: number
          preco_litro_brl: number | null
          produto_id: string | null
          rotulo: string | null
          updated_at: string
          valor_dose_100ml_brl: number | null
          volume_ml: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          doses_por_volume?: number | null
          id?: string
          item_tipo: string
          microrganismo_id?: string | null
          moeda?: string
          ordem?: number
          preco_brl?: number
          preco_litro_brl?: number | null
          produto_id?: string | null
          rotulo?: string | null
          updated_at?: string
          valor_dose_100ml_brl?: number | null
          volume_ml: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          doses_por_volume?: number | null
          id?: string
          item_tipo?: string
          microrganismo_id?: string | null
          moeda?: string
          ordem?: number
          preco_brl?: number
          preco_litro_brl?: number | null
          produto_id?: string | null
          rotulo?: string | null
          updated_at?: string
          valor_dose_100ml_brl?: number | null
          volume_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_volumes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_volumes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "catalogo_volumes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_contatos: {
        Row: {
          cargo: string | null
          cliente_id: string
          created_at: string | null
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          principal: boolean | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cargo?: string | null
          cliente_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          principal?: boolean | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          cargo?: string | null
          cliente_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          principal?: boolean | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_documentos: {
        Row: {
          arquivo_path: string
          arquivo_url: string | null
          cliente_id: string
          descricao: string | null
          id: string
          mime: string | null
          nome: string
          tamanho_bytes: number | null
          tipo: Database["public"]["Enums"]["cliente_doc_tipo"] | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          arquivo_path: string
          arquivo_url?: string | null
          cliente_id: string
          descricao?: string | null
          id?: string
          mime?: string | null
          nome: string
          tamanho_bytes?: number | null
          tipo?: Database["public"]["Enums"]["cliente_doc_tipo"] | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          arquivo_path?: string
          arquivo_url?: string | null
          cliente_id?: string
          descricao?: string | null
          id?: string
          mime?: string | null
          nome?: string
          tamanho_bytes?: number | null
          tipo?: Database["public"]["Enums"]["cliente_doc_tipo"] | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_documentos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clientes: {
        Row: {
          banco_agencia: string | null
          banco_conta: string | null
          banco_nome: string | null
          banco_pix_chave: string | null
          banco_pix_tipo: string | null
          banco_tipo_conta: string | null
          cobranca_bairro: string | null
          cobranca_cep: string | null
          cobranca_complemento: string | null
          cobranca_estado: string | null
          cobranca_logradouro: string | null
          cobranca_mesmo_endereco: boolean | null
          cobranca_municipio: string | null
          cobranca_numero: string | null
          codigo_cliente: string
          condicao_pagamento: string | null
          contato_financeiro_email: string | null
          contato_financeiro_nome: string | null
          contato_financeiro_telefone: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_complemento: string | null
          endereco_estado: string | null
          endereco_latitude: number | null
          endereco_logradouro: string | null
          endereco_longitude: number | null
          endereco_municipio: string | null
          endereco_numero: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          limite_credito: number | null
          marca_cor_primaria: string | null
          marca_logo_url: string | null
          marca_nome: string | null
          nome: string
          nome_fantasia: string | null
          observacoes: string | null
          organization_id: string | null
          razao_social: string | null
          segmento: string | null
          site: string | null
          status_cliente: Database["public"]["Enums"]["cliente_status"] | null
          tags: string[] | null
          telefone: string | null
          telefones: string[] | null
          tipo_pessoa: Database["public"]["Enums"]["cliente_tipo_pessoa"] | null
          updated_at: string
        }
        Insert: {
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          banco_pix_chave?: string | null
          banco_pix_tipo?: string | null
          banco_tipo_conta?: string | null
          cobranca_bairro?: string | null
          cobranca_cep?: string | null
          cobranca_complemento?: string | null
          cobranca_estado?: string | null
          cobranca_logradouro?: string | null
          cobranca_mesmo_endereco?: boolean | null
          cobranca_municipio?: string | null
          cobranca_numero?: string | null
          codigo_cliente: string
          condicao_pagamento?: string | null
          contato_financeiro_email?: string | null
          contato_financeiro_nome?: string | null
          contato_financeiro_telefone?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_complemento?: string | null
          endereco_estado?: string | null
          endereco_latitude?: number | null
          endereco_logradouro?: string | null
          endereco_longitude?: number | null
          endereco_municipio?: string | null
          endereco_numero?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          limite_credito?: number | null
          marca_cor_primaria?: string | null
          marca_logo_url?: string | null
          marca_nome?: string | null
          nome: string
          nome_fantasia?: string | null
          observacoes?: string | null
          organization_id?: string | null
          razao_social?: string | null
          segmento?: string | null
          site?: string | null
          status_cliente?: Database["public"]["Enums"]["cliente_status"] | null
          tags?: string[] | null
          telefone?: string | null
          telefones?: string[] | null
          tipo_pessoa?:
            | Database["public"]["Enums"]["cliente_tipo_pessoa"]
            | null
          updated_at?: string
        }
        Update: {
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          banco_pix_chave?: string | null
          banco_pix_tipo?: string | null
          banco_tipo_conta?: string | null
          cobranca_bairro?: string | null
          cobranca_cep?: string | null
          cobranca_complemento?: string | null
          cobranca_estado?: string | null
          cobranca_logradouro?: string | null
          cobranca_mesmo_endereco?: boolean | null
          cobranca_municipio?: string | null
          cobranca_numero?: string | null
          codigo_cliente?: string
          condicao_pagamento?: string | null
          contato_financeiro_email?: string | null
          contato_financeiro_nome?: string | null
          contato_financeiro_telefone?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_complemento?: string | null
          endereco_estado?: string | null
          endereco_latitude?: number | null
          endereco_logradouro?: string | null
          endereco_longitude?: number | null
          endereco_municipio?: string | null
          endereco_numero?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          limite_credito?: number | null
          marca_cor_primaria?: string | null
          marca_logo_url?: string | null
          marca_nome?: string | null
          nome?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          organization_id?: string | null
          razao_social?: string | null
          segmento?: string | null
          site?: string | null
          status_cliente?: Database["public"]["Enums"]["cliente_status"] | null
          tags?: string[] | null
          telefone?: string | null
          telefones?: string[] | null
          tipo_pessoa?:
            | Database["public"]["Enums"]["cliente_tipo_pessoa"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_audit_log: {
        Row: {
          action: string
          changed_at: string | null
          changed_by: string | null
          cliente_id: string | null
          diff: Json | null
          id: string
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          changed_at?: string | null
          changed_by?: string | null
          cliente_id?: string | null
          diff?: Json | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          changed_at?: string | null
          changed_by?: string | null
          cliente_id?: string | null
          diff?: Json | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clima_dados: {
        Row: {
          chuva_mm: number | null
          coletado_em: string
          created_at: string
          data_hora: string
          fazenda_id: string
          fonte: string
          id: string
          radiacao_solar: number | null
          temperatura: number | null
          tipo_dado: string
          umidade: number | null
          vento_kmh: number | null
        }
        Insert: {
          chuva_mm?: number | null
          coletado_em?: string
          created_at?: string
          data_hora?: string
          fazenda_id: string
          fonte?: string
          id?: string
          radiacao_solar?: number | null
          temperatura?: number | null
          tipo_dado?: string
          umidade?: number | null
          vento_kmh?: number | null
        }
        Update: {
          chuva_mm?: number | null
          coletado_em?: string
          created_at?: string
          data_hora?: string
          fazenda_id?: string
          fonte?: string
          id?: string
          radiacao_solar?: number | null
          temperatura?: number | null
          tipo_dado?: string
          umidade?: number | null
          vento_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clima_dados_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      cockpit_alertas_reconhecidos: {
        Row: {
          alerta_key: string
          created_at: string
          id: string
          motivo: string | null
          os_id: string | null
          usuario_id: string
        }
        Insert: {
          alerta_key: string
          created_at?: string
          id?: string
          motivo?: string | null
          os_id?: string | null
          usuario_id: string
        }
        Update: {
          alerta_key?: string
          created_at?: string
          id?: string
          motivo?: string | null
          os_id?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      cockpit_operacao_idempotencia: {
        Row: {
          alvo_id: string | null
          created_at: string
          idempotency_key: string
          operacao: string
          payload_hash: string | null
          resultado: Json | null
          status: string
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          alvo_id?: string | null
          created_at?: string
          idempotency_key: string
          operacao: string
          payload_hash?: string | null
          resultado?: Json | null
          status?: string
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          alvo_id?: string | null
          created_at?: string
          idempotency_key?: string
          operacao?: string
          payload_hash?: string | null
          resultado?: Json | null
          status?: string
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      codigo_sequencias: {
        Row: {
          prefixo: string
          proximo_numero: number
          updated_at: string
        }
        Insert: {
          prefixo: string
          proximo_numero?: number
          updated_at?: string
        }
        Update: {
          prefixo?: string
          proximo_numero?: number
          updated_at?: string
        }
        Relationships: []
      }
      commercial_audit_log: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          order_id: string | null
          partner_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          order_id?: string | null
          partner_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          order_id?: string | null
          partner_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      commercial_campaign_clientes: {
        Row: {
          campaign_id: string
          cliente_id: string
          created_at: string
        }
        Insert: {
          campaign_id: string
          cliente_id: string
          created_at?: string
        }
        Update: {
          campaign_id?: string
          cliente_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_campaign_clientes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "commercial_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_campaign_clientes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_campaign_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_campaign_partners: {
        Row: {
          campaign_id: string
          created_at: string
          partner_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          partner_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_campaign_partners_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "commercial_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_campaign_partners_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_campaign_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_campaign_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_campaign_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_campaign_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_campaign_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_campaign_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_campaign_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      commercial_campaign_products: {
        Row: {
          campaign_id: string
          created_at: string
          price_table_name: string | null
          product_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          price_table_name?: string | null
          product_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          price_table_name?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_campaign_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "commercial_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_campaign_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_campaign_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_campaigns: {
        Row: {
          ativa: boolean
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          descricao: string | null
          id: string
          nome: string
          tipo_publico: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          descricao?: string | null
          id?: string
          nome: string
          tipo_publico?: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          id?: string
          nome?: string
          tipo_publico?: string
          updated_at?: string
        }
        Relationships: []
      }
      commercial_condition_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          motivo: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          motivo?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          motivo?: string | null
        }
        Relationships: []
      }
      commercial_condition_item_prices: {
        Row: {
          assignment_id: string | null
          buyer_scope: string
          condition_price: number | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          discount_percent: number | null
          id: string
          is_exception: boolean
          microrganismo_id: string | null
          min_quantity: number
          motivo: string | null
          partner_id: string | null
          plan_id: string
          pricing_mode: string
          product_id: string | null
          published_at: string | null
          published_by: string | null
          published_rule_id: string | null
          status: string
          unit_type: string
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
          volume_ml: number | null
        }
        Insert: {
          assignment_id?: string | null
          buyer_scope: string
          condition_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_percent?: number | null
          id?: string
          is_exception?: boolean
          microrganismo_id?: string | null
          min_quantity?: number
          motivo?: string | null
          partner_id?: string | null
          plan_id: string
          pricing_mode: string
          product_id?: string | null
          published_at?: string | null
          published_by?: string | null
          published_rule_id?: string | null
          status?: string
          unit_type: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
          volume_ml?: number | null
        }
        Update: {
          assignment_id?: string | null
          buyer_scope?: string
          condition_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_percent?: number | null
          id?: string
          is_exception?: boolean
          microrganismo_id?: string | null
          min_quantity?: number
          motivo?: string | null
          partner_id?: string | null
          plan_id?: string
          pricing_mode?: string
          product_id?: string | null
          published_at?: string | null
          published_by?: string | null
          published_rule_id?: string | null
          status?: string
          unit_type?: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
          volume_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_condition_item_prices_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_plan_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_condition_item_prices_published_rule_id_fkey"
            columns: ["published_rule_id"]
            isOneToOne: false
            referencedRelation: "commercial_price_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_payment_plan_assignments: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          buyer_scope: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          motivo: string | null
          partner_id: string | null
          plan_id: string
          published_at: string | null
          published_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          buyer_scope: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          motivo?: string | null
          partner_id?: string | null
          plan_id: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          buyer_scope?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          motivo?: string | null
          partner_id?: string | null
          plan_id?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_payment_plan_assignments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_payment_plan_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_payment_plan_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_payment_plan_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_payment_plan_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_payment_plan_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_payment_plan_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_payment_plan_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_payment_plan_assignments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_payment_plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_percent: number
          id: string
          installment_count: number
          interest_type: string
          is_default: boolean
          max_days: number
          minimum_order_amount: number | null
          monthly_interest_percent: number
          months_count: number
          name: string
          plan_type: string
          pricing_mode: string
          requires_credit_approval: boolean
          requires_financial_approval: boolean
          requires_guarantee: boolean
          root_plan_id: string | null
          sort_order: number
          superseded_by_id: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
          version: number
          version_reason: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percent?: number
          id?: string
          installment_count?: number
          interest_type?: string
          is_default?: boolean
          max_days?: number
          minimum_order_amount?: number | null
          monthly_interest_percent?: number
          months_count?: number
          name: string
          plan_type: string
          pricing_mode?: string
          requires_credit_approval?: boolean
          requires_financial_approval?: boolean
          requires_guarantee?: boolean
          root_plan_id?: string | null
          sort_order?: number
          superseded_by_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
          version?: number
          version_reason?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percent?: number
          id?: string
          installment_count?: number
          interest_type?: string
          is_default?: boolean
          max_days?: number
          minimum_order_amount?: number | null
          monthly_interest_percent?: number
          months_count?: number
          name?: string
          plan_type?: string
          pricing_mode?: string
          requires_credit_approval?: boolean
          requires_financial_approval?: boolean
          requires_guarantee?: boolean
          root_plan_id?: string | null
          sort_order?: number
          superseded_by_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
          version?: number
          version_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_payment_plans_root_plan_id_fkey"
            columns: ["root_plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_payment_plans_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_price_rules: {
        Row: {
          active: boolean
          buyer_scope: string
          condition_price: number | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          discount_percent: number | null
          id: string
          microrganismo_id: string | null
          min_quantity: number
          motivo: string | null
          partner_id: string | null
          plan_id: string | null
          pricing_mode: string
          product_id: string | null
          unit_type: string
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
          volume_ml: number | null
        }
        Insert: {
          active?: boolean
          buyer_scope: string
          condition_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_percent?: number | null
          id?: string
          microrganismo_id?: string | null
          min_quantity?: number
          motivo?: string | null
          partner_id?: string | null
          plan_id?: string | null
          pricing_mode: string
          product_id?: string | null
          unit_type: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
          volume_ml?: number | null
        }
        Update: {
          active?: boolean
          buyer_scope?: string
          condition_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_percent?: number | null
          id?: string
          microrganismo_id?: string | null
          min_quantity?: number
          motivo?: string | null
          partner_id?: string | null
          plan_id?: string | null
          pricing_mode?: string
          product_id?: string | null
          unit_type?: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
          volume_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_price_rules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_price_rules_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_price_rules_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "commercial_price_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_price_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_price_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_price_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_price_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_price_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_price_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "commercial_price_rules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_price_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_provider_settings: {
        Row: {
          allowed_emails: string[]
          allowed_phones: string[]
          delivery_enabled: boolean
          email_delivery_enabled: boolean
          id: number
          inapp_delivery_enabled: boolean
          secret_smtp_password: string | null
          secret_whatsapp_access_token: string | null
          secret_whatsapp_app_secret: string | null
          secret_whatsapp_verify_token: string | null
          smtp_from: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_user: string | null
          test_mode_enabled: boolean
          updated_at: string
          updated_by: string | null
          whatsapp_api_version: string | null
          whatsapp_delivery_enabled: boolean
          whatsapp_phone_number_id: string | null
          whatsapp_webhook_enabled: boolean
        }
        Insert: {
          allowed_emails?: string[]
          allowed_phones?: string[]
          delivery_enabled?: boolean
          email_delivery_enabled?: boolean
          id?: number
          inapp_delivery_enabled?: boolean
          secret_smtp_password?: string | null
          secret_whatsapp_access_token?: string | null
          secret_whatsapp_app_secret?: string | null
          secret_whatsapp_verify_token?: string | null
          smtp_from?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          test_mode_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_api_version?: string | null
          whatsapp_delivery_enabled?: boolean
          whatsapp_phone_number_id?: string | null
          whatsapp_webhook_enabled?: boolean
        }
        Update: {
          allowed_emails?: string[]
          allowed_phones?: string[]
          delivery_enabled?: boolean
          email_delivery_enabled?: boolean
          id?: number
          inapp_delivery_enabled?: boolean
          secret_smtp_password?: string | null
          secret_whatsapp_access_token?: string | null
          secret_whatsapp_app_secret?: string | null
          secret_whatsapp_verify_token?: string | null
          smtp_from?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          test_mode_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_api_version?: string | null
          whatsapp_delivery_enabled?: boolean
          whatsapp_phone_number_id?: string | null
          whatsapp_webhook_enabled?: boolean
        }
        Relationships: []
      }
      communication_provider_settings_audit: {
        Row: {
          action: string
          actor_id: string | null
          changed_fields: string[]
          created_at: string
          id: number
          latency_ms: number | null
          outcome: string | null
          safe_code: string | null
          secret_field: string | null
          stage: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changed_fields?: string[]
          created_at?: string
          id?: number
          latency_ms?: number | null
          outcome?: string | null
          safe_code?: string | null
          secret_field?: string | null
          stage?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changed_fields?: string[]
          created_at?: string
          id?: number
          latency_ms?: number | null
          outcome?: string | null
          safe_code?: string | null
          secret_field?: string | null
          stage?: string | null
        }
        Relationships: []
      }
      communication_provider_settings_rate_limit: {
        Row: {
          action: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          action: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          action?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      company_fiscal_settings: {
        Row: {
          accounting_validated_at: string | null
          accounting_validated_by: string | null
          additional_cnaes: string[] | null
          certificate_ref: string | null
          city: string | null
          cnpj: string | null
          complement: string | null
          configuration_notes: string | null
          configuration_status: string
          configuration_version: number
          country_code: string | null
          created_at: string
          created_by: string | null
          crt: string | null
          difal_responsible: boolean
          fcp_applicable: boolean
          fiscal_email: string | null
          fiscal_environment: string
          fiscal_provider: string
          icms_st_responsible: boolean
          id: string
          ipi_taxpayer: boolean
          is_active: boolean
          last_validation_at: string | null
          last_validation_status: string
          last_validation_summary: Json
          legal_name: string | null
          municipal_registration: string | null
          municipality_ibge_code: string | null
          neighborhood: string | null
          nfe_configuration: Json
          nfe_credential_ref: string | null
          nfe_enabled: boolean
          nfe_environment_code: string | null
          nfe_provider: string
          nfe_readiness_checked_at: string | null
          nfe_readiness_pendencies: Json
          nfe_readiness_status: string
          nfe_series: string | null
          nfe_series_number: number | null
          nfse_configuration: Json
          nfse_credential_ref: string | null
          nfse_enabled: boolean
          nfse_provider: string
          nfse_series: string | null
          number: string | null
          organization_id: string
          phone: string | null
          pis_cofins_regime: string | null
          postal_code: string | null
          primary_cnae: string | null
          production_enabled: boolean
          rtc_configuration: Json
          rtc_scaffolding_enabled: boolean
          sefaz_homologation_at: string | null
          sefaz_homologation_evidence: Json | null
          state: string | null
          state_registration: string | null
          street: string | null
          tax_regime: string | null
          trade_name: string | null
          uf_accreditations: Json
          updated_at: string
          updated_by: string | null
          webhook_ref: string | null
        }
        Insert: {
          accounting_validated_at?: string | null
          accounting_validated_by?: string | null
          additional_cnaes?: string[] | null
          certificate_ref?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          configuration_notes?: string | null
          configuration_status?: string
          configuration_version?: number
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          crt?: string | null
          difal_responsible?: boolean
          fcp_applicable?: boolean
          fiscal_email?: string | null
          fiscal_environment?: string
          fiscal_provider?: string
          icms_st_responsible?: boolean
          id?: string
          ipi_taxpayer?: boolean
          is_active?: boolean
          last_validation_at?: string | null
          last_validation_status?: string
          last_validation_summary?: Json
          legal_name?: string | null
          municipal_registration?: string | null
          municipality_ibge_code?: string | null
          neighborhood?: string | null
          nfe_configuration?: Json
          nfe_credential_ref?: string | null
          nfe_enabled?: boolean
          nfe_environment_code?: string | null
          nfe_provider?: string
          nfe_readiness_checked_at?: string | null
          nfe_readiness_pendencies?: Json
          nfe_readiness_status?: string
          nfe_series?: string | null
          nfe_series_number?: number | null
          nfse_configuration?: Json
          nfse_credential_ref?: string | null
          nfse_enabled?: boolean
          nfse_provider?: string
          nfse_series?: string | null
          number?: string | null
          organization_id: string
          phone?: string | null
          pis_cofins_regime?: string | null
          postal_code?: string | null
          primary_cnae?: string | null
          production_enabled?: boolean
          rtc_configuration?: Json
          rtc_scaffolding_enabled?: boolean
          sefaz_homologation_at?: string | null
          sefaz_homologation_evidence?: Json | null
          state?: string | null
          state_registration?: string | null
          street?: string | null
          tax_regime?: string | null
          trade_name?: string | null
          uf_accreditations?: Json
          updated_at?: string
          updated_by?: string | null
          webhook_ref?: string | null
        }
        Update: {
          accounting_validated_at?: string | null
          accounting_validated_by?: string | null
          additional_cnaes?: string[] | null
          certificate_ref?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          configuration_notes?: string | null
          configuration_status?: string
          configuration_version?: number
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          crt?: string | null
          difal_responsible?: boolean
          fcp_applicable?: boolean
          fiscal_email?: string | null
          fiscal_environment?: string
          fiscal_provider?: string
          icms_st_responsible?: boolean
          id?: string
          ipi_taxpayer?: boolean
          is_active?: boolean
          last_validation_at?: string | null
          last_validation_status?: string
          last_validation_summary?: Json
          legal_name?: string | null
          municipal_registration?: string | null
          municipality_ibge_code?: string | null
          neighborhood?: string | null
          nfe_configuration?: Json
          nfe_credential_ref?: string | null
          nfe_enabled?: boolean
          nfe_environment_code?: string | null
          nfe_provider?: string
          nfe_readiness_checked_at?: string | null
          nfe_readiness_pendencies?: Json
          nfe_readiness_status?: string
          nfe_series?: string | null
          nfe_series_number?: number | null
          nfse_configuration?: Json
          nfse_credential_ref?: string | null
          nfse_enabled?: boolean
          nfse_provider?: string
          nfse_series?: string | null
          number?: string | null
          organization_id?: string
          phone?: string | null
          pis_cofins_regime?: string | null
          postal_code?: string | null
          primary_cnae?: string | null
          production_enabled?: boolean
          rtc_configuration?: Json
          rtc_scaffolding_enabled?: boolean
          sefaz_homologation_at?: string | null
          sefaz_homologation_evidence?: Json | null
          state?: string | null
          state_registration?: string | null
          street?: string | null
          tax_regime?: string | null
          trade_name?: string | null
          uf_accreditations?: Json
          updated_at?: string
          updated_by?: string | null
          webhook_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_fiscal_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacao_audit_log: {
        Row: {
          acao: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entidade: string
          entity_id: string | null
          id: number
        }
        Insert: {
          acao: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entidade: string
          entity_id?: string | null
          id?: number
        }
        Update: {
          acao?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entidade?: string
          entity_id?: string | null
          id?: number
        }
        Relationships: []
      }
      comunicacao_consent_log: {
        Row: {
          acao: string
          actor_id: string | null
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          cliente_id: string | null
          created_at: string
          id: number
          source: string
          user_id: string | null
        }
        Insert: {
          acao: string
          actor_id?: string | null
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          cliente_id?: string | null
          created_at?: string
          id?: number
          source: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          actor_id?: string | null
          canal?: Database["public"]["Enums"]["comunicacao_canal"]
          cliente_id?: string | null
          created_at?: string
          id?: number
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      comunicacao_dlq_replay_audit: {
        Row: {
          actor_id: string
          batch_size: number | null
          created_at: string
          id: string
          scope: string
          target_id: string | null
        }
        Insert: {
          actor_id: string
          batch_size?: number | null
          created_at?: string
          id?: string
          scope: string
          target_id?: string | null
        }
        Update: {
          actor_id?: string
          batch_size?: number | null
          created_at?: string
          id?: string
          scope?: string
          target_id?: string | null
        }
        Relationships: []
      }
      comunicacao_eventos: {
        Row: {
          created_at: string
          created_by: string | null
          event_key: string
          id: string
          idempotency_key: string
          occurred_at: string
          outbox_enqueued: number
          outbox_skipped: number
          payload: Json
          processed_at: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["comunicacao_evento_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_key: string
          id?: string
          idempotency_key: string
          occurred_at?: string
          outbox_enqueued?: number
          outbox_skipped?: number
          payload?: Json
          processed_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["comunicacao_evento_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_key?: string
          id?: string
          idempotency_key?: string
          occurred_at?: string
          outbox_enqueued?: number
          outbox_skipped?: number
          payload?: Json
          processed_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["comunicacao_evento_status"]
        }
        Relationships: []
      }
      comunicacao_inapp_dispatch: {
        Row: {
          created_at: string
          notification_id: string
          outbox_id: string
          target_kind: string
        }
        Insert: {
          created_at?: string
          notification_id: string
          outbox_id: string
          target_kind: string
        }
        Update: {
          created_at?: string
          notification_id?: string
          outbox_id?: string
          target_kind?: string
        }
        Relationships: []
      }
      comunicacao_outbox: {
        Row: {
          attempts: number
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          created_at: string
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          event_id: string
          id: string
          idempotency_key: string
          lease_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          payload_snapshot: Json
          provider_delivery_status: string | null
          provider_failed_at: string | null
          provider_message_id: string | null
          provider_status_at: string | null
          read_at: string | null
          recipient_cliente_id: string | null
          recipient_hash: string | null
          recipient_user_id: string | null
          rule_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["comunicacao_outbox_status"]
          template_chave: string
          template_id: string | null
          template_snapshot: Json
          template_versao: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_id: string
          id?: string
          idempotency_key: string
          lease_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload_snapshot?: Json
          provider_delivery_status?: string | null
          provider_failed_at?: string | null
          provider_message_id?: string | null
          provider_status_at?: string | null
          read_at?: string | null
          recipient_cliente_id?: string | null
          recipient_hash?: string | null
          recipient_user_id?: string | null
          rule_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["comunicacao_outbox_status"]
          template_chave: string
          template_id?: string | null
          template_snapshot: Json
          template_versao: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          canal?: Database["public"]["Enums"]["comunicacao_canal"]
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_id?: string
          id?: string
          idempotency_key?: string
          lease_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload_snapshot?: Json
          provider_delivery_status?: string | null
          provider_failed_at?: string | null
          provider_message_id?: string | null
          provider_status_at?: string | null
          read_at?: string | null
          recipient_cliente_id?: string | null
          recipient_hash?: string | null
          recipient_user_id?: string | null
          rule_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["comunicacao_outbox_status"]
          template_chave?: string
          template_id?: string | null
          template_snapshot?: Json
          template_versao?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacao_outbox_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacao_outbox_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_regras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacao_outbox_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacao_preferencias: {
        Row: {
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          cliente_id: string | null
          created_at: string
          email_verificado: boolean
          enabled: boolean
          id: string
          source: string
          telefone_verificado: boolean
          updated_at: string
          user_id: string | null
          whatsapp_opt_in_at: string | null
          whatsapp_opt_out_at: string | null
        }
        Insert: {
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          cliente_id?: string | null
          created_at?: string
          email_verificado?: boolean
          enabled?: boolean
          id?: string
          source?: string
          telefone_verificado?: boolean
          updated_at?: string
          user_id?: string | null
          whatsapp_opt_in_at?: string | null
          whatsapp_opt_out_at?: string | null
        }
        Update: {
          canal?: Database["public"]["Enums"]["comunicacao_canal"]
          cliente_id?: string | null
          created_at?: string
          email_verificado?: boolean
          enabled?: boolean
          id?: string
          source?: string
          telefone_verificado?: boolean
          updated_at?: string
          user_id?: string | null
          whatsapp_opt_in_at?: string | null
          whatsapp_opt_out_at?: string | null
        }
        Relationships: []
      }
      comunicacao_provider_receipts: {
        Row: {
          error_code: string | null
          id: string
          outbox_id: string
          provider: string
          provider_message_id: string
          provider_timestamp: string
          received_at: string
          status: string
        }
        Insert: {
          error_code?: string | null
          id?: string
          outbox_id: string
          provider: string
          provider_message_id: string
          provider_timestamp: string
          received_at?: string
          status: string
        }
        Update: {
          error_code?: string | null
          id?: string
          outbox_id?: string
          provider?: string
          provider_message_id?: string
          provider_timestamp?: string
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacao_provider_receipts_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacao_regras: {
        Row: {
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          condicoes: Json
          cooldown_seconds: number
          created_at: string
          created_by: string | null
          enabled: boolean
          estrategia: string
          event_key: string
          id: string
          perfil: Database["public"]["Enums"]["app_role"] | null
          prioridade: number
          template_chave: string
          template_versao: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          condicoes?: Json
          cooldown_seconds?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          estrategia?: string
          event_key: string
          id?: string
          perfil?: Database["public"]["Enums"]["app_role"] | null
          prioridade?: number
          template_chave: string
          template_versao?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          canal?: Database["public"]["Enums"]["comunicacao_canal"]
          condicoes?: Json
          cooldown_seconds?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          estrategia?: string
          event_key?: string
          id?: string
          perfil?: Database["public"]["Enums"]["app_role"] | null
          prioridade?: number
          template_chave?: string
          template_versao?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      comunicacao_templates: {
        Row: {
          archived_at: string | null
          assunto: string | null
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          chave: string
          corpo: string
          created_at: string
          created_by: string | null
          id: string
          language_code: string | null
          locale: string
          nome: string
          parameter_mapping: Json
          provider_template_name: string | null
          provider_template_status: string | null
          status: Database["public"]["Enums"]["comunicacao_template_status"]
          updated_at: string
          updated_by: string | null
          variaveis: Json
          versao: number
        }
        Insert: {
          archived_at?: string | null
          assunto?: string | null
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          chave: string
          corpo: string
          created_at?: string
          created_by?: string | null
          id?: string
          language_code?: string | null
          locale?: string
          nome: string
          parameter_mapping?: Json
          provider_template_name?: string | null
          provider_template_status?: string | null
          status?: Database["public"]["Enums"]["comunicacao_template_status"]
          updated_at?: string
          updated_by?: string | null
          variaveis?: Json
          versao?: number
        }
        Update: {
          archived_at?: string | null
          assunto?: string | null
          canal?: Database["public"]["Enums"]["comunicacao_canal"]
          chave?: string
          corpo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          language_code?: string | null
          locale?: string
          nome?: string
          parameter_mapping?: Json
          provider_template_name?: string | null
          provider_template_status?: string | null
          status?: Database["public"]["Enums"]["comunicacao_template_status"]
          updated_at?: string
          updated_by?: string | null
          variaveis?: Json
          versao?: number
        }
        Relationships: []
      }
      configuracoes_sistema: {
        Row: {
          cor_primaria: string | null
          cor_sidebar_bg: string | null
          cor_sidebar_primary: string | null
          id: string
          logo_url: string | null
          nome_empresa: string | null
          updated_at: string
        }
        Insert: {
          cor_primaria?: string | null
          cor_sidebar_bg?: string | null
          cor_sidebar_primary?: string | null
          id?: string
          logo_url?: string | null
          nome_empresa?: string | null
          updated_at?: string
        }
        Update: {
          cor_primaria?: string | null
          cor_sidebar_bg?: string | null
          cor_sidebar_primary?: string | null
          id?: string
          logo_url?: string | null
          nome_empresa?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      controle_qualidade: {
        Row: {
          aparencia: string | null
          concentracao: number | null
          contaminacao: string | null
          created_at: string
          data_analise: string
          id: string
          lote_id: string
          odor: string | null
          organization_id: string | null
          ph: number | null
          responsavel: string | null
          responsavel_id: string | null
          resultado: Database["public"]["Enums"]["resultado_cq"] | null
          seq: number
        }
        Insert: {
          aparencia?: string | null
          concentracao?: number | null
          contaminacao?: string | null
          created_at?: string
          data_analise?: string
          id?: string
          lote_id: string
          odor?: string | null
          organization_id?: string | null
          ph?: number | null
          responsavel?: string | null
          responsavel_id?: string | null
          resultado?: Database["public"]["Enums"]["resultado_cq"] | null
          seq?: number
        }
        Update: {
          aparencia?: string | null
          concentracao?: number | null
          contaminacao?: string | null
          created_at?: string
          data_analise?: string
          id?: string
          lote_id?: string
          odor?: string | null
          organization_id?: string | null
          ph?: number | null
          responsavel?: string | null
          responsavel_id?: string | null
          resultado?: Database["public"]["Enums"]["resultado_cq"] | null
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "controle_qualidade_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "controle_qualidade_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controle_qualidade_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "controle_qualidade_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "controle_qualidade_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controle_qualidade_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cq_parametros_referencia: {
        Row: {
          aparencia_esperada: string | null
          ativo: boolean
          concentracao_min_ufc_ml: number | null
          contaminacao_esperada: string | null
          created_at: string
          created_by: string | null
          id: string
          microrganismo_id: string
          observacoes: string | null
          odor_esperado: string | null
          ph_max: number | null
          ph_min: number | null
          produto_id: string | null
          updated_at: string
        }
        Insert: {
          aparencia_esperada?: string | null
          ativo?: boolean
          concentracao_min_ufc_ml?: number | null
          contaminacao_esperada?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          microrganismo_id: string
          observacoes?: string | null
          odor_esperado?: string | null
          ph_max?: number | null
          ph_min?: number | null
          produto_id?: string | null
          updated_at?: string
        }
        Update: {
          aparencia_esperada?: string | null
          ativo?: boolean
          concentracao_min_ufc_ml?: number | null
          contaminacao_esperada?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          microrganismo_id?: string
          observacoes?: string | null
          odor_esperado?: string | null
          ph_max?: number | null
          ph_min?: number | null
          produto_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cq_parametros_referencia_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cq_parametros_referencia_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "cq_parametros_referencia_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      culturas: {
        Row: {
          ativo: boolean
          created_at: string
          desativada_em: string | null
          desativada_por: string | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          desativada_em?: string | null
          desativada_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          desativada_em?: string | null
          desativada_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      customer_fiscal_profiles: {
        Row: {
          country_code: string | null
          cpf_cnpj: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          final_consumer: boolean
          fiscal_city: string | null
          fiscal_complement: string | null
          fiscal_email: string | null
          fiscal_municipality_ibge_code: string | null
          fiscal_neighborhood: string | null
          fiscal_number: string | null
          fiscal_phone: string | null
          fiscal_postal_code: string | null
          fiscal_state: string | null
          fiscal_street: string | null
          foreign_customer_indicator: boolean
          icms_taxpayer: boolean
          id: string
          legal_name: string | null
          municipal_registration: string | null
          nfe_readiness_checked_at: string | null
          nfe_readiness_pendencies: Json
          nfe_readiness_status: string
          person_type: string | null
          profile_status: string
          rural_producer_indicator: boolean
          state_registration: string | null
          state_registration_status: string | null
          taxpayer_indicator: string | null
          updated_at: string
          updated_by: string | null
          use_main_address: boolean
          validation_notes: string | null
        }
        Insert: {
          country_code?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          final_consumer?: boolean
          fiscal_city?: string | null
          fiscal_complement?: string | null
          fiscal_email?: string | null
          fiscal_municipality_ibge_code?: string | null
          fiscal_neighborhood?: string | null
          fiscal_number?: string | null
          fiscal_phone?: string | null
          fiscal_postal_code?: string | null
          fiscal_state?: string | null
          fiscal_street?: string | null
          foreign_customer_indicator?: boolean
          icms_taxpayer?: boolean
          id?: string
          legal_name?: string | null
          municipal_registration?: string | null
          nfe_readiness_checked_at?: string | null
          nfe_readiness_pendencies?: Json
          nfe_readiness_status?: string
          person_type?: string | null
          profile_status?: string
          rural_producer_indicator?: boolean
          state_registration?: string | null
          state_registration_status?: string | null
          taxpayer_indicator?: string | null
          updated_at?: string
          updated_by?: string | null
          use_main_address?: boolean
          validation_notes?: string | null
        }
        Update: {
          country_code?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          final_consumer?: boolean
          fiscal_city?: string | null
          fiscal_complement?: string | null
          fiscal_email?: string | null
          fiscal_municipality_ibge_code?: string | null
          fiscal_neighborhood?: string | null
          fiscal_number?: string | null
          fiscal_phone?: string | null
          fiscal_postal_code?: string | null
          fiscal_state?: string | null
          fiscal_street?: string | null
          foreign_customer_indicator?: boolean
          icms_taxpayer?: boolean
          id?: string
          legal_name?: string | null
          municipal_registration?: string | null
          nfe_readiness_checked_at?: string | null
          nfe_readiness_pendencies?: Json
          nfe_readiness_status?: string
          person_type?: string | null
          profile_status?: string
          rural_producer_indicator?: boolean
          state_registration?: string | null
          state_registration_status?: string | null
          taxpayer_indicator?: string | null
          updated_at?: string
          updated_by?: string | null
          use_main_address?: boolean
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_fiscal_profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      entrega_checklist: {
        Row: {
          concluido: boolean
          concluido_em: string | null
          concluido_por: string | null
          created_at: string
          entrega_id: string
          id: string
          item: string
          obrigatorio: boolean
          observacao: string | null
        }
        Insert: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          entrega_id: string
          id?: string
          item: string
          obrigatorio?: boolean
          observacao?: string | null
        }
        Update: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          entrega_id?: string
          id?: string
          item?: string
          obrigatorio?: boolean
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_checklist_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_checklist_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_checklist_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_checklist_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
        ]
      }
      entrega_comprovantes: {
        Row: {
          anexado_em: string | null
          anexado_por: string | null
          arquivo_mime: string | null
          arquivo_nome: string | null
          arquivo_path: string | null
          arquivo_url: string | null
          assinatura_capturada_em: string | null
          assinatura_coletada: boolean
          assinatura_digital_png_path: string | null
          assinatura_digital_svg: string | null
          assinatura_hash: string | null
          assinatura_ip: string | null
          assinatura_tipo: string | null
          assinatura_user_agent: string | null
          confirmado_em: string | null
          confirmado_por: string | null
          created_at: string
          data_assinatura: string | null
          entrega_id: string
          gerado_em: string
          gerado_por: string | null
          id: string
          metadata: Json
          numero_formulario: string
          observacoes: string | null
          possui_ressalvas: boolean
          qr_code_generated_at: string | null
          qr_code_path: string | null
          qr_code_payload: string | null
          recebedor_cargo: string | null
          recebedor_documento: string | null
          recebedor_nome: string | null
          recebedor_telefone: string | null
          ressalvas: string | null
          status: string
          tipo: string
          updated_at: string
          validation_expires_at: string | null
          validation_hash: string | null
          validation_public_enabled: boolean
          validation_token: string
          validation_url: string | null
        }
        Insert: {
          anexado_em?: string | null
          anexado_por?: string | null
          arquivo_mime?: string | null
          arquivo_nome?: string | null
          arquivo_path?: string | null
          arquivo_url?: string | null
          assinatura_capturada_em?: string | null
          assinatura_coletada?: boolean
          assinatura_digital_png_path?: string | null
          assinatura_digital_svg?: string | null
          assinatura_hash?: string | null
          assinatura_ip?: string | null
          assinatura_tipo?: string | null
          assinatura_user_agent?: string | null
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          data_assinatura?: string | null
          entrega_id: string
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          metadata?: Json
          numero_formulario: string
          observacoes?: string | null
          possui_ressalvas?: boolean
          qr_code_generated_at?: string | null
          qr_code_path?: string | null
          qr_code_payload?: string | null
          recebedor_cargo?: string | null
          recebedor_documento?: string | null
          recebedor_nome?: string | null
          recebedor_telefone?: string | null
          ressalvas?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          validation_expires_at?: string | null
          validation_hash?: string | null
          validation_public_enabled?: boolean
          validation_token?: string
          validation_url?: string | null
        }
        Update: {
          anexado_em?: string | null
          anexado_por?: string | null
          arquivo_mime?: string | null
          arquivo_nome?: string | null
          arquivo_path?: string | null
          arquivo_url?: string | null
          assinatura_capturada_em?: string | null
          assinatura_coletada?: boolean
          assinatura_digital_png_path?: string | null
          assinatura_digital_svg?: string | null
          assinatura_hash?: string | null
          assinatura_ip?: string | null
          assinatura_tipo?: string | null
          assinatura_user_agent?: string | null
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          data_assinatura?: string | null
          entrega_id?: string
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          metadata?: Json
          numero_formulario?: string
          observacoes?: string | null
          possui_ressalvas?: boolean
          qr_code_generated_at?: string | null
          qr_code_path?: string | null
          qr_code_payload?: string | null
          recebedor_cargo?: string | null
          recebedor_documento?: string | null
          recebedor_nome?: string | null
          recebedor_telefone?: string | null
          ressalvas?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          validation_expires_at?: string | null
          validation_hash?: string | null
          validation_public_enabled?: boolean
          validation_token?: string
          validation_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_comprovantes_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_comprovantes_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_comprovantes_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_comprovantes_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
        ]
      }
      entrega_conferencia_itens: {
        Row: {
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          embalagem_id: string | null
          entrega_id: string
          etiqueta_id: string | null
          id: string
          motivo: string | null
          quantidade: number
          status: string
          updated_at: string
        }
        Insert: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          embalagem_id?: string | null
          entrega_id: string
          etiqueta_id?: string | null
          id?: string
          motivo?: string | null
          quantidade?: number
          status?: string
          updated_at?: string
        }
        Update: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          embalagem_id?: string | null
          entrega_id?: string
          etiqueta_id?: string | null
          id?: string
          motivo?: string | null
          quantidade?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrega_conferencia_itens_embalagem_id_fkey"
            columns: ["embalagem_id"]
            isOneToOne: false
            referencedRelation: "estoque_embalagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_conferencia_itens_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_conferencia_itens_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_conferencia_itens_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_conferencia_itens_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_conferencia_itens_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "produto_etiquetas"
            referencedColumns: ["id"]
          },
        ]
      }
      entrega_documentos: {
        Row: {
          arquivo_path: string
          entrega_id: string
          id: string
          mime_type: string | null
          nome_arquivo: string
          tamanho_bytes: number | null
          tipo_documento: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          arquivo_path: string
          entrega_id: string
          id?: string
          mime_type?: string | null
          nome_arquivo: string
          tamanho_bytes?: number | null
          tipo_documento: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          arquivo_path?: string
          entrega_id?: string
          id?: string
          mime_type?: string | null
          nome_arquivo?: string
          tamanho_bytes?: number | null
          tipo_documento?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrega_documentos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_documentos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_documentos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_documentos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
        ]
      }
      entrega_etiquetas: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          desvinculado_em: string | null
          desvinculado_por: string | null
          entrega_id: string
          etiqueta_id: string
          id: string
          motivo_desvinculacao: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          desvinculado_em?: string | null
          desvinculado_por?: string | null
          entrega_id: string
          etiqueta_id: string
          id?: string
          motivo_desvinculacao?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          desvinculado_em?: string | null
          desvinculado_por?: string | null
          entrega_id?: string
          etiqueta_id?: string
          id?: string
          motivo_desvinculacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_etiquetas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_etiquetas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_etiquetas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_etiquetas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_etiquetas_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "produto_etiquetas"
            referencedColumns: ["id"]
          },
        ]
      }
      entrega_ocorrencias: {
        Row: {
          created_at: string
          descricao: string
          entrega_id: string
          gravidade: string
          id: string
          metadata: Json
          registrado_em: string
          registrado_por: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          descricao: string
          entrega_id: string
          gravidade?: string
          id?: string
          metadata?: Json
          registrado_em?: string
          registrado_por?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          descricao?: string
          entrega_id?: string
          gravidade?: string
          id?: string
          metadata?: Json
          registrado_em?: string
          registrado_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrega_ocorrencias_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_ocorrencias_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_ocorrencias_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_ocorrencias_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
        ]
      }
      entrega_reconciliacoes: {
        Row: {
          created_at: string
          entrega_id: string
          faturavel: boolean
          id: string
          idempotency_key: string | null
          itens_aceitos: number
          itens_recusados: number
          itens_total: number
          quantidade_aceita: number
          quantidade_recusada: number
          ratio_aceito: number
          reconciliado_em: string
          reconciliado_por: string | null
          request_fingerprint: string | null
          resumo: Json
          status: string
          termo_id: string | null
          termo_versao: number | null
          updated_at: string
          valor_faturavel_max: number | null
          valor_faturavel_metodo: Json | null
          valor_faturavel_origem: string | null
          volume_aceito: number
          volume_recusado: number
        }
        Insert: {
          created_at?: string
          entrega_id: string
          faturavel?: boolean
          id?: string
          idempotency_key?: string | null
          itens_aceitos?: number
          itens_recusados?: number
          itens_total?: number
          quantidade_aceita?: number
          quantidade_recusada?: number
          ratio_aceito?: number
          reconciliado_em?: string
          reconciliado_por?: string | null
          request_fingerprint?: string | null
          resumo?: Json
          status?: string
          termo_id?: string | null
          termo_versao?: number | null
          updated_at?: string
          valor_faturavel_max?: number | null
          valor_faturavel_metodo?: Json | null
          valor_faturavel_origem?: string | null
          volume_aceito?: number
          volume_recusado?: number
        }
        Update: {
          created_at?: string
          entrega_id?: string
          faturavel?: boolean
          id?: string
          idempotency_key?: string | null
          itens_aceitos?: number
          itens_recusados?: number
          itens_total?: number
          quantidade_aceita?: number
          quantidade_recusada?: number
          ratio_aceito?: number
          reconciliado_em?: string
          reconciliado_por?: string | null
          request_fingerprint?: string | null
          resumo?: Json
          status?: string
          termo_id?: string | null
          termo_versao?: number | null
          updated_at?: string
          valor_faturavel_max?: number | null
          valor_faturavel_metodo?: Json | null
          valor_faturavel_origem?: string | null
          volume_aceito?: number
          volume_recusado?: number
        }
        Relationships: [
          {
            foreignKeyName: "entrega_reconciliacoes_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_reconciliacoes_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_reconciliacoes_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_reconciliacoes_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_reconciliacoes_termo_id_fkey"
            columns: ["termo_id"]
            isOneToOne: false
            referencedRelation: "entrega_termos"
            referencedColumns: ["id"]
          },
        ]
      }
      entrega_termos: {
        Row: {
          assinado_em: string | null
          assinado_por: string | null
          assinatura_hash: string | null
          assinatura_origem: string | null
          assinatura_tipo: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          cobertura: string
          comprovante_id: string | null
          created_at: string
          created_by: string | null
          entrega_id: string
          id: string
          idempotency_key: string | null
          motivo_cancelamento: string | null
          pdf_gerado_em: string | null
          pdf_hash: string | null
          pdf_path: string | null
          recebedor_cargo: string | null
          recebedor_documento: string | null
          recebedor_nome: string | null
          recebedor_telefone: string | null
          request_fingerprint: string | null
          snapshot: Json
          snapshot_hash: string
          status: string
          substitui_termo_id: string | null
          template_versao: string
          updated_at: string
          versao: number
        }
        Insert: {
          assinado_em?: string | null
          assinado_por?: string | null
          assinatura_hash?: string | null
          assinatura_origem?: string | null
          assinatura_tipo?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          cobertura?: string
          comprovante_id?: string | null
          created_at?: string
          created_by?: string | null
          entrega_id: string
          id?: string
          idempotency_key?: string | null
          motivo_cancelamento?: string | null
          pdf_gerado_em?: string | null
          pdf_hash?: string | null
          pdf_path?: string | null
          recebedor_cargo?: string | null
          recebedor_documento?: string | null
          recebedor_nome?: string | null
          recebedor_telefone?: string | null
          request_fingerprint?: string | null
          snapshot: Json
          snapshot_hash: string
          status?: string
          substitui_termo_id?: string | null
          template_versao?: string
          updated_at?: string
          versao: number
        }
        Update: {
          assinado_em?: string | null
          assinado_por?: string | null
          assinatura_hash?: string | null
          assinatura_origem?: string | null
          assinatura_tipo?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          cobertura?: string
          comprovante_id?: string | null
          created_at?: string
          created_by?: string | null
          entrega_id?: string
          id?: string
          idempotency_key?: string | null
          motivo_cancelamento?: string | null
          pdf_gerado_em?: string | null
          pdf_hash?: string | null
          pdf_path?: string | null
          recebedor_cargo?: string | null
          recebedor_documento?: string | null
          recebedor_nome?: string | null
          recebedor_telefone?: string | null
          request_fingerprint?: string | null
          snapshot?: Json
          snapshot_hash?: string
          status?: string
          substitui_termo_id?: string | null
          template_versao?: string
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "entrega_termos_comprovante_id_fkey"
            columns: ["comprovante_id"]
            isOneToOne: false
            referencedRelation: "entrega_comprovantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_termos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_termos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_termos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_termos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entrega_termos_substitui_termo_id_fkey"
            columns: ["substitui_termo_id"]
            isOneToOne: false
            referencedRelation: "entrega_termos"
            referencedColumns: ["id"]
          },
        ]
      }
      entregas: {
        Row: {
          assinatura_digital_capturada_em: string | null
          assinatura_digital_capturada_por: string | null
          assinatura_obrigatoria: boolean
          assinatura_tipo: string | null
          billing_generated_at: string | null
          billing_generated_by: string | null
          cancelada_em: string | null
          cancelada_por: string | null
          cliente_id: string | null
          comprovante_anexado_em: string | null
          comprovante_anexado_por: string | null
          comprovante_entrega_obrigatorio: boolean
          comprovante_id: string | null
          comprovante_status: string
          confirmada_em: string | null
          confirmada_por: string | null
          confirmado_por: string | null
          created_at: string
          data_chegada_prevista: string | null
          data_saida: string | null
          destinatario_nome: string | null
          destinatario_telefone: string | null
          destinatario_whatsapp: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_cidade: string | null
          endereco_complemento: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          endereco_origem: string | null
          endereco_referencia: string | null
          endereco_uf: string | null
          entregue_em: string | null
          estoque_produto_id: string | null
          financial_status: string | null
          formulario_gerado_em: string | null
          formulario_gerado_por: string | null
          grupo_entrega_id: string | null
          hora_chegada_prevista: string | null
          hora_saida_prevista: string | null
          id: string
          lote_id: string | null
          motivo_cancelamento: string | null
          motorista: string | null
          motorista_documento: string | null
          motorista_telefone: string | null
          not_billable_reason: string | null
          observacoes_confirmacao: string | null
          ordem_servico_id: string | null
          ordem_servico_onfarm_id: string | null
          organization_id: string | null
          os_faturamento_base_id: string | null
          partner_order_id: string | null
          produto_id: string | null
          quantidade_entregue: number | null
          recebedor_cargo: string | null
          recebedor_documento: string | null
          recebedor_nome: string | null
          recebedor_telefone: string | null
          recebido_por_cargo: string | null
          recebido_por_documento: string | null
          recebido_por_nome: string | null
          recebimento_confirmado_em: string | null
          recebimento_confirmado_por: string | null
          receivable_id: string | null
          reentrega_origem_id: string | null
          separacao_confirmada_em: string | null
          separacao_confirmada_por: string | null
          separacao_status: string
          status: Database["public"]["Enums"]["status_entrega"]
          tipo_entrega: string
          updated_at: string
          validation_hash: string | null
          validation_token: string | null
          veiculo: string | null
          veiculo_placa: string | null
          veiculo_tipo: string | null
          volume_entregue_ml: number | null
        }
        Insert: {
          assinatura_digital_capturada_em?: string | null
          assinatura_digital_capturada_por?: string | null
          assinatura_obrigatoria?: boolean
          assinatura_tipo?: string | null
          billing_generated_at?: string | null
          billing_generated_by?: string | null
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_id?: string | null
          comprovante_anexado_em?: string | null
          comprovante_anexado_por?: string | null
          comprovante_entrega_obrigatorio?: boolean
          comprovante_id?: string | null
          comprovante_status?: string
          confirmada_em?: string | null
          confirmada_por?: string | null
          confirmado_por?: string | null
          created_at?: string
          data_chegada_prevista?: string | null
          data_saida?: string | null
          destinatario_nome?: string | null
          destinatario_telefone?: string | null
          destinatario_whatsapp?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_origem?: string | null
          endereco_referencia?: string | null
          endereco_uf?: string | null
          entregue_em?: string | null
          estoque_produto_id?: string | null
          financial_status?: string | null
          formulario_gerado_em?: string | null
          formulario_gerado_por?: string | null
          grupo_entrega_id?: string | null
          hora_chegada_prevista?: string | null
          hora_saida_prevista?: string | null
          id?: string
          lote_id?: string | null
          motivo_cancelamento?: string | null
          motorista?: string | null
          motorista_documento?: string | null
          motorista_telefone?: string | null
          not_billable_reason?: string | null
          observacoes_confirmacao?: string | null
          ordem_servico_id?: string | null
          ordem_servico_onfarm_id?: string | null
          organization_id?: string | null
          os_faturamento_base_id?: string | null
          partner_order_id?: string | null
          produto_id?: string | null
          quantidade_entregue?: number | null
          recebedor_cargo?: string | null
          recebedor_documento?: string | null
          recebedor_nome?: string | null
          recebedor_telefone?: string | null
          recebido_por_cargo?: string | null
          recebido_por_documento?: string | null
          recebido_por_nome?: string | null
          recebimento_confirmado_em?: string | null
          recebimento_confirmado_por?: string | null
          receivable_id?: string | null
          reentrega_origem_id?: string | null
          separacao_confirmada_em?: string | null
          separacao_confirmada_por?: string | null
          separacao_status?: string
          status?: Database["public"]["Enums"]["status_entrega"]
          tipo_entrega?: string
          updated_at?: string
          validation_hash?: string | null
          validation_token?: string | null
          veiculo?: string | null
          veiculo_placa?: string | null
          veiculo_tipo?: string | null
          volume_entregue_ml?: number | null
        }
        Update: {
          assinatura_digital_capturada_em?: string | null
          assinatura_digital_capturada_por?: string | null
          assinatura_obrigatoria?: boolean
          assinatura_tipo?: string | null
          billing_generated_at?: string | null
          billing_generated_by?: string | null
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_id?: string | null
          comprovante_anexado_em?: string | null
          comprovante_anexado_por?: string | null
          comprovante_entrega_obrigatorio?: boolean
          comprovante_id?: string | null
          comprovante_status?: string
          confirmada_em?: string | null
          confirmada_por?: string | null
          confirmado_por?: string | null
          created_at?: string
          data_chegada_prevista?: string | null
          data_saida?: string | null
          destinatario_nome?: string | null
          destinatario_telefone?: string | null
          destinatario_whatsapp?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_origem?: string | null
          endereco_referencia?: string | null
          endereco_uf?: string | null
          entregue_em?: string | null
          estoque_produto_id?: string | null
          financial_status?: string | null
          formulario_gerado_em?: string | null
          formulario_gerado_por?: string | null
          grupo_entrega_id?: string | null
          hora_chegada_prevista?: string | null
          hora_saida_prevista?: string | null
          id?: string
          lote_id?: string | null
          motivo_cancelamento?: string | null
          motorista?: string | null
          motorista_documento?: string | null
          motorista_telefone?: string | null
          not_billable_reason?: string | null
          observacoes_confirmacao?: string | null
          ordem_servico_id?: string | null
          ordem_servico_onfarm_id?: string | null
          organization_id?: string | null
          os_faturamento_base_id?: string | null
          partner_order_id?: string | null
          produto_id?: string | null
          quantidade_entregue?: number | null
          recebedor_cargo?: string | null
          recebedor_documento?: string | null
          recebedor_nome?: string | null
          recebedor_telefone?: string | null
          recebido_por_cargo?: string | null
          recebido_por_documento?: string | null
          recebido_por_nome?: string | null
          recebimento_confirmado_em?: string | null
          recebimento_confirmado_por?: string | null
          receivable_id?: string | null
          reentrega_origem_id?: string | null
          separacao_confirmada_em?: string | null
          separacao_confirmada_por?: string | null
          separacao_status?: string
          status?: Database["public"]["Enums"]["status_entrega"]
          tipo_entrega?: string
          updated_at?: string
          validation_hash?: string | null
          validation_token?: string | null
          veiculo?: string | null
          veiculo_placa?: string | null
          veiculo_tipo?: string | null
          volume_entregue_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entregas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_comprovante_id_fkey"
            columns: ["comprovante_id"]
            isOneToOne: false
            referencedRelation: "entrega_comprovantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "entregas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "entregas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "entregas_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_ordem_servico_onfarm_id_fkey"
            columns: ["ordem_servico_onfarm_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_fluxo_visita_tecnica"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "entregas_ordem_servico_onfarm_id_fkey"
            columns: ["ordem_servico_onfarm_id"]
            isOneToOne: false
            referencedRelation: "mv_fluxo_visita_tecnica"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "entregas_ordem_servico_onfarm_id_fkey"
            columns: ["ordem_servico_onfarm_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico_onfarm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_os_faturamento_base_id_fkey"
            columns: ["os_faturamento_base_id"]
            isOneToOne: false
            referencedRelation: "os_faturamento_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_reentrega_origem_id_fkey"
            columns: ["reentrega_origem_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entregas_reentrega_origem_id_fkey"
            columns: ["reentrega_origem_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_reentrega_origem_id_fkey"
            columns: ["reentrega_origem_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "entregas_reentrega_origem_id_fkey"
            columns: ["reentrega_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
        ]
      }
      envase: {
        Row: {
          created_at: string
          data_envase: string
          etiqueta_gerada: boolean
          etiqueta_gerada_em: string | null
          etiqueta_gerada_por: string | null
          etiqueta_id: string | null
          id: string
          lote_id: string
          operador: string | null
          organization_id: string | null
          quantidade: number
          tipo_embalagem: Database["public"]["Enums"]["tipo_embalagem"]
          volume_por_unidade: number
        }
        Insert: {
          created_at?: string
          data_envase?: string
          etiqueta_gerada?: boolean
          etiqueta_gerada_em?: string | null
          etiqueta_gerada_por?: string | null
          etiqueta_id?: string | null
          id?: string
          lote_id: string
          operador?: string | null
          organization_id?: string | null
          quantidade: number
          tipo_embalagem: Database["public"]["Enums"]["tipo_embalagem"]
          volume_por_unidade: number
        }
        Update: {
          created_at?: string
          data_envase?: string
          etiqueta_gerada?: boolean
          etiqueta_gerada_em?: string | null
          etiqueta_gerada_por?: string | null
          etiqueta_id?: string | null
          id?: string
          lote_id?: string
          operador?: string | null
          organization_id?: string | null
          quantidade?: number
          tipo_embalagem?: Database["public"]["Enums"]["tipo_embalagem"]
          volume_por_unidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "envase_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "produto_etiquetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envase_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "envase_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envase_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "envase_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "envase_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_embalagem_movimentacoes: {
        Row: {
          created_at: string
          destino: string | null
          embalagem_id: string
          entrega_id: string | null
          entrega_item_id: string | null
          id: string
          metadata: Json
          observacao: string | null
          origem: string | null
          status_anterior: string | null
          status_novo: string | null
          tipo_movimentacao: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          destino?: string | null
          embalagem_id: string
          entrega_id?: string | null
          entrega_item_id?: string | null
          id?: string
          metadata?: Json
          observacao?: string | null
          origem?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          tipo_movimentacao: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          destino?: string | null
          embalagem_id?: string
          entrega_id?: string | null
          entrega_item_id?: string | null
          id?: string
          metadata?: Json
          observacao?: string | null
          origem?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          tipo_movimentacao?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_embalagem_movimentacoes_embalagem_id_fkey"
            columns: ["embalagem_id"]
            isOneToOne: false
            referencedRelation: "estoque_embalagens"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_embalagens: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          cliente_id: string | null
          codigo_embalagem: string
          created_at: string
          criado_por: string | null
          descartado_em: string | null
          descartado_por: string | null
          entrada_estoque_em: string | null
          entrega_id: string | null
          entrega_item_id: string | null
          entregue_em: string | null
          entregue_por: string | null
          envase_id: string | null
          envase_item_id: string | null
          etiqueta_id: string | null
          fabricado_em: string | null
          fazenda_id: string | null
          id: string
          identificacao_local: string | null
          local_estoque: string | null
          lote_id: string
          metadata: Json
          motivo_cancelamento: string | null
          motivo_descarte: string | null
          produto_id: string | null
          quantidade: number
          reservado_em: string | null
          reservado_por: string | null
          separado_em: string | null
          separado_por: string | null
          status: string
          tipo_embalagem: string | null
          unidade: string
          updated_at: string
          validade_em: string | null
          volume: number
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cliente_id?: string | null
          codigo_embalagem: string
          created_at?: string
          criado_por?: string | null
          descartado_em?: string | null
          descartado_por?: string | null
          entrada_estoque_em?: string | null
          entrega_id?: string | null
          entrega_item_id?: string | null
          entregue_em?: string | null
          entregue_por?: string | null
          envase_id?: string | null
          envase_item_id?: string | null
          etiqueta_id?: string | null
          fabricado_em?: string | null
          fazenda_id?: string | null
          id?: string
          identificacao_local?: string | null
          local_estoque?: string | null
          lote_id: string
          metadata?: Json
          motivo_cancelamento?: string | null
          motivo_descarte?: string | null
          produto_id?: string | null
          quantidade?: number
          reservado_em?: string | null
          reservado_por?: string | null
          separado_em?: string | null
          separado_por?: string | null
          status?: string
          tipo_embalagem?: string | null
          unidade?: string
          updated_at?: string
          validade_em?: string | null
          volume: number
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cliente_id?: string | null
          codigo_embalagem?: string
          created_at?: string
          criado_por?: string | null
          descartado_em?: string | null
          descartado_por?: string | null
          entrada_estoque_em?: string | null
          entrega_id?: string | null
          entrega_item_id?: string | null
          entregue_em?: string | null
          entregue_por?: string | null
          envase_id?: string | null
          envase_item_id?: string | null
          etiqueta_id?: string | null
          fabricado_em?: string | null
          fazenda_id?: string | null
          id?: string
          identificacao_local?: string | null
          local_estoque?: string | null
          lote_id?: string
          metadata?: Json
          motivo_cancelamento?: string | null
          motivo_descarte?: string | null
          produto_id?: string | null
          quantidade?: number
          reservado_em?: string | null
          reservado_por?: string | null
          separado_em?: string | null
          separado_por?: string | null
          status?: string
          tipo_embalagem?: string | null
          unidade?: string
          updated_at?: string
          validade_em?: string | null
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_embalagens_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "produto_etiquetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_entrega"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_entrega"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_entrega"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_entrega"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_envase"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["envase_id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_envase"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "envase"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_envase"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["envase_id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_envase"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["envase_id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_fazenda"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_lote"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_lote"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_lote"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_lote"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "fk_estoque_embalagens_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_movimentacoes: {
        Row: {
          acao: string
          cliente_id: string | null
          created_at: string
          direcao: string | null
          estoque_produto_id: string
          id: string
          idempotency_key: string | null
          lote_id: string | null
          metadata: Json
          motivo: string | null
          movimentacao_origem_id: string | null
          observacao: string | null
          origem: string | null
          os_id: string | null
          os_tipo: string | null
          quantidade: number | null
          referencia_id: string | null
          referencia_tipo: string | null
          request_fingerprint: string | null
          reservado_anterior: number | null
          reservado_posterior: number | null
          saldo_anterior: number | null
          saldo_posterior: number | null
          status_anterior: string | null
          status_novo: string | null
          unidade: string | null
          usuario_id: string | null
          volume_anterior: number | null
          volume_posterior: number | null
        }
        Insert: {
          acao: string
          cliente_id?: string | null
          created_at?: string
          direcao?: string | null
          estoque_produto_id: string
          id?: string
          idempotency_key?: string | null
          lote_id?: string | null
          metadata?: Json
          motivo?: string | null
          movimentacao_origem_id?: string | null
          observacao?: string | null
          origem?: string | null
          os_id?: string | null
          os_tipo?: string | null
          quantidade?: number | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          request_fingerprint?: string | null
          reservado_anterior?: number | null
          reservado_posterior?: number | null
          saldo_anterior?: number | null
          saldo_posterior?: number | null
          status_anterior?: string | null
          status_novo?: string | null
          unidade?: string | null
          usuario_id?: string | null
          volume_anterior?: number | null
          volume_posterior?: number | null
        }
        Update: {
          acao?: string
          cliente_id?: string | null
          created_at?: string
          direcao?: string | null
          estoque_produto_id?: string
          id?: string
          idempotency_key?: string | null
          lote_id?: string | null
          metadata?: Json
          motivo?: string | null
          movimentacao_origem_id?: string | null
          observacao?: string | null
          origem?: string | null
          os_id?: string | null
          os_tipo?: string | null
          quantidade?: number | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          request_fingerprint?: string | null
          reservado_anterior?: number | null
          reservado_posterior?: number | null
          saldo_anterior?: number | null
          saldo_posterior?: number | null
          status_anterior?: string | null
          status_novo?: string | null
          unidade?: string | null
          usuario_id?: string | null
          volume_anterior?: number | null
          volume_posterior?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_mov_origem_fkey"
            columns: ["movimentacao_origem_id"]
            isOneToOne: false
            referencedRelation: "estoque_movimentacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_mov_origem_fkey"
            columns: ["movimentacao_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_movimentacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["estoque_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["estoque_reservado_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "estoque_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["estoque_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["estoque_reservado_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_estoque_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["estoque_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["estoque_reservado_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["lote_id"]
          },
        ]
      }
      estoque_movimentacoes_orfaos_backup: {
        Row: {
          acao: string | null
          arquivado_em: string
          cliente_id: string | null
          created_at: string | null
          estoque_produto_id: string | null
          id: string
          lote_id: string | null
          migracao_ref: string | null
          motivo: string
          observacao: string | null
          os_id: string | null
          os_tipo: string | null
          quantidade: number | null
          retencao_ate: string | null
          snapshot_hash: string | null
          status_anterior: string | null
          status_novo: string | null
          usuario_id: string | null
        }
        Insert: {
          acao?: string | null
          arquivado_em?: string
          cliente_id?: string | null
          created_at?: string | null
          estoque_produto_id?: string | null
          id: string
          lote_id?: string | null
          migracao_ref?: string | null
          motivo?: string
          observacao?: string | null
          os_id?: string | null
          os_tipo?: string | null
          quantidade?: number | null
          retencao_ate?: string | null
          snapshot_hash?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string | null
          arquivado_em?: string
          cliente_id?: string | null
          created_at?: string | null
          estoque_produto_id?: string | null
          id?: string
          lote_id?: string | null
          migracao_ref?: string | null
          motivo?: string
          observacao?: string | null
          os_id?: string | null
          os_tipo?: string | null
          quantidade?: number | null
          retencao_ate?: string | null
          snapshot_hash?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      estoque_politicas: {
        Row: {
          created_at: string
          id: string
          limite_ajuste_sem_aprovacao: number
          singleton: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          limite_ajuste_sem_aprovacao?: number
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          limite_ajuste_sem_aprovacao?: number
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      estoque_produto: {
        Row: {
          created_at: string
          envase_id: string | null
          expedido_em: string | null
          expedido_por: string | null
          id: string
          lote_id: string
          microrganismo_id: string | null
          observacao_reserva: string | null
          produto_id: string | null
          quantidade: number | null
          quantidade_reservada: number | null
          reservado_em: string | null
          reservado_para_cliente_id: string | null
          reservado_para_os_id: string | null
          reservado_para_os_tipo: string | null
          reservado_para_partner_id: string | null
          reservado_para_partner_order_id: string | null
          reservado_por: string | null
          status: Database["public"]["Enums"]["status_estoque"]
          updated_at: string
          validade: string | null
          volume_total: number | null
        }
        Insert: {
          created_at?: string
          envase_id?: string | null
          expedido_em?: string | null
          expedido_por?: string | null
          id?: string
          lote_id: string
          microrganismo_id?: string | null
          observacao_reserva?: string | null
          produto_id?: string | null
          quantidade?: number | null
          quantidade_reservada?: number | null
          reservado_em?: string | null
          reservado_para_cliente_id?: string | null
          reservado_para_os_id?: string | null
          reservado_para_os_tipo?: string | null
          reservado_para_partner_id?: string | null
          reservado_para_partner_order_id?: string | null
          reservado_por?: string | null
          status?: Database["public"]["Enums"]["status_estoque"]
          updated_at?: string
          validade?: string | null
          volume_total?: number | null
        }
        Update: {
          created_at?: string
          envase_id?: string | null
          expedido_em?: string | null
          expedido_por?: string | null
          id?: string
          lote_id?: string
          microrganismo_id?: string | null
          observacao_reserva?: string | null
          produto_id?: string | null
          quantidade?: number | null
          quantidade_reservada?: number | null
          reservado_em?: string | null
          reservado_para_cliente_id?: string | null
          reservado_para_os_id?: string | null
          reservado_para_os_tipo?: string | null
          reservado_para_partner_id?: string | null
          reservado_para_partner_order_id?: string | null
          reservado_por?: string | null
          status?: Database["public"]["Enums"]["status_estoque"]
          updated_at?: string
          validade?: string | null
          volume_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_produto_envase_id_fkey"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["envase_id"]
          },
          {
            foreignKeyName: "estoque_produto_envase_id_fkey"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "envase"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_envase_id_fkey"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["envase_id"]
          },
          {
            foreignKeyName: "estoque_produto_envase_id_fkey"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["envase_id"]
          },
          {
            foreignKeyName: "estoque_produto_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "estoque_produto_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "estoque_produto_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "estoque_produto_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "estoque_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_cliente_id_fkey"
            columns: ["reservado_para_cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_partner_id_fkey"
            columns: ["reservado_para_partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_partner_id_fkey"
            columns: ["reservado_para_partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_partner_id_fkey"
            columns: ["reservado_para_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_partner_id_fkey"
            columns: ["reservado_para_partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_partner_id_fkey"
            columns: ["reservado_para_partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_partner_id_fkey"
            columns: ["reservado_para_partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_partner_id_fkey"
            columns: ["reservado_para_partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_partner_order_id_fkey"
            columns: ["reservado_para_partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      etiqueta_templates: {
        Row: {
          altura_mm: number
          ativo: boolean
          campos: Json
          codigo: string
          colunas: number
          created_at: string
          densidade_dpi: number
          id: string
          largura_mm: number
          linhas: number
          margem_base_mm: number
          margem_direita_mm: number
          margem_esquerda_mm: number
          margem_topo_mm: number
          midia: string
          nome: string
          orientacao: string
          updated_at: string
          versao: number
        }
        Insert: {
          altura_mm: number
          ativo?: boolean
          campos?: Json
          codigo: string
          colunas?: number
          created_at?: string
          densidade_dpi?: number
          id?: string
          largura_mm: number
          linhas?: number
          margem_base_mm?: number
          margem_direita_mm?: number
          margem_esquerda_mm?: number
          margem_topo_mm?: number
          midia?: string
          nome: string
          orientacao?: string
          updated_at?: string
          versao?: number
        }
        Update: {
          altura_mm?: number
          ativo?: boolean
          campos?: Json
          codigo?: string
          colunas?: number
          created_at?: string
          densidade_dpi?: number
          id?: string
          largura_mm?: number
          linhas?: number
          margem_base_mm?: number
          margem_direita_mm?: number
          margem_esquerda_mm?: number
          margem_topo_mm?: number
          midia?: string
          nome?: string
          orientacao?: string
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      executivo_relatorio_eventos: {
        Row: {
          created_at: string
          descricao: string | null
          evento: string
          id: string
          metadata: Json
          relatorio_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          evento: string
          id?: string
          metadata?: Json
          relatorio_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          evento?: string
          id?: string
          metadata?: Json
          relatorio_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "executivo_relatorio_eventos_relatorio_id_fkey"
            columns: ["relatorio_id"]
            isOneToOne: false
            referencedRelation: "executivo_relatorios"
            referencedColumns: ["id"]
          },
        ]
      }
      executivo_relatorios: {
        Row: {
          alertas: Json
          ativo: boolean
          atualizado_em: string
          filtros: Json
          gargalos: Json
          gerado_em: string
          gerado_por: string | null
          hash_conteudo: string | null
          id: string
          indicadores: Json
          metadata: Json
          observacoes: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          plano_acao: Json
          ranking_clientes: Json
          ranking_fazendas: Json
          resumo: Json
          status: string
          tipo: string
          titulo: string
          versao: number
        }
        Insert: {
          alertas?: Json
          ativo?: boolean
          atualizado_em?: string
          filtros?: Json
          gargalos?: Json
          gerado_em?: string
          gerado_por?: string | null
          hash_conteudo?: string | null
          id?: string
          indicadores?: Json
          metadata?: Json
          observacoes?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          plano_acao?: Json
          ranking_clientes?: Json
          ranking_fazendas?: Json
          resumo?: Json
          status?: string
          tipo: string
          titulo: string
          versao?: number
        }
        Update: {
          alertas?: Json
          ativo?: boolean
          atualizado_em?: string
          filtros?: Json
          gargalos?: Json
          gerado_em?: string
          gerado_por?: string | null
          hash_conteudo?: string | null
          id?: string
          indicadores?: Json
          metadata?: Json
          observacoes?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          plano_acao?: Json
          ranking_clientes?: Json
          ranking_fazendas?: Json
          resumo?: Json
          status?: string
          tipo?: string
          titulo?: string
          versao?: number
        }
        Relationships: []
      }
      executivo_user_preferences: {
        Row: {
          cards_config: Json
          cliente_id: string | null
          created_at: string
          fazenda_id: string | null
          filtros_config: Json
          id: string
          layout_config: Json
          periodo_padrao: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cards_config?: Json
          cliente_id?: string | null
          created_at?: string
          fazenda_id?: string | null
          filtros_config?: Json
          id?: string
          layout_config?: Json
          periodo_padrao?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cards_config?: Json
          cliente_id?: string | null
          created_at?: string
          fazenda_id?: string | null
          filtros_config?: Json
          id?: string
          layout_config?: Json
          periodo_padrao?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fazendas: {
        Row: {
          area_produtiva: number | null
          area_total: number | null
          ativo: boolean
          car: string | null
          cliente_id: string
          codigo_referencia: string | null
          consultor_responsavel_id: string | null
          created_at: string
          distancia_sede_km: number | null
          endereco_acesso: string | null
          estado: string | null
          id: string
          inscricao_estadual_produtor: string | null
          latitude: number | null
          longitude: number | null
          municipio: string | null
          nirf: string | null
          nome: string
          organization_id: string | null
          ponto_referencia: string | null
          responsavel_local_nome: string | null
          responsavel_local_telefone: string | null
          tipo_exploracao: string | null
          updated_at: string
        }
        Insert: {
          area_produtiva?: number | null
          area_total?: number | null
          ativo?: boolean
          car?: string | null
          cliente_id: string
          codigo_referencia?: string | null
          consultor_responsavel_id?: string | null
          created_at?: string
          distancia_sede_km?: number | null
          endereco_acesso?: string | null
          estado?: string | null
          id?: string
          inscricao_estadual_produtor?: string | null
          latitude?: number | null
          longitude?: number | null
          municipio?: string | null
          nirf?: string | null
          nome: string
          organization_id?: string | null
          ponto_referencia?: string | null
          responsavel_local_nome?: string | null
          responsavel_local_telefone?: string | null
          tipo_exploracao?: string | null
          updated_at?: string
        }
        Update: {
          area_produtiva?: number | null
          area_total?: number | null
          ativo?: boolean
          car?: string | null
          cliente_id?: string
          codigo_referencia?: string | null
          consultor_responsavel_id?: string | null
          created_at?: string
          distancia_sede_km?: number | null
          endereco_acesso?: string | null
          estado?: string | null
          id?: string
          inscricao_estadual_produtor?: string | null
          latitude?: number | null
          longitude?: number | null
          municipio?: string | null
          nirf?: string | null
          nome?: string
          organization_id?: string | null
          ponto_referencia?: string | null
          responsavel_local_nome?: string | null
          responsavel_local_telefone?: string | null
          tipo_exploracao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fazendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fazendas_consultor_responsavel_id_fkey"
            columns: ["consultor_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fazendas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ficha_tecnica_versoes: {
        Row: {
          campo: string
          conteudo_anterior: string | null
          conteudo_novo: string | null
          criado_em: string
          criado_por: string | null
          entidade_id: string
          entidade_tipo: string
          id: string
          job_id: string | null
          modelo_ia: string | null
          observacao: string | null
          origem: string
          profile_id: string | null
          prompt_hash: string | null
          revisado_em: string | null
          revisado_por: string | null
          status: string
        }
        Insert: {
          campo: string
          conteudo_anterior?: string | null
          conteudo_novo?: string | null
          criado_em?: string
          criado_por?: string | null
          entidade_id: string
          entidade_tipo: string
          id?: string
          job_id?: string | null
          modelo_ia?: string | null
          observacao?: string | null
          origem: string
          profile_id?: string | null
          prompt_hash?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
        }
        Update: {
          campo?: string
          conteudo_anterior?: string | null
          conteudo_novo?: string | null
          criado_em?: string
          criado_por?: string | null
          entidade_id?: string
          entidade_tipo?: string
          id?: string
          job_id?: string | null
          modelo_ia?: string | null
          observacao?: string | null
          origem?: string
          profile_id?: string | null
          prompt_hash?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
        }
        Relationships: []
      }
      financial_audit_log: {
        Row: {
          action: string
          entity_id: string
          entity_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          performed_at: string
          performed_by: string | null
          reason: string | null
        }
        Insert: {
          action: string
          entity_id: string
          entity_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      financial_categories: {
        Row: {
          active: boolean
          created_at: string
          dre_group: string | null
          id: string
          name: string
          parent_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dre_group?: string | null
          id?: string
          name: string
          parent_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dre_group?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_cost_centers: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_documents: {
        Row: {
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          document_origin: string | null
          document_type: string
          environment: string | null
          file_category: string | null
          file_name: string
          file_size: number | null
          fiscal_event_id: string | null
          fiscal_invoice_id: string | null
          id: string
          mime_type: string | null
          organization_id: string | null
          owner_id: string
          owner_type: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string
          version_number: number | null
        }
        Insert: {
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_origin?: string | null
          document_type: string
          environment?: string | null
          file_category?: string | null
          file_name: string
          file_size?: number | null
          fiscal_event_id?: string | null
          fiscal_invoice_id?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string | null
          owner_id: string
          owner_type: string
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
          version_number?: number | null
        }
        Update: {
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_origin?: string | null
          document_type?: string
          environment?: string | null
          file_category?: string | null
          file_name?: string
          file_size?: number | null
          fiscal_event_id?: string | null
          fiscal_invoice_id?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string | null
          owner_id?: string
          owner_type?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_documents_fiscal_event_id_fkey"
            columns: ["fiscal_event_id"]
            isOneToOne: false
            referencedRelation: "fiscal_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_fiscal_event_id_fkey"
            columns: ["fiscal_event_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_sefaz_event_state"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "financial_documents_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "financial_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_governance_audit_log: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          partner_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          partner_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          partner_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      financial_governance_rules: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          por_credito: boolean
          por_inadimplencia: boolean
          por_score_critico: boolean
          regra: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          por_credito?: boolean
          por_inadimplencia?: boolean
          por_score_critico?: boolean
          regra: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          por_credito?: boolean
          por_inadimplencia?: boolean
          por_score_critico?: boolean
          regra?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_inconsistency_alerts: {
        Row: {
          acked_at: string | null
          acked_by: string | null
          by_severity: Json
          id: string
          notes: string | null
          run_at: string
          sample: Json
          status: string
          total_count: number
        }
        Insert: {
          acked_at?: string | null
          acked_by?: string | null
          by_severity?: Json
          id?: string
          notes?: string | null
          run_at?: string
          sample?: Json
          status?: string
          total_count?: number
        }
        Update: {
          acked_at?: string | null
          acked_by?: string | null
          by_severity?: Json
          id?: string
          notes?: string | null
          run_at?: string
          sample?: Json
          status?: string
          total_count?: number
        }
        Relationships: []
      }
      financial_receipts: {
        Row: {
          amount: number
          authenticity_code: string
          cancel_reason: string | null
          canceled_at: string | null
          canceled_by: string | null
          customer_id: string | null
          description: string | null
          id: string
          issued_at: string
          issued_by: string
          organization_id: string | null
          payment_date: string
          payment_id: string
          payment_method_id: string | null
          public_verification_token: string
          qr_code_enabled: boolean
          receipt_number: string
          receipt_seq: number
          receipt_year: number
          receivable_id: string | null
          receivable_payment_id: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
        }
        Insert: {
          amount: number
          authenticity_code: string
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          issued_at?: string
          issued_by: string
          organization_id?: string | null
          payment_date: string
          payment_id: string
          payment_method_id?: string | null
          public_verification_token?: string
          qr_code_enabled?: boolean
          receipt_number: string
          receipt_seq: number
          receipt_year: number
          receivable_id?: string | null
          receivable_payment_id?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Update: {
          amount?: number
          authenticity_code?: string
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          issued_at?: string
          issued_by?: string
          organization_id?: string | null
          payment_date?: string
          payment_id?: string
          payment_method_id?: string | null
          public_verification_token?: string
          qr_code_enabled?: boolean
          receipt_number?: string
          receipt_seq?: number
          receipt_year?: number
          receivable_id?: string | null
          receivable_payment_id?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "receivable_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_receipts_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_receipts_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_report_exports: {
        Row: {
          error_message: string | null
          file_format: string
          filters: Json
          format: string
          generated_at: string
          generated_by: string
          id: string
          organization_id: string | null
          report_title: string
          report_type: string
          row_count: number | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
        }
        Insert: {
          error_message?: string | null
          file_format: string
          filters?: Json
          format: string
          generated_at?: string
          generated_by: string
          id?: string
          organization_id?: string | null
          report_title: string
          report_type: string
          row_count?: number | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Update: {
          error_message?: string | null
          file_format?: string
          filters?: Json
          format?: string
          generated_at?: string
          generated_by?: string
          id?: string
          organization_id?: string | null
          report_title?: string
          report_type?: string
          row_count?: number | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_report_exports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_settings: {
        Row: {
          id: boolean
          require_receipt_on_payable_payment: boolean
          require_receipt_on_receivable_payment: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          require_receipt_on_payable_payment?: boolean
          require_receipt_on_receivable_payment?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          require_receipt_on_payable_payment?: boolean
          require_receipt_on_receivable_payment?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fiscal_audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      fiscal_calculation_runs: {
        Row: {
          created_at: string
          created_by: string | null
          engine_version: string
          fiscal_invoice_id: string
          id: string
          idempotency_key: string
          result: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          engine_version?: string
          fiscal_invoice_id: string
          id?: string
          idempotency_key: string
          result?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          engine_version?: string
          fiscal_invoice_id?: string
          id?: string
          idempotency_key?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_calculation_runs_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_calculation_runs_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
        ]
      }
      fiscal_certificate_material: {
        Row: {
          certificate_id: string
          created_at: string
          key_version: number
          material_algorithm: string
          material_format: string
          material_iv: string
          object_path: string
        }
        Insert: {
          certificate_id: string
          created_at?: string
          key_version?: number
          material_algorithm?: string
          material_format?: string
          material_iv: string
          object_path: string
        }
        Update: {
          certificate_id?: string
          created_at?: string
          key_version?: number
          material_algorithm?: string
          material_format?: string
          material_iv?: string
          object_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_certificate_material_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: true
            referencedRelation: "fiscal_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_certificate_material_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: true
            referencedRelation: "v_fiscal_certificate_readiness"
            referencedColumns: ["certificate_id"]
          },
        ]
      }
      fiscal_certificates: {
        Row: {
          company_settings_id: string
          created_at: string
          created_by: string | null
          display_name: string
          environment: string
          fingerprint_sha256: string | null
          id: string
          is_active: boolean
          issuer_name: string | null
          key_usage: string[] | null
          native_alias: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          serial_number: string | null
          source_type: string
          status: string
          subject_name: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          version: number
        }
        Insert: {
          company_settings_id: string
          created_at?: string
          created_by?: string | null
          display_name: string
          environment?: string
          fingerprint_sha256?: string | null
          id?: string
          is_active?: boolean
          issuer_name?: string | null
          key_usage?: string[] | null
          native_alias?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          serial_number?: string | null
          source_type: string
          status?: string
          subject_name?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version?: number
        }
        Update: {
          company_settings_id?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          environment?: string
          fingerprint_sha256?: string | null
          id?: string
          is_active?: boolean
          issuer_name?: string | null
          key_usage?: string[] | null
          native_alias?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          serial_number?: string | null
          source_type?: string
          status?: string
          subject_name?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_certificates_company_settings_id_fkey"
            columns: ["company_settings_id"]
            isOneToOne: false
            referencedRelation: "company_fiscal_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_certificates_company_settings_id_fkey"
            columns: ["company_settings_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_company_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_certificates_company_settings_id_fkey"
            columns: ["company_settings_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_nfe_emitter_readiness"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_document_series: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          current_number: number
          document_model: string
          environment_code: string
          id: string
          notes: string | null
          series: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          current_number?: number
          document_model?: string
          environment_code: string
          id?: string
          notes?: string | null
          series: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_number?: number
          document_model?: string
          environment_code?: string
          id?: string
          notes?: string | null
          series?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_document_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_fiscal_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_document_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_company_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_document_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_nfe_emitter_readiness"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_environment_marker: {
        Row: {
          created_at: string
          environment_label: string
          id: boolean
          production_emission_allowed: boolean
          project_ref: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment_label: string
          id?: boolean
          production_emission_allowed?: boolean
          project_ref: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment_label?: string
          id?: boolean
          production_emission_allowed?: boolean
          project_ref?: string
          updated_at?: string
        }
        Relationships: []
      }
      fiscal_events: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          event_source: string
          event_type: string
          fiscal_invoice_id: string
          id: string
          idempotency_key: string | null
          notes: string | null
          organization_id: string | null
          payload_fingerprint: string | null
          performed_by: string | null
          provider_event_id: string | null
          related_event_id: string | null
          request_snapshot: Json | null
          response_snapshot: Json | null
          sefaz_access_key: string | null
          sefaz_c_stat: string | null
          sefaz_event_code: string | null
          sefaz_n_prot: string | null
          sefaz_reason: string | null
          sefaz_seq_evento: number | null
          sefaz_transmission_id: string | null
          signed_xml_path: string | null
          signed_xml_sha256: string | null
          status_after: string | null
          status_before: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_source?: string
          event_type: string
          fiscal_invoice_id: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          organization_id?: string | null
          payload_fingerprint?: string | null
          performed_by?: string | null
          provider_event_id?: string | null
          related_event_id?: string | null
          request_snapshot?: Json | null
          response_snapshot?: Json | null
          sefaz_access_key?: string | null
          sefaz_c_stat?: string | null
          sefaz_event_code?: string | null
          sefaz_n_prot?: string | null
          sefaz_reason?: string | null
          sefaz_seq_evento?: number | null
          sefaz_transmission_id?: string | null
          signed_xml_path?: string | null
          signed_xml_sha256?: string | null
          status_after?: string | null
          status_before?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_source?: string
          event_type?: string
          fiscal_invoice_id?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          organization_id?: string | null
          payload_fingerprint?: string | null
          performed_by?: string | null
          provider_event_id?: string | null
          related_event_id?: string | null
          request_snapshot?: Json | null
          response_snapshot?: Json | null
          sefaz_access_key?: string | null
          sefaz_c_stat?: string | null
          sefaz_event_code?: string | null
          sefaz_n_prot?: string | null
          sefaz_reason?: string | null
          sefaz_seq_evento?: number | null
          sefaz_transmission_id?: string | null
          signed_xml_path?: string | null
          signed_xml_sha256?: string | null
          status_after?: string | null
          status_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_events_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_events_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_events_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "fiscal_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_events_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_sefaz_event_state"
            referencedColumns: ["event_id"]
          },
        ]
      }
      fiscal_idempotency_keys: {
        Row: {
          completed_at: string | null
          created_at: string
          environment: string | null
          expires_at: string | null
          fiscal_invoice_id: string | null
          id: string
          idempotency_key: string
          locked_at: string | null
          operation_type: string
          provider: string | null
          request_hash: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          environment?: string | null
          expires_at?: string | null
          fiscal_invoice_id?: string | null
          id?: string
          idempotency_key: string
          locked_at?: string | null
          operation_type: string
          provider?: string | null
          request_hash?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          environment?: string | null
          expires_at?: string | null
          fiscal_invoice_id?: string | null
          id?: string
          idempotency_key?: string
          locked_at?: string | null
          operation_type?: string
          provider?: string | null
          request_hash?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_idempotency_keys_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_idempotency_keys_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
        ]
      }
      fiscal_invoice_item_references: {
        Row: {
          created_at: string
          created_by: string | null
          fiscal_invoice_item_id: string
          id: string
          notes: string | null
          reference_type: string
          referenced_access_key: string | null
          referenced_item_id: string | null
          referenced_item_sequence: number | null
          referenced_quantity: number | null
          referenced_value: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fiscal_invoice_item_id: string
          id?: string
          notes?: string | null
          reference_type: string
          referenced_access_key?: string | null
          referenced_item_id?: string | null
          referenced_item_sequence?: number | null
          referenced_quantity?: number | null
          referenced_value?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fiscal_invoice_item_id?: string
          id?: string
          notes?: string | null
          reference_type?: string
          referenced_access_key?: string | null
          referenced_item_id?: string | null
          referenced_item_sequence?: number | null
          referenced_quantity?: number | null
          referenced_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_invoice_item_references_fiscal_invoice_item_id_fkey"
            columns: ["fiscal_invoice_item_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoice_item_references_referenced_item_id_fkey"
            columns: ["referenced_item_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoice_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_invoice_items: {
        Row: {
          cest_snapshot: string | null
          cfop_snapshot: string | null
          commercial_unit: string | null
          created_at: string
          csosn_snapshot: string | null
          cst_icms_snapshot: string | null
          description: string | null
          discount_value: number | null
          entrega_id: string | null
          fiscal_invoice_id: string
          fiscal_profile_snapshot: Json | null
          freight_apportionment_value: number | null
          freight_value: number | null
          gross_value: number | null
          id: string
          insurance_value: number | null
          item_kind: string
          item_sequence: number
          lote_id: string | null
          ncm_snapshot: string | null
          net_value: number | null
          origem_snapshot: string | null
          other_value: number | null
          partner_order_item_id: string | null
          quantity: number | null
          source_item_id: string | null
          source_item_type: string | null
          tax_input_snapshot: Json
          tax_snapshot: Json | null
          taxable_quantity: number | null
          taxable_unit: string | null
          unit_value: number | null
          updated_at: string
        }
        Insert: {
          cest_snapshot?: string | null
          cfop_snapshot?: string | null
          commercial_unit?: string | null
          created_at?: string
          csosn_snapshot?: string | null
          cst_icms_snapshot?: string | null
          description?: string | null
          discount_value?: number | null
          entrega_id?: string | null
          fiscal_invoice_id: string
          fiscal_profile_snapshot?: Json | null
          freight_apportionment_value?: number | null
          freight_value?: number | null
          gross_value?: number | null
          id?: string
          insurance_value?: number | null
          item_kind: string
          item_sequence: number
          lote_id?: string | null
          ncm_snapshot?: string | null
          net_value?: number | null
          origem_snapshot?: string | null
          other_value?: number | null
          partner_order_item_id?: string | null
          quantity?: number | null
          source_item_id?: string | null
          source_item_type?: string | null
          tax_input_snapshot?: Json
          tax_snapshot?: Json | null
          taxable_quantity?: number | null
          taxable_unit?: string | null
          unit_value?: number | null
          updated_at?: string
        }
        Update: {
          cest_snapshot?: string | null
          cfop_snapshot?: string | null
          commercial_unit?: string | null
          created_at?: string
          csosn_snapshot?: string | null
          cst_icms_snapshot?: string | null
          description?: string | null
          discount_value?: number | null
          entrega_id?: string | null
          fiscal_invoice_id?: string
          fiscal_profile_snapshot?: Json | null
          freight_apportionment_value?: number | null
          freight_value?: number | null
          gross_value?: number | null
          id?: string
          insurance_value?: number | null
          item_kind?: string
          item_sequence?: number
          lote_id?: string | null
          ncm_snapshot?: string | null
          net_value?: number | null
          origem_snapshot?: string | null
          other_value?: number | null
          partner_order_item_id?: string | null
          quantity?: number | null
          source_item_id?: string | null
          source_item_type?: string | null
          tax_input_snapshot?: Json
          tax_snapshot?: Json | null
          taxable_quantity?: number | null
          taxable_unit?: string | null
          unit_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_invoice_items_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "fiscal_invoice_items_partner_order_item_id_fkey"
            columns: ["partner_order_item_id"]
            isOneToOne: false
            referencedRelation: "partner_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_invoice_references: {
        Row: {
          created_at: string
          created_by: string | null
          fiscal_invoice_id: string
          id: string
          notes: string | null
          referenced_access_key: string | null
          referenced_invoice_id: string | null
          relation_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fiscal_invoice_id: string
          id?: string
          notes?: string | null
          referenced_access_key?: string | null
          referenced_invoice_id?: string | null
          relation_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fiscal_invoice_id?: string
          id?: string
          notes?: string | null
          referenced_access_key?: string | null
          referenced_invoice_id?: string | null
          relation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_invoice_references_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoice_references_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_invoice_references_referenced_invoice_id_fkey"
            columns: ["referenced_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoice_references_referenced_invoice_id_fkey"
            columns: ["referenced_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
        ]
      }
      fiscal_invoices: {
        Row: {
          access_key: string | null
          authorized_at: string | null
          billing_scope: string | null
          cancel_reason: string | null
          canceled_at: string | null
          company_cnpj: string | null
          company_settings_id: string
          company_snapshot: Json | null
          created_at: string
          created_by: string
          customer_id: string | null
          customer_snapshot: Json | null
          danfe_document_id: string | null
          debtor_customer_id: string | null
          debtor_partner_id: string | null
          debtor_type: string | null
          delivery_id: string | null
          direction: string | null
          document_model: string | null
          document_origin: string | null
          draft_version: number
          environment: string | null
          fin_nfe: number | null
          fiscal_operation_type: string | null
          fiscal_profile_snapshot: Json
          fiscal_totals_snapshot: Json | null
          homologation_validation_at: string | null
          homologation_validation_status: string
          homologation_validation_summary: Json
          icms_amount: number | null
          icms_due: boolean | null
          id: string
          idempotency_key: string | null
          invoice_number: string | null
          invoice_type: string
          issue_date: string | null
          legal_basis: string | null
          legal_effective_date: string | null
          legal_version: string | null
          locked_at: string | null
          locked_by: string | null
          nature_operation: string | null
          normalized_status: string | null
          notes: string | null
          organization_id: string | null
          original_recipient_snapshot: Json | null
          parent_invoice_id: string | null
          partner_order_id: string | null
          payload_schema_version: number | null
          provider: string | null
          provider_reference: string | null
          provider_status_raw: string | null
          receivable_id: string | null
          reconciliation_status: string | null
          rejected_at: string | null
          sales_channel: string | null
          series: string | null
          source_id: string | null
          source_type: string | null
          status: string
          substitution_invoice_id: string | null
          tax_authority_notes: string | null
          tax_snapshot: Json
          total_amount: number | null
          tp_emis: number
          tp_nf_credito: number | null
          tp_nf_debito: number | null
          updated_at: string
          xml_document_id: string | null
        }
        Insert: {
          access_key?: string | null
          authorized_at?: string | null
          billing_scope?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          company_cnpj?: string | null
          company_settings_id: string
          company_snapshot?: Json | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          customer_snapshot?: Json | null
          danfe_document_id?: string | null
          debtor_customer_id?: string | null
          debtor_partner_id?: string | null
          debtor_type?: string | null
          delivery_id?: string | null
          direction?: string | null
          document_model?: string | null
          document_origin?: string | null
          draft_version?: number
          environment?: string | null
          fin_nfe?: number | null
          fiscal_operation_type?: string | null
          fiscal_profile_snapshot?: Json
          fiscal_totals_snapshot?: Json | null
          homologation_validation_at?: string | null
          homologation_validation_status?: string
          homologation_validation_summary?: Json
          icms_amount?: number | null
          icms_due?: boolean | null
          id?: string
          idempotency_key?: string | null
          invoice_number?: string | null
          invoice_type: string
          issue_date?: string | null
          legal_basis?: string | null
          legal_effective_date?: string | null
          legal_version?: string | null
          locked_at?: string | null
          locked_by?: string | null
          nature_operation?: string | null
          normalized_status?: string | null
          notes?: string | null
          organization_id?: string | null
          original_recipient_snapshot?: Json | null
          parent_invoice_id?: string | null
          partner_order_id?: string | null
          payload_schema_version?: number | null
          provider?: string | null
          provider_reference?: string | null
          provider_status_raw?: string | null
          receivable_id?: string | null
          reconciliation_status?: string | null
          rejected_at?: string | null
          sales_channel?: string | null
          series?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          substitution_invoice_id?: string | null
          tax_authority_notes?: string | null
          tax_snapshot?: Json
          total_amount?: number | null
          tp_emis?: number
          tp_nf_credito?: number | null
          tp_nf_debito?: number | null
          updated_at?: string
          xml_document_id?: string | null
        }
        Update: {
          access_key?: string | null
          authorized_at?: string | null
          billing_scope?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          company_cnpj?: string | null
          company_settings_id?: string
          company_snapshot?: Json | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          customer_snapshot?: Json | null
          danfe_document_id?: string | null
          debtor_customer_id?: string | null
          debtor_partner_id?: string | null
          debtor_type?: string | null
          delivery_id?: string | null
          direction?: string | null
          document_model?: string | null
          document_origin?: string | null
          draft_version?: number
          environment?: string | null
          fin_nfe?: number | null
          fiscal_operation_type?: string | null
          fiscal_profile_snapshot?: Json
          fiscal_totals_snapshot?: Json | null
          homologation_validation_at?: string | null
          homologation_validation_status?: string
          homologation_validation_summary?: Json
          icms_amount?: number | null
          icms_due?: boolean | null
          id?: string
          idempotency_key?: string | null
          invoice_number?: string | null
          invoice_type?: string
          issue_date?: string | null
          legal_basis?: string | null
          legal_effective_date?: string | null
          legal_version?: string | null
          locked_at?: string | null
          locked_by?: string | null
          nature_operation?: string | null
          normalized_status?: string | null
          notes?: string | null
          organization_id?: string | null
          original_recipient_snapshot?: Json | null
          parent_invoice_id?: string | null
          partner_order_id?: string | null
          payload_schema_version?: number | null
          provider?: string | null
          provider_reference?: string | null
          provider_status_raw?: string | null
          receivable_id?: string | null
          reconciliation_status?: string | null
          rejected_at?: string | null
          sales_channel?: string | null
          series?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          substitution_invoice_id?: string | null
          tax_authority_notes?: string | null
          tax_snapshot?: Json
          total_amount?: number | null
          tp_emis?: number
          tp_nf_credito?: number | null
          tp_nf_debito?: number | null
          updated_at?: string
          xml_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fi_customer_id_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_company_settings_id_fkey"
            columns: ["company_settings_id"]
            isOneToOne: false
            referencedRelation: "company_fiscal_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_company_settings_id_fkey"
            columns: ["company_settings_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_company_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_company_settings_id_fkey"
            columns: ["company_settings_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_nfe_emitter_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_danfe_document_id_fkey"
            columns: ["danfe_document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_debtor_customer_id_fkey"
            columns: ["debtor_customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_debtor_partner_id_fkey"
            columns: ["debtor_partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_debtor_partner_id_fkey"
            columns: ["debtor_partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_debtor_partner_id_fkey"
            columns: ["debtor_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_debtor_partner_id_fkey"
            columns: ["debtor_partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_debtor_partner_id_fkey"
            columns: ["debtor_partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_debtor_partner_id_fkey"
            columns: ["debtor_partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_debtor_partner_id_fkey"
            columns: ["debtor_partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_substitution_invoice_id_fkey"
            columns: ["substitution_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_substitution_invoice_id_fkey"
            columns: ["substitution_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_invoices_xml_document_id_fkey"
            columns: ["xml_document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_matrix_load_ledger: {
        Row: {
          applied_at: string
          applied_by: string | null
          applied_value: string | null
          batch_marker: string
          column_name: string
          id: string
          previous_value: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          applied_value?: string | null
          batch_marker: string
          column_name: string
          id?: string
          previous_value?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          applied_value?: string | null
          batch_marker?: string
          column_name?: string
          id?: string
          previous_value?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      fiscal_number_reservations: {
        Row: {
          access_key: string
          check_digit: number
          cnf: string
          fiscal_invoice_id: string
          id: string
          idempotency_key: string
          number: number
          release_reason: string | null
          released_at: string | null
          reserved_at: string
          reserved_by: string | null
          series_id: string
          status: string
          tp_emis: number
        }
        Insert: {
          access_key: string
          check_digit: number
          cnf: string
          fiscal_invoice_id: string
          id?: string
          idempotency_key: string
          number: number
          release_reason?: string | null
          released_at?: string | null
          reserved_at?: string
          reserved_by?: string | null
          series_id: string
          status?: string
          tp_emis?: number
        }
        Update: {
          access_key?: string
          check_digit?: number
          cnf?: string
          fiscal_invoice_id?: string
          id?: string
          idempotency_key?: string
          number?: number
          release_reason?: string | null
          released_at?: string | null
          reserved_at?: string
          reserved_by?: string | null
          series_id?: string
          status?: string
          tp_emis?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_number_reservations_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_number_reservations_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_number_reservations_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fiscal_document_series"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_official_sources: {
        Row: {
          authority: string
          consulted_at: string | null
          created_at: string
          created_by: string | null
          doc_version: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          source_key: string
          updated_at: string
          url: string
        }
        Insert: {
          authority: string
          consulted_at?: string | null
          created_at?: string
          created_by?: string | null
          doc_version?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          source_key: string
          updated_at?: string
          url: string
        }
        Update: {
          authority?: string
          consulted_at?: string | null
          created_at?: string
          created_by?: string | null
          doc_version?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          source_key?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      fiscal_operation_policies: {
        Row: {
          active: boolean
          cfop: string | null
          created_at: string
          created_by: string | null
          crt: string | null
          destination_uf: string | null
          direction: string | null
          document_model: string | null
          fin_nfe: number | null
          final_consumer: boolean | null
          id: string
          legal_basis: string | null
          legal_version: string | null
          nature_operation: string | null
          ncm_prefix: string | null
          notes: string | null
          operation_type: string
          origin_uf: string | null
          policy_status: string
          prepared_by: string | null
          presence_indicator: number | null
          priority: number
          product_category: string | null
          published_at: string | null
          published_by: string | null
          requires_invoice: boolean
          sales_channel: string
          source_id: string | null
          taxpayer_indicator: string | null
          uf: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          cfop?: string | null
          created_at?: string
          created_by?: string | null
          crt?: string | null
          destination_uf?: string | null
          direction?: string | null
          document_model?: string | null
          fin_nfe?: number | null
          final_consumer?: boolean | null
          id?: string
          legal_basis?: string | null
          legal_version?: string | null
          nature_operation?: string | null
          ncm_prefix?: string | null
          notes?: string | null
          operation_type: string
          origin_uf?: string | null
          policy_status?: string
          prepared_by?: string | null
          presence_indicator?: number | null
          priority?: number
          product_category?: string | null
          published_at?: string | null
          published_by?: string | null
          requires_invoice: boolean
          sales_channel: string
          source_id?: string | null
          taxpayer_indicator?: string | null
          uf?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          cfop?: string | null
          created_at?: string
          created_by?: string | null
          crt?: string | null
          destination_uf?: string | null
          direction?: string | null
          document_model?: string | null
          fin_nfe?: number | null
          final_consumer?: boolean | null
          id?: string
          legal_basis?: string | null
          legal_version?: string | null
          nature_operation?: string | null
          ncm_prefix?: string | null
          notes?: string | null
          operation_type?: string
          origin_uf?: string | null
          policy_status?: string
          prepared_by?: string | null
          presence_indicator?: number | null
          priority?: number
          product_category?: string | null
          published_at?: string | null
          published_by?: string | null
          requires_invoice?: boolean
          sales_channel?: string
          source_id?: string | null
          taxpayer_indicator?: string | null
          uf?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_operation_policies_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fiscal_official_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_protocoled_documents: {
        Row: {
          access_key: string
          authorized_at: string | null
          content_bytes: number
          content_sha256: string
          created_at: string
          document_model: string
          environment_code: string
          fiscal_invoice_id: string
          id: string
          protocol: string
          storage_bucket: string
          storage_path: string
          transmission_id: string | null
          xml_run_id: string | null
        }
        Insert: {
          access_key: string
          authorized_at?: string | null
          content_bytes: number
          content_sha256: string
          created_at?: string
          document_model?: string
          environment_code?: string
          fiscal_invoice_id: string
          id?: string
          protocol: string
          storage_bucket?: string
          storage_path: string
          transmission_id?: string | null
          xml_run_id?: string | null
        }
        Update: {
          access_key?: string
          authorized_at?: string | null
          content_bytes?: number
          content_sha256?: string
          created_at?: string
          document_model?: string
          environment_code?: string
          fiscal_invoice_id?: string
          id?: string
          protocol?: string
          storage_bucket?: string
          storage_path?: string
          transmission_id?: string | null
          xml_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_protocoled_documents_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_protocoled_documents_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_protocoled_documents_transmission_id_fkey"
            columns: ["transmission_id"]
            isOneToOne: false
            referencedRelation: "fiscal_sefaz_transmissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_protocoled_documents_xml_run_id_fkey"
            columns: ["xml_run_id"]
            isOneToOne: false
            referencedRelation: "fiscal_xml_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_reference_catalogs: {
        Row: {
          catalog_type: string
          checksum: string | null
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          imported_at: string
          imported_by: string | null
          metadata: Json
          published_at: string | null
          source_name: string
          source_reference: string | null
          source_version: string
          status: string
          updated_at: string
        }
        Insert: {
          catalog_type: string
          checksum?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          metadata?: Json
          published_at?: string | null
          source_name: string
          source_reference?: string | null
          source_version: string
          status?: string
          updated_at?: string
        }
        Update: {
          catalog_type?: string
          checksum?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          metadata?: Json
          published_at?: string | null
          source_name?: string
          source_reference?: string | null
          source_version?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      fiscal_reference_entries: {
        Row: {
          catalog_id: string
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          metadata: Json
          parent_code: string | null
          search_text: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          catalog_id: string
          code: string
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          metadata?: Json
          parent_code?: string | null
          search_text?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          catalog_id?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          parent_code?: string | null
          search_text?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_reference_entries_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "fiscal_reference_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_requirement_exemptions: {
        Row: {
          active: boolean
          approved_at: string
          approved_by: string
          approved_role: string
          created_at: string
          id: string
          legal_basis: string | null
          motivo: string
          revoked_at: string | null
          revoked_by: string | null
          scope_id: string
          scope_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          approved_at?: string
          approved_by: string
          approved_role: string
          created_at?: string
          id?: string
          legal_basis?: string | null
          motivo: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope_id: string
          scope_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          approved_at?: string
          approved_by?: string
          approved_role?: string
          created_at?: string
          id?: string
          legal_basis?: string | null
          motivo?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope_id?: string
          scope_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      fiscal_rtc_layout_support: {
        Row: {
          created_at: string
          created_by: string | null
          document_model: string
          evidence_reference: string | null
          id: string
          layout_version: string
          supported: boolean
          tax_kind: string
          updated_at: string
          valid_from: string
          valid_until: string | null
          xsd_validated: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_model: string
          evidence_reference?: string | null
          id?: string
          layout_version: string
          supported?: boolean
          tax_kind: string
          updated_at?: string
          valid_from: string
          valid_until?: string | null
          xsd_validated?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_model?: string
          evidence_reference?: string | null
          id?: string
          layout_version?: string
          supported?: boolean
          tax_kind?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          xsd_validated?: boolean
        }
        Relationships: []
      }
      fiscal_rule_sod_overrides: {
        Row: {
          consumed_at: string | null
          consumed_by: string | null
          granted_at: string
          granted_by: string
          id: string
          justification: string
          scope: string
          target_id: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_by?: string | null
          granted_at?: string
          granted_by: string
          id?: string
          justification: string
          scope: string
          target_id: string
        }
        Update: {
          consumed_at?: string | null
          consumed_by?: string | null
          granted_at?: string
          granted_by?: string
          id?: string
          justification?: string
          scope?: string
          target_id?: string
        }
        Relationships: []
      }
      fiscal_sefaz_transmissions: {
        Row: {
          ambiente_retorno: string | null
          attempt: number
          c_stat: string | null
          ch_nfe: string | null
          completed_at: string | null
          correlation_id: string
          created_at: string
          created_by: string | null
          dh_recbto: string | null
          endpoint_host: string
          endpoint_url: string
          environment_code: string
          error_code: string | null
          fiscal_event_id: string | null
          fiscal_invoice_id: string | null
          id: string
          idempotency_key: string
          n_prot: string | null
          n_rec: string | null
          outcome: string
          request_fingerprint: string
          response_summary: Json
          service: string
          state: string
          updated_at: string
          x_motivo: string | null
          xml_run_id: string | null
        }
        Insert: {
          ambiente_retorno?: string | null
          attempt?: number
          c_stat?: string | null
          ch_nfe?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          dh_recbto?: string | null
          endpoint_host: string
          endpoint_url: string
          environment_code?: string
          error_code?: string | null
          fiscal_event_id?: string | null
          fiscal_invoice_id?: string | null
          id?: string
          idempotency_key: string
          n_prot?: string | null
          n_rec?: string | null
          outcome?: string
          request_fingerprint: string
          response_summary?: Json
          service: string
          state?: string
          updated_at?: string
          x_motivo?: string | null
          xml_run_id?: string | null
        }
        Update: {
          ambiente_retorno?: string | null
          attempt?: number
          c_stat?: string | null
          ch_nfe?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          dh_recbto?: string | null
          endpoint_host?: string
          endpoint_url?: string
          environment_code?: string
          error_code?: string | null
          fiscal_event_id?: string | null
          fiscal_invoice_id?: string | null
          id?: string
          idempotency_key?: string
          n_prot?: string | null
          n_rec?: string | null
          outcome?: string
          request_fingerprint?: string
          response_summary?: Json
          service?: string
          state?: string
          updated_at?: string
          x_motivo?: string | null
          xml_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_sefaz_transmissions_fiscal_event_id_fkey"
            columns: ["fiscal_event_id"]
            isOneToOne: false
            referencedRelation: "fiscal_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_sefaz_transmissions_fiscal_event_id_fkey"
            columns: ["fiscal_event_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_sefaz_event_state"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "fiscal_sefaz_transmissions_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_sefaz_transmissions_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_sefaz_transmissions_xml_run_id_fkey"
            columns: ["xml_run_id"]
            isOneToOne: false
            referencedRelation: "fiscal_xml_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_stock_loss_contexts: {
        Row: {
          created_at: string
          created_by: string | null
          fiscal_invoice_id: string
          id: string
          legal_reason_category: string
          legal_reason_details: string
          lote_id: string | null
          movimentacao_id: string | null
          occurred_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fiscal_invoice_id: string
          id?: string
          legal_reason_category: string
          legal_reason_details: string
          lote_id?: string | null
          movimentacao_id?: string | null
          occurred_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fiscal_invoice_id?: string
          id?: string
          legal_reason_category?: string
          legal_reason_details?: string
          lote_id?: string | null
          movimentacao_id?: string | null
          occurred_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_stock_loss_contexts_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: true
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_stock_loss_contexts_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: true
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_stock_loss_contexts_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "fiscal_stock_loss_contexts_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_stock_loss_contexts_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "fiscal_stock_loss_contexts_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["lote_id"]
          },
        ]
      }
      fiscal_tax_rules: {
        Row: {
          base_components: Json
          base_reduction_mode: string
          base_reduction_pct: number | null
          calc_mode: string
          created_at: string
          created_by: string | null
          credit_own_icms: boolean
          crt: string | null
          csosn: string | null
          cst: string | null
          deferral_pct: number | null
          destination_uf: string | null
          difal_dest_share_pct: number | null
          fcp_rate: number | null
          fcp_st_rate: number | null
          final_consumer: boolean | null
          id: string
          internal_rate_pct: number | null
          interstate_rate_pct: number | null
          justification: string | null
          legal_basis: string | null
          legal_version: string | null
          mva_pct: number | null
          ncm_prefix: string | null
          origin_uf: string | null
          prepared_by: string | null
          priority: number
          product_category: string | null
          published_at: string | null
          published_by: string | null
          rate: number | null
          rule_key: string
          source_id: string | null
          st_modality: string | null
          status: string
          superseded_by: string | null
          tax_kind: string
          taxpayer_indicator: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
          version: number
        }
        Insert: {
          base_components?: Json
          base_reduction_mode?: string
          base_reduction_pct?: number | null
          calc_mode?: string
          created_at?: string
          created_by?: string | null
          credit_own_icms?: boolean
          crt?: string | null
          csosn?: string | null
          cst?: string | null
          deferral_pct?: number | null
          destination_uf?: string | null
          difal_dest_share_pct?: number | null
          fcp_rate?: number | null
          fcp_st_rate?: number | null
          final_consumer?: boolean | null
          id?: string
          internal_rate_pct?: number | null
          interstate_rate_pct?: number | null
          justification?: string | null
          legal_basis?: string | null
          legal_version?: string | null
          mva_pct?: number | null
          ncm_prefix?: string | null
          origin_uf?: string | null
          prepared_by?: string | null
          priority?: number
          product_category?: string | null
          published_at?: string | null
          published_by?: string | null
          rate?: number | null
          rule_key: string
          source_id?: string | null
          st_modality?: string | null
          status?: string
          superseded_by?: string | null
          tax_kind: string
          taxpayer_indicator?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          base_components?: Json
          base_reduction_mode?: string
          base_reduction_pct?: number | null
          calc_mode?: string
          created_at?: string
          created_by?: string | null
          credit_own_icms?: boolean
          crt?: string | null
          csosn?: string | null
          cst?: string | null
          deferral_pct?: number | null
          destination_uf?: string | null
          difal_dest_share_pct?: number | null
          fcp_rate?: number | null
          fcp_st_rate?: number | null
          final_consumer?: boolean | null
          id?: string
          internal_rate_pct?: number | null
          interstate_rate_pct?: number | null
          justification?: string | null
          legal_basis?: string | null
          legal_version?: string | null
          mva_pct?: number | null
          ncm_prefix?: string | null
          origin_uf?: string | null
          prepared_by?: string | null
          priority?: number
          product_category?: string | null
          published_at?: string | null
          published_by?: string | null
          rate?: number | null
          rule_key?: string
          source_id?: string | null
          st_modality?: string | null
          status?: string
          superseded_by?: string | null
          tax_kind?: string
          taxpayer_indicator?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_tax_rules_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fiscal_official_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_tax_rules_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "fiscal_tax_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_xml_runs: {
        Row: {
          access_key: string
          certificate_id: string | null
          created_by: string | null
          engine_version: string
          environment_code: string
          error_code: string | null
          error_detail: string | null
          failed_at: string | null
          fiscal_invoice_id: string
          generated_at: string | null
          id: string
          idempotency_key: string
          payload: Json
          payload_sha256: string
          prepared_at: string
          previous_run_id: string | null
          reservation_id: string | null
          run_version: number
          schema_version: string
          signature_metadata: Json
          signed_at: string | null
          signed_bytes: number | null
          signed_path: string | null
          signed_sha256: string | null
          state: string
          storage_bucket: string
          unsigned_bytes: number | null
          unsigned_path: string | null
          unsigned_sha256: string | null
          updated_at: string
          validated_at: string | null
          validation: Json
        }
        Insert: {
          access_key: string
          certificate_id?: string | null
          created_by?: string | null
          engine_version?: string
          environment_code: string
          error_code?: string | null
          error_detail?: string | null
          failed_at?: string | null
          fiscal_invoice_id: string
          generated_at?: string | null
          id?: string
          idempotency_key: string
          payload: Json
          payload_sha256: string
          prepared_at?: string
          previous_run_id?: string | null
          reservation_id?: string | null
          run_version?: number
          schema_version: string
          signature_metadata?: Json
          signed_at?: string | null
          signed_bytes?: number | null
          signed_path?: string | null
          signed_sha256?: string | null
          state?: string
          storage_bucket?: string
          unsigned_bytes?: number | null
          unsigned_path?: string | null
          unsigned_sha256?: string | null
          updated_at?: string
          validated_at?: string | null
          validation?: Json
        }
        Update: {
          access_key?: string
          certificate_id?: string | null
          created_by?: string | null
          engine_version?: string
          environment_code?: string
          error_code?: string | null
          error_detail?: string | null
          failed_at?: string | null
          fiscal_invoice_id?: string
          generated_at?: string | null
          id?: string
          idempotency_key?: string
          payload?: Json
          payload_sha256?: string
          prepared_at?: string
          previous_run_id?: string | null
          reservation_id?: string | null
          run_version?: number
          schema_version?: string
          signature_metadata?: Json
          signed_at?: string | null
          signed_bytes?: number | null
          signed_path?: string | null
          signed_sha256?: string | null
          state?: string
          storage_bucket?: string
          unsigned_bytes?: number | null
          unsigned_path?: string | null
          unsigned_sha256?: string | null
          updated_at?: string
          validated_at?: string | null
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_xml_runs_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_xml_runs_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
          {
            foreignKeyName: "fiscal_xml_runs_previous_run_id_fkey"
            columns: ["previous_run_id"]
            isOneToOne: false
            referencedRelation: "fiscal_xml_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_xml_runs_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "fiscal_number_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_xsd_registry: {
        Row: {
          created_at: string
          created_by: string | null
          depends_on: string[]
          document_model: string
          file_bytes: number | null
          file_name: string | null
          file_sha256: string | null
          id: string
          is_active: boolean
          legal_basis: string
          namespace_uri: string
          notes: string | null
          package_name: string | null
          package_sha256: string | null
          published_at: string
          retrieved_at: string | null
          root_element: string
          schema_name: string
          schema_version: string
          source_url: string
          validator: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          depends_on?: string[]
          document_model?: string
          file_bytes?: number | null
          file_name?: string | null
          file_sha256?: string | null
          id?: string
          is_active?: boolean
          legal_basis: string
          namespace_uri: string
          notes?: string | null
          package_name?: string | null
          package_sha256?: string | null
          published_at: string
          retrieved_at?: string | null
          root_element: string
          schema_name: string
          schema_version: string
          source_url: string
          validator?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          depends_on?: string[]
          document_model?: string
          file_bytes?: number | null
          file_name?: string | null
          file_sha256?: string | null
          id?: string
          is_active?: boolean
          legal_basis?: string
          namespace_uri?: string
          notes?: string | null
          package_name?: string | null
          package_sha256?: string | null
          published_at?: string
          retrieved_at?: string | null
          root_element?: string
          schema_name?: string
          schema_version?: string
          source_url?: string
          validator?: string | null
        }
        Relationships: []
      }
      formulacoes: {
        Row: {
          component_insumo_id: string | null
          concentracao: number | null
          created_at: string
          e_volume_fixo: boolean | null
          id: string
          microrganismo_id: string
          produto_id: string
          proporcao: number | null
          unidade: string | null
          volume_ml: number | null
        }
        Insert: {
          component_insumo_id?: string | null
          concentracao?: number | null
          created_at?: string
          e_volume_fixo?: boolean | null
          id?: string
          microrganismo_id: string
          produto_id: string
          proporcao?: number | null
          unidade?: string | null
          volume_ml?: number | null
        }
        Update: {
          component_insumo_id?: string | null
          concentracao?: number | null
          created_at?: string
          e_volume_fixo?: boolean | null
          id?: string
          microrganismo_id?: string
          produto_id?: string
          proporcao?: number | null
          unidade?: string | null
          volume_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "formulacoes_component_insumo_id_fkey"
            columns: ["component_insumo_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formulacoes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formulacoes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "formulacoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratorio_esteira_eventos: {
        Row: {
          acao: string
          created_at: string | null
          etapa_anterior: string | null
          etapa_nova: string
          id: string
          lote_id: string | null
          observacao: string | null
          origem_os: string
          os_id: string
          programacao_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          etapa_anterior?: string | null
          etapa_nova: string
          id?: string
          lote_id?: string | null
          observacao?: string | null
          origem_os: string
          os_id: string
          programacao_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          etapa_anterior?: string | null
          etapa_nova?: string
          id?: string
          lote_id?: string | null
          observacao?: string | null
          origem_os?: string
          os_id?: string
          programacao_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      lotes: {
        Row: {
          codigo_lote: string
          created_at: string
          custo_producao_estimado: number | null
          data_producao: string
          id: string
          microrganismo_id: string | null
          observacoes_tecnicas: string | null
          organization_id: string | null
          produto_id: string | null
          programacao_id: string | null
          responsavel_producao: string | null
          status: Database["public"]["Enums"]["status_lote"]
          tanque: string | null
          updated_at: string
          volume_produzido: number | null
        }
        Insert: {
          codigo_lote: string
          created_at?: string
          custo_producao_estimado?: number | null
          data_producao?: string
          id?: string
          microrganismo_id?: string | null
          observacoes_tecnicas?: string | null
          organization_id?: string | null
          produto_id?: string | null
          programacao_id?: string | null
          responsavel_producao?: string | null
          status?: Database["public"]["Enums"]["status_lote"]
          tanque?: string | null
          updated_at?: string
          volume_produzido?: number | null
        }
        Update: {
          codigo_lote?: string
          created_at?: string
          custo_producao_estimado?: number | null
          data_producao?: string
          id?: string
          microrganismo_id?: string | null
          observacoes_tecnicas?: string | null
          organization_id?: string | null
          produto_id?: string | null
          programacao_id?: string | null
          responsavel_producao?: string | null
          status?: Database["public"]["Enums"]["status_lote"]
          tanque?: string | null
          updated_at?: string
          volume_produzido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "lotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["programacao_id"]
          },
          {
            foreignKeyName: "lotes_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["programacao_id"]
          },
          {
            foreignKeyName: "lotes_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacao_producao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["programacao_id"]
          },
        ]
      }
      microorganism_crop_recommendations: {
        Row: {
          ativo: boolean
          created_at: string
          cultura_id: string | null
          cultura_nome: string | null
          fase_recomendada: string | null
          id: string
          microrganismo_id: string
          objetivo_uso: string | null
          observacao: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          cultura_id?: string | null
          cultura_nome?: string | null
          fase_recomendada?: string | null
          id?: string
          microrganismo_id: string
          objetivo_uso?: string | null
          observacao?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          cultura_id?: string | null
          cultura_nome?: string | null
          fase_recomendada?: string | null
          id?: string
          microrganismo_id?: string
          objetivo_uso?: string | null
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_crop_recommendations_cultura_id_fkey"
            columns: ["cultura_id"]
            isOneToOne: false
            referencedRelation: "culturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_crop_recommendations_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_crop_recommendations_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
        ]
      }
      microorganism_fiscal_profiles: {
        Row: {
          accounting_notes: string | null
          accounting_validated_at: string | null
          accounting_validated_by: string | null
          cest: string | null
          cfop_in_state: string | null
          cfop_interstate: string | null
          cofins_cst: string | null
          commercial_unit: string | null
          created_at: string
          created_by: string | null
          fiscal_description: string | null
          gtin: string | null
          icms_csosn: string | null
          icms_cst: string | null
          id: string
          ipi_cst: string | null
          is_active: boolean
          microorganism_id: string
          ncm: string | null
          origin_code: string | null
          pis_cst: string | null
          profile_status: string
          tax_benefit_code: string | null
          taxable_gtin: string | null
          taxable_unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accounting_notes?: string | null
          accounting_validated_at?: string | null
          accounting_validated_by?: string | null
          cest?: string | null
          cfop_in_state?: string | null
          cfop_interstate?: string | null
          cofins_cst?: string | null
          commercial_unit?: string | null
          created_at?: string
          created_by?: string | null
          fiscal_description?: string | null
          gtin?: string | null
          icms_csosn?: string | null
          icms_cst?: string | null
          id?: string
          ipi_cst?: string | null
          is_active?: boolean
          microorganism_id: string
          ncm?: string | null
          origin_code?: string | null
          pis_cst?: string | null
          profile_status?: string
          tax_benefit_code?: string | null
          taxable_gtin?: string | null
          taxable_unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accounting_notes?: string | null
          accounting_validated_at?: string | null
          accounting_validated_by?: string | null
          cest?: string | null
          cfop_in_state?: string | null
          cfop_interstate?: string | null
          cofins_cst?: string | null
          commercial_unit?: string | null
          created_at?: string
          created_by?: string | null
          fiscal_description?: string | null
          gtin?: string | null
          icms_csosn?: string | null
          icms_cst?: string | null
          id?: string
          ipi_cst?: string | null
          is_active?: boolean
          microorganism_id?: string
          ncm?: string | null
          origin_code?: string | null
          pis_cst?: string | null
          profile_status?: string
          tax_benefit_code?: string | null
          taxable_gtin?: string | null
          taxable_unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_fiscal_profiles_microorganism_id_fkey"
            columns: ["microorganism_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_fiscal_profiles_microorganism_id_fkey"
            columns: ["microorganism_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
        ]
      }
      microorganism_ncm_candidates: {
        Row: {
          cest: string | null
          confidence: string
          consulted_at: string | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          dossier_id: string
          id: string
          justification: string
          ncm: string
          official_description: string | null
          source_id: string | null
          source_url: string | null
          status: string
          table_reference_date: string | null
          table_version: string | null
        }
        Insert: {
          cest?: string | null
          confidence?: string
          consulted_at?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          dossier_id: string
          id?: string
          justification: string
          ncm: string
          official_description?: string | null
          source_id?: string | null
          source_url?: string | null
          status?: string
          table_reference_date?: string | null
          table_version?: string | null
        }
        Update: {
          cest?: string | null
          confidence?: string
          consulted_at?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          dossier_id?: string
          id?: string
          justification?: string
          ncm?: string
          official_description?: string | null
          source_id?: string | null
          source_url?: string | null
          status?: string
          table_reference_date?: string | null
          table_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_ncm_candidates_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "microorganism_regulatory_dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_ncm_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fiscal_official_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      microorganism_regulatory_checklist: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          dossier_id: string
          evidence_document_id: string | null
          id: string
          item_key: string
          justification: string | null
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          dossier_id: string
          evidence_document_id?: string | null
          id?: string
          item_key: string
          justification?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          dossier_id?: string
          evidence_document_id?: string | null
          id?: string
          item_key?: string
          justification?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_regulatory_checklist_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "microorganism_regulatory_dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_regulatory_checklist_evidence_document_id_fkey"
            columns: ["evidence_document_id"]
            isOneToOne: false
            referencedRelation: "microorganism_regulatory_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      microorganism_regulatory_documents: {
        Row: {
          consulted_at: string | null
          content_sha256: string
          deleted_at: string | null
          deleted_by: string | null
          doc_type: string
          doc_version: string | null
          dossier_id: string
          id: string
          issued_at: string | null
          issuer: string | null
          source_id: string | null
          source_url: string | null
          storage_bucket: string
          storage_path: string
          title: string
          uploaded_at: string
          uploaded_by: string | null
          valid_until: string | null
        }
        Insert: {
          consulted_at?: string | null
          content_sha256: string
          deleted_at?: string | null
          deleted_by?: string | null
          doc_type: string
          doc_version?: string | null
          dossier_id: string
          id?: string
          issued_at?: string | null
          issuer?: string | null
          source_id?: string | null
          source_url?: string | null
          storage_bucket?: string
          storage_path: string
          title: string
          uploaded_at?: string
          uploaded_by?: string | null
          valid_until?: string | null
        }
        Update: {
          consulted_at?: string | null
          content_sha256?: string
          deleted_at?: string | null
          deleted_by?: string | null
          doc_type?: string
          doc_version?: string | null
          dossier_id?: string
          id?: string
          issued_at?: string | null
          issuer?: string | null
          source_id?: string | null
          source_url?: string | null
          storage_bucket?: string
          storage_path?: string
          title?: string
          uploaded_at?: string
          uploaded_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_regulatory_documents_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "microorganism_regulatory_dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_regulatory_documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fiscal_official_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      microorganism_regulatory_dossiers: {
        Row: {
          blocked_reason: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          effective_from: string | null
          effective_to: string | null
          fiscal_review_at: string | null
          fiscal_review_by: string | null
          fiscal_review_notes: string | null
          fiscal_review_status: string
          formulation: string | null
          guarantee_unit: string | null
          id: string
          label_guarantee: string | null
          mapa_holder: string | null
          mapa_manufacturer: string | null
          mapa_not_applicable_reason: string | null
          mapa_registration_number: string | null
          mapa_status: string | null
          mapa_valid_until: string | null
          microorganism_id: string
          published_at: string | null
          published_by: string | null
          published_cest: string | null
          published_ncm: string | null
          published_ncm_candidate_id: string | null
          regulatory_category: string | null
          regulatory_review_at: string | null
          regulatory_review_by: string | null
          regulatory_review_notes: string | null
          regulatory_review_status: string
          sod_override_active: boolean
          sod_override_at: string | null
          sod_override_by: string | null
          sod_override_reason: string | null
          status: string
          strain_code: string | null
          strain_name: string | null
          technical_review_at: string | null
          technical_review_by: string | null
          technical_review_notes: string | null
          technical_review_status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          blocked_reason?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          effective_from?: string | null
          effective_to?: string | null
          fiscal_review_at?: string | null
          fiscal_review_by?: string | null
          fiscal_review_notes?: string | null
          fiscal_review_status?: string
          formulation?: string | null
          guarantee_unit?: string | null
          id?: string
          label_guarantee?: string | null
          mapa_holder?: string | null
          mapa_manufacturer?: string | null
          mapa_not_applicable_reason?: string | null
          mapa_registration_number?: string | null
          mapa_status?: string | null
          mapa_valid_until?: string | null
          microorganism_id: string
          published_at?: string | null
          published_by?: string | null
          published_cest?: string | null
          published_ncm?: string | null
          published_ncm_candidate_id?: string | null
          regulatory_category?: string | null
          regulatory_review_at?: string | null
          regulatory_review_by?: string | null
          regulatory_review_notes?: string | null
          regulatory_review_status?: string
          sod_override_active?: boolean
          sod_override_at?: string | null
          sod_override_by?: string | null
          sod_override_reason?: string | null
          status?: string
          strain_code?: string | null
          strain_name?: string | null
          technical_review_at?: string | null
          technical_review_by?: string | null
          technical_review_notes?: string | null
          technical_review_status?: string
          updated_at?: string
          updated_by?: string | null
          version: number
        }
        Update: {
          blocked_reason?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          effective_from?: string | null
          effective_to?: string | null
          fiscal_review_at?: string | null
          fiscal_review_by?: string | null
          fiscal_review_notes?: string | null
          fiscal_review_status?: string
          formulation?: string | null
          guarantee_unit?: string | null
          id?: string
          label_guarantee?: string | null
          mapa_holder?: string | null
          mapa_manufacturer?: string | null
          mapa_not_applicable_reason?: string | null
          mapa_registration_number?: string | null
          mapa_status?: string | null
          mapa_valid_until?: string | null
          microorganism_id?: string
          published_at?: string | null
          published_by?: string | null
          published_cest?: string | null
          published_ncm?: string | null
          published_ncm_candidate_id?: string | null
          regulatory_category?: string | null
          regulatory_review_at?: string | null
          regulatory_review_by?: string | null
          regulatory_review_notes?: string | null
          regulatory_review_status?: string
          sod_override_active?: boolean
          sod_override_at?: string | null
          sod_override_by?: string | null
          sod_override_reason?: string | null
          status?: string
          strain_code?: string | null
          strain_name?: string | null
          technical_review_at?: string | null
          technical_review_by?: string | null
          technical_review_notes?: string | null
          technical_review_status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_regulatory_dossiers_microorganism_id_fkey"
            columns: ["microorganism_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_regulatory_dossiers_microorganism_id_fkey"
            columns: ["microorganism_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "mrd_published_candidate_fk"
            columns: ["published_ncm_candidate_id"]
            isOneToOne: false
            referencedRelation: "microorganism_ncm_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      microorganism_regulatory_presentations: {
        Row: {
          catalog_volume_id: string | null
          commercial_unit: string | null
          conversion_factor: number | null
          created_at: string
          created_by: string | null
          dossier_id: string
          gtin: string | null
          gtin_absent: boolean
          gtin_absent_at: string | null
          gtin_absent_by: string | null
          gtin_absent_reason: string | null
          gtin_confirmed: boolean
          gtin_confirmed_at: string | null
          gtin_confirmed_by: string | null
          id: string
          label: string
          origin_note: string
          taxable_unit: string | null
          units_confirmed: boolean
          units_confirmed_at: string | null
          units_confirmed_by: string | null
          updated_at: string
          updated_by: string | null
          volume_ml: number
        }
        Insert: {
          catalog_volume_id?: string | null
          commercial_unit?: string | null
          conversion_factor?: number | null
          created_at?: string
          created_by?: string | null
          dossier_id: string
          gtin?: string | null
          gtin_absent?: boolean
          gtin_absent_at?: string | null
          gtin_absent_by?: string | null
          gtin_absent_reason?: string | null
          gtin_confirmed?: boolean
          gtin_confirmed_at?: string | null
          gtin_confirmed_by?: string | null
          id?: string
          label: string
          origin_note?: string
          taxable_unit?: string | null
          units_confirmed?: boolean
          units_confirmed_at?: string | null
          units_confirmed_by?: string | null
          updated_at?: string
          updated_by?: string | null
          volume_ml: number
        }
        Update: {
          catalog_volume_id?: string | null
          commercial_unit?: string | null
          conversion_factor?: number | null
          created_at?: string
          created_by?: string | null
          dossier_id?: string
          gtin?: string | null
          gtin_absent?: boolean
          gtin_absent_at?: string | null
          gtin_absent_by?: string | null
          gtin_absent_reason?: string | null
          gtin_confirmed?: boolean
          gtin_confirmed_at?: string | null
          gtin_confirmed_by?: string | null
          id?: string
          label?: string
          origin_note?: string
          taxable_unit?: string | null
          units_confirmed?: boolean
          units_confirmed_at?: string | null
          units_confirmed_by?: string | null
          updated_at?: string
          updated_by?: string | null
          volume_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_regulatory_presentations_catalog_volume_id_fkey"
            columns: ["catalog_volume_id"]
            isOneToOne: false
            referencedRelation: "catalogo_volumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_regulatory_presentations_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "microorganism_regulatory_dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      microorganism_regulatory_publication_snapshots: {
        Row: {
          dossier_id: string
          id: string
          microorganism_id: string
          published_at: string
          published_by: string | null
          snapshot: Json
          snapshot_sha256: string
          version: number
        }
        Insert: {
          dossier_id: string
          id?: string
          microorganism_id: string
          published_at?: string
          published_by?: string | null
          snapshot: Json
          snapshot_sha256: string
          version: number
        }
        Update: {
          dossier_id?: string
          id?: string
          microorganism_id?: string
          published_at?: string
          published_by?: string | null
          snapshot?: Json
          snapshot_sha256?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_regulatory_publication_snap_microorganism_id_fkey"
            columns: ["microorganism_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_regulatory_publication_snap_microorganism_id_fkey"
            columns: ["microorganism_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "microorganism_regulatory_publication_snapshots_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "microorganism_regulatory_dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      microorganism_targets: {
        Row: {
          alvo_nome: string
          alvo_tipo: string
          ativo: boolean
          catalogo_alvo_id: string | null
          created_at: string
          descricao: string | null
          id: string
          microrganismo_id: string
          prioridade: number
        }
        Insert: {
          alvo_nome: string
          alvo_tipo: string
          ativo?: boolean
          catalogo_alvo_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          microrganismo_id: string
          prioridade?: number
        }
        Update: {
          alvo_nome?: string
          alvo_tipo?: string
          ativo?: boolean
          catalogo_alvo_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          microrganismo_id?: string
          prioridade?: number
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_targets_catalogo_alvo_id_fkey"
            columns: ["catalogo_alvo_id"]
            isOneToOne: false
            referencedRelation: "catalogo_alvos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_targets_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_targets_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
        ]
      }
      microorganism_technical_profiles: {
        Row: {
          armazenamento: string | null
          beneficios_agronomicos: string | null
          compatibilidade: string | null
          created_at: string
          created_by: string | null
          cuidados_aplicacao: string | null
          explicacao_b2b: string | null
          explicacao_produtor: string | null
          explicacao_tecnica: string | null
          id: string
          indicacoes_uso: string | null
          mecanismo_acao: string | null
          microrganismo_id: string
          observacoes_regulatorias: string | null
          resumo_curto: string | null
          status_validacao: string
          updated_at: string
          updated_by: string | null
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          armazenamento?: string | null
          beneficios_agronomicos?: string | null
          compatibilidade?: string | null
          created_at?: string
          created_by?: string | null
          cuidados_aplicacao?: string | null
          explicacao_b2b?: string | null
          explicacao_produtor?: string | null
          explicacao_tecnica?: string | null
          id?: string
          indicacoes_uso?: string | null
          mecanismo_acao?: string | null
          microrganismo_id: string
          observacoes_regulatorias?: string | null
          resumo_curto?: string | null
          status_validacao?: string
          updated_at?: string
          updated_by?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          armazenamento?: string | null
          beneficios_agronomicos?: string | null
          compatibilidade?: string | null
          created_at?: string
          created_by?: string | null
          cuidados_aplicacao?: string | null
          explicacao_b2b?: string | null
          explicacao_produtor?: string | null
          explicacao_tecnica?: string | null
          id?: string
          indicacoes_uso?: string | null
          mecanismo_acao?: string | null
          microrganismo_id?: string
          observacoes_regulatorias?: string | null
          resumo_curto?: string | null
          status_validacao?: string
          updated_at?: string
          updated_by?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_technical_profiles_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microorganism_technical_profiles_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
        ]
      }
      microrganismos: {
        Row: {
          ativo: boolean
          b2b_enabled: boolean
          codigo: string | null
          concentracao_label: string | null
          concentracao_ufc_ml: number | null
          created_at: string
          descricao: string | null
          dose_ml_ha: number | null
          fornecedor: string | null
          funcao_agronomica: string | null
          id: string
          meio_cultivo: string | null
          nome: string
          nome_cientifico: string | null
          observacoes: string | null
          preco_tabela: number | null
          producao_on_farm: boolean | null
          product_id: string | null
          safra_referencia: string | null
          tipo: Database["public"]["Enums"]["tipo_microrganismo"]
          valor_dose_brl: number | null
          valor_litro_brl: number | null
        }
        Insert: {
          ativo?: boolean
          b2b_enabled?: boolean
          codigo?: string | null
          concentracao_label?: string | null
          concentracao_ufc_ml?: number | null
          created_at?: string
          descricao?: string | null
          dose_ml_ha?: number | null
          fornecedor?: string | null
          funcao_agronomica?: string | null
          id?: string
          meio_cultivo?: string | null
          nome: string
          nome_cientifico?: string | null
          observacoes?: string | null
          preco_tabela?: number | null
          producao_on_farm?: boolean | null
          product_id?: string | null
          safra_referencia?: string | null
          tipo: Database["public"]["Enums"]["tipo_microrganismo"]
          valor_dose_brl?: number | null
          valor_litro_brl?: number | null
        }
        Update: {
          ativo?: boolean
          b2b_enabled?: boolean
          codigo?: string | null
          concentracao_label?: string | null
          concentracao_ufc_ml?: number | null
          created_at?: string
          descricao?: string | null
          dose_ml_ha?: number | null
          fornecedor?: string | null
          funcao_agronomica?: string | null
          id?: string
          meio_cultivo?: string | null
          nome?: string
          nome_cientifico?: string | null
          observacoes?: string | null
          preco_tabela?: number | null
          producao_on_farm?: boolean | null
          product_id?: string | null
          safra_referencia?: string | null
          tipo?: Database["public"]["Enums"]["tipo_microrganismo"]
          valor_dose_brl?: number | null
          valor_litro_brl?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "microrganismos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoramento_avisos: {
        Row: {
          data_referencia: string
          enviado_em: string | null
          id: string
          registro_consultor_id: string
          tipo: string
        }
        Insert: {
          data_referencia: string
          enviado_em?: string | null
          id?: string
          registro_consultor_id: string
          tipo: string
        }
        Update: {
          data_referencia?: string
          enviado_em?: string | null
          id?: string
          registro_consultor_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoramento_avisos_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_operacionais: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string | null
          lido: boolean
          link: string | null
          mensagem: string | null
          source_id: string | null
          source_type: string | null
          tipo: string
          titulo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          lido?: boolean
          link?: string | null
          mensagem?: string | null
          source_id?: string | null
          source_type?: string | null
          tipo: string
          titulo: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          lido?: boolean
          link?: string | null
          mensagem?: string | null
          source_id?: string | null
          source_type?: string | null
          tipo?: string
          titulo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      objetivos_visita_sugestoes: {
        Row: {
          ativo: boolean
          created_at: string
          cultura_id: string | null
          id: string
          ordem: number
          texto: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          cultura_id?: string | null
          id?: string
          ordem?: number
          texto: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          cultura_id?: string | null
          id?: string
          ordem?: number
          texto?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objetivos_visita_sugestoes_cultura_id_fkey"
            columns: ["cultura_id"]
            isOneToOne: false
            referencedRelation: "culturas"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico: {
        Row: {
          area_hectares: number | null
          cliente_id: string | null
          created_at: string
          data_programada: string | null
          fazenda_id: string | null
          id: string
          microrganismo_id: string | null
          modo_aplicacao: string | null
          numero_os: string
          organization_id: string | null
          origem: string
          partner_order_id: string | null
          partner_order_item_id: string | null
          prioridade: Database["public"]["Enums"]["prioridade_os"]
          produto_id: string | null
          status: Database["public"]["Enums"]["status_os"]
          talhao_id: string | null
          tipo_item: string
          updated_at: string
          volume_total_ml: number | null
        }
        Insert: {
          area_hectares?: number | null
          cliente_id?: string | null
          created_at?: string
          data_programada?: string | null
          fazenda_id?: string | null
          id?: string
          microrganismo_id?: string | null
          modo_aplicacao?: string | null
          numero_os: string
          organization_id?: string | null
          origem?: string
          partner_order_id?: string | null
          partner_order_item_id?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_os"]
          produto_id?: string | null
          status?: Database["public"]["Enums"]["status_os"]
          talhao_id?: string | null
          tipo_item?: string
          updated_at?: string
          volume_total_ml?: number | null
        }
        Update: {
          area_hectares?: number | null
          cliente_id?: string | null
          created_at?: string
          data_programada?: string | null
          fazenda_id?: string | null
          id?: string
          microrganismo_id?: string | null
          modo_aplicacao?: string | null
          numero_os?: string
          organization_id?: string | null
          origem?: string
          partner_order_id?: string | null
          partner_order_item_id?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_os"]
          produto_id?: string | null
          status?: Database["public"]["Enums"]["status_os"]
          talhao_id?: string | null
          tipo_item?: string
          updated_at?: string
          volume_total_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "ordens_servico_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_partner_order_item_id_fkey"
            columns: ["partner_order_item_id"]
            isOneToOne: true
            referencedRelation: "partner_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_talhao_id_fkey"
            columns: ["talhao_id"]
            isOneToOne: false
            referencedRelation: "talhoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico_onfarm: {
        Row: {
          aprovacao_id: string | null
          area_hectares: number | null
          cliente_id: string
          consultor_responsavel: string | null
          created_at: string
          created_by: string | null
          cultura_id: string | null
          data_recomendada: string | null
          diagnostico: string | null
          dose_ml_ha: number | null
          fase_fenologica: string | null
          fazenda_id: string
          id: string
          lote_pre_os_id: string | null
          microrganismo_id: string | null
          modo_aplicacao: string | null
          numero_os: string
          observacoes_adicionais: string | null
          prioridade: Database["public"]["Enums"]["prioridade_os"]
          problema_principal: string | null
          produto_id: string | null
          recomendacao_tecnica: string | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          status: Database["public"]["Enums"]["status_os_onfarm"]
          talhao_id: string
          updated_at: string
          volume_total_ml: number | null
        }
        Insert: {
          aprovacao_id?: string | null
          area_hectares?: number | null
          cliente_id: string
          consultor_responsavel?: string | null
          created_at?: string
          created_by?: string | null
          cultura_id?: string | null
          data_recomendada?: string | null
          diagnostico?: string | null
          dose_ml_ha?: number | null
          fase_fenologica?: string | null
          fazenda_id: string
          id?: string
          lote_pre_os_id?: string | null
          microrganismo_id?: string | null
          modo_aplicacao?: string | null
          numero_os: string
          observacoes_adicionais?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_os"]
          problema_principal?: string | null
          produto_id?: string | null
          recomendacao_tecnica?: string | null
          registro_consultor_id?: string | null
          solicitacao_id?: string | null
          status?: Database["public"]["Enums"]["status_os_onfarm"]
          talhao_id: string
          updated_at?: string
          volume_total_ml?: number | null
        }
        Update: {
          aprovacao_id?: string | null
          area_hectares?: number | null
          cliente_id?: string
          consultor_responsavel?: string | null
          created_at?: string
          created_by?: string | null
          cultura_id?: string | null
          data_recomendada?: string | null
          diagnostico?: string | null
          dose_ml_ha?: number | null
          fase_fenologica?: string | null
          fazenda_id?: string
          id?: string
          lote_pre_os_id?: string | null
          microrganismo_id?: string | null
          modo_aplicacao?: string | null
          numero_os?: string
          observacoes_adicionais?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_os"]
          problema_principal?: string | null
          produto_id?: string | null
          recomendacao_tecnica?: string | null
          registro_consultor_id?: string | null
          solicitacao_id?: string | null
          status?: Database["public"]["Enums"]["status_os_onfarm"]
          talhao_id?: string
          updated_at?: string
          volume_total_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_onfarm_aprovacao_id_fkey"
            columns: ["aprovacao_id"]
            isOneToOne: false
            referencedRelation: "aprovacoes_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_cultura_id_fkey"
            columns: ["cultura_id"]
            isOneToOne: false
            referencedRelation: "culturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "portal_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_talhao_id_fkey"
            columns: ["talhao_id"]
            isOneToOne: false
            referencedRelation: "talhoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico_onfarm_status_history: {
        Row: {
          created_at: string
          id: string
          os_onfarm_id: string
          status_anterior: string | null
          status_novo: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          os_onfarm_id: string
          status_anterior?: string | null
          status_novo: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          os_onfarm_id?: string
          status_anterior?: string | null
          status_novo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_onfarm_status_history_os_onfarm_id_fkey"
            columns: ["os_onfarm_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_fluxo_visita_tecnica"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_status_history_os_onfarm_id_fkey"
            columns: ["os_onfarm_id"]
            isOneToOne: false
            referencedRelation: "mv_fluxo_visita_tecnica"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_status_history_os_onfarm_id_fkey"
            columns: ["os_onfarm_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico_onfarm"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_feature_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          ends_at: string | null
          feature_id: string
          id: string
          limit_value: number | null
          mode: string
          organization_id: string
          reason: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ends_at?: string | null
          feature_id: string
          id?: string
          limit_value?: number | null
          mode: string
          organization_id: string
          reason: string
          starts_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ends_at?: string | null
          feature_id?: string
          id?: string
          limit_value?: number | null
          mode?: string
          organization_id?: string
          reason?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_feature_overrides_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "saas_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_feature_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_status_audit: {
        Row: {
          ator_id: string | null
          created_at: string
          id: string
          motivo: string | null
          organization_id: string
          status_anterior: string | null
          status_novo: string
        }
        Insert: {
          ator_id?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          organization_id: string
          status_anterior?: string | null
          status_novo: string
        }
        Update: {
          ator_id?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          organization_id?: string
          status_anterior?: string | null
          status_novo?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_status_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscription_history: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          organization_id: string
          reason: string | null
          source: string
          subscription_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          organization_id: string
          reason?: string | null
          source: string
          subscription_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string
          reason?: string | null
          source?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscription_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscription_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          billing_cycle: string | null
          cancel_at: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["saas_subscription_status"]
          suspended_at: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string | null
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id: string
          plan_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["saas_subscription_status"]
          suspended_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string | null
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["saas_subscription_status"]
          suspended_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          ativada_em: string | null
          ativo: boolean
          cnpj: string | null
          cnpj_normalizado: string | null
          created_at: string
          email_corporativo: string | null
          fuso_horario: string | null
          id: string
          nome: string
          nome_fantasia: string | null
          onboarding_concluido_em: string | null
          onboarding_dados: Json
          partner_account_id: string | null
          razao_social: string | null
          responsavel_definido_em: string | null
          responsavel_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ativada_em?: string | null
          ativo?: boolean
          cnpj?: string | null
          cnpj_normalizado?: string | null
          created_at?: string
          email_corporativo?: string | null
          fuso_horario?: string | null
          id?: string
          nome: string
          nome_fantasia?: string | null
          onboarding_concluido_em?: string | null
          onboarding_dados?: Json
          partner_account_id?: string | null
          razao_social?: string | null
          responsavel_definido_em?: string | null
          responsavel_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ativada_em?: string | null
          ativo?: boolean
          cnpj?: string | null
          cnpj_normalizado?: string | null
          created_at?: string
          email_corporativo?: string | null
          fuso_horario?: string | null
          id?: string
          nome?: string
          nome_fantasia?: string | null
          onboarding_concluido_em?: string | null
          onboarding_dados?: Json
          partner_account_id?: string | null
          razao_social?: string | null
          responsavel_definido_em?: string | null
          responsavel_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "organizations_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "organizations_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "organizations_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "organizations_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "organizations_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      os_faturamento_base: {
        Row: {
          acrescimo_valor: number
          area_hectares_snapshot: number
          cliente_id: string | null
          condicao_pagamento_snapshot: string | null
          created_at: string | null
          created_by: string | null
          desconto_valor: number
          id: string
          modelo_precificacao: string
          numero_parcelas_sugerido: number
          ordem_servico_id: string
          origem_os_tipo: string
          primeiro_vencimento_sugerido: string | null
          produto_id: string | null
          status: Database["public"]["Enums"]["faturamento_base_status"]
          subtotal: number
          updated_at: string | null
          valor_ha_snapshot: number
          valor_total_faturavel: number
          volume_total_ml_snapshot: number
        }
        Insert: {
          acrescimo_valor?: number
          area_hectares_snapshot?: number
          cliente_id?: string | null
          condicao_pagamento_snapshot?: string | null
          created_at?: string | null
          created_by?: string | null
          desconto_valor?: number
          id?: string
          modelo_precificacao: string
          numero_parcelas_sugerido?: number
          ordem_servico_id: string
          origem_os_tipo: string
          primeiro_vencimento_sugerido?: string | null
          produto_id?: string | null
          status?: Database["public"]["Enums"]["faturamento_base_status"]
          subtotal?: number
          updated_at?: string | null
          valor_ha_snapshot?: number
          valor_total_faturavel?: number
          volume_total_ml_snapshot?: number
        }
        Update: {
          acrescimo_valor?: number
          area_hectares_snapshot?: number
          cliente_id?: string | null
          condicao_pagamento_snapshot?: string | null
          created_at?: string | null
          created_by?: string | null
          desconto_valor?: number
          id?: string
          modelo_precificacao?: string
          numero_parcelas_sugerido?: number
          ordem_servico_id?: string
          origem_os_tipo?: string
          primeiro_vencimento_sugerido?: string | null
          produto_id?: string | null
          status?: Database["public"]["Enums"]["faturamento_base_status"]
          subtotal?: number
          updated_at?: string | null
          valor_ha_snapshot?: number
          valor_total_faturavel?: number
          volume_total_ml_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_faturamento_base_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_faturamento_base_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_accounts: {
        Row: {
          ativo: boolean
          cep: string | null
          client_id: string | null
          cnpj: string | null
          codigo: string | null
          comissao_percentual: number | null
          commercial_city: string | null
          commercial_region: string | null
          commercial_state: string | null
          condicao_pagamento_padrao: string | null
          consultor_responsavel: string | null
          created_at: string
          created_by: string | null
          dados_bancarios: Json | null
          data_inicio_parceria: string | null
          deleted_at: string | null
          desconto_padrao: number
          email_comercial: string | null
          email_financeiro: string | null
          email_nfe: string | null
          endereco_bairro: string | null
          endereco_complemento: string | null
          endereco_entrega_igual_comercial: boolean
          endereco_logradouro: string | null
          endereco_numero: string | null
          entrega_bairro: string | null
          entrega_cep: string | null
          entrega_cidade: string | null
          entrega_complemento: string | null
          entrega_estado: string | null
          entrega_logradouro: string | null
          entrega_numero: string | null
          forma_pagamento_preferida: string | null
          id: string
          incoterm: string | null
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          limite_credito_brl: number | null
          marca_cor_primaria: string | null
          marca_logo_url: string | null
          marca_nome: string | null
          meta_mensal_brl: number | null
          nome_fantasia: string | null
          observacoes: string | null
          origem_parceiro: string | null
          partner_type: Database["public"]["Enums"]["partner_type_enum"] | null
          porte: Database["public"]["Enums"]["partner_porte"] | null
          prazo_pagamento_padrao_dias: number | null
          razao_social: string
          regime_tributario:
            | Database["public"]["Enums"]["partner_regime_tributario"]
            | null
          segmento: Database["public"]["Enums"]["partner_segmento"] | null
          site: string | null
          suframa: string | null
          telefone_comercial: string | null
          transportadora_preferida: string | null
          updated_at: string
          whatsapp_comercial: string | null
        }
        Insert: {
          ativo?: boolean
          cep?: string | null
          client_id?: string | null
          cnpj?: string | null
          codigo?: string | null
          comissao_percentual?: number | null
          commercial_city?: string | null
          commercial_region?: string | null
          commercial_state?: string | null
          condicao_pagamento_padrao?: string | null
          consultor_responsavel?: string | null
          created_at?: string
          created_by?: string | null
          dados_bancarios?: Json | null
          data_inicio_parceria?: string | null
          deleted_at?: string | null
          desconto_padrao?: number
          email_comercial?: string | null
          email_financeiro?: string | null
          email_nfe?: string | null
          endereco_bairro?: string | null
          endereco_complemento?: string | null
          endereco_entrega_igual_comercial?: boolean
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          entrega_bairro?: string | null
          entrega_cep?: string | null
          entrega_cidade?: string | null
          entrega_complemento?: string | null
          entrega_estado?: string | null
          entrega_logradouro?: string | null
          entrega_numero?: string | null
          forma_pagamento_preferida?: string | null
          id?: string
          incoterm?: string | null
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          limite_credito_brl?: number | null
          marca_cor_primaria?: string | null
          marca_logo_url?: string | null
          marca_nome?: string | null
          meta_mensal_brl?: number | null
          nome_fantasia?: string | null
          observacoes?: string | null
          origem_parceiro?: string | null
          partner_type?: Database["public"]["Enums"]["partner_type_enum"] | null
          porte?: Database["public"]["Enums"]["partner_porte"] | null
          prazo_pagamento_padrao_dias?: number | null
          razao_social: string
          regime_tributario?:
            | Database["public"]["Enums"]["partner_regime_tributario"]
            | null
          segmento?: Database["public"]["Enums"]["partner_segmento"] | null
          site?: string | null
          suframa?: string | null
          telefone_comercial?: string | null
          transportadora_preferida?: string | null
          updated_at?: string
          whatsapp_comercial?: string | null
        }
        Update: {
          ativo?: boolean
          cep?: string | null
          client_id?: string | null
          cnpj?: string | null
          codigo?: string | null
          comissao_percentual?: number | null
          commercial_city?: string | null
          commercial_region?: string | null
          commercial_state?: string | null
          condicao_pagamento_padrao?: string | null
          consultor_responsavel?: string | null
          created_at?: string
          created_by?: string | null
          dados_bancarios?: Json | null
          data_inicio_parceria?: string | null
          deleted_at?: string | null
          desconto_padrao?: number
          email_comercial?: string | null
          email_financeiro?: string | null
          email_nfe?: string | null
          endereco_bairro?: string | null
          endereco_complemento?: string | null
          endereco_entrega_igual_comercial?: boolean
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          entrega_bairro?: string | null
          entrega_cep?: string | null
          entrega_cidade?: string | null
          entrega_complemento?: string | null
          entrega_estado?: string | null
          entrega_logradouro?: string | null
          entrega_numero?: string | null
          forma_pagamento_preferida?: string | null
          id?: string
          incoterm?: string | null
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          limite_credito_brl?: number | null
          marca_cor_primaria?: string | null
          marca_logo_url?: string | null
          marca_nome?: string | null
          meta_mensal_brl?: number | null
          nome_fantasia?: string | null
          observacoes?: string | null
          origem_parceiro?: string | null
          partner_type?: Database["public"]["Enums"]["partner_type_enum"] | null
          porte?: Database["public"]["Enums"]["partner_porte"] | null
          prazo_pagamento_padrao_dias?: number | null
          razao_social?: string
          regime_tributario?:
            | Database["public"]["Enums"]["partner_regime_tributario"]
            | null
          segmento?: Database["public"]["Enums"]["partner_segmento"] | null
          site?: string | null
          suframa?: string | null
          telefone_comercial?: string | null
          transportadora_preferida?: string | null
          updated_at?: string
          whatsapp_comercial?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_accounts_consultor_responsavel_fkey"
            columns: ["consultor_responsavel"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_audit_logs: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          partner_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          partner_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          partner_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      partner_catalog_access_logs: {
        Row: {
          action: string
          cliente_id: string | null
          created_at: string
          details: Json | null
          id: string
          order_id: string | null
          partner_id: string | null
          role: string | null
          simulation_id: string | null
          target_user_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          cliente_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          order_id?: string | null
          partner_id?: string | null
          role?: string | null
          simulation_id?: string | null
          target_user_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          cliente_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          order_id?: string | null
          partner_id?: string | null
          role?: string | null
          simulation_id?: string | null
          target_user_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      partner_clients: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          cliente_id: string
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          cliente_id: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          cliente_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_clients_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_contacts: {
        Row: {
          cargo: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_principal: boolean
          nome: string
          observacoes: string | null
          partner_id: string
          setor: Database["public"]["Enums"]["partner_contact_setor"] | null
          telefone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_principal?: boolean
          nome: string
          observacoes?: string | null
          partner_id: string
          setor?: Database["public"]["Enums"]["partner_contact_setor"] | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_principal?: boolean
          nome?: string
          observacoes?: string | null
          partner_id?: string
          setor?: Database["public"]["Enums"]["partner_contact_setor"] | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_contacts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_contacts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_contacts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_contacts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_contacts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_contacts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_contacts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_documents: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          nome: string
          observacoes: string | null
          partner_id: string
          storage_path: string
          tamanho_bytes: number | null
          tipo: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          nome: string
          observacoes?: string | null
          partner_id: string
          storage_path: string
          tamanho_bytes?: number | null
          tipo: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          nome?: string
          observacoes?: string | null
          partner_id?: string
          storage_path?: string
          tamanho_bytes?: number | null
          tipo?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_engagement_metrics: {
        Row: {
          campanhas_usadas: Json
          dias_sem_compra: number | null
          partner_id: string
          pedidos_30d: number
          pedidos_90d: number
          top_produtos: Json
          ultima_compra: string | null
          updated_at: string
        }
        Insert: {
          campanhas_usadas?: Json
          dias_sem_compra?: number | null
          partner_id: string
          pedidos_30d?: number
          pedidos_90d?: number
          top_produtos?: Json
          ultima_compra?: string | null
          updated_at?: string
        }
        Update: {
          campanhas_usadas?: Json
          dias_sem_compra?: number | null
          partner_id?: string
          pedidos_30d?: number
          pedidos_90d?: number
          top_produtos?: Json
          ultima_compra?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_engagement_metrics_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_engagement_metrics_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_engagement_metrics_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_engagement_metrics_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_engagement_metrics_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_engagement_metrics_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_engagement_metrics_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_financial_settings: {
        Row: {
          active: boolean
          auto_generate_receivable: boolean
          billing_trigger: string
          block_if_overdue: boolean
          created_at: string
          credit_alert_threshold_1: number
          credit_alert_threshold_2: number
          credit_limit: number | null
          credit_limit_action: string
          default_payment_method: string | null
          id: string
          overdue_tolerance_days: number
          partner_id: string
          payment_terms_days: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_generate_receivable?: boolean
          billing_trigger?: string
          block_if_overdue?: boolean
          created_at?: string
          credit_alert_threshold_1?: number
          credit_alert_threshold_2?: number
          credit_limit?: number | null
          credit_limit_action?: string
          default_payment_method?: string | null
          id?: string
          overdue_tolerance_days?: number
          partner_id: string
          payment_terms_days?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_generate_receivable?: boolean
          billing_trigger?: string
          block_if_overdue?: boolean
          created_at?: string
          credit_alert_threshold_1?: number
          credit_alert_threshold_2?: number
          credit_limit?: number | null
          credit_limit_action?: string
          default_payment_method?: string | null
          id?: string
          overdue_tolerance_days?: number
          partner_id?: string
          payment_terms_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_financial_settings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_financial_settings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_financial_settings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_financial_settings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_financial_settings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_financial_settings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_financial_settings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_order_audit_logs: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          order_id: string | null
          partner_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          order_id?: string | null
          partner_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          order_id?: string | null
          partner_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      partner_order_financial_links: {
        Row: {
          billing_trigger: string | null
          created_at: string
          created_by: string | null
          financial_status: string
          id: string
          partner_id: string
          partner_order_id: string
          receivable_id: string
          updated_at: string
        }
        Insert: {
          billing_trigger?: string | null
          created_at?: string
          created_by?: string | null
          financial_status?: string
          id?: string
          partner_id: string
          partner_order_id: string
          receivable_id: string
          updated_at?: string
        }
        Update: {
          billing_trigger?: string | null
          created_at?: string
          created_by?: string | null
          financial_status?: string
          id?: string
          partner_id?: string
          partner_order_id?: string
          receivable_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_order_financial_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_financial_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_financial_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_financial_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_financial_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_financial_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_financial_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_financial_links_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: true
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_financial_links_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_order_idempotency: {
        Row: {
          cart_hash: string
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          order_id: string | null
          partner_id: string
          request_fingerprint: string | null
          result_snapshot: Json
          updated_at: string
        }
        Insert: {
          cart_hash: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          order_id?: string | null
          partner_id: string
          request_fingerprint?: string | null
          result_snapshot?: Json
          updated_at?: string
        }
        Update: {
          cart_hash?: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          order_id?: string | null
          partner_id?: string
          request_fingerprint?: string | null
          result_snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_order_idempotency_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_idempotency_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_idempotency_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_idempotency_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_idempotency_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_idempotency_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_idempotency_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_idempotency_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_order_items: {
        Row: {
          base_price_snapshot: number | null
          condition_price_snapshot: number | null
          created_at: string
          desconto_percentual: number
          desconto_percentual_snapshot: number | null
          id: string
          microrganismo_id: string | null
          order_id: string
          plan_discount_percent_snapshot: number | null
          preco_tabela_snapshot: number | null
          preco_unitario: number
          preco_unitario_final_snapshot: number | null
          price_rule_id_snapshot: string | null
          price_source_snapshot: string | null
          pricing_mode_snapshot: string | null
          product_id: string | null
          produto_codigo_snapshot: string | null
          produto_nome_snapshot: string | null
          quantidade: number
          subtotal: number
          unidade_medida: string
          unit_type_snapshot: string | null
          volume_ml: number | null
          volume_ml_snapshot: number | null
        }
        Insert: {
          base_price_snapshot?: number | null
          condition_price_snapshot?: number | null
          created_at?: string
          desconto_percentual?: number
          desconto_percentual_snapshot?: number | null
          id?: string
          microrganismo_id?: string | null
          order_id: string
          plan_discount_percent_snapshot?: number | null
          preco_tabela_snapshot?: number | null
          preco_unitario?: number
          preco_unitario_final_snapshot?: number | null
          price_rule_id_snapshot?: string | null
          price_source_snapshot?: string | null
          pricing_mode_snapshot?: string | null
          product_id?: string | null
          produto_codigo_snapshot?: string | null
          produto_nome_snapshot?: string | null
          quantidade: number
          subtotal?: number
          unidade_medida?: string
          unit_type_snapshot?: string | null
          volume_ml?: number | null
          volume_ml_snapshot?: number | null
        }
        Update: {
          base_price_snapshot?: number | null
          condition_price_snapshot?: number | null
          created_at?: string
          desconto_percentual?: number
          desconto_percentual_snapshot?: number | null
          id?: string
          microrganismo_id?: string | null
          order_id?: string
          plan_discount_percent_snapshot?: number | null
          preco_tabela_snapshot?: number | null
          preco_unitario?: number
          preco_unitario_final_snapshot?: number | null
          price_rule_id_snapshot?: string | null
          price_source_snapshot?: string | null
          pricing_mode_snapshot?: string | null
          product_id?: string | null
          produto_codigo_snapshot?: string | null
          produto_nome_snapshot?: string | null
          quantidade?: number
          subtotal?: number
          unidade_medida?: string
          unit_type_snapshot?: string | null
          volume_ml?: number | null
          volume_ml_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_order_items_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_items_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "partner_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poi_price_rule_snapshot_fk"
            columns: ["price_rule_id_snapshot"]
            isOneToOne: false
            referencedRelation: "commercial_price_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_order_message_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_order_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "partner_order_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_order_messages: {
        Row: {
          autor_id: string | null
          autor_tipo: Database["public"]["Enums"]["order_message_author"]
          created_at: string
          id: string
          mensagem: string
          order_id: string
          status: string
          status_updated_at: string | null
        }
        Insert: {
          autor_id?: string | null
          autor_tipo: Database["public"]["Enums"]["order_message_author"]
          created_at?: string
          id?: string
          mensagem: string
          order_id: string
          status?: string
          status_updated_at?: string | null
        }
        Update: {
          autor_id?: string | null
          autor_tipo?: Database["public"]["Enums"]["order_message_author"]
          created_at?: string
          id?: string
          mensagem?: string
          order_id?: string
          status?: string
          status_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_order_payment_schedule: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          installment_number: number
          interest_amount: number | null
          partner_order_id: string
          payment_terms_id: string
          principal_amount: number | null
          receivable_installment_id: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          interest_amount?: number | null
          partner_order_id: string
          payment_terms_id: string
          principal_amount?: number | null
          receivable_installment_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          interest_amount?: number | null
          partner_order_id?: string
          payment_terms_id?: string
          principal_amount?: number | null
          receivable_installment_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_order_payment_schedule_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_payment_schedule_payment_terms_id_fkey"
            columns: ["payment_terms_id"]
            isOneToOne: false
            referencedRelation: "partner_order_payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_payment_schedule_receivable_installment_id_fkey"
            columns: ["receivable_installment_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_order_payment_terms: {
        Row: {
          approval_notes: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          credit_decision_snapshot: Json | null
          discount_amount: number
          discount_percent_snapshot: number
          final_amount: number
          financial_interest_amount: number
          first_due_date: string
          id: string
          installment_count: number
          interest_type_snapshot: string
          monthly_interest_percent_snapshot: number
          months_count_snapshot: number
          net_amount_after_discount: number
          partner_order_id: string
          payment_plan_id: string | null
          plan_code_snapshot: string
          plan_name_snapshot: string
          pricing_mode_snapshot: string | null
          table_amount: number
          updated_at: string
        }
        Insert: {
          approval_notes?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_decision_snapshot?: Json | null
          discount_amount?: number
          discount_percent_snapshot: number
          final_amount?: number
          financial_interest_amount?: number
          first_due_date: string
          id?: string
          installment_count?: number
          interest_type_snapshot?: string
          monthly_interest_percent_snapshot: number
          months_count_snapshot: number
          net_amount_after_discount?: number
          partner_order_id: string
          payment_plan_id?: string | null
          plan_code_snapshot: string
          plan_name_snapshot: string
          pricing_mode_snapshot?: string | null
          table_amount?: number
          updated_at?: string
        }
        Update: {
          approval_notes?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_decision_snapshot?: Json | null
          discount_amount?: number
          discount_percent_snapshot?: number
          final_amount?: number
          financial_interest_amount?: number
          first_due_date?: string
          id?: string
          installment_count?: number
          interest_type_snapshot?: string
          monthly_interest_percent_snapshot?: number
          months_count_snapshot?: number
          net_amount_after_discount?: number
          partner_order_id?: string
          payment_plan_id?: string | null
          plan_code_snapshot?: string
          plan_name_snapshot?: string
          pricing_mode_snapshot?: string | null
          table_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_order_payment_terms_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_payment_terms_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_order_sla_config: {
        Row: {
          ativo: boolean
          created_at: string
          fase: string
          id: string
          prazo_horas: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          fase: string
          id?: string
          prazo_horas: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          fase?: string
          id?: string
          prazo_horas?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      partner_order_templates: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          favorito: boolean
          id: string
          itens: Json
          nome: string
          partner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          favorito?: boolean
          id?: string
          itens?: Json
          nome: string
          partner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          favorito?: boolean
          id?: string
          itens?: Json
          nome?: string
          partner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_order_templates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_templates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_templates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_order_templates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_templates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_templates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_order_templates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_orders: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          area_total_ha: number | null
          cliente_id: string | null
          commercial_discount_amount: number | null
          commercial_notes: string | null
          created_at: string
          created_by: string | null
          credit_approval_notes: string | null
          credit_approved_at: string | null
          credit_approved_by: string | null
          credit_block_reason: string | null
          cultura: string | null
          desconto_total: number
          estimated_delivery_date: string | null
          final_amount_with_interest: number | null
          financial_approval_status: string
          financial_interest_amount: number | null
          financial_status: string
          future_financial_link: string | null
          id: string
          itens_pendentes_motivo: string | null
          itens_pendentes_resolvido_em: string | null
          itens_pendentes_solicitado_em: string | null
          itens_pendentes_solicitado_por: string | null
          net_amount_after_discount: number | null
          numero: string
          observacoes: string | null
          origin_simulation_id: string | null
          partner_id: string
          payment_condition_status: string
          payment_due_date: string | null
          payment_method: string | null
          payment_plan_id: string | null
          payment_terms_id: string | null
          priority: Database["public"]["Enums"]["partner_order_priority"]
          ready_for_production: boolean
          receivable_generated: boolean
          receivable_generated_at: string | null
          receivable_generated_by: string | null
          requested_delivery_date: string | null
          requires_financial_approval: boolean
          status: Database["public"]["Enums"]["partner_order_status"]
          subtotal: number
          table_amount: number | null
          total: number
          updated_at: string
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          area_total_ha?: number | null
          cliente_id?: string | null
          commercial_discount_amount?: number | null
          commercial_notes?: string | null
          created_at?: string
          created_by?: string | null
          credit_approval_notes?: string | null
          credit_approved_at?: string | null
          credit_approved_by?: string | null
          credit_block_reason?: string | null
          cultura?: string | null
          desconto_total?: number
          estimated_delivery_date?: string | null
          final_amount_with_interest?: number | null
          financial_approval_status?: string
          financial_interest_amount?: number | null
          financial_status?: string
          future_financial_link?: string | null
          id?: string
          itens_pendentes_motivo?: string | null
          itens_pendentes_resolvido_em?: string | null
          itens_pendentes_solicitado_em?: string | null
          itens_pendentes_solicitado_por?: string | null
          net_amount_after_discount?: number | null
          numero?: string
          observacoes?: string | null
          origin_simulation_id?: string | null
          partner_id: string
          payment_condition_status?: string
          payment_due_date?: string | null
          payment_method?: string | null
          payment_plan_id?: string | null
          payment_terms_id?: string | null
          priority?: Database["public"]["Enums"]["partner_order_priority"]
          ready_for_production?: boolean
          receivable_generated?: boolean
          receivable_generated_at?: string | null
          receivable_generated_by?: string | null
          requested_delivery_date?: string | null
          requires_financial_approval?: boolean
          status?: Database["public"]["Enums"]["partner_order_status"]
          subtotal?: number
          table_amount?: number | null
          total?: number
          updated_at?: string
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          area_total_ha?: number | null
          cliente_id?: string | null
          commercial_discount_amount?: number | null
          commercial_notes?: string | null
          created_at?: string
          created_by?: string | null
          credit_approval_notes?: string | null
          credit_approved_at?: string | null
          credit_approved_by?: string | null
          credit_block_reason?: string | null
          cultura?: string | null
          desconto_total?: number
          estimated_delivery_date?: string | null
          final_amount_with_interest?: number | null
          financial_approval_status?: string
          financial_interest_amount?: number | null
          financial_status?: string
          future_financial_link?: string | null
          id?: string
          itens_pendentes_motivo?: string | null
          itens_pendentes_resolvido_em?: string | null
          itens_pendentes_solicitado_em?: string | null
          itens_pendentes_solicitado_por?: string | null
          net_amount_after_discount?: number | null
          numero?: string
          observacoes?: string | null
          origin_simulation_id?: string | null
          partner_id?: string
          payment_condition_status?: string
          payment_due_date?: string | null
          payment_method?: string | null
          payment_plan_id?: string | null
          payment_terms_id?: string | null
          priority?: Database["public"]["Enums"]["partner_order_priority"]
          ready_for_production?: boolean
          receivable_generated?: boolean
          receivable_generated_at?: string | null
          receivable_generated_by?: string | null
          requested_delivery_date?: string | null
          requires_financial_approval?: boolean
          status?: Database["public"]["Enums"]["partner_order_status"]
          subtotal?: number
          table_amount?: number | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_orders_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_orders_origin_simulation_id_fkey"
            columns: ["origin_simulation_id"]
            isOneToOne: false
            referencedRelation: "partner_simulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_orders_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_orders_payment_terms_id_fkey"
            columns: ["payment_terms_id"]
            isOneToOne: false
            referencedRelation: "partner_order_payment_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_product_prices: {
        Row: {
          ativo: boolean
          created_at: string
          desconto_percentual: number
          id: string
          is_current: boolean
          microrganismo_id: string | null
          partner_id: string
          preco_final: number | null
          preco_tabela: number
          price_table_name: string | null
          product_id: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          desconto_percentual?: number
          id?: string
          is_current?: boolean
          microrganismo_id?: string | null
          partner_id: string
          preco_final?: number | null
          preco_tabela?: number
          price_table_name?: string | null
          product_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          desconto_percentual?: number
          id?: string
          is_current?: boolean
          microrganismo_id?: string | null
          partner_id?: string
          preco_final?: number | null
          preco_tabela?: number
          price_table_name?: string | null
          product_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_product_prices_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_prices_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "partner_product_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_product_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_product_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_product_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_product_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_product_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_risk_scores: {
        Row: {
          calculado_em: string
          created_at: string
          dias_medio_atraso: number
          freq_compras_30d: number
          id: string
          meses_relacionamento: number
          partner_id: string
          pct_credito_utilizado: number
          risk_level: string
          score: number
          titulos_vencidos: number
          updated_at: string
        }
        Insert: {
          calculado_em?: string
          created_at?: string
          dias_medio_atraso?: number
          freq_compras_30d?: number
          id?: string
          meses_relacionamento?: number
          partner_id: string
          pct_credito_utilizado?: number
          risk_level?: string
          score?: number
          titulos_vencidos?: number
          updated_at?: string
        }
        Update: {
          calculado_em?: string
          created_at?: string
          dias_medio_atraso?: number
          freq_compras_30d?: number
          id?: string
          meses_relacionamento?: number
          partner_id?: string
          pct_credito_utilizado?: number
          risk_level?: string
          score?: number
          titulos_vencidos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_risk_scores_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_risk_scores_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_risk_scores_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_risk_scores_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_risk_scores_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_risk_scores_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_risk_scores_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_simulation_items: {
        Row: {
          area_ha: number | null
          created_at: string
          desconto_percentual: number | null
          id: string
          item_id: string
          item_tipo: string
          microrganismo_id: string | null
          nome: string
          preco_tabela_snapshot: number | null
          preco_unitario: number | null
          product_id: string | null
          produto_codigo_snapshot: string | null
          produto_nome_snapshot: string | null
          quantidade: number
          simulation_id: string
          subtotal: number
          unidade_medida: string | null
          valor_unitario_cheio: number
          volume_id: string | null
          volume_ml: number | null
          volume_rotulo: string | null
        }
        Insert: {
          area_ha?: number | null
          created_at?: string
          desconto_percentual?: number | null
          id?: string
          item_id: string
          item_tipo: string
          microrganismo_id?: string | null
          nome: string
          preco_tabela_snapshot?: number | null
          preco_unitario?: number | null
          product_id?: string | null
          produto_codigo_snapshot?: string | null
          produto_nome_snapshot?: string | null
          quantidade?: number
          simulation_id: string
          subtotal?: number
          unidade_medida?: string | null
          valor_unitario_cheio?: number
          volume_id?: string | null
          volume_ml?: number | null
          volume_rotulo?: string | null
        }
        Update: {
          area_ha?: number | null
          created_at?: string
          desconto_percentual?: number | null
          id?: string
          item_id?: string
          item_tipo?: string
          microrganismo_id?: string | null
          nome?: string
          preco_tabela_snapshot?: number | null
          preco_unitario?: number | null
          product_id?: string | null
          produto_codigo_snapshot?: string | null
          produto_nome_snapshot?: string | null
          quantidade?: number
          simulation_id?: string
          subtotal?: number
          unidade_medida?: string | null
          valor_unitario_cheio?: number
          volume_id?: string | null
          volume_ml?: number | null
          volume_rotulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_simulation_items_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_simulation_items_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "partner_simulation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_simulation_items_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "partner_simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_simulations: {
        Row: {
          area_total_ha: number | null
          cliente_cidade_snapshot: string | null
          cliente_id: string | null
          cliente_nome_snapshot: string | null
          cliente_uf_snapshot: string | null
          converted_at: string | null
          converted_by: string | null
          converted_order_id: string | null
          created_at: string
          created_by: string
          cultura: string | null
          id: string
          objetivo_tecnico: string | null
          observacoes: string | null
          partner_id: string
          propriedade_nome_snapshot: string | null
          status: string
          titulo: string | null
          total_cheio: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          area_total_ha?: number | null
          cliente_cidade_snapshot?: string | null
          cliente_id?: string | null
          cliente_nome_snapshot?: string | null
          cliente_uf_snapshot?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_order_id?: string | null
          created_at?: string
          created_by: string
          cultura?: string | null
          id?: string
          objetivo_tecnico?: string | null
          observacoes?: string | null
          partner_id: string
          propriedade_nome_snapshot?: string | null
          status?: string
          titulo?: string | null
          total_cheio?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          area_total_ha?: number | null
          cliente_cidade_snapshot?: string | null
          cliente_id?: string | null
          cliente_nome_snapshot?: string | null
          cliente_uf_snapshot?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_order_id?: string | null
          created_at?: string
          created_by?: string
          cultura?: string | null
          id?: string
          objetivo_tecnico?: string | null
          observacoes?: string | null
          partner_id?: string
          propriedade_nome_snapshot?: string | null
          status?: string
          titulo?: string | null
          total_cheio?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_simulations_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_simulations_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_simulations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_simulations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_simulations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_simulations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_simulations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_simulations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_simulations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_technician_clients: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          cliente_id: string
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          technician_user_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          cliente_id: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          technician_user_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          cliente_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          technician_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_technician_clients_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_technician_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_technician_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_technician_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_technician_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_technician_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_technician_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_technician_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_user_clients: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          assignment_type: string
          can_create_simulation: boolean
          can_monitor: boolean
          cliente_id: string
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          updated_at: string
          user_id: string
          user_role: string | null
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          assignment_type?: string
          can_create_simulation?: boolean
          can_monitor?: boolean
          cliente_id: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          updated_at?: string
          user_id: string
          user_role?: string | null
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          assignment_type?: string
          can_create_simulation?: boolean
          can_monitor?: boolean
          cliente_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          updated_at?: string
          user_id?: string
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_user_clients_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_user_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_user_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_user_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_user_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_user_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_user_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_user_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_users: {
        Row: {
          created_at: string
          id: string
          papel: string
          partner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          papel?: string
          partner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          papel?: string
          partner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_users_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_users_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_users_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_users_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_users_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_users_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_users_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      payable_allocation_versions: {
        Row: {
          allocations: Json
          created_at: string
          created_by: string
          id: string
          payable_id: string
          reason: string
          request_fingerprint: string
          request_key: string
          total_amount: number
          version: number
        }
        Insert: {
          allocations: Json
          created_at?: string
          created_by: string
          id?: string
          payable_id: string
          reason: string
          request_fingerprint: string
          request_key: string
          total_amount: number
          version: number
        }
        Update: {
          allocations?: Json
          created_at?: string
          created_by?: string
          id?: string
          payable_id?: string
          reason?: string
          request_fingerprint?: string
          request_key?: string
          total_amount?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payable_allocation_versions_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
        ]
      }
      payable_payments: {
        Row: {
          amount_paid: number
          bank_account_id: string | null
          created_at: string
          created_by: string
          discount_amount: number
          id: string
          idempotency_key: string | null
          installment_id: string
          interest_amount: number
          is_reversal: boolean
          notes: string | null
          organization_id: string | null
          payment_date: string
          payment_method_id: string
          penalty_amount: number
          request_fingerprint: string | null
          reversal_reason: string | null
          reversed_payment_id: string | null
        }
        Insert: {
          amount_paid: number
          bank_account_id?: string | null
          created_at?: string
          created_by: string
          discount_amount?: number
          id?: string
          idempotency_key?: string | null
          installment_id: string
          interest_amount?: number
          is_reversal?: boolean
          notes?: string | null
          organization_id?: string | null
          payment_date?: string
          payment_method_id: string
          penalty_amount?: number
          request_fingerprint?: string | null
          reversal_reason?: string | null
          reversed_payment_id?: string | null
        }
        Update: {
          amount_paid?: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string
          discount_amount?: number
          id?: string
          idempotency_key?: string | null
          installment_id?: string
          interest_amount?: number
          is_reversal?: boolean
          notes?: string | null
          organization_id?: string | null
          payment_date?: string
          payment_method_id?: string
          penalty_amount?: number
          request_fingerprint?: string | null
          reversal_reason?: string | null
          reversed_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payable_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payable_payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payable_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payable_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payable_payments_reversed_payment_id_fkey"
            columns: ["reversed_payment_id"]
            isOneToOne: false
            referencedRelation: "payable_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      platform_org_admin_invites: {
        Row: {
          attempt_count: number
          auth_created_at: string | null
          concluido_em: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string
          email_accepted_at: string | null
          email_attempt_count: number
          email_delivery_status: string
          email_failed_at: string | null
          email_idempotency_key: string
          email_last_attempt_at: string | null
          email_last_error_code: string | null
          email_lease_expires_at: string | null
          email_lease_token: string | null
          email_next_attempt_at: string
          id: string
          invited_by: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          modo_acesso: string
          nome: string
          organization_id: string
          request_id: string
          responsavel_principal: boolean
          status: string
          telefone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempt_count?: number
          auth_created_at?: string | null
          concluido_em?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email: string
          email_accepted_at?: string | null
          email_attempt_count?: number
          email_delivery_status?: string
          email_failed_at?: string | null
          email_idempotency_key?: string
          email_last_attempt_at?: string | null
          email_last_error_code?: string | null
          email_lease_expires_at?: string | null
          email_lease_token?: string | null
          email_next_attempt_at?: string
          id?: string
          invited_by: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          modo_acesso: string
          nome: string
          organization_id: string
          request_id?: string
          responsavel_principal?: boolean
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempt_count?: number
          auth_created_at?: string | null
          concluido_em?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string
          email_accepted_at?: string | null
          email_attempt_count?: number
          email_delivery_status?: string
          email_failed_at?: string | null
          email_idempotency_key?: string
          email_last_attempt_at?: string | null
          email_last_error_code?: string | null
          email_lease_expires_at?: string | null
          email_lease_token?: string | null
          email_next_attempt_at?: string
          id?: string
          invited_by?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          modo_acesso?: string
          nome?: string
          organization_id?: string
          request_id?: string
          responsavel_principal?: boolean
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_org_admin_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_notificacoes: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          lido: boolean
          link: string | null
          mensagem: string | null
          source_id: string | null
          source_type: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacao_portal"]
          titulo: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          lido?: boolean
          link?: string | null
          mensagem?: string | null
          source_id?: string | null
          source_type?: string | null
          tipo?: Database["public"]["Enums"]["tipo_notificacao_portal"]
          titulo: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          lido?: boolean
          link?: string | null
          mensagem?: string | null
          source_id?: string | null
          source_type?: string | null
          tipo?: Database["public"]["Enums"]["tipo_notificacao_portal"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_notificacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_solicitacoes: {
        Row: {
          audio_inicial_path: string | null
          audio_inicial_url: string | null
          cliente_id: string
          confirmacao_produtor: string | null
          consultor_atribuido: string | null
          created_at: string
          created_by: string | null
          data_prevista_atendimento: string | null
          descricao: string | null
          duracao_estimada: number | null
          external_event_id: string | null
          fazenda_id: string | null
          fotos_iniciais: string[] | null
          fotos_paths: string[] | null
          id: string
          numero_solicitacao: string | null
          origem_solicitacao: string | null
          registro_origem_id: string | null
          solicitante_contato: string | null
          solicitante_nome: string | null
          status: string
          talhao_id: string | null
          tipo_demanda: string
          updated_at: string
          urgencia: string
          user_id: string
        }
        Insert: {
          audio_inicial_path?: string | null
          audio_inicial_url?: string | null
          cliente_id: string
          confirmacao_produtor?: string | null
          consultor_atribuido?: string | null
          created_at?: string
          created_by?: string | null
          data_prevista_atendimento?: string | null
          descricao?: string | null
          duracao_estimada?: number | null
          external_event_id?: string | null
          fazenda_id?: string | null
          fotos_iniciais?: string[] | null
          fotos_paths?: string[] | null
          id?: string
          numero_solicitacao?: string | null
          origem_solicitacao?: string | null
          registro_origem_id?: string | null
          solicitante_contato?: string | null
          solicitante_nome?: string | null
          status?: string
          talhao_id?: string | null
          tipo_demanda: string
          updated_at?: string
          urgencia?: string
          user_id: string
        }
        Update: {
          audio_inicial_path?: string | null
          audio_inicial_url?: string | null
          cliente_id?: string
          confirmacao_produtor?: string | null
          consultor_atribuido?: string | null
          created_at?: string
          created_by?: string | null
          data_prevista_atendimento?: string | null
          descricao?: string | null
          duracao_estimada?: number | null
          external_event_id?: string | null
          fazenda_id?: string | null
          fotos_iniciais?: string[] | null
          fotos_paths?: string[] | null
          id?: string
          numero_solicitacao?: string | null
          origem_solicitacao?: string | null
          registro_origem_id?: string | null
          solicitante_contato?: string | null
          solicitante_nome?: string | null
          status?: string
          talhao_id?: string | null
          tipo_demanda?: string
          updated_at?: string
          urgencia?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_solicitacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_solicitacoes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_solicitacoes_registro_origem_id_fkey"
            columns: ["registro_origem_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_solicitacoes_talhao_id_fkey"
            columns: ["talhao_id"]
            isOneToOne: false
            referencedRelation: "talhoes"
            referencedColumns: ["id"]
          },
        ]
      }
      product_crop_recommendations: {
        Row: {
          ativo: boolean
          created_at: string
          cultura_id: string | null
          cultura_nome: string | null
          dose_recomendada: string | null
          fase_recomendada: string | null
          id: string
          objetivo_uso: string | null
          observacao: string | null
          produto_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          cultura_id?: string | null
          cultura_nome?: string | null
          dose_recomendada?: string | null
          fase_recomendada?: string | null
          id?: string
          objetivo_uso?: string | null
          observacao?: string | null
          produto_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          cultura_id?: string | null
          cultura_nome?: string | null
          dose_recomendada?: string | null
          fase_recomendada?: string | null
          id?: string
          objetivo_uso?: string | null
          observacao?: string | null
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_crop_recommendations_cultura_id_fkey"
            columns: ["cultura_id"]
            isOneToOne: false
            referencedRelation: "culturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_crop_recommendations_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      product_fiscal_profiles: {
        Row: {
          accounting_notes: string | null
          accounting_validated_at: string | null
          accounting_validated_by: string | null
          approximate_tax_source: string | null
          cest: string | null
          cfop_in_state: string | null
          cfop_interstate: string | null
          cofins_cst: string | null
          commercial_unit: string | null
          created_at: string
          created_by: string | null
          fiscal_description: string | null
          gtin: string | null
          ibs_cbs_configuration: Json
          icms_csosn: string | null
          icms_cst: string | null
          id: string
          ipi_cst: string | null
          is_active: boolean
          ncm: string | null
          origin_code: string | null
          pis_cst: string | null
          product_id: string
          profile_status: string
          tax_benefit_code: string | null
          taxable_gtin: string | null
          taxable_unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accounting_notes?: string | null
          accounting_validated_at?: string | null
          accounting_validated_by?: string | null
          approximate_tax_source?: string | null
          cest?: string | null
          cfop_in_state?: string | null
          cfop_interstate?: string | null
          cofins_cst?: string | null
          commercial_unit?: string | null
          created_at?: string
          created_by?: string | null
          fiscal_description?: string | null
          gtin?: string | null
          ibs_cbs_configuration?: Json
          icms_csosn?: string | null
          icms_cst?: string | null
          id?: string
          ipi_cst?: string | null
          is_active?: boolean
          ncm?: string | null
          origin_code?: string | null
          pis_cst?: string | null
          product_id: string
          profile_status?: string
          tax_benefit_code?: string | null
          taxable_gtin?: string | null
          taxable_unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accounting_notes?: string | null
          accounting_validated_at?: string | null
          accounting_validated_by?: string | null
          approximate_tax_source?: string | null
          cest?: string | null
          cfop_in_state?: string | null
          cfop_interstate?: string | null
          cofins_cst?: string | null
          commercial_unit?: string | null
          created_at?: string
          created_by?: string | null
          fiscal_description?: string | null
          gtin?: string | null
          ibs_cbs_configuration?: Json
          icms_csosn?: string | null
          icms_cst?: string | null
          id?: string
          ipi_cst?: string | null
          is_active?: boolean
          ncm?: string | null
          origin_code?: string | null
          pis_cst?: string | null
          product_id?: string
          profile_status?: string
          tax_benefit_code?: string | null
          taxable_gtin?: string | null
          taxable_unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_fiscal_profiles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      product_target_recommendations: {
        Row: {
          alvo_nome: string
          alvo_tipo: string
          ativo: boolean
          catalogo_alvo_id: string | null
          created_at: string
          descricao: string | null
          id: string
          prioridade: number
          produto_id: string
        }
        Insert: {
          alvo_nome: string
          alvo_tipo: string
          ativo?: boolean
          catalogo_alvo_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          prioridade?: number
          produto_id: string
        }
        Update: {
          alvo_nome?: string
          alvo_tipo?: string
          ativo?: boolean
          catalogo_alvo_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          prioridade?: number
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_target_recommendations_catalogo_alvo_id_fkey"
            columns: ["catalogo_alvo_id"]
            isOneToOne: false
            referencedRelation: "catalogo_alvos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_target_recommendations_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      product_technical_profiles: {
        Row: {
          beneficio_combinado: string | null
          compatibilidade: string | null
          created_at: string
          created_by: string | null
          cuidados_aplicacao: string | null
          explicacao_b2b: string | null
          explicacao_produtor: string | null
          explicacao_tecnica: string | null
          id: string
          indicacoes_uso: string | null
          janela_aplicacao: string | null
          observacoes_regulatorias: string | null
          produto_id: string
          resumo_curto: string | null
          status_validacao: string
          updated_at: string
          updated_by: string | null
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          beneficio_combinado?: string | null
          compatibilidade?: string | null
          created_at?: string
          created_by?: string | null
          cuidados_aplicacao?: string | null
          explicacao_b2b?: string | null
          explicacao_produtor?: string | null
          explicacao_tecnica?: string | null
          id?: string
          indicacoes_uso?: string | null
          janela_aplicacao?: string | null
          observacoes_regulatorias?: string | null
          produto_id: string
          resumo_curto?: string | null
          status_validacao?: string
          updated_at?: string
          updated_by?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          beneficio_combinado?: string | null
          compatibilidade?: string | null
          created_at?: string
          created_by?: string | null
          cuidados_aplicacao?: string | null
          explicacao_b2b?: string | null
          explicacao_produtor?: string | null
          explicacao_tecnica?: string | null
          id?: string
          indicacoes_uso?: string | null
          janela_aplicacao?: string | null
          observacoes_regulatorias?: string | null
          produto_id?: string
          resumo_curto?: string | null
          status_validacao?: string
          updated_at?: string
          updated_by?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_technical_profiles_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_link: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ordem_servico_id: string
          partner_order_id: string
          partner_order_item_id: string
          planning_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          ordem_servico_id: string
          partner_order_id: string
          partner_order_item_id: string
          planning_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          ordem_servico_id?: string
          partner_order_id?: string
          partner_order_item_id?: string
          planning_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_link_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_link_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_link_partner_order_item_id_fkey"
            columns: ["partner_order_item_id"]
            isOneToOne: true
            referencedRelation: "partner_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_link_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "production_planning"
            referencedColumns: ["id"]
          },
        ]
      }
      production_planning: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          partner_id: string
          partner_order_id: string
          planned_finish_date: string | null
          planned_start_date: string | null
          production_notes: string | null
          status: Database["public"]["Enums"]["production_planning_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          partner_id: string
          partner_order_id: string
          planned_finish_date?: string | null
          planned_start_date?: string | null
          production_notes?: string | null
          status?: Database["public"]["Enums"]["production_planning_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          partner_id?: string
          partner_order_id?: string
          planned_finish_date?: string | null
          planned_start_date?: string | null
          production_notes?: string | null
          status?: Database["public"]["Enums"]["production_planning_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_planning_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "production_planning_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "production_planning_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_planning_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_engagement"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "production_planning_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_commercial_revenue"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "production_planning_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "production_planning_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "vw_partner_commercial_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "production_planning_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: true
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_planning_publications: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          os_created: number
          partner_order_id: string
          performed_by: string | null
          planning_id: string
          resultado: Json
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          os_created?: number
          partner_order_id: string
          performed_by?: string | null
          planning_id: string
          resultado?: Json
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          os_created?: number
          partner_order_id?: string
          performed_by?: string | null
          planning_id?: string
          resultado?: Json
        }
        Relationships: [
          {
            foreignKeyName: "production_planning_publications_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_planning_publications_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "production_planning"
            referencedColumns: ["id"]
          },
        ]
      }
      production_timeline_events: {
        Row: {
          actor_id: string | null
          event_at: string
          event_type: string
          id: string
          meta: Json
          partner_order_id: string
        }
        Insert: {
          actor_id?: string | null
          event_at?: string
          event_type: string
          id?: string
          meta?: Json
          partner_order_id: string
        }
        Update: {
          actor_id?: string | null
          event_at?: string
          event_type?: string
          id?: string
          meta?: Json
          partner_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_timeline_events_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_conformidade_perfis: {
        Row: {
          advertencias: string[]
          aprovado_em: string | null
          aprovado_por: string | null
          campos_obrigatorios: string[]
          categoria: string | null
          conservacao_texto: string | null
          created_at: string
          criado_por: string | null
          documento_referencia: string | null
          documento_validade: string | null
          fonte_documento: string | null
          id: string
          identificadores_fiscais: Json
          identificadores_regulatorios: Json
          inativado_em: string | null
          inativado_por: string | null
          motivo_aprovacao: string | null
          motivo_inativacao: string | null
          perfil_key: string
          politica_validade: string | null
          produto_id: string | null
          registro_mapa: string | null
          responsavel_informacao: string | null
          responsavel_tecnico_nome: string | null
          responsavel_tecnico_registro: string | null
          status: string
          template_versao: string | null
          transporte_texto: string | null
          updated_at: string
          uso_texto: string | null
          validade_meses: number | null
          versao: number
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          advertencias?: string[]
          aprovado_em?: string | null
          aprovado_por?: string | null
          campos_obrigatorios?: string[]
          categoria?: string | null
          conservacao_texto?: string | null
          created_at?: string
          criado_por?: string | null
          documento_referencia?: string | null
          documento_validade?: string | null
          fonte_documento?: string | null
          id?: string
          identificadores_fiscais?: Json
          identificadores_regulatorios?: Json
          inativado_em?: string | null
          inativado_por?: string | null
          motivo_aprovacao?: string | null
          motivo_inativacao?: string | null
          perfil_key: string
          politica_validade?: string | null
          produto_id?: string | null
          registro_mapa?: string | null
          responsavel_informacao?: string | null
          responsavel_tecnico_nome?: string | null
          responsavel_tecnico_registro?: string | null
          status?: string
          template_versao?: string | null
          transporte_texto?: string | null
          updated_at?: string
          uso_texto?: string | null
          validade_meses?: number | null
          versao?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          advertencias?: string[]
          aprovado_em?: string | null
          aprovado_por?: string | null
          campos_obrigatorios?: string[]
          categoria?: string | null
          conservacao_texto?: string | null
          created_at?: string
          criado_por?: string | null
          documento_referencia?: string | null
          documento_validade?: string | null
          fonte_documento?: string | null
          id?: string
          identificadores_fiscais?: Json
          identificadores_regulatorios?: Json
          inativado_em?: string | null
          inativado_por?: string | null
          motivo_aprovacao?: string | null
          motivo_inativacao?: string | null
          perfil_key?: string
          politica_validade?: string | null
          produto_id?: string | null
          registro_mapa?: string | null
          responsavel_informacao?: string | null
          responsavel_tecnico_nome?: string | null
          responsavel_tecnico_registro?: string | null
          status?: string
          template_versao?: string | null
          transporte_texto?: string | null
          updated_at?: string
          uso_texto?: string | null
          validade_meses?: number | null
          versao?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produto_conformidade_perfis_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_etiqueta_consultas: {
        Row: {
          consultado_em: string
          etiqueta_id: string | null
          id: number
          janela_hora: string
          resultado: string
        }
        Insert: {
          consultado_em?: string
          etiqueta_id?: string | null
          id?: number
          janela_hora?: string
          resultado: string
        }
        Update: {
          consultado_em?: string
          etiqueta_id?: string | null
          id?: number
          janela_hora?: string
          resultado?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_etiqueta_consultas_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "produto_etiquetas"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_etiqueta_eventos: {
        Row: {
          created_at: string
          descricao: string | null
          etiqueta_id: string
          evento: string
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          etiqueta_id: string
          evento: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          etiqueta_id?: string
          evento?: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produto_etiqueta_eventos_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "produto_etiquetas"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_etiquetas: {
        Row: {
          cepas: string[] | null
          cliente_id: string | null
          codigo_etiqueta: string
          composicao_resumida: string | null
          conservacao: string | null
          cq_liberado: boolean
          created_at: string
          embalagem_id: string | null
          entrega_id: string | null
          entrega_item_id: string | null
          envase_id: string | null
          envase_item_id: string | null
          estoque_item_id: string | null
          fabricado_em: string | null
          fazenda_id: string | null
          gerada_em: string
          gerada_por: string | null
          id: string
          impressa_em: string | null
          impressa_por: string | null
          lote_codigo: string
          lote_id: string | null
          lote_status_na_emissao: string | null
          metadata: Json
          motivo_ultima_reimpressao: string | null
          observacoes: string | null
          produto_id: string | null
          produto_nome: string
          protocolo_nome: string | null
          public_trace_enabled: boolean
          qr_code_generated_at: string | null
          qr_code_path: string | null
          qr_code_payload: string | null
          quantidade_embalagens: number | null
          quantidade_impressoes: number
          snapshot: Json | null
          status: string
          substitui_etiqueta_id: string | null
          substituida_por_id: string | null
          template_versao: string
          tipo_etiqueta: string
          trace_expires_at: string | null
          trace_hash: string | null
          trace_token: string
          trace_url: string | null
          ultima_reimpressao_em: string | null
          ultima_reimpressao_por: string | null
          unidade: string | null
          updated_at: string
          uso_recomendado: string | null
          validade_em: string | null
          volume: number | null
        }
        Insert: {
          cepas?: string[] | null
          cliente_id?: string | null
          codigo_etiqueta: string
          composicao_resumida?: string | null
          conservacao?: string | null
          cq_liberado?: boolean
          created_at?: string
          embalagem_id?: string | null
          entrega_id?: string | null
          entrega_item_id?: string | null
          envase_id?: string | null
          envase_item_id?: string | null
          estoque_item_id?: string | null
          fabricado_em?: string | null
          fazenda_id?: string | null
          gerada_em?: string
          gerada_por?: string | null
          id?: string
          impressa_em?: string | null
          impressa_por?: string | null
          lote_codigo: string
          lote_id?: string | null
          lote_status_na_emissao?: string | null
          metadata?: Json
          motivo_ultima_reimpressao?: string | null
          observacoes?: string | null
          produto_id?: string | null
          produto_nome: string
          protocolo_nome?: string | null
          public_trace_enabled?: boolean
          qr_code_generated_at?: string | null
          qr_code_path?: string | null
          qr_code_payload?: string | null
          quantidade_embalagens?: number | null
          quantidade_impressoes?: number
          snapshot?: Json | null
          status?: string
          substitui_etiqueta_id?: string | null
          substituida_por_id?: string | null
          template_versao?: string
          tipo_etiqueta?: string
          trace_expires_at?: string | null
          trace_hash?: string | null
          trace_token?: string
          trace_url?: string | null
          ultima_reimpressao_em?: string | null
          ultima_reimpressao_por?: string | null
          unidade?: string | null
          updated_at?: string
          uso_recomendado?: string | null
          validade_em?: string | null
          volume?: number | null
        }
        Update: {
          cepas?: string[] | null
          cliente_id?: string | null
          codigo_etiqueta?: string
          composicao_resumida?: string | null
          conservacao?: string | null
          cq_liberado?: boolean
          created_at?: string
          embalagem_id?: string | null
          entrega_id?: string | null
          entrega_item_id?: string | null
          envase_id?: string | null
          envase_item_id?: string | null
          estoque_item_id?: string | null
          fabricado_em?: string | null
          fazenda_id?: string | null
          gerada_em?: string
          gerada_por?: string | null
          id?: string
          impressa_em?: string | null
          impressa_por?: string | null
          lote_codigo?: string
          lote_id?: string | null
          lote_status_na_emissao?: string | null
          metadata?: Json
          motivo_ultima_reimpressao?: string | null
          observacoes?: string | null
          produto_id?: string | null
          produto_nome?: string
          protocolo_nome?: string | null
          public_trace_enabled?: boolean
          qr_code_generated_at?: string | null
          qr_code_path?: string | null
          qr_code_payload?: string | null
          quantidade_embalagens?: number | null
          quantidade_impressoes?: number
          snapshot?: Json | null
          status?: string
          substitui_etiqueta_id?: string | null
          substituida_por_id?: string | null
          template_versao?: string
          tipo_etiqueta?: string
          trace_expires_at?: string | null
          trace_hash?: string | null
          trace_token?: string
          trace_url?: string | null
          ultima_reimpressao_em?: string | null
          ultima_reimpressao_por?: string | null
          unidade?: string | null
          updated_at?: string
          uso_recomendado?: string | null
          validade_em?: string | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_produto_etiquetas_embalagem"
            columns: ["embalagem_id"]
            isOneToOne: false
            referencedRelation: "estoque_embalagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_produto_etiquetas_substitui"
            columns: ["substitui_etiqueta_id"]
            isOneToOne: false
            referencedRelation: "produto_etiquetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_produto_etiquetas_substituida_por"
            columns: ["substituida_por_id"]
            isOneToOne: false
            referencedRelation: "produto_etiquetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_etiquetas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_etiquetas_embalagem_id_fkey"
            columns: ["embalagem_id"]
            isOneToOne: false
            referencedRelation: "estoque_embalagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_etiquetas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "produto_etiquetas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_etiquetas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "produto_etiquetas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["entrega_id"]
          },
          {
            foreignKeyName: "produto_etiquetas_envase_id_fkey"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["envase_id"]
          },
          {
            foreignKeyName: "produto_etiquetas_envase_id_fkey"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "envase"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_etiquetas_envase_id_fkey"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["envase_id"]
          },
          {
            foreignKeyName: "produto_etiquetas_envase_id_fkey"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["envase_id"]
          },
          {
            foreignKeyName: "produto_etiquetas_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_etiquetas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "produto_etiquetas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_etiquetas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "produto_etiquetas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "produto_etiquetas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean | null
          b2b_enabled: boolean
          codigo: string | null
          created_at: string
          descricao: string | null
          dose_ml_ha: number | null
          e_insumo: boolean | null
          estoque_minimo: number | null
          funcao_completa: string | null
          id: string
          modo_acao: string | null
          modo_aplicacao: string | null
          nome: string
          tipo: Database["public"]["Enums"]["tipo_produto"]
          updated_at: string
          valor_dose_brl: number | null
          valor_ha_brl: number | null
          valor_litro_brl: number | null
          versao_catalogo: string | null
        }
        Insert: {
          ativo?: boolean | null
          b2b_enabled?: boolean
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          dose_ml_ha?: number | null
          e_insumo?: boolean | null
          estoque_minimo?: number | null
          funcao_completa?: string | null
          id?: string
          modo_acao?: string | null
          modo_aplicacao?: string | null
          nome: string
          tipo: Database["public"]["Enums"]["tipo_produto"]
          updated_at?: string
          valor_dose_brl?: number | null
          valor_ha_brl?: number | null
          valor_litro_brl?: number | null
          versao_catalogo?: string | null
        }
        Update: {
          ativo?: boolean | null
          b2b_enabled?: boolean
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          dose_ml_ha?: number | null
          e_insumo?: boolean | null
          estoque_minimo?: number | null
          funcao_completa?: string | null
          id?: string
          modo_acao?: string | null
          modo_aplicacao?: string | null
          nome?: string
          tipo?: Database["public"]["Enums"]["tipo_produto"]
          updated_at?: string
          valor_dose_brl?: number | null
          valor_ha_brl?: number | null
          valor_litro_brl?: number | null
          versao_catalogo?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          cargo: string | null
          cliente_id: string | null
          cpf_cnpj: string | null
          crea: string | null
          created_at: string
          data_admissao: string | null
          email: string | null
          especialidade: string | null
          id: string
          nome: string
          observacoes_internas: string | null
          organization_id: string | null
          senha_provisoria: boolean
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          cliente_id?: string | null
          cpf_cnpj?: string | null
          crea?: string | null
          created_at?: string
          data_admissao?: string | null
          email?: string | null
          especialidade?: string | null
          id?: string
          nome?: string
          observacoes_internas?: string | null
          organization_id?: string | null
          senha_provisoria?: boolean
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          cliente_id?: string | null
          cpf_cnpj?: string | null
          crea?: string | null
          created_at?: string
          data_admissao?: string | null
          email?: string | null
          especialidade?: string | null
          id?: string
          nome?: string
          observacoes_internas?: string | null
          organization_id?: string | null
          senha_provisoria?: boolean
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_producao: {
        Row: {
          created_at: string
          data_programada: string | null
          id: string
          microrganismo_id: string | null
          ordem_servico_id: string | null
          ordem_servico_onfarm_id: string | null
          organization_id: string | null
          produto_id: string | null
          responsavel: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_programacao"]
          updated_at: string
          volume_necessario: number | null
        }
        Insert: {
          created_at?: string
          data_programada?: string | null
          id?: string
          microrganismo_id?: string | null
          ordem_servico_id?: string | null
          ordem_servico_onfarm_id?: string | null
          organization_id?: string | null
          produto_id?: string | null
          responsavel?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_programacao"]
          updated_at?: string
          volume_necessario?: number | null
        }
        Update: {
          created_at?: string
          data_programada?: string | null
          id?: string
          microrganismo_id?: string | null
          ordem_servico_id?: string | null
          ordem_servico_onfarm_id?: string | null
          organization_id?: string | null
          produto_id?: string | null
          responsavel?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_programacao"]
          updated_at?: string
          volume_necessario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_producao_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_producao_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "programacao_producao_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_producao_ordem_servico_onfarm_id_fkey"
            columns: ["ordem_servico_onfarm_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_fluxo_visita_tecnica"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "programacao_producao_ordem_servico_onfarm_id_fkey"
            columns: ["ordem_servico_onfarm_id"]
            isOneToOne: false
            referencedRelation: "mv_fluxo_visita_tecnica"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "programacao_producao_ordem_servico_onfarm_id_fkey"
            columns: ["ordem_servico_onfarm_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico_onfarm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_producao_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_producao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_producao_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      receivable_payments: {
        Row: {
          amount_received: number
          bank_account_id: string | null
          created_at: string
          created_by: string
          discount_amount: number
          id: string
          idempotency_key: string | null
          installment_id: string
          interest_amount: number
          is_reversal: boolean
          notes: string | null
          organization_id: string | null
          payment_date: string
          payment_method_id: string
          penalty_amount: number
          request_fingerprint: string | null
          reversal_reason: string | null
          reversed_payment_id: string | null
        }
        Insert: {
          amount_received: number
          bank_account_id?: string | null
          created_at?: string
          created_by: string
          discount_amount?: number
          id?: string
          idempotency_key?: string | null
          installment_id: string
          interest_amount?: number
          is_reversal?: boolean
          notes?: string | null
          organization_id?: string | null
          payment_date?: string
          payment_method_id: string
          penalty_amount?: number
          request_fingerprint?: string | null
          reversal_reason?: string | null
          reversed_payment_id?: string | null
        }
        Update: {
          amount_received?: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string
          discount_amount?: number
          id?: string
          idempotency_key?: string | null
          installment_id?: string
          interest_amount?: number
          is_reversal?: boolean
          notes?: string | null
          organization_id?: string | null
          payment_date?: string
          payment_method_id?: string
          penalty_amount?: number
          request_fingerprint?: string | null
          reversal_reason?: string | null
          reversed_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receivable_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_reversed_payment_id_fkey"
            columns: ["reversed_payment_id"]
            isOneToOne: false
            referencedRelation: "receivable_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      recomendacao_comentarios: {
        Row: {
          autor_id: string
          autor_nome: string
          autor_tipo: Database["public"]["Enums"]["recomendacao_comentario_autor_tipo"]
          created_at: string
          id: string
          lido_em: string | null
          mensagem: string
          recomendacao_id: string
          updated_at: string
        }
        Insert: {
          autor_id: string
          autor_nome: string
          autor_tipo: Database["public"]["Enums"]["recomendacao_comentario_autor_tipo"]
          created_at?: string
          id?: string
          lido_em?: string | null
          mensagem: string
          recomendacao_id: string
          updated_at?: string
        }
        Update: {
          autor_id?: string
          autor_nome?: string
          autor_tipo?: Database["public"]["Enums"]["recomendacao_comentario_autor_tipo"]
          created_at?: string
          id?: string
          lido_em?: string | null
          mensagem?: string
          recomendacao_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recomendacao_comentarios_recomendacao_id_fkey"
            columns: ["recomendacao_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor_recomendacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_financial_templates: {
        Row: {
          active: boolean
          adjustment_index_name: string | null
          adjustment_type: string | null
          adjustment_value: number | null
          amount: number
          auto_generate: boolean
          bank_account_id: string | null
          category_id: string
          cost_center_id: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          description: string
          due_day: number | null
          end_date: string | null
          fiscal_invoice_required: boolean | null
          id: string
          installment_count: number
          last_adjustment_date: string | null
          name: string
          next_adjustment_date: string | null
          next_generation_date: string
          notes: string | null
          paused_at: string | null
          payment_method_id: string | null
          recurrence_frequency: string
          start_date: string
          supplier_id: string | null
          supplier_name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          adjustment_index_name?: string | null
          adjustment_type?: string | null
          adjustment_value?: number | null
          amount: number
          auto_generate?: boolean
          bank_account_id?: string | null
          category_id: string
          cost_center_id?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          description: string
          due_day?: number | null
          end_date?: string | null
          fiscal_invoice_required?: boolean | null
          id?: string
          installment_count?: number
          last_adjustment_date?: string | null
          name: string
          next_adjustment_date?: string | null
          next_generation_date: string
          notes?: string | null
          paused_at?: string | null
          payment_method_id?: string | null
          recurrence_frequency: string
          start_date: string
          supplier_id?: string | null
          supplier_name?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          adjustment_index_name?: string | null
          adjustment_type?: string | null
          adjustment_value?: number | null
          amount?: number
          auto_generate?: boolean
          bank_account_id?: string | null
          category_id?: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          description?: string
          due_day?: number | null
          end_date?: string | null
          fiscal_invoice_required?: boolean | null
          id?: string
          installment_count?: number
          last_adjustment_date?: string | null
          name?: string
          next_adjustment_date?: string | null
          next_generation_date?: string
          notes?: string | null
          paused_at?: string | null
          payment_method_id?: string | null
          recurrence_frequency?: string
          start_date?: string
          supplier_id?: string | null
          supplier_name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_financial_templates_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_financial_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_financial_templates_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "financial_cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_financial_templates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_financial_templates_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_generation_log: {
        Row: {
          amount: number | null
          error_message: string | null
          generated_at: string
          generated_by: string | null
          generated_entity_id: string | null
          generated_entity_type: string | null
          id: string
          reference_date: string
          status: string
          template_id: string
        }
        Insert: {
          amount?: number | null
          error_message?: string | null
          generated_at?: string
          generated_by?: string | null
          generated_entity_id?: string | null
          generated_entity_type?: string | null
          id?: string
          reference_date: string
          status: string
          template_id: string
        }
        Update: {
          amount?: number | null
          error_message?: string | null
          generated_at?: string
          generated_by?: string | null
          generated_entity_id?: string | null
          generated_entity_type?: string | null
          id?: string
          reference_date?: string
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_generation_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "recurring_financial_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_consultor: {
        Row: {
          acao_realizada: string | null
          area_hectares: number | null
          categoria_problema:
            | Database["public"]["Enums"]["categoria_problema_consultor"]
            | null
          client_uuid: string | null
          cliente_id: string | null
          codigo_visita: string | null
          condicoes_climaticas_observadas: string | null
          consultor_profile_id: string | null
          consultor_responsavel: string | null
          created_at: string
          created_by: string | null
          cultura_id: string | null
          data_proxima_visita: string | null
          data_vistoria: string
          duracao_estimada: number | null
          fase_fenologica: string | null
          fazenda_id: string | null
          finalized_at: string | null
          finalized_by: string | null
          historico_resumido: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          latitude: number | null
          localizacao_na_area: string | null
          longitude: number | null
          natureza_registro: Database["public"]["Enums"]["natureza_registro_consultor"]
          necessidade_intervencao:
            | Database["public"]["Enums"]["necessidade_intervencao"]
            | null
          nivel_pressao: Database["public"]["Enums"]["nivel_pressao"] | null
          objetivo_visita: string | null
          observacoes_tecnicas: string | null
          origem_atendimento: string | null
          pdf_status: string | null
          percentual_area_afetada: number | null
          problema_principal: string | null
          problema_secundario: string | null
          proxima_acao_recomendada: string | null
          registro_origem_id: string | null
          risco_produtivo: Database["public"]["Enums"]["risco_produtivo"] | null
          safra: string | null
          solicitacao_id: string | null
          status: Database["public"]["Enums"]["status_registro_consultor"]
          talhao_id: string | null
          tipo_demanda:
            | Database["public"]["Enums"]["tipo_demanda_consultor"]
            | null
          tipo_visita: Database["public"]["Enums"]["tipo_visita"] | null
          updated_at: string
          urgencia: Database["public"]["Enums"]["urgencia_consultor"] | null
          version: number
        }
        Insert: {
          acao_realizada?: string | null
          area_hectares?: number | null
          categoria_problema?:
            | Database["public"]["Enums"]["categoria_problema_consultor"]
            | null
          client_uuid?: string | null
          cliente_id?: string | null
          codigo_visita?: string | null
          condicoes_climaticas_observadas?: string | null
          consultor_profile_id?: string | null
          consultor_responsavel?: string | null
          created_at?: string
          created_by?: string | null
          cultura_id?: string | null
          data_proxima_visita?: string | null
          data_vistoria?: string
          duracao_estimada?: number | null
          fase_fenologica?: string | null
          fazenda_id?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          historico_resumido?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          latitude?: number | null
          localizacao_na_area?: string | null
          longitude?: number | null
          natureza_registro?: Database["public"]["Enums"]["natureza_registro_consultor"]
          necessidade_intervencao?:
            | Database["public"]["Enums"]["necessidade_intervencao"]
            | null
          nivel_pressao?: Database["public"]["Enums"]["nivel_pressao"] | null
          objetivo_visita?: string | null
          observacoes_tecnicas?: string | null
          origem_atendimento?: string | null
          pdf_status?: string | null
          percentual_area_afetada?: number | null
          problema_principal?: string | null
          problema_secundario?: string | null
          proxima_acao_recomendada?: string | null
          registro_origem_id?: string | null
          risco_produtivo?:
            | Database["public"]["Enums"]["risco_produtivo"]
            | null
          safra?: string | null
          solicitacao_id?: string | null
          status?: Database["public"]["Enums"]["status_registro_consultor"]
          talhao_id?: string | null
          tipo_demanda?:
            | Database["public"]["Enums"]["tipo_demanda_consultor"]
            | null
          tipo_visita?: Database["public"]["Enums"]["tipo_visita"] | null
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["urgencia_consultor"] | null
          version?: number
        }
        Update: {
          acao_realizada?: string | null
          area_hectares?: number | null
          categoria_problema?:
            | Database["public"]["Enums"]["categoria_problema_consultor"]
            | null
          client_uuid?: string | null
          cliente_id?: string | null
          codigo_visita?: string | null
          condicoes_climaticas_observadas?: string | null
          consultor_profile_id?: string | null
          consultor_responsavel?: string | null
          created_at?: string
          created_by?: string | null
          cultura_id?: string | null
          data_proxima_visita?: string | null
          data_vistoria?: string
          duracao_estimada?: number | null
          fase_fenologica?: string | null
          fazenda_id?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          historico_resumido?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          latitude?: number | null
          localizacao_na_area?: string | null
          longitude?: number | null
          natureza_registro?: Database["public"]["Enums"]["natureza_registro_consultor"]
          necessidade_intervencao?:
            | Database["public"]["Enums"]["necessidade_intervencao"]
            | null
          nivel_pressao?: Database["public"]["Enums"]["nivel_pressao"] | null
          objetivo_visita?: string | null
          observacoes_tecnicas?: string | null
          origem_atendimento?: string | null
          pdf_status?: string | null
          percentual_area_afetada?: number | null
          problema_principal?: string | null
          problema_secundario?: string | null
          proxima_acao_recomendada?: string | null
          registro_origem_id?: string | null
          risco_produtivo?:
            | Database["public"]["Enums"]["risco_produtivo"]
            | null
          safra?: string | null
          solicitacao_id?: string | null
          status?: Database["public"]["Enums"]["status_registro_consultor"]
          talhao_id?: string | null
          tipo_demanda?:
            | Database["public"]["Enums"]["tipo_demanda_consultor"]
            | null
          tipo_visita?: Database["public"]["Enums"]["tipo_visita"] | null
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["urgencia_consultor"] | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "registros_consultor_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_consultor_consultor_profile_id_fkey"
            columns: ["consultor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_consultor_cultura_id_fkey"
            columns: ["cultura_id"]
            isOneToOne: false
            referencedRelation: "culturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_consultor_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_consultor_registro_origem_id_fkey"
            columns: ["registro_origem_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_consultor_talhao_id_fkey"
            columns: ["talhao_id"]
            isOneToOne: false
            referencedRelation: "talhoes"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_consultor_arquivos: {
        Row: {
          arquivo_path: string | null
          arquivo_url: string | null
          capturado_em: string | null
          categoria_arquivo:
            | Database["public"]["Enums"]["categoria_arquivo_consultor"]
            | null
          client_uuid: string | null
          duracao_segundos: number | null
          foto_principal: boolean | null
          id: string
          latitude: number | null
          legenda: string | null
          longitude: number | null
          nome_arquivo: string | null
          ponto_area: Database["public"]["Enums"]["ponto_area_consultor"] | null
          registro_consultor_id: string
          tipo_arquivo: string | null
          tipo_midia:
            | Database["public"]["Enums"]["tipo_arquivo_consultor"]
            | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          arquivo_path?: string | null
          arquivo_url?: string | null
          capturado_em?: string | null
          categoria_arquivo?:
            | Database["public"]["Enums"]["categoria_arquivo_consultor"]
            | null
          client_uuid?: string | null
          duracao_segundos?: number | null
          foto_principal?: boolean | null
          id?: string
          latitude?: number | null
          legenda?: string | null
          longitude?: number | null
          nome_arquivo?: string | null
          ponto_area?:
            | Database["public"]["Enums"]["ponto_area_consultor"]
            | null
          registro_consultor_id: string
          tipo_arquivo?: string | null
          tipo_midia?:
            | Database["public"]["Enums"]["tipo_arquivo_consultor"]
            | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          arquivo_path?: string | null
          arquivo_url?: string | null
          capturado_em?: string | null
          categoria_arquivo?:
            | Database["public"]["Enums"]["categoria_arquivo_consultor"]
            | null
          client_uuid?: string | null
          duracao_segundos?: number | null
          foto_principal?: boolean | null
          id?: string
          latitude?: number | null
          legenda?: string | null
          longitude?: number | null
          nome_arquivo?: string | null
          ponto_area?:
            | Database["public"]["Enums"]["ponto_area_consultor"]
            | null
          registro_consultor_id?: string
          tipo_arquivo?: string | null
          tipo_midia?:
            | Database["public"]["Enums"]["tipo_arquivo_consultor"]
            | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_consultor_arquivos_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_consultor_pdf_versions: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string
          id: string
          metadata: Json | null
          pdf_url: string
          registro_consultor_id: string
          version_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path: string
          id?: string
          metadata?: Json | null
          pdf_url: string
          registro_consultor_id: string
          version_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string
          id?: string
          metadata?: Json | null
          pdf_url?: string
          registro_consultor_id?: string
          version_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_consultor_pdf_versions_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_consultor_recomendacoes: {
        Row: {
          client_uuid: string | null
          compatibilidade_observacoes: string | null
          created_at: string
          created_by: string | null
          cuidados_operacionais: string | null
          dose_recomendada_unidade: string | null
          dose_recomendada_valor: number | null
          encaminhar_para_os: boolean | null
          estrategia_manejo:
            | Database["public"]["Enums"]["estrategia_manejo"]
            | null
          id: string
          intervalo_aplicacoes: string | null
          microrganismo_id: string | null
          modo_aplicacao:
            | Database["public"]["Enums"]["modo_aplicacao_consultor"]
            | null
          momento_aplicacao: string | null
          numero_aplicacoes: number | null
          objetivo_recomendacao:
            | Database["public"]["Enums"]["objetivo_recomendacao"]
            | null
          observacoes_finais: string | null
          produto_biologico_sugerido_id: string | null
          recomendacao_tecnica: string | null
          registro_consultor_id: string
          updated_at: string
          versao: number
          volume_calda: string | null
          volume_total_recomendado: number | null
        }
        Insert: {
          client_uuid?: string | null
          compatibilidade_observacoes?: string | null
          created_at?: string
          created_by?: string | null
          cuidados_operacionais?: string | null
          dose_recomendada_unidade?: string | null
          dose_recomendada_valor?: number | null
          encaminhar_para_os?: boolean | null
          estrategia_manejo?:
            | Database["public"]["Enums"]["estrategia_manejo"]
            | null
          id?: string
          intervalo_aplicacoes?: string | null
          microrganismo_id?: string | null
          modo_aplicacao?:
            | Database["public"]["Enums"]["modo_aplicacao_consultor"]
            | null
          momento_aplicacao?: string | null
          numero_aplicacoes?: number | null
          objetivo_recomendacao?:
            | Database["public"]["Enums"]["objetivo_recomendacao"]
            | null
          observacoes_finais?: string | null
          produto_biologico_sugerido_id?: string | null
          recomendacao_tecnica?: string | null
          registro_consultor_id: string
          updated_at?: string
          versao?: number
          volume_calda?: string | null
          volume_total_recomendado?: number | null
        }
        Update: {
          client_uuid?: string | null
          compatibilidade_observacoes?: string | null
          created_at?: string
          created_by?: string | null
          cuidados_operacionais?: string | null
          dose_recomendada_unidade?: string | null
          dose_recomendada_valor?: number | null
          encaminhar_para_os?: boolean | null
          estrategia_manejo?:
            | Database["public"]["Enums"]["estrategia_manejo"]
            | null
          id?: string
          intervalo_aplicacoes?: string | null
          microrganismo_id?: string | null
          modo_aplicacao?:
            | Database["public"]["Enums"]["modo_aplicacao_consultor"]
            | null
          momento_aplicacao?: string | null
          numero_aplicacoes?: number | null
          objetivo_recomendacao?:
            | Database["public"]["Enums"]["objetivo_recomendacao"]
            | null
          observacoes_finais?: string | null
          produto_biologico_sugerido_id?: string | null
          recomendacao_tecnica?: string | null
          registro_consultor_id?: string
          updated_at?: string
          versao?: number
          volume_calda?: string | null
          volume_total_recomendado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_consultor_recomenda_produto_biologico_sugerido_i_fkey"
            columns: ["produto_biologico_sugerido_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_consultor_recomendacoes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_consultor_recomendacoes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
          {
            foreignKeyName: "registros_consultor_recomendacoes_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_consultor_status_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          motivo: string | null
          registro_consultor_id: string
          status_anterior: string | null
          status_novo: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          motivo?: string | null
          registro_consultor_id: string
          status_anterior?: string | null
          status_novo: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          motivo?: string | null
          registro_consultor_id?: string
          status_anterior?: string | null
          status_novo?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_consultor_status_log_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_storage_cleanup_queue: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          document_id: string
          dossier_id: string
          id: string
          reason: string
          requested_at: string
          requested_by: string | null
          state: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          document_id: string
          dossier_id: string
          id?: string
          reason: string
          requested_at?: string
          requested_by?: string | null
          state?: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          document_id?: string
          dossier_id?: string
          id?: string
          reason?: string
          requested_at?: string
          requested_by?: string | null
          state?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_storage_cleanup_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "microorganism_regulatory_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulatory_storage_cleanup_queue_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "microorganism_regulatory_dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas_auditoria: {
        Row: {
          cliente_id: string | null
          created_at: string
          entrega_id: string | null
          envase_id: string | null
          estoque_produto_id: string | null
          id: string
          lote_id: string | null
          motivo: string | null
          ordem_servico_id: string | null
          os_tipo: string | null
          quantidade_solicitada: number | null
          reservado_para_os_id_existente: string | null
          reservado_por_existente: string | null
          resultado: string
          status_estoque_no_momento: string | null
          usuario_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          entrega_id?: string | null
          envase_id?: string | null
          estoque_produto_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          ordem_servico_id?: string | null
          os_tipo?: string | null
          quantidade_solicitada?: number | null
          reservado_para_os_id_existente?: string | null
          reservado_por_existente?: string | null
          resultado: string
          status_estoque_no_momento?: string | null
          usuario_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          entrega_id?: string | null
          envase_id?: string | null
          estoque_produto_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          ordem_servico_id?: string | null
          os_tipo?: string | null
          quantidade_solicitada?: number | null
          reservado_para_os_id_existente?: string | null
          reservado_por_existente?: string | null
          resultado?: string
          status_estoque_no_momento?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      saas_features: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          key: string
          module_id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key: string
          module_id: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          module_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_features_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "saas_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_modules: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      saas_plan_features: {
        Row: {
          config: Json | null
          created_at: string
          enabled: boolean
          feature_id: string
          limit_value: number | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          feature_id: string
          limit_value?: number | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          feature_id?: string
          limit_value?: number | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_plan_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "saas_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_fiscal_profiles: {
        Row: {
          accounting_notes: string | null
          accounting_validated_at: string | null
          accounting_validated_by: string | null
          cnae: string | null
          created_at: string
          created_by: string | null
          federal_withholding_defaults: Json | null
          fiscal_description_template: string | null
          ibs_cbs_configuration: Json
          id: string
          incidence_municipality_ibge_code: string | null
          is_active: boolean
          iss_rate: number | null
          iss_withheld_default: boolean
          lc116_item: string | null
          municipal_taxation_code: string | null
          national_taxation_code: string | null
          profile_status: string
          requirement_status: string | null
          service_id: string | null
          service_name: string | null
          source_reference: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accounting_notes?: string | null
          accounting_validated_at?: string | null
          accounting_validated_by?: string | null
          cnae?: string | null
          created_at?: string
          created_by?: string | null
          federal_withholding_defaults?: Json | null
          fiscal_description_template?: string | null
          ibs_cbs_configuration?: Json
          id?: string
          incidence_municipality_ibge_code?: string | null
          is_active?: boolean
          iss_rate?: number | null
          iss_withheld_default?: boolean
          lc116_item?: string | null
          municipal_taxation_code?: string | null
          national_taxation_code?: string | null
          profile_status?: string
          requirement_status?: string | null
          service_id?: string | null
          service_name?: string | null
          source_reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accounting_notes?: string | null
          accounting_validated_at?: string | null
          accounting_validated_by?: string | null
          cnae?: string | null
          created_at?: string
          created_by?: string | null
          federal_withholding_defaults?: Json | null
          fiscal_description_template?: string | null
          ibs_cbs_configuration?: Json
          id?: string
          incidence_municipality_ibge_code?: string | null
          is_active?: boolean
          iss_rate?: number | null
          iss_withheld_default?: boolean
          lc116_item?: string | null
          municipal_taxation_code?: string | null
          national_taxation_code?: string | null
          profile_status?: string
          requirement_status?: string | null
          service_id?: string | null
          service_name?: string | null
          source_reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sla_configuracoes: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          etapa: string
          id: string
          prazo_horas: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          etapa: string
          id?: string
          prazo_horas: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          etapa?: string
          id?: string
          prazo_horas?: number
          updated_at?: string
        }
        Relationships: []
      }
      solicitacoes_atribuicoes: {
        Row: {
          atribuido_por: string | null
          consultor_id: string
          created_at: string
          data_atribuicao: string
          id: string
          observacoes: string | null
          solicitacao_id: string
          status: Database["public"]["Enums"]["status_atribuicao"]
        }
        Insert: {
          atribuido_por?: string | null
          consultor_id: string
          created_at?: string
          data_atribuicao?: string
          id?: string
          observacoes?: string | null
          solicitacao_id: string
          status?: Database["public"]["Enums"]["status_atribuicao"]
        }
        Update: {
          atribuido_por?: string | null
          consultor_id?: string
          created_at?: string
          data_atribuicao?: string
          id?: string
          observacoes?: string | null
          solicitacao_id?: string
          status?: Database["public"]["Enums"]["status_atribuicao"]
        }
        Relationships: []
      }
      solicitacoes_timeline: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          metadata: Json | null
          solicitacao_id: string
          tipo_evento: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          solicitacao_id: string
          tipo_evento: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          solicitacao_id?: string
          tipo_evento?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          created_at: string
          id: string
          item_local_id: string
          item_remoto_id: string | null
          mensagem_erro: string | null
          payload_resumo: Json | null
          status: string
          tentativa: number
          tipo_item: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_local_id: string
          item_remoto_id?: string | null
          mensagem_erro?: string | null
          payload_resumo?: Json | null
          status: string
          tentativa?: number
          tipo_item: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_local_id?: string
          item_remoto_id?: string | null
          mensagem_erro?: string | null
          payload_resumo?: Json | null
          status?: string
          tentativa?: number
          tipo_item?: string
          user_id?: string | null
        }
        Relationships: []
      }
      talhao_safras: {
        Row: {
          created_at: string
          cultura_id: string
          data_colheita_real: string | null
          data_plantio: string
          data_previsao_colheita: string | null
          id: string
          observacoes: string | null
          periodo_safra: string | null
          produtividade: number | null
          safra: string
          status: string
          talhao_id: string
          unidade_produtividade: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cultura_id: string
          data_colheita_real?: string | null
          data_plantio: string
          data_previsao_colheita?: string | null
          id?: string
          observacoes?: string | null
          periodo_safra?: string | null
          produtividade?: number | null
          safra: string
          status?: string
          talhao_id: string
          unidade_produtividade?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cultura_id?: string
          data_colheita_real?: string | null
          data_plantio?: string
          data_previsao_colheita?: string | null
          id?: string
          observacoes?: string | null
          periodo_safra?: string | null
          produtividade?: number | null
          safra?: string
          status?: string
          talhao_id?: string
          unidade_produtividade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talhao_safras_cultura_id_fkey"
            columns: ["cultura_id"]
            isOneToOne: false
            referencedRelation: "culturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talhao_safras_talhao_id_fkey"
            columns: ["talhao_id"]
            isOneToOne: false
            referencedRelation: "talhoes"
            referencedColumns: ["id"]
          },
        ]
      }
      talhoes: {
        Row: {
          area_hectares: number | null
          ativo: boolean
          created_at: string
          cultura_id: string | null
          fazenda_id: string
          historico_pragas: string | null
          id: string
          latitude: number | null
          localizacao_referencia: string | null
          longitude: number | null
          nome: string
          observacoes: string | null
          organization_id: string | null
          safra_atual_id: string | null
          tipo_manejo_agua: string
          updated_at: string
        }
        Insert: {
          area_hectares?: number | null
          ativo?: boolean
          created_at?: string
          cultura_id?: string | null
          fazenda_id: string
          historico_pragas?: string | null
          id?: string
          latitude?: number | null
          localizacao_referencia?: string | null
          longitude?: number | null
          nome: string
          observacoes?: string | null
          organization_id?: string | null
          safra_atual_id?: string | null
          tipo_manejo_agua?: string
          updated_at?: string
        }
        Update: {
          area_hectares?: number | null
          ativo?: boolean
          created_at?: string
          cultura_id?: string | null
          fazenda_id?: string
          historico_pragas?: string | null
          id?: string
          latitude?: number | null
          localizacao_referencia?: string | null
          longitude?: number | null
          nome?: string
          observacoes?: string | null
          organization_id?: string | null
          safra_atual_id?: string | null
          tipo_manejo_agua?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talhoes_cultura_id_fkey"
            columns: ["cultura_id"]
            isOneToOne: false
            referencedRelation: "culturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talhoes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talhoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talhoes_safra_atual_id_fkey"
            columns: ["safra_atual_id"]
            isOneToOne: false
            referencedRelation: "talhao_safras"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_visit_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          is_active: boolean
          registro_consultor_id: string
          removal_reason: string | null
          removed_at: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          registro_consultor_id: string
          removal_reason?: string | null
          removed_at?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          registro_consultor_id?: string
          removal_reason?: string | null
          removed_at?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_visit_assignments_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_preferences: {
        Row: {
          created_at: string
          last_context: string | null
          preferred_context: string | null
          skip_context_selector: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_context?: string | null
          preferred_context?: string | null
          skip_context_selector?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_context?: string | null
          preferred_context?: string | null
          skip_context_selector?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_clientes: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level_tecnico"]
          assigned_by: string | null
          cliente_id: string
          created_at: string
          id: string
          is_active: boolean
          principal: boolean
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level_tecnico"]
          assigned_by?: string | null
          cliente_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          principal?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level_tecnico"]
          assigned_by?: string | null
          cliente_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          principal?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_context_access_logs: {
        Row: {
          action: string
          context_code: string
          created_at: string
          id: string
          metadata: Json
          previous_context: string | null
          user_id: string
        }
        Insert: {
          action: string
          context_code: string
          created_at?: string
          id?: string
          metadata?: Json
          previous_context?: string | null
          user_id: string
        }
        Update: {
          action?: string
          context_code?: string
          created_at?: string
          id?: string
          metadata?: Json
          previous_context?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visita_diagnosticos: {
        Row: {
          categoria: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          descricao: string | null
          id: string
          incidencia: number | null
          intervencao: string | null
          localizacao: string | null
          problema: string | null
          registro_id: string
          risco: string | null
          severidade: string | null
          updated_at: string | null
          urgencia: string | null
          versao: number
        }
        Insert: {
          categoria?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          id?: string
          incidencia?: number | null
          intervencao?: string | null
          localizacao?: string | null
          problema?: string | null
          registro_id: string
          risco?: string | null
          severidade?: string | null
          updated_at?: string | null
          urgencia?: string | null
          versao?: number
        }
        Update: {
          categoria?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          id?: string
          incidencia?: number | null
          intervencao?: string | null
          localizacao?: string | null
          problema?: string | null
          registro_id?: string
          risco?: string | null
          severidade?: string | null
          updated_at?: string | null
          urgencia?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "visita_diagnosticos_registro_id_fkey"
            columns: ["registro_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas_campo: {
        Row: {
          area_avaliada_ha: number | null
          client_uuid: string | null
          cliente_id: string
          created_at: string
          created_by: string
          cultura_id: string | null
          dados_extras: Json
          estande_plantas_ha: number | null
          fase_fenologica: string | null
          id: string
          observacoes_campo: string | null
          registro_consultor_id: string
          talhao_id: string | null
          uniformidade: string | null
          updated_at: string
          versao: number
        }
        Insert: {
          area_avaliada_ha?: number | null
          client_uuid?: string | null
          cliente_id: string
          created_at?: string
          created_by: string
          cultura_id?: string | null
          dados_extras?: Json
          estande_plantas_ha?: number | null
          fase_fenologica?: string | null
          id?: string
          observacoes_campo?: string | null
          registro_consultor_id: string
          talhao_id?: string | null
          uniformidade?: string | null
          updated_at?: string
          versao?: number
        }
        Update: {
          area_avaliada_ha?: number | null
          client_uuid?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string
          cultura_id?: string | null
          dados_extras?: Json
          estande_plantas_ha?: number | null
          fase_fenologica?: string | null
          id?: string
          observacoes_campo?: string | null
          registro_consultor_id?: string
          talhao_id?: string | null
          uniformidade?: string | null
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "visitas_campo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_campo_cultura_id_fkey"
            columns: ["cultura_id"]
            isOneToOne: false
            referencedRelation: "culturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_campo_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: true
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_campo_talhao_id_fkey"
            columns: ["talhao_id"]
            isOneToOne: false
            referencedRelation: "talhoes"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas_checkin: {
        Row: {
          audio_path: string | null
          audio_url: string | null
          client_uuid: string | null
          cliente_id: string | null
          consultor_id: string
          created_at: string
          data_hora_checkin: string
          fazenda_id: string | null
          foto_path: string | null
          foto_url: string | null
          id: string
          justificativa_sem_gps: string | null
          latitude: number | null
          longitude: number | null
          observacoes: string | null
          precisao_gps: number | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          status: Database["public"]["Enums"]["status_checkin"]
          talhao_id: string | null
          tipo_checkin: Database["public"]["Enums"]["tipo_checkin"]
        }
        Insert: {
          audio_path?: string | null
          audio_url?: string | null
          client_uuid?: string | null
          cliente_id?: string | null
          consultor_id: string
          created_at?: string
          data_hora_checkin?: string
          fazenda_id?: string | null
          foto_path?: string | null
          foto_url?: string | null
          id?: string
          justificativa_sem_gps?: string | null
          latitude?: number | null
          longitude?: number | null
          observacoes?: string | null
          precisao_gps?: number | null
          registro_consultor_id?: string | null
          solicitacao_id?: string | null
          status?: Database["public"]["Enums"]["status_checkin"]
          talhao_id?: string | null
          tipo_checkin?: Database["public"]["Enums"]["tipo_checkin"]
        }
        Update: {
          audio_path?: string | null
          audio_url?: string | null
          client_uuid?: string | null
          cliente_id?: string | null
          consultor_id?: string
          created_at?: string
          data_hora_checkin?: string
          fazenda_id?: string | null
          foto_path?: string | null
          foto_url?: string | null
          id?: string
          justificativa_sem_gps?: string | null
          latitude?: number | null
          longitude?: number | null
          observacoes?: string | null
          precisao_gps?: number | null
          registro_consultor_id?: string | null
          solicitacao_id?: string | null
          status?: Database["public"]["Enums"]["status_checkin"]
          talhao_id?: string | null
          tipo_checkin?: Database["public"]["Enums"]["tipo_checkin"]
        }
        Relationships: [
          {
            foreignKeyName: "visitas_checkin_registro_consultor_id_fkey"
            columns: ["registro_consultor_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas_logs: {
        Row: {
          acao: string
          created_at: string
          data_hora: string
          descricao: string | null
          id: string
          metadata: Json | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          data_hora?: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          registro_consultor_id?: string | null
          solicitacao_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          data_hora?: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          registro_consultor_id?: string | null
          solicitacao_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      _src_vw_esteira_laboratorio: {
        Row: {
          aplicacao_bloqueante: boolean | null
          aplicacao_id: string | null
          atrasado: boolean | null
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_lote: string | null
          cq_id: string | null
          cq_resultado: string | null
          created_at: string | null
          data_aplicacao: string | null
          data_cq: string | null
          data_entrega: string | null
          data_envase: string | null
          data_estoque: string | null
          data_estoque_reservado: string | null
          data_inicio_producao: string | null
          data_lote: string | null
          data_programada: string | null
          entrega_confirmada: boolean | null
          entrega_id: string | null
          entrega_status: string | null
          envase_id: string | null
          estoque_id: string | null
          estoque_reservado_id: string | null
          fazenda_id: string | null
          fazenda_nome: string | null
          lote_id: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          origem_os: string | null
          os_id: string | null
          partner_id: string | null
          partner_nome: string | null
          partner_numero: string | null
          pendencias_informativas: string[] | null
          pode_finalizar: boolean | null
          prioridade: string | null
          produto_id: string | null
          produto_nome: string | null
          programacao_id: string | null
          proxima_acao: string | null
          status_esteira_oficial: string | null
          status_lote: string | null
          status_os: string | null
          status_programacao: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_cq_ate_envase: number | null
          tempo_envase_ate_entrega: number | null
          tempo_lote_ate_cq: number | null
          tempo_os_ate_entrega: number | null
          tempo_os_ate_programacao: number | null
          tempo_programacao_ate_lote: number | null
          titular_nome: string | null
          titular_tipo: string | null
          volume_solicitado_l: number | null
          volume_total_ml: number | null
        }
        Relationships: []
      }
      _src_vw_fluxo_visita_tecnica: {
        Row: {
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_visita: string | null
          consultor_id: string | null
          consultor_nome: string | null
          created_at: string | null
          cultura_id: string | null
          cultura_nome: string | null
          data_checkin: string | null
          data_conversao_os: string | null
          data_finalizacao: string | null
          data_liberacao_recomendacao: string | null
          data_prevista_atendimento: string | null
          data_vistoria: string | null
          dias_em_aberto: number | null
          fazenda_id: string | null
          fazenda_nome: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          numero_solicitacao: string | null
          origem_fluxo: string | null
          os_id: string | null
          possui_checkin: boolean | null
          possui_diagnostico: boolean | null
          possui_evidencias: boolean | null
          possui_os: boolean | null
          possui_recomendacao: boolean | null
          proxima_acao: string | null
          quantidade_diagnosticos: number | null
          quantidade_evidencias: number | null
          quantidade_recomendacoes: number | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          status_aprovacao: string | null
          status_os: string | null
          status_solicitacao: string | null
          status_visita: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_aprovacao_ate_os: number | null
          tempo_checkin_ate_finalizacao: number | null
          tempo_finalizacao_ate_aprovacao: number | null
          tempo_solicitacao_ate_checkin: number | null
          tipo_demanda: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_onfarm_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
        ]
      }
      mv_esteira_laboratorio: {
        Row: {
          aplicacao_bloqueante: boolean | null
          aplicacao_id: string | null
          atrasado: boolean | null
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_lote: string | null
          cq_id: string | null
          cq_resultado: string | null
          created_at: string | null
          data_aplicacao: string | null
          data_cq: string | null
          data_entrega: string | null
          data_envase: string | null
          data_estoque: string | null
          data_estoque_reservado: string | null
          data_inicio_producao: string | null
          data_lote: string | null
          data_programada: string | null
          entrega_confirmada: boolean | null
          entrega_id: string | null
          entrega_status: string | null
          envase_id: string | null
          estoque_id: string | null
          estoque_reservado_id: string | null
          fazenda_id: string | null
          fazenda_nome: string | null
          lote_id: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          origem_os: string | null
          os_id: string | null
          partner_id: string | null
          partner_nome: string | null
          partner_numero: string | null
          pendencias_informativas: string[] | null
          pode_finalizar: boolean | null
          prioridade: string | null
          produto_id: string | null
          produto_nome: string | null
          programacao_id: string | null
          proxima_acao: string | null
          status_esteira_oficial: string | null
          status_lote: string | null
          status_os: string | null
          status_programacao: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_cq_ate_envase: number | null
          tempo_envase_ate_entrega: number | null
          tempo_lote_ate_cq: number | null
          tempo_os_ate_entrega: number | null
          tempo_os_ate_programacao: number | null
          tempo_programacao_ate_lote: number | null
          titular_nome: string | null
          titular_tipo: string | null
          volume_solicitado_l: number | null
          volume_total_ml: number | null
        }
        Relationships: []
      }
      mv_fluxo_visita_tecnica: {
        Row: {
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_visita: string | null
          consultor_id: string | null
          consultor_nome: string | null
          created_at: string | null
          cultura_id: string | null
          cultura_nome: string | null
          data_checkin: string | null
          data_conversao_os: string | null
          data_finalizacao: string | null
          data_liberacao_recomendacao: string | null
          data_prevista_atendimento: string | null
          data_vistoria: string | null
          dias_em_aberto: number | null
          fazenda_id: string | null
          fazenda_nome: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          numero_solicitacao: string | null
          origem_fluxo: string | null
          os_id: string | null
          possui_checkin: boolean | null
          possui_diagnostico: boolean | null
          possui_evidencias: boolean | null
          possui_os: boolean | null
          possui_recomendacao: boolean | null
          proxima_acao: string | null
          quantidade_diagnosticos: number | null
          quantidade_evidencias: number | null
          quantidade_recomendacoes: number | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          status_aprovacao: string | null
          status_os: string | null
          status_solicitacao: string | null
          status_visita: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_aprovacao_ate_os: number | null
          tempo_checkin_ate_finalizacao: number | null
          tempo_finalizacao_ate_aprovacao: number | null
          tempo_solicitacao_ate_checkin: number | null
          tipo_demanda: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_onfarm_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
        ]
      }
      v_customer_fiscal_readiness: {
        Row: {
          customer_id: string | null
          has_ibge: boolean | null
          profile_status: string | null
        }
        Insert: {
          customer_id?: string | null
          has_ibge?: never
          profile_status?: string | null
        }
        Update: {
          customer_id?: string | null
          has_ibge?: never
          profile_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_fiscal_profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fiscal_certificate_readiness: {
        Row: {
          certificate_id: string | null
          company_settings_id: string | null
          days_until_expiration: number | null
          display_name: string | null
          environment: string | null
          fingerprint_sha256: string | null
          is_active: boolean | null
          issuer_name: string | null
          revoked_at: string | null
          source_type: string | null
          status: string | null
          subject_name: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          certificate_id?: string | null
          company_settings_id?: string | null
          days_until_expiration?: never
          display_name?: string | null
          environment?: string | null
          fingerprint_sha256?: string | null
          is_active?: boolean | null
          issuer_name?: string | null
          revoked_at?: string | null
          source_type?: string | null
          status?: string | null
          subject_name?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          certificate_id?: string | null
          company_settings_id?: string | null
          days_until_expiration?: never
          display_name?: string | null
          environment?: string | null
          fingerprint_sha256?: string | null
          is_active?: boolean | null
          issuer_name?: string | null
          revoked_at?: string | null
          source_type?: string | null
          status?: string | null
          subject_name?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_certificates_company_settings_id_fkey"
            columns: ["company_settings_id"]
            isOneToOne: false
            referencedRelation: "company_fiscal_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_certificates_company_settings_id_fkey"
            columns: ["company_settings_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_company_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_certificates_company_settings_id_fkey"
            columns: ["company_settings_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_nfe_emitter_readiness"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fiscal_company_readiness: {
        Row: {
          accounting_validated: boolean | null
          configuration_status: string | null
          configuration_version: number | null
          filled_score: number | null
          fiscal_environment: string | null
          fiscal_provider: string | null
          id: string | null
          last_validation_at: string | null
          last_validation_status: string | null
          max_score: number | null
          nfe_configuration_field_count: number | null
          nfe_enabled: boolean | null
          nfe_provider: string | null
          nfse_configuration_field_count: number | null
          nfse_enabled: boolean | null
          nfse_provider: string | null
          production_enabled: boolean | null
        }
        Insert: {
          accounting_validated?: never
          configuration_status?: string | null
          configuration_version?: number | null
          filled_score?: never
          fiscal_environment?: string | null
          fiscal_provider?: string | null
          id?: string | null
          last_validation_at?: string | null
          last_validation_status?: string | null
          max_score?: never
          nfe_configuration_field_count?: never
          nfe_enabled?: boolean | null
          nfe_provider?: string | null
          nfse_configuration_field_count?: never
          nfse_enabled?: boolean | null
          nfse_provider?: string | null
          production_enabled?: boolean | null
        }
        Update: {
          accounting_validated?: never
          configuration_status?: string | null
          configuration_version?: number | null
          filled_score?: never
          fiscal_environment?: string | null
          fiscal_provider?: string | null
          id?: string | null
          last_validation_at?: string | null
          last_validation_status?: string | null
          max_score?: never
          nfe_configuration_field_count?: never
          nfe_enabled?: boolean | null
          nfe_provider?: string | null
          nfse_configuration_field_count?: never
          nfse_enabled?: boolean | null
          nfse_provider?: string | null
          production_enabled?: boolean | null
        }
        Relationships: []
      }
      v_fiscal_document_reconciliation_pending: {
        Row: {
          document_model: string | null
          document_origin: string | null
          fiscal_invoice_id: string | null
          normalized_status: string | null
          receivable_id: string | null
          reconciliation_status: string | null
          status: string | null
        }
        Insert: {
          document_model?: string | null
          document_origin?: string | null
          fiscal_invoice_id?: string | null
          normalized_status?: string | null
          receivable_id?: string | null
          reconciliation_status?: string | null
          status?: string | null
        }
        Update: {
          document_model?: string | null
          document_origin?: string | null
          fiscal_invoice_id?: string | null
          normalized_status?: string | null
          receivable_id?: string | null
          reconciliation_status?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_invoices_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fiscal_nfe_emitter_readiness: {
        Row: {
          accounting_validated: boolean | null
          crt: string | null
          has_certificate: boolean | null
          has_cnpj: boolean | null
          id: string | null
          nfe_environment_code: string | null
          nfe_readiness_checked_at: string | null
          nfe_readiness_pendencies: Json | null
          nfe_readiness_status: string | null
          nfe_series_number: number | null
          state: string | null
        }
        Insert: {
          accounting_validated?: never
          crt?: string | null
          has_certificate?: never
          has_cnpj?: never
          id?: string | null
          nfe_environment_code?: string | null
          nfe_readiness_checked_at?: string | null
          nfe_readiness_pendencies?: Json | null
          nfe_readiness_status?: string | null
          nfe_series_number?: number | null
          state?: string | null
        }
        Update: {
          accounting_validated?: never
          crt?: string | null
          has_certificate?: never
          has_cnpj?: never
          id?: string | null
          nfe_environment_code?: string | null
          nfe_readiness_checked_at?: string | null
          nfe_readiness_pendencies?: Json | null
          nfe_readiness_status?: string | null
          nfe_series_number?: number | null
          state?: string | null
        }
        Relationships: []
      }
      v_fiscal_nfe_recipient_readiness: {
        Row: {
          customer_id: string | null
          final_consumer: boolean | null
          fiscal_state: string | null
          icms_taxpayer: boolean | null
          id: string | null
          nfe_readiness_checked_at: string | null
          nfe_readiness_pendencies: Json | null
          nfe_readiness_status: string | null
          person_type: string | null
          taxpayer_indicator: string | null
        }
        Insert: {
          customer_id?: string | null
          final_consumer?: boolean | null
          fiscal_state?: string | null
          icms_taxpayer?: boolean | null
          id?: string | null
          nfe_readiness_checked_at?: string | null
          nfe_readiness_pendencies?: Json | null
          nfe_readiness_status?: string | null
          person_type?: string | null
          taxpayer_indicator?: string | null
        }
        Update: {
          customer_id?: string | null
          final_consumer?: boolean | null
          fiscal_state?: string | null
          icms_taxpayer?: boolean | null
          id?: string | null
          nfe_readiness_checked_at?: string | null
          nfe_readiness_pendencies?: Json | null
          nfe_readiness_status?: string | null
          person_type?: string | null
          taxpayer_indicator?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_fiscal_profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fiscal_nfe_rule_coverage: {
        Row: {
          draft_rules: number | null
          published_rules: number | null
          superseded_rules: number | null
          tax_kind: string | null
        }
        Relationships: []
      }
      v_fiscal_sefaz_event_state: {
        Row: {
          created_at: string | null
          event_id: string | null
          event_type: string | null
          fiscal_invoice_id: string | null
          idempotency_key: string | null
          payload_fingerprint: string | null
          performed_by: string | null
          sefaz_access_key: string | null
          sefaz_c_stat: string | null
          sefaz_event_code: string | null
          sefaz_n_prot: string | null
          sefaz_reason: string | null
          sefaz_seq_evento: number | null
          signed_xml_path: string | null
          signed_xml_sha256: string | null
          state: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_events_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_events_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_document_reconciliation_pending"
            referencedColumns: ["fiscal_invoice_id"]
          },
        ]
      }
      v_microorganism_fiscal_readiness: {
        Row: {
          accounting_validated: boolean | null
          ativo: boolean | null
          codigo: string | null
          dossier_id: Json | null
          dossier_status: string | null
          fiscally_ready: boolean | null
          gate: Json | null
          microorganism_id: string | null
          minimally_classified: boolean | null
          nome: string | null
          not_applicable: Json | null
          pendencies: Json | null
          profile_id: string | null
          profile_is_active: boolean | null
          profile_status: string | null
          quarantined: boolean | null
          regulatory_ready: boolean | null
        }
        Relationships: []
      }
      v_product_fiscal_readiness: {
        Row: {
          accounting_validated: boolean | null
          fiscally_ready: boolean | null
          gate: Json | null
          minimally_classified: boolean | null
          pendencies: Json | null
          product_id: string | null
          profile_id: string | null
          profile_is_active: boolean | null
          profile_status: string | null
          quarantined: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "product_fiscal_profiles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_service_fiscal_readiness: {
        Row: {
          accounting_validated: boolean | null
          id: string | null
          minimally_classified: boolean | null
          profile_status: string | null
          service_id: string | null
          source_reference: string | null
        }
        Insert: {
          accounting_validated?: never
          id?: string | null
          minimally_classified?: never
          profile_status?: string | null
          service_id?: string | null
          source_reference?: string | null
        }
        Update: {
          accounting_validated?: never
          id?: string | null
          minimally_classified?: never
          profile_status?: string | null
          service_id?: string | null
          source_reference?: string | null
        }
        Relationships: []
      }
      vw_bi_commercial_campaigns: {
        Row: {
          ativa: boolean | null
          data_fim: string | null
          data_inicio: string | null
          id: string | null
          nome: string | null
          qtd_parceiros: number | null
          qtd_produtos: number | null
        }
        Insert: {
          ativa?: boolean | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string | null
          nome?: string | null
          qtd_parceiros?: never
          qtd_produtos?: never
        }
        Update: {
          ativa?: boolean | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string | null
          nome?: string | null
          qtd_parceiros?: never
          qtd_produtos?: never
        }
        Relationships: []
      }
      vw_bi_commercial_engagement: {
        Row: {
          commercial_region: string | null
          dias_sem_compra: number | null
          partner_id: string | null
          partner_type: Database["public"]["Enums"]["partner_type_enum"] | null
          pedidos_30d: number | null
          pedidos_90d: number | null
          razao_social: string | null
          ultima_compra: string | null
        }
        Relationships: []
      }
      vw_bi_commercial_revenue: {
        Row: {
          commercial_region: string | null
          mes: string | null
          partner_id: string | null
          partner_type: Database["public"]["Enums"]["partner_type_enum"] | null
          qtd_pedidos: number | null
          razao_social: string | null
          receita_aprovada: number | null
          receita_faturada: number | null
          receita_total: number | null
        }
        Relationships: []
      }
      vw_bi_estoque_produto: {
        Row: {
          id: string | null
          microrganismo_id: string | null
          nome_microrganismo: string | null
          nome_produto: string | null
          produto_id: string | null
          updated_at: string | null
          volume_total: number | null
          volume_total_l: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
        ]
      }
      vw_bi_movimentacoes: {
        Row: {
          created_at: string | null
          estoque_produto_id: string | null
          id: string | null
          microrganismo_id: string | null
          motivo: string | null
          produto_id: string | null
          tipo_movimentacao: string | null
          volume_alteracao: number | null
          volume_anterior: string | null
          volume_novo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["estoque_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "_src_vw_esteira_laboratorio"
            referencedColumns: ["estoque_reservado_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "estoque_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["estoque_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "mv_esteira_laboratorio"
            referencedColumns: ["estoque_reservado_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_estoque_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["estoque_id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_estoque_produto_id_fkey"
            columns: ["estoque_produto_id"]
            isOneToOne: false
            referencedRelation: "vw_os_integridade_esteira"
            referencedColumns: ["estoque_reservado_id"]
          },
          {
            foreignKeyName: "estoque_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "v_microorganism_fiscal_readiness"
            referencedColumns: ["microorganism_id"]
          },
        ]
      }
      vw_catalogo_ficha_microrganismos: {
        Row: {
          ativo: boolean | null
          dose_ml_ha: number | null
          funcao_agronomica: string | null
          id: string | null
          nome: string | null
          nome_cientifico: string | null
          preco_fonte: string | null
          valor_dose_brl: number | null
          valor_litro_brl: number | null
        }
        Relationships: []
      }
      vw_catalogo_ficha_produtos: {
        Row: {
          ativo: boolean | null
          codigo: string | null
          descricao: string | null
          dose_ml_ha: number | null
          id: string | null
          nome: string | null
          preco_fonte: string | null
          tipo: Database["public"]["Enums"]["tipo_produto"] | null
          valor_dose_brl: number | null
          valor_ha_brl: number | null
          valor_litro_brl: number | null
        }
        Relationships: []
      }
      vw_esteira_laboratorio: {
        Row: {
          aplicacao_bloqueante: boolean | null
          aplicacao_id: string | null
          atrasado: boolean | null
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_lote: string | null
          cq_id: string | null
          cq_resultado: string | null
          created_at: string | null
          data_aplicacao: string | null
          data_cq: string | null
          data_entrega: string | null
          data_envase: string | null
          data_estoque: string | null
          data_estoque_reservado: string | null
          data_inicio_producao: string | null
          data_lote: string | null
          data_programada: string | null
          entrega_confirmada: boolean | null
          entrega_id: string | null
          entrega_status: string | null
          envase_id: string | null
          estoque_id: string | null
          estoque_reservado_id: string | null
          fazenda_id: string | null
          fazenda_nome: string | null
          lote_id: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          origem_os: string | null
          os_id: string | null
          partner_id: string | null
          partner_nome: string | null
          partner_numero: string | null
          pendencias_informativas: string[] | null
          pode_finalizar: boolean | null
          prioridade: string | null
          produto_id: string | null
          produto_nome: string | null
          programacao_id: string | null
          proxima_acao: string | null
          status_esteira_oficial: string | null
          status_lote: string | null
          status_os: string | null
          status_programacao: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_cq_ate_envase: number | null
          tempo_envase_ate_entrega: number | null
          tempo_lote_ate_cq: number | null
          tempo_os_ate_entrega: number | null
          tempo_os_ate_programacao: number | null
          tempo_programacao_ate_lote: number | null
          titular_nome: string | null
          titular_tipo: string | null
          volume_solicitado_l: number | null
          volume_total_ml: number | null
        }
        Relationships: []
      }
      vw_fluxo_visita_tecnica: {
        Row: {
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_visita: string | null
          consultor_id: string | null
          consultor_nome: string | null
          created_at: string | null
          cultura_id: string | null
          cultura_nome: string | null
          data_checkin: string | null
          data_conversao_os: string | null
          data_finalizacao: string | null
          data_liberacao_recomendacao: string | null
          data_prevista_atendimento: string | null
          data_vistoria: string | null
          dias_em_aberto: number | null
          fazenda_id: string | null
          fazenda_nome: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          numero_solicitacao: string | null
          origem_fluxo: string | null
          os_id: string | null
          possui_checkin: boolean | null
          possui_diagnostico: boolean | null
          possui_evidencias: boolean | null
          possui_os: boolean | null
          possui_recomendacao: boolean | null
          proxima_acao: string | null
          quantidade_diagnosticos: number | null
          quantidade_evidencias: number | null
          quantidade_recomendacoes: number | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          status_aprovacao: string | null
          status_os: string | null
          status_solicitacao: string | null
          status_visita: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_aprovacao_ate_os: number | null
          tempo_checkin_ate_finalizacao: number | null
          tempo_finalizacao_ate_aprovacao: number | null
          tempo_solicitacao_ate_checkin: number | null
          tipo_demanda: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      vw_os_integridade_esteira: {
        Row: {
          aplicacao_bloqueante: boolean | null
          aplicacao_id: string | null
          atrasado: boolean | null
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_lote: string | null
          cq_id: string | null
          cq_resultado: string | null
          created_at: string | null
          data_aplicacao: string | null
          data_cq: string | null
          data_entrega: string | null
          data_envase: string | null
          data_estoque: string | null
          data_estoque_reservado: string | null
          data_inicio_producao: string | null
          data_lote: string | null
          data_programada: string | null
          entrega_confirmada: boolean | null
          entrega_id: string | null
          entrega_status: string | null
          envase_id: string | null
          estoque_id: string | null
          estoque_reservado_id: string | null
          fazenda_id: string | null
          fazenda_nome: string | null
          lote_id: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          origem_os: string | null
          os_id: string | null
          partner_id: string | null
          partner_nome: string | null
          partner_numero: string | null
          pendencias_informativas: string[] | null
          pode_finalizar: boolean | null
          prioridade: string | null
          produto_id: string | null
          produto_nome: string | null
          programacao_id: string | null
          status_esteira_oficial: string | null
          status_lote: string | null
          status_os: string | null
          status_programacao: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_cq_ate_envase: number | null
          tempo_envase_ate_entrega: number | null
          tempo_lote_ate_cq: number | null
          tempo_os_ate_entrega: number | null
          tempo_os_ate_programacao: number | null
          tempo_programacao_ate_lote: number | null
          titular_nome: string | null
          titular_tipo: string | null
          volume_solicitado_l: number | null
          volume_total_ml: number | null
        }
        Relationships: []
      }
      vw_partner_commercial_metrics: {
        Row: {
          partner_id: string | null
          qtd_pedidos: number | null
          razao_social: string | null
          ticket_medio: number | null
          total_aprovado: number | null
          total_comprado: number | null
          total_entregue: number | null
          total_faturado: number | null
          ultima_compra: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _assert_visita_editavel: {
        Args: { p_registro_id: string }
        Returns: {
          acao_realizada: string | null
          area_hectares: number | null
          categoria_problema:
            | Database["public"]["Enums"]["categoria_problema_consultor"]
            | null
          client_uuid: string | null
          cliente_id: string | null
          codigo_visita: string | null
          condicoes_climaticas_observadas: string | null
          consultor_profile_id: string | null
          consultor_responsavel: string | null
          created_at: string
          created_by: string | null
          cultura_id: string | null
          data_proxima_visita: string | null
          data_vistoria: string
          duracao_estimada: number | null
          fase_fenologica: string | null
          fazenda_id: string | null
          finalized_at: string | null
          finalized_by: string | null
          historico_resumido: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          latitude: number | null
          localizacao_na_area: string | null
          longitude: number | null
          natureza_registro: Database["public"]["Enums"]["natureza_registro_consultor"]
          necessidade_intervencao:
            | Database["public"]["Enums"]["necessidade_intervencao"]
            | null
          nivel_pressao: Database["public"]["Enums"]["nivel_pressao"] | null
          objetivo_visita: string | null
          observacoes_tecnicas: string | null
          origem_atendimento: string | null
          pdf_status: string | null
          percentual_area_afetada: number | null
          problema_principal: string | null
          problema_secundario: string | null
          proxima_acao_recomendada: string | null
          registro_origem_id: string | null
          risco_produtivo: Database["public"]["Enums"]["risco_produtivo"] | null
          safra: string | null
          solicitacao_id: string | null
          status: Database["public"]["Enums"]["status_registro_consultor"]
          talhao_id: string | null
          tipo_demanda:
            | Database["public"]["Enums"]["tipo_demanda_consultor"]
            | null
          tipo_visita: Database["public"]["Enums"]["tipo_visita"] | null
          updated_at: string
          urgencia: Database["public"]["Enums"]["urgencia_consultor"] | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "registros_consultor"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _avancar_os_status: {
        Args: { p_alvo: string; p_origem: string; p_os_id: string }
        Returns: undefined
      }
      _comunicacao_build_snapshot: {
        Args: {
          _cliente_id: string
          _event_key: string
          _payload: Json
          _source_id: string
          _user_id: string
        }
        Returns: Json
      }
      _comunicacao_build_snapshot_v2: {
        Args: {
          _cliente_id: string
          _event_key: string
          _payload: Json
          _source_id: string
          _source_type: string
          _user_id: string
        }
        Returns: Json
      }
      _comunicacao_can_deliver: {
        Args: {
          _canal: Database["public"]["Enums"]["comunicacao_canal"]
          _cliente_id: string
          _user_id: string
        }
        Returns: boolean
      }
      _comunicacao_dlq_replay_rate_check: {
        Args: { p_max_per_minute: number; p_scope: string }
        Returns: undefined
      }
      _comunicacao_expand_event: {
        Args: {
          _event_id: string
          _event_key: string
          _payload: Json
          _source_id: string
          _source_type: string
        }
        Returns: Json
      }
      _comunicacao_publish_system_event: {
        Args: {
          _event_key: string
          _idempotency_key: string
          _payload: Json
          _source_id: string
          _source_type: string
        }
        Returns: Json
      }
      _comunicacao_require_admin: { Args: never; Returns: undefined }
      _comunicacao_resolve_recipients: {
        Args: {
          _event_key: string
          _rule: Database["public"]["Tables"]["comunicacao_regras"]["Row"]
          _source_id: string
        }
        Returns: {
          recipient_cliente_id: string
          recipient_user_id: string
        }[]
      }
      _comunicacao_resolve_recipients_v2: {
        Args: {
          _event_key: string
          _rule: Database["public"]["Tables"]["comunicacao_regras"]["Row"]
          _source_id: string
          _source_type: string
        }
        Returns: {
          recipient_cliente_id: string
          recipient_user_id: string
        }[]
      }
      _comunicacao_resolve_template: {
        Args: {
          _canal: Database["public"]["Enums"]["comunicacao_canal"]
          _chave: string
          _versao: number
        }
        Returns: {
          archived_at: string | null
          assunto: string | null
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          chave: string
          corpo: string
          created_at: string
          created_by: string | null
          id: string
          language_code: string | null
          locale: string
          nome: string
          parameter_mapping: Json
          provider_template_name: string | null
          provider_template_status: string | null
          status: Database["public"]["Enums"]["comunicacao_template_status"]
          updated_at: string
          updated_by: string | null
          variaveis: Json
          versao: number
        }
        SetofOptions: {
          from: "*"
          to: "comunicacao_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _comunicacao_write_audit: {
        Args: {
          _acao: string
          _after: Json
          _before: Json
          _entidade: string
          _entity_id: string
        }
        Returns: undefined
      }
      _comunicacao_write_consent: {
        Args: {
          _acao: string
          _canal: Database["public"]["Enums"]["comunicacao_canal"]
          _cliente_id: string
          _source: string
          _user_id: string
        }
        Returns: undefined
      }
      _cpp_audit: {
        Args: {
          _acao: string
          _motivo: string
          _new: Json
          _old: Json
          _plan_id: string
        }
        Returns: undefined
      }
      _cpp_validate_payload: { Args: { p: Json }; Returns: undefined }
      _entrega_seed_checklist: {
        Args: { _entrega_id: string }
        Returns: undefined
      }
      _fiscal_rtc_assert_payload: {
        Args: { kind: string; payload: Json }
        Returns: undefined
      }
      _fiscal_rtc_can_read: { Args: { uid: string }; Returns: boolean }
      _notify_role: {
        Args: {
          p_link: string
          p_mensagem: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_tipo: string
          p_titulo: string
        }
        Returns: undefined
      }
      _org_admin_org: { Args: never; Returns: string }
      _org_set_status: {
        Args: { _motivo: string; _org: string; _para: string }
        Returns: undefined
      }
      _portal_cliente_user_has_link: {
        Args: { p_cliente: string; p_user: string }
        Returns: boolean
      }
      _rpc_avancar_esteira_laboratorio_internal: {
        Args: {
          p_etapa_destino: string
          p_origem_os: string
          p_os_id: string
          p_programacao_id?: string
        }
        Returns: Json
      }
      _saas_user_has_feature: {
        Args: { _feature_key: string; _uid: string }
        Returns: boolean
      }
      _validate_planning_integrity: {
        Args: { p_partner_order_id: string }
        Returns: undefined
      }
      _visita_lock_and_check: {
        Args: {
          p_expected_version: number
          p_registro_id: string
          p_require_approver?: boolean
        }
        Returns: {
          acao_realizada: string | null
          area_hectares: number | null
          categoria_problema:
            | Database["public"]["Enums"]["categoria_problema_consultor"]
            | null
          client_uuid: string | null
          cliente_id: string | null
          codigo_visita: string | null
          condicoes_climaticas_observadas: string | null
          consultor_profile_id: string | null
          consultor_responsavel: string | null
          created_at: string
          created_by: string | null
          cultura_id: string | null
          data_proxima_visita: string | null
          data_vistoria: string
          duracao_estimada: number | null
          fase_fenologica: string | null
          fazenda_id: string | null
          finalized_at: string | null
          finalized_by: string | null
          historico_resumido: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          latitude: number | null
          localizacao_na_area: string | null
          longitude: number | null
          natureza_registro: Database["public"]["Enums"]["natureza_registro_consultor"]
          necessidade_intervencao:
            | Database["public"]["Enums"]["necessidade_intervencao"]
            | null
          nivel_pressao: Database["public"]["Enums"]["nivel_pressao"] | null
          objetivo_visita: string | null
          observacoes_tecnicas: string | null
          origem_atendimento: string | null
          pdf_status: string | null
          percentual_area_afetada: number | null
          problema_principal: string | null
          problema_secundario: string | null
          proxima_acao_recomendada: string | null
          registro_origem_id: string | null
          risco_produtivo: Database["public"]["Enums"]["risco_produtivo"] | null
          safra: string | null
          solicitacao_id: string | null
          status: Database["public"]["Enums"]["status_registro_consultor"]
          talhao_id: string | null
          tipo_demanda:
            | Database["public"]["Enums"]["tipo_demanda_consultor"]
            | null
          tipo_visita: Database["public"]["Enums"]["tipo_visita"] | null
          updated_at: string
          urgencia: Database["public"]["Enums"]["urgencia_consultor"] | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "registros_consultor"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _visita_log_status: {
        Args: {
          p_acao: string
          p_motivo: string
          p_registro_id: string
          p_status_anterior: string
          p_status_novo: string
          p_version: number
        }
        Returns: undefined
      }
      _visita_scope_ok: {
        Args: { p_registro_id: string; p_user_id: string }
        Returns: boolean
      }
      add_b2b_payment_terms_note_secure: {
        Args: { p_note: string; p_partner_order_id: string }
        Returns: Json
      }
      admin_can_update_user_password_server: {
        Args: { p_actor_id: string; p_target_id: string }
        Returns: boolean
      }
      admin_edit_user_profile_v1: {
        Args: {
          p_cliente_ids: string[]
          p_expected_updated_at: string
          p_partner_id: string
          p_principal_cliente_id: string
          p_profile: Json
          p_roles: Database["public"]["Enums"]["app_role"][]
          p_user_id: string
        }
        Returns: Json
      }
      admin_provision_user_profile_v1: {
        Args: {
          p_cargo?: string
          p_cliente_ids?: string[]
          p_cpf_cnpj?: string
          p_crea?: string
          p_email: string
          p_especialidade?: string
          p_nome: string
          p_partner_id?: string
          p_partner_papel?: string
          p_principal_cliente_id?: string
          p_roles: Database["public"]["Enums"]["app_role"][]
          p_telefone?: string
          p_user_id: string
        }
        Returns: undefined
      }
      aplicacao_storage_path_permitido: {
        Args: { _modo: string; _name: string }
        Returns: boolean
      }
      approve_b2b_credit: {
        Args: { p_notes?: string; p_partner_order_id: string }
        Returns: Json
      }
      approve_b2b_payment_terms_secure: {
        Args: { p_notes?: string; p_partner_order_id: string }
        Returns: Json
      }
      approve_microorganism_profile_with_audit: {
        Args: {
          p_aprovado_sem_fonte?: boolean
          p_checklist: Json
          p_profile_id: string
        }
        Returns: undefined
      }
      approve_partner_order: {
        Args: {
          p_approval_notes?: string
          p_estimated_delivery_date?: string
          p_order_id: string
        }
        Returns: undefined
      }
      approve_product_profile_with_audit: {
        Args: {
          p_aprovado_sem_fonte?: boolean
          p_checklist: Json
          p_profile_id: string
        }
        Returns: undefined
      }
      aprovar_ficha_versao: {
        Args: { p_versao_id: string }
        Returns: undefined
      }
      archive_partner_simulation_secure: {
        Args: { p_reason?: string; p_simulation_id: string }
        Returns: undefined
      }
      assign_b2b_user_client_secure: {
        Args: {
          p_assignment_type?: string
          p_can_create_simulation?: boolean
          p_can_monitor?: boolean
          p_cliente_id: string
          p_notes?: string
          p_user_id: string
        }
        Returns: string
      }
      auto_reject_partner_orders_no_items: {
        Args: { p_horas?: number }
        Returns: number
      }
      bulk_inserir_alvos: {
        Args: { p_alvos: Json; p_kind: string; p_parent_id: string }
        Returns: Json
      }
      calculate_valor_dose_from_litro: {
        Args: { p_valor_litro: number }
        Returns: number
      }
      calculate_valor_ha_from_dose: {
        Args: { p_dose_ml_ha: number; p_valor_dose: number }
        Returns: number
      }
      calculate_valor_litro_from_dose: {
        Args: { p_valor_dose: number }
        Returns: number
      }
      can_checkin_technical_visit: {
        Args: { p_registro_id: string; p_user_id: string }
        Returns: boolean
      }
      can_checkout_technical_visit: {
        Args: { p_registro_id: string; p_user_id: string }
        Returns: boolean
      }
      can_manage_catalog_tecnico: { Args: { _uid: string }; Returns: boolean }
      can_manage_technical_visit: {
        Args: { p_registro_id: string; p_user_id: string }
        Returns: boolean
      }
      can_user_access_alerta: {
        Args: { p_alerta_id: string }
        Returns: boolean
      }
      can_user_access_aplicacao: {
        Args: { _aplicacao_id: string }
        Returns: boolean
      }
      can_user_access_arquivo: {
        Args: { _entidade_id: string; _entidade_tipo: string }
        Returns: boolean
      }
      can_user_access_cliente:
        | { Args: { _cliente_id: string }; Returns: boolean }
        | { Args: { _cliente_id: string; _user_id: string }; Returns: boolean }
      can_user_access_estoque_embalagem: {
        Args: { p_embalagem_id: string }
        Returns: boolean
      }
      can_user_access_fazenda: {
        Args: { _fazenda_id: string }
        Returns: boolean
      }
      can_user_access_produto_etiqueta: {
        Args: { p_etiqueta_id: string }
        Returns: boolean
      }
      can_user_access_registro_consultor: {
        Args: { _registro_id: string }
        Returns: boolean
      }
      can_user_access_solicitacao: {
        Args: { _solicitacao_id: string }
        Returns: boolean
      }
      can_user_create_aplicacao_for_cliente: {
        Args: { _cliente_id: string }
        Returns: boolean
      }
      can_user_manage_aplicacao: {
        Args: { _aplicacao_id: string }
        Returns: boolean
      }
      can_user_manage_estoque_embalagem: {
        Args: { p_embalagem_id: string }
        Returns: boolean
      }
      can_view_bi_operacional: { Args: { _uid: string }; Returns: boolean }
      can_view_catalog_internal: { Args: { _uid: string }; Returns: boolean }
      can_view_technical_visit: {
        Args: { p_registro_id: string; p_user_id: string }
        Returns: boolean
      }
      cancel_b2b_receivable_secure: {
        Args: { p_motivo: string; p_partner_order_id: string }
        Returns: Json
      }
      cancel_financial_receipt: {
        Args: { _reason: string; _receipt_id: string }
        Returns: undefined
      }
      check_cliente_dependencies: {
        Args: { _cliente_id: string }
        Returns: Json
      }
      check_fazenda_dependencies: {
        Args: { _fazenda_id: string }
        Returns: Json
      }
      check_partner_order_sla: { Args: never; Returns: undefined }
      check_talhao_dependencies: { Args: { _talhao_id: string }; Returns: Json }
      cliente_storage_object_permitted: {
        Args: { _name: string }
        Returns: boolean
      }
      convert_partner_simulation_to_order_secure: {
        Args: {
          p_confirm_price_change?: boolean
          p_first_due_date?: string
          p_installment_count?: number
          p_observacoes?: string
          p_payment_plan_id?: string
          p_simulation_id: string
        }
        Returns: string
      }
      create_partner_order_secure: {
        Args: {
          p_expected_cart_hash?: string
          p_first_due_date?: string
          p_idempotency_key?: string
          p_installment_count?: number
          p_items?: Json
          p_observacoes?: string
          p_partner_id: string
          p_payment_plan_id?: string
          p_requested_delivery_date?: string
        }
        Returns: Json
      }
      create_technical_visit_secure: {
        Args: {
          p_client_uuid?: string
          p_cliente_id: string
          p_fazenda_id: string
          p_initial_notes?: string
          p_priority?: Database["public"]["Enums"]["urgencia_consultor"]
          p_scheduled_at?: string
          p_solicitacao_origem_id?: string
          p_talhao_id?: string
          p_visit_type?: Database["public"]["Enums"]["tipo_visita"]
        }
        Returns: {
          is_new: boolean
          registro_id: string
        }[]
      }
      d51_5_p0d_ab_selftest: { Args: never; Returns: Json }
      financial_storage_object_permitted: {
        Args: { _bucket: string; _name: string }
        Returns: boolean
      }
      finish_technical_visit_secure: {
        Args: {
          p_client_uuid?: string
          p_foto_path?: string
          p_foto_url?: string
          p_latitude?: number
          p_longitude?: number
          p_observacoes?: string
          p_precisao_gps?: number
          p_registro_id: string
        }
        Returns: {
          checkout_id: string
          finalized_at: string
          registro_id: string
        }[]
      }
      fiscal_json_has_sensitive_key: { Args: { p: Json }; Returns: boolean }
      fiscal_rtc_has_sensitive_key: {
        Args: { payload: Json }
        Returns: boolean
      }
      fiscal_validate_key_usage: { Args: { p_arr: Json }; Returns: undefined }
      fiscal_validate_snapshot_keys: {
        Args: { p_allowed: string[]; p_label: string; p_obj: Json }
        Returns: undefined
      }
      fn_authz_uid_scope_ok: { Args: { _uid: string }; Returns: boolean }
      fn_avancar_etapa_esteira: {
        Args: {
          p_etapa_destino: string
          p_origem: string
          p_os_id: string
          p_programacao_id: string
          p_usuario_id?: string
        }
        Returns: Json
      }
      fn_b2b_apply_interest: {
        Args: {
          p_interest_type: string
          p_monthly_pct: number
          p_months: number
          p_net: number
        }
        Returns: number
      }
      fn_b2b_can_admin_plans: { Args: { _user_id?: string }; Returns: boolean }
      fn_b2b_cart_hash: {
        Args: {
          p_cart: Json
          p_final: number
          p_partner_id: string
          p_plan_id: string
        }
        Returns: string
      }
      fn_b2b_credit_exposure: {
        Args: {
          p_exclude_order_id?: string
          p_new_order_amount?: number
          p_partner_id: string
        }
        Returns: Json
      }
      fn_b2b_order_billing_eligibility: {
        Args: { p_partner_order_id: string }
        Returns: Json
      }
      fn_b2b_order_priceable: { Args: { p_order_id: string }; Returns: boolean }
      fn_b2b_plan_referenced: { Args: { _plan_id: string }; Returns: boolean }
      fn_b2b_plan_selectable: {
        Args: { _plan_id: string; _ref?: string }
        Returns: boolean
      }
      fn_b2b_resolve_base_unit_price: {
        Args: {
          p_microrganismo_id: string
          p_partner_id: string
          p_product_id: string
          p_ref_date?: string
          p_unit_type: string
          p_volume_ml?: number
        }
        Returns: Json
      }
      fn_b2b_status_is_approved_or_later: {
        Args: { p_status: Database["public"]["Enums"]["partner_order_status"] }
        Returns: boolean
      }
      fn_b2b_status_is_operational: {
        Args: { p_status: Database["public"]["Enums"]["partner_order_status"] }
        Returns: boolean
      }
      fn_calc_next_generation_date: {
        Args: { _due_day: number; _freq: string; _from_date: string }
        Returns: string
      }
      fn_catalogo_litro_canonico: {
        Args: { p_microrganismo_id: string; p_produto_id: string }
        Returns: Record<string, unknown>
      }
      fn_catalogo_preco_canonico: {
        Args: {
          p_microrganismo_id: string
          p_product_id: string
          p_unit_type: string
          p_volume_ml?: number
        }
        Returns: number
      }
      fn_catalogo_sync_mestre_preco: {
        Args: { p_microrganismo_id: string; p_produto_id: string }
        Returns: undefined
      }
      fn_cc_audit: {
        Args: {
          p_action: string
          p_after: Json
          p_before: Json
          p_entity: string
          p_entity_id: string
          p_motivo: string
        }
        Returns: undefined
      }
      fn_cc_can_prepare: { Args: { p_uid: string }; Returns: boolean }
      fn_cc_can_publish: { Args: { p_uid: string }; Returns: boolean }
      fn_cc_validate_item_input: {
        Args: {
          p_condition_price: number
          p_discount_percent: number
          p_plan_id: string
          p_pricing_mode: string
        }
        Returns: undefined
      }
      fn_cockpit_assert_b2b_liberado: {
        Args: { p_partner_order_id: string }
        Returns: undefined
      }
      fn_cockpit_assert_operador: { Args: never; Returns: undefined }
      fn_cockpit_assert_operador_origem: {
        Args: { p_origem: string }
        Returns: string
      }
      fn_cockpit_ctx_programacao: {
        Args: { p_programacao_id: string }
        Returns: {
          cliente_id: string
          microrganismo_id: string
          origem: string
          os_id: string
          partner_order_id: string
          produto_id: string
          programacao_id: string
          status_os: string
          volume_necessario: number
        }[]
      }
      fn_cockpit_is_gestor: { Args: never; Returns: boolean }
      fn_cockpit_norm_origem: { Args: { p_origem: string }; Returns: string }
      fn_cockpit_payload_hash: { Args: { p_payload: Json }; Returns: string }
      fn_cockpit_stage: { Args: { p_status_oficial: string }; Returns: string }
      fn_comprovante_entrega_montar_v1: {
        Args: { p_entrega_id: string }
        Returns: Json
      }
      fn_conformidade_perfil_vigente: {
        Args: { p_categoria: string; p_produto_id: string }
        Returns: {
          advertencias: string[]
          aprovado_em: string | null
          aprovado_por: string | null
          campos_obrigatorios: string[]
          categoria: string | null
          conservacao_texto: string | null
          created_at: string
          criado_por: string | null
          documento_referencia: string | null
          documento_validade: string | null
          fonte_documento: string | null
          id: string
          identificadores_fiscais: Json
          identificadores_regulatorios: Json
          inativado_em: string | null
          inativado_por: string | null
          motivo_aprovacao: string | null
          motivo_inativacao: string | null
          perfil_key: string
          politica_validade: string | null
          produto_id: string | null
          registro_mapa: string | null
          responsavel_informacao: string | null
          responsavel_tecnico_nome: string | null
          responsavel_tecnico_registro: string | null
          status: string
          template_versao: string | null
          transporte_texto: string | null
          updated_at: string
          uso_texto: string | null
          validade_meses: number | null
          versao: number
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        SetofOptions: {
          from: "*"
          to: "produto_conformidade_perfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_cq_ultimo_resultado: { Args: { p_lote_id: string }; Returns: string }
      fn_cultura_em_uso: { Args: { _cultura_id: string }; Returns: boolean }
      fn_entrega_assert_confirmador: {
        Args: { p_origem: string }
        Returns: string
      }
      fn_entrega_build_snapshot_v1: {
        Args: { p_entrega_id: string }
        Returns: Json
      }
      fn_entrega_cobertura_v1: {
        Args: { p_entrega_id: string }
        Returns: string
      }
      fn_entrega_confirmar_engine_v1: {
        Args: {
          p_entrega_id: string
          p_opcoes?: Json
          p_origem: string
          p_os_id: string
          p_recebedor?: Json
        }
        Returns: Json
      }
      fn_entrega_guard_faturamento_v1: {
        Args: { p_entrega_id: string; p_total: number }
        Returns: Json
      }
      fn_entrega_valor_faturavel_v1: {
        Args: { p_entrega_id: string }
        Returns: Json
      }
      fn_estoque_ctx_close: { Args: never; Returns: undefined }
      fn_estoque_ctx_force: { Args: { p_ctx: Json }; Returns: undefined }
      fn_estoque_ctx_open: { Args: { p_ctx: Json }; Returns: undefined }
      fn_estoque_ctx_read: { Args: never; Returns: Json }
      fn_estoque_fingerprint: {
        Args: { p_acao: string; p_item: string; p_payload: Json; p_qtd: number }
        Returns: string
      }
      fn_estoque_pode_operar: {
        Args: { _acao: string; _uid: string }
        Returns: boolean
      }
      fn_fin_aging: {
        Args: { _type?: string }
        Returns: {
          bucket: string
          qtd: number
          total: number
        }[]
      }
      fn_fin_cashflow: {
        Args: {
          _from: string
          _granularity?: string
          _mode?: string
          _to: string
        }
        Returns: {
          bucket: string
          entradas: number
          saidas: number
          saldo: number
        }[]
      }
      fn_fin_dashboard_kpis: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      fn_fin_dre_summary: {
        Args: { _from: string; _regime?: string; _to: string }
        Returns: {
          dre_group: string
          qtd: number
          total: number
        }[]
      }
      fn_fin_expense_by_category: {
        Args: { _from: string; _limit?: number; _regime?: string; _to: string }
        Returns: {
          category_id: string
          category_name: string
          dre_group: string
          total: number
        }[]
      }
      fn_fin_inadimplencia: {
        Args: never
        Returns: {
          amount: number
          customer_id: string
          customer_name: string
          dias_atraso: number
          due_date: string
          installment_id: string
          receivable_id: string
        }[]
      }
      fn_fin_revenue_by_category: {
        Args: { _from: string; _limit?: number; _regime?: string; _to: string }
        Returns: {
          category_id: string
          category_name: string
          dre_group: string
          total: number
        }[]
      }
      fn_fin_revenue_by_customer: {
        Args: { _from: string; _limit?: number; _regime?: string; _to: string }
        Returns: {
          customer_id: string
          customer_name: string
          total: number
        }[]
      }
      fn_financial_inconsistencies: {
        Args: never
        Returns: {
          code: string
          description: string
          entity_id: string
          entity_type: string
          recommended_action: string
          severity: string
        }[]
      }
      fn_fiscal_access_key_dv: { Args: { _key43: string }; Returns: number }
      fn_fiscal_apply_tax: {
        Args: {
          _base: number
          r: Database["public"]["Tables"]["fiscal_tax_rules"]["Row"]
        }
        Returns: Json
      }
      fn_fiscal_apply_tax_v2: {
        Args: {
          _ctx: Json
          r: Database["public"]["Tables"]["fiscal_tax_rules"]["Row"]
        }
        Returns: Json
      }
      fn_fiscal_apportion_v1: {
        Args: { p_total: number; p_weights: number[] }
        Returns: number[]
      }
      fn_fiscal_assert_debtor_recipient: {
        Args: { _invoice_id: string }
        Returns: Json
      }
      fn_fiscal_assert_environment_homologation: {
        Args: never
        Returns: undefined
      }
      fn_fiscal_assert_staging_marker: {
        Args: { p_operation?: string }
        Returns: undefined
      }
      fn_fiscal_base_components_valid: { Args: { _c: Json }; Returns: boolean }
      fn_fiscal_billing_allowed_delivery_status: {
        Args: never
        Returns: string[]
      }
      fn_fiscal_billing_allowed_order_status: { Args: never; Returns: string[] }
      fn_fiscal_can_operate: { Args: { _uid?: string }; Returns: boolean }
      fn_fiscal_can_read_internal: { Args: { _uid?: string }; Returns: boolean }
      fn_fiscal_cep_is_valid: { Args: { _cep: string }; Returns: boolean }
      fn_fiscal_cnpj_is_valid: { Args: { _v: string }; Returns: boolean }
      fn_fiscal_company_crt: { Args: never; Returns: string }
      fn_fiscal_compute_item_taxes_v1: {
        Args: {
          p_desconto: number
          p_dest: Database["public"]["Tables"]["customer_fiscal_profiles"]["Row"]
          p_direction: string
          p_emit: Database["public"]["Tables"]["company_fiscal_settings"]["Row"]
          p_frete: number
          p_inputs: Json
          p_manual_by: string
          p_ncm: string
          p_outras: number
          p_prod: number
          p_ref_date: string
          p_sales_channel: string
          p_seguro: number
        }
        Returns: Json
      }
      fn_fiscal_cpf_is_valid: { Args: { _v: string }; Returns: boolean }
      fn_fiscal_digits: { Args: { _v: string }; Returns: string }
      fn_fiscal_emitter_pendencies: { Args: { _id: string }; Returns: Json }
      fn_fiscal_emitter_pendencies_row: {
        Args: {
          r: Database["public"]["Tables"]["company_fiscal_settings"]["Row"]
        }
        Returns: Json
      }
      fn_fiscal_emitter_status: { Args: { _id: string }; Returns: string }
      fn_fiscal_environment_gate_v1: {
        Args: { p_operation?: string }
        Returns: string
      }
      fn_fiscal_event_fingerprint_v1: {
        Args: { _event_type: string; _notes: string }
        Returns: string
      }
      fn_fiscal_ibge_municipio_coerente: {
        Args: { _cmun: string; _uf: string }
        Returns: boolean
      }
      fn_fiscal_ie_check: {
        Args: { _ie: string; _uf: string }
        Returns: string
      }
      fn_fiscal_invoice_eligibility:
        | { Args: { _source_id: string; _source_type: string }; Returns: Json }
        | {
            Args: {
              _current_invoice_id: string
              _source_id: string
              _source_type: string
            }
            Returns: Json
          }
      fn_fiscal_item_base: {
        Args: { _components: Json; _ctx: Json }
        Returns: number
      }
      fn_fiscal_item_profile_gate_eval: {
        Args: {
          p_accounting_notes: string
          p_accounting_validated_at: string
          p_cfop_in_state: string
          p_cfop_interstate: string
          p_cofins_cst: string
          p_commercial_unit: string
          p_crt: string
          p_fiscal_description: string
          p_icms_csosn: string
          p_icms_cst: string
          p_is_active: boolean
          p_ncm: string
          p_origin_code: string
          p_pis_cst: string
          p_profile_status: string
          p_regulatory?: Json
          p_scope: string
          p_taxable_unit: string
        }
        Returns: Json
      }
      fn_fiscal_official_url_allowlisted: {
        Args: { _url: string }
        Returns: boolean
      }
      fn_fiscal_partner_fiscal_customer: {
        Args: { _partner_id: string }
        Returns: string
      }
      fn_fiscal_recipient_pendencies_row: {
        Args: {
          r: Database["public"]["Tables"]["customer_fiscal_profiles"]["Row"]
        }
        Returns: Json
      }
      fn_fiscal_requirement_resolve: {
        Args: {
          p_operation_type: string
          p_ref_date?: string
          p_sales_channel: string
          p_scope_id?: string
          p_scope_type?: string
          p_uf: string
        }
        Returns: Json
      }
      fn_fiscal_resolve_operation: {
        Args: {
          _crt: string
          _destination_uf: string
          _direction: string
          _final_consumer: boolean
          _ncm: string
          _origin_uf: string
          _product_category: string
          _ref_date?: string
          _sales_channel: string
          _taxpayer_indicator: string
        }
        Returns: {
          active: boolean
          cfop: string | null
          created_at: string
          created_by: string | null
          crt: string | null
          destination_uf: string | null
          direction: string | null
          document_model: string | null
          fin_nfe: number | null
          final_consumer: boolean | null
          id: string
          legal_basis: string | null
          legal_version: string | null
          nature_operation: string | null
          ncm_prefix: string | null
          notes: string | null
          operation_type: string
          origin_uf: string | null
          policy_status: string
          prepared_by: string | null
          presence_indicator: number | null
          priority: number
          product_category: string | null
          published_at: string | null
          published_by: string | null
          requires_invoice: boolean
          sales_channel: string
          source_id: string | null
          taxpayer_indicator: string | null
          uf: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fiscal_operation_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_fiscal_resolve_tax_rule: {
        Args: {
          _crt: string
          _destination_uf: string
          _final_consumer: boolean
          _ncm: string
          _origin_uf: string
          _product_category: string
          _ref_date?: string
          _tax_kind: string
          _taxpayer_indicator: string
        }
        Returns: {
          base_components: Json
          base_reduction_mode: string
          base_reduction_pct: number | null
          calc_mode: string
          created_at: string
          created_by: string | null
          credit_own_icms: boolean
          crt: string | null
          csosn: string | null
          cst: string | null
          deferral_pct: number | null
          destination_uf: string | null
          difal_dest_share_pct: number | null
          fcp_rate: number | null
          fcp_st_rate: number | null
          final_consumer: boolean | null
          id: string
          internal_rate_pct: number | null
          interstate_rate_pct: number | null
          justification: string | null
          legal_basis: string | null
          legal_version: string | null
          mva_pct: number | null
          ncm_prefix: string | null
          origin_uf: string | null
          prepared_by: string | null
          priority: number
          product_category: string | null
          published_at: string | null
          published_by: string | null
          rate: number | null
          rule_key: string
          source_id: string | null
          st_modality: string | null
          status: string
          superseded_by: string | null
          tax_kind: string
          taxpayer_indicator: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "fiscal_tax_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_fiscal_round: { Args: { _v: number }; Returns: number }
      fn_fiscal_rtc_layout_supported_v1: {
        Args: { _document_model: string; _ref_date: string; _tax_kind: string }
        Returns: boolean
      }
      fn_fiscal_rule_validate_synthetic: {
        Args: {
          _ctx: Json
          _rule: Database["public"]["Tables"]["fiscal_tax_rules"]["Row"]
          _tax_kind: string
        }
        Returns: string
      }
      fn_fiscal_scenario_coverage: { Args: never; Returns: Json }
      fn_fiscal_service_withholding_valid_v1: {
        Args: { _cfg: Json }
        Returns: boolean
      }
      fn_fiscal_status_is_terminal: {
        Args: { _status: string }
        Returns: boolean
      }
      fn_fiscal_tax_input_valid: { Args: { _input: Json }; Returns: boolean }
      fn_fiscal_uf_ibge_code: { Args: { _uf: string }; Returns: string }
      fn_generate_receivable_from_entrega: {
        Args: { _entrega_id: string; _payload: Json }
        Returns: string
      }
      fn_generate_recurring_title: {
        Args: {
          _is_manual?: boolean
          _reference_date: string
          _template_id: string
        }
        Returns: string
      }
      fn_gtin_is_valid: { Args: { _gtin: string }; Returns: boolean }
      fn_h6b_num: { Args: { p: number }; Returns: string }
      fn_h6b_payment_fingerprint: {
        Args: { p_installment_id: string; p_kind: string; p_payload: Json }
        Returns: string
      }
      fn_h6d_hard_delete_allowed: { Args: never; Returns: boolean }
      fn_mark_entrega_not_billable: {
        Args: { _entrega_id: string; _reason: string }
        Returns: undefined
      }
      fn_mark_financial_overdue: { Args: never; Returns: undefined }
      fn_microorganism_regulatory_facts: {
        Args: { p_microorganism_id: string }
        Returns: Json
      }
      fn_onfarm_scope_cliente: {
        Args: { _cliente_id: string }
        Returns: boolean
      }
      fn_onfarm_scope_lote: { Args: { _lote_id: string }; Returns: boolean }
      fn_regulatory_can_approve: {
        Args: { _layer: string; _uid?: string }
        Returns: boolean
      }
      fn_regulatory_can_prepare: { Args: { _uid?: string }; Returns: boolean }
      fn_regulatory_can_read: { Args: { _uid?: string }; Returns: boolean }
      fn_regulatory_confidence_normalize: {
        Args: { p_confidence: string }
        Returns: string
      }
      fn_regulatory_storage_can_delete: {
        Args: { _name: string }
        Returns: boolean
      }
      fn_regulatory_storage_can_read: {
        Args: { _name: string }
        Returns: boolean
      }
      fn_regulatory_storage_can_write: {
        Args: { _name: string }
        Returns: boolean
      }
      fn_regulatory_storage_dossier_id: {
        Args: { _name: string }
        Returns: string
      }
      fn_regulatory_storage_path_ok: {
        Args: { _name: string }
        Returns: boolean
      }
      fn_resolve_b2b_cart: {
        Args: {
          p_items: Json
          p_partner_id: string
          p_plan_id: string
          p_ref_date?: string
        }
        Returns: Json
      }
      fn_resolve_commercial_price: {
        Args: {
          p_buyer_scope: string
          p_customer_id: string
          p_microrganismo_id: string
          p_partner_id: string
          p_plan_id: string
          p_product_id: string
          p_quantity?: number
          p_ref_date?: string
          p_unit_type: string
          p_volume_ml: number
        }
        Returns: Json
      }
      fn_reverse_payment: {
        Args: { _kind: string; _payment_id: string; _reason: string }
        Returns: string
      }
      fn_revert_recurring_generation: {
        Args: { p_log_id: string }
        Returns: undefined
      }
      fn_run_financial_inconsistency_check: { Args: never; Returns: string }
      fn_run_recurring_generation: {
        Args: never
        Returns: {
          message: string
          status: string
          template_id: string
        }[]
      }
      fn_upsert_alerta_operacional: {
        Args: {
          p_cliente_id: string
          p_consultor_id: string
          p_descricao: string
          p_entrega_id: string
          p_fazenda_id: string
          p_gravidade: string
          p_lote_id: string
          p_metadata: Json
          p_origem: string
          p_os_id: string
          p_proxima_acao: string
          p_referencia_id: string
          p_referencia_tabela: string
          p_registro_consultor_id: string
          p_solicitacao_id: string
          p_talhao_id: string
          p_tipo: string
          p_titulo: string
        }
        Returns: string
      }
      generate_b2b_receivable_secure: {
        Args: { p_partner_order_id: string }
        Returns: Json
      }
      generate_b2b_receivable_secure_impl: {
        Args: { p_partner_order_id: string }
        Returns: Json
      }
      generate_production_orders_from_partner: {
        Args: { p_partner_order_id: string }
        Returns: Json
      }
      gerar_codigo_lote: { Args: { _ano?: number }; Returns: string }
      gerar_codigo_visita: { Args: { _ano: number }; Returns: string }
      get_b2b_partner_clients_for_assignment_secure: {
        Args: { p_search?: string }
        Returns: {
          active: boolean
          cidade: string
          cliente_id: string
          documento_mascarado: string
          estado: string
          ja_vinculado_ao_parceiro: boolean
          nome: string
          nome_fantasia: string
          razao_social: string
        }[]
      }
      get_b2b_technician_client_detail_secure: {
        Args: { p_cliente_id: string }
        Returns: {
          bairro: string
          cidade: string
          cliente_id: string
          documento_mascarado: string
          email: string
          estado: string
          logradouro: string
          nome: string
          nome_fantasia: string
          observacoes: string
          razao_social: string
          telefone: string
          tipo_pessoa: string
          total_simulacoes: number
          ultima_simulacao_at: string
        }[]
      }
      get_b2b_technician_clients_secure: {
        Args: { p_partner_id?: string; p_technician_user_id?: string }
        Returns: {
          assigned_at: string
          cidade: string
          cliente_id: string
          documento_mascarado: string
          estado: string
          nome: string
          nome_fantasia: string
          razao_social: string
          telefone: string
          tipo_pessoa: string
          total_simulacoes: number
          ultima_simulacao_at: string
        }[]
      }
      get_b2b_user_client_detail_secure: {
        Args: { p_cliente_id: string; p_scope?: string }
        Returns: {
          assigned_at: string
          assignment_type: string
          can_create_simulation: boolean
          cidade: string
          cliente_id: string
          documento_mascarado: string
          email: string
          estado: string
          nome: string
          nome_fantasia: string
          razao_social: string
          telefone: string
          tipo_pessoa: string
        }[]
      }
      get_b2b_user_client_simulations_secure: {
        Args: { p_cliente_id: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          status: string
          titulo: string
          total_cheio: number
        }[]
      }
      get_b2b_user_clients_secure: {
        Args: { p_search?: string; p_user_id?: string }
        Returns: {
          assigned_at: string
          assignment_type: string
          can_create_simulation: boolean
          can_monitor: boolean
          cidade: string
          cliente_id: string
          documento_mascarado: string
          estado: string
          nome: string
          nome_fantasia: string
          razao_social: string
          telefone: string
          tipo_pessoa: string
          total_simulacoes: number
          ultima_simulacao_at: string
        }[]
      }
      get_b2b_user_role_for_partner: {
        Args: { p_partner_id: string; p_user_id: string }
        Returns: string
      }
      get_cliente_id_for_user: { Args: { _user_id: string }; Returns: string }
      get_cliente_ids_for_user: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_financial_alerts: {
        Args: { p_reference_date?: string }
        Returns: {
          action_key: string
          alert_type: string
          amount: number
          count: number
          description: string
          severity: string
          title: string
        }[]
      }
      get_financial_cashflow: {
        Args: {
          p_end_date: string
          p_group_by?: string
          p_start_date: string
          p_view_mode?: string
        }
        Returns: {
          accumulated_projected_balance: number
          accumulated_realized_balance: number
          expected_inflows: number
          expected_outflows: number
          period_label: string
          period_start: string
          projected_balance: number
          realized_balance: number
          realized_inflows: number
          realized_outflows: number
        }[]
      }
      get_financial_dashboard_summary: {
        Args: {
          p_category_id?: string
          p_cost_center_id?: string
          p_customer_id?: string
          p_end_date: string
          p_start_date: string
        }
        Returns: Json
      }
      get_financial_dre_summary: {
        Args: {
          p_cost_center_id?: string
          p_end_date: string
          p_regime?: string
          p_start_date: string
        }
        Returns: Json
      }
      get_financial_report_data: {
        Args: {
          p_category_id?: string
          p_cost_center_id?: string
          p_customer_id?: string
          p_end_date: string
          p_regime?: string
          p_report_type: string
          p_start_date: string
          p_status?: string
        }
        Returns: Json
      }
      get_my_available_portal_contexts: { Args: never; Returns: Json }
      get_my_entitlements: {
        Args: never
        Returns: {
          config: Json
          feature_key: string
          limit_value: number
          module_key: string
        }[]
      }
      get_partner_catalog_secure: {
        Args: { p_partner_id: string }
        Returns: {
          beneficios_principais: string
          desconto_percentual: number
          descricao_curta: string
          explicacao_b2b: string
          ficha_aprovada: boolean
          ficha_status: string
          item_id: string
          item_tipo: string
          preco_parceiro: number
          preco_tabela: number
          product_id: string
          produto_ativo: boolean
          produto_codigo: string
          produto_nome: string
          resumo_curto: string
          unidade_preco_principal: string
          valor_dose_brl: number
          valor_ha_brl: number
          valor_litro_brl: number
        }[]
      }
      get_partner_catalog_tecnico_secure: {
        Args: never
        Returns: {
          beneficios_principais: string
          codigo: string
          descricao_curta: string
          dose_ml_ha: number
          explicacao_b2b: string
          ficha_aprovada: boolean
          ficha_status: string
          funcao: string
          item_id: string
          item_tipo: string
          nome: string
          nome_cientifico: string
          preco_tabela_dose: number
          preco_tabela_ha: number
          preco_tabela_litro: number
          resumo_curto: string
          tipo: string
          unidade_preco_principal: string
          valor_dose_brl: number
          valor_ha_brl: number
          valor_litro_brl: number
        }[]
      }
      get_partner_papel: { Args: { _user_id: string }; Returns: string }
      get_portal_cliente_b2b_order_detail_secure: {
        Args: { p_order_id: string }
        Returns: Json
      }
      get_portal_cliente_b2b_orders_secure: {
        Args: { p_cliente_id: string }
        Returns: {
          approved_at: string
          area_total_ha: number
          created_at: string
          cultura: string
          estimated_delivery_date: string
          id: string
          numero: string
          origin_simulation_id: string
          partner_id: string
          partner_nome: string
          requested_delivery_date: string
          status: string
          total: number
        }[]
      }
      get_portal_cliente_b2b_simulation_detail_secure: {
        Args: { p_simulation_id: string }
        Returns: Json
      }
      get_portal_cliente_b2b_simulations_secure: {
        Args: { p_cliente_id: string }
        Returns: {
          area_total_ha: number
          converted_order_id: string
          created_at: string
          cultura: string
          id: string
          objetivo_tecnico: string
          partner_id: string
          partner_nome: string
          status: string
          titulo: string
          total_cheio: number
          updated_at: string
        }[]
      }
      get_production_planning_detail: {
        Args: { p_planning_id: string }
        Returns: Json
      }
      get_report_accountability: { Args: { _scope: Json }; Returns: Json }
      get_report_customer_statement: {
        Args: { _customer_id: string; _from: string; _to: string }
        Returns: Json
      }
      get_report_delinquency: {
        Args: { _as_of?: string }
        Returns: {
          amount: number
          balance: number
          customer_email: string
          customer_name: string
          customer_phone: string
          days_overdue: number
          description: string
          due_date: string
          installment_id: string
        }[]
      }
      get_report_deliveries_billing_status: {
        Args: { _from: string; _to: string }
        Returns: {
          billed: boolean
          customer_name: string
          delivery_date: string
          delivery_id: string
          receivable_id: string
          total_value: number
        }[]
      }
      get_report_monthly_financial: {
        Args: {
          _cost_center?: string
          _from: string
          _regime?: string
          _to: string
        }
        Returns: Json
      }
      get_report_nfe_pending: {
        Args: { _filters?: Json }
        Returns: {
          customer_name: string
          description: string
          fiscal_invoice_required: boolean
          fiscal_invoice_status: string
          issue_date: string
          origin_type: string
          receivable_id: string
          total_amount: number
        }[]
      }
      get_report_payables: {
        Args: { _filters?: Json }
        Returns: {
          amount: number
          balance: number
          category: string
          description: string
          due_date: string
          installment_id: string
          paid: number
          payable_id: string
          status: string
          supplier: string
        }[]
      }
      get_report_receivables: {
        Args: { _filters?: Json }
        Returns: {
          amount: number
          balance: number
          category: string
          customer_name: string
          description: string
          due_date: string
          installment_id: string
          paid: number
          receivable_id: string
          status: string
        }[]
      }
      get_top_financial_rankings: {
        Args: { p_end_date: string; p_limit?: number; p_start_date: string }
        Returns: Json
      }
      get_user_partner_id: { Args: never; Returns: string }
      get_visit_organization_id: {
        Args: { p_registro_id: string }
        Returns: string
      }
      h15_active_company: { Args: never; Returns: string }
      h15_actor_organization: { Args: never; Returns: string }
      h15_company_access: { Args: { p_company: string }; Returns: boolean }
      h15_fiscal_audit_access: {
        Args: { p_record: string; p_table: string }
        Returns: boolean
      }
      h15_invoice_access: { Args: { p_invoice: string }; Returns: boolean }
      h15_related_company: {
        Args: { p_id: string; p_table: string }
        Returns: string
      }
      h15_require_company: { Args: { p_company: string }; Returns: undefined }
      h15_require_invoice: { Args: { p_invoice: string }; Returns: undefined }
      h15_require_staff: { Args: never; Returns: undefined }
      h15_service_actor_company_access: {
        Args: { p_actor: string; p_company: string }
        Returns: boolean
      }
      h15_service_actor_event_access: {
        Args: { p_actor: string; p_event: string }
        Returns: boolean
      }
      h15_service_actor_invoice_access: {
        Args: { p_actor: string; p_invoice: string }
        Returns: boolean
      }
      h15_service_actor_run_access: {
        Args: { p_actor: string; p_run: string }
        Returns: boolean
      }
      h15_user_organization: { Args: { p_user: string }; Returns: string }
      has_active_user_cliente_access: {
        Args: { _cliente_id: string; _levels?: string[]; _user_id: string }
        Returns: boolean
      }
      has_completed_visit_presence: {
        Args: { p_registro_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_partner_catalog_access_log_internal: {
        Args: {
          p_action: string
          p_cliente_id?: string
          p_details?: Json
          p_order_id?: string
          p_partner_id: string
          p_simulation_id?: string
          p_target_user_id?: string
          p_user_id: string
        }
        Returns: string
      }
      is_active_visit_participant: {
        Args: { p_registro_id: string; p_user_id: string }
        Returns: boolean
      }
      is_delivery_staff: { Args: { _uid: string }; Returns: boolean }
      is_executivo: { Args: { _uid: string }; Returns: boolean }
      is_financial_staff: { Args: { _uid: string }; Returns: boolean }
      is_operational_staff: { Args: { _uid: string }; Returns: boolean }
      is_platform_superadmin: { Args: { _user_id: string }; Returns: boolean }
      is_technical_visit_editable_status: {
        Args: { p_status: string }
        Returns: boolean
      }
      is_valid_b2b_partner_user: {
        Args: { p_partner_id: string; p_user_id: string }
        Returns: boolean
      }
      is_visit_org_manager: {
        Args: { p_registro_id: string; p_user_id: string }
        Returns: boolean
      }
      is_visit_responsible: {
        Args: { p_registro_id: string; p_user_id: string }
        Returns: boolean
      }
      issue_financial_receipt: {
        Args: { _description?: string; _payment_id: string }
        Returns: Json
      }
      job_monitoramentos_vencidos_v1: { Args: never; Returns: Json }
      job_motor_alertas_operacionais_v1: { Args: never; Returns: Json }
      job_sla_alertas_v1: { Args: never; Returns: Json }
      jsonb_get_array_safe: {
        Args: { p_key: string; p_payload: Json }
        Returns: Json
      }
      jsonb_object_keys_count: { Args: { p: Json }; Returns: number }
      lab_request_replanning: {
        Args: { p_motivo: string; p_os_id: string }
        Returns: Json
      }
      link_partner_user: {
        Args: { p_papel?: string; p_partner_id: string; p_user_id: string }
        Returns: string
      }
      log_my_access_denied_secure: {
        Args: { p_context: string; p_route_group?: string }
        Returns: Json
      }
      log_partner_catalog_access_secure: {
        Args: {
          p_action: string
          p_cliente_id?: string
          p_details?: Json
          p_item_id?: string
          p_item_tipo?: string
          p_order_id?: string
          p_partner_id?: string
          p_simulation_id?: string
          p_target_user_id?: string
        }
        Returns: string
      }
      log_report_export: {
        Args: {
          _error?: string
          _filters: Json
          _format: string
          _report_type: string
          _row_count?: number
          _status?: string
          _storage_bucket: string
          _storage_path: string
        }
        Returns: string
      }
      log_report_view: {
        Args: { p_filters?: Json; p_report_type: string }
        Returns: undefined
      }
      lote_volume_envasado: { Args: { _lote_id: string }; Returns: number }
      mask_sensitive_jsonb: { Args: { v: Json }; Returns: Json }
      normalizar_alvo: { Args: { p_nome: string }; Returns: string }
      org_onboarding_complete: { Args: never; Returns: Json }
      org_onboarding_save: { Args: { _dados: Json }; Returns: undefined }
      org_onboarding_state: { Args: never; Returns: Json }
      org_status_transition_ok: {
        Args: { _de: string; _para: string }
        Returns: boolean
      }
      partner_apply_default_discount: {
        Args: { p_partner_id: string }
        Returns: number
      }
      partner_order_has_production: {
        Args: { _order_id: string }
        Returns: boolean
      }
      partner_order_sla_status: {
        Args: { p_order_id: string }
        Returns: {
          atrasada: boolean
          fase: string
          fase_inicio: string
          horas_decorridas: number
          prazo_horas: number
        }[]
      }
      partner_reset_prices_to_default: {
        Args: { p_partner_id: string }
        Returns: number
      }
      platform_accept_org_admin_email_delivery: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: Json
      }
      platform_change_subscription: {
        Args: {
          _organization_id: string
          _plan_key: string
          _reason: string
          _status: string
        }
        Returns: string
      }
      platform_claim_org_admin_email_delivery:
        | {
            Args: {
              p_actor_id: string
              p_confirm_ambiguous_email_retry?: boolean
              p_cooldown_seconds?: number
              p_job_id: string
            }
            Returns: Json
          }
        | {
            Args: { p_cooldown_seconds?: number; p_job_id: string }
            Returns: Json
          }
      platform_claim_org_admin_provisioning:
        | {
            Args: {
              p_actor_id: string
              p_cpf_cnpj?: string
              p_email: string
              p_modo_acesso?: string
              p_nome: string
              p_organization_id: string
              p_responsavel_principal?: boolean
              p_telefone?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_confirm_ambiguous_email_retry?: boolean
              p_cpf_cnpj?: string
              p_email: string
              p_modo_acesso?: string
              p_nome: string
              p_organization_id: string
              p_responsavel_principal?: boolean
              p_telefone?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_confirm_ambiguous_email_retry?: boolean
              p_cpf_cnpj?: string
              p_delivery_mode?: string
              p_email: string
              p_modo_acesso?: string
              p_nome: string
              p_organization_id: string
              p_responsavel_principal?: boolean
              p_telefone?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cpf_cnpj?: string
              p_email: string
              p_modo_acesso?: string
              p_nome: string
              p_organization_id: string
              p_responsavel_principal?: boolean
              p_telefone?: string
            }
            Returns: Json
          }
      platform_conclude_provisional_password: { Args: never; Returns: boolean }
      platform_conclude_provisional_password_server: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      platform_create_organization: {
        Args: {
          _cnpj: string
          _email: string
          _nome: string
          _nome_fantasia: string
          _plan_key: string
          _rascunho?: boolean
        }
        Returns: string
      }
      platform_end_feature_override: {
        Args: { _override_id: string; _reason: string }
        Returns: undefined
      }
      platform_fail_org_admin_email_delivery: {
        Args: {
          p_error_code: string
          p_job_id: string
          p_lease_token: string
          p_retry_seconds?: number
        }
        Returns: Json
      }
      platform_fail_org_admin_provisioning: {
        Args: { p_error_code: string; p_job_id: string; p_lease_token: string }
        Returns: boolean
      }
      platform_finalize_org_admin_provisioning: {
        Args: { p_job_id: string; p_lease_token: string; p_user_id: string }
        Returns: Json
      }
      platform_find_org_admin_provisioning_auth_user: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: string
      }
      platform_first_access_pending: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      platform_mark_org_admin_email_ambiguous: {
        Args: { p_error_code: string; p_job_id: string; p_lease_token: string }
        Returns: Json
      }
      platform_register_org_admin: {
        Args: {
          p_actor_id: string
          p_cpf_cnpj?: string
          p_email: string
          p_modo_acesso?: string
          p_nome: string
          p_organization_id: string
          p_responsavel_principal?: boolean
          p_telefone?: string
          p_user_id: string
        }
        Returns: undefined
      }
      platform_set_feature_override: {
        Args: {
          _ends_at?: string
          _feature_key: string
          _limit_value?: number
          _mode: string
          _organization_id: string
          _reason: string
        }
        Returns: string
      }
      platform_set_organization_status: {
        Args: { _motivo: string; _org: string; _status: string }
        Returns: undefined
      }
      platform_wipe_global_product_catalog: {
        Args: { p_actor_id: string; p_correlation_id: string; p_reason: string }
        Returns: Json
      }
      pode_acessar_recomendacao: {
        Args: { _recomendacao_id: string; _user_id: string }
        Returns: boolean
      }
      prefixo_para_microrganismo: { Args: { _tipo: string }; Returns: string }
      prefixo_para_produto: { Args: { _tipo: string }; Returns: string }
      proximo_codigo: {
        Args: { _prefixo: string; _tabela: string }
        Returns: string
      }
      publish_planning_to_lab: {
        Args: { p_planning_id: string }
        Returns: Json
      }
      recalc_partner_order_production: {
        Args: { p_partner_order_id: string }
        Returns: undefined
      }
      recalc_partner_risk_score: {
        Args: { p_partner_id: string }
        Returns: {
          calculado_em: string
          created_at: string
          dias_medio_atraso: number
          freq_compras_30d: number
          id: string
          meses_relacionamento: number
          partner_id: string
          pct_credito_utilizado: number
          risk_level: string
          score: number
          titulos_vencidos: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "partner_risk_scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_esteira_laboratorio: { Args: never; Returns: undefined }
      refresh_partner_engagement: {
        Args: { p_partner_id: string }
        Returns: undefined
      }
      register_financial_report_export: {
        Args: {
          p_error_message?: string
          p_file_format: string
          p_filters: Json
          p_report_title: string
          p_report_type: string
          p_status?: string
          p_storage_path?: string
        }
        Returns: string
      }
      register_my_login_redirect_secure: {
        Args: { p_context: string }
        Returns: Json
      }
      reject_b2b_payment_terms_secure: {
        Args: { p_partner_order_id: string; p_reason: string }
        Returns: Json
      }
      reject_partner_order: {
        Args: { p_approval_notes: string; p_order_id: string }
        Returns: undefined
      }
      rejeitar_ficha_versao: {
        Args: { p_observacao?: string; p_versao_id: string }
        Returns: undefined
      }
      request_b2b_payment_terms_adjustment_secure: {
        Args: { p_notes: string; p_partner_order_id: string }
        Returns: Json
      }
      request_partner_order_items: {
        Args: { p_motivo: string; p_order_id: string }
        Returns: undefined
      }
      reservar_estoque_item: {
        Args: {
          p_cliente_id?: string
          p_item_id: string
          p_observacao?: string
          p_os_id: string
          p_os_tipo: string
          p_partner_id?: string
          p_partner_order_id?: string
          p_qty: number
        }
        Returns: string
      }
      respond_b2b_order_quote_secure: {
        Args: {
          p_first_due_date?: string
          p_installment_count?: number
          p_lines: Json
          p_motivo?: string
          p_order_id: string
        }
        Returns: Json
      }
      return_catalog_profile_to_review: {
        Args: { p_kind: string; p_motivo: string; p_profile_id: string }
        Returns: undefined
      }
      rpc_activate_communication_template: {
        Args: { p_template_id: string }
        Returns: Json
      }
      rpc_admin_communication_health_snapshot: { Args: never; Returns: Json }
      rpc_admin_communication_outbox_metrics: { Args: never; Returns: Json }
      rpc_admin_create_commercial_plan: {
        Args: { p_payload: Json }
        Returns: string
      }
      rpc_admin_list_commercial_plans: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          active: boolean
          code: string
          description: string
          discount_percent: number
          id: string
          installment_count: number
          interest_type: string
          is_default: boolean
          is_referenced: boolean
          max_days: number
          minimum_order_amount: number
          monthly_interest_percent: number
          months_count: number
          name: string
          plan_type: string
          pricing_mode: string
          requires_credit_approval: boolean
          requires_financial_approval: boolean
          requires_guarantee: boolean
          root_plan_id: string
          selectable: boolean
          sort_order: number
          superseded_by_id: string
          total_count: number
          valid_from: string
          valid_until: string
          version: number
        }[]
      }
      rpc_admin_list_communication_dead_letter: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          attempts: number
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          created_at: string
          error_code: string
          error_message: string
          id: string
          max_attempts: number
          recipient_cliente_id: string
          recipient_user_id: string
          template_chave: string
          template_versao: number
          updated_at: string
        }[]
      }
      rpc_admin_reorder_commercial_plans: {
        Args: { p_orders: Json }
        Returns: undefined
      }
      rpc_admin_replay_communication_dead_letter: {
        Args: { p_outbox_id: string }
        Returns: Json
      }
      rpc_admin_replay_communication_dead_letter_batch: {
        Args: { p_limit?: number }
        Returns: Json
      }
      rpc_admin_set_commercial_plan_active: {
        Args: { p_active: boolean; p_motivo?: string; p_plan_id: string }
        Returns: undefined
      }
      rpc_admin_set_default_commercial_plan: {
        Args: { p_plan_id: string }
        Returns: undefined
      }
      rpc_admin_set_whatsapp_consent: {
        Args: {
          p_acao: string
          p_cliente_id: string
          p_justificativa?: string
          p_source: string
          p_user_id: string
        }
        Returns: Json
      }
      rpc_admin_update_commercial_plan_metadata: {
        Args: {
          p_description?: string
          p_name?: string
          p_plan_id: string
          p_sort_order?: number
        }
        Returns: undefined
      }
      rpc_admin_version_commercial_plan: {
        Args: { p_motivo?: string; p_payload: Json; p_plan_id: string }
        Returns: string
      }
      rpc_anexar_comprovante_entrega: {
        Args: { p_entrega_id: string; p_payload: Json }
        Returns: Json
      }
      rpc_aplicar_sla_alertas: { Args: never; Returns: Json }
      rpc_archive_communication_template: {
        Args: { p_template_id: string }
        Returns: Json
      }
      rpc_arquivar_visita: {
        Args: {
          p_expected_version: number
          p_motivo: string
          p_registro_id: string
        }
        Returns: Json
      }
      rpc_assign_visit_technician: {
        Args: { p_registro_id: string; p_role?: string; p_user_id: string }
        Returns: Json
      }
      rpc_associate_microorganism_fiscal_product: {
        Args: { p_microorganism_id: string; p_product_id?: string }
        Returns: {
          id: string
          product_id: string
        }[]
      }
      rpc_assumir_alerta: { Args: { p_alerta_id: string }; Returns: Json }
      rpc_ativar_monitoramento_visita: {
        Args: {
          p_data_referencia: string
          p_expected_version: number
          p_registro_id: string
          p_tipo: string
        }
        Returns: Json
      }
      rpc_atualizar_checklist_entrega: {
        Args: {
          p_checklist_id: string
          p_concluido: boolean
          p_observacao?: string
        }
        Returns: Json
      }
      rpc_atualizar_identificacao_visita: {
        Args: {
          p_expected_version: number
          p_payload: Json
          p_registro_id: string
        }
        Returns: Json
      }
      rpc_atualizar_status_alerta_agronomico_v1: {
        Args: {
          p_alerta_id: string
          p_novo_status: Database["public"]["Enums"]["status_alerta"]
          p_updated_at_esperado: string
        }
        Returns: {
          created_at: string
          data_alerta: string
          data_vencimento: string | null
          descricao: string | null
          fazenda_id: string
          id: string
          nivel_risco: Database["public"]["Enums"]["nivel_risco"]
          registro_origem_id: string | null
          status: Database["public"]["Enums"]["status_alerta"]
          talhao_id: string | null
          tipo_alerta: Database["public"]["Enums"]["tipo_alerta"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "alertas_agronomicos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_avancar_esteira_laboratorio: {
        Args: {
          p_etapa_destino: string
          p_origem: string
          p_os_id: string
          p_programacao_id?: string
        }
        Returns: Json
      }
      rpc_b2b_aging: {
        Args: { p_partner_id?: string }
        Returns: {
          faixa: string
          parceiros: number
          qtd_titulos: number
          valor: number
        }[]
      }
      rpc_b2b_aging_detalhado: {
        Args: {
          p_from?: string
          p_partner_id?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          faixa: string
          pct_carteira: number
          qtd_parceiros: number
          qtd_titulos: number
          valor: number
          valor_medio_parceiro: number
        }[]
      }
      rpc_b2b_capacity_kpis: { Args: never; Returns: Json }
      rpc_b2b_carteira_kpis: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      rpc_b2b_check_governance_block: {
        Args: { p_acao: string; p_partner_id: string }
        Returns: Json
      }
      rpc_b2b_credit_exposure: {
        Args: {
          p_exclude_order_id?: string
          p_new_order_amount?: number
          p_partner_id: string
        }
        Returns: Json
      }
      rpc_b2b_executive_alerts: { Args: never; Returns: Json }
      rpc_b2b_executive_dashboard: { Args: never; Returns: Json }
      rpc_b2b_financial_kpis: {
        Args: { p_from?: string; p_partner_id?: string; p_to?: string }
        Returns: Json
      }
      rpc_b2b_governance_kpis: { Args: never; Returns: Json }
      rpc_b2b_integrity_check: { Args: never; Returns: Json }
      rpc_b2b_list_selectable_payment_plans: {
        Args: never
        Returns: {
          code: string
          description: string
          discount_percent: number
          id: string
          installment_count: number
          interest_type: string
          is_default: boolean
          max_days: number
          minimum_order_amount: number
          monthly_interest_percent: number
          months_count: number
          name: string
          plan_type: string
          pricing_mode: string
          requires_credit_approval: boolean
          requires_financial_approval: boolean
          requires_guarantee: boolean
          sort_order: number
        }[]
      }
      rpc_b2b_partner_credit: { Args: { p_partner_id: string }; Returns: Json }
      rpc_b2b_partner_profitability: {
        Args: { p_from?: string; p_partner_id?: string; p_to?: string }
        Returns: {
          inadimplencia_pct: number
          partner_id: string
          partner_name: string
          prazo_medio_pgto: number
          qtd_pedidos: number
          risk_level: string
          risk_score: number
          ticket_medio: number
          total_aberto: number
          total_comprado: number
          total_recebido: number
        }[]
      }
      rpc_b2b_revenue_forecast: {
        Args: { p_partner_id?: string }
        Returns: Json
      }
      rpc_bi_esteira_resumo: {
        Args: {
          p_cliente_id?: string
          p_data_fim?: string
          p_data_inicio?: string
          p_fazenda_id?: string
          p_microrganismo_id?: string
          p_origem_os?: string
          p_produto_id?: string
          p_status?: string
        }
        Returns: Json
      }
      rpc_bi_fluxo_visitas_resumo: {
        Args: {
          p_cliente_id?: string
          p_consultor_id?: string
          p_data_fim?: string
          p_data_inicio?: string
          p_fazenda_id?: string
          p_status_solicitacao?: string
          p_status_visita?: string
        }
        Returns: Json
      }
      rpc_bi_visitas_por_cliente: {
        Args: {
          p_cliente_id: string
          p_data_fim?: string
          p_data_inicio?: string
        }
        Returns: {
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_visita: string | null
          consultor_id: string | null
          consultor_nome: string | null
          created_at: string | null
          cultura_id: string | null
          cultura_nome: string | null
          data_checkin: string | null
          data_conversao_os: string | null
          data_finalizacao: string | null
          data_liberacao_recomendacao: string | null
          data_prevista_atendimento: string | null
          data_vistoria: string | null
          dias_em_aberto: number | null
          fazenda_id: string | null
          fazenda_nome: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          numero_solicitacao: string | null
          origem_fluxo: string | null
          os_id: string | null
          possui_checkin: boolean | null
          possui_diagnostico: boolean | null
          possui_evidencias: boolean | null
          possui_os: boolean | null
          possui_recomendacao: boolean | null
          proxima_acao: string | null
          quantidade_diagnosticos: number | null
          quantidade_evidencias: number | null
          quantidade_recomendacoes: number | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          status_aprovacao: string | null
          status_os: string | null
          status_solicitacao: string | null
          status_visita: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_aprovacao_ate_os: number | null
          tempo_checkin_ate_finalizacao: number | null
          tempo_finalizacao_ate_aprovacao: number | null
          tempo_solicitacao_ate_checkin: number | null
          tipo_demanda: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "_src_vw_fluxo_visita_tecnica"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_bi_visitas_por_consultor: {
        Args: {
          p_consultor_id: string
          p_data_fim?: string
          p_data_inicio?: string
        }
        Returns: {
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_visita: string | null
          consultor_id: string | null
          consultor_nome: string | null
          created_at: string | null
          cultura_id: string | null
          cultura_nome: string | null
          data_checkin: string | null
          data_conversao_os: string | null
          data_finalizacao: string | null
          data_liberacao_recomendacao: string | null
          data_prevista_atendimento: string | null
          data_vistoria: string | null
          dias_em_aberto: number | null
          fazenda_id: string | null
          fazenda_nome: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          numero_solicitacao: string | null
          origem_fluxo: string | null
          os_id: string | null
          possui_checkin: boolean | null
          possui_diagnostico: boolean | null
          possui_evidencias: boolean | null
          possui_os: boolean | null
          possui_recomendacao: boolean | null
          proxima_acao: string | null
          quantidade_diagnosticos: number | null
          quantidade_evidencias: number | null
          quantidade_recomendacoes: number | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          status_aprovacao: string | null
          status_os: string | null
          status_solicitacao: string | null
          status_visita: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_aprovacao_ate_os: number | null
          tempo_checkin_ate_finalizacao: number | null
          tempo_finalizacao_ate_aprovacao: number | null
          tempo_solicitacao_ate_checkin: number | null
          tipo_demanda: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "_src_vw_fluxo_visita_tecnica"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_bi_visitas_por_fazenda: {
        Args: {
          p_data_fim?: string
          p_data_inicio?: string
          p_fazenda_id: string
        }
        Returns: {
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_visita: string | null
          consultor_id: string | null
          consultor_nome: string | null
          created_at: string | null
          cultura_id: string | null
          cultura_nome: string | null
          data_checkin: string | null
          data_conversao_os: string | null
          data_finalizacao: string | null
          data_liberacao_recomendacao: string | null
          data_prevista_atendimento: string | null
          data_vistoria: string | null
          dias_em_aberto: number | null
          fazenda_id: string | null
          fazenda_nome: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          numero_solicitacao: string | null
          origem_fluxo: string | null
          os_id: string | null
          possui_checkin: boolean | null
          possui_diagnostico: boolean | null
          possui_evidencias: boolean | null
          possui_os: boolean | null
          possui_recomendacao: boolean | null
          proxima_acao: string | null
          quantidade_diagnosticos: number | null
          quantidade_evidencias: number | null
          quantidade_recomendacoes: number | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          status_aprovacao: string | null
          status_os: string | null
          status_solicitacao: string | null
          status_visita: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_aprovacao_ate_os: number | null
          tempo_checkin_ate_finalizacao: number | null
          tempo_finalizacao_ate_aprovacao: number | null
          tempo_solicitacao_ate_checkin: number | null
          tipo_demanda: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "_src_vw_fluxo_visita_tecnica"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_bi_visitas_por_talhao: {
        Args: {
          p_data_fim?: string
          p_data_inicio?: string
          p_talhao_id: string
        }
        Returns: {
          bloqueios: string[] | null
          cliente_id: string | null
          cliente_nome: string | null
          codigo_visita: string | null
          consultor_id: string | null
          consultor_nome: string | null
          created_at: string | null
          cultura_id: string | null
          cultura_nome: string | null
          data_checkin: string | null
          data_conversao_os: string | null
          data_finalizacao: string | null
          data_liberacao_recomendacao: string | null
          data_prevista_atendimento: string | null
          data_vistoria: string | null
          dias_em_aberto: number | null
          fazenda_id: string | null
          fazenda_nome: string | null
          microrganismo_id: string | null
          microrganismo_nome: string | null
          numero_os: string | null
          numero_solicitacao: string | null
          origem_fluxo: string | null
          os_id: string | null
          possui_checkin: boolean | null
          possui_diagnostico: boolean | null
          possui_evidencias: boolean | null
          possui_os: boolean | null
          possui_recomendacao: boolean | null
          proxima_acao: string | null
          quantidade_diagnosticos: number | null
          quantidade_evidencias: number | null
          quantidade_recomendacoes: number | null
          registro_consultor_id: string | null
          solicitacao_id: string | null
          status_aprovacao: string | null
          status_os: string | null
          status_solicitacao: string | null
          status_visita: string | null
          talhao_id: string | null
          talhao_nome: string | null
          tempo_aprovacao_ate_os: number | null
          tempo_checkin_ate_finalizacao: number | null
          tempo_finalizacao_ate_aprovacao: number | null
          tempo_solicitacao_ate_checkin: number | null
          tipo_demanda: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "_src_vw_fluxo_visita_tecnica"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_campaign_delete: { Args: { p_id: string }; Returns: undefined }
      rpc_campaign_upsert: {
        Args: { p_id?: string; p_payload: Json }
        Returns: string
      }
      rpc_cancel_accounts_payable: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_cancel_accounts_receivable: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_cancel_communication_delivery: {
        Args: { p_outbox_id: string; p_reason: string; p_worker_id: string }
        Returns: Json
      }
      rpc_cancel_financial_installment: {
        Args: { p_installment_id: string; p_kind: string; p_reason: string }
        Returns: undefined
      }
      rpc_cancelar_embalagem: {
        Args: { p_embalagem_id: string; p_motivo: string }
        Returns: Json
      }
      rpc_cancelar_etiqueta_produto: {
        Args: { p_etiqueta_id: string; p_motivo: string }
        Returns: Json
      }
      rpc_cc_archive_assignment: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      rpc_cc_bulk_adjust_apply: {
        Args: { p_ids: string[]; p_motivo: string; p_percent: number }
        Returns: Json
      }
      rpc_cc_bulk_adjust_preview: {
        Args: { p_ids: string[]; p_percent: number }
        Returns: Json
      }
      rpc_cc_copy_default_table: {
        Args: {
          p_customer_id: string
          p_motivo?: string
          p_partner_id: string
          p_plan_id: string
          p_target_scope: string
        }
        Returns: Json
      }
      rpc_cc_delete_item_price: {
        Args: { p_id: string; p_motivo?: string }
        Returns: undefined
      }
      rpc_cc_history: {
        Args: { p_entity?: string; p_entity_id?: string; p_limit?: number }
        Returns: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          motivo: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "commercial_condition_audit_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_cc_list_assignments: {
        Args: { p_status?: string }
        Returns: {
          archived_at: string | null
          archived_by: string | null
          buyer_scope: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          motivo: string | null
          partner_id: string | null
          plan_id: string
          published_at: string | null
          published_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "commercial_payment_plan_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_cc_list_item_prices: {
        Args: {
          p_assignment_id?: string
          p_plan_id?: string
          p_status?: string
        }
        Returns: {
          assignment_id: string | null
          buyer_scope: string
          condition_price: number | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          discount_percent: number | null
          id: string
          is_exception: boolean
          microrganismo_id: string | null
          min_quantity: number
          motivo: string | null
          partner_id: string | null
          plan_id: string
          pricing_mode: string
          product_id: string | null
          published_at: string | null
          published_by: string | null
          published_rule_id: string | null
          status: string
          unit_type: string
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string | null
          volume_ml: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "commercial_condition_item_prices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_cc_publish_assignment: {
        Args: { p_id: string; p_motivo?: string }
        Returns: undefined
      }
      rpc_cc_publish_item_prices: {
        Args: { p_ids: string[]; p_motivo?: string }
        Returns: Json
      }
      rpc_cc_simulate_price: {
        Args: {
          p_buyer_scope: string
          p_customer_id: string
          p_microrganismo_id: string
          p_partner_id: string
          p_plan_id: string
          p_product_id: string
          p_quantity?: number
          p_ref_date?: string
          p_unit_type: string
          p_volume_ml?: number
        }
        Returns: Json
      }
      rpc_cc_submit_assignment: {
        Args: { p_id: string; p_motivo?: string }
        Returns: undefined
      }
      rpc_cc_upsert_assignment: {
        Args: {
          p_buyer_scope: string
          p_customer_id: string
          p_id: string
          p_motivo: string
          p_partner_id: string
          p_plan_id: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: string
      }
      rpc_cc_upsert_item_price: {
        Args: {
          p_assignment_id: string
          p_buyer_scope: string
          p_condition_price: number
          p_customer_id: string
          p_discount_percent: number
          p_id: string
          p_is_exception: boolean
          p_microrganismo_id: string
          p_min_quantity: number
          p_motivo: string
          p_partner_id: string
          p_plan_id: string
          p_pricing_mode: string
          p_product_id: string
          p_unit_type: string
          p_valid_from: string
          p_valid_until: string
          p_volume_ml: number
        }
        Returns: string
      }
      rpc_cc_validate_matrix: {
        Args: {
          p_buyer_scope: string
          p_customer_id?: string
          p_partner_id?: string
          p_plan_id: string
        }
        Returns: Json
      }
      rpc_certificacao_catalogo: {
        Args: { p_functions?: string[]; p_tables?: string[] }
        Returns: Json
      }
      rpc_check_monitoramento_and_notify: {
        Args: { _registro_id: string }
        Returns: Json
      }
      rpc_claim_communication_outbox: {
        Args: {
          p_batch_size: number
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempts: number
          canal: Database["public"]["Enums"]["comunicacao_canal"]
          created_at: string
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          event_id: string
          id: string
          idempotency_key: string
          lease_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          payload_snapshot: Json
          provider_delivery_status: string | null
          provider_failed_at: string | null
          provider_message_id: string | null
          provider_status_at: string | null
          read_at: string | null
          recipient_cliente_id: string | null
          recipient_hash: string | null
          recipient_user_id: string | null
          rule_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["comunicacao_outbox_status"]
          template_chave: string
          template_id: string | null
          template_snapshot: Json
          template_versao: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "comunicacao_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_cockpit_cancelar_reserva_v1: {
        Args: {
          p_item_id: string
          p_motivo?: string
          p_origem: string
          p_os_id: string
        }
        Returns: Json
      }
      rpc_cockpit_confirmar_entrega_v1: {
        Args: {
          p_entrega_id: string
          p_origem: string
          p_os_id: string
          p_recebedor?: Json
        }
        Returns: Json
      }
      rpc_cockpit_criar_entrega_v1: {
        Args: {
          p_dados?: Json
          p_estoque_produto_id: string
          p_origem: string
          p_os_id: string
          p_quantidade: number
        }
        Returns: Json
      }
      rpc_cockpit_gerar_lote_v1: {
        Args: {
          p_lote: Json
          p_origem: string
          p_os_id: string
          p_programacao_id: string
        }
        Returns: Json
      }
      rpc_cockpit_listar_esteira_v1: {
        Args: {
          p_ate?: string
          p_atrasado?: boolean
          p_busca?: string
          p_de?: string
          p_incluir_finalizadas?: boolean
          p_limit?: number
          p_offset?: number
          p_origens?: string[]
          p_prioridades?: string[]
          p_stages?: string[]
        }
        Returns: Json
      }
      rpc_cockpit_metricas_v1: { Args: never; Returns: Json }
      rpc_cockpit_metricas_v2: {
        Args: {
          p_ate?: string
          p_atrasado?: boolean
          p_busca?: string
          p_de?: string
          p_origens?: string[]
          p_prioridades?: string[]
          p_stages?: string[]
        }
        Returns: Json
      }
      rpc_cockpit_registrar_envase_v1: {
        Args: {
          p_idempotency_key?: string
          p_linhas: Json
          p_lote_id: string
          p_motivo_parcial?: string
          p_operador?: string
          p_origem: string
          p_os_id: string
          p_permitir_parcial?: boolean
          p_programacao_id: string
          p_validade: string
        }
        Returns: Json
      }
      rpc_coletar_assinatura_digital_entrega: {
        Args: { p_entrega_id: string; p_payload: Json }
        Returns: Json
      }
      rpc_commercial_alerts: { Args: never; Returns: Json }
      rpc_commercial_consolidated_dashboard: {
        Args: {
          p_consultor?: string
          p_from?: string
          p_partner_id?: string
          p_partner_type?: string
          p_region?: string
          p_to?: string
        }
        Returns: Json
      }
      rpc_commercial_kpis: {
        Args: {
          p_consultor?: string
          p_from?: string
          p_partner_id?: string
          p_region?: string
          p_to?: string
        }
        Returns: Json
      }
      rpc_commercial_simulator: {
        Args: {
          p_desconto: number
          p_partner_id: string
          p_product_id: string
          p_quantidade: number
        }
        Returns: Json
      }
      rpc_complete_communication_delivery: {
        Args: {
          p_outbox_id: string
          p_provider_message_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      rpc_confirmar_entrega_embalagens: {
        Args: { p_entrega_id: string }
        Returns: Json
      }
      rpc_confirmar_recebimento_entrega: {
        Args: { p_entrega_id: string; p_payload?: Json }
        Returns: Json
      }
      rpc_confirmar_separacao_embalagem: {
        Args: { p_embalagem_id: string }
        Returns: Json
      }
      rpc_converter_visita_em_os: {
        Args: { p_observacao?: string; p_registro_id: string }
        Returns: Json
      }
      rpc_create_communication_template: {
        Args: {
          p_assunto: string
          p_canal: Database["public"]["Enums"]["comunicacao_canal"]
          p_chave: string
          p_corpo: string
          p_nome: string
          p_variaveis?: Json
        }
        Returns: Json
      }
      rpc_create_financial_title: {
        Args: { p_kind: string; p_payload: Json }
        Returns: Json
      }
      rpc_create_notificacao_operacional: {
        Args: {
          _idempotency_key?: string
          _link?: string
          _mensagem?: string
          _source_id?: string
          _source_type?: string
          _tipo: string
          _titulo: string
          _usuario_id: string
        }
        Returns: Json
      }
      rpc_create_operational_notification_secure: {
        Args: {
          p_link: string
          p_mensagem: string
          p_tipo: string
          p_titulo: string
          p_usuario_id: string
        }
        Returns: Json
      }
      rpc_create_portal_notification_secure:
        | {
            Args: {
              _cliente_id: string
              _idempotency_key?: string
              _link?: string
              _mensagem: string
              _source_id?: string
              _source_type?: string
              _tipo: string
              _titulo: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cliente_id: string
              p_mensagem: string
              p_tipo: string
              p_titulo: string
            }
            Returns: Json
          }
      rpc_criar_alerta_climatico_v1: {
        Args: {
          p_descricao: string
          p_fazenda_id: string
          p_nivel_risco: Database["public"]["Enums"]["nivel_risco"]
          p_talhao_id: string
          p_tipo_alerta: Database["public"]["Enums"]["tipo_alerta"]
        }
        Returns: {
          criado: boolean
          id: string
        }[]
      }
      rpc_criar_embalagens_pos_envase: {
        Args: { p_payload: Json }
        Returns: Json
      }
      rpc_criar_visita_idempotente: {
        Args: {
          p_area_hectares?: number
          p_categoria_problema?: Database["public"]["Enums"]["categoria_problema_consultor"]
          p_client_uuid: string
          p_cliente_id: string
          p_cultura_id?: string
          p_data_vistoria?: string
          p_fase_fenologica?: string
          p_fazenda_id: string
          p_latitude?: number
          p_localizacao_na_area?: string
          p_longitude?: number
          p_nivel_pressao?: Database["public"]["Enums"]["nivel_pressao"]
          p_objetivo_visita?: string
          p_observacoes_tecnicas?: string
          p_origem?: string
          p_percentual_area_afetada?: number
          p_problema_principal?: string
          p_registro_origem_id?: string
          p_safra?: string
          p_solicitacao_id?: string
          p_talhao_id: string
          p_tipo_visita?: Database["public"]["Enums"]["tipo_visita"]
          p_urgencia?: Database["public"]["Enums"]["urgencia_consultor"]
        }
        Returns: Json
      }
      rpc_dashboard_geral_lab_resumo: { Args: never; Returns: Json }
      rpc_defer_communication_delivery: {
        Args: {
          p_delay_seconds?: number
          p_outbox_id: string
          p_reason: string
          p_worker_id: string
        }
        Returns: Json
      }
      rpc_delete_diagnostico_visita: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_delete_recomendacao_visita: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_desativar_bank_account: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      rpc_desativar_cost_center: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      rpc_desativar_financial_category: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      rpc_desativar_payment_method: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      rpc_descartar_embalagem: {
        Args: { p_embalagem_id: string; p_motivo: string }
        Returns: Json
      }
      rpc_desvincular_etiqueta_entrega: {
        Args: { p_entrega_id: string; p_etiqueta_id: string; p_motivo: string }
        Returns: Json
      }
      rpc_dispatch_inapp_notification: {
        Args: {
          p_cliente_id: string
          p_mensagem: string
          p_outbox_id: string
          p_titulo: string
          p_user_id: string
        }
        Returns: Json
      }
      rpc_dispensar_assinatura_entrega: {
        Args: { p_entrega_id: string; p_motivo: string }
        Returns: Json
      }
      rpc_entrega_assinar_termo_v1: {
        Args: { p_idempotency_key: string; p_payload: Json; p_termo_id: string }
        Returns: Json
      }
      rpc_entrega_cancelar_termo_v1: {
        Args: { p_motivo: string; p_termo_id: string }
        Returns: Json
      }
      rpc_entrega_cancelar_v1: {
        Args: { p_entrega_id: string; p_motivo: string }
        Returns: Json
      }
      rpc_entrega_confirmar_v1: {
        Args: { p_entrega_id: string; p_opcoes?: Json; p_recebedor: Json }
        Returns: Json
      }
      rpc_entrega_gerar_termo_v1: {
        Args: { p_entrega_id: string; p_template_versao?: string }
        Returns: Json
      }
      rpc_entrega_reconciliar_v1: {
        Args: { p_entrega_id: string; p_idempotency_key: string }
        Returns: Json
      }
      rpc_entrega_reentrega_saldo_v1: {
        Args: { p_entrega_id: string; p_idempotency_key: string }
        Returns: Json
      }
      rpc_entrega_registrar_conferencia_v1: {
        Args: { p_entrega_id: string; p_itens: Json }
        Returns: Json
      }
      rpc_entrega_registrar_pdf_termo_v1: {
        Args: { p_pdf_hash: string; p_pdf_path: string; p_termo_id: string }
        Returns: Json
      }
      rpc_enviar_visita_aprovacao: {
        Args: { p_expected_version: number; p_registro_id: string }
        Returns: Json
      }
      rpc_estoque_operar_v1: {
        Args: {
          p_acao: string
          p_idempotency_key?: string
          p_item_id: string
          p_payload?: Json
          p_quantidade?: number
        }
        Returns: Json
      }
      rpc_estoque_reservar_v1: {
        Args: {
          p_dados?: Json
          p_idempotency_key: string
          p_itens: Json
          p_origem: string
          p_os_id: string
        }
        Returns: Json
      }
      rpc_executar_motor_alertas: {
        Args: { p_origem?: string; p_tipo_execucao?: string }
        Returns: Json
      }
      rpc_executivo_alertas_prioridades: {
        Args: { p_filtros?: Json; p_limit?: number }
        Returns: Json
      }
      rpc_executivo_alertas_resumo: {
        Args: { p_filtros?: Json }
        Returns: Json
      }
      rpc_executivo_arquivar_relatorio: {
        Args: { p_motivo?: string; p_relatorio_id: string }
        Returns: {
          alertas: Json
          ativo: boolean
          atualizado_em: string
          filtros: Json
          gargalos: Json
          gerado_em: string
          gerado_por: string | null
          hash_conteudo: string | null
          id: string
          indicadores: Json
          metadata: Json
          observacoes: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          plano_acao: Json
          ranking_clientes: Json
          ranking_fazendas: Json
          resumo: Json
          status: string
          tipo: string
          titulo: string
          versao: number
        }
        SetofOptions: {
          from: "*"
          to: "executivo_relatorios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_executivo_cliente_detalhe: {
        Args: { p_cliente_id: string; p_filtros?: Json }
        Returns: Json
      }
      rpc_executivo_clientes_ranking: {
        Args: { p_filtros?: Json; p_limit?: number }
        Returns: Json
      }
      rpc_executivo_clientes_resumo: {
        Args: { p_filtros?: Json }
        Returns: Json
      }
      rpc_executivo_exportar_relatorio_evento: {
        Args: { p_relatorio_id: string; p_tipo_exportacao: string }
        Returns: {
          created_at: string
          descricao: string | null
          evento: string
          id: string
          metadata: Json
          relatorio_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "executivo_relatorio_eventos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_executivo_fazenda_detalhe: {
        Args: { p_fazenda_id: string; p_filtros?: Json }
        Returns: Json
      }
      rpc_executivo_financeiro_gargalos: {
        Args: { p_filtros?: Json; p_limit?: number }
        Returns: Json
      }
      rpc_executivo_financeiro_ranking_clientes: {
        Args: { p_filtros?: Json; p_limit?: number }
        Returns: Json
      }
      rpc_executivo_financeiro_resumo: {
        Args: { p_filtros?: Json }
        Returns: Json
      }
      rpc_executivo_gargalos: {
        Args: { p_filtros?: Json; p_limit?: number }
        Returns: Json
      }
      rpc_executivo_gerar_relatorio: {
        Args: { p_filtros?: Json; p_tipo: string; p_titulo?: string }
        Returns: {
          alertas: Json
          ativo: boolean
          atualizado_em: string
          filtros: Json
          gargalos: Json
          gerado_em: string
          gerado_por: string | null
          hash_conteudo: string | null
          id: string
          indicadores: Json
          metadata: Json
          observacoes: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          plano_acao: Json
          ranking_clientes: Json
          ranking_fazendas: Json
          resumo: Json
          status: string
          tipo: string
          titulo: string
          versao: number
        }
        SetofOptions: {
          from: "*"
          to: "executivo_relatorios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_executivo_listar_relatorios: {
        Args: { p_filtros?: Json }
        Returns: {
          ativo: boolean
          gerado_em: string
          gerado_por: string
          gerado_por_nome: string
          id: string
          observacoes: string
          periodo_fim: string
          periodo_inicio: string
          status: string
          tipo: string
          titulo: string
          versao: number
        }[]
      }
      rpc_executivo_obter_relatorio: {
        Args: { p_relatorio_id: string }
        Returns: Json
      }
      rpc_executivo_plano_acao: {
        Args: { p_filtros?: Json; p_limit?: number }
        Returns: Json
      }
      rpc_executivo_responsaveis_pendencias: {
        Args: { p_filtros?: Json; p_limit?: number }
        Returns: Json
      }
      rpc_executivo_resumo_geral: { Args: { p_filtros?: Json }; Returns: Json }
      rpc_executivo_timeline_operacional: {
        Args: { p_filtros?: Json; p_limit?: number }
        Returns: Json
      }
      rpc_fail_communication_delivery: {
        Args: {
          p_error_code: string
          p_error_message: string
          p_outbox_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      rpc_fail_communication_delivery_v2: {
        Args: {
          p_error_code: string
          p_error_message: string
          p_is_permanent: boolean
          p_outbox_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      rpc_finalizar_visita_v2: {
        Args: { p_expected_version: number; p_registro_id: string }
        Returns: Json
      }
      rpc_financial_document_soft_delete: {
        Args: { p_document_id: string; p_reason: string }
        Returns: string
      }
      rpc_fiscal_calculate_invoice_v1: {
        Args: { p_idempotency_key: string; p_invoice_id: string }
        Returns: Json
      }
      rpc_fiscal_calculate_service_invoice_v1: {
        Args: {
          p_idempotency_key: string
          p_invoice_id: string
          p_persist?: boolean
        }
        Returns: Json
      }
      rpc_fiscal_catalog_import_v1: {
        Args: {
          p_catalog_type: string
          p_checksum?: string
          p_effective_from?: string
          p_entries: Json
          p_metadata?: Json
          p_published_at?: string
          p_source_name: string
          p_source_reference?: string
          p_source_version: string
        }
        Returns: string
      }
      rpc_fiscal_catalog_publish_v1: {
        Args: { p_catalog_id: string }
        Returns: undefined
      }
      rpc_fiscal_catalog_resolve_v1: {
        Args: { p_catalog_type: string; p_codes: string[] }
        Returns: {
          code: string
          description: string
          is_active: boolean
          metadata: Json
          parent_code: string
        }[]
      }
      rpc_fiscal_catalog_search_v1: {
        Args: {
          p_catalog_type: string
          p_limit?: number
          p_parent_code?: string
          p_preferred_codes?: string[]
          p_query?: string
        }
        Returns: {
          catalog_version: string
          code: string
          description: string
          is_preferred: boolean
          metadata: Json
          parent_code: string
        }[]
      }
      rpc_fiscal_certificate_for_invoice_v1: {
        Args: { _invoice_id: string }
        Returns: Json
      }
      rpc_fiscal_certificate_register_a1: {
        Args: {
          p_company_settings_id: string
          p_created_by: string
          p_display_name: string
          p_fingerprint_sha256: string
          p_issuer_name: string
          p_key_usage: string[]
          p_key_version: number
          p_material_algorithm?: string
          p_material_format?: string
          p_material_iv_b64: string
          p_object_path: string
          p_serial_number: string
          p_subject_name: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: string
      }
      rpc_fiscal_certificate_register_os: {
        Args: { p_company_settings_id: string; p_metadata: Json }
        Returns: string
      }
      rpc_fiscal_certificate_revoke: {
        Args: { p_certificate_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_fiscal_company_rtc_get: { Args: never; Returns: Json }
      rpc_fiscal_company_rtc_save: {
        Args: { expected_revision?: string; payload: Json }
        Returns: Json
      }
      rpc_fiscal_company_settings_init: {
        Args: never
        Returns: {
          accounting_validated_at: string | null
          accounting_validated_by: string | null
          additional_cnaes: string[] | null
          certificate_ref: string | null
          city: string | null
          cnpj: string | null
          complement: string | null
          configuration_notes: string | null
          configuration_status: string
          configuration_version: number
          country_code: string | null
          created_at: string
          created_by: string | null
          crt: string | null
          difal_responsible: boolean
          fcp_applicable: boolean
          fiscal_email: string | null
          fiscal_environment: string
          fiscal_provider: string
          icms_st_responsible: boolean
          id: string
          ipi_taxpayer: boolean
          is_active: boolean
          last_validation_at: string | null
          last_validation_status: string
          last_validation_summary: Json
          legal_name: string | null
          municipal_registration: string | null
          municipality_ibge_code: string | null
          neighborhood: string | null
          nfe_configuration: Json
          nfe_credential_ref: string | null
          nfe_enabled: boolean
          nfe_environment_code: string | null
          nfe_provider: string
          nfe_readiness_checked_at: string | null
          nfe_readiness_pendencies: Json
          nfe_readiness_status: string
          nfe_series: string | null
          nfe_series_number: number | null
          nfse_configuration: Json
          nfse_credential_ref: string | null
          nfse_enabled: boolean
          nfse_provider: string
          nfse_series: string | null
          number: string | null
          organization_id: string
          phone: string | null
          pis_cofins_regime: string | null
          postal_code: string | null
          primary_cnae: string | null
          production_enabled: boolean
          rtc_configuration: Json
          rtc_scaffolding_enabled: boolean
          sefaz_homologation_at: string | null
          sefaz_homologation_evidence: Json | null
          state: string | null
          state_registration: string | null
          street: string | null
          tax_regime: string | null
          trade_name: string | null
          uf_accreditations: Json
          updated_at: string
          updated_by: string | null
          webhook_ref: string | null
        }
        SetofOptions: {
          from: "*"
          to: "company_fiscal_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_fiscal_draft_save: {
        Args: {
          p_expected_version: number
          p_invoice: Json
          p_invoice_id: string
          p_items: Json
        }
        Returns: Json
      }
      rpc_fiscal_draft_validate_homologation: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      rpc_fiscal_emitter_accounting_validate: {
        Args: { p_notes: string }
        Returns: Json
      }
      rpc_fiscal_emitter_request_accounting_review: {
        Args: { p_notes: string }
        Returns: Json
      }
      rpc_fiscal_event_manual: {
        Args: {
          p_event_type: string
          p_idempotency_key?: string
          p_invoice_id: string
          p_notes?: string
        }
        Returns: string
      }
      rpc_fiscal_event_sefaz_mark_signed_v1: {
        Args: {
          _actor?: string
          _event_id: string
          _signed_path: string
          _signed_sha256: string
        }
        Returns: Json
      }
      rpc_fiscal_event_sefaz_prepare_v1: {
        Args: {
          _actor: string
          _event_kind: string
          _idempotency_key: string
          _invoice_id: string
          _reason: string
        }
        Returns: Json
      }
      rpc_fiscal_event_sefaz_reconcile_v1: {
        Args: {
          _c_stat: string
          _dh_registro?: string
          _event_id: string
          _n_prot?: string
          _transmission_id: string
          _x_motivo: string
        }
        Returns: Json
      }
      rpc_fiscal_homologation_readiness: { Args: never; Returns: Json }
      rpc_fiscal_homologation_readiness_rtc_check: {
        Args: never
        Returns: boolean
      }
      rpc_fiscal_homologation_readiness_v2: { Args: never; Returns: Json }
      rpc_fiscal_invoice_apply_authorization_v1: {
        Args: {
          _access_key: string
          _c_stat: string
          _dh_recbto: string
          _invoice_id: string
          _protocol: string
          _transmission_id: string
          _x_motivo: string
        }
        Returns: Json
      }
      rpc_fiscal_invoice_store_protocoled_xml_v1: {
        Args: {
          _access_key: string
          _content_bytes: number
          _content_sha256: string
          _invoice_id: string
          _protocol: string
          _storage_bucket?: string
          _storage_path: string
          _transmission_id: string
          _xml_run_id?: string
        }
        Returns: Json
      }
      rpc_fiscal_item_readiness: {
        Args: { p_item_id: string; p_scope: string }
        Returns: Json
      }
      rpc_fiscal_nfe_readiness_v1: { Args: never; Returns: Json }
      rpc_fiscal_operation_policy_publish: {
        Args: { p_justification?: string; p_policy_id: string }
        Returns: Json
      }
      rpc_fiscal_preflight_v1: { Args: { p_invoice_id: string }; Returns: Json }
      rpc_fiscal_product_ibs_cbs_get: {
        Args: { p_product_id: string }
        Returns: Json
      }
      rpc_fiscal_product_ibs_cbs_save: {
        Args: {
          expected_revision?: string
          p_product_id: string
          payload: Json
        }
        Returns: Json
      }
      rpc_fiscal_reserve_nfe_number_v1: {
        Args: { p_idempotency_key: string; p_invoice_id: string }
        Returns: Json
      }
      rpc_fiscal_rule_sod_override: {
        Args: { p_justification: string; p_scope: string; p_target_id: string }
        Returns: Json
      }
      rpc_fiscal_sefaz_transmission_status_v1: {
        Args: { _invoice_id?: string }
        Returns: Json
      }
      rpc_fiscal_sefaz_transmit_begin_v1: {
        Args: {
          _actor?: string
          _endpoint_url: string
          _event_id?: string
          _idempotency_key: string
          _invoice_id?: string
          _request_fingerprint: string
          _service: string
          _xml_run_id?: string
        }
        Returns: Json
      }
      rpc_fiscal_sefaz_transmit_record_v1: {
        Args: { _patch?: Json; _state: string; _transmission_id: string }
        Returns: Json
      }
      rpc_fiscal_service_ibs_cbs_get: {
        Args: { p_service_id: string }
        Returns: Json
      }
      rpc_fiscal_service_ibs_cbs_save: {
        Args: {
          expected_revision?: string
          p_service_id: string
          payload: Json
        }
        Returns: Json
      }
      rpc_fiscal_service_profile_ibs_cbs_get: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      rpc_fiscal_service_profile_ibs_cbs_save: {
        Args: {
          expected_revision?: string
          p_profile_id: string
          payload: Json
        }
        Returns: Json
      }
      rpc_fiscal_tax_preview_v1: {
        Args: { p_invoice_id: string; p_items?: Json }
        Returns: Json
      }
      rpc_fiscal_tax_rule_publish: {
        Args: { p_justification?: string; p_rule_id: string }
        Returns: Json
      }
      rpc_fiscal_xml_prepare_v1: {
        Args: { p_idempotency_key: string; p_invoice_id: string }
        Returns: Json
      }
      rpc_fiscal_xml_record_v1: {
        Args: { p_patch?: Json; p_run_id: string; p_state: string }
        Returns: Json
      }
      rpc_fiscal_xml_status_v1: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      rpc_force_checkout_visita: {
        Args: {
          p_reason: string
          p_registro_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      rpc_gerar_alertas_operacionais: { Args: never; Returns: Json }
      rpc_gerar_etiqueta_produto: { Args: { p_payload: Json }; Returns: Json }
      rpc_gerar_etiquetas_embalagens_lote: {
        Args: { p_payload: Json }
        Returns: Json
      }
      rpc_gerar_formulario_entrega: {
        Args: { p_entrega_id: string }
        Returns: Json
      }
      rpc_get_comprovante_entrega_data: {
        Args: { p_entrega_id: string; p_reemissao?: boolean }
        Returns: Json
      }
      rpc_get_my_visit_by_client_uuid: {
        Args: { p_client_uuid: string }
        Returns: Json
      }
      rpc_get_visita_workspace: {
        Args: { p_registro_id: string }
        Returns: Json
      }
      rpc_ignorar_alerta_operacional: {
        Args: { p_alerta_id: string; p_observacao?: string }
        Returns: Json
      }
      rpc_iniciar_atendimento_solicitacao_v1: {
        Args: { p_client_uuid?: string; p_solicitacao_id: string }
        Returns: Json
      }
      rpc_ler_embalagem_por_qr: {
        Args: { p_codigo_ou_token: string }
        Returns: Json
      }
      rpc_liberar_recomendacao_produtor: {
        Args: { p_registro_id: string }
        Returns: Json
      }
      rpc_listar_atendimentos_tecnicos_v1: {
        Args: {
          p_aba?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
        }
        Returns: Json
      }
      rpc_listar_visitas_tecnicas_v1: {
        Args: {
          p_ate?: string
          p_cliente_id?: string
          p_de?: string
          p_fazenda_id?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_status?: string[]
        }
        Returns: Json
      }
      rpc_marcar_etiqueta_impressa: {
        Args: { p_etiqueta_id: string; p_motivo?: string }
        Returns: Json
      }
      rpc_marcar_notificacao_enviada: {
        Args: {
          p_notificacao_id: string
          p_provider: string
          p_provider_message_id?: string
        }
        Returns: undefined
      }
      rpc_marcar_notificacao_falhou: {
        Args: { p_erro: string; p_notificacao_id: string }
        Returns: undefined
      }
      rpc_marcar_resumo_enviado: {
        Args: {
          p_provider: string
          p_provider_message_id?: string
          p_resumo_id: string
        }
        Returns: undefined
      }
      rpc_marcar_resumo_falhou: {
        Args: { p_erro: string; p_resumo_id: string }
        Returns: undefined
      }
      rpc_message_set_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      rpc_microorganism_regulatory_overview: { Args: never; Returns: Json }
      rpc_notificar_gestor: {
        Args: { p_link?: string; p_mensagem: string; p_titulo: string }
        Returns: undefined
      }
      rpc_partner_commercial_history: {
        Args: { p_from?: string; p_partner_id: string; p_to?: string }
        Returns: Json
      }
      rpc_partner_dashboard: { Args: { p_partner_id?: string }; Returns: Json }
      rpc_partner_message_counters: {
        Args: { p_partner_id?: string }
        Returns: Json
      }
      rpc_planejamento_publicar_v1: {
        Args: { p_idempotency_key: string; p_planning_id: string }
        Returns: Json
      }
      rpc_portal_partner_credit_status: { Args: never; Returns: Json }
      rpc_portal_partner_financial:
        | {
            Args: never
            Returns: {
              ar_status: string
              financial_status: string
              installments: Json
              numero: string
              partner_order_id: string
              payment_method: string
              receivable_id: string
              total: number
              vencimento: string
            }[]
          }
        | {
            Args: { p_partner_id?: string }
            Returns: {
              ar_status: string
              financial_status: string
              installments: Json
              numero: string
              partner_order_id: string
              payment_method: string
              receivable_id: string
              total: number
              vencimento: string
            }[]
          }
      rpc_preparar_notificacoes_alertas: { Args: never; Returns: Json }
      rpc_preparar_resumos_alertas: {
        Args: {
          p_periodo_fim?: string
          p_periodo_inicio?: string
          p_tipo_resumo?: string
        }
        Returns: Json
      }
      rpc_preview_administrative_broadcast_count: {
        Args: { p_target_role: Database["public"]["Enums"]["app_role"] }
        Returns: Json
      }
      rpc_programar_os_v1: {
        Args: { p_data_programada?: string; p_origem: string; p_os_id: string }
        Returns: Json
      }
      rpc_programar_retorno_visita: {
        Args: {
          p_data_prevista: string
          p_descricao?: string
          p_expected_version: number
          p_registro_id: string
        }
        Returns: Json
      }
      rpc_publish_communication_event: {
        Args: {
          p_event_key: string
          p_idempotency_key: string
          p_payload: Json
          p_source_id: string
          p_source_type: string
        }
        Returns: Json
      }
      rpc_publish_communication_event_v2: {
        Args: {
          p_event_key: string
          p_idempotency_key: string
          p_payload: Json
          p_source_id: string
          p_source_type: string
        }
        Returns: Json
      }
      rpc_rastreio_produto_interno: {
        Args: { p_etiqueta_id: string }
        Returns: Json
      }
      rpc_reabrir_alerta_operacional: {
        Args: { p_alerta_id: string; p_observacao?: string }
        Returns: Json
      }
      rpc_reabrir_visita: {
        Args: {
          p_expected_version: number
          p_motivo: string
          p_registro_id: string
        }
        Returns: Json
      }
      rpc_realizar_checkin_visita: {
        Args: {
          p_captured_at_local: string
          p_client_uuid: string
          p_cliente_id: string
          p_fazenda_id: string
          p_foto_path: string
          p_justificativa_sem_gps: string
          p_latitude: number
          p_longitude: number
          p_observacoes: string
          p_precisao: number
          p_registro_id: string
          p_solicitacao_id: string
          p_talhao_id: string
          p_tipo: Database["public"]["Enums"]["tipo_checkin"]
        }
        Returns: Json
      }
      rpc_realizar_checkout_visita: {
        Args: {
          p_captured_at_local: string
          p_client_uuid: string
          p_foto_path: string
          p_justificativa_sem_gps: string
          p_latitude: number
          p_longitude: number
          p_observacoes: string
          p_precisao: number
          p_registro_id: string
        }
        Returns: Json
      }
      rpc_recalcular_prioridade_alerta: {
        Args: { p_alerta_id: string }
        Returns: number
      }
      rpc_recalcular_separacao_entrega: {
        Args: { p_entrega_id: string }
        Returns: string
      }
      rpc_record_aplicacao_email: {
        Args: {
          _aplicacao_id: string
          _email: string
          _enviado_por?: string
          _idempotency_key?: string
          _status?: string
        }
        Returns: Json
      }
      rpc_record_whatsapp_delivery_status: {
        Args: {
          p_error_code: string
          p_provider_message_id: string
          p_status: string
          p_timestamp: string
        }
        Returns: Json
      }
      rpc_refresh_bi_operacional: { Args: never; Returns: Json }
      rpc_register_payable_payment: {
        Args: { p_installment_id: string; p_payload: Json }
        Returns: string
      }
      rpc_register_receivable_payment: {
        Args: { p_installment_id: string; p_payload: Json }
        Returns: string
      }
      rpc_registrar_clima_manual_v1: {
        Args: {
          p_chuva_mm?: number
          p_data_hora?: string
          p_fazenda_id: string
          p_radiacao_solar?: number
          p_temperatura?: number
          p_umidade?: number
          p_vento_kmh?: number
        }
        Returns: {
          chuva_mm: number | null
          coletado_em: string
          created_at: string
          data_hora: string
          fazenda_id: string
          fonte: string
          id: string
          radiacao_solar: number | null
          temperatura: number | null
          tipo_dado: string
          umidade: number | null
          vento_kmh: number | null
        }
        SetofOptions: {
          from: "*"
          to: "clima_dados"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_registrar_ocorrencia_entrega: {
        Args: { p_entrega_id: string; p_payload: Json }
        Returns: Json
      }
      rpc_registrar_primeira_resposta_alerta: {
        Args: { p_alerta_id: string }
        Returns: Json
      }
      rpc_regulatory_checklist_set: {
        Args: {
          p_dossier_id: string
          p_evidence_document_id?: string
          p_item_key: string
          p_justification?: string
          p_state: string
        }
        Returns: Json
      }
      rpc_regulatory_document_register: {
        Args: {
          p_consulted_at?: string
          p_content_sha256: string
          p_doc_type: string
          p_doc_version?: string
          p_dossier_id: string
          p_issued_at?: string
          p_issuer?: string
          p_source_key?: string
          p_source_url?: string
          p_storage_path: string
          p_title: string
          p_valid_until?: string
        }
        Returns: string
      }
      rpc_regulatory_document_soft_delete: {
        Args: { p_document_id: string; p_reason: string }
        Returns: Json
      }
      rpc_regulatory_dossier_block: {
        Args: { p_dossier_id: string; p_reason: string }
        Returns: Json
      }
      rpc_regulatory_dossier_detail: {
        Args: { p_microorganism_id: string }
        Returns: Json
      }
      rpc_regulatory_dossier_ensure_draft: {
        Args: { p_microorganism_id: string }
        Returns: string
      }
      rpc_regulatory_dossier_new_version: {
        Args: { p_microorganism_id: string; p_reason: string }
        Returns: string
      }
      rpc_regulatory_dossier_publish: {
        Args: { p_dossier_id: string }
        Returns: Json
      }
      rpc_regulatory_dossier_submit: {
        Args: { p_dossier_id: string }
        Returns: Json
      }
      rpc_regulatory_dossier_update_draft: {
        Args: { p_dossier_id: string; p_patch: Json }
        Returns: Json
      }
      rpc_regulatory_ncm_candidate_add: {
        Args: {
          p_cest?: string
          p_confidence?: string
          p_consulted_at?: string
          p_dossier_id: string
          p_justification: string
          p_ncm: string
          p_source_key?: string
          p_source_url?: string
        }
        Returns: string
      }
      rpc_regulatory_ncm_candidate_decide: {
        Args: {
          p_approve: boolean
          p_candidate_id: string
          p_official_description?: string
          p_reason: string
          p_table_reference_date?: string
          p_table_version?: string
        }
        Returns: Json
      }
      rpc_regulatory_presentation_upsert: {
        Args: { p_dossier_id: string; p_patch?: Json; p_volume_ml: number }
        Returns: string
      }
      rpc_regulatory_review_decide: {
        Args: {
          p_decision: string
          p_dossier_id: string
          p_justification: string
          p_layer: string
        }
        Returns: Json
      }
      rpc_regulatory_sod_override: {
        Args: { p_dossier_id: string; p_reason: string }
        Returns: Json
      }
      rpc_regulatory_storage_cleanup_confirm: {
        Args: { p_document_id: string; p_success: boolean }
        Returns: Json
      }
      rpc_remove_visit_technician: {
        Args: { p_reason?: string; p_registro_id: string; p_user_id: string }
        Returns: Json
      }
      rpc_reprogramar_monitoramento_v1: {
        Args: {
          p_alerta_id: string
          p_expected_updated_at?: string
          p_nova_data: string
        }
        Returns: Json
      }
      rpc_reprovar_visita: {
        Args: {
          p_expected_version: number
          p_motivo: string
          p_registro_id: string
        }
        Returns: Json
      }
      rpc_reservar_embalagem_entrega: {
        Args: {
          p_embalagem_id: string
          p_entrega_id: string
          p_entrega_item_id?: string
        }
        Returns: Json
      }
      rpc_resolve_commercial_prices: {
        Args: {
          p_buyer?: Json
          p_items: Json
          p_plan_id: string
          p_ref_date?: string
        }
        Returns: Json
      }
      rpc_resolve_outbox_address: {
        Args: { p_outbox_id: string }
        Returns: Json
      }
      rpc_resolver_alerta_operacional: {
        Args: { p_alerta_id: string; p_observacao?: string }
        Returns: Json
      }
      rpc_resumo_atendimentos_tecnicos_v1: { Args: never; Returns: Json }
      rpc_salvar_aplicacao_v1: {
        Args: {
          p_aplicacao_id: string
          p_evidencias?: Json
          p_evidencias_manter?: string[]
          p_payload: Json
          p_rectify_id?: string
        }
        Returns: Json
      }
      rpc_salvar_campo_visita: {
        Args: {
          p_client_uuid: string
          p_payload: Json
          p_registro_consultor_id: string
          p_versao: number
        }
        Returns: Json
      }
      rpc_service_apply_provider_settings: {
        Args: { p_actor: string; p_payload: Json }
        Returns: Json
      }
      rpc_service_check_rate_limit: {
        Args: {
          p_action: string
          p_max: number
          p_user: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      rpc_service_clear_provider_secret: {
        Args: { p_actor: string; p_slot: string }
        Returns: undefined
      }
      rpc_service_load_provider_runtime_config: { Args: never; Returns: Json }
      rpc_service_record_smtp_diagnostic: {
        Args: {
          p_action: string
          p_actor: string
          p_latency_ms?: number
          p_outcome: string
          p_safe_code: string
          p_stage: string
        }
        Returns: number
      }
      rpc_service_set_provider_secret: {
        Args: { p_actor: string; p_slot: string; p_value: string }
        Returns: undefined
      }
      rpc_set_communication_template_metadata: {
        Args: {
          p_language_code: string
          p_parameter_mapping: Json
          p_provider_template_name: string
          p_provider_template_status?: string
          p_template_id: string
        }
        Returns: Json
      }
      rpc_set_payable_allocations: {
        Args: {
          p_allocations: Json
          p_expected_version: number
          p_payable_id: string
          p_reason: string
          p_request_key: string
        }
        Returns: Json
      }
      rpc_skip_communication_delivery: {
        Args: { p_outbox_id: string; p_reason: string; p_worker_id: string }
        Returns: Json
      }
      rpc_solicitar_ajuste_visita: {
        Args: {
          p_expected_version: number
          p_motivo: string
          p_registro_id: string
        }
        Returns: Json
      }
      rpc_substituir_etiqueta_produto: {
        Args: { p_etiqueta_id: string; p_motivo: string }
        Returns: Json
      }
      rpc_update_communication_preferences: {
        Args: {
          p_canal: Database["public"]["Enums"]["comunicacao_canal"]
          p_enabled: boolean
          p_whatsapp_opt_in: boolean
        }
        Returns: Json
      }
      rpc_update_communication_template: {
        Args: {
          p_assunto: string
          p_corpo: string
          p_nome: string
          p_template_id: string
          p_variaveis: Json
        }
        Returns: Json
      }
      rpc_upsert_communication_rule: {
        Args: {
          p_canal: Database["public"]["Enums"]["comunicacao_canal"]
          p_condicoes: Json
          p_cooldown_seconds: number
          p_enabled: boolean
          p_estrategia: string
          p_event_key: string
          p_perfil: Database["public"]["Enums"]["app_role"]
          p_prioridade: number
          p_rule_id: string
          p_template_chave: string
          p_template_versao: number
        }
        Returns: Json
      }
      rpc_upsert_diagnostico_visita: {
        Args: {
          p_client_uuid: string
          p_expected_versao: number
          p_payload: Json
          p_registro_id: string
        }
        Returns: Json
      }
      rpc_upsert_fiscal_invoice_manual: {
        Args: { p_payload: Json; p_receivable_id: string }
        Returns: Json
      }
      rpc_upsert_recomendacao_visita: {
        Args: {
          p_client_uuid: string
          p_expected_versao: number
          p_payload: Json
          p_registro_id: string
        }
        Returns: Json
      }
      rpc_validar_comprovante_entrega: {
        Args: { p_validation_token: string }
        Returns: Json
      }
      rpc_validar_integridade_esteira:
        | { Args: { p_origem: string; p_os_id: string }; Returns: Json }
        | {
            Args: {
              p_acao_solicitada: string
              p_origem_os: string
              p_os_id: string
            }
            Returns: Json
          }
      rpc_validar_rastreio_produto: {
        Args: { p_trace_token: string }
        Returns: Json
      }
      rpc_verify_communication_channel: {
        Args: {
          p_canal: Database["public"]["Enums"]["comunicacao_canal"]
          p_cliente_id: string
          p_email_verificado: boolean
          p_telefone_verificado: boolean
          p_user_id: string
        }
        Returns: Json
      }
      rpc_vincular_etiqueta_embalagem: {
        Args: { p_embalagem_id: string; p_etiqueta_id: string }
        Returns: Json
      }
      saas_has_feature: { Args: { _feature_key: string }; Returns: boolean }
      save_client_portal_branding: {
        Args: {
          p_cliente_id: string
          p_marca_cor_primaria: string
          p_marca_logo_url: string
          p_marca_nome: string
        }
        Returns: undefined
      }
      save_partner_portal_branding: {
        Args: {
          p_marca_cor_primaria: string
          p_marca_logo_url: string
          p_marca_nome: string
          p_partner_id: string
        }
        Returns: undefined
      }
      send_partner_simulation_to_manager_secure: {
        Args: { p_simulation_id: string }
        Returns: undefined
      }
      set_my_context_preference: {
        Args: { p_context: string; p_remember?: boolean }
        Returns: Json
      }
      set_partner_order_delivery_date: {
        Args: { p_estimated_delivery_date: string; p_order_id: string }
        Returns: undefined
      }
      set_partner_user_papel: {
        Args: { p_link_id: string; p_papel: string }
        Returns: undefined
      }
      simulate_b2b_payment_plan_secure: {
        Args: {
          p_first_due_date?: string
          p_items: Json
          p_partner_id: string
          p_payment_plan_id: string
        }
        Returns: Json
      }
      start_technical_visit_secure: {
        Args: {
          p_client_uuid?: string
          p_foto_path?: string
          p_foto_url?: string
          p_justificativa_sem_gps?: string
          p_latitude?: number
          p_longitude?: number
          p_observacoes?: string
          p_precisao_gps?: number
          p_registro_id: string
        }
        Returns: {
          checkin_id: string
          is_new: boolean
        }[]
      }
      tenant_admin_list_users: {
        Args: {
          p_active?: boolean
          p_limit?: number
          p_offset?: number
          p_role?: Database["public"]["Enums"]["app_role"]
          p_search?: string
        }
        Returns: Json
      }
      tenant_admin_set_user_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: Json
      }
      unassign_b2b_user_client_secure: {
        Args: { p_cliente_id: string; p_reason?: string; p_user_id: string }
        Returns: boolean
      }
      update_microorganism_b2b_description: {
        Args: { p_explicacao_b2b: string; p_profile_id: string }
        Returns: undefined
      }
      update_partner_order_notes: {
        Args: { p_commercial_notes: string; p_order_id: string }
        Returns: undefined
      }
      update_partner_order_status: {
        Args: {
          p_motivo?: string
          p_order_id: string
          p_status: Database["public"]["Enums"]["partner_order_status"]
        }
        Returns: undefined
      }
      update_product_b2b_description: {
        Args: { p_explicacao_b2b: string; p_profile_id: string }
        Returns: undefined
      }
      validate_catalog_approval_checklist: {
        Args: {
          p_aprovado_sem_fonte: boolean
          p_b2b_enabled: boolean
          p_checklist: Json
          p_has_sources: boolean
          p_kind: string
        }
        Returns: undefined
      }
    }
    Enums: {
      access_level_tecnico: "read" | "execute" | "manage"
      app_role:
        | "administrador"
        | "tecnico_agronomo"
        | "producao"
        | "administrativo"
        | "gestor"
        | "cliente_produtor"
        | "consultor_tecnico"
        | "aplicador"
        | "operador_onfarm"
        | "financeiro"
        | "gestor_comercial"
        | "parceiro_b2b"
        | "parceiro_b2b_tecnico"
        | "superadmin"
      categoria_arquivo_consultor:
        | "praga"
        | "doenca"
        | "planta_daninha"
        | "nematoide"
        | "solo"
        | "aplicacao"
        | "geral"
        | "laudo"
        | "documento_cliente"
        | "recomendacao_anexa"
        | "checkin"
        | "vistoria"
        | "retorno"
      categoria_problema_consultor:
        | "insetos_praga"
        | "doencas_fungicas"
        | "doencas_bacterianas"
        | "nematoides"
        | "plantas_daninhas"
        | "desequilibrio_biologico_solo"
        | "baixa_vitalidade"
        | "falha_estande"
        | "fitotoxidade"
        | "outro"
      cliente_doc_tipo:
        | "contrato_social"
        | "procuracao"
        | "car_mapa"
        | "outro"
        | "cnh"
        | "cartao_cnpj"
        | "inscricao_produtor"
        | "rg"
        | "comprovante_endereco"
      cliente_status: "prospect" | "ativo" | "inativo" | "bloqueado_financeiro"
      cliente_tipo_pessoa: "fisica" | "juridica"
      comunicacao_canal: "email" | "whatsapp" | "in_app" | "push"
      comunicacao_evento_status: "received" | "processed" | "skipped"
      comunicacao_outbox_status:
        | "pending"
        | "processing"
        | "sent"
        | "failed"
        | "cancelled"
        | "skipped"
        | "dead_letter"
      comunicacao_template_status: "draft" | "active" | "archived"
      estrategia_manejo:
        | "biologico"
        | "manejo_integrado"
        | "monitoramento"
        | "correcao_operacional"
        | "ajuste_aplicacao"
        | "ajuste_janela"
        | "outro"
      faturamento_base_status:
        | "PENDENTE"
        | "LIBERADO_FATURAMENTO"
        | "FATURADO_PARCIAL"
        | "FATURADO_TOTAL"
        | "CANCELADO"
      modo_aplicacao_consultor:
        | "foliar"
        | "aplicacao_no_colo_da_planta"
        | "via_solo"
        | "tratamento_semente"
        | "sulco_plantio"
        | "jato_dirigido"
        | "outro"
      natureza_registro_consultor: "ocorrencia" | "visita"
      necessidade_intervencao:
        | "monitorar"
        | "intervir_ate_7_dias"
        | "intervir_ate_3_dias"
        | "intervir_imediatamente"
      nivel_pressao: "baixo" | "medio" | "alto" | "severo"
      nivel_risco: "baixo" | "medio" | "alto" | "critico"
      nivel_severidade: "baixo" | "medio" | "alto"
      objetivo_recomendacao:
        | "preventivo"
        | "corretivo"
        | "reducao_pressao"
        | "tratamento_solo"
        | "reequilibrio_biologico"
        | "suporte_fisiologico"
        | "manejo_integrado"
      order_message_author: "parceiro" | "comercial" | "admin"
      partner_contact_setor:
        | "comercial"
        | "financeiro"
        | "operacional"
        | "tecnico"
        | "administrativo"
        | "outro"
      partner_order_priority: "normal" | "urgente" | "programado"
      partner_order_status:
        | "rascunho"
        | "pendente"
        | "solicitado"
        | "em_analise_comercial"
        | "aprovado"
        | "reprovado"
        | "em_producao"
        | "produzido"
        | "aguardando_entrega"
        | "confirmado"
        | "em_separacao"
        | "enviado"
        | "entregue"
        | "faturado"
        | "cancelado"
        | "aguardando_aprovacao_credito"
        | "aguardando_ajuste_comercial"
        | "aguardando_itens"
        | "reprovado_sem_itens"
        | "aguardando_cotacao"
      partner_porte: "pequeno" | "medio" | "grande"
      partner_regime_tributario:
        | "simples"
        | "lucro_presumido"
        | "lucro_real"
        | "mei"
        | "isento"
      partner_segmento:
        | "cooperativa"
        | "revenda_agro"
        | "consultoria"
        | "industria"
        | "produtor_direto"
        | "outro"
      partner_type_enum:
        | "distribuidor"
        | "revenda"
        | "cooperativa"
        | "produtor_parceiro"
        | "canal_estrategico"
        | "representante"
      ponto_area_consultor:
        | "entrada_talhao"
        | "bordadura"
        | "centro_area"
        | "reboleira"
        | "outro"
      prioridade_os: "baixa" | "media" | "alta"
      production_planning_status:
        | "aguardando_planejamento"
        | "planejado"
        | "em_producao"
        | "produzido"
        | "entregue"
        | "cancelado"
        | "replanejar"
      recomendacao_comentario_autor_tipo:
        | "produtor"
        | "tecnico"
        | "gestor"
        | "admin"
      resultado_cq: "aprovado" | "reprovado"
      risco_produtivo: "baixo" | "medio" | "alto" | "critico"
      saas_subscription_status:
        | "TRIAL"
        | "ACTIVE"
        | "PAST_DUE"
        | "SUSPENDED"
        | "CANCELLED"
        | "EXPIRED"
      status_alerta: "ativo" | "monitoramento" | "encerrado"
      status_aprovacao:
        | "pendente"
        | "aprovado"
        | "reprovado"
        | "solicitar_ajuste"
        | "ajuste_solicitado"
        | "reaberto"
      status_atribuicao: "atribuida" | "aceita" | "recusada" | "concluida"
      status_checkin: "realizado" | "inconsistente" | "validado"
      status_diagnostico: "novo" | "em_analise" | "diagnostico_concluido"
      status_entrega: "separado" | "em_rota" | "entregue" | "cancelada"
      status_estoque: "disponivel" | "reservado" | "expedido" | "estornado"
      status_lote: "em_producao" | "aguardando_cq" | "aprovado" | "reprovado"
      status_os:
        | "aberta"
        | "aprovada"
        | "programada"
        | "em_producao"
        | "em_cq"
        | "envase"
        | "aguardando_reserva"
        | "pronto_entrega"
        | "entregue"
        | "finalizada"
      status_os_onfarm:
        | "aberta"
        | "aprovada"
        | "programada"
        | "em_producao"
        | "em_cq"
        | "envase"
        | "aguardando_reserva"
        | "pronto_entrega"
        | "entregue"
        | "finalizada"
        | "cancelada"
      status_programacao:
        | "aguardando"
        | "em_producao"
        | "aguardando_cq"
        | "aprovado"
      status_registro_consultor:
        | "rascunho"
        | "em_andamento"
        | "finalizado"
        | "enviado_aprovacao"
        | "aprovado"
        | "convertido_os"
        | "arquivado"
        | "reprovado"
      tipo_alerta:
        | "praga"
        | "doenca"
        | "daninha"
        | "nematoide"
        | "estresse_hidrico"
      tipo_arquivo_consultor: "foto" | "audio" | "pdf"
      tipo_checkin:
        | "chegada_fazenda"
        | "chegada_talhao"
        | "inicio_visita"
        | "checkout"
      tipo_demanda_consultor:
        | "praga"
        | "doenca"
        | "planta_daninha"
        | "nematoide"
        | "solo"
        | "nutricao_biologica"
        | "manejo_preventivo"
        | "manejo_corretivo"
        | "outro"
      tipo_embalagem: "frasco_1L" | "bombona_5L" | "bombona_20L"
      tipo_microrganismo: "bacteria" | "fungo" | "levedura" | "consorcio"
      tipo_notificacao_portal:
        | "informativo"
        | "alerta"
        | "entrega"
        | "recomendacao"
        | "aplicacao"
        | "sistema"
      tipo_problema: "praga" | "doenca" | "solo" | "nutricao" | "nematoide"
      tipo_produto:
        | "inseticida"
        | "fungicida"
        | "solo"
        | "inoculante"
        | "solubilizador"
      tipo_visita:
        | "vistoria_inicial"
        | "retorno"
        | "monitoramento"
        | "pos_aplicacao"
        | "emergencia"
        | "acompanhamento_programado"
      urgencia_consultor: "baixa" | "media" | "alta" | "critica"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_level_tecnico: ["read", "execute", "manage"],
      app_role: [
        "administrador",
        "tecnico_agronomo",
        "producao",
        "administrativo",
        "gestor",
        "cliente_produtor",
        "consultor_tecnico",
        "aplicador",
        "operador_onfarm",
        "financeiro",
        "gestor_comercial",
        "parceiro_b2b",
        "parceiro_b2b_tecnico",
        "superadmin",
      ],
      categoria_arquivo_consultor: [
        "praga",
        "doenca",
        "planta_daninha",
        "nematoide",
        "solo",
        "aplicacao",
        "geral",
        "laudo",
        "documento_cliente",
        "recomendacao_anexa",
        "checkin",
        "vistoria",
        "retorno",
      ],
      categoria_problema_consultor: [
        "insetos_praga",
        "doencas_fungicas",
        "doencas_bacterianas",
        "nematoides",
        "plantas_daninhas",
        "desequilibrio_biologico_solo",
        "baixa_vitalidade",
        "falha_estande",
        "fitotoxidade",
        "outro",
      ],
      cliente_doc_tipo: [
        "contrato_social",
        "procuracao",
        "car_mapa",
        "outro",
        "cnh",
        "cartao_cnpj",
        "inscricao_produtor",
        "rg",
        "comprovante_endereco",
      ],
      cliente_status: ["prospect", "ativo", "inativo", "bloqueado_financeiro"],
      cliente_tipo_pessoa: ["fisica", "juridica"],
      comunicacao_canal: ["email", "whatsapp", "in_app", "push"],
      comunicacao_evento_status: ["received", "processed", "skipped"],
      comunicacao_outbox_status: [
        "pending",
        "processing",
        "sent",
        "failed",
        "cancelled",
        "skipped",
        "dead_letter",
      ],
      comunicacao_template_status: ["draft", "active", "archived"],
      estrategia_manejo: [
        "biologico",
        "manejo_integrado",
        "monitoramento",
        "correcao_operacional",
        "ajuste_aplicacao",
        "ajuste_janela",
        "outro",
      ],
      faturamento_base_status: [
        "PENDENTE",
        "LIBERADO_FATURAMENTO",
        "FATURADO_PARCIAL",
        "FATURADO_TOTAL",
        "CANCELADO",
      ],
      modo_aplicacao_consultor: [
        "foliar",
        "aplicacao_no_colo_da_planta",
        "via_solo",
        "tratamento_semente",
        "sulco_plantio",
        "jato_dirigido",
        "outro",
      ],
      natureza_registro_consultor: ["ocorrencia", "visita"],
      necessidade_intervencao: [
        "monitorar",
        "intervir_ate_7_dias",
        "intervir_ate_3_dias",
        "intervir_imediatamente",
      ],
      nivel_pressao: ["baixo", "medio", "alto", "severo"],
      nivel_risco: ["baixo", "medio", "alto", "critico"],
      nivel_severidade: ["baixo", "medio", "alto"],
      objetivo_recomendacao: [
        "preventivo",
        "corretivo",
        "reducao_pressao",
        "tratamento_solo",
        "reequilibrio_biologico",
        "suporte_fisiologico",
        "manejo_integrado",
      ],
      order_message_author: ["parceiro", "comercial", "admin"],
      partner_contact_setor: [
        "comercial",
        "financeiro",
        "operacional",
        "tecnico",
        "administrativo",
        "outro",
      ],
      partner_order_priority: ["normal", "urgente", "programado"],
      partner_order_status: [
        "rascunho",
        "pendente",
        "solicitado",
        "em_analise_comercial",
        "aprovado",
        "reprovado",
        "em_producao",
        "produzido",
        "aguardando_entrega",
        "confirmado",
        "em_separacao",
        "enviado",
        "entregue",
        "faturado",
        "cancelado",
        "aguardando_aprovacao_credito",
        "aguardando_ajuste_comercial",
        "aguardando_itens",
        "reprovado_sem_itens",
        "aguardando_cotacao",
      ],
      partner_porte: ["pequeno", "medio", "grande"],
      partner_regime_tributario: [
        "simples",
        "lucro_presumido",
        "lucro_real",
        "mei",
        "isento",
      ],
      partner_segmento: [
        "cooperativa",
        "revenda_agro",
        "consultoria",
        "industria",
        "produtor_direto",
        "outro",
      ],
      partner_type_enum: [
        "distribuidor",
        "revenda",
        "cooperativa",
        "produtor_parceiro",
        "canal_estrategico",
        "representante",
      ],
      ponto_area_consultor: [
        "entrada_talhao",
        "bordadura",
        "centro_area",
        "reboleira",
        "outro",
      ],
      prioridade_os: ["baixa", "media", "alta"],
      production_planning_status: [
        "aguardando_planejamento",
        "planejado",
        "em_producao",
        "produzido",
        "entregue",
        "cancelado",
        "replanejar",
      ],
      recomendacao_comentario_autor_tipo: [
        "produtor",
        "tecnico",
        "gestor",
        "admin",
      ],
      resultado_cq: ["aprovado", "reprovado"],
      risco_produtivo: ["baixo", "medio", "alto", "critico"],
      saas_subscription_status: [
        "TRIAL",
        "ACTIVE",
        "PAST_DUE",
        "SUSPENDED",
        "CANCELLED",
        "EXPIRED",
      ],
      status_alerta: ["ativo", "monitoramento", "encerrado"],
      status_aprovacao: [
        "pendente",
        "aprovado",
        "reprovado",
        "solicitar_ajuste",
        "ajuste_solicitado",
        "reaberto",
      ],
      status_atribuicao: ["atribuida", "aceita", "recusada", "concluida"],
      status_checkin: ["realizado", "inconsistente", "validado"],
      status_diagnostico: ["novo", "em_analise", "diagnostico_concluido"],
      status_entrega: ["separado", "em_rota", "entregue", "cancelada"],
      status_estoque: ["disponivel", "reservado", "expedido", "estornado"],
      status_lote: ["em_producao", "aguardando_cq", "aprovado", "reprovado"],
      status_os: [
        "aberta",
        "aprovada",
        "programada",
        "em_producao",
        "em_cq",
        "envase",
        "aguardando_reserva",
        "pronto_entrega",
        "entregue",
        "finalizada",
      ],
      status_os_onfarm: [
        "aberta",
        "aprovada",
        "programada",
        "em_producao",
        "em_cq",
        "envase",
        "aguardando_reserva",
        "pronto_entrega",
        "entregue",
        "finalizada",
        "cancelada",
      ],
      status_programacao: [
        "aguardando",
        "em_producao",
        "aguardando_cq",
        "aprovado",
      ],
      status_registro_consultor: [
        "rascunho",
        "em_andamento",
        "finalizado",
        "enviado_aprovacao",
        "aprovado",
        "convertido_os",
        "arquivado",
        "reprovado",
      ],
      tipo_alerta: [
        "praga",
        "doenca",
        "daninha",
        "nematoide",
        "estresse_hidrico",
      ],
      tipo_arquivo_consultor: ["foto", "audio", "pdf"],
      tipo_checkin: [
        "chegada_fazenda",
        "chegada_talhao",
        "inicio_visita",
        "checkout",
      ],
      tipo_demanda_consultor: [
        "praga",
        "doenca",
        "planta_daninha",
        "nematoide",
        "solo",
        "nutricao_biologica",
        "manejo_preventivo",
        "manejo_corretivo",
        "outro",
      ],
      tipo_embalagem: ["frasco_1L", "bombona_5L", "bombona_20L"],
      tipo_microrganismo: ["bacteria", "fungo", "levedura", "consorcio"],
      tipo_notificacao_portal: [
        "informativo",
        "alerta",
        "entrega",
        "recomendacao",
        "aplicacao",
        "sistema",
      ],
      tipo_problema: ["praga", "doenca", "solo", "nutricao", "nematoide"],
      tipo_produto: [
        "inseticida",
        "fungicida",
        "solo",
        "inoculante",
        "solubilizador",
      ],
      tipo_visita: [
        "vistoria_inicial",
        "retorno",
        "monitoramento",
        "pos_aplicacao",
        "emergencia",
        "acompanhamento_programado",
      ],
      urgencia_consultor: ["baixa", "media", "alta", "critica"],
    },
  },
} as const
