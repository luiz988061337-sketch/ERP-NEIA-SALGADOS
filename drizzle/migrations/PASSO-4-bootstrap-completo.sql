-- ============================================================================
-- PASSO 4 - BOOTSTRAP COMPLETO (gerado por scripts/gerar-bootstrap.mjs)
-- Aplica drizzle/migrations/0000..0018 nessa ordem.
-- Cada arquivo roda em uma sub-transacao propria: se um falhar, os OUTROS
-- continuam e o erro aparece como WARNING no painel de mensagens.
-- Pode rodar quantas vezes quiser.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0000_neia_salgados_schema.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- ENUMS
DO $t$
BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'producao', 'motoboy', 'cliente', 'atendente', 'financeiro');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;
DO $t$
BEGIN
  CREATE TYPE public.order_status AS ENUM ('recebido', 'em_producao', 'pronto', 'aguardando_motoboy', 'em_rota', 'entregue', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;
DO $t$
BEGIN
  CREATE TYPE public.prod_status AS ENUM ('aguardando', 'produzindo', 'finalizado');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;
DO $t$
BEGIN
  CREATE TYPE public.pagamento AS ENUM ('pix', 'dinheiro', 'credito', 'debito');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  pontos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "roles select own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- new user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, telefone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome',''), COALESCE(NEW.raw_user_meta_data->>'telefone',''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cliente') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ENDERECOS
CREATE TABLE public.enderecos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rua text NOT NULL,
  numero text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  complemento text NOT NULL DEFAULT '',
  referencia text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enderecos TO authenticated;
GRANT ALL ON public.enderecos TO service_role;
ALTER TABLE public.enderecos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enderecos own" ON public.enderecos FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- CATEGORIAS
CREATE TABLE public.categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.categorias TO anon, authenticated;
GRANT ALL ON public.categorias TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.categorias TO authenticated;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categorias public read" ON public.categorias FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "categorias admin write" ON public.categorias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PRODUTOS
CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  preco numeric(10,2) NOT NULL,
  preco_promocional numeric(10,2),
  imagem_url text,
  disponivel boolean NOT NULL DEFAULT true,
  estoque integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.produtos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos public read" ON public.produtos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "produtos admin write" ON public.produtos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- CUPONS
CREATE TABLE public.cupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  tipo text NOT NULL DEFAULT 'percentual',
  valor numeric(10,2) NOT NULL,
  minimo numeric(10,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.cupons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cupons TO authenticated;
GRANT ALL ON public.cupons TO service_role;
ALTER TABLE public.cupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cupons read ativos" ON public.cupons FOR SELECT TO anon, authenticated USING (ativo = true);
CREATE POLICY "cupons admin write" ON public.cupons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PEDIDOS
CREATE SEQUENCE public.pedido_numero_seq START 1001;
CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL DEFAULT nextval('public.pedido_numero_seq'),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL,
  telefone text NOT NULL,
  endereco text NOT NULL,
  bairro text NOT NULL DEFAULT '',
  complemento text NOT NULL DEFAULT '',
  referencia text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  forma_pagamento public.pagamento NOT NULL DEFAULT 'pix',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 0,
  desconto numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  cupom text,
  status public.order_status NOT NULL DEFAULT 'recebido',
  producao_status public.prod_status NOT NULL DEFAULT 'aguardando',
  motoboy_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  taxa_motoboy numeric(10,2) NOT NULL DEFAULT 6.00,
  destino_lat double precision,
  destino_lng double precision,
  motoboy_lat double precision,
  motoboy_lng double precision,
  motoboy_atualizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  aceito_em timestamptz,
  entregue_em timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.pedidos TO authenticated;
GRANT ALL ON public.pedidos TO service_role;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pedidos select" ON public.pedidos FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'producao')
  OR (public.has_role(auth.uid(),'motoboy') AND (motoboy_id = auth.uid() OR (motoboy_id IS NULL AND status IN ('pronto','aguardando_motoboy'))))
);
CREATE POLICY "pedidos insert own" ON public.pedidos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pedidos update staff" ON public.pedidos FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'producao')
  OR (public.has_role(auth.uid(),'motoboy') AND (motoboy_id = auth.uid() OR motoboy_id IS NULL))
  OR (user_id = auth.uid() AND status = 'recebido')
);

-- ITENS
CREATE TABLE public.pedido_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  nome text NOT NULL,
  preco_unitario numeric(10,2) NOT NULL,
  quantidade integer NOT NULL DEFAULT 1
);
GRANT SELECT, INSERT ON public.pedido_itens TO authenticated;
GRANT ALL ON public.pedido_itens TO service_role;
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itens select" ON public.pedido_itens FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id)
);
CREATE POLICY "itens insert" ON public.pedido_itens FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.user_id = auth.uid())
);

-- AVALIACOES
CREATE TABLE public.avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nota integer NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id, user_id)
);
GRANT SELECT ON public.avaliacoes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.avaliacoes TO authenticated;
GRANT ALL ON public.avaliacoes TO service_role;
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avaliacoes public read" ON public.avaliacoes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "avaliacoes own write" ON public.avaliacoes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- FAVORITOS
CREATE TABLE public.favoritos (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, produto_id)
);
GRANT SELECT, INSERT, DELETE ON public.favoritos TO authenticated;
GRANT ALL ON public.favoritos TO service_role;
ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favoritos own" ON public.favoritos FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;

-- SEED
INSERT INTO public.categorias (nome, slug, ordem) VALUES
 ('Mini Fritos','mini-fritos',1),
 ('Mini Assados','mini-assados',2),
 ('Mini Pastéis','mini-pasteis',3),
 ('Mini Pizzas','mini-pizzas',4),
 ('Mini Empadinhas','mini-empadinhas',5),
 ('Mini Congelados','mini-congelados',6),
 ('Kits para Festa','kits-para-festa',7),
 ('Bebidas','bebidas',8);

