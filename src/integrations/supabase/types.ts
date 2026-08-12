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
      ordens_servico: {
        Row: {
          area_hectares: number | null
          cliente_id: string | null
          created_at: string | null
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
      produtos: {
        Row: {
          created_at: string | null
          dose_ml_ha: number | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          dose_ml_ha?: number | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          dose_ml_ha?: number | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      talhoes: {
        Row: {
          fazenda_id: string | null
          id: string
          nome: string
        }
        Insert: {
          fazenda_id?: string | null
          id?: string
          nome: string
        }
        Update: {
          fazenda_id?: string | null
          id?: string
          nome?: string
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      ],
    },
  },
} as const
