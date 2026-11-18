-- PROPOSTA LOCAL: somente base aditiva, sem RPC, seed, grant ou cutover.
-- Gerada da referencia versionada 0123. Nao executar remotamente.
-- Esta fase nao resolve funcoes/policies antigas nem homologa Auth/PostgREST.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=pg_catalog,public;
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial'
    OR current_user !~ '^restore_[a-f0-9]{12}$'
    OR current_setting('neia_homologacao.ensaio',true) IS DISTINCT FROM 'LFL_LOCAL_ADITIVO_0123' THEN
  RAISE EXCEPTION 'Proposta restrita ao clone local lfl_partial';
 END IF;
 IF (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')<>69 THEN
  RAISE EXCEPTION 'Baseline diferente; nao reaplicar nem corrigir automaticamente';
 END IF;
 IF (SELECT md5(string_agg(c.relname::text||':'||a.attname::text||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||':'||a.attgenerated::text,E'\n' ORDER BY c.relname COLLATE "C",a.attname COLLATE "C"))
     FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
     WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM 'e0d524146402cf56f9928d77119af765' THEN
  RAISE EXCEPTION 'Assinatura estrutural antiga diferente; revisar o delta';
 END IF;
END $$;

CREATE TYPE public.acerto_rota_status AS ENUM (
    'solicitado',
    'em_conferencia',
    'aprovado',
    'rejeitado',
    'conferido_com_divergencia'
);

CREATE TYPE public.acerto_rota_tipo AS ENUM (
    'dinheiro_produtos',
    'troco_loja',
    'troco_proprio',
    'taxa_entrega',
    'reembolso_troco',
    'compensacao',
    'divergencia'
);

CREATE TYPE public.turno_fechamento_status AS ENUM (
    'aberto',
    'pagamento_solicitado',
    'pago',
    'encerrado'
);

CREATE TYPE public.turno_fechamento_tipo AS ENUM (
    'normal',
    'vespera_natal'
);

ALTER TABLE public."produtos" ADD COLUMN "tempo_mao_obra_min" numeric(8,2) DEFAULT 0.5 NOT NULL;

ALTER TABLE public."enderecos" ADD COLUMN "lng" double precision;

ALTER TABLE public."pedidos" ADD COLUMN "endereco_place_id" text;

ALTER TABLE public."pedidos" ADD COLUMN "endereco_estado" text;

ALTER TABLE public."pedidos" ADD COLUMN "reserva_motoboy_em" timestamp with time zone;

ALTER TABLE public."pedidos" ADD COLUMN "valor_por_km_aplicado" numeric(6,2);

ALTER TABLE public."pedidos" ADD COLUMN "distancia_km" numeric(8,2);

ALTER TABLE public."enderecos" ADD COLUMN "lat" double precision;

ALTER TABLE public."pedidos" ADD COLUMN "aceito_em_atendente" timestamp with time zone;

ALTER TABLE public."enderecos" ADD COLUMN "cep" text;

ALTER TABLE public."pedidos" ADD COLUMN "retirada_por" uuid;

ALTER TABLE public."enderecos" ADD COLUMN "cidade" text;

ALTER TABLE public."pedidos" ADD COLUMN "retirado_por" uuid;

ALTER TABLE public."enderecos" ADD COLUMN "place_id" text;

ALTER TABLE public."pedidos" ADD COLUMN "entrega_snapshot" jsonb;

ALTER TABLE public."estoque_movimentacoes" ADD COLUMN "processada_em" timestamp with time zone;

ALTER TABLE public."pedidos" ADD COLUMN "conferido_por" uuid;

ALTER TABLE public."rotas_entrega" ADD COLUMN "liberacao_pedidos" uuid[];

ALTER TABLE public."pedidos" ADD COLUMN "liberado_em" timestamp with time zone;

ALTER TABLE public."enderecos" ADD COLUMN "precisao" text;

ALTER TABLE public."pedidos" ADD COLUMN "retirada_em" timestamp with time zone;

ALTER TABLE public."pedidos" ADD COLUMN "conferido_em" timestamp with time zone;

ALTER TABLE public."rotas_entrega" ADD COLUMN "liberacao_motoboy" uuid;

ALTER TABLE public."pedidos" ADD COLUMN "conferencia_obs" text;

ALTER TABLE public."pedidos" ADD COLUMN "retirado_em" timestamp with time zone;

ALTER TABLE public."enderecos" ADD COLUMN "uf" text;

ALTER TABLE public."rotas_entrega" ADD COLUMN "liberada_central_por" uuid;

ALTER TABLE public."pedidos" ADD COLUMN "aceito_por" uuid;

ALTER TABLE public."pedidos" ADD COLUMN "aceito_motoboy_em" timestamp with time zone;

ALTER TABLE public."pedidos" ADD COLUMN "liberado_por" uuid;

ALTER TABLE public."categorias" ADD COLUMN "combo_preco_unit" numeric(10,2);

ALTER TABLE public."pedidos" ADD COLUMN "retirada_rota_id" uuid;

ALTER TABLE public."pedidos" ADD COLUMN "aceito_motoboy_por" uuid;

ALTER TABLE public."pedidos" ADD COLUMN "entrega_ajuste" jsonb;

ALTER TABLE public."rotas_entrega" ADD COLUMN "liberada_central_em" timestamp with time zone;

CREATE TABLE public.acertos_motoboy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motoboy_id uuid NOT NULL,
    periodo_ini date NOT NULL,
    periodo_fim date NOT NULL,
    entregas integer DEFAULT 0 NOT NULL,
    taxas numeric(12,2) DEFAULT 0 NOT NULL,
    vales numeric(12,2) DEFAULT 0 NOT NULL,
    liquido numeric(12,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.acertos_rota (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rota_id uuid NOT NULL,
    motoboy_id uuid NOT NULL,
    user_id uuid NOT NULL,
    numero text DEFAULT ''::text NOT NULL,
    pedidos_entregues integer DEFAULT 0 NOT NULL,
    dinheiro_produtos numeric(12,2) DEFAULT 0 NOT NULL,
    pix_informativo numeric(12,2) DEFAULT 0 NOT NULL,
    dinheiro_recebido_clientes numeric(12,2) DEFAULT 0 NOT NULL,
    troco_loja numeric(12,2) DEFAULT 0 NOT NULL,
    troco_restante numeric(12,2) DEFAULT 0 NOT NULL,
    troco_proprio numeric(12,2) DEFAULT 0 NOT NULL,
    troco_utilizado numeric(12,2) DEFAULT 0 NOT NULL,
    taxas_entrega numeric(12,2) DEFAULT 0 NOT NULL,
    valor_caixa numeric(12,2) DEFAULT 0 NOT NULL,
    valor_devido_motoboy numeric(12,2) DEFAULT 0 NOT NULL,
    valor_devolver_loja numeric(12,2) DEFAULT 0 NOT NULL,
    status public.acerto_rota_status DEFAULT 'solicitado'::public.acerto_rota_status NOT NULL,
    solicitado_em timestamp with time zone DEFAULT now() NOT NULL,
    conferido_em timestamp with time zone,
    conferido_por uuid,
    aprovado_em timestamp with time zone,
    aprovado_por uuid,
    motivo text DEFAULT ''::text NOT NULL,
    chave_idempotencia text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    conferencia jsonb,
    CONSTRAINT acertos_rota_chave_idempotencia_check CHECK (((length(btrim(chave_idempotencia)) >= 1) AND (length(btrim(chave_idempotencia)) <= 160))),
    CONSTRAINT acertos_rota_dinheiro_produtos_check CHECK ((dinheiro_produtos >= (0)::numeric)),
    CONSTRAINT acertos_rota_dinheiro_recebido_clientes_check CHECK ((dinheiro_recebido_clientes >= (0)::numeric)),
    CONSTRAINT acertos_rota_pedidos_entregues_check CHECK ((pedidos_entregues >= 0)),
    CONSTRAINT acertos_rota_pix_informativo_check CHECK ((pix_informativo >= (0)::numeric)),
    CONSTRAINT acertos_rota_taxas_entrega_check CHECK ((taxas_entrega >= (0)::numeric)),
    CONSTRAINT acertos_rota_troco_loja_check CHECK ((troco_loja >= (0)::numeric)),
    CONSTRAINT acertos_rota_troco_proprio_check CHECK ((troco_proprio >= (0)::numeric)),
    CONSTRAINT acertos_rota_troco_restante_check CHECK ((troco_restante >= (0)::numeric)),
    CONSTRAINT acertos_rota_troco_utilizado_check CHECK ((troco_utilizado >= (0)::numeric)),
    CONSTRAINT acertos_rota_valor_caixa_check CHECK ((valor_caixa >= (0)::numeric)),
    CONSTRAINT acertos_rota_valor_devido_motoboy_check CHECK ((valor_devido_motoboy >= (0)::numeric)),
    CONSTRAINT acertos_rota_valor_devolver_loja_check CHECK ((valor_devolver_loja >= (0)::numeric))
);

CREATE TABLE public.acertos_rota_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    acerto_id uuid NOT NULL,
    tipo public.acerto_rota_tipo NOT NULL,
    valor_centavos bigint NOT NULL,
    forma_pagamento text DEFAULT 'dinheiro'::text NOT NULL,
    actor uuid,
    motivo text DEFAULT ''::text NOT NULL,
    chave_idempotencia text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT acertos_rota_eventos_chave_idempotencia_check CHECK (((length(btrim(chave_idempotencia)) >= 1) AND (length(btrim(chave_idempotencia)) <= 160))),
    CONSTRAINT acertos_rota_eventos_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'credito'::text, 'debito'::text, 'transferencia'::text, 'outro'::text]))),
    CONSTRAINT acertos_rota_eventos_valor_centavos_check CHECK ((valor_centavos >= 0))
);