INSERT INTO public.produtos (categoria_id, nome, descricao, preco, preco_promocional)
SELECT c.id, v.nome, v.descricao, v.preco, v.promo FROM public.categorias c
JOIN (VALUES
 ('mini-fritos','Mini Coxinha 25un','25 mini coxinhas de frango fritas na hora',39.90,NULL::numeric),
 ('mini-fritos','Mini Bolinha de Queijo 25un','25 mini bolinhas de mussarela douradas',39.90,34.90),
 ('mini-fritos','Mini Risole de Carne 25un','25 mini risoles de carne moída temperada',42.90,NULL),
 ('mini-fritos','Mini Kibe Frito 25un','25 mini kibes de trigo crocantes',44.90,NULL),
 ('mini-fritos','Mini Croquete 25un','25 mini croquetes de carne',42.90,NULL),
 ('mini-assados','Mini Esfiha de Carne 20un','20 mini esfihas abertas assadas na hora',47.90,NULL),
 ('mini-assados','Mini Enroladinho de Salsicha 20un','20 mini enroladinhos de massa macia',44.90,39.90),
 ('mini-assados','Mini Quibe Assado 20un','20 mini quibes assados de trigo',47.90,NULL),
 ('mini-assados','Mini Trouxinha de Frango 20un','20 mini trouxinhas de frango com catupiry',49.90,NULL),
 ('mini-pasteis','Mini Pastel de Carne 20un','20 mini pastéis de carne moída',44.90,NULL),
 ('mini-pasteis','Mini Pastel de Queijo 20un','20 mini pastéis de mussarela',44.90,39.90),
 ('mini-pasteis','Mini Pastel de Frango 20un','20 mini pastéis de frango desfiado',46.90,NULL),
 ('mini-pasteis','Mini Pastel de Pizza 20un','20 mini pastéis de presunto, queijo e tomate',46.90,NULL),
 ('mini-pizzas','Mini Pizza de Calabresa 15un','15 mini pizzas de calabresa com mussarela',54.90,NULL),
 ('mini-pizzas','Mini Pizza de Mussarela 15un','15 mini pizzas de mussarela e tomate',54.90,49.90),
 ('mini-pizzas','Mini Pizza de Frango 15un','15 mini pizzas de frango com catupiry',59.90,NULL),
 ('mini-pizzas','Mini Pizza Portuguesa 15un','15 mini pizzas de presunto, ovo e ervilha',59.90,NULL),
 ('mini-empadinhas','Mini Empadinha de Frango 20un','20 mini empadinhas de frango',46.90,NULL),
 ('mini-empadinhas','Mini Empadinha de Queijo 20un','20 mini empadinhas de queijo cremoso',46.90,41.90),
 ('mini-empadinhas','Mini Empadinha de Palmito 20un','20 mini empadinhas de palmito',49.90,NULL),
 ('mini-empadinhas','Mini Empadinha de Carne 20un','20 mini empadinhas de carne moída',48.90,NULL),
 ('mini-congelados','Mini Coxinha Congelada 100un','100 mini coxinhas congeladas prontas para fritar',99.90,89.90),
 ('mini-congelados','Mini Mix Congelado 100un','100 mini salgados sortidos congelados',159.90,NULL),
 ('mini-congelados','Mini Pastel Congelado 50un','50 mini pastéis congelados sortidos',79.90,NULL),
 ('kits-para-festa','Kit Festa 100 Mini Salgados','100 mini salgados sortidos + 1 refrigerante 2L',179.90,159.90),
 ('kits-para-festa','Kit Aniversário 200 Mini','200 mini salgados sortidos + 2 refrigerantes',329.90,NULL),
 ('kits-para-festa','Kit Reunião 50 Mini','50 mini salgados sortidos ideais para escritório',94.90,NULL),
 ('bebidas','Coca-Cola 2L','Refrigerante gelado 2 litros',12.00,NULL),
 ('bebidas','Guaraná 2L','Refrigerante guaraná 2 litros',10.00,NULL),
 ('bebidas','Suco Natural 500ml','Suco de laranja natural',8.00,NULL),
 ('bebidas','Água Mineral 500ml','Água mineral sem gás',3.50,NULL)
) AS v(slug,nome,descricao,preco,promo) ON v.slug = c.slug;

INSERT INTO public.cupons (codigo, tipo, valor, minimo) VALUES
 ('NEIA10','percentual',10,50),
  ('FRETEGRATIS','valor',6,80);$body$;
  RAISE NOTICE 'APLICADO 0000_neia_salgados_schema.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0000_neia_salgados_schema.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0001_neia_tipos_crm.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0001: tipo_venda/destaque/promo + cidade + CRM base
-- Rode no SQL Editor do Supabase APÓS a migration 0000.

-- ---------- produtos ----------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_venda text NOT NULL DEFAULT 'combo_50',
  ADD COLUMN IF NOT EXISTS destaque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS promo_fim timestamptz,
  ADD COLUMN IF NOT EXISTS promo_ativo boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produtos_tipo_venda_check') THEN
    ALTER TABLE public.produtos ADD CONSTRAINT produtos_tipo_venda_check CHECK (tipo_venda IN ('combo_50','unidade'));
  END IF;
END $$;

-- classifica o catálogo atual: congelados/kits/bebidas = unidade
UPDATE public.produtos p SET tipo_venda = 'unidade' FROM public.categorias c
WHERE p.categoria_id = c.id AND c.slug IN ('mini-congelados','kits-para-festa','bebidas');

-- ---------- pedidos: cidade ----------
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS cidade text NOT NULL DEFAULT '';

