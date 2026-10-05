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
      ajuda_artigos: {
        Row: {
          ativo: boolean
          categoria: string
          corpo: string
          id: string
          titulo: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          corpo: string
          id?: string
          titulo: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          corpo?: string
          id?: string
          titulo?: string
        }
        Relationships: []
      }
      avaliacoes: {
        Row: {
          aprovada: boolean
          atendimento: number | null
          autoriza_publicar: boolean
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
          aprovada?: boolean
          atendimento?: number | null
          autoriza_publicar?: boolean
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
          aprovada?: boolean
          atendimento?: number | null
          autoriza_publicar?: boolean
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
            foreignKeyName: "avaliacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      calculadora_config: {
        Row: {
          id: boolean
          maximo_por_pessoa: number
          minimo_por_pessoa: number
          orcamento_validade_dias: number
          permitir_personalizado: boolean
          por_pessoa_padrao: number
          zap_contato: string
        }
        Insert: {
          id?: boolean
          maximo_por_pessoa?: number
          minimo_por_pessoa?: number
          orcamento_validade_dias?: number
          permitir_personalizado?: boolean
          por_pessoa_padrao?: number
          zap_contato?: string
        }
        Update: {
          id?: boolean
          maximo_por_pessoa?: number
          minimo_por_pessoa?: number
          orcamento_validade_dias?: number
          permitir_personalizado?: boolean
          por_pessoa_padrao?: number
          zap_contato?: string
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
      carrinho_eventos: {
        Row: {
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
        Relationships: [
          {
            foreignKeyName: "crm_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_events_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_events_telefone_norm_fkey"
            columns: ["telefone_norm"]
            isOneToOne: false
            referencedRelation: "crm_customers"
            referencedColumns: ["telefone_norm"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "crm_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_recipients_telefone_norm_fkey"
            columns: ["telefone_norm"]
            isOneToOne: false
            referencedRelation: "crm_customers"
            referencedColumns: ["telefone_norm"]
          },
        ]
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
      datas_demanda: {
        Row: {
          antecedencia_dias: number
          ativo: boolean
          data: string
          id: string
          mensagem: string | null
          nivel: string
          ocasiao: string
        }
        Insert: {
          antecedencia_dias?: number
          ativo?: boolean
          data: string
          id?: string
          mensagem?: string | null
          nivel?: string
          ocasiao: string
        }
        Update: {
          antecedencia_dias?: number
          ativo?: boolean
          data?: string
          id?: string
          mensagem?: string | null
          nivel?: string
          ocasiao?: string
        }
        Relationships: []
      }
      degustacao_regras: {
        Row: {
          id: boolean
          pessoas_minimas: number
          qtd_minima: number
          valor_minimo: number
        }
        Insert: {
          id?: boolean
          pessoas_minimas?: number
          qtd_minima?: number
          valor_minimo?: number
        }
        Update: {
          id?: boolean
          pessoas_minimas?: number
          qtd_minima?: number
          valor_minimo?: number
        }
        Relationships: []
      }
      degustacoes: {
        Row: {
          created_at: string
          id: string
          orcamento_id: string | null
          pedido_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          orcamento_id?: string | null
          pedido_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          orcamento_id?: string | null
          pedido_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "degustacoes_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "degustacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
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
      documento_eventos: {
        Row: {
          actor: string | null
          created_at: string
          detalhe: string
          documento_id: string
          evento: string
          id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          detalhe?: string
          documento_id: string
          evento: string
          id?: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          detalhe?: string
          documento_id?: string
          evento?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documento_eventos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_fiscais"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_fiscais: {
        Row: {
          ambiente: string
          chave_acesso: string | null
          codigo_rejeicao: string | null
          created_at: string
          danfe_url: string | null
          id: string
          mensagem_rejeicao: string | null
          modelo: string
          numero: number | null
          pedido_id: string
          protocolo: string | null
          serie: string
          status: string
          updated_at: string
          xml: string | null
        }
        Insert: {
          ambiente?: string
          chave_acesso?: string | null
          codigo_rejeicao?: string | null
          created_at?: string
          danfe_url?: string | null
          id?: string
          mensagem_rejeicao?: string | null
          modelo?: string
          numero?: number | null
          pedido_id: string
          protocolo?: string | null
          serie?: string
          status?: string
          updated_at?: string
          xml?: string | null
        }
        Update: {
          ambiente?: string
          chave_acesso?: string | null
          codigo_rejeicao?: string | null
          created_at?: string
          danfe_url?: string | null
          id?: string
          mensagem_rejeicao?: string | null
          modelo?: string
          numero?: number | null
          pedido_id?: string
          protocolo?: string | null
          serie?: string
          status?: string
          updated_at?: string
          xml?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_fiscais_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: true
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_fiscal: {
        Row: {
          ambiente: string
          atualizado_em: string
          bairro: string
          cep: string
          cidade: string
          cnpj: string
          complemento: string
          csc_id: string
          endereco: string
          id: boolean
          info_adicionais: string
          inscricao_estadual: string
          inscricao_municipal: string
          modelo_padrao: string
          nome_fantasia: string
          numero: string
          numero_inicial: number
          provedor: string
          razao_social: string
          regime_tributario: string
          serie: string
          uf: string
        }
        Insert: {
          ambiente?: string
          atualizado_em?: string
          bairro?: string
          cep?: string
          cidade?: string
          cnpj?: string
          complemento?: string
          csc_id?: string
          endereco?: string
          id?: boolean
          info_adicionais?: string
          inscricao_estadual?: string
          inscricao_municipal?: string
          modelo_padrao?: string
          nome_fantasia?: string
          numero?: string
          numero_inicial?: number
          provedor?: string
          razao_social?: string
          regime_tributario?: string
          serie?: string
          uf?: string
        }
        Update: {
          ambiente?: string
          atualizado_em?: string
          bairro?: string
          cep?: string
          cidade?: string
          cnpj?: string
          complemento?: string
          csc_id?: string
          endereco?: string
          id?: boolean
          info_adicionais?: string
          inscricao_estadual?: string
          inscricao_municipal?: string
          modelo_padrao?: string
          nome_fantasia?: string
          numero?: string
          numero_inicial?: number
          provedor?: string
          razao_social?: string
          regime_tributario?: string
          serie?: string
          uf?: string
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
        Relationships: [
          {
            foreignKeyName: "estoque_mov_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
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
      fila_fritura: {
        Row: {
          created_at: string
          fim: string | null
          funcionario: string | null
          id: string
          inicio: string | null
          pedido_id: string | null
          produto_id: string | null
          quantidade: number
          status: string
          tempo_est_s: number
          tempo_real_s: number | null
        }
        Insert: {
          created_at?: string
          fim?: string | null
          funcionario?: string | null
          id?: string
          inicio?: string | null
          pedido_id?: string | null
          produto_id?: string | null
          quantidade?: number
          status?: string
          tempo_est_s?: number
          tempo_real_s?: number | null
        }
        Update: {
          created_at?: string
          fim?: string | null
          funcionario?: string | null
          id?: string
          inicio?: string | null
          pedido_id?: string | null
          produto_id?: string | null
          quantidade?: number
          status?: string
          tempo_est_s?: number
          tempo_real_s?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fila_fritura_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fila_fritura_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      fila_impressao: {
        Row: {
          created_at: string
          id: string
          impressora: string
          imprimir_apos: string | null
          motivo_reimpressao: string | null
          payload: string
          pedido_id: string | null
          reimpressoes: number
          status: string
          tentativa: number
          tipo: string
          trabalho_uuid: string
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          impressora?: string
          imprimir_apos?: string | null
          motivo_reimpressao?: string | null
          payload?: string
          pedido_id?: string | null
          reimpressoes?: number
          status?: string
          tentativa?: number
          tipo?: string
          trabalho_uuid: string
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          impressora?: string
          imprimir_apos?: string | null
          motivo_reimpressao?: string | null
          payload?: string
          pedido_id?: string | null
          reimpressoes?: number
          status?: string
          tentativa?: number
          tipo?: string
          trabalho_uuid?: string
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fila_impressao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
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
      horario_config: {
        Row: {
          antecedencia_min: number
          id: boolean
          tempo_fritura_50s: number
          teto_unidades_janela: number
        }
        Insert: {
          antecedencia_min?: number
          id?: boolean
          tempo_fritura_50s?: number
          teto_unidades_janela?: number
        }
        Update: {
          antecedencia_min?: number
          id?: boolean
          tempo_fritura_50s?: number
          teto_unidades_janela?: number
        }
        Relationships: []
      }
      indicacoes: {
        Row: {
          codigo: string
          created_at: string
          id: string
          indicador_id: string
          novo_user_id: string | null
          pontos_indicador: number
          pontos_novo: number
          status: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          indicador_id: string
          novo_user_id?: string | null
          pontos_indicador?: number
          pontos_novo?: number
          status?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          indicador_id?: string
          novo_user_id?: string | null
          pontos_indicador?: number
          pontos_novo?: number
          status?: string
        }
        Relationships: []
      }
      jornada_eventos: {
        Row: {
          created_at: string
          etapa: string
          id: string
          pedido_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          etapa: string
          id?: string
          pedido_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          etapa?: string
          id?: string
          pedido_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jornada_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_config: {
        Row: {
          atualizado_em: string
          bairro: string
          cidade: string
          complemento: string
          endereco: string
          facebook: string
          google_avaliacao: string
          id: boolean
          instagram: string
          instrucoes_retirada: string
          mapa_lat: number | null
          mapa_lng: number | null
          nome: string
          pix_chave: string
          referencia: string
          site: string
          telefone: string
        }
        Insert: {
          atualizado_em?: string
          bairro?: string
          cidade?: string
          complemento?: string
          endereco?: string
          facebook?: string
          google_avaliacao?: string
          id?: boolean
          instagram?: string
          instrucoes_retirada?: string
          mapa_lat?: number | null
          mapa_lng?: number | null
          nome?: string
          pix_chave?: string
          referencia?: string
          site?: string
          telefone?: string
        }
        Update: {
          atualizado_em?: string
          bairro?: string
          cidade?: string
          complemento?: string
          endereco?: string
          facebook?: string
          google_avaliacao?: string
          id?: boolean
          instagram?: string
          instrucoes_retirada?: string
          mapa_lat?: number | null
          mapa_lng?: number | null
          nome?: string
          pix_chave?: string
          referencia?: string
          site?: string
          telefone?: string
        }
        Relationships: []
      }
      lotes: {
        Row: {
          codigo: string
          created_at: string
          id: string
          produto_id: string
          produzido_em: string | null
          quantidade: number
          restante: number
          status: string
          validade: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          produto_id: string
          produzido_em?: string | null
          quantidade?: number
          restante?: number
          status?: string
          validade?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          produto_id?: string
          produzido_em?: string | null
          quantidade?: number
          restante?: number
          status?: string
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
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
      motoboys: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          observacao: string
          status: string
          telefone: string
          ultima_base_em: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacao?: string
          status?: string
          telefone?: string
          ultima_base_em?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacao?: string
          status?: string
          telefone?: string
          ultima_base_em?: string | null
          user_id?: string | null
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
          cliente_nome: string
          created_at: string
          data_evento: string | null
          horario: string
          id: string
          mix: Json
          observacoes: string
          pedido_id: string | null
          pessoas: number
          status: string
          subtotal: number
          taxa_entrega: number
          telefone: string
          tipo_evento: string
          total: number
          user_id: string | null
          validade: string | null
        }
        Insert: {
          cliente_nome?: string
          created_at?: string
          data_evento?: string | null
          horario?: string
          id?: string
          mix?: Json
          observacoes?: string
          pedido_id?: string | null
          pessoas?: number
          status?: string
          subtotal?: number
          taxa_entrega?: number
          telefone?: string
          tipo_evento?: string
          total?: number
          user_id?: string | null
          validade?: string | null
        }
        Update: {
          cliente_nome?: string
          created_at?: string
          data_evento?: string | null
          horario?: string
          id?: string
          mix?: Json
          observacoes?: string
          pedido_id?: string | null
          pessoas?: number
          status?: string
          subtotal?: number
          taxa_entrega?: number
          telefone?: string
          tipo_evento?: string
          total?: number
          user_id?: string | null
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros: {
        Row: {
          autoriza_divulgacao: boolean
          bairro: string | null
          categoria: string
          cidade: string | null
          cnpj: string | null
          created_at: string
          descricao: string | null
          email: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          nome: string
          proposta: string | null
          responsavel: string | null
          site: string | null
          status: string
          whatsapp: string | null
        }
        Insert: {
          autoriza_divulgacao?: boolean
          bairro?: string | null
          categoria: string
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          descricao?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          nome: string
          proposta?: string | null
          responsavel?: string | null
          site?: string | null
          status?: string
          whatsapp?: string | null
        }
        Update: {
          autoriza_divulgacao?: boolean
          bairro?: string | null
          categoria?: string
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          descricao?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          nome?: string
          proposta?: string | null
          responsavel?: string | null
          site?: string | null
          status?: string
          whatsapp?: string | null
        }
        Relationships: []
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
      pedido_lembretes: {
        Row: {
          created_at: string
          id: string
          pedido_id: string
          status: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          pedido_id: string
          status?: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          pedido_id?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_lembretes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_notas: {
        Row: {
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
        Relationships: [
          {
            foreignKeyName: "pedido_notas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_status_historico: {
        Row: {
          actor: string | null
          created_at: string
          de_status: string | null
          id: string
          motivo: string | null
          override: boolean
          para_status: string
          pedido_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          de_status?: string | null
          id?: string
          motivo?: string | null
          override?: boolean
          para_status: string
          pedido_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          de_status?: string | null
          id?: string
          motivo?: string | null
          override?: boolean
          para_status?: string
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_status_historico_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          aceito_em: string | null
          agendado_para: string | null
          agendamento_janela: string | null
          agendamento_obs: string
          andar: string | null
          apartamento: string | null
          atrasado: boolean
          atraso_descricao: string | null
          atraso_motivo: string | null
          bairro: string
          bloco: string | null
          campanha_origem: string
          cep: string | null
          cidade: string
          cliente_nome: string
          complemento: string
          cpf_cnpj: string | null
          created_at: string
          cupom: string | null
          desconto: number
          destino_lat: number | null
          destino_lng: number | null
          endereco: string
          entregue_em: string | null
          forma_pagamento: Database["public"]["Enums"]["pagamento"]
          id: string
          impresso: boolean
          indicado_por: string | null
          interfone: string | null
          motoboy_atualizado_em: string | null
          motoboy_id: string | null
          motoboy_lat: number | null
          motoboy_lng: number | null
          nome_fiscal: string | null
          numero: number
          observacoes: string
          origem_cliente: string | null
          origem_parceiro_id: string | null
          pagamento_em: string | null
          pagamento_status: string
          pode_subir: boolean | null
          preparo_em: string | null
          problema: string | null
          producao_status: Database["public"]["Enums"]["prod_status"]
          pronto_em: string | null
          referencia: string
          rota_id: string | null
          saiu_em: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          taxa_entrega: number
          taxa_motoboy: number
          telefone: string
          tipo_entrega: string
          tipo_evento: string
          tipo_imovel: string | null
          torre: string | null
          total: number
          user_id: string | null
        }
        Insert: {
          aceito_em?: string | null
          agendado_para?: string | null
          agendamento_janela?: string | null
          agendamento_obs?: string
          andar?: string | null
          apartamento?: string | null
          atrasado?: boolean
          atraso_descricao?: string | null
          atraso_motivo?: string | null
          bairro?: string
          bloco?: string | null
          campanha_origem?: string
          cep?: string | null
          cidade?: string
          cliente_nome: string
          complemento?: string
          cpf_cnpj?: string | null
          created_at?: string
          cupom?: string | null
          desconto?: number
          destino_lat?: number | null
          destino_lng?: number | null
          endereco: string
          entregue_em?: string | null
          forma_pagamento?: Database["public"]["Enums"]["pagamento"]
          id?: string
          impresso?: boolean
          indicado_por?: string | null
          interfone?: string | null
          motoboy_atualizado_em?: string | null
          motoboy_id?: string | null
          motoboy_lat?: number | null
          motoboy_lng?: number | null
          nome_fiscal?: string | null
          numero?: number
          observacoes?: string
          origem_cliente?: string | null
          origem_parceiro_id?: string | null
          pagamento_em?: string | null
          pagamento_status?: string
          pode_subir?: boolean | null
          preparo_em?: string | null
          problema?: string | null
          producao_status?: Database["public"]["Enums"]["prod_status"]
          pronto_em?: string | null
          referencia?: string
          rota_id?: string | null
          saiu_em?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          taxa_entrega?: number
          taxa_motoboy?: number
          telefone: string
          tipo_entrega?: string
          tipo_evento?: string
          tipo_imovel?: string | null
          torre?: string | null
          total?: number
          user_id?: string | null
        }
        Update: {
          aceito_em?: string | null
          agendado_para?: string | null
          agendamento_janela?: string | null
          agendamento_obs?: string
          andar?: string | null
          apartamento?: string | null
          atrasado?: boolean
          atraso_descricao?: string | null
          atraso_motivo?: string | null
          bairro?: string
          bloco?: string | null
          campanha_origem?: string
          cep?: string | null
          cidade?: string
          cliente_nome?: string
          complemento?: string
          cpf_cnpj?: string | null
          created_at?: string
          cupom?: string | null
          desconto?: number
          destino_lat?: number | null
          destino_lng?: number | null
          endereco?: string
          entregue_em?: string | null
          forma_pagamento?: Database["public"]["Enums"]["pagamento"]
          id?: string
          impresso?: boolean
          indicado_por?: string | null
          interfone?: string | null
          motoboy_atualizado_em?: string | null
          motoboy_id?: string | null
          motoboy_lat?: number | null
          motoboy_lng?: number | null
          nome_fiscal?: string | null
          numero?: number
          observacoes?: string
          origem_cliente?: string | null
          origem_parceiro_id?: string | null
          pagamento_em?: string | null
          pagamento_status?: string
          pode_subir?: boolean | null
          preparo_em?: string | null
          problema?: string | null
          producao_status?: Database["public"]["Enums"]["prod_status"]
          pronto_em?: string | null
          referencia?: string
          rota_id?: string | null
          saiu_em?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          taxa_entrega?: number
          taxa_motoboy?: number
          telefone?: string
          tipo_entrega?: string
          tipo_evento?: string
          tipo_imovel?: string | null
          torre?: string | null
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas_entrega"
            referencedColumns: ["id"]
          },
        ]
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
      pontos_creditos: {
        Row: {
          created_at: string
          pedido_id: string
          pontos: number
          user_id: string
        }
        Insert: {
          created_at?: string
          pedido_id: string
          pontos: number
          user_id: string
        }
        Update: {
          created_at?: string
          pedido_id?: string
          pontos?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pontos_creditos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: true
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          categoria_id: string
          cest: string | null
          cfop_padrao: string | null
          created_at: string
          csosn: string | null
          cst: string | null
          custo: number | null
          descricao: string
          descricao_fiscal: string | null
          destaque: boolean
          disponivel: boolean
          embalagem_custo: number | null
          estoque: number
          estoque_maximo: number | null
          estoque_minimo: number
          gtin: string | null
          id: string
          imagem_url: string | null
          ncm: string | null
          nome: string
          origem_mercadoria: string | null
          preco: number
          preco_promocional: number | null
          promo_ativo: boolean
          promo_fim: string | null
          promo_inicio: string | null
          tempo_fritura_50s: number
          tempo_fritura_s: number | null
          tipo_venda: string
          unidade_medida: string
        }
        Insert: {
          categoria_id: string
          cest?: string | null
          cfop_padrao?: string | null
          created_at?: string
          csosn?: string | null
          cst?: string | null
          custo?: number | null
          descricao?: string
          descricao_fiscal?: string | null
          destaque?: boolean
          disponivel?: boolean
          embalagem_custo?: number | null
          estoque?: number
          estoque_maximo?: number | null
          estoque_minimo?: number
          gtin?: string | null
          id?: string
          imagem_url?: string | null
          ncm?: string | null
          nome: string
          origem_mercadoria?: string | null
          preco: number
          preco_promocional?: number | null
          promo_ativo?: boolean
          promo_fim?: string | null
          promo_inicio?: string | null
          tempo_fritura_50s?: number
          tempo_fritura_s?: number | null
          tipo_venda?: string
          unidade_medida?: string
        }
        Update: {
          categoria_id?: string
          cest?: string | null
          cfop_padrao?: string | null
          created_at?: string
          csosn?: string | null
          cst?: string | null
          custo?: number | null
          descricao?: string
          descricao_fiscal?: string | null
          destaque?: boolean
          disponivel?: boolean
          embalagem_custo?: number | null
          estoque?: number
          estoque_maximo?: number | null
          estoque_minimo?: number
          gtin?: string | null
          id?: string
          imagem_url?: string | null
          ncm?: string | null
          nome?: string
          origem_mercadoria?: string | null
          preco?: number
          preco_promocional?: number | null
          promo_ativo?: boolean
          promo_fim?: string | null
          promo_inicio?: string | null
          tempo_fritura_50s?: number
          tempo_fritura_s?: number | null
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
      reservas_estoque: {
        Row: {
          created_at: string
          id: string
          lote_id: string | null
          pedido_id: string
          produto_id: string | null
          quantidade: number
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          lote_id?: string | null
          pedido_id: string
          produto_id?: string | null
          quantidade?: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          lote_id?: string | null
          pedido_id?: string
          produto_id?: string | null
          quantidade?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_estoque_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_estoque_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      rota_pedidos: {
        Row: {
          ordem: number
          pedido_id: string
          rota_id: string
        }
        Insert: {
          ordem?: number
          pedido_id: string
          rota_id: string
        }
        Update: {
          ordem?: number
          pedido_id?: string
          rota_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rota_pedidos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_pedidos_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas_entrega"
            referencedColumns: ["id"]
          },
        ]
      }
      rotas_entrega: {
        Row: {
          chegou_em: string | null
          created_at: string
          id: string
          motoboy_id: string | null
          saiu_em: string | null
          status: string
        }
        Insert: {
          chegou_em?: string | null
          created_at?: string
          id?: string
          motoboy_id?: string | null
          saiu_em?: string | null
          status?: string
        }
        Update: {
          chegou_em?: string | null
          created_at?: string
          id?: string
          motoboy_id?: string | null
          saiu_em?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotas_entrega_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
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
      parceiros_publicos: {
        Row: {
          bairro: string | null
          categoria: string | null
          cidade: string | null
          descricao: string | null
          id: string | null
          instagram: string | null
          logo_url: string | null
          nome: string | null
          site: string | null
        }
        Insert: {
          bairro?: string | null
          categoria?: string | null
          cidade?: string | null
          descricao?: string | null
          id?: string | null
          instagram?: string | null
          logo_url?: string | null
          nome?: string | null
          site?: string | null
        }
        Update: {
          bairro?: string | null
          categoria?: string | null
          cidade?: string | null
          descricao?: string | null
          id?: string | null
          instagram?: string | null
          logo_url?: string | null
          nome?: string | null
          site?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      creditar_pontos_pedido: { Args: { p_pedido_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      liberar_reserva_atomica: {
        Args: { p_pedido_id: string }
        Returns: number
      }
      reservar_estoque_atomica: {
        Args: { p_pedido_id: string; p_produto_id: string; p_qtd: number }
        Returns: boolean
      }
      resgatar_fidelidade: { Args: { p_telefone: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "producao"
        | "motoboy"
        | "cliente"
        | "atendente"
        | "financeiro"
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
      tipo_venda: "combo_50" | "unidade"
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
        "producao",
        "motoboy",
        "cliente",
        "atendente",
        "financeiro",
      ],
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
      tipo_venda: ["combo_50", "unidade"],
    },
  },
} as const
