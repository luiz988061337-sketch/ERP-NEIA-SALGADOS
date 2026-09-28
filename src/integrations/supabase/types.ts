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
      avaliacoes: {
        Row: {
          comentario: string
          created_at: string
          id: string
          nota: number
          produto_id: string
          user_id: string
        }
        Insert: {
          comentario?: string
          created_at?: string
          id?: string
          nota: number
          produto_id: string
          user_id: string
        }
        Update: {
          comentario?: string
          created_at?: string
          id?: string
          nota?: number
          produto_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          ativo: boolean
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          ativo?: boolean
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          ativo?: boolean
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      cupons: {
        Row: {
          ativo: boolean
          codigo: string
          id: string
          minimo: number
          tipo: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          id?: string
          minimo?: number
          tipo?: string
          valor: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          id?: string
          minimo?: number
          tipo?: string
          valor?: number
        }
        Relationships: []
      }
      enderecos: {
        Row: {
          bairro: string
          complemento: string
          created_at: string
          id: string
          numero: string
          referencia: string
          rua: string
          user_id: string
        }
        Insert: {
          bairro?: string
          complemento?: string
          created_at?: string
          id?: string
          numero?: string
          referencia?: string
          rua: string
          user_id: string
        }
        Update: {
          bairro?: string
          complemento?: string
          created_at?: string
          id?: string
          numero?: string
          referencia?: string
          rua?: string
          user_id?: string
        }
        Relationships: []
      }
      favoritos: {
        Row: {
          produto_id: string
          user_id: string
        }
        Insert: {
          produto_id: string
          user_id: string
        }
        Update: {
          produto_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favoritos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          id: string
          nome: string
          pedido_id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
        }
        Insert: {
          id?: string
          nome: string
          pedido_id: string
          preco_unitario: number
          produto_id?: string | null
          quantidade?: number
        }
        Update: {
          id?: string
          nome?: string
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          aceito_em: string | null
          bairro: string
          cliente_nome: string
          complemento: string
          created_at: string
          cupom: string | null
          desconto: number
          destino_lat: number | null
          destino_lng: number | null
          endereco: string
          entregue_em: string | null
          forma_pagamento: Database["public"]["Enums"]["pagamento"]
          id: string
          motoboy_atualizado_em: string | null
          motoboy_id: string | null
          motoboy_lat: number | null
          motoboy_lng: number | null
          numero: number
          observacoes: string
          producao_status: Database["public"]["Enums"]["prod_status"]
          referencia: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          taxa_entrega: number
          taxa_motoboy: number
          telefone: string
          total: number
          user_id: string | null
        }
        Insert: {
          aceito_em?: string | null
          bairro?: string
          cliente_nome: string
          complemento?: string
          created_at?: string
          cupom?: string | null
          desconto?: number
          destino_lat?: number | null
          destino_lng?: number | null
          endereco: string
          entregue_em?: string | null
          forma_pagamento?: Database["public"]["Enums"]["pagamento"]
          id?: string
          motoboy_atualizado_em?: string | null
          motoboy_id?: string | null
          motoboy_lat?: number | null
          motoboy_lng?: number | null
          numero?: number
          observacoes?: string
          producao_status?: Database["public"]["Enums"]["prod_status"]
          referencia?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          taxa_entrega?: number
          taxa_motoboy?: number
          telefone: string
          total?: number
          user_id?: string | null
        }
        Update: {
          aceito_em?: string | null
          bairro?: string
          cliente_nome?: string
          complemento?: string
          created_at?: string
          cupom?: string | null
          desconto?: number
          destino_lat?: number | null
          destino_lng?: number | null
          endereco?: string
          entregue_em?: string | null
          forma_pagamento?: Database["public"]["Enums"]["pagamento"]
          id?: string
          motoboy_atualizado_em?: string | null
          motoboy_id?: string | null
          motoboy_lat?: number | null
          motoboy_lng?: number | null
          numero?: number
          observacoes?: string
          producao_status?: Database["public"]["Enums"]["prod_status"]
          referencia?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          taxa_entrega?: number
          taxa_motoboy?: number
          telefone?: string
          total?: number
          user_id?: string | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          categoria_id: string
          created_at: string
          descricao: string
          disponivel: boolean
          estoque: number
          id: string
          imagem_url: string | null
          nome: string
          preco: number
          preco_promocional: number | null
        }
        Insert: {
          categoria_id: string
          created_at?: string
          descricao?: string
          disponivel?: boolean
          estoque?: number
          id?: string
          imagem_url?: string | null
          nome: string
          preco: number
          preco_promocional?: number | null
        }
        Update: {
          categoria_id?: string
          created_at?: string
          descricao?: string
          disponivel?: boolean
          estoque?: number
          id?: string
          imagem_url?: string | null
          nome?: string
          preco?: number
          preco_promocional?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nome: string
          pontos: number
          telefone: string
        }
        Insert: {
          created_at?: string
          id: string
          nome?: string
          pontos?: number
          telefone?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          pontos?: number
          telefone?: string
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
    }
    Enums: {
      app_role: "admin" | "producao" | "motoboy" | "cliente"
      order_status:
        | "recebido"
        | "em_producao"
        | "pronto"
        | "aguardando_motoboy"
        | "em_rota"
        | "entregue"
        | "cancelado"
      pagamento: "pix" | "dinheiro" | "credito" | "debito"
      prod_status: "aguardando" | "produzindo" | "finalizado"
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
      app_role: ["admin", "producao", "motoboy", "cliente"],
      order_status: [
        "recebido",
        "em_producao",
        "pronto",
        "aguardando_motoboy",
        "em_rota",
        "entregue",
        "cancelado",
      ],
      pagamento: ["pix", "dinheiro", "credito", "debito"],
      prod_status: ["aguardando", "produzindo", "finalizado"],
    },
  },
} as const