-- ---------- CRM ----------
CREATE TABLE IF NOT EXISTS public.crm_customers (
  telefone_norm text PRIMARY KEY,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  endereco_recente text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  opt_out boolean NOT NULL DEFAULT false,
  notas text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_settings (
  id boolean PRIMARY KEY DEFAULT true,
  ativo_ate_dias integer NOT NULL DEFAULT 14,
  risco_apos_dias integer NOT NULL DEFAULT 21,
  inativo_apos_dias integer NOT NULL DEFAULT 30,
  muito_inativo_apos_dias integer NOT NULL DEFAULT 60,
  intervalo_min_campanhas_dias integer NOT NULL DEFAULT 7,
  campanhas_habilitadas boolean NOT NULL DEFAULT true,
  mensagem_padrao text NOT NULL DEFAULT 'Olá {{cliente}}! Sentimos sua falta aqui na Néia Salgados! Já faz {{dias_sem_comprar}} dias desde seu último pedido. Quer receber nosso cardápio? {{link_cardapio}}',
  CONSTRAINT crm_settings_singleton CHECK (id = true)
);
INSERT INTO public.crm_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  segmento text NOT NULL DEFAULT 'inativo',
  filtros jsonb NOT NULL DEFAULT '{}',
  mensagem_template text NOT NULL DEFAULT '',
  link_rastreavel text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_recipients (
  campaign_id uuid NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  telefone_norm text NOT NULL REFERENCES public.crm_customers(telefone_norm) ON DELETE CASCADE,
  nome_snapshot text NOT NULL DEFAULT '',
  variaveis jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'apto',
  motivo text NOT NULL DEFAULT '',
  sent_at timestamptz,
  PRIMARY KEY (campaign_id, telefone_norm)
);

CREATE TABLE IF NOT EXISTS public.crm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_norm text NOT NULL REFERENCES public.crm_customers(telefone_norm) ON DELETE CASCADE,
  tipo text NOT NULL,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.crm_campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS crm_events_tel_idx ON public.crm_events (telefone_norm, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_recipients_tel_idx ON public.crm_recipients (telefone_norm);
CREATE INDEX IF NOT EXISTS pedidos_tel_idx ON public.pedidos (telefone);
CREATE INDEX IF NOT EXISTS pedidos_status_created_idx ON public.pedidos (status, created_at DESC);

-- RLS: só admin
ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.crm_customers TO service_role;
GRANT ALL ON public.crm_settings TO service_role;
GRANT ALL ON public.crm_campaigns TO service_role;
GRANT ALL ON public.crm_recipients TO service_role;
GRANT ALL ON public.crm_events TO service_role;

DROP POLICY IF EXISTS "crm admin all customers" ON public.crm_customers;
CREATE POLICY "crm admin all customers" ON public.crm_customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "crm admin all settings" ON public.crm_settings;
CREATE POLICY "crm admin all settings" ON public.crm_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "crm admin all campaigns" ON public.crm_campaigns;
CREATE POLICY "crm admin all campaigns" ON public.crm_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "crm admin all recipients" ON public.crm_recipients;
CREATE POLICY "crm admin all recipients" ON public.crm_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "crm admin all events" ON public.crm_events;
CREATE POLICY "crm admin all events" ON public.crm_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
$body$;
  RAISE NOTICE 'APLICADO 0001_neia_tipos_crm.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0001_neia_tipos_crm.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0002_itens_rls.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0002: endurece RLS de pedido_itens (leitura só dono/staff do pedido)
-- Rode no SQL Editor do Supabase APÓS 0000/0001.

DROP POLICY IF EXISTS "itens select" ON public.pedido_itens;

CREATE POLICY "itens select owner staff" ON public.pedido_itens FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p WHERE p.id = pedido_itens.pedido_id AND (
      p.user_id = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'producao')
      OR (public.has_role(auth.uid(),'motoboy') AND (p.motoboy_id = auth.uid() OR (p.motoboy_id IS NULL AND p.status IN ('pronto','aguardando_motoboy'))))
    )
  )
);
$body$;
  RAISE NOTICE 'APLICADO 0002_itens_rls.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0002_itens_rls.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0003_operacao.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0003: operação — agendamento, estoque, financeiro, logs, papéis
-- Rode no SQL Editor do Supabase APÓS 0000/0001/0002.

-- ---------- papéis ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'atendente') THEN-- [gerador] ALTER TYPE ADD VALUE removido: app_role ja e criado com todos os valores em 0000
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'financeiro') THEN-- [gerador] ALTER TYPE ADD VALUE removido: app_role ja e criado com todos os valores em 0000
  END IF;
END $$;

-- ---------- pedidos: agendamento ----------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS agendado_para timestamptz,
  ADD COLUMN IF NOT EXISTS agendamento_obs text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS pedidos_agendado_idx ON public.pedidos (agendado_para) WHERE status <> 'cancelado';

-- ---------- produtos: estoque ----------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS estoque_minimo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_maximo integer,
  ADD COLUMN IF NOT EXISTS unidade_medida text NOT NULL DEFAULT 'un';

-- ---------- estoque_mov ----------
CREATE TABLE IF NOT EXISTS public.estoque_mov (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'ajuste',
  quantidade integer NOT NULL DEFAULT 0,
  motivo text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_mov_tipo CHECK (tipo IN ('entrada','saida','ajuste','perda','producao'))
);
CREATE INDEX IF NOT EXISTS estoque_mov_prod_idx ON public.estoque_mov (produto_id, created_at DESC);

-- ---------- despesas ----------
CREATE TABLE IF NOT EXISTS public.despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT CURRENT_DATE,
  descricao text NOT NULL DEFAULT '',
  valor numeric(10,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS despesas_data_idx ON public.despesas (data DESC);

-- ---------- admin_logs ----------
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acao text NOT NULL,
  detalhe text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_logs_created_idx ON public.admin_logs (created_at DESC);

-- ---------- RLS ----------
ALTER TABLE public.estoque_mov ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.estoque_mov TO service_role;
GRANT ALL ON public.despesas TO service_role;
GRANT ALL ON public.admin_logs TO service_role;

DROP POLICY IF EXISTS "estoque staff" ON public.estoque_mov;
CREATE POLICY "estoque staff" ON public.estoque_mov FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'atendente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao'));