CREATE TABLE public.caixa_sessoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aberta_em timestamp with time zone DEFAULT now() NOT NULL,
    fechada_em timestamp with time zone,
    saldo_inicial numeric(10,2) DEFAULT 0 NOT NULL,
    saldo_informado numeric(10,2),
    diferenca numeric(10,2),
    responsavel uuid,
    status text DEFAULT 'aberta'::text NOT NULL,
    observacao text DEFAULT ''::text NOT NULL,
    CONSTRAINT caixa_sessoes_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'fechada'::text])))
);

CREATE TABLE public.centros_custo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);

CREATE TABLE public.config_entrega (
    id boolean DEFAULT true NOT NULL,
    aceitar_entregas boolean DEFAULT true NOT NULL,
    valor_por_km numeric(6,2) DEFAULT 1.50 NOT NULL,
    taxa_minima_ativa boolean DEFAULT false NOT NULL,
    taxa_minima numeric(6,2) DEFAULT 0 NOT NULL,
    distancia_max_ativa boolean DEFAULT false NOT NULL,
    distancia_max_km numeric(6,2) DEFAULT 0 NOT NULL,
    gratis_ativa boolean DEFAULT false NOT NULL,
    gratis_acima numeric(8,2) DEFAULT 0 NOT NULL,
    ajuste_manual boolean DEFAULT true NOT NULL,
    origem_nome text DEFAULT ''::text NOT NULL,
    origem_logradouro text DEFAULT ''::text NOT NULL,
    origem_numero text DEFAULT ''::text NOT NULL,
    origem_complemento text DEFAULT ''::text NOT NULL,
    origem_bairro text DEFAULT ''::text NOT NULL,
    origem_cidade text DEFAULT ''::text NOT NULL,
    origem_uf text DEFAULT ''::text NOT NULL,
    origem_cep text DEFAULT ''::text NOT NULL,
    origem_lat double precision,
    origem_lng double precision,
    origem_place_id text DEFAULT ''::text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_por uuid,
    CONSTRAINT config_entrega_id_check CHECK (id)
);

