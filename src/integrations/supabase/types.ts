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
      accounts_payable: {
        Row: {
          banco_conta_id: string | null
          created_at: string | null
          data_pagamento: string | null
          id: string
          metodo_pagamento_id: string | null
          observacoes: string | null
          status: string | null
          valor: number
          valor_pago: number | null
          vencimento: string | null
        }
        Insert: {
          banco_conta_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          id?: string
          metodo_pagamento_id?: string | null
          observacoes?: string | null
          status?: string | null
          valor: number
          valor_pago?: number | null
          vencimento?: string | null
        }
        Update: {
          banco_conta_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          id?: string
          metodo_pagamento_id?: string | null
          observacoes?: string | null
          status?: string | null
          valor?: number
          valor_pago?: number | null
          vencimento?: string | null
        }
        Relationships: []
      }
      accounts_receivable: {
        Row: {
          created_at: string | null
          id: string
          ordem_servico_id: string | null
          status: string | null
          valor: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
          status?: string | null
          valor?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
          status?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicacao_evidencias: {
        Row: {
          aplicacao_id: string | null
          evidencia_id: string | null
          id: string
        }
        Insert: {
          aplicacao_id?: string | null
          evidencia_id?: string | null
          id?: string
        }
        Update: {
          aplicacao_id?: string | null
          evidencia_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aplicacao_evidencias_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacao_evidencias_evidencia_id_fkey"
            columns: ["evidencia_id"]
            isOneToOne: false
            referencedRelation: "evidencias"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicacao_evidencias_vinculos: {
        Row: {
          aplicacao_id: string
          evidencia_id: string
        }
        Insert: {
          aplicacao_id: string
          evidencia_id: string
        }
        Update: {
          aplicacao_id?: string
          evidencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aplicacao_evidencias_vinculos_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacao_evidencias_vinculos_evidencia_id_fkey"
            columns: ["evidencia_id"]
            isOneToOne: false
            referencedRelation: "evidencias"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicacoes: {
        Row: {
          area_aplicada_ha: number | null
          created_at: string | null
          data_aplicacao: string | null
          dose_aplicada: number | null
          email_envio: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          is_latest: boolean | null
          lote_usado_id: string | null
          modo_aplicacao: string | null
          motivo_retificacao: string | null
          observacoes: string | null
          ordem_servico_id: string | null
          parent_id: string | null
          responsavel: string | null
          responsavel_id: string | null
          versao: number | null
          volume_calda_l_ha: number | null
        }
        Insert: {
          area_aplicada_ha?: number | null
          created_at?: string | null
          data_aplicacao?: string | null
          dose_aplicada?: number | null
          email_envio?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          is_latest?: boolean | null
          lote_usado_id?: string | null
          modo_aplicacao?: string | null
          motivo_retificacao?: string | null
          observacoes?: string | null
          ordem_servico_id?: string | null
          parent_id?: string | null
          responsavel?: string | null
          responsavel_id?: string | null
          versao?: number | null
          volume_calda_l_ha?: number | null
        }
        Update: {
          area_aplicada_ha?: number | null
          created_at?: string | null
          data_aplicacao?: string | null
          dose_aplicada?: number | null
          email_envio?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          is_latest?: boolean | null
          lote_usado_id?: string | null
          modo_aplicacao?: string | null
          motivo_retificacao?: string | null
          observacoes?: string | null
          ordem_servico_id?: string | null
          parent_id?: string | null
          responsavel?: string | null
          responsavel_id?: string | null
          versao?: number | null
          volume_calda_l_ha?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicacoes_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_senha_log: {
        Row: {
          acao: string | null
          created_at: string | null
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao?: string | null
          created_at?: string | null
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string | null
          created_at?: string | null
          id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      bi_user_preferences: {
        Row: {
          created_at: string | null
          id: string
          preferences: Json | null
          secao: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          preferences?: Json | null
          secao?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          preferences?: Json | null
          secao?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cliente_campos_extras: {
        Row: {
          campo: string | null
          cliente_id: string | null
          created_at: string | null
          id: string
          valor: string | null
        }
        Insert: {
          campo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          valor?: string | null
        }
        Update: {
          campo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_campos_extras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_contatos: {
        Row: {
          cargo: string | null
          cliente_id: string | null
          created_at: string | null
          email: string | null
          id: string
          is_whatsapp: boolean | null
          nome: string
          principal: boolean | null
          telefone: string | null
        }
        Insert: {
          cargo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_whatsapp?: boolean | null
          nome: string
          principal?: boolean | null
          telefone?: string | null
        }
        Update: {
          cargo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_whatsapp?: boolean | null
          nome?: string
          principal?: boolean | null
          telefone?: string | null
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
          cliente_id: string | null
          created_at: string | null
          id: string
          titulo: string | null
          url: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          titulo?: string | null
          url?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          titulo?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          id: string
          nome: string
        }
        Insert: {
          id?: string
          nome: string
        }
        Update: {
          id?: string
          nome?: string
        }
        Relationships: []
      }
      clientes_audit_log: {
        Row: {
          acao: string | null
          alteracoes: Json | null
          cliente_id: string | null
          created_at: string | null
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao?: string | null
          alteracoes?: Json | null
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string | null
          alteracoes?: Json | null
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_audit_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      company_fiscal_settings: {
        Row: {
          cnpj: string
          configuration_status: string | null
          configuration_version: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          legal_name: string
          trade_name: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj: string
          configuration_status?: string | null
          configuration_version?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          legal_name: string
          trade_name?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string
          configuration_status?: string | null
          configuration_version?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          legal_name?: string
          trade_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      configuracoes_sistema: {
        Row: {
          created_at: string | null
          email_envio: string | null
          id: string
          logo_url: string | null
          nome_empresa: string
        }
        Insert: {
          created_at?: string | null
          email_envio?: string | null
          id?: string
          logo_url?: string | null
          nome_empresa?: string
        }
        Update: {
          created_at?: string | null
          email_envio?: string | null
          id?: string
          logo_url?: string | null
          nome_empresa?: string
        }
        Relationships: []
      }
      controle_qualidade: {
        Row: {
          created_at: string | null
          data_analise: string | null
          id: string
          lote_id: string | null
          resultado: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          data_analise?: string | null
          id?: string
          lote_id?: string | null
          resultado?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          data_analise?: string | null
          id?: string
          lote_id?: string | null
          resultado?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "controle_qualidade_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      culturas: {
        Row: {
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      entrega_conferencia_itens: {
        Row: {
          created_at: string | null
          entrega_id: string | null
          id: string
          lote_id: string | null
          produto_id: string | null
          quantidade_conferida: number | null
        }
        Insert: {
          created_at?: string | null
          entrega_id?: string | null
          id?: string
          lote_id?: string | null
          produto_id?: string | null
          quantidade_conferida?: number | null
        }
        Update: {
          created_at?: string | null
          entrega_id?: string | null
          id?: string
          lote_id?: string | null
          produto_id?: string | null
          quantidade_conferida?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_conferencia_itens_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_conferencia_itens_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_conferencia_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      entrega_etiquetas: {
        Row: {
          ativo: boolean | null
          codigo_barras: string | null
          created_at: string | null
          entrega_id: string | null
          id: string
        }
        Insert: {
          ativo?: boolean | null
          codigo_barras?: string | null
          created_at?: string | null
          entrega_id?: string | null
          id?: string
        }
        Update: {
          ativo?: boolean | null
          codigo_barras?: string | null
          created_at?: string | null
          entrega_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrega_etiquetas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
        ]
      }
      entrega_termos: {
        Row: {
          aceite: boolean | null
          created_at: string | null
          entrega_id: string | null
          id: string
          termo: string | null
        }
        Insert: {
          aceite?: boolean | null
          created_at?: string | null
          entrega_id?: string | null
          id?: string
          termo?: string | null
        }
        Update: {
          aceite?: boolean | null
          created_at?: string | null
          entrega_id?: string | null
          id?: string
          termo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_termos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
        ]
      }
      entregas: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          data_entrega: string | null
          id: string
          ordem_servico_id: string | null
          responsavel_id: string | null
          status: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          data_entrega?: string | null
          id?: string
          ordem_servico_id?: string | null
          responsavel_id?: string | null
          status?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          data_entrega?: string | null
          id?: string
          ordem_servico_id?: string | null
          responsavel_id?: string | null
          status?: string | null
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
            foreignKeyName: "entregas_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      envase: {
        Row: {
          created_at: string | null
          data_envase: string | null
          id: string
          lote_id: string | null
          quantidade: number | null
          reservado_para_os_id: string | null
        }
        Insert: {
          created_at?: string | null
          data_envase?: string | null
          id?: string
          lote_id?: string | null
          quantidade?: number | null
          reservado_para_os_id?: string | null
        }
        Update: {
          created_at?: string | null
          data_envase?: string | null
          id?: string
          lote_id?: string | null
          quantidade?: number | null
          reservado_para_os_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envase_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envase_reservado_para_os_id_fkey"
            columns: ["reservado_para_os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      esteira_producao_v2: {
        Row: {
          created_at: string | null
          id: string
          ordem_servico_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "esteira_producao_v2_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_movimentacoes: {
        Row: {
          created_at: string | null
          id: string
          origem: string | null
          produto_id: string | null
          quantidade: number | null
          tipo: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          origem?: string | null
          produto_id?: string | null
          quantidade?: number | null
          tipo?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          origem?: string | null
          produto_id?: string | null
          quantidade?: number | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentacoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_produto: {
        Row: {
          created_at: string | null
          envase_id: string | null
          id: string
          lote_id: string | null
          microrganismo_id: string | null
          produto_id: string | null
          quantidade: number | null
          reservado_para_os_id: string | null
          reservado_para_os_tipo: string | null
          status: string | null
          validade: string | null
          volume_total: number | null
        }
        Insert: {
          created_at?: string | null
          envase_id?: string | null
          id?: string
          lote_id?: string | null
          microrganismo_id?: string | null
          produto_id?: string | null
          quantidade?: number | null
          reservado_para_os_id?: string | null
          reservado_para_os_tipo?: string | null
          status?: string | null
          validade?: string | null
          volume_total?: number | null
        }
        Update: {
          created_at?: string | null
          envase_id?: string | null
          id?: string
          lote_id?: string | null
          microrganismo_id?: string | null
          produto_id?: string | null
          quantidade?: number | null
          reservado_para_os_id?: string | null
          reservado_para_os_tipo?: string | null
          status?: string | null
          validade?: string | null
          volume_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_produto_envase_id_fkey"
            columns: ["envase_id"]
            isOneToOne: false
            referencedRelation: "envase"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_reservado_para_os_id_fkey"
            columns: ["reservado_para_os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      evidencias: {
        Row: {
          id: string
          mime: string | null
          owner_id: string | null
          owner_type: string | null
          storage_path: string | null
          tamanho_bytes: number | null
          url: string
        }
        Insert: {
          id?: string
          mime?: string | null
          owner_id?: string | null
          owner_type?: string | null
          storage_path?: string | null
          tamanho_bytes?: number | null
          url: string
        }
        Update: {
          id?: string
          mime?: string | null
          owner_id?: string | null
          owner_type?: string | null
          storage_path?: string | null
          tamanho_bytes?: number | null
          url?: string
        }
        Relationships: []
      }
      fazendas: {
        Row: {
          cliente_id: string | null
          id: string
          nome: string
        }
        Insert: {
          cliente_id?: string | null
          id?: string
          nome: string
        }
        Update: {
          cliente_id?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "fazendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          nome: string
          tipo: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          nome: string
          tipo?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          nome?: string
          tipo?: string | null
        }
        Relationships: []
      }
      financial_cost_centers: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      financial_documents: {
        Row: {
          created_at: string | null
          id: string
          owner_id: string | null
          owner_type: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          owner_id?: string | null
          owner_type?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          owner_id?: string | null
          owner_type?: string | null
          url?: string | null
        }
        Relationships: []
      }
      financial_settings: {
        Row: {
          chave: string | null
          created_at: string | null
          id: string
          valor: string | null
        }
        Insert: {
          chave?: string | null
          created_at?: string | null
          id?: string
          valor?: string | null
        }
        Update: {
          chave?: string | null
          created_at?: string | null
          id?: string
          valor?: string | null
        }
        Relationships: []
      }
      lotes: {
        Row: {
          codigo_lote: string | null
          created_at: string | null
          id: string
          microrganismo_id: string | null
          produto_id: string | null
          status: string | null
          validade: string | null
          volume_produzido: number | null
        }
        Insert: {
          codigo_lote?: string | null
          created_at?: string | null
          id?: string
          microrganismo_id?: string | null
          produto_id?: string | null
          status?: string | null
          validade?: string | null
          volume_produzido?: number | null
        }
        Update: {
          codigo_lote?: string | null
          created_at?: string | null
          id?: string
          microrganismo_id?: string | null
          produto_id?: string | null
          status?: string | null
          validade?: string | null
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
            foreignKeyName: "lotes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      microorganism_technical_profiles: {
        Row: {
          beneficios_agronomicos: string | null
          created_at: string | null
          cuidados_aplicacao: string | null
          explicacao_produtor: string | null
          id: string
          indicacoes_uso: string | null
          microrganismo_id: string | null
          resumo_curto: string | null
          status_validacao: string | null
        }
        Insert: {
          beneficios_agronomicos?: string | null
          created_at?: string | null
          cuidados_aplicacao?: string | null
          explicacao_produtor?: string | null
          id?: string
          indicacoes_uso?: string | null
          microrganismo_id?: string | null
          resumo_curto?: string | null
          status_validacao?: string | null
        }
        Update: {
          beneficios_agronomicos?: string | null
          created_at?: string | null
          cuidados_aplicacao?: string | null
          explicacao_produtor?: string | null
          id?: string
          indicacoes_uso?: string | null
          microrganismo_id?: string | null
          resumo_curto?: string | null
          status_validacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "microorganism_technical_profiles_microrganismo_id_fkey"
            columns: ["microrganismo_id"]
            isOneToOne: false
            referencedRelation: "microrganismos"
            referencedColumns: ["id"]
          },
        ]
      }
      microrganismos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          dose_ml_ha: number | null
          funcao_agronomica: string | null
          id: string
          nome: string
          nome_cientifico: string | null
          valor_dose_brl: number | null
          valor_litro_brl: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          dose_ml_ha?: number | null
          funcao_agronomica?: string | null
          id?: string
          nome: string
          nome_cientifico?: string | null
          valor_dose_brl?: number | null
          valor_litro_brl?: number | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          dose_ml_ha?: number | null
          funcao_agronomica?: string | null
          id?: string
          nome?: string
          nome_cientifico?: string | null
          valor_dose_brl?: number | null
          valor_litro_brl?: number | null
        }
        Relationships: []
      }
      ordens_servico: {
        Row: {
          area_hectares: number | null
          cliente_id: string | null
          created_at: string | null
          data_programada: string | null
          fazenda_id: string | null
          id: string
          partner_order_id: string | null
          produto_id: string | null
          status: string | null
          talhao_id: string | null
          volume_total_ml: number | null
        }
        Insert: {
          area_hectares?: number | null
          cliente_id?: string | null
          created_at?: string | null
          data_programada?: string | null
          fazenda_id?: string | null
          id?: string
          partner_order_id?: string | null
          produto_id?: string | null
          status?: string | null
          talhao_id?: string | null
          volume_total_ml?: number | null
        }
        Update: {
          area_hectares?: number | null
          cliente_id?: string | null
          created_at?: string | null
          data_programada?: string | null
          fazenda_id?: string | null
          id?: string
          partner_order_id?: string | null
          produto_id?: string | null
          status?: string | null
          talhao_id?: string | null
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
            foreignKeyName: "ordens_servico_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
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
          cliente_id: string | null
          created_at: string | null
          id: string
          ordem_servico_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_onfarm_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_onfarm_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      os_faturamento_base: {
        Row: {
          created_at: string | null
          id: string
          ordem_servico_id: string | null
          origem_os_tipo: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
          origem_os_tipo?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
          origem_os_tipo?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_faturamento_base_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_accounts: {
        Row: {
          codigo: string | null
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          codigo?: string | null
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          codigo?: string | null
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      partner_orders: {
        Row: {
          created_at: string | null
          id: string
          partner_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          partner_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          partner_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      portal_notifications: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          id: string
          idempotency_key: string | null
          link: string | null
          mensagem: string | null
          read: boolean | null
          source_id: string | null
          source_type: string | null
          tipo: string | null
          titulo: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          idempotency_key?: string | null
          link?: string | null
          mensagem?: string | null
          read?: boolean | null
          source_id?: string | null
          source_type?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          idempotency_key?: string | null
          link?: string | null
          mensagem?: string | null
          read?: boolean | null
          source_id?: string | null
          source_type?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_notifications_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      product_technical_profiles: {
        Row: {
          beneficio_combinado: string | null
          created_at: string | null
          cuidados_aplicacao: string | null
          explicacao_produtor: string | null
          id: string
          indicacoes_uso: string | null
          produto_id: string | null
          resumo_curto: string | null
          status_validacao: string | null
        }
        Insert: {
          beneficio_combinado?: string | null
          created_at?: string | null
          cuidados_aplicacao?: string | null
          explicacao_produtor?: string | null
          id?: string
          indicacoes_uso?: string | null
          produto_id?: string | null
          resumo_curto?: string | null
          status_validacao?: string | null
        }
        Update: {
          beneficio_combinado?: string | null
          created_at?: string | null
          cuidados_aplicacao?: string | null
          explicacao_produtor?: string | null
          id?: string
          indicacoes_uso?: string | null
          produto_id?: string | null
          resumo_curto?: string | null
          status_validacao?: string | null
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
      produto_anexos: {
        Row: {
          created_at: string | null
          id: string
          produto_id: string | null
          titulo: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          produto_id?: string | null
          titulo?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          produto_id?: string | null
          titulo?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produto_anexos_produto_id_fkey"
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
          codigo: string | null
          created_at: string | null
          descricao: string | null
          dose_ml_ha: number | null
          id: string
          nome: string
          tipo: string | null
          valor_dose_brl: number | null
          valor_ha_brl: number | null
          valor_litro_brl: number | null
        }
        Insert: {
          ativo?: boolean | null
          codigo?: string | null
          created_at?: string | null
          descricao?: string | null
          dose_ml_ha?: number | null
          id?: string
          nome: string
          tipo?: string | null
          valor_dose_brl?: number | null
          valor_ha_brl?: number | null
          valor_litro_brl?: number | null
        }
        Update: {
          ativo?: boolean | null
          codigo?: string | null
          created_at?: string | null
          descricao?: string | null
          dose_ml_ha?: number | null
          id?: string
          nome?: string
          tipo?: string | null
          valor_dose_brl?: number | null
          valor_ha_brl?: number | null
          valor_litro_brl?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean | null
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      programacao_producao: {
        Row: {
          created_at: string | null
          id: string
          ordem_servico_id: string | null
          volume_necessario: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
          volume_necessario?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ordem_servico_id?: string | null
          volume_necessario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_producao_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_consultor: {
        Row: {
          created_at: string | null
          data_registro: string | null
          id: string
          talhao_id: string | null
          tipo_manejo_agua: string | null
        }
        Insert: {
          created_at?: string | null
          data_registro?: string | null
          id?: string
          talhao_id?: string | null
          tipo_manejo_agua?: string | null
        }
        Update: {
          created_at?: string | null
          data_registro?: string | null
          id?: string
          talhao_id?: string | null
          tipo_manejo_agua?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_consultor_talhao_id_fkey"
            columns: ["talhao_id"]
            isOneToOne: false
            referencedRelation: "talhoes"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_consultor_recomendacoes: {
        Row: {
          created_at: string | null
          id: string
          recomendacao: string | null
          registro_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          recomendacao?: string | null
          registro_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          recomendacao?: string | null
          registro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_consultor_recomendacoes_registro_id_fkey"
            columns: ["registro_id"]
            isOneToOne: false
            referencedRelation: "registros_consultor"
            referencedColumns: ["id"]
          },
        ]
      }
      talhoes: {
        Row: {
          area_hectares: number | null
          ativo: boolean | null
          fazenda_id: string | null
          historico_pragas: string | null
          id: string
          latitude: number | null
          localizacao_referencia: string | null
          longitude: number | null
          nome: string
          observacoes: string | null
          tipo_manejo_agua: string | null
        }
        Insert: {
          area_hectares?: number | null
          ativo?: boolean | null
          fazenda_id?: string | null
          historico_pragas?: string | null
          id?: string
          latitude?: number | null
          localizacao_referencia?: string | null
          longitude?: number | null
          nome: string
          observacoes?: string | null
          tipo_manejo_agua?: string | null
        }
        Update: {
          area_hectares?: number | null
          ativo?: boolean | null
          fazenda_id?: string | null
          historico_pragas?: string | null
          id?: string
          latitude?: number | null
          localizacao_referencia?: string | null
          longitude?: number | null
          nome?: string
          observacoes?: string | null
          tipo_manejo_agua?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talhoes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      vw_financial_settings_flat: {
        Row: {
          require_receipt_on_payable_payment: string | null
          require_receipt_on_receivable_payment: string | null
        }
        Relationships: []
      }
      vw_schema_health: {
        Row: {
          table_name: unknown
        }
        Relationships: []
      }
    }
    Functions: {
      create_partner_order_secure: {
        Args: { _items: Json; _partner_id: string }
        Returns: string
      }
      fn_fiscal_apply_tax_v2: {
        Args: { _item_id: string; _payload: Json }
        Returns: Json
      }
      fn_run_recurring_generation: {
        Args: never
        Returns: {
          message: string
          status: string
          template_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      rpc_cancelar_etiqueta_produto: {
        Args: { p_etiqueta_id: string }
        Returns: undefined
      }
      rpc_cockpit_criar_entrega_v1: {
        Args: { _ordem_servico_id: string; _volume_total: number }
        Returns: string
      }
      rpc_cockpit_criar_visita_v1: {
        Args: { _cliente_id: string; _data_visita: string; _fazenda_id: string }
        Returns: string
      }
      rpc_cockpit_finalizar_os_v1: {
        Args: { _ordem_servico_id: string }
        Returns: undefined
      }
      rpc_create_portal_notification_secure: {
        Args: {
          p_cliente_id: string
          p_idempotency_key: string
          p_link: string
          p_mensagem: string
          p_source_id: string
          p_source_type: string
          p_tipo: string
          p_titulo: string
        }
        Returns: undefined
      }
      rpc_criar_visita_idempotente: {
        Args: {
          _cliente_id: string
          _consultor_id: string
          _data_visita: string
          _fazenda_id: string
          _idempotency_key: string
        }
        Returns: string
      }
      rpc_estoque_operar_v1: {
        Args: {
          _microrganismo_id: string
          _operacao: string
          _produto_id: string
          _quantidade: number
        }
        Returns: undefined
      }
      rpc_financeiro_conciliar_v1: {
        Args: { _baixa_id: string; _documento_id: string }
        Returns: undefined
      }
      rpc_fiscal_company_settings_init: {
        Args: never
        Returns: {
          cnpj: string
          configuration_status: string | null
          configuration_version: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          legal_name: string
          trade_name: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "company_fiscal_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_fiscal_item_readiness: {
        Args: { _item_id: string; _tipo: string }
        Returns: Json
      }
      rpc_generate_idempotency_key: { Args: never; Returns: string }
      rpc_gerar_etiqueta_produto: {
        Args: { p_lote_id: string; p_payload: Json }
        Returns: string
      }
      rpc_gerar_formulario_entrega: {
        Args: { _entrega_id: string }
        Returns: boolean
      }
      rpc_get_visita_workspace: { Args: { _visita_id: string }; Returns: Json }
      rpc_notificar_gestor: {
        Args: { p_link?: string; p_mensagem: string; p_titulo: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "administrador"
        | "tecnico_agronomo"
        | "producao"
        | "administrativo"
        | "gestor"
        | "consultor_tecnico"
      status_os:
        | "aberta"
        | "aprovada"
        | "programada"
        | "em_producao"
        | "em_cq"
        | "envase"
        | "pronto_entrega"
        | "entregue"
        | "finalizada"
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
      app_role: [
        "admin",
        "moderator",
        "user",
        "administrador",
        "tecnico_agronomo",
        "producao",
        "administrativo",
        "gestor",
        "consultor_tecnico",
      ],
      status_os: [
        "aberta",
        "aprovada",
        "programada",
        "em_producao",
        "em_cq",
        "envase",
        "pronto_entrega",
        "entregue",
        "finalizada",
      ],
    },
  },
} as const