DROP POLICY IF EXISTS "despesas financeiro" ON public.despesas;
CREATE POLICY "despesas financeiro" ON public.despesas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "logs admin" ON public.admin_logs;
CREATE POLICY "logs admin" ON public.admin_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "logs staff insert" ON public.admin_logs;
CREATE POLICY "logs staff insert" ON public.admin_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'financeiro'));
$body$;
  RAISE NOTICE 'APLICADO 0003_operacao.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0003_operacao.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0004_inteligencia.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0004: inteligência — evento, custo, avaliação pós-pedido, orçamentos, carrinho, notificações, config CRM
-- Rode no SQL Editor do Supabase APÓS 0000/0001/0002/0003. Idempotente (IF NOT EXISTS).

-- ---------- pedidos: tipo de evento ----------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo_evento text NOT NULL DEFAULT '';

-- ---------- produtos: custo (margem estimada) ----------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS custo numeric(10,2);

-- ---------- avaliacoes: pós-pedido (qualidade/nota + prazo + atendimento) ----------
ALTER TABLE public.avaliacoes
  ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prazo integer,
  ADD COLUMN IF NOT EXISTS atendimento integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avaliacoes_prazo_check') THEN
    ALTER TABLE public.avaliacoes ADD CONSTRAINT avaliacoes_prazo_check CHECK (prazo IS NULL OR (prazo BETWEEN 1 AND 5));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avaliacoes_atendimento_check') THEN
    ALTER TABLE public.avaliacoes ADD CONSTRAINT avaliacoes_atendimento_check CHECK (atendimento IS NULL OR (atendimento BETWEEN 1 AND 5));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS avaliacoes_pedido_idx ON public.avaliacoes (pedido_id);

-- ---------- orcamentos (eventos/festas; NÃO é pedido) ----------
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  tipo_evento text NOT NULL DEFAULT '',
  pessoas integer NOT NULL DEFAULT 0,
  data_evento date,
  horario text NOT NULL DEFAULT '',
  mix jsonb NOT NULL DEFAULT '[]',
  observacoes text NOT NULL DEFAULT '',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho',
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orcamentos_user_idx ON public.orcamentos (user_id, created_at DESC);

-- ---------- carrinho_eventos (abandono / funil) ----------
CREATE TABLE IF NOT EXISTS public.carrinho_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  telefone text NOT NULL DEFAULT '',
  etapa text NOT NULL DEFAULT 'carrinho',
  itens jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carrinho_eventos_created_idx ON public.carrinho_eventos (created_at DESC);
CREATE INDEX IF NOT EXISTS carrinho_eventos_tel_idx ON public.carrinho_eventos (telefone, created_at DESC);

-- ---------- notificacoes (painel; lida por usuário via UPDATE) ----------
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'info',
  titulo text NOT NULL DEFAULT '',
  detalhe text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificacoes_created_idx ON public.notificacoes (created_at DESC);

-- ---------- crm_settings: inteligência configurável ----------
ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS vip_min_pedidos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_min_valor numeric(10,2) NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS freq_min_pedidos integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS sugestoes_ativas boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recompra_ativa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS carrinho_recuperacao_ativa boolean NOT NULL DEFAULT true;

-- ---------- RLS ----------
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrinho_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.orcamentos TO service_role;
GRANT ALL ON public.carrinho_eventos TO service_role;
GRANT ALL ON public.notificacoes TO service_role;

DROP POLICY IF EXISTS "orcamentos own" ON public.orcamentos;
CREATE POLICY "orcamentos own" ON public.orcamentos FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'));

DROP POLICY IF EXISTS "carrinho_eventos own" ON public.carrinho_eventos;
CREATE POLICY "carrinho_eventos own" ON public.carrinho_eventos FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "notificacoes staff" ON public.notificacoes;
CREATE POLICY "notificacoes staff" ON public.notificacoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
$body$;
  RAISE NOTICE 'APLICADO 0004_inteligencia.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0004_inteligencia.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0005_hardening.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0005: hardening — GRANTs faltantes (0001/0003/0004), guarda de update em pedidos, alinhamento CRM
-- Rode no SQL Editor do Supabase APÓS 0000–0004. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação e confira os fluxos (admin, produção, motoboy, cliente cancela).

-- ============ 1. GRANTs p/ authenticated (RLS sozinha não basta) ============
-- Sem estes GRANTs, até o admin recebe 42501 nas tabelas abaixo.
GRANT ALL ON public.crm_customers TO authenticated;
GRANT ALL ON public.crm_settings TO authenticated;
GRANT ALL ON public.crm_campaigns TO authenticated;
GRANT ALL ON public.crm_recipients TO authenticated;
GRANT ALL ON public.crm_events TO authenticated;
GRANT ALL ON public.estoque_mov TO authenticated;
GRANT ALL ON public.despesas TO authenticated;
GRANT ALL ON public.admin_logs TO authenticated;
GRANT ALL ON public.orcamentos TO authenticated;
GRANT ALL ON public.carrinho_eventos TO authenticated;
GRANT ALL ON public.notificacoes TO authenticated;

