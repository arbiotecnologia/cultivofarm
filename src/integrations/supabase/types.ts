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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
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
      estoque_produto: {
        Row: {
          created_at: string | null
          id: string
          microrganismo_id: string | null
          produto_id: string | null
          quantidade: number | null
          validade: string | null
          volume_total: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          microrganismo_id?: string | null
          produto_id?: string | null
          quantidade?: number | null
          validade?: string | null
          volume_total?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          microrganismo_id?: string | null
          produto_id?: string | null
          quantidade?: number | null
          validade?: string | null
          volume_total?: number | null
        }
        Relationships: [
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
        ]
      }
      evidencias: {
        Row: {
          id: string
          url: string
        }
        Insert: {
          id?: string
          url: string
        }
        Update: {
          id?: string
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
          fazenda_id: string | null
          id: string
          nome: string
          tipo_manejo_agua: string | null
        }
        Insert: {
          area_hectares?: number | null
          fazenda_id?: string | null
          id?: string
          nome: string
          tipo_manejo_agua?: string | null
        }
        Update: {
          area_hectares?: number | null
          fazenda_id?: string | null
          id?: string
          nome?: string
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
      vw_schema_health: {
        Row: {
          table_name: unknown
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      rpc_create_portal_notification_secure: {
        Args: {
          _cliente_id: string
          _idempotency_key: string
          _link: string
          _mensagem: string
          _source_id: string
          _source_type: string
          _tipo: string
          _titulo: string
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
      rpc_generate_idempotency_key: { Args: never; Returns: string }
      rpc_get_visita_workspace: { Args: { _visita_id: string }; Returns: Json }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
