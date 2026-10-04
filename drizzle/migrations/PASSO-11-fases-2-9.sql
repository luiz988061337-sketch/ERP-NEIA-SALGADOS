-- PASSO-11: fases 2-9 (0023 a 028 em um arquivo so)


-- ============ 0023_base_operacional.sql ============
-- 0023: base operacional â€” histÃ³rico, lotes FEFO, reservas, horÃ¡rio/capacidade
-- Idempotente. Rode no SQL Editor APÃ“S 0022.

-- HistÃ³rico/timeline de status (override auditado: quem, quando, de, para, motivo)
CREATE TABLE IF NOT EXISTS public.pedido_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  de_status text,
  para_status text NOT NULL,
  actor uuid REFERENCES auth.users(id),
  motivo text,
  override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pedido_hist_pedido_idx ON public.pedido_status_historico (pedido_id);

-- Flags operacionais no pedido (atraso Ã© ALERTA, nÃ£o apaga estÃ¡gio real)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS atrasado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS problema text,
  ADD COLUMN IF NOT EXISTS agendamento_janela text,
  ADD COLUMN IF NOT EXISTS preparo_em timestamptz,
  ADD COLUMN IF NOT EXISTS pronto_em timestamptz,
  ADD COLUMN IF NOT EXISTS saiu_em timestamptz;

-- Lotes e validade (FEFO)
CREATE TABLE IF NOT EXISTS public.lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  quantidade integer NOT NULL DEFAULT 0,
  restante integer NOT NULL DEFAULT 0,
  produzido_em date,
  validade date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','esgotado','vencido')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id, codigo)
);
CREATE INDEX IF NOT EXISTS lotes_prod_validade_idx ON public.lotes (produto_id, validade);

-- Reservas de estoque (confirmaÃ§Ã£o reserva, cancelamento libera)
CREATE TABLE IF NOT EXISTS public.reservas_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  quantidade integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','liberada','consumida','cancelada')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservas_pedido_idx ON public.reservas_estoque (pedido_id);

-- MovimentaÃ§Ãµes: garantir tipos novos nunca quebram CHECK antigo -> sem CHECK, sÃ³ texto
-- (estoque_mov.tipo jÃ¡ Ã© texto livre nas migrations)

-- Config de horÃ¡rio/capacidade (singleton id=true)
CREATE TABLE IF NOT EXISTS public.horario_config (
  id boolean PRIMARY KEY DEFAULT true,
  antecedencia_min integer NOT NULL DEFAULT 30,
  teto_unidades_janela integer NOT NULL DEFAULT 2000,
  tempo_fritura_50s integer NOT NULL DEFAULT 210,
  CONSTRAINT horario_config_single CHECK (id = true)
);
INSERT INTO public.horario_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.pedido_status_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hist dono/staff" ON public.pedido_status_historico;
CREATE POLICY "hist dono/staff" ON public.pedido_status_historico FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente') OR public.has_role(auth.uid(), 'financeiro') OR public.has_role(auth.uid(), 'motoboy')))
);
DROP POLICY IF EXISTS "hist staff insert" ON public.pedido_status_historico;
CREATE POLICY "hist staff insert" ON public.pedido_status_historico FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente')
);

DROP POLICY IF EXISTS "lotes staff" ON public.lotes;
CREATE POLICY "lotes staff" ON public.lotes FOR ALL USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente')
);
DROP POLICY IF EXISTS "lotes public read" ON public.lotes;
CREATE POLICY "lotes public read" ON public.lotes FOR SELECT USING (true);

DROP POLICY IF EXISTS "reservas staff" ON public.reservas_estoque;
CREATE POLICY "reservas staff" ON public.reservas_estoque FOR ALL USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente') OR public.has_role(auth.uid(), 'financeiro')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente') OR public.has_role(auth.uid(), 'financeiro')
);

