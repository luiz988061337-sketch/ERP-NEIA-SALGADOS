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
    PostgrestVersion: "14.17"
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
      caixa_sessoes: {
        Row: {
          aberta_em: string
          diferenca: number | null
          fechada_em: string | null
          id: string
          observacao: string
          responsavel: string | null
          saldo_informado: number | null
          saldo_inicial: number
          status: string
        }
        Insert: {
          aberta_em?: string
          diferenca?: number | null
          fechada_em?: string | null
          id?: string
          observacao?: string
          responsavel?: string | null
          saldo_informado?: number | null
          saldo_inicial?: number
          status?: string
        }
        Update: {
          aberta_em?: string
          diferenca?: number | null
          fechada_em?: string | null
          id?: string
          observacao?: string
          responsavel?: string | null
          saldo_informado?: number | null
          saldo_inicial?: number
          status?: string
        }
        Relationships: []
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
          combo_preco_unit: number | null
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          ativo?: boolean
          combo_preco_unit?: number | null
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          ativo?: boolean
          combo_preco_unit?: number | null
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      centros_custo: {
        Row: {
          ativo: boolean
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          id?: string
          nome?: string
        }
        Relationships: []
      }
      compra_itens: {
        Row: {
          compra_id: string
          custo_unitario: number
          id: string
          insumo_id: string
          quantidade: number
          quantidade_recebida: number
          unidade: string
        }
        Insert: {
          compra_id: string
          custo_unitario?: number
          id?: string
          insumo_id: string
          quantidade: number
          quantidade_recebida?: number
          unidade?: string
        }
        Update: {
          compra_id?: string
          custo_unitario?: number
          id?: string
          insumo_id?: string
          quantidade?: number
          quantidade_recebida?: number
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_itens_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          created_at: string
          created_by: string | null
          fornecedor_id: string | null
          id: string
          observacao: string
          recebida_em: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fornecedor_id?: string | null
          id?: string
          observacao?: string
          recebida_em?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fornecedor_id?: string | null
          id?: string
          observacao?: string
          recebida_em?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      contador_acessos: {
        Row: {
          acao: string
          competencia: string
          created_at: string
          id: string
          usuario: string | null
        }
        Insert: {
          acao?: string
          competencia?: string
          created_at?: string
          id?: string
          usuario?: string | null
        }
        Update: {
          acao?: string
          competencia?: string
          created_at?: string
          id?: string
          usuario?: string | null
        }
        Relationships: []
      }
      contas: {
        Row: {
          anexo_url: string
          categoria: string
          centro_custo: string
          conta_bancaria_id: string | null
          created_at: string
          created_by: string | null
          descricao: string
          fornecedor: string
          id: string
          meio: string
          pago_em: string | null
          parcela_atual: number
          parcela_total: number
          pedido_id: string | null
          recorrente: boolean
          status: string
          tipo: string
          updated_at: string
          valor: number
          valor_pago: number
          vencimento: string | null
        }
        Insert: {
          anexo_url?: string
          categoria?: string
          centro_custo?: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string
          fornecedor?: string
          id?: string
          meio?: string
          pago_em?: string | null
          parcela_atual?: number
          parcela_total?: number
          pedido_id?: string | null
          recorrente?: boolean
          status?: string
          tipo: string
          updated_at?: string
          valor?: number
          valor_pago?: number
          vencimento?: string | null
        }
        Update: {
          anexo_url?: string
          categoria?: string
          centro_custo?: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string
          fornecedor?: string
          id?: string
          meio?: string
          pago_em?: string | null
          parcela_atual?: number
          parcela_total?: number
          pedido_id?: string | null
          recorrente?: boolean
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number
          valor_pago?: number
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_bancarias: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          saldo_inicial: number
          tipo: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          saldo_inicial?: number
          tipo?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          saldo_inicial?: number
          tipo?: string
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
      documento_fiscal_itens: {
        Row: {
          cest: string | null
          cfop: string | null
          codigo_produto: string
          cofins_aliquota: number | null
          cofins_cst: string | null
          cofins_valor: number | null
          created_at: string
          descricao: string
          documento_id: string
          icms_aliquota: number | null
          icms_base: number | null
          icms_csosn: string | null
          icms_cst: string | null
          icms_origem: string | null
          icms_valor: number | null
          id: string
          inf_adicionais: string | null
          ipi_aliquota: number | null
          ipi_cst: string | null
          ipi_valor: number | null
          n_item: number
          ncm: string | null
          pis_aliquota: number | null
          pis_cst: string | null
          pis_valor: number | null
          produto_id: string | null
          quantidade: number
          unidade: string
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          cest?: string | null
          cfop?: string | null
          codigo_produto: string
          cofins_aliquota?: number | null
          cofins_cst?: string | null
          cofins_valor?: number | null
          created_at?: string
          descricao: string
          documento_id: string
          icms_aliquota?: number | null
          icms_base?: number | null
          icms_csosn?: string | null
          icms_cst?: string | null
          icms_origem?: string | null
          icms_valor?: number | null
          id?: string
          inf_adicionais?: string | null
          ipi_aliquota?: number | null
          ipi_cst?: string | null
          ipi_valor?: number | null
          n_item: number
          ncm?: string | null
          pis_aliquota?: number | null
          pis_cst?: string | null
          pis_valor?: number | null
          produto_id?: string | null
          quantidade: number
          unidade?: string
          valor_total: number
          valor_unitario: number
        }
        Update: {
          cest?: string | null
          cfop?: string | null
          codigo_produto?: string
          cofins_aliquota?: number | null
          cofins_cst?: string | null
          cofins_valor?: number | null
          created_at?: string
          descricao?: string
          documento_id?: string
          icms_aliquota?: number | null
          icms_base?: number | null
          icms_csosn?: string | null
          icms_cst?: string | null
          icms_origem?: string | null
          icms_valor?: number | null
          id?: string
          inf_adicionais?: string | null
          ipi_aliquota?: number | null
          ipi_cst?: string | null
          ipi_valor?: number | null
          n_item?: number
          ncm?: string | null
          pis_aliquota?: number | null
          pis_cst?: string | null
          pis_valor?: number | null
          produto_id?: string | null
          quantidade?: number
          unidade?: string
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "documento_fiscal_itens_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_fiscais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_fiscal_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
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
      entrega_atrasos: {
        Row: {
          criado_em: string
          criado_por: string | null
          descricao_outro: string | null
          id: string
          motivo: Database["public"]["Enums"]["atraso_motivo"]
          motoboy_id: string | null
          pedido_id: string
          resolvido_em: string | null
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          descricao_outro?: string | null
          id?: string
          motivo: Database["public"]["Enums"]["atraso_motivo"]
          motoboy_id?: string | null
          pedido_id: string
          resolvido_em?: string | null
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          descricao_outro?: string | null
          id?: string
          motivo?: Database["public"]["Enums"]["atraso_motivo"]
          motoboy_id?: string | null
          pedido_id?: string
          resolvido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_atrasos_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_atrasos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas: {
        Row: {
          dia_semana: number
          entrada: string
          funcionario_id: string
          id: string
          saida: string
        }
        Insert: {
          dia_semana: number
          entrada: string
          funcionario_id: string
          id?: string
          saida: string
        }
        Update: {
          dia_semana?: number
          entrada?: string
          funcionario_id?: string
          id?: string
          saida?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalas_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
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
      estoque_movimentacoes: {
        Row: {
          created_at: string
          id: string
          lote_id: string | null
          observacao: string | null
          processada_em: string | null
          produto_id: string
          quantidade: number
          referencia_id: string | null
          referencia_tipo: string | null
          saldo_anterior: number
          saldo_posterior: number
          tipo: Database["public"]["Enums"]["tipo_mov_estoque"]
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lote_id?: string | null
          observacao?: string | null
          processada_em?: string | null
          produto_id: string
          quantidade: number
          referencia_id?: string | null
          referencia_tipo?: string | null
          saldo_anterior: number
          saldo_posterior: number
          tipo: Database["public"]["Enums"]["tipo_mov_estoque"]
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lote_id?: string | null
          observacao?: string | null
          processada_em?: string | null
          produto_id?: string
          quantidade?: number
          referencia_id?: string | null
          referencia_tipo?: string | null
          saldo_anterior?: number
          saldo_posterior?: number
          tipo?: Database["public"]["Enums"]["tipo_mov_estoque"]
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentacoes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentacoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      extratos: {
        Row: {
          arquivo: string
          conta_bancaria_id: string | null
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          id: string
          linha: number
          referencia: string
          status: string
          valor: number
          vinculo_id: string | null
          vinculo_tipo: string
        }
        Insert: {
          arquivo?: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          descricao?: string
          id?: string
          linha?: number
          referencia?: string
          status?: string
          valor?: number
          vinculo_id?: string | null
          vinculo_tipo?: string
        }
        Update: {
          arquivo?: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          id?: string
          linha?: number
          referencia?: string
          status?: string
          valor?: number
          vinculo_id?: string | null
          vinculo_tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "extratos_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
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
      fechamentos_mensais: {
        Row: {
          competencia: string
          conferido_em: string | null
          enviado_em: string | null
          fechado_por: string | null
          obs: string
          status: string
          updated_at: string
        }
        Insert: {
          competencia: string
          conferido_em?: string | null
          enviado_em?: string | null
          fechado_por?: string | null
          obs?: string
          status?: string
          updated_at?: string
        }
        Update: {
          competencia?: string
          conferido_em?: string | null
          enviado_em?: string | null
          fechado_por?: string | null
          obs?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ficha_itens: {
        Row: {
          ficha_id: string
          id: string
          insumo_id: string
          quantidade: number
          unidade: string
        }
        Insert: {
          ficha_id: string
          id?: string
          insumo_id: string
          quantidade: number
          unidade?: string
        }
        Update: {
          ficha_id?: string
          id?: string
          insumo_id?: string
          quantidade?: number
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "ficha_itens_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_tecnicas: {
        Row: {
          id: string
          obs: string
          perda_pct: number
          por_cento: boolean
          produto_id: string
          rendimento: number
          updated_at: string
        }
        Insert: {
          id?: string
          obs?: string
          perda_pct?: number
          por_cento?: boolean
          produto_id: string
          rendimento?: number
          updated_at?: string
        }
        Update: {
          id?: string
          obs?: string
          perda_pct?: number
          por_cento?: boolean
          produto_id?: string
          rendimento?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fichas_tecnicas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: true
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
      fiscal_certificados: {
        Row: {
          ambiente: string
          atualizado_em: string
          cnpj_titular: string
          created_at: string
          empresa_id: boolean
          id: string
          nome: string
          ref_cofre: string
          senha_ref_cofre: string | null
          status: string
          tipo: string
          validade_fim: string | null
          validade_inicio: string | null
        }
        Insert: {
          ambiente?: string
          atualizado_em?: string
          cnpj_titular: string
          created_at?: string
          empresa_id?: boolean
          id?: string
          nome: string
          ref_cofre: string
          senha_ref_cofre?: string | null
          status?: string
          tipo: string
          validade_fim?: string | null
          validade_inicio?: string | null
        }
        Update: {
          ambiente?: string
          atualizado_em?: string
          cnpj_titular?: string
          created_at?: string
          empresa_id?: boolean
          id?: string
          nome?: string
          ref_cofre?: string
          senha_ref_cofre?: string | null
          status?: string
          tipo?: string
          validade_fim?: string | null
          validade_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_certificados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa_fiscal"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_provedor_config: {
        Row: {
          ambiente: string
          atualizado_em: string
          certificado_ref: string | null
          certificado_senha_ref: string | null
          contingencia_habilitada: boolean
          contingencia_tipo: string | null
          csc_id: string | null
          csc_token: string | null
          homologacao_token: string | null
          homologacao_url: string | null
          id: boolean
          producao_token: string | null
          producao_url: string | null
          provedor: string
          timeout_segundos: number
          token: string
          url_base: string
        }
        Insert: {
          ambiente?: string
          atualizado_em?: string
          certificado_ref?: string | null
          certificado_senha_ref?: string | null
          contingencia_habilitada?: boolean
          contingencia_tipo?: string | null
          csc_id?: string | null
          csc_token?: string | null
          homologacao_token?: string | null
          homologacao_url?: string | null
          id?: boolean
          producao_token?: string | null
          producao_url?: string | null
          provedor?: string
          timeout_segundos?: number
          token?: string
          url_base?: string
        }
        Update: {
          ambiente?: string
          atualizado_em?: string
          certificado_ref?: string | null
          certificado_senha_ref?: string | null
          contingencia_habilitada?: boolean
          contingencia_tipo?: string | null
          csc_id?: string | null
          csc_token?: string | null
          homologacao_token?: string | null
          homologacao_url?: string | null
          id?: boolean
          producao_token?: string | null
          producao_url?: string | null
          provedor?: string
          timeout_segundos?: number
          token?: string
          url_base?: string
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          ativo: boolean
          cnpj: string
          condicoes_pagamento: string
          contato: string
          created_at: string
          id: string
          nome: string
          prazo_entrega_dias: number
        }
        Insert: {
          ativo?: boolean
          cnpj?: string
          condicoes_pagamento?: string
          contato?: string
          created_at?: string
          id?: string
          nome: string
          prazo_entrega_dias?: number
        }
        Update: {
          ativo?: boolean
          cnpj?: string
          condicoes_pagamento?: string
          contato?: string
          created_at?: string
          id?: string
          nome?: string
          prazo_entrega_dias?: number
        }
        Relationships: []
      }
      fritura_fila: {
        Row: {
          created_at: string
          fim: string | null
          funcionario_id: string | null
          id: string
          inicio: string | null
          observacao: string | null
          pedido_id: string
          produto_id: string
          quantidade: number
          status: string
          tempo_previsto_segundos: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fim?: string | null
          funcionario_id?: string | null
          id?: string
          inicio?: string | null
          observacao?: string | null
          pedido_id: string
          produto_id: string
          quantidade: number
          status?: string
          tempo_previsto_segundos: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fim?: string | null
          funcionario_id?: string | null
          id?: string
          inicio?: string | null
          observacao?: string | null
          pedido_id?: string
          produto_id?: string
          quantidade?: number
          status?: string
          tempo_previsto_segundos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fritura_fila_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fritura_fila_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          admissao: string | null
          ativo: boolean
          contato: string
          created_at: string
          documentos: string
          funcao: string
          id: string
          nome: string
          tipo_remuneracao: string
          user_id: string | null
          valor: number
        }
        Insert: {
          admissao?: string | null
          ativo?: boolean
          contato?: string
          created_at?: string
          documentos?: string
          funcao?: string
          id?: string
          nome: string
          tipo_remuneracao?: string
          user_id?: string | null
          valor?: number
        }
        Update: {
          admissao?: string | null
          ativo?: boolean
          contato?: string
          created_at?: string
          documentos?: string
          funcao?: string
          id?: string
          nome?: string
          tipo_remuneracao?: string
          user_id?: string | null
          valor?: number
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
      insumo_lotes: {
        Row: {
          compra_id: string | null
          created_at: string
          custo_unitario: number
          fornecedor_id: string | null
          id: string
          insumo_id: string
          quantidade: number
          restante: number
          validade: string | null
        }
        Insert: {
          compra_id?: string | null
          created_at?: string
          custo_unitario?: number
          fornecedor_id?: string | null
          id?: string
          insumo_id: string
          quantidade: number
          restante: number
          validade?: string | null
        }
        Update: {
          compra_id?: string | null
          created_at?: string
          custo_unitario?: number
          fornecedor_id?: string | null
          id?: string
          insumo_id?: string
          quantidade?: number
          restante?: number
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insumo_lotes_compra_fk"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_lotes_fornecedor_fk"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_lotes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      insumo_movimentacoes: {
        Row: {
          created_at: string
          custo: number | null
          id: string
          insumo_id: string
          quantidade: number
          referencia: string
          saldo_antes: number
          saldo_depois: number
          tipo: string
          usuario: string | null
        }
        Insert: {
          created_at?: string
          custo?: number | null
          id?: string
          insumo_id: string
          quantidade: number
          referencia?: string
          saldo_antes?: number
          saldo_depois?: number
          tipo: string
          usuario?: string | null
        }
        Update: {
          created_at?: string
          custo?: number | null
          id?: string
          insumo_id?: string
          quantidade?: number
          referencia?: string
          saldo_antes?: number
          saldo_depois?: number
          tipo?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insumo_movimentacoes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          custo_medio: number
          estoque_atual: number
          estoque_minimo: number
          id: string
          nome: string
          unidade_base: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          custo_medio?: number
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome: string
          unidade_base?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          custo_medio?: number
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome?: string
          unidade_base?: string
          updated_at?: string
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
          entrega_prazo_max: number
          entrega_prazo_min: number
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
          retirada_prazo_max: number
          retirada_prazo_min: number
          site: string
          telefone: string
        }
        Insert: {
          atualizado_em?: string
          bairro?: string
          cidade?: string
          complemento?: string
          endereco?: string
          entrega_prazo_max?: number
          entrega_prazo_min?: number
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
          retirada_prazo_max?: number
          retirada_prazo_min?: number
          site?: string
          telefone?: string
        }
        Update: {
          atualizado_em?: string
          bairro?: string
          cidade?: string
          complemento?: string
          endereco?: string
          entrega_prazo_max?: number
          entrega_prazo_min?: number
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
          retirada_prazo_max?: number
          retirada_prazo_min?: number
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
      motoboy_historico: {
        Row: {
          created_at: string
          detalhe: string | null
          evento: string
          id: string
          localizacao_lat: number | null
          localizacao_lng: number | null
          motoboy_id: string
          pedido_id: string | null
          rota_id: string | null
        }
        Insert: {
          created_at?: string
          detalhe?: string | null
          evento: string
          id?: string
          localizacao_lat?: number | null
          localizacao_lng?: number | null
          motoboy_id: string
          pedido_id?: string | null
          rota_id?: string | null
        }
        Update: {
          created_at?: string
          detalhe?: string | null
          evento?: string
          id?: string
          localizacao_lat?: number | null
          localizacao_lng?: number | null
          motoboy_id?: string
          pedido_id?: string | null
          rota_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motoboy_historico_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motoboy_historico_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motoboy_historico_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      motoboys: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          observacao: string
          placa: string | null
          status: string
          telefone: string
          ultima_atualizacao: string
          ultima_base_em: string | null
          user_id: string | null
          veiculo: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacao?: string
          placa?: string | null
          status?: string
          telefone?: string
          ultima_atualizacao?: string
          ultima_base_em?: string | null
          user_id?: string | null
          veiculo?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacao?: string
          placa?: string | null
          status?: string
          telefone?: string
          ultima_atualizacao?: string
          ultima_base_em?: string | null
          user_id?: string | null
          veiculo?: string | null
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
      producao_remessas: {
        Row: {
          pedido_id: string
          indice: number
          quantidade: number
          itens: Json
          concluida_em: string | null
          concluida_por: string | null
        }
        Insert: {
          pedido_id: string
          indice: number
          quantidade: number
          itens: Json
          concluida_em?: string | null
          concluida_por?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["producao_remessas"]["Insert"]>
        Relationships: [{
          foreignKeyName: "producao_remessas_pedido_id_fkey"
          columns: ["pedido_id"]
          isOneToOne: false
          referencedRelation: "pedidos"
          referencedColumns: ["id"]
        }]
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
      pedido_status_transicoes: {
        Row: {
          de_status: Database["public"]["Enums"]["order_status"]
          para_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          de_status: Database["public"]["Enums"]["order_status"]
          para_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          de_status?: Database["public"]["Enums"]["order_status"]
          para_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: []
      }
      pedidos: {
        Row: {
          aceito_em: string | null
          aceito_em_atendente: string | null
          aceito_motoboy_em: string | null
          aceito_motoboy_por: string | null
          aceito_por: string | null
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
          conferencia_obs: string | null
          conferido_em: string | null
          conferido_por: string | null
          confirmado_em: string | null
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
          liberado_em: string | null
          liberado_por: string | null
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
          pagamento_modalidade: string
          pagamento_status: string
          pago_em: string | null
          pode_subir: boolean | null
          preparo_em: string | null
          problema: string | null
          producao_status: Database["public"]["Enums"]["prod_status"]
          pronto_em: string | null
          referencia: string
          reserva_motoboy_em: string | null
          retirado_em: string | null
          retirado_por: string | null
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
          aceito_em_atendente?: string | null
          aceito_motoboy_em?: string | null
          aceito_motoboy_por?: string | null
          aceito_por?: string | null
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
          conferencia_obs?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          confirmado_em?: string | null
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
          liberado_em?: string | null
          liberado_por?: string | null
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
          pagamento_modalidade?: string
          pagamento_status?: string
          pago_em?: string | null
          pode_subir?: boolean | null
          preparo_em?: string | null
          problema?: string | null
          producao_status?: Database["public"]["Enums"]["prod_status"]
          pronto_em?: string | null
          referencia?: string
          reserva_motoboy_em?: string | null
          retirado_em?: string | null
          retirado_por?: string | null
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
          aceito_em_atendente?: string | null
          aceito_motoboy_em?: string | null
          aceito_motoboy_por?: string | null
          aceito_por?: string | null
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
          conferencia_obs?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          confirmado_em?: string | null
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
          liberado_em?: string | null
          liberado_por?: string | null
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
          pagamento_modalidade?: string
          pagamento_status?: string
          pago_em?: string | null
          pode_subir?: boolean | null
          preparo_em?: string | null
          problema?: string | null
          producao_status?: Database["public"]["Enums"]["prod_status"]
          pronto_em?: string | null
          referencia?: string
          reserva_motoboy_em?: string | null
          retirado_em?: string | null
          retirado_por?: string | null
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
          pagamento_modalidade: string
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
          pagamento_modalidade?: string
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
          pagamento_modalidade?: string
          proxima_execucao?: string
          referencia?: string
          status?: string
          telefone?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pix_notification_events: {
        Row: {
          amount: number | null
          bank_name: string | null
          conferencia_motivo: string | null
          created_at: string
          detected_at: string
          device_id: string | null
          device_identifier: string | null
          environment: string
          event_hash: string
          id: string
          matched_order_id: string | null
          metadata: Json | null
          notification_text: string
          notification_title: string
          processed_at: string | null
          received_at: string
          reference: string | null
          sender_name: string | null
          source_app: string
          status: string
        }
        Insert: {
          amount?: number | null
          bank_name?: string | null
          conferencia_motivo?: string | null
          created_at?: string
          detected_at: string
          device_id?: string | null
          device_identifier?: string | null
          environment?: string
          event_hash: string
          id?: string
          matched_order_id?: string | null
          metadata?: Json | null
          notification_text: string
          notification_title: string
          processed_at?: string | null
          received_at?: string
          reference?: string | null
          sender_name?: string | null
          source_app: string
          status?: string
        }
        Update: {
          amount?: number | null
          bank_name?: string | null
          conferencia_motivo?: string | null
          created_at?: string
          detected_at?: string
          device_id?: string | null
          device_identifier?: string | null
          environment?: string
          event_hash?: string
          id?: string
          matched_order_id?: string | null
          metadata?: Json | null
          notification_text?: string
          notification_title?: string
          processed_at?: string | null
          received_at?: string
          reference?: string | null
          sender_name?: string | null
          source_app?: string
          status?: string
        }
        Relationships: []
      }
      pix_reader_devices: {
        Row: {
          app_version: string
          device_identifier: string
          device_name: string
          environment: string
          id: string
          last_seen_at: string
          last_sync_at: string
          registered_at: string
          revoked_at: string | null
          status: string
          token_hash: string | null
        }
        Insert: {
          app_version?: string
          device_identifier: string
          device_name: string
          environment?: string
          id?: string
          last_seen_at?: string
          last_sync_at?: string
          registered_at?: string
          revoked_at?: string | null
          status?: string
          token_hash?: string | null
        }
        Update: {
          app_version?: string
          device_identifier?: string
          device_name?: string
          environment?: string
          id?: string
          last_seen_at?: string
          last_sync_at?: string
          registered_at?: string
          revoked_at?: string | null
          status?: string
          token_hash?: string | null
        }
        Relationships: []
      }
      plano_contas: {
        Row: {
          ativo: boolean
          grupo: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          grupo?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          grupo?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      pontos: {
        Row: {
          created_at: string
          data: string
          entrada: string | null
          funcionario_id: string
          id: string
          local_info: string
          saida: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data?: string
          entrada?: string | null
          funcionario_id: string
          id?: string
          local_info?: string
          saida?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: string
          entrada?: string | null
          funcionario_id?: string
          id?: string
          local_info?: string
          saida?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pontos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
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
      precificacao_config: {
        Row: {
          custos_fixos_mensais: number
          gas_hora: number
          id: boolean
          mao_obra_hora: number
          margem_baixa_pct: number
          margem_desejada_pct: number
          taxa_credito_pct: number
          taxa_debito_pct: number
          taxa_ifood_pct: number
          taxa_pix_pct: number
          updated_at: string
          volume_mensal_estimado: number
        }
        Insert: {
          custos_fixos_mensais?: number
          gas_hora?: number
          id?: boolean
          mao_obra_hora?: number
          margem_baixa_pct?: number
          margem_desejada_pct?: number
          taxa_credito_pct?: number
          taxa_debito_pct?: number
          taxa_ifood_pct?: number
          taxa_pix_pct?: number
          updated_at?: string
          volume_mensal_estimado?: number
        }
        Update: {
          custos_fixos_mensais?: number
          gas_hora?: number
          id?: boolean
          mao_obra_hora?: number
          margem_baixa_pct?: number
          margem_desejada_pct?: number
          taxa_credito_pct?: number
          taxa_debito_pct?: number
          taxa_ifood_pct?: number
          taxa_pix_pct?: number
          updated_at?: string
          volume_mensal_estimado?: number
        }
        Relationships: []
      }
      preco_historico: {
        Row: {
          created_at: string
          id: string
          motivo: string
          preco_antigo: number
          preco_novo: number
          produto_id: string
          usuario: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          motivo?: string
          preco_antigo: number
          preco_novo: number
          produto_id: string
          usuario?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          motivo?: string
          preco_antigo?: number
          preco_novo?: number
          produto_id?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preco_historico_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
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
          tempo_fritura_base_segundos: number | null
          tempo_fritura_s: number | null
          tempo_mao_obra_min: number
          tipo_venda: string
          unidade_base_tempo_fritura: number | null
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
          tempo_fritura_base_segundos?: number | null
          tempo_fritura_s?: number | null
          tempo_mao_obra_min?: number
          tipo_venda?: string
          unidade_base_tempo_fritura?: number | null
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
          tempo_fritura_base_segundos?: number | null
          tempo_fritura_s?: number | null
          tempo_mao_obra_min?: number
          tipo_venda?: string
          unidade_base_tempo_fritura?: number | null
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string
          user_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pedido_item_componentes: {
        Row: {
          created_at: string
          id: string
          pedido_item_id: string
          produto_id: string
          quantidade: number
        }
        Insert: {
          created_at?: string
          id?: string
          pedido_item_id: string
          produto_id: string
          quantidade: number
        }
        Update: {
          created_at?: string
          id?: string
          pedido_item_id?: string
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_item_componentes_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "pedido_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_item_componentes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_consumos: {
        Row: {
          created_at: string
          funcionario_id: string
          id: string
          idem_key: string
          observacao: string | null
          pedido_id: string
          produto_id: string
          quantidade: number
          reserva_id: string
        }
        Insert: {
          created_at?: string
          funcionario_id: string
          id?: string
          idem_key: string
          observacao?: string | null
          pedido_id: string
          produto_id: string
          quantidade: number
          reserva_id: string
        }
        Update: {
          created_at?: string
          funcionario_id?: string
          id?: string
          idem_key?: string
          observacao?: string | null
          pedido_id?: string
          produto_id?: string
          quantidade?: number
          reserva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_consumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_consumos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_consumos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas_estoque"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_proveniencia: {
        Row: {
          criado_em: string
          criado_por: string | null
          estoque_movimentacao_id: string
          origem: string
          pedido_id: string
          produto_id: string
          quantidade: number
          reserva_id: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          estoque_movimentacao_id: string
          origem: string
          pedido_id: string
          produto_id: string
          quantidade: number
          reserva_id: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          estoque_movimentacao_id?: string
          origem?: string
          pedido_id?: string
          produto_id?: string
          quantidade?: number
          reserva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_proveniencia_mov_fk"
            columns: ["estoque_movimentacao_id"]
            isOneToOne: true
            referencedRelation: "estoque_movimentacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_proveniencia_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_proveniencia_reserva_fk"
            columns: ["reserva_id", "pedido_id", "produto_id", "quantidade"]
            isOneToOne: false
            referencedRelation: "reservas_estoque"
            referencedColumns: ["id", "pedido_id", "produto_id", "quantidade"]
          },
        ]
      }
      reserva_proveniencia_config: {
        Row: {
          ativado_em: string | null
          ativado_por: string | null
          controlado: boolean
          id: boolean
          observacao: string | null
        }
        Insert: {
          ativado_em?: string | null
          ativado_por?: string | null
          controlado?: boolean
          id?: boolean
          observacao?: string | null
        }
        Update: {
          ativado_em?: string | null
          ativado_por?: string | null
          controlado?: boolean
          id?: boolean
          observacao?: string | null
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
      rotas: {
        Row: {
          concluida_em: string | null
          created_at: string
          id: string
          motoboy_id: string
          observacao: string | null
          status: string
        }
        Insert: {
          concluida_em?: string | null
          created_at?: string
          id?: string
          motoboy_id: string
          observacao?: string | null
          status?: string
        }
        Update: {
          concluida_em?: string | null
          created_at?: string
          id?: string
          motoboy_id?: string
          observacao?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotas_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
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
      solicitacoes_contador: {
        Row: {
          anexo_url: string
          competencia: string
          created_at: string
          created_by: string | null
          id: string
          respondida_em: string | null
          resposta: string
          status: string
          texto: string
        }
        Insert: {
          anexo_url?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          id?: string
          respondida_em?: string | null
          resposta?: string
          status?: string
          texto?: string
        }
        Update: {
          anexo_url?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          id?: string
          respondida_em?: string | null
          resposta?: string
          status?: string
          texto?: string
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
      vales: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          descontado: boolean
          descricao: string
          funcionario_id: string
          id: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          descontado?: boolean
          descricao?: string
          funcionario_id: string
          id?: string
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          descontado?: boolean
          descricao?: string
          funcionario_id?: string
          id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "vales_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
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
      aceitar_entrega_motoboy: {
        Args: { p_pedido_id: string }
        Returns: {
          detalhe: string
          resultado: string
        }[]
      }
      aceitar_pedido_atendente: {
        Args: { p_pedido_id: string }
        Returns: {
          detalhe: string
          resultado: string
        }[]
      }
      atribuir_pedido_motoboy: {
        Args: {
          p_autorizar_extra?: boolean
          p_exigir_conferencia?: boolean
          p_motoboy_id: string
          p_pedido_id: string
        }
        Returns: {
          detalhe: string
          resultado: string
        }[]
      }
      calcular_tempo_fritura: {
        Args: { p_produto_id: string; p_quantidade: number }
        Returns: number
      }
      preparar_remessas_producao: { Args: { p_pedido_id: string }; Returns: boolean }
      concluir_remessa_producao: { Args: { p_pedido_id: string; p_indice: number }; Returns: boolean }
      conferir_remessas_producao: { Args: { p_pedido_id: string; p_confirmado: boolean }; Returns: boolean }
      conferir_pedido_cozinha: {
        Args: { p_confirmado?: boolean; p_obs?: string; p_pedido_id: string }
        Returns: {
          detalhe: string
          resultado: string
        }[]
      }
      consumir_insumos_pedido: {
        Args: { p_pedido_id: string }
        Returns: string
      }
      converter_unidade: {
        Args: { p_de: string; p_para: string; p_qtd: number }
        Returns: number
      }
      creditar_pontos_pedido: { Args: { p_pedido_id: string }; Returns: number }
      cancelar_pedido_atomico: {
        Args: { p_motivo?: string; p_pedido_id: string }
        Returns: Json
      }
      criar_pedido_com_reserva: {
        Args: { p_canal: string; p_dados: Json; p_id: string; p_itens: Json }
        Returns: Json
      }
      enfileirar_cupom: { Args: { p_pedido_id: string }; Returns: undefined }
      enfileirar_evento_cozinha: {
        Args: { p_evento: string; p_pedido_id: string }
        Returns: {
          detalhe: string
          resultado: string
        }[]
      }
      gerar_cupons_pedidos_pagos: { Args: never; Returns: string }
      gerar_msg_apartamento: { Args: { p_pedido_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      liberar_pedido_cozinha: {
        Args: { p_antecedencia_min?: number; p_pedido_id: string }
        Returns: {
          detalhe: string
          resultado: string
        }[]
      }
      liberar_pedido_atomico: { Args: { p_pedido_id: string }; Returns: Json }
      liberar_reserva_atomica: {
        Args: { p_pedido_id: string }
        Returns: number
      }
      liberar_reserva_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      receber_compra_item: {
        Args: {
          p_item_id: string
          p_qtd: number
          p_unidade: string
          p_validade?: string
        }
        Returns: undefined
      }
      pedido_cobertura_reserva: { Args: { p_pedido_id: string }; Returns: Json }
      registrar_mov_estoque:
        | {
            Args: {
              p_lote_id?: string
              p_observacao?: string
              p_produto_id: string
              p_quantidade: number
              p_referencia_id?: string
              p_referencia_tipo?: string
              p_tipo: Database["public"]["Enums"]["tipo_mov_estoque"]
              p_usuario_id?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_atualizar_estoque?: boolean
              p_lote_id?: string
              p_observacao?: string
              p_produto_id: string
              p_quantidade: number
              p_referencia_id?: string
              p_referencia_tipo?: string
              p_tipo: Database["public"]["Enums"]["tipo_mov_estoque"]
              p_usuario_id?: string
            }
            Returns: undefined
          }
      reservar_estoque_atomica: {
        Args: { p_pedido_id: string; p_produto_id: string; p_qtd: number }
        Returns: boolean
      }
      reservar_estoque_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      reservar_pedido_atomico: { Args: { p_pedido_id: string }; Returns: Json }
      resgatar_fidelidade: { Args: { p_telefone: string }; Returns: string }
      registrar_consumo_reserva: {
        Args: {
          p_idem_key: string
          p_observacao?: string
          p_produto_id?: string
          p_quantidade: number
          p_reserva_id: string
        }
        Returns: Json
      }
      retirar_pedido_cliente: {
        Args: { p_exigir_conferencia?: boolean; p_pedido_id: string }
        Returns: {
          detalhe: string
          resultado: string
        }[]
      }
      solicitar_reimpressao: {
        Args: {
          p_idempotencia?: string
          p_motivo: string
          p_pedido_id: string
          p_tipo?: string
        }
        Returns: {
          detalhe: string
          resultado: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "producao"
        | "motoboy"
        | "cliente"
        | "atendente"
        | "financeiro"
        | "contador"
      atraso_motivo:
        | "transito"
        | "chuva"
        | "veiculo"
        | "endereco"
        | "cliente_ausente"
        | "espera"
        | "acidente_bloqueio"
        | "outro"
      motoboy_status:
        | "disponivel_base"
        | "preparando_saida"
        | "em_rota"
        | "retornando_base"
        | "aguardando_nova_rota"
        | "offline"
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
      tipo_mov_estoque:
        | "entrada_producao"
        | "entrada_manual"
        | "venda"
        | "reserva"
        | "liberacao"
        | "cancelamento"
        | "perda"
        | "vencimento"
        | "ajuste"
        | "devolucao"
        | "degustacao"
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
        "contador",
      ],
      atraso_motivo: [
        "transito",
        "chuva",
        "veiculo",
        "endereco",
        "cliente_ausente",
        "espera",
        "acidente_bloqueio",
        "outro",
      ],
      motoboy_status: [
        "disponivel_base",
        "preparando_saida",
        "em_rota",
        "retornando_base",
        "aguardando_nova_rota",
        "offline",
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
      tipo_mov_estoque: [
        "entrada_producao",
        "entrada_manual",
        "venda",
        "reserva",
        "liberacao",
        "cancelamento",
        "perda",
        "vencimento",
        "ajuste",
        "devolucao",
        "degustacao",
      ],
      tipo_venda: ["combo_50", "unidade"],
    },
  },
} as const