-- ============ 2. Guarda de UPDATE em pedidos (anti-fraude de valores) ============
-- RLS permite ao cliente atualizar o próprio pedido 'recebido' SEM restrição de colunas.
-- Este trigger limita: cliente só pode cancelar (status → cancelado, demais colunas iguais);
-- motoboy não pode tocar em valores/identificação; staff segue o RLS.
CREATE OR REPLACE FUNCTION public.pedidos_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'producao')
     OR public.has_role(auth.uid(),'atendente')
     OR public.has_role(auth.uid(),'financeiro') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(),'motoboy') THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
       OR NEW.desconto IS DISTINCT FROM OLD.desconto
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.cupom IS DISTINCT FROM OLD.cupom
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.numero IS DISTINCT FROM OLD.numero
       OR NEW.cliente_nome IS DISTINCT FROM OLD.cliente_nome
       OR NEW.telefone IS DISTINCT FROM OLD.telefone THEN
      RAISE EXCEPTION 'motoboy_nao_pode_alterar_valores';
    END IF;
    RETURN NEW;
  END IF;

  -- cliente: apenas cancelar o próprio pedido recebido, sem alterar mais nada
  IF OLD.user_id = auth.uid() AND OLD.status = 'recebido' AND NEW.status = 'cancelado'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.numero IS NOT DISTINCT FROM OLD.numero
     AND NEW.cliente_nome IS NOT DISTINCT FROM OLD.cliente_nome
     AND NEW.telefone IS NOT DISTINCT FROM OLD.telefone
     AND NEW.endereco IS NOT DISTINCT FROM OLD.endereco
     AND NEW.bairro IS NOT DISTINCT FROM OLD.bairro
     AND NEW.complemento IS NOT DISTINCT FROM OLD.complemento
     AND NEW.referencia IS NOT DISTINCT FROM OLD.referencia
     AND NEW.observacoes IS NOT DISTINCT FROM OLD.observacoes
     AND NEW.forma_pagamento IS NOT DISTINCT FROM OLD.forma_pagamento
     AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.taxa_entrega IS NOT DISTINCT FROM OLD.taxa_entrega
     AND NEW.desconto IS NOT DISTINCT FROM OLD.desconto
     AND NEW.total IS NOT DISTINCT FROM OLD.total
     AND NEW.cupom IS NOT DISTINCT FROM OLD.cupom
     AND NEW.cidade IS NOT DISTINCT FROM OLD.cidade
     AND NEW.producao_status IS NOT DISTINCT FROM OLD.producao_status
     AND NEW.motoboy_id IS NOT DISTINCT FROM OLD.motoboy_id
     AND NEW.taxa_motoboy IS NOT DISTINCT FROM OLD.taxa_motoboy
     AND NEW.agendado_para IS NOT DISTINCT FROM OLD.agendado_para
     AND NEW.agendamento_obs IS NOT DISTINCT FROM OLD.agendamento_obs
     AND NEW.tipo_evento IS NOT DISTINCT FROM OLD.tipo_evento
     AND NEW.campanha_origem IS NOT DISTINCT FROM OLD.campanha_origem
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.destino_lat IS NOT DISTINCT FROM OLD.destino_lat
     AND NEW.destino_lng IS NOT DISTINCT FROM OLD.destino_lng
     AND NEW.motoboy_lat IS NOT DISTINCT FROM OLD.motoboy_lat
     AND NEW.motoboy_lng IS NOT DISTINCT FROM OLD.motoboy_lng
     AND NEW.motoboy_atualizado_em IS NOT DISTINCT FROM OLD.motoboy_atualizado_em
     AND NEW.aceito_em IS NOT DISTINCT FROM OLD.aceito_em
     AND NEW.entregue_em IS NOT DISTINCT FROM OLD.entregue_em THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'operacao_nao_permitida';
END; $$;

DROP TRIGGER IF EXISTS pedidos_guard_update_trg ON public.pedidos;
CREATE TRIGGER pedidos_guard_update_trg
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.pedidos_guard_update();

-- ============ 3. Alinhamento dos thresholds do CRM ao padrão do app ============
-- O seed original usava 14/21/30/60; o app usa 30/31/46/91 (DEFAULT_CRM_SETTINGS).
-- Atualiza SOMENTE se ainda estiver nos valores do seed (não sobrescreve ajuste manual).
UPDATE public.crm_settings
SET ativo_ate_dias = 30,
    risco_apos_dias = 31,
    inativo_apos_dias = 46,
    muito_inativo_apos_dias = 91
WHERE id = true
  AND ativo_ate_dias = 14
  AND risco_apos_dias = 21
  AND inativo_apos_dias = 30
  AND muito_inativo_apos_dias = 60;
$body$;
  RAISE NOTICE 'APLICADO 0005_hardening.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0005_hardening.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0006_recorrencia.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0006: recorrência comercial — aniversário, origem de campanha, cupons personalizados, metas
-- Rode no SQL Editor do Supabase APÓS 0000–0005. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

-- ---------- clientes: data de nascimento (só se o cliente informar) ----------
ALTER TABLE public.crm_customers
  ADD COLUMN IF NOT EXISTS data_nascimento date;

-- ---------- pedidos: origem de campanha (link rastreável) ----------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS campanha_origem text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS pedidos_campanha_idx ON public.pedidos (campanha_origem) WHERE campanha_origem <> '';

-- ---------- cupons personalizados ----------
ALTER TABLE public.cupons
  ADD COLUMN IF NOT EXISTS cliente_telefone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS validade_ini timestamptz,
  ADD COLUMN IF NOT EXISTS validade_fim timestamptz,
  ADD COLUMN IF NOT EXISTS max_usos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS produtos_ids jsonb NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS cupons_cliente_idx ON public.cupons (cliente_telefone) WHERE cliente_telefone <> '';

-- ---------- metas ----------
CREATE TABLE IF NOT EXISTS public.metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'mensal',
  periodo_ref text NOT NULL DEFAULT '',
  valor numeric(10,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metas_tipo CHECK (tipo IN ('diaria','semanal','mensal')),
  UNIQUE (tipo, periodo_ref)
);
CREATE INDEX IF NOT EXISTS metas_periodo_idx ON public.metas (tipo, periodo_ref DESC);

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.metas TO service_role;
GRANT ALL ON public.metas TO authenticated;

