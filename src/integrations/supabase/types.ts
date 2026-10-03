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
          atendimento: number | null
          comentario: string
          created_at: string
          id: string
          nota: number
          pedido_id: string | null
          prazo: number | null
          produto_id: string
          user_id: string
        }
        Insert: {
          atendimento?: number | null
          comentario?: string
          created_at?: string
          id?: string
          nota: number
          pedido_id?: string | null
          prazo?: number | null
          produto_id: string
          user_id: string
        }
        Update: {
          atendimento?: number | null
          comentario?: string
          created_at?: string
          id?: string
          nota?: number
          pedido_id?: string | null
          prazo?: number | null
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
          cliente_telefone: string
          codigo: string
          id: string
          max_usos: number
          minimo: number
          produtos_ids: Json
          tipo: string
          validade_fim: string | null
          validade_ini: string | null
          valor: number
        }
        Insert: {
          ativo?: boolean
          cliente_telefone?: string
          codigo: string
          id?: string
          max_usos?: number
          minimo?: number
          produtos_ids?: Json
          tipo?: string
          validade_fim?: string | null
          validade_ini?: string | null
          valor: number
        }
        Update: {
          ativo?: boolean
          cliente_telefone?: string
          codigo?: string
          id?: string
          max_usos?: number
          minimo?: number
          produtos_ids?: Json
          tipo?: string
          validade_fim?: string | null
          validade_ini?: string | null
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
          agendado_para: string | null
          agendamento_obs: string
          bairro: string
          cidade: string
          cliente_nome: string
          campanha_origem: string
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
          tipo_entrega: string
          tipo_evento: string
          total: number
          user_id: string | null
        }
        Insert: {
          aceito_em?: string | null
          agendado_para?: string | null
          agendamento_obs?: string
          bairro?: string
          cidade?: string
          cliente_nome: string
          campanha_origem?: string
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
          tipo_entrega?: string
          tipo_evento?: string
          total?: number
          user_id?: string | null
        }
        Update: {
          aceito_em?: string | null
          agendado_para?: string | null
          agendamento_obs?: string
          bairro?: string
          cidade?: string
          cliente_nome?: string
          campanha_origem?: string
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
          tipo_entrega?: string
          tipo_evento?: string
          total?: number
          user_id?: string | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          categoria_id: string
          created_at: string
          custo: number | null
          descricao: string
          destaque: boolean
          disponivel: boolean
          estoque: number
          estoque_maximo: number | null
          estoque_minimo: number
          id: string
          imagem_url: string | null
          nome: string
          preco: number
          preco_promocional: number | null
          promo_ativo: boolean
          promo_fim: string | null
          promo_inicio: string | null
          tipo_venda: string
          unidade_medida: string
        }
        Insert: {
          categoria_id: string
          created_at?: string
          custo?: number | null
          descricao?: string
          destaque?: boolean
          disponivel?: boolean
          estoque?: number
          estoque_maximo?: number | null
          estoque_minimo?: number
          id?: string
          imagem_url?: string | null
          nome: string
          preco: number
          preco_promocional?: number | null
          promo_ativo?: boolean
          promo_fim?: string | null
          promo_inicio?: string | null
          tipo_venda?: string
          unidade_medida?: string
        }
        Update: {
          categoria_id?: string
          created_at?: string
          custo?: number | null
          descricao?: string
          destaque?: boolean
          disponivel?: boolean
          estoque?: number
          estoque_maximo?: number | null
          estoque_minimo?: number
          id?: string
          imagem_url?: string | null
          nome?: string
          preco?: number
          preco_promocional?: number | null
          promo_ativo?: boolean
          promo_fim?: string | null
          promo_inicio?: string | null
          tipo_venda?: string
          unidade_medida?: string
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
      admin_logs: {
        Row: {
          acao: string
          actor: string | null
          created_at: string
          detalhe: string
          id: string
        }
        Insert: {
          acao: string
          actor?: string | null
          created_at?: string
          detalhe?: string
          id?: string
        }
        Update: {
          acao?: string
          actor?: string | null
          created_at?: string
          detalhe?: string
          id?: string
        }
        Relationships: []
      }
      hero_carousel: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          imagem_url: string
          legenda: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          imagem_url: string
          legenda?: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          imagem_url?: string
          legenda?: string
          ordem?: number
        }
        Relationships: []
      }
      calculadora_config: {
        Row: {
          id: boolean
          permitir_personalizado: boolean
          por_pessoa_padrao: number
          minimo_por_pessoa: number
          maximo_por_pessoa: number
          zap_contato: string
          orcamento_validade_dias: number
        }
        Insert: {
          id?: boolean
          permitir_personalizado?: boolean
          por_pessoa_padrao?: number
          minimo_por_pessoa?: number
          maximo_por_pessoa?: number
          zap_contato?: string
          orcamento_validade_dias?: number
        }
        Update: {
          id?: boolean
          permitir_personalizado?: boolean
          por_pessoa_padrao?: number
          minimo_por_pessoa?: number
          maximo_por_pessoa?: number
          zap_contato?: string
          orcamento_validade_dias?: number
        }
        Relationships: []
      }
      motoboys: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          observacao: string
          telefone: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacao?: string
          telefone?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacao?: string
          telefone?: string
        }
        Relationships: []
      }
      campanha_cliques: {
        Row: {
          created_at: string
          id: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug?: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
        }
        Relationships: []
      }
      carrinho_eventos: {        Row: {
          created_at: string
          etapa: string
          id: string
          itens: Json
          subtotal: number
          telefone: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          etapa?: string
          id?: string
          itens?: Json
          subtotal?: number
          telefone?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          etapa?: string
          id?: string
          itens?: Json
          subtotal?: number
          telefone?: string
          user_id?: string | null
        }
        Relationships: []
      }
      crm_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          filtros: Json
          id: string
          link_rastreavel: string
          mensagem_template: string
          nome: string
          segmento: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filtros?: Json
          id?: string
          link_rastreavel?: string
          mensagem_template?: string
          nome: string
          segmento?: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filtros?: Json
          id?: string
          link_rastreavel?: string
          mensagem_template?: string
          nome?: string
          segmento?: string
          status?: string
        }
        Relationships: []
      }
      crm_customers: {
        Row: {
          bairro: string
          cidade: string
          cnpj: string
          created_at: string
          data_nascimento: string | null
          email: string
          endereco_recente: string
          nome: string
          nome_fantasia: string
          notas: string
          opt_out: boolean
          razao_social: string
          responsavel: string
          telefone_norm: string
          tipo_cliente: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bairro?: string
          cidade?: string
          cnpj?: string
          created_at?: string
          data_nascimento?: string | null
          email?: string
          endereco_recente?: string
          nome?: string
          nome_fantasia?: string
          notas?: string
          opt_out?: boolean
          razao_social?: string
          responsavel?: string
          telefone_norm: string
          tipo_cliente?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bairro?: string
          cidade?: string
          cnpj?: string
          created_at?: string
          data_nascimento?: string | null
          email?: string
          endereco_recente?: string
          nome?: string
          nome_fantasia?: string
          notas?: string
          opt_out?: boolean
          razao_social?: string
          responsavel?: string
          telefone_norm?: string
          tipo_cliente?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      crm_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          meta: Json
          pedido_id: string | null
          telefone_norm: string
          tipo: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          pedido_id?: string | null
          telefone_norm: string
          tipo: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          pedido_id?: string | null
          telefone_norm?: string
          tipo?: string
        }
        Relationships: []
      }
      crm_recipients: {
        Row: {
          campaign_id: string
          motivo: string
          nome_snapshot: string
          sent_at: string | null
          status: string
          telefone_norm: string
          variaveis: Json
        }
        Insert: {
          campaign_id: string
          motivo?: string
          nome_snapshot?: string
          sent_at?: string | null
          status?: string
          telefone_norm: string
          variaveis?: Json
        }
        Update: {
          campaign_id?: string
          motivo?: string
          nome_snapshot?: string
          sent_at?: string | null
          status?: string
          telefone_norm?: string
          variaveis?: Json
        }
        Relationships: []
      }
      crm_settings: {
        Row: {
          ativo_ate_dias: number
          campanhas_habilitadas: boolean
          carrinho_recuperacao_ativa: boolean
          fid_ativo: boolean
          fid_meta_pontos: number
          fid_reais_por_ponto: number
          fid_recompensa_valor: number
          freq_min_pedidos: number
          id: boolean
          inativo_apos_dias: number
          intervalo_min_campanhas_dias: number
          mensagem_padrao: string
          muito_inativo_apos_dias: number
          recompra_ativa: boolean
          risco_apos_dias: number
          sugestoes_ativas: boolean
          vip_min_pedidos: number
          vip_min_valor: number
        }
        Insert: {
          ativo_ate_dias?: number
          campanhas_habilitadas?: boolean
          carrinho_recuperacao_ativa?: boolean
          fid_ativo?: boolean
          fid_meta_pontos?: number
          fid_reais_por_ponto?: number
          fid_recompensa_valor?: number
          freq_min_pedidos?: number
          id?: boolean
          inativo_apos_dias?: number
          intervalo_min_campanhas_dias?: number
          mensagem_padrao?: string
          muito_inativo_apos_dias?: number
          recompra_ativa?: boolean
          risco_apos_dias?: number
          sugestoes_ativas?: boolean
          vip_min_pedidos?: number
          vip_min_valor?: number
        }
        Update: {
          ativo_ate_dias?: number
          campanhas_habilitadas?: boolean
          carrinho_recuperacao_ativa?: boolean
          fid_ativo?: boolean
          fid_meta_pontos?: number
          fid_reais_por_ponto?: number
          fid_recompensa_valor?: number
          freq_min_pedidos?: number
          id?: boolean
          inativo_apos_dias?: number
          intervalo_min_campanhas_dias?: number
          mensagem_padrao?: string
          muito_inativo_apos_dias?: number
          recompra_ativa?: boolean
          risco_apos_dias?: number
          sugestoes_ativas?: boolean
          vip_min_pedidos?: number
          vip_min_valor?: number
        }
        Relationships: []
      }
      despesas: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          id: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          id?: string
          valor?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          id?: string
          valor?: number
        }
        Relationships: []
      }
      estoque_mov: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          motivo: string
          produto_id: string
          quantidade: number
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string
          produto_id: string
          quantidade?: number
          tipo?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string
          produto_id?: string
          quantidade?: number
          tipo?: string
        }
        Relationships: []
      }
      pedidos_recorrentes: {
        Row: {
          bairro: string
          cidade: string
          cliente_nome: string
          complemento: string
          created_at: string
          endereco: string
          forma_pagamento: string
          frequencia: string
          id: string
          itens: Json
          modo_confirmacao: string
          proxima_execucao: string
          referencia: string
          status: string
          telefone: string
          user_id: string | null
        }
        Insert: {
          bairro?: string
          cidade?: string
          cliente_nome?: string
          complemento?: string
          created_at?: string
          endereco?: string
          forma_pagamento?: string
          frequencia?: string
          id?: string
          itens?: Json
          modo_confirmacao?: string
          proxima_execucao?: string
          referencia?: string
          status?: string
          telefone?: string
          user_id?: string | null
        }
        Update: {
          bairro?: string
          cidade?: string
          cliente_nome?: string
          complemento?: string
          created_at?: string
          endereco?: string
          forma_pagamento?: string
          frequencia?: string
          id?: string
          itens?: Json
          modo_confirmacao?: string
          proxima_execucao?: string
          referencia?: string
          status?: string
          telefone?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pedido_notas: {        Row: {
          autor: string | null
          created_at: string
          id: string
          pedido_id: string
          texto: string
          visivel_cliente: boolean
        }
        Insert: {
          autor?: string | null
          created_at?: string
          id?: string
          pedido_id: string
          texto?: string
          visivel_cliente?: boolean
        }
        Update: {
          autor?: string | null
          created_at?: string
          id?: string
          pedido_id?: string
          texto?: string
          visivel_cliente?: boolean
        }
        Relationships: []
      }
      metas: {        Row: {
          created_at: string
          created_by: string | null
          id: string
          periodo_ref: string
          tipo: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          periodo_ref?: string
          tipo?: string
          valor?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          periodo_ref?: string
          tipo?: string
          valor?: number
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          created_at: string
          detalhe: string
          id: string
          lida: boolean
          link: string
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          detalhe?: string
          id?: string
          lida?: boolean
          link?: string
          tipo?: string
          titulo?: string
        }
        Update: {
          created_at?: string
          detalhe?: string
          id?: string
          lida?: boolean
          link?: string
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      orcamentos: {
        Row: {
          created_at: string
          horario: string
          data_evento: string | null
          id: string
          mix: Json
          observacoes: string
          pedido_id: string | null
          pessoas: number
          status: string
          subtotal: number
          taxa_entrega: number
          telefone: string
          cliente_nome: string
          tipo_evento: string
          total: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          horario?: string
          data_evento?: string | null
          id?: string
          mix?: Json
          observacoes?: string
          pedido_id?: string | null
          pessoas?: number
          status?: string
          subtotal?: number
          taxa_entrega?: number
          telefone?: string
          cliente_nome?: string
          tipo_evento?: string
          total?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          horario?: string
          data_evento?: string | null
          id?: string
          mix?: Json
          observacoes?: string
          pedido_id?: string | null
          pessoas?: number
          status?: string
          subtotal?: number
          taxa_entrega?: number
          telefone?: string
          cliente_nome?: string
          tipo_evento?: string
          total?: number
          user_id?: string | null
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
      app_role: "admin" | "producao" | "motoboy" | "cliente" | "atendente" | "financeiro"
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
      app_role: ["admin", "producao", "motoboy", "cliente", "atendente", "financeiro"],
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