DROP POLICY IF EXISTS "horario public read" ON public.horario_config;
CREATE POLICY "horario public read" ON public.horario_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "horario admin write" ON public.horario_config;
CREATE POLICY "horario admin write" ON public.horario_config FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Grants (evita 42501 mesmo com RLS ok)
GRANT ALL ON public.pedido_status_historico TO authenticated;
GRANT ALL ON public.lotes TO authenticated;
GRANT ALL ON public.reservas_estoque TO authenticated;
GRANT ALL ON public.horario_config TO authenticated;
GRANT SELECT ON public.pedido_status_historico, public.lotes, public.horario_config TO anon;


-- ============ 0024_entrega.sql ============
-- 0024: entrega â€” status motoboy, rotas, atrasos, endereÃ§o estruturado
-- Idempotente. Rode APÃ“S 0023.

CREATE TABLE IF NOT EXISTS public.rotas_entrega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id uuid REFERENCES public.motoboys(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'preparando' CHECK (status IN ('preparando','em_rota','concluida','cancelada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  saiu_em timestamptz,
  chegou_em timestamptz
);

CREATE TABLE IF NOT EXISTS public.rota_pedidos (
  rota_id uuid NOT NULL REFERENCES public.rotas_entrega(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 1,
  PRIMARY KEY (rota_id, pedido_id)
);

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS atraso_motivo text,
  ADD COLUMN IF NOT EXISTS atraso_descricao text,
  ADD COLUMN IF NOT EXISTS pode_subir boolean,
  ADD COLUMN IF NOT EXISTS tipo_imovel text,
  ADD COLUMN IF NOT EXISTS bloco text,
  ADD COLUMN IF NOT EXISTS apartamento text,
  ADD COLUMN IF NOT EXISTS interfone text,
  ADD COLUMN IF NOT EXISTS rota_id uuid REFERENCES public.rotas_entrega(id) ON DELETE SET NULL;

ALTER TABLE public.motoboys
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'disponivel_base',
  ADD COLUMN IF NOT EXISTS ultima_base_em timestamptz;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_atraso_motivo_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_atraso_motivo_check CHECK (
  atraso_motivo IS NULL OR atraso_motivo IN ('transito','chuva_via','problema_veiculo','endereco_dificil','problema_endereco','cliente_ausente','espera','acidente_bloqueio','outro')
);

ALTER TABLE public.rotas_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rota_pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rotas staff" ON public.rotas_entrega;
CREATE POLICY "rotas staff" ON public.rotas_entrega FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'producao')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'producao')
);
DROP POLICY IF EXISTS "rota_pedidos staff" ON public.rota_pedidos;
CREATE POLICY "rota_pedidos staff" ON public.rota_pedidos FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'producao')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'producao')
);
GRANT ALL ON public.rotas_entrega, public.rota_pedidos TO authenticated;


-- ============ 0025_impressao.sql ============
-- 0025: impressÃ£o â€” fila, logs, anti-duplicidade, status de impressÃ£o
-- Idempotente. Rode APÃ“S 0024.

CREATE TABLE IF NOT EXISTS public.fila_impressao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabalho_uuid text NOT NULL UNIQUE,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'pedido' CHECK (tipo IN ('pedido','teste','ficha_cozinha')),
  payload text NOT NULL DEFAULT '',
  impressora text NOT NULL DEFAULT 'Tanca TP-550',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviando','impresso','erro','cancelado')),
  tentativa integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  reimpressoes integer NOT NULL DEFAULT 0,
  motivo_reimpressao text,
  imprimir_apos timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fila_status_idx ON public.fila_impressao (status);

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS impresso boolean NOT NULL DEFAULT false;

ALTER TABLE public.fila_impressao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fila staff" ON public.fila_impressao;
CREATE POLICY "fila staff" ON public.fila_impressao FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
);
GRANT ALL ON public.fila_impressao TO authenticated;


-- ============ 0026_cozinha.sql ============
-- 0026: cozinha â€” fritura, sons/config, tempo por produto
-- Idempotente. Rode APÃ“S 0025.

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS tempo_fritura_50s integer NOT NULL DEFAULT 210;