DROP POLICY IF EXISTS "metas admin" ON public.metas;
CREATE POLICY "metas admin" ON public.metas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
$body$;
  RAISE NOTICE 'APLICADO 0006_recorrencia.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0006_recorrencia.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0007_orcamento_validade.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0007: orçamento — validade explícita
-- Rode no SQL Editor do Supabase APÓS 0000–0006. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS validade date;
$body$;
  RAISE NOTICE 'APLICADO 0007_orcamento_validade.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0007_orcamento_validade.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0008_atendimento.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0008: atendimento — notas do pedido + leitura de pedidos/clientes pelo atendente
-- Rode no SQL Editor do Supabase APÓS 0000–0007. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

-- ---------- pedido_notas (timeline; interna vs visível ao cliente) ----------
CREATE TABLE IF NOT EXISTS public.pedido_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  autor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  texto text NOT NULL DEFAULT '',
  visivel_cliente boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pedido_notas_pedido_idx ON public.pedido_notas (pedido_id, created_at);

ALTER TABLE public.pedido_notas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pedido_notas TO service_role;
GRANT ALL ON public.pedido_notas TO authenticated;

DROP POLICY IF EXISTS "notas staff" ON public.pedido_notas;
CREATE POLICY "notas staff" ON public.pedido_notas FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'atendente')
    OR public.has_role(auth.uid(),'financeiro')
    OR (public.has_role(auth.uid(),'motoboy') AND EXISTS (
      SELECT 1 FROM public.pedidos p WHERE p.id = pedido_notas.pedido_id AND (p.motoboy_id = auth.uid() OR p.motoboy_id IS NULL)
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'atendente')
  );

DROP POLICY IF EXISTS "notas cliente visiveis" ON public.pedido_notas;
CREATE POLICY "notas cliente visiveis" ON public.pedido_notas FOR SELECT TO authenticated
  USING (
    visivel_cliente = true AND EXISTS (
      SELECT 1 FROM public.pedidos p WHERE p.id = pedido_notas.pedido_id AND p.user_id = auth.uid()
    )
  );

-- ---------- atendente: leitura de pedidos e perfis (SEM escrita além do que já tem) ----------
-- Atendente registra pedidos (insert próprio já permitido) e precisa buscar clientes/pedidos.
DROP POLICY IF EXISTS "pedidos atendente read" ON public.pedidos;
CREATE POLICY "pedidos atendente read" ON public.pedidos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "profiles atendente read" ON public.profiles;
CREATE POLICY "profiles atendente read" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'atendente'));
$body$;
  RAISE NOTICE 'APLICADO 0008_atendimento.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0008_atendimento.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0009_b2b.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0009: B2B — campos de empresa no cadastro único de clientes
-- Rode no SQL Editor do Supabase APÓS 0000–0008. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.
-- Não duplica base: estende public.crm_customers (mesma chave telefone_norm).