CREATE TABLE public.conta_pagamento_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    tipo text NOT NULL,
    valor_centavos bigint NOT NULL,
    chave_idempotencia text NOT NULL,
    pagamento_id uuid,
    motivo text DEFAULT ''::text NOT NULL,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conta_pagamento_evento_origem_ck CHECK ((((tipo = 'pagamento'::text) AND (pagamento_id IS NULL) AND (motivo = ''::text)) OR ((tipo = 'estorno'::text) AND (pagamento_id IS NOT NULL) AND (length(btrim(motivo)) > 0)))),
    CONSTRAINT conta_pagamento_eventos_chave_idempotencia_check CHECK (((length(btrim(chave_idempotencia)) >= 1) AND (length(btrim(chave_idempotencia)) <= 160))),
    CONSTRAINT conta_pagamento_eventos_tipo_check CHECK ((tipo = ANY (ARRAY['pagamento'::text, 'estorno'::text]))),
    CONSTRAINT conta_pagamento_eventos_valor_centavos_check CHECK ((valor_centavos > 0))
);

CREATE TABLE public.contador_acessos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario uuid,
    competencia text DEFAULT ''::text NOT NULL,
    acao text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    categoria text DEFAULT ''::text NOT NULL,
    fornecedor text DEFAULT ''::text NOT NULL,
    valor numeric(10,2) DEFAULT 0 NOT NULL,
    meio text DEFAULT 'dinheiro'::text NOT NULL,
    vencimento date,
    pago_em timestamp with time zone,
    status text DEFAULT 'pendente'::text NOT NULL,
    pedido_id uuid,
    parcela_atual integer DEFAULT 1 NOT NULL,
    parcela_total integer DEFAULT 1 NOT NULL,
    recorrente boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    centro_custo text DEFAULT ''::text NOT NULL,
    conta_bancaria_id uuid,
    anexo_url text DEFAULT ''::text NOT NULL,
    valor_pago numeric(12,2) DEFAULT 0 NOT NULL,
    pagamento_abertura_centavos bigint DEFAULT 0 NOT NULL,
    CONSTRAINT contas_meio_check CHECK ((meio = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'credito'::text, 'debito'::text, 'transferencia'::text, 'outro'::text]))),
    CONSTRAINT contas_parcela_atual_check CHECK ((parcela_atual >= 1)),
    CONSTRAINT contas_parcela_total_check CHECK ((parcela_total >= 1)),
    CONSTRAINT contas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'paga'::text, 'vencida'::text, 'cancelada'::text]))),
    CONSTRAINT contas_tipo_check CHECK ((tipo = ANY (ARRAY['pagar'::text, 'receber'::text]))),
    CONSTRAINT contas_valor_check CHECK ((valor >= (0)::numeric)),
    CONSTRAINT contas_valor_pago_check CHECK ((valor_pago >= (0)::numeric))
);

CREATE TABLE public.contas_bancarias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo text DEFAULT 'banco'::text NOT NULL,
    saldo_inicial numeric(12,2) DEFAULT 0 NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contas_bancarias_tipo_check CHECK ((tipo = ANY (ARRAY['banco'::text, 'pix'::text, 'maquininha'::text, 'caixa'::text, 'outro'::text])))
);

CREATE TABLE public.escalas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    funcionario_id uuid NOT NULL,
    dia_semana integer NOT NULL,
    entrada time without time zone NOT NULL,
    saida time without time zone NOT NULL,
    CONSTRAINT escalas_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))
);

CREATE TABLE public.estoque_mov_operacoes (
    chave_idempotencia uuid NOT NULL,
    produto_id uuid NOT NULL,
    tipo text NOT NULL,
    quantidade integer NOT NULL,
    motivo text DEFAULT ''::text NOT NULL,
    movimento_id uuid NOT NULL,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT estoque_mov_operacoes_quantidade_check CHECK ((quantidade > 0)),
    CONSTRAINT estoque_mov_operacoes_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text, 'ajuste'::text, 'perda'::text, 'producao'::text])))
);