CREATE TABLE IF NOT EXISTS public.fila_fritura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  quantidade integer NOT NULL DEFAULT 50,
  tempo_est_s integer NOT NULL DEFAULT 210,
  inicio timestamptz,
  fim timestamptz,
  tempo_real_s integer,
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','fritando','pronto','cancelado')),
  funcionario text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fritura_status_idx ON public.fila_fritura (status);

ALTER TABLE public.fila_fritura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fritura staff" ON public.fila_fritura;
CREATE POLICY "fritura staff" ON public.fila_fritura FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
);
GRANT ALL ON public.fila_fritura TO authenticated;


-- ============ 0027_lembretes.sql ============
-- 0027: comunicaÃ§Ã£o â€” lembretes de pedidos futuros, sem auto-cancelar
-- Idempotente. Rode APÃ“S 0026.

CREATE TABLE IF NOT EXISTS public.pedido_lembretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('7d','3d','24h','dia')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','confirmado','alterado','cancelado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_id, tipo)
);
ALTER TABLE public.pedido_lembretes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lembretes staff" ON public.pedido_lembretes;
CREATE POLICY "lembretes staff" ON public.pedido_lembretes FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'producao')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'producao')
);
GRANT ALL ON public.pedido_lembretes TO authenticated;


-- ============ 0028_crm_experiencia.sql ============
-- 0028: CRM/fidelidade â€” jornada, indicaÃ§Ã£o, parceiros, degustaÃ§Ã£o, avaliaÃ§Ãµes pÃºblicas, ajuda, alta demanda
-- Idempotente. Rode APÃ“S 0027.

-- Jornada (um evento por linha, sem vigilÃ¢ncia invasiva: sÃ³ eventos do funil)
CREATE TABLE IF NOT EXISTS public.jornada_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  etapa text NOT NULL CHECK (etapa IN ('visitou','visualizou','favoritou','adicionou_carrinho','iniciou_checkout','comprou','recebeu','avaliou','voltou')),
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Origem sÃ³ no primeiro pedido (coluna jÃ¡ existe campanha_origem; garantir parceiro/indicador)
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS origem_parceiro_id uuid;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS indicado_por uuid REFERENCES auth.users(id);

-- IndicaÃ§Ãµes (cÃ³digo por cliente)
CREATE TABLE IF NOT EXISTS public.indicacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo text NOT NULL UNIQUE,
  novo_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pontos_indicador integer NOT NULL DEFAULT 0,
  pontos_novo integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','valida','fraude','cancelada')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- DegustaÃ§Ã£o: SÃ“ depois do orÃ§amento (Â§4), elegibilidade configurÃ¡vel
CREATE TABLE IF NOT EXISTS public.degustacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orcamento_id uuid REFERENCES public.orcamentos(id) ON DELETE SET NULL,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada','em_analise','aprovada','agendada','preparar','pronta','realizada','recusada','cancelada','nao_compareceu')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.degustacao_regras (
  id boolean PRIMARY KEY DEFAULT true,
  qtd_minima integer NOT NULL DEFAULT 500,
  valor_minimo numeric NOT NULL DEFAULT 500,
  pessoas_minimas integer NOT NULL DEFAULT 30,
  CONSTRAINT deg_single CHECK (id = true)
);
INSERT INTO public.degustacao_regras (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Parceiros (sem comissÃ£o automÃ¡tica; indicaÃ§Ã£o futura)
CREATE TABLE IF NOT EXISTS public.parceiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL, categoria text NOT NULL, cidade text, bairro text,
  instagram text, site text, whatsapp text, descricao text, logo_url text,
  status text NOT NULL DEFAULT 'nova' CHECK (status IN ('nova','em_analise','aprovada','recusada','contatada','convertida')),
  responsavel text, email text, cnpj text, proposta text, autoriza_divulgacao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ajuda (central + busca por categoria)
CREATE TABLE IF NOT EXISTS public.ajuda_artigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL, titulo text NOT NULL, corpo text NOT NULL, ativo boolean NOT NULL DEFAULT true
);