ALTER TABLE public.crm_customers
  ADD COLUMN IF NOT EXISTS tipo_cliente text NOT NULL DEFAULT 'PF',
  ADD COLUMN IF NOT EXISTS razao_social text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome_fantasia text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cnpj text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS responsavel text NOT NULL DEFAULT '';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_customers_tipo_check') THEN
    ALTER TABLE public.crm_customers ADD CONSTRAINT crm_customers_tipo_check CHECK (tipo_cliente IN ('PF','PJ'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_customers_tipo_idx ON public.crm_customers (tipo_cliente);
$body$;
  RAISE NOTICE 'APLICADO 0009_b2b.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0009_b2b.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0010_resgate.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0010: fidelidade — resgate próprio limitado (200 pts → cupom R$20, regra já anunciada no app)
-- Rode no SQL Editor do Supabase APÓS 0000–0009. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.
-- Modelo de ameaça: pontos já são atualizáveis pelo próprio dono (RLS 0000); esta policy
-- limita o estrago a cupons de no MÁXIMO R$20, uso único, vinculados ao próprio telefone,
-- prefixo FID-. Recomendado evoluir para Edge Function (validação server-side total).

DROP POLICY IF EXISTS "cupons resgate proprio" ON public.cupons;
CREATE POLICY "cupons resgate proprio" ON public.cupons FOR INSERT TO authenticated
  WITH CHECK (
    codigo LIKE 'FID-%'
    AND tipo = 'valor'
    AND valor <= 20
    AND (max_usos = 1)
    AND cliente_telefone <> ''
    AND (validade_fim IS NULL OR validade_fim > now())
  );
$body$;
  RAISE NOTICE 'APLICADO 0010_resgate.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0010_resgate.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0011_papeis.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0011: admin gerencia papéis (atribuir/remover atendente, produção, motoboy, financeiro)
-- Rode no SQL Editor do Supabase APÓS 0000–0010. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.
-- Sem isso, papéis só podem ser atribuídos pelo dashboard do Supabase.

DROP POLICY IF EXISTS "roles admin manage" ON public.user_roles;
CREATE POLICY "roles admin manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
$body$;
  RAISE NOTICE 'APLICADO 0011_papeis.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0011_papeis.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0012_recorrencia.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0012: pedidos recorrentes (nunca auto-confirmados; confirmação sempre manual)
-- Rode no SQL Editor do Supabase APÓS 0000–0011. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

CREATE TABLE IF NOT EXISTS public.pedidos_recorrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  complemento text NOT NULL DEFAULT '',
  referencia text NOT NULL DEFAULT '',
  forma_pagamento text NOT NULL DEFAULT 'pix',
  itens jsonb NOT NULL DEFAULT '[]',
  frequencia text NOT NULL DEFAULT 'semanal',
  proxima_execucao date NOT NULL DEFAULT CURRENT_DATE,
  modo_confirmacao text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rec_frequencia CHECK (frequencia IN ('semanal','quinzenal','mensal')),
  CONSTRAINT rec_status CHECK (status IN ('ativo','pausado','cancelado')),
  CONSTRAINT rec_modo CHECK (modo_confirmacao IN ('manual','whatsapp'))
);
CREATE INDEX IF NOT EXISTS rec_proxima_idx ON public.pedidos_recorrentes (proxima_execucao) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS rec_user_idx ON public.pedidos_recorrentes (user_id, status);

ALTER TABLE public.pedidos_recorrentes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pedidos_recorrentes TO service_role;
GRANT ALL ON public.pedidos_recorrentes TO authenticated;

DROP POLICY IF EXISTS "recorrentes own" ON public.pedidos_recorrentes;
CREATE POLICY "recorrentes own" ON public.pedidos_recorrentes FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'));
$body$;
  RAISE NOTICE 'APLICADO 0012_recorrencia.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0012_recorrencia.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0013_cliques.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0013: cliques em links de campanha (métrica real, sem PII)
-- Rode no SQL Editor do Supabase APÓS 0000–0012. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.
-- Risco consciente: insert anônimo restrito a (slug, data); sem PII, só contagem.
-- Sem rate-limit no banco — se houver abuso, desative a policy "cliques anon insert".

CREATE TABLE IF NOT EXISTS public.campanha_cliques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campanha_cliques_slug_idx ON public.campanha_cliques (slug, created_at DESC);

ALTER TABLE public.campanha_cliques ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.campanha_cliques TO service_role;
GRANT ALL ON public.campanha_cliques TO authenticated;

DROP POLICY IF EXISTS "cliques admin read" ON public.campanha_cliques;
CREATE POLICY "cliques admin read" ON public.campanha_cliques FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "cliques anon insert" ON public.campanha_cliques;
CREATE POLICY "cliques anon insert" ON public.campanha_cliques FOR INSERT TO anon, authenticated
  WITH CHECK (slug <> '' AND length(slug) <= 60);
$body$;
  RAISE NOTICE 'APLICADO 0013_cliques.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0013_cliques.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0014_fidelidade.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0014: fidelidade configurável (regras hoje fixas no código: 1pt/R$5, 200pts → R$20)
-- Rode no SQL Editor do Supabase APÓS 0000–0013. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS fid_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fid_reais_por_ponto numeric(10,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS fid_meta_pontos integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS fid_recompensa_valor numeric(10,2) NOT NULL DEFAULT 20;

-- Reemite a policy de resgate com teto maior (configurável até R$100).
-- Dano máximo contido: cupom FID-*, uso único, próprio telefone, validade futura.
DROP POLICY IF EXISTS "cupons resgate proprio" ON public.cupons;
CREATE POLICY "cupons resgate proprio" ON public.cupons FOR INSERT TO authenticated
  WITH CHECK (
    codigo LIKE 'FID-%'
    AND tipo = 'valor'
    AND valor <= 100
    AND (max_usos = 1)
    AND cliente_telefone <> ''
    AND (validade_fim IS NULL OR validade_fim > now())
  );
$body$;
  RAISE NOTICE 'APLICADO 0014_fidelidade.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0014_fidelidade.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0015_hero_carousel.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0015: carrossel de hero configurável pelo admin
-- Rode no SQL Editor do Supabase APÓS 0000–0014. Idempotente.

CREATE TABLE IF NOT EXISTS public.hero_carousel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imagem_url text NOT NULL,
  legenda text NOT NULL DEFAULT '',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hero_carousel_ativo_ordem_idx ON public.hero_carousel (ativo, ordem);

ALTER TABLE public.hero_carousel ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.hero_carousel TO service_role;
GRANT SELECT ON public.hero_carousel TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hero_carousel TO authenticated;

DROP POLICY IF EXISTS "hero select publico" ON public.hero_carousel;
CREATE POLICY "hero select publico" ON public.hero_carousel FOR SELECT TO anon, authenticated
  USING (ativo = true);

DROP POLICY IF EXISTS "hero admin all" ON public.hero_carousel;
CREATE POLICY "hero admin all" ON public.hero_carousel FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
$body$;
  RAISE NOTICE 'APLICADO 0015_hero_carousel.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0015_hero_carousel.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0016_calculadora_config.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0016: config da calculadora de salgados (linha única, id=true)
-- Rode no SQL Editor do Supabase APÓS 0015. Idempotente.

CREATE TABLE IF NOT EXISTS public.calculadora_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  permitir_personalizado boolean NOT NULL DEFAULT true,
  por_pessoa_padrao integer NOT NULL DEFAULT 20,
  minimo_por_pessoa integer NOT NULL DEFAULT 15,
  maximo_por_pessoa integer NOT NULL DEFAULT 40
);

INSERT INTO public.calculadora_config (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.calculadora_config ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.calculadora_config TO service_role;
GRANT SELECT ON public.calculadora_config TO anon, authenticated;
GRANT UPDATE ON public.calculadora_config TO authenticated;

DROP POLICY IF EXISTS "calc select publico" ON public.calculadora_config;
CREATE POLICY "calc select publico" ON public.calculadora_config FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "calc admin update" ON public.calculadora_config;
CREATE POLICY "calc admin update" ON public.calculadora_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
$body$;
  RAISE NOTICE 'APLICADO 0016_calculadora_config.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0016_calculadora_config.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0017_motoboys.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0017: cadastro de motoboys (usado no painel admin)
-- Rode no SQL Editor do Supabase APÓS 0016. Idempotente.

CREATE TABLE IF NOT EXISTS public.motoboys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  observacao text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.motoboys ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.motoboys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motoboys TO authenticated;

DROP POLICY IF EXISTS "motoboys admin all" ON public.motoboys;
CREATE POLICY "motoboys admin all" ON public.motoboys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
$body$;
  RAISE NOTICE 'APLICADO 0017_motoboys.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0017_motoboys.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0018_tipo_entrega.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0018: tipo de entrega no pedido (entrega | retirada)
-- Rode no SQL Editor do Supabase APÓS 0017. Idempotente.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'entrega';

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_tipo_entrega_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_tipo_entrega_check
  CHECK (tipo_entrega IN ('entrega', 'retirada'));
$body$;
  RAISE NOTICE 'APLICADO 0018_tipo_entrega.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0018_tipo_entrega.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0019_orcamento_contato.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0019: contato e validade do orçamento na calculadora
-- Rode no SQL Editor do Supabase APÓS 0016. Idempotente.

ALTER TABLE public.calculadora_config
  ADD COLUMN IF NOT EXISTS zap_contato text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS orcamento_validade_dias integer NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.calculadora_config.zap_contato IS
  'WhatsApp que recebe os pedidos de orçamento (DDD + número, com ou sem 55).';
COMMENT ON COLUMN public.calculadora_config.orcamento_validade_dias IS
  'Validade padrão do orçamento em dias, informada ao cliente na página /calculadora.';$body$;
  RAISE NOTICE 'APLICADO 0019_orcamento_contato.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0019_orcamento_contato.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0020_storage_hero.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0020: bucket de imagens do carrossel do hero (upload pelo admin)
-- Rode no SQL Editor do Supabase APÓS 0015. Idempotente.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hero',
  'hero',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública: o banner da home é exibido para visitante sem login.
DROP POLICY IF EXISTS "hero bucket select publico" ON storage.objects;
CREATE POLICY "hero bucket select publico" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'hero');

-- Admin envia/apaga; o layout é verificado pela policy do admin via public.has_role.
DROP POLICY IF EXISTS "hero bucket admin insert" ON storage.objects;
CREATE POLICY "hero bucket admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "hero bucket admin update" ON storage.objects;
CREATE POLICY "hero bucket admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "hero bucket admin delete" ON storage.objects;
CREATE POLICY "hero bucket admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'));$body$;
  RAISE NOTICE 'APLICADO 0020_storage_hero.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0020_storage_hero.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0021_loja_config.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0021: dados da loja (endereco de retirada, telefone e ponto no mapa)
-- Rode no SQL Editor do Supabase APÓS 0000. Idempotente.

CREATE TABLE IF NOT EXISTS public.loja_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  nome text NOT NULL DEFAULT 'Néia Salgados',
  telefone text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  complemento text NOT NULL DEFAULT '',
  referencia text NOT NULL DEFAULT '',
  instrucoes_retirada text NOT NULL DEFAULT '',
  mapa_lat double precision,
  mapa_lng double precision,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.loja_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.loja_config ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.loja_config TO service_role;
GRANT SELECT ON public.loja_config TO anon, authenticated;
GRANT UPDATE ON public.loja_config TO authenticated;

DROP POLICY IF EXISTS "loja select publico" ON public.loja_config;
CREATE POLICY "loja select publico" ON public.loja_config FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "loja admin update" ON public.loja_config;
CREATE POLICY "loja admin update" ON public.loja_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

COMMENT ON COLUMN public.loja_config.instrucoes_retirada IS
  'Texto que o cliente ve no checkout ao escolher retirada (ex: horario de funcionamento).';
COMMENT ON COLUMN public.loja_config.mapa_lat IS
  'Latitude da loja. Com latitude e longitude preenchidas, a loja aparece no mapa do pedido de retirada.';$body$;
  RAISE NOTICE 'APLICADO 0021_loja_config.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0021_loja_config.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0022_pagamento_status.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0022: status do pagamento separado do status do pedido
-- Rode no SQL Editor do Supabase APÓS 0000. Idempotente.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pagamento_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS pagamento_em timestamptz;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_pagamento_status_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_pagamento_status_check
  CHECK (pagamento_status IN ('pendente', 'pago', 'falhou', 'reembolsado'));

-- Pedidos já existentes entram como pendentes: NUNCA marcar como pago sozinho.
UPDATE public.pedidos SET pagamento_status = 'pendente' WHERE pagamento_status IS NULL;

CREATE INDEX IF NOT EXISTS pedidos_pagamento_status_idx ON public.pedidos (pagamento_status);

COMMENT ON COLUMN public.pedidos.pagamento_status IS
  'Status financeiro, independente do status do pedido: pendente | pago | falhou | reembolsado.';
COMMENT ON COLUMN public.pedidos.pagamento_em IS
  'Quando o pagamento foi confirmado. Preenchido apenas por confirmação manual da loja.';$body$;
  RAISE NOTICE 'APLICADO 0022_pagamento_status.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0022_pagamento_status.sql -> %', SQLERRM;
END
$mig$;

-- ============================================================================
-- RESUMO: cole isto num New query e me envie a linha que aparecer.
-- ============================================================================
SELECT
  (SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','user_roles','produtos','categorias','pedidos','pedido_itens',
        'cupons','favoritos','avaliacoes','enderecos','crm_settings','hero_carousel',
        'calculadora_config','motoboys','metas','despesas','estoque_mov','admin_logs',
        'crm_customers','crm_campaigns','orcamentos','pedidos_recorrentes','pedido_notas',
        'campanha_cliques')) AS "TABELAS_CRIADAS",
  (SELECT string_agg(enumlabel, '/' ORDER BY enumsortorder) FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role') AS "APP_ROLE",
  (SELECT string_agg(proname || '(' || pg_get_function_identity_arguments(oid) || ')', ', ' ORDER BY proname)
    FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS "FUNCOES",
  (SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'tipo_entrega') AS "TIPO_ENTREGA";