CREATE TABLE public.extratos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_bancaria_id uuid,
    arquivo text DEFAULT ''::text NOT NULL,
    linha integer DEFAULT 0 NOT NULL,
    data date NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    valor numeric(12,2) DEFAULT 0 NOT NULL,
    referencia text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    vinculo_tipo text DEFAULT ''::text NOT NULL,
    vinculo_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT extratos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'conciliado'::text, 'ignorado'::text]))),
    CONSTRAINT extratos_vinculo_tipo_check CHECK ((vinculo_tipo = ANY (ARRAY[''::text, 'pedido'::text, 'conta'::text])))
);

CREATE TABLE public.fechamentos_mensais (
    competencia text NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    enviado_em timestamp with time zone,
    conferido_em timestamp with time zone,
    fechado_por uuid,
    obs text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fechamentos_mensais_competencia_check CHECK ((competencia ~ '^[0-9]{4}-[0-9]{2}$'::text)),
    CONSTRAINT fechamentos_mensais_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'enviado'::text, 'conferido'::text, 'fechado'::text])))
);

CREATE TABLE public.funcionarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    nome text NOT NULL,
    funcao text DEFAULT ''::text NOT NULL,
    tipo_remuneracao text DEFAULT 'mensal'::text NOT NULL,
    valor numeric(12,2) DEFAULT 0 NOT NULL,
    contato text DEFAULT ''::text NOT NULL,
    documentos text DEFAULT ''::text NOT NULL,
    admissao date,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT funcionarios_tipo_remuneracao_check CHECK ((tipo_remuneracao = ANY (ARRAY['mensal'::text, 'diaria'::text]))),
    CONSTRAINT funcionarios_valor_check CHECK ((valor >= (0)::numeric))
);

CREATE TABLE public.notificacoes_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pedido_id uuid,
    status text NOT NULL,
    canal text NOT NULL,
    resultado text NOT NULL,
    mensagem text,
    telefone_norm text,
    idempotencia text NOT NULL,
    created_by uuid,
    CONSTRAINT notificacoes_log_canal_check CHECK ((canal = ANY (ARRAY['push'::text, 'whatsapp'::text]))),
    CONSTRAINT notificacoes_log_resultado_check CHECK ((resultado = ANY (ARRAY['enviado'::text, 'falhou'::text, 'desativado'::text, 'indisponivel'::text, 'simulado'::text])))
);

CREATE TABLE public.pedido_item_componentes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_item_id uuid NOT NULL,
    produto_id uuid NOT NULL,
    quantidade integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pedido_item_componentes_quantidade_check CHECK ((quantidade > 0))
);

CREATE TABLE public.pedido_pagamento_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    tipo text NOT NULL,
    valor_centavos bigint NOT NULL,
    forma_pagamento text DEFAULT 'outro'::text NOT NULL,
    chave_idempotencia text NOT NULL,
    pagamento_id uuid,
    motivo text DEFAULT ''::text NOT NULL,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pedido_pagamento_evento_origem_ck CHECK ((((tipo = 'pagamento'::text) AND (pagamento_id IS NULL) AND (motivo = ''::text)) OR ((tipo = 'estorno'::text) AND (pagamento_id IS NOT NULL) AND (length(btrim(motivo)) > 0)))),
    CONSTRAINT pedido_pagamento_eventos_chave_idempotencia_check CHECK (((length(btrim(chave_idempotencia)) >= 1) AND (length(btrim(chave_idempotencia)) <= 160))),
    CONSTRAINT pedido_pagamento_eventos_tipo_check CHECK ((tipo = ANY (ARRAY['pagamento'::text, 'estorno'::text]))),
    CONSTRAINT pedido_pagamento_eventos_valor_centavos_check CHECK ((valor_centavos > 0))
);

CREATE TABLE public.plano_contas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    grupo text DEFAULT 'despesas'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    CONSTRAINT plano_contas_grupo_check CHECK ((grupo = ANY (ARRAY['receitas'::text, 'custos_variaveis'::text, 'despesas_fixas'::text, 'impostos'::text, 'pro_labore'::text, 'investimentos'::text, 'outros'::text])))
);