-- Alta demanda (avisos progressivos 10/7/3d, nunca inventar sem config)
CREATE TABLE IF NOT EXISTS public.datas_demanda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocasiao text NOT NULL, data date NOT NULL, mensagem text, antecedencia_dias integer NOT NULL DEFAULT 10,
  nivel text NOT NULL DEFAULT 'alta', ativo boolean NOT NULL DEFAULT true
);

-- AvaliaÃ§Ãµes pÃºblicas: flag de moderaÃ§Ã£o (coluna nova, default exige aprovaÃ§Ã£o)
ALTER TABLE public.avaliacoes ADD COLUMN IF NOT EXISTS autoriza_publicar boolean NOT NULL DEFAULT false;
ALTER TABLE public.avaliacoes ADD COLUMN IF NOT EXISTS aprovada boolean NOT NULL DEFAULT false;

-- RLS mÃ­nimo
ALTER TABLE public.jornada_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.degustacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.degustacao_regras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajuda_artigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datas_demanda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jornada own/admin" ON public.jornada_eventos;
CREATE POLICY "jornada own/admin" ON public.jornada_eventos FOR ALL USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "indicacoes own/admin" ON public.indicacoes;
CREATE POLICY "indicacoes own/admin" ON public.indicacoes FOR ALL USING (indicador_id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (indicador_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "degustacoes own/staff" ON public.degustacoes;
CREATE POLICY "degustacoes own/staff" ON public.degustacoes FOR ALL USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'));
DROP POLICY IF EXISTS "regras read" ON public.degustacao_regras;
CREATE POLICY "regras read" ON public.degustacao_regras FOR SELECT USING (true);
DROP POLICY IF EXISTS "regras admin" ON public.degustacao_regras;
CREATE POLICY "regras admin" ON public.degustacao_regras FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "parceiros read" ON public.parceiros;
CREATE POLICY "parceiros read" ON public.parceiros FOR SELECT USING (true);
DROP POLICY IF EXISTS "parceiros write" ON public.parceiros;
CREATE POLICY "parceiros write" ON public.parceiros FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "ajuda read" ON public.ajuda_artigos;
CREATE POLICY "ajuda read" ON public.ajuda_artigos FOR SELECT USING (true);
DROP POLICY IF EXISTS "ajuda admin" ON public.ajuda_artigos;
CREATE POLICY "ajuda admin" ON public.ajuda_artigos FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "datas read" ON public.datas_demanda;
CREATE POLICY "datas read" ON public.datas_demanda FOR SELECT USING (true);
DROP POLICY IF EXISTS "datas admin" ON public.datas_demanda;
CREATE POLICY "datas admin" ON public.datas_demanda FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

GRANT ALL ON public.jornada_eventos, public.indicacoes, public.degustacoes, public.degustacao_regras, public.parceiros, public.ajuda_artigos, public.datas_demanda TO authenticated;
GRANT SELECT ON public.parceiros, public.ajuda_artigos, public.datas_demanda TO anon;

-- Seed ajuda mÃ­nima (categorias do Â§41)
INSERT INTO public.ajuda_artigos (categoria, titulo, corpo) VALUES
 ('pedidos','Como acompanhar meu pedido?','Abra Conta â†’ Meus pedidos ou o link do pedido. Os status mostram preparaÃ§Ã£o, saÃ­da e entrega.'),
 ('combos','Por que combos sÃ£o de 50 em 50?','Combos de festa sÃ£o produzidos em caixas de 50. O carrinho arredonda para 50, 100, 150â€¦ Congelados e bebidas vendem por unidade.'),
 ('entrega','Entrega ou retirada?','Entrega tem taxa e vai com motoboy. Retirada Ã© na loja, sem taxa, com endereÃ§o e mapa no pedido.'),
 ('pagamento','Como pago?','PIX com QR/Copia e Cola, dinheiro, crÃ©dito ou dÃ©bito. O pagamento comeÃ§a pendente e a loja confirma.'),
 ('agendamento','Posso agendar?','Sim, Segâ€“SÃ¡b 08â€“12h e 13â€“22h (nunca 12â€“13h, Dom fechado), com 30min de antecedÃªncia.')
ON CONFLICT DO NOTHING;