CREATE TABLE public.pontos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    funcionario_id uuid NOT NULL,
    user_id uuid,
    data date DEFAULT CURRENT_DATE NOT NULL,
    entrada timestamp with time zone,
    saida timestamp with time zone,
    local_info text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.precificacao_config (
    id boolean DEFAULT true NOT NULL,
    margem_desejada_pct numeric(5,2) DEFAULT 40 NOT NULL,
    margem_baixa_pct numeric(5,2) DEFAULT 15 NOT NULL,
    mao_obra_hora numeric(10,2) DEFAULT 25 NOT NULL,
    gas_hora numeric(10,2) DEFAULT 8 NOT NULL,
    custos_fixos_mensais numeric(12,2) DEFAULT 6000 NOT NULL,
    volume_mensal_estimado integer DEFAULT 10000 NOT NULL,
    taxa_credito_pct numeric(5,2) DEFAULT 5 NOT NULL,
    taxa_debito_pct numeric(5,2) DEFAULT 2 NOT NULL,
    taxa_pix_pct numeric(5,2) DEFAULT 0 NOT NULL,
    taxa_ifood_pct numeric(5,2) DEFAULT 27 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT precificacao_config_custos_fixos_mensais_check CHECK ((custos_fixos_mensais >= (0)::numeric)),
    CONSTRAINT precificacao_config_gas_hora_check CHECK ((gas_hora >= (0)::numeric)),
    CONSTRAINT precificacao_config_mao_obra_hora_check CHECK ((mao_obra_hora >= (0)::numeric)),
    CONSTRAINT precificacao_config_margem_baixa_pct_check CHECK (((margem_baixa_pct >= (0)::numeric) AND (margem_baixa_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_margem_desejada_pct_check CHECK (((margem_desejada_pct >= (0)::numeric) AND (margem_desejada_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_taxa_credito_pct_check CHECK (((taxa_credito_pct >= (0)::numeric) AND (taxa_credito_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_taxa_debito_pct_check CHECK (((taxa_debito_pct >= (0)::numeric) AND (taxa_debito_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_taxa_ifood_pct_check CHECK (((taxa_ifood_pct >= (0)::numeric) AND (taxa_ifood_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_taxa_pix_pct_check CHECK (((taxa_pix_pct >= (0)::numeric) AND (taxa_pix_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_uma_linha CHECK ((id = true)),
    CONSTRAINT precificacao_config_volume_mensal_estimado_check CHECK ((volume_mensal_estimado > 0))
);

CREATE TABLE public.preco_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produto_id uuid NOT NULL,
    preco_antigo numeric(10,2) NOT NULL,
    preco_novo numeric(10,2) NOT NULL,
    usuario uuid,
    motivo text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.reserva_consumos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reserva_id uuid NOT NULL,
    pedido_id uuid NOT NULL,
    produto_id uuid NOT NULL,
    quantidade integer NOT NULL,
    funcionario_id uuid NOT NULL,
    idem_key uuid NOT NULL,
    observacao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reserva_consumos_quantidade_check CHECK ((quantidade > 0))
);

CREATE TABLE public.reserva_proveniencia (
    reserva_id uuid NOT NULL,
    pedido_id uuid NOT NULL,
    produto_id uuid NOT NULL,
    quantidade integer NOT NULL,
    origem text NOT NULL,
    estoque_movimentacao_id uuid NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    CONSTRAINT reserva_proveniencia_origem_check CHECK ((origem = ANY (ARRAY['0088'::text, '0089'::text]))),
    CONSTRAINT reserva_proveniencia_quantidade_check CHECK ((quantidade > 0))
);

CREATE TABLE public.reserva_proveniencia_config (
    id boolean DEFAULT true NOT NULL,
    controlado boolean DEFAULT false NOT NULL,
    ativado_em timestamp with time zone,
    ativado_por uuid,
    observacao text,
    CONSTRAINT reserva_proveniencia_config_single CHECK ((id = true))
);

CREATE TABLE public.solicitacoes_contador (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competencia text DEFAULT ''::text NOT NULL,
    texto text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'aberta'::text NOT NULL,
    resposta text DEFAULT ''::text NOT NULL,
    anexo_url text DEFAULT ''::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    respondida_em timestamp with time zone,
    CONSTRAINT solicitacoes_contador_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'respondida'::text, 'fechada'::text])))
);

CREATE TABLE public.turnos_motoboy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motoboy_id uuid NOT NULL,
    user_id uuid NOT NULL,
    data_turno date DEFAULT CURRENT_DATE NOT NULL,
    tipo public.turno_fechamento_tipo DEFAULT 'normal'::public.turno_fechamento_tipo NOT NULL,
    valor_fixo_turno numeric(12,2) DEFAULT 40.00 NOT NULL,
    taxas_entrega_acumuladas numeric(12,2) DEFAULT 0 NOT NULL,
    valor_devido_motoboy numeric(12,2) DEFAULT 0 NOT NULL,
    valor_pago numeric(12,2) DEFAULT 0 NOT NULL,
    forma_pagamento text DEFAULT 'dinheiro'::text NOT NULL,
    status public.turno_fechamento_status DEFAULT 'aberto'::public.turno_fechamento_status NOT NULL,
    solicitado_em timestamp with time zone,
    pago_em timestamp with time zone,
    encerrado_em timestamp with time zone,
    encerrado_por uuid,
    chave_idempotencia text NOT NULL,
    motivo text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pagamento_autorizado_por uuid,
    pagamento_autorizado_em timestamp with time zone,
    autorizacao_turno_referencia text,
    pagamento_referencia text,
    conta_pagamento_id uuid,
    CONSTRAINT turnos_motoboy_chave_idempotencia_check CHECK (((length(btrim(chave_idempotencia)) >= 1) AND (length(btrim(chave_idempotencia)) <= 160))),
    CONSTRAINT turnos_motoboy_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text]))),
    CONSTRAINT turnos_motoboy_taxas_entrega_acumuladas_check CHECK ((taxas_entrega_acumuladas >= (0)::numeric)),
    CONSTRAINT turnos_motoboy_valor_devido_motoboy_check CHECK ((valor_devido_motoboy >= (0)::numeric)),
    CONSTRAINT turnos_motoboy_valor_fixo_turno_check CHECK ((valor_fixo_turno >= (0)::numeric)),
    CONSTRAINT turnos_motoboy_valor_pago_check CHECK ((valor_pago >= (0)::numeric))
);

CREATE TABLE public.turnos_motoboy_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    turno_id uuid NOT NULL,
    tipo text NOT NULL,
    valor_centavos bigint NOT NULL,
    forma_pagamento text DEFAULT 'dinheiro'::text NOT NULL,
    actor uuid,
    motivo text DEFAULT ''::text NOT NULL,
    chave_idempotencia text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT turnos_motoboy_eventos_chave_idempotencia_check CHECK (((length(btrim(chave_idempotencia)) >= 1) AND (length(btrim(chave_idempotencia)) <= 160))),
    CONSTRAINT turnos_motoboy_eventos_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text]))),
    CONSTRAINT turnos_motoboy_eventos_tipo_check CHECK ((tipo = ANY (ARRAY['abertura'::text, 'solicitacao_pagamento'::text, 'pagamento'::text, 'encerramento'::text]))),
    CONSTRAINT turnos_motoboy_eventos_valor_centavos_check CHECK ((valor_centavos >= 0))
);

CREATE TABLE public.vales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    funcionario_id uuid NOT NULL,
    valor numeric(12,2) NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    descontado boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vales_valor_check CHECK ((valor > (0)::numeric))
);

ALTER TABLE public."pedidos" ADD CONSTRAINT "pedidos_aceito_motoboy_por_fkey" FOREIGN KEY (aceito_motoboy_por) REFERENCES auth.users(id);

ALTER TABLE public."produtos" ADD CONSTRAINT "produtos_tempo_mao_obra_min_check" CHECK ((tempo_mao_obra_min >= (0)::numeric));

ALTER TABLE public."pedidos" ADD CONSTRAINT "pedidos_aceito_por_fkey" FOREIGN KEY (aceito_por) REFERENCES auth.users(id);

ALTER TABLE public."pedidos" ADD CONSTRAINT "pedidos_liberado_por_fkey" FOREIGN KEY (liberado_por) REFERENCES auth.users(id);

ALTER TABLE public."pedidos" ADD CONSTRAINT "pedidos_conferido_por_fkey" FOREIGN KEY (conferido_por) REFERENCES auth.users(id);

ALTER TABLE public."pedidos" ADD CONSTRAINT "pedidos_retirado_por_fkey" FOREIGN KEY (retirado_por) REFERENCES auth.users(id);

ALTER TABLE public."reservas_estoque" ADD CONSTRAINT "reservas_estoque_prov_uk" UNIQUE (id, pedido_id, produto_id, quantidade);

ALTER TABLE public."categorias" ADD CONSTRAINT "categorias_combo_preco_unit_check" CHECK (((combo_preco_unit IS NULL) OR (combo_preco_unit >= (0)::numeric)));

ALTER TABLE public."pedidos" ADD CONSTRAINT "pedidos_retirada_por_fkey" FOREIGN KEY (retirada_por) REFERENCES auth.users(id);

ALTER TABLE public."pedidos" ADD CONSTRAINT "pedidos_retirada_rota_id_fkey" FOREIGN KEY (retirada_rota_id) REFERENCES rotas_entrega(id);

ALTER TABLE public."rotas_entrega" ADD CONSTRAINT "rotas_entrega_liberada_central_por_fkey" FOREIGN KEY (liberada_central_por) REFERENCES auth.users(id);

ALTER TABLE public."rotas_entrega" ADD CONSTRAINT "rotas_entrega_liberacao_motoboy_fkey" FOREIGN KEY (liberacao_motoboy) REFERENCES motoboys(id);

ALTER TABLE ONLY public.acertos_motoboy
    ADD CONSTRAINT acertos_motoboy_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.acertos_rota
    ADD CONSTRAINT acertos_rota_chave_idempotencia_key UNIQUE (chave_idempotencia);

ALTER TABLE ONLY public.acertos_rota_eventos
    ADD CONSTRAINT acertos_rota_eventos_chave_idempotencia_key UNIQUE (chave_idempotencia);

ALTER TABLE ONLY public.acertos_rota_eventos
    ADD CONSTRAINT acertos_rota_eventos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.acertos_rota
    ADD CONSTRAINT acertos_rota_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.caixa_sessoes
    ADD CONSTRAINT caixa_sessoes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.config_entrega
    ADD CONSTRAINT config_entrega_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conta_pagamento_eventos
    ADD CONSTRAINT conta_pagamento_eventos_chave_idempotencia_key UNIQUE (chave_idempotencia);

ALTER TABLE ONLY public.conta_pagamento_eventos
    ADD CONSTRAINT conta_pagamento_eventos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contador_acessos
    ADD CONSTRAINT contador_acessos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contas_bancarias
    ADD CONSTRAINT contas_bancarias_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT escalas_funcionario_id_dia_semana_key UNIQUE (funcionario_id, dia_semana);

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT escalas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.estoque_mov_operacoes
    ADD CONSTRAINT estoque_mov_operacoes_pkey PRIMARY KEY (chave_idempotencia);

ALTER TABLE ONLY public.extratos
    ADD CONSTRAINT extratos_conta_bancaria_id_referencia_key UNIQUE (conta_bancaria_id, referencia);

ALTER TABLE ONLY public.extratos
    ADD CONSTRAINT extratos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fechamentos_mensais
    ADD CONSTRAINT fechamentos_mensais_pkey PRIMARY KEY (competencia);

ALTER TABLE ONLY public.funcionarios
    ADD CONSTRAINT funcionarios_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notificacoes_log
    ADD CONSTRAINT notificacoes_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pedido_item_componentes
    ADD CONSTRAINT pedido_item_componentes_item_produto_key UNIQUE (pedido_item_id, produto_id);

ALTER TABLE ONLY public.pedido_item_componentes
    ADD CONSTRAINT pedido_item_componentes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pedido_pagamento_eventos
    ADD CONSTRAINT pedido_pagamento_eventos_chave_idempotencia_key UNIQUE (chave_idempotencia);

ALTER TABLE ONLY public.pedido_pagamento_eventos
    ADD CONSTRAINT pedido_pagamento_eventos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pontos
    ADD CONSTRAINT pontos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.precificacao_config
    ADD CONSTRAINT precificacao_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.preco_historico
    ADD CONSTRAINT preco_historico_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reserva_consumos
    ADD CONSTRAINT reserva_consumos_idem_key_key UNIQUE (idem_key);

ALTER TABLE ONLY public.reserva_consumos
    ADD CONSTRAINT reserva_consumos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reserva_proveniencia_config
    ADD CONSTRAINT reserva_proveniencia_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reserva_proveniencia
    ADD CONSTRAINT reserva_proveniencia_mov_uk UNIQUE (estoque_movimentacao_id);

ALTER TABLE ONLY public.reserva_proveniencia
    ADD CONSTRAINT reserva_proveniencia_pkey PRIMARY KEY (reserva_id);

ALTER TABLE ONLY public.solicitacoes_contador
    ADD CONSTRAINT solicitacoes_contador_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.turnos_motoboy
    ADD CONSTRAINT turnos_motoboy_chave_idempotencia_key UNIQUE (chave_idempotencia);

ALTER TABLE ONLY public.turnos_motoboy_eventos
    ADD CONSTRAINT turnos_motoboy_eventos_chave_idempotencia_key UNIQUE (chave_idempotencia);

ALTER TABLE ONLY public.turnos_motoboy_eventos
    ADD CONSTRAINT turnos_motoboy_eventos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.turnos_motoboy
    ADD CONSTRAINT turnos_motoboy_motoboy_id_data_turno_key UNIQUE (motoboy_id, data_turno);

ALTER TABLE ONLY public.turnos_motoboy
    ADD CONSTRAINT turnos_motoboy_pkey PRIMARY KEY (id);

ALTER TABLE public.turnos_motoboy
    ADD CONSTRAINT turnos_motoboy_tipo_data_chk CHECK (((tipo = 'vespera_natal'::public.turno_fechamento_tipo) = ((EXTRACT(month FROM data_turno) = (12)::numeric) AND (EXTRACT(day FROM data_turno) = (24)::numeric)))) NOT VALID;

ALTER TABLE ONLY public.vales
    ADD CONSTRAINT vales_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.acertos_motoboy
    ADD CONSTRAINT acertos_motoboy_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.acertos_rota
    ADD CONSTRAINT acertos_rota_aprovado_por_fkey FOREIGN KEY (aprovado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.acertos_rota
    ADD CONSTRAINT acertos_rota_conferido_por_fkey FOREIGN KEY (conferido_por) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.acertos_rota_eventos
    ADD CONSTRAINT acertos_rota_eventos_acerto_id_fkey FOREIGN KEY (acerto_id) REFERENCES public.acertos_rota(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.acertos_rota_eventos
    ADD CONSTRAINT acertos_rota_eventos_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.acertos_rota
    ADD CONSTRAINT acertos_rota_rota_id_fkey FOREIGN KEY (rota_id) REFERENCES public.rotas_entrega(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.acertos_rota
    ADD CONSTRAINT acertos_rota_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.caixa_sessoes
    ADD CONSTRAINT caixa_sessoes_responsavel_fkey FOREIGN KEY (responsavel) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conta_pagamento_eventos
    ADD CONSTRAINT conta_pagamento_eventos_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conta_pagamento_eventos
    ADD CONSTRAINT conta_pagamento_eventos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.conta_pagamento_eventos
    ADD CONSTRAINT conta_pagamento_eventos_pagamento_id_fkey FOREIGN KEY (pagamento_id) REFERENCES public.conta_pagamento_eventos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.contador_acessos
    ADD CONSTRAINT contador_acessos_usuario_fkey FOREIGN KEY (usuario) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES public.contas_bancarias(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT escalas_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.estoque_mov_operacoes
    ADD CONSTRAINT estoque_mov_operacoes_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.estoque_mov_operacoes
    ADD CONSTRAINT estoque_mov_operacoes_movimento_id_fkey FOREIGN KEY (movimento_id) REFERENCES public.estoque_mov(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.estoque_mov_operacoes
    ADD CONSTRAINT estoque_mov_operacoes_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.extratos
    ADD CONSTRAINT extratos_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES public.contas_bancarias(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.extratos
    ADD CONSTRAINT extratos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fechamentos_mensais
    ADD CONSTRAINT fechamentos_mensais_fechado_por_fkey FOREIGN KEY (fechado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.funcionarios
    ADD CONSTRAINT funcionarios_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notificacoes_log
    ADD CONSTRAINT notificacoes_log_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notificacoes_log
    ADD CONSTRAINT notificacoes_log_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.pedido_item_componentes
    ADD CONSTRAINT pedido_item_componentes_pedido_item_id_fkey FOREIGN KEY (pedido_item_id) REFERENCES public.pedido_itens(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pedido_item_componentes
    ADD CONSTRAINT pedido_item_componentes_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.pedido_pagamento_eventos
    ADD CONSTRAINT pedido_pagamento_eventos_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.pedido_pagamento_eventos
    ADD CONSTRAINT pedido_pagamento_eventos_pagamento_id_fkey FOREIGN KEY (pagamento_id) REFERENCES public.pedido_pagamento_eventos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.pedido_pagamento_eventos
    ADD CONSTRAINT pedido_pagamento_eventos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.pontos
    ADD CONSTRAINT pontos_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pontos
    ADD CONSTRAINT pontos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.preco_historico
    ADD CONSTRAINT preco_historico_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.preco_historico
    ADD CONSTRAINT preco_historico_usuario_fkey FOREIGN KEY (usuario) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reserva_consumos
    ADD CONSTRAINT reserva_consumos_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.reserva_consumos
    ADD CONSTRAINT reserva_consumos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.reserva_consumos
    ADD CONSTRAINT reserva_consumos_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.reserva_consumos
    ADD CONSTRAINT reserva_consumos_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES public.reservas_estoque(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.reserva_proveniencia_config
    ADD CONSTRAINT reserva_proveniencia_config_ativado_por_fkey FOREIGN KEY (ativado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reserva_proveniencia
    ADD CONSTRAINT reserva_proveniencia_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reserva_proveniencia
    ADD CONSTRAINT reserva_proveniencia_mov_fk FOREIGN KEY (estoque_movimentacao_id) REFERENCES public.estoque_movimentacoes(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.reserva_proveniencia
    ADD CONSTRAINT reserva_proveniencia_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.reserva_proveniencia
    ADD CONSTRAINT reserva_proveniencia_reserva_fk FOREIGN KEY (reserva_id, pedido_id, produto_id, quantidade) REFERENCES public.reservas_estoque(id, pedido_id, produto_id, quantidade) ON DELETE RESTRICT;

ALTER TABLE ONLY public.solicitacoes_contador
    ADD CONSTRAINT solicitacoes_contador_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.turnos_motoboy
    ADD CONSTRAINT turnos_motoboy_conta_pagamento_id_fkey FOREIGN KEY (conta_pagamento_id) REFERENCES public.contas(id);

ALTER TABLE ONLY public.turnos_motoboy
    ADD CONSTRAINT turnos_motoboy_encerrado_por_fkey FOREIGN KEY (encerrado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.turnos_motoboy_eventos
    ADD CONSTRAINT turnos_motoboy_eventos_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.turnos_motoboy_eventos
    ADD CONSTRAINT turnos_motoboy_eventos_turno_id_fkey FOREIGN KEY (turno_id) REFERENCES public.turnos_motoboy(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.turnos_motoboy
    ADD CONSTRAINT turnos_motoboy_pagamento_autorizado_por_fkey FOREIGN KEY (pagamento_autorizado_por) REFERENCES auth.users(id);

ALTER TABLE ONLY public.turnos_motoboy
    ADD CONSTRAINT turnos_motoboy_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vales
    ADD CONSTRAINT vales_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vales
    ADD CONSTRAINT vales_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;

ALTER TABLE public."turnos_motoboy" VALIDATE CONSTRAINT "turnos_motoboy_tipo_data_chk";

ALTER TABLE public."acertos_motoboy" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."acertos_motoboy" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."acertos_rota" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."acertos_rota" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."acertos_rota_eventos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."acertos_rota_eventos" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."caixa_sessoes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."caixa_sessoes" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."centros_custo" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."centros_custo" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."config_entrega" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."config_entrega" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."conta_pagamento_eventos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."conta_pagamento_eventos" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."contador_acessos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."contador_acessos" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."contas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."contas" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."contas_bancarias" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."contas_bancarias" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."escalas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."escalas" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."estoque_mov_operacoes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."estoque_mov_operacoes" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."extratos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."extratos" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."fechamentos_mensais" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."fechamentos_mensais" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."funcionarios" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."funcionarios" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."notificacoes_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."notificacoes_log" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."pedido_item_componentes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."pedido_item_componentes" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."pedido_pagamento_eventos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."pedido_pagamento_eventos" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."plano_contas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."plano_contas" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."pontos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."pontos" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."precificacao_config" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."precificacao_config" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."preco_historico" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."preco_historico" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."reserva_consumos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."reserva_consumos" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."reserva_proveniencia" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."reserva_proveniencia" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."reserva_proveniencia_config" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."reserva_proveniencia_config" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."solicitacoes_contador" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."solicitacoes_contador" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."turnos_motoboy" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."turnos_motoboy" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."turnos_motoboy_eventos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."turnos_motoboy_eventos" FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public."vales" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."vales" FROM PUBLIC,anon,authenticated,service_role;

-- O executor local escolhe COMMIT ou ROLLBACK em arquivo separado.
