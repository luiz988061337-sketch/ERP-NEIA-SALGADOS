-- ============================================================================
-- PASSO 4 - BOOTSTRAP COMPLETO (gerado por scripts/gerar-bootstrap.mjs)
-- Aplica drizzle/migrations/0000..0054 nessa ordem.
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
-- 0001_migration.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$ALTER FUNCTION public.liberar_reserva_atomica(uuid) SET search_path = '';
ALTER FUNCTION public.reservar_estoque_atomica(uuid,uuid,integer) SET search_path = '';

DROP POLICY IF EXISTS "lotes public read" ON public.lotes;

DROP POLICY IF EXISTS "parceiros read" ON public.parceiros;
CREATE POLICY "parceiros admin read" ON public.parceiros
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.parceiros_publicos AS
  SELECT id, nome, categoria, cidade, bairro, instagram, site, descricao, logo_url
  FROM public.parceiros
  WHERE status = 'aprovado' AND autoriza_divulgacao;
GRANT SELECT ON public.parceiros_publicos TO anon, authenticated;$body$;
  RAISE NOTICE 'APLICADO 0001_migration.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0001_migration.sql -> %', SQLERRM;
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
-- 0002_secure_loyalty_and_partners.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$ALTER FUNCTION public.liberar_reserva_atomica(uuid) SET search_path = public;
ALTER FUNCTION public.reservar_estoque_atomica(uuid,uuid,integer) SET search_path = public;

-- Parceiros: candidaturas abertas, mas só como novas e não divulgadas
DROP POLICY IF EXISTS "parceiros write" ON public.parceiros;
CREATE POLICY "parceiros candidatura" ON public.parceiros FOR INSERT TO anon, authenticated
WITH CHECK (status = 'nova' AND length(nome) BETWEEN 1 AND 200 AND coalesce(length(proposta),0) <= 2000 AND coalesce(length(descricao),0) <= 2000);

-- Pontos: só funções do servidor ou admin alteram
CREATE OR REPLACE FUNCTION public.profiles_guard_pontos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pontos IS DISTINCT FROM OLD.pontos
     AND coalesce(current_setting('app.pontos_ok', true),'') <> '1'
     AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'pontos_nao_editaveis';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_guard_pontos_trg ON public.profiles;
CREATE TRIGGER profiles_guard_pontos_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_pontos();

CREATE OR REPLACE FUNCTION public.profiles_guard_pontos_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('app.pontos_ok', true),'') <> '1' AND NOT public.has_role(auth.uid(),'admin') THEN
    NEW.pontos := 0;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_guard_pontos_ins_trg ON public.profiles;
CREATE TRIGGER profiles_guard_pontos_ins_trg BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_pontos_insert();

CREATE TABLE IF NOT EXISTS public.pontos_creditos (
  pedido_id uuid PRIMARY KEY REFERENCES public.pedidos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  pontos integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pontos_creditos TO authenticated;
GRANT ALL ON public.pontos_creditos TO service_role;
ALTER TABLE public.pontos_creditos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pontos_creditos own read" ON public.pontos_creditos FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.creditar_pontos_pedido(p_pedido_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ped record; v_cfg record; v_pts integer;
BEGIN
  SELECT id, user_id, total, status INTO v_ped FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND OR v_ped.user_id IS DISTINCT FROM auth.uid() OR v_ped.status = 'cancelado' THEN RETURN 0; END IF;
  SELECT fid_ativo, fid_reais_por_ponto INTO v_cfg FROM public.crm_settings WHERE id = true;
  IF FOUND AND NOT coalesce(v_cfg.fid_ativo, true) THEN RETURN 0; END IF;
  v_pts := floor(coalesce(v_ped.total,0) / greatest(coalesce(v_cfg.fid_reais_por_ponto, 1), 0.01));
  IF v_pts <= 0 THEN RETURN 0; END IF;
  INSERT INTO public.pontos_creditos (pedido_id, user_id, pontos) VALUES (p_pedido_id, v_ped.user_id, v_pts)
  ON CONFLICT (pedido_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 0; END IF;
  PERFORM set_config('app.pontos_ok','1', true);
  UPDATE public.profiles SET pontos = pontos + v_pts WHERE id = v_ped.user_id;
  PERFORM set_config('app.pontos_ok','', true);
  RETURN v_pts;
END; $$;
REVOKE ALL ON FUNCTION public.creditar_pontos_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creditar_pontos_pedido(uuid) TO authenticated;

-- Resgate: validado no servidor, código imprevisível
DROP POLICY IF EXISTS "cupons resgate proprio" ON public.cupons;
CREATE OR REPLACE FUNCTION public.resgatar_fidelidade(p_telefone text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_tel text; v_saldo integer; v_meta integer := 200; v_valor numeric := 20; v_ativo boolean := true; v_codigo text; v_cfg record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  v_tel := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  IF length(v_tel) < 10 THEN RAISE EXCEPTION 'telefone_invalido'; END IF;
  SELECT fid_ativo, fid_meta_pontos, fid_recompensa_valor INTO v_cfg FROM public.crm_settings WHERE id = true;
  IF FOUND THEN v_ativo := coalesce(v_cfg.fid_ativo,true); v_meta := coalesce(v_cfg.fid_meta_pontos,200); v_valor := coalesce(v_cfg.fid_recompensa_valor,20); END IF;
  IF NOT v_ativo THEN RAISE EXCEPTION 'programa_desativado'; END IF;
  IF v_valor <= 0 OR v_valor > 100 OR v_meta <= 0 THEN RAISE EXCEPTION 'config_invalida'; END IF;
  SELECT pontos INTO v_saldo FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF coalesce(v_saldo,0) < v_meta THEN RAISE EXCEPTION 'pontos_insuficientes'; END IF;
  v_codigo := 'FID-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  INSERT INTO public.cupons (codigo, tipo, valor, minimo, ativo, cliente_telefone, validade_fim, max_usos, produtos_ids)
  VALUES (v_codigo, 'valor', v_valor, 0, true, v_tel, now() + interval '30 days', 1, '[]'::jsonb);
  PERFORM set_config('app.pontos_ok','1', true);
  UPDATE public.profiles SET pontos = pontos - v_meta, telefone = CASE WHEN telefone = '' THEN v_tel ELSE telefone END WHERE id = v_uid;
  PERFORM set_config('app.pontos_ok','', true);
  RETURN v_codigo;
END; $$;
REVOKE ALL ON FUNCTION public.resgatar_fidelidade(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resgatar_fidelidade(text) TO authenticated;$body$;
  RAISE NOTICE 'APLICADO 0002_secure_loyalty_and_partners.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0002_secure_loyalty_and_partners.sql -> %', SQLERRM;
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
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'atendente') THEN
-- [gerador] ALTER TYPE ADD VALUE removido: app_role ja e criado com todos os valores em 0000
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'financeiro') THEN
-- [gerador] ALTER TYPE ADD VALUE removido: app_role ja e criado com todos os valores em 0000
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

-- ----------------------------------------------------------------------------
-- 0023_base_operacional.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0023: base operacional — histórico, lotes FEFO, reservas, horário/capacidade
-- Idempotente. Rode no SQL Editor APÓS 0022.

-- Histórico/timeline de status (override auditado: quem, quando, de, para, motivo)
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

-- Flags operacionais no pedido (atraso é ALERTA, não apaga estágio real)
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

-- Reservas de estoque (confirmação reserva, cancelamento libera)
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

-- Movimentações: garantir tipos novos nunca quebram CHECK antigo -> sem CHECK, só texto
-- (estoque_mov.tipo já é texto livre nas migrations)

-- Config de horário/capacidade (singleton id=true)
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
-- NOTA 0053: dono insere no próprio pedido (nascimento via checkout); 0053 repete p/ bancos já criados.
CREATE POLICY "hist staff insert" ON public.pedido_status_historico FOR INSERT WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
  OR EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.user_id = auth.uid())
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
$body$;
  RAISE NOTICE 'APLICADO 0023_base_operacional.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0023_base_operacional.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0024_entrega.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0024: entrega — status motoboy, rotas, atrasos, endereço estruturado
-- Idempotente. Rode APÓS 0023.

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
$body$;
  RAISE NOTICE 'APLICADO 0024_entrega.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0024_entrega.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0025_impressao.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0025: impressão — fila, logs, anti-duplicidade, status de impressão
-- Idempotente. Rode APÓS 0024.

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
$body$;
  RAISE NOTICE 'APLICADO 0025_impressao.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0025_impressao.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0026_cozinha.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0026: cozinha — fritura, sons/config, tempo por produto
-- Idempotente. Rode APÓS 0025.

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
$body$;
  RAISE NOTICE 'APLICADO 0026_cozinha.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0026_cozinha.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0027_lembretes.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0027: comunicação — lembretes de pedidos futuros, sem auto-cancelar
-- Idempotente. Rode APÓS 0026.

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
$body$;
  RAISE NOTICE 'APLICADO 0027_lembretes.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0027_lembretes.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0028_crm_experiencia.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0028: CRM/fidelidade — jornada, indicação, parceiros, degustação, avaliações públicas, ajuda, alta demanda
-- Idempotente. Rode APÓS 0027.

-- Jornada (um evento por linha, sem vigilância invasiva: só eventos do funil)
CREATE TABLE IF NOT EXISTS public.jornada_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  etapa text NOT NULL CHECK (etapa IN ('visitou','visualizou','favoritou','adicionou_carrinho','iniciou_checkout','comprou','recebeu','avaliou','voltou')),
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Origem só no primeiro pedido (coluna já existe campanha_origem; garantir parceiro/indicador)
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS origem_parceiro_id uuid;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS indicado_por uuid REFERENCES auth.users(id);

-- Indicações (código por cliente)
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

-- Degustação: SÓ depois do orçamento (§4), elegibilidade configurável
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

-- Parceiros (sem comissão automática; indicação futura)
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
  categoria text NOT NULL, titulo text NOT NULL, corpo text NOT NULL, ativo boolean NOT NULL DEFAULT true,
  UNIQUE (categoria, titulo)
);

-- Alta demanda (avisos progressivos 10/7/3d, nunca inventar sem config)
CREATE TABLE IF NOT EXISTS public.datas_demanda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocasiao text NOT NULL, data date NOT NULL, mensagem text, antecedencia_dias integer NOT NULL DEFAULT 10,
  nivel text NOT NULL DEFAULT 'alta', ativo boolean NOT NULL DEFAULT true
);

-- Avaliações públicas: flag de moderação (coluna nova, default exige aprovação)
ALTER TABLE public.avaliacoes ADD COLUMN IF NOT EXISTS autoriza_publicar boolean NOT NULL DEFAULT false;
ALTER TABLE public.avaliacoes ADD COLUMN IF NOT EXISTS aprovada boolean NOT NULL DEFAULT false;

-- RLS mínimo
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

-- Seed ajuda mínima (categorias do §41)
INSERT INTO public.ajuda_artigos (categoria, titulo, corpo) VALUES
 ('pedidos','Como acompanhar meu pedido?','Abra Conta → Meus pedidos ou o link do pedido. Os status mostram preparação, saída e entrega.'),
 ('combos','Por que combos são de 50 em 50?','Combos de festa são produzidos em caixas de 50. O carrinho arredonda para 50, 100, 150… Congelados e bebidas vendem por unidade.'),
 ('entrega','Entrega ou retirada?','Entrega tem taxa e vai com motoboy. Retirada é na loja, sem taxa, com endereço e mapa no pedido.'),
 ('pagamento','Como pago?','PIX com QR/Copia e Cola, dinheiro, crédito ou débito. O pagamento começa pendente e a loja confirma.'),
 ('agendamento','Posso agendar?','Sim, Seg–Sáb 08–12h e 13–22h (nunca 12–13h, Dom fechado), com 30min de antecedência.')
ON CONFLICT (categoria, titulo) DO NOTHING;
$body$;
  RAISE NOTICE 'APLICADO 0028_crm_experiencia.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0028_crm_experiencia.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0029_loja_pix.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0029: loja pix_chave (tira hardcoded do frontend)
ALTER TABLE public.loja_config ADD COLUMN IF NOT EXISTS pix_chave text NOT NULL DEFAULT '24913937000116';
UPDATE public.loja_config SET pix_chave = '24913937000116' WHERE pix_chave IS NULL OR pix_chave = '';
$body$;
  RAISE NOTICE 'APLICADO 0029_loja_pix.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0029_loja_pix.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0030_reserva_atomica.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0030: reserva atômica — impede estoque negativo por concorrência.
-- Dois clientes simultâneos nunca vendem acima do estoque: lock por produto.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.reservar_estoque_atomica(
  p_pedido_id uuid, p_produto_id uuid, p_qtd integer
) RETURNS boolean AS $$
DECLARE
  v_estoque integer;
BEGIN
  IF p_qtd IS NULL OR p_qtd <= 0 THEN RETURN false; END IF;
  -- Lock da linha do produto: serializa reservas concorrentes
  SELECT estoque INTO v_estoque FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_estoque < p_qtd THEN RETURN false; END IF;
  UPDATE public.produtos SET estoque = estoque - p_qtd WHERE id = p_produto_id;
  INSERT INTO public.reservas_estoque (pedido_id, produto_id, quantidade, status)
  VALUES (p_pedido_id, p_produto_id, p_qtd, 'ativa');
  INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo)
  VALUES (p_produto_id, 'reserva', p_qtd, 'pedido:' || p_pedido_id::text);
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.liberar_reserva_atomica(p_pedido_id uuid) RETURNS integer AS $$
DECLARE
  r record; n integer := 0;
BEGIN
  FOR r IN SELECT * FROM public.reservas_estoque WHERE pedido_id = p_pedido_id AND status = 'ativa' FOR UPDATE LOOP
    UPDATE public.produtos SET estoque = estoque + r.quantidade WHERE id = r.produto_id;
    UPDATE public.reservas_estoque SET status = 'liberada' WHERE id = r.id;
    INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo)
    VALUES (r.produto_id, 'liberacao_reserva', r.quantidade, 'pedido:' || p_pedido_id::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
$body$;
  RAISE NOTICE 'APLICADO 0030_reserva_atomica.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0030_reserva_atomica.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0031_reserva_grants.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0031: grants das funções de reserva atômica (checkout chama via RPC).
-- Idempotente. Rode no SQL Editor APÓS 0030.

GRANT EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) TO service_role;
$body$;
  RAISE NOTICE 'APLICADO 0031_reserva_grants.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0031_reserva_grants.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0032_entrega_fase3.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0032: entrega fase 3 — vínculo motoboy×usuário, endereço completo, avisos.
-- Idempotente. Rode no SQL Editor APÓS 0031.

-- 1) motoboys.user_id: o app grava status por usuário logado (retornando_base etc.)
ALTER TABLE public.motoboys ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS motoboys_user_idx ON public.motoboys (user_id);

DROP POLICY IF EXISTS "motoboys self read" ON public.motoboys;
CREATE POLICY "motoboys self read" ON public.motoboys FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "motoboys self insert" ON public.motoboys;
CREATE POLICY "motoboys self insert" ON public.motoboys FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "motoboys self status" ON public.motoboys;
CREATE POLICY "motoboys self status" ON public.motoboys FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2) endereço apartamento/condomínio completo (§59)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS andar text,
  ADD COLUMN IF NOT EXISTS torre text;

-- 3) avisos: motoboy precisa inserir (retorno à base); staff lê; grants faltavam
GRANT ALL ON public.notificacoes TO authenticated;

DROP POLICY IF EXISTS "notificacoes motoboy insert" ON public.notificacoes;
CREATE POLICY "notificacoes motoboy insert" ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente')
    OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'motoboy')
    OR public.has_role(auth.uid(),'financeiro')
  );

DROP POLICY IF EXISTS "notificacoes motoboy read" ON public.notificacoes;
CREATE POLICY "notificacoes motoboy read" ON public.notificacoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente')
    OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'motoboy')
    OR public.has_role(auth.uid(),'financeiro')
  );
$body$;
  RAISE NOTICE 'APLICADO 0032_entrega_fase3.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0032_entrega_fase3.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0033_fiscal_base.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0033: fiscal base — empresa, documentos, eventos, dados fiscais de produto/cliente.
-- NENHUM valor tributário é preenchido: tudo nullable, "configuração fiscal pendente".
-- Idempotente. Rode no SQL Editor APÓS 0032.

-- Empresa (singleton id=true). Ambiente separa homologação de produção.
CREATE TABLE IF NOT EXISTS public.empresa_fiscal (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  razao_social text NOT NULL DEFAULT '',
  nome_fantasia text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  inscricao_estadual text NOT NULL DEFAULT '',
  inscricao_municipal text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  numero text NOT NULL DEFAULT '',
  complemento text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  uf text NOT NULL DEFAULT 'SP',
  cep text NOT NULL DEFAULT '',
  regime_tributario text NOT NULL DEFAULT '',
  serie text NOT NULL DEFAULT '',
  numero_inicial integer NOT NULL DEFAULT 1,
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao','producao')),
  modelo_padrao text NOT NULL DEFAULT '' CHECK (modelo_padrao IN ('','55','65')),
  provedor text NOT NULL DEFAULT '',
  csc_id text NOT NULL DEFAULT '',
  info_adicionais text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.empresa_fiscal (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Documentos fiscais: UM por pedido (UNIQUE = idempotência fiscal).
CREATE TABLE IF NOT EXISTS public.documentos_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pedidos(id) ON DELETE CASCADE,
  modelo text NOT NULL DEFAULT '' CHECK (modelo IN ('','55','65')),
  serie text NOT NULL DEFAULT '',
  numero integer,
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao','producao')),
  status text NOT NULL DEFAULT 'nao_emitida' CHECK (status IN ('nao_emitida','em_processamento','autorizada','rejeitada','cancelada','inutilizada','contingencia','pendente','erro_comunicacao')),
  chave_acesso text,
  protocolo text,
  codigo_rejeicao text,
  mensagem_rejeicao text,
  xml text,
  danfe_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS docs_pedido_idx ON public.documentos_fiscais (pedido_id);
CREATE INDEX IF NOT EXISTS docs_status_idx ON public.documentos_fiscais (status);

-- Histórico de tentativas (nunca apagar)
CREATE TABLE IF NOT EXISTS public.documento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos_fiscais(id) ON DELETE CASCADE,
  evento text NOT NULL,
  detalhe text NOT NULL DEFAULT '',
  actor uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS docev_doc_idx ON public.documento_eventos (documento_id);

-- Dados fiscais do produto (preenchidos pelo contador; NULL = pendente)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS descricao_fiscal text,
  ADD COLUMN IF NOT EXISTS ncm text,
  ADD COLUMN IF NOT EXISTS cest text,
  ADD COLUMN IF NOT EXISTS cfop_padrao text,
  ADD COLUMN IF NOT EXISTS cst text,
  ADD COLUMN IF NOT EXISTS csosn text,
  ADD COLUMN IF NOT EXISTS origem_mercadoria text,
  ADD COLUMN IF NOT EXISTS gtin text;

-- Destinatário (checkout opcional, §47) + origem do cliente (§61, só 1º pedido)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cpf_cnpj text,
  ADD COLUMN IF NOT EXISTS nome_fiscal text,
  ADD COLUMN IF NOT EXISTS origem_cliente text;

-- RLS: fiscal é administrativo
ALTER TABLE public.empresa_fiscal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal admin" ON public.empresa_fiscal;
CREATE POLICY "fiscal admin" ON public.empresa_fiscal FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "fiscal docs admin" ON public.documentos_fiscais;
CREATE POLICY "fiscal docs admin" ON public.documentos_fiscais FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "fiscal docs own read" ON public.documentos_fiscais;
CREATE POLICY "fiscal docs own read" ON public.documentos_fiscais FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "fiscal ev staff" ON public.documento_eventos;
CREATE POLICY "fiscal ev staff" ON public.documento_eventos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

GRANT ALL ON public.empresa_fiscal, public.documentos_fiscais, public.documento_eventos TO authenticated;
$body$;
  RAISE NOTICE 'APLICADO 0033_fiscal_base.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0033_fiscal_base.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0034_fila_cliente.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0034: impressão automática — cliente enfileira o próprio pedido.
-- O checkout insere em fila_impressao como o cliente logado; a policy 0025
-- só permitia staff, então o insert caía em silêncio e nada imprimia.
-- Regra mínima: só o dono, só tipo pedido, só pendente, só uuid do evento confirmado.
-- Idempotente.

DROP POLICY IF EXISTS "fila dono insert" ON public.fila_impressao;
CREATE POLICY "fila dono insert" ON public.fila_impressao FOR INSERT TO authenticated
  WITH CHECK (
    tipo = 'pedido'
    AND status = 'pendente'
    AND trabalho_uuid = pedido_id::text || ':confirmado'
    AND EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.user_id = auth.uid())
  );

-- Histórico do nascimento do pedido (recebido): mesmo motivo, mesmo remédio.
DROP POLICY IF EXISTS "hist dono insert" ON public.pedido_status_historico;
CREATE POLICY "hist dono insert" ON public.pedido_status_historico FOR INSERT TO authenticated
  WITH CHECK (
    de_status IS NULL
    AND para_status = 'recebido'
    AND EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.user_id = auth.uid())
  );
$body$;
  RAISE NOTICE 'APLICADO 0034_fila_cliente.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0034_fila_cliente.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0035_loja_social.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0035: loja social — links usados no "enquanto preparamos" e no convite Google.
-- Tudo opcional: a UI só mostra o que estiver preenchido. Idempotente.
ALTER TABLE public.loja_config
  ADD COLUMN IF NOT EXISTS instagram text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS facebook text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS site text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_avaliacao text NOT NULL DEFAULT '';
$body$;
  RAISE NOTICE 'APLICADO 0035_loja_social.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0035_loja_social.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0036_fritura_produto.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0036: fritura por produto — tempo de 50un configurável (padrão 210s = 3:30).
-- NULL = usa o padrão. Idempotente.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tempo_fritura_s integer;
$body$;
  RAISE NOTICE 'APLICADO 0036_fritura_produto.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0036_fritura_produto.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0037_pedidos_cep.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0037: CEP do endereço de entrega (comanda + fiscal futuro). Idempotente.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cep text;
$body$;
  RAISE NOTICE 'APLICADO 0037_pedidos_cep.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0037_pedidos_cep.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0038_cardapio_sabores.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0038: cardápio completo — 26 sabores em frito (combo_50) + congelado (unidade).
-- Idempotente: só insere o que ainda não existe (mesmo nome + tipo_venda).
-- REGRA DE PREÇO (revisar no /admin → Produtos se necessário):
--   fritos novos = mesmo preço dos irmãos da categoria (bolinhas 1.60, resto 2.30, pizzas 3.70);
--   congelados = 50x o preço unitário do frito (ex: 1.60 -> 80.00).
-- Doguinho NÃO incluído (substituído por enroladinho de salsicha, que já existe).

-- ---------- FRITOS (combo_50) que faltavam ----------
INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Bolinha de calabresa 25un', 1.60, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'bolinha de calabresa 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Bolinha de milho 25un', 1.60, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'bolinha de milho 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Bolinha de azeitona 25un', 1.60, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'bolinha de azeitona 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Trouxinha de milho com catupiry 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'trouxinha de milho com catupiry 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Trouxinha de calabresa 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'trouxinha de calabresa 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Trouxinha de ricota com zaatar 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'trouxinha de ricota com zaatar 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Hamburguinho 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'hamburguinho 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'e08980d5-ea59-4195-a535-b3f48275ea45', 'Pastel de palmito 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'pastel de palmito 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'f2302053-a296-43d0-8733-bb3caaf6871b', 'Esfiha de frango 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'esfiha de frango 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'f2302053-a296-43d0-8733-bb3caaf6871b', 'Esfiha de brocolis 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'esfiha de brocolis 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Enroladinho de presunto e queijo 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'enroladinho de presunto e queijo 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT '74dc1431-b9c1-4146-a1fb-f670227225cd', 'Mini pizza de presunto e queijo 25un', 3.70, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'mini pizza de presunto e queijo 25un' AND tipo_venda = 'combo_50');

-- ---------- CONGELADOS (unidade, Mini Congelados) ----------
INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'a0fe8d5a-8275-4656-b2c6-5a7beadd9297', n.nome, n.preco, 'unidade', true, 100
FROM (VALUES
  ('Coxinha Congelada 50un', 80.00),
  ('Bolinha de queijo Congelada 50un', 80.00),
  ('Risole de carne Congelado 50un', 80.00),
  ('Bolinha de calabresa Congelada 50un', 80.00),
  ('Bolinha de milho Congelada 50un', 80.00),
  ('Bolinha de azeitona Congelada 50un', 80.00),
  ('Trouxinha de milho com catupiry Congelada 50un', 115.00),
  ('Kibe Congelado 50un', 80.00),
  ('Croquete de frango Congelado 50un', 80.00),
  ('Pastel de carne Congelado 50un', 115.00),
  ('Pastel de queijo Congelado 50un', 115.00),
  ('Pastel de pizza Congelado 50un', 115.00),
  ('Pastel de palmito Congelado 50un', 115.00),
  ('Esfiha de carne Congelada 50un', 115.00),
  ('Esfiha de frango Congelada 50un', 115.00),
  ('Esfiha de brocolis Congelada 50un', 115.00),
  ('Enroladinho de presunto e queijo Congelado 50un', 115.00),
  ('Trouxinha de calabresa Congelada 50un', 115.00),
  ('Hamburguinho Congelado 50un', 115.00),
  ('Enroladinho de salsicha Congelado 50un', 115.00),
  ('Trouxinha de ricota com zaatar Congelada 50un', 115.00),
  ('Mini pizza de calabresa Congelada 50un', 185.00),
  ('Mini pizza de mussarela Congelada 50un', 185.00),
  ('Mini pizza de presunto e queijo Congelada 50un', 185.00),
  ('Empadinha de frango Congelada 50un', 120.00),
  ('Empadinha de palmito Congelada 50un', 120.00)
) AS n(nome, preco)
WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE lower(p.nome) = lower(n.nome) AND p.tipo_venda = 'unidade');
$body$;
  RAISE NOTICE 'APLICADO 0038_cardapio_sabores.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0038_cardapio_sabores.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0039_tipo_venda_produto.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0039: tipo_venda, destaque, custo, embalagem_custo em produtos
-- Idempotente. Rode APÓS 0038.

-- Enum para tipo_venda
DO $t$
BEGIN
  CREATE TYPE public.tipo_venda AS ENUM ('combo_50', 'unidade');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;

-- Colunas novas
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_venda public.tipo_venda NOT NULL DEFAULT 'combo_50',
  ADD COLUMN IF NOT EXISTS destaque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custo numeric(10,2),
  ADD COLUMN IF NOT EXISTS embalagem_custo numeric(10,2);

-- Índices
CREATE INDEX IF NOT EXISTS produtos_tipo_venda_idx ON public.produtos (tipo_venda);
CREATE INDEX IF NOT EXISTS produtos_destaque_idx ON public.produtos (destaque) WHERE destaque = true;

-- Classificação inicial baseada na categoria atual
-- congelados, bebidas, kits = unidade | demais = combo_50
UPDATE public.produtos p
SET tipo_venda = CASE
  WHEN c.slug IN ('mini-congelados', 'bebidas', 'kits-para-festa') THEN 'unidade'::public.tipo_venda
  ELSE 'combo_50'::public.tipo_venda
END
FROM public.categorias c
WHERE p.categoria_id = c.id
  AND p.tipo_venda = 'combo_50'; -- só atualiza os que ainda estão no default

-- Comentários
COMMENT ON COLUMN public.produtos.tipo_venda IS 'combo_50 = múltiplos de 50; unidade = venda avulsa';
COMMENT ON COLUMN public.produtos.destaque IS 'Aparece na seção Destaques do cardápio';
COMMENT ON COLUMN public.produtos.custo IS 'Custo unitário do produto (para rentabilidade)';
COMMENT ON COLUMN public.produtos.embalagem_custo IS 'Custo de embalagem por unidade';$body$;
  RAISE NOTICE 'APLICADO 0039_tipo_venda_produto.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0039_tipo_venda_produto.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0040_pedido_cidade_status.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0040: cidade em pedidos + status estendidos + agendado_para + confirmado_em
-- Idempotente. Rode APÓS 0039.

-- Nova coluna cidade em pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cidade text NOT NULL DEFAULT '';

-- Estender enum order_status com novos status
-- Nota: não podemos alterar enum diretamente, criamos novo e migramos
-- Mas por enquanto adicionamos campos complementares

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS agendado_para timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS pago_em timestamptz;

-- Índices
CREATE INDEX IF NOT EXISTS pedidos_cidade_idx ON public.pedidos (cidade);
CREATE INDEX IF NOT EXISTS pedidos_agendado_para_idx ON public.pedidos (agendado_para);
CREATE INDEX IF NOT EXISTS pedidos_confirmado_em_idx ON public.pedidos (confirmado_em);

-- Comentários
COMMENT ON COLUMN public.pedidos.cidade IS 'Cidade de entrega (obrigatória no checkout)';
COMMENT ON COLUMN public.pedidos.agendado_para IS 'Data/hora agendada para entrega/retirada';
COMMENT ON COLUMN public.pedidos.confirmado_em IS 'Timestamp da confirmação de pagamento/pedido';
COMMENT ON COLUMN public.pedidos.pago_em IS 'Timestamp da confirmação de pagamento (pix/dinheiro)';$body$;
  RAISE NOTICE 'APLICADO 0040_pedido_cidade_status.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0040_pedido_cidade_status.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0041_status_transicoes_rls.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0041: Endurecer RLS pedido_itens + transições de status
-- Idempotente. Rode APÓS 0040.

-- =============================================
-- 1. Endurecer RLS de pedido_itens (valida ownership/papel)
-- =============================================
DROP POLICY IF EXISTS "itens select" ON public.pedido_itens;
DROP POLICY IF EXISTS "itens insert" ON public.pedido_itens;

CREATE POLICY "itens select" ON public.pedido_itens FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND (
        p.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'producao')
        OR (public.has_role(auth.uid(), 'motoboy') AND (p.motoboy_id = auth.uid() OR (p.motoboy_id IS NULL AND p.status IN ('pronto', 'aguardando_motoboy'))))
      )
  )
);

CREATE POLICY "itens insert" ON public.pedido_itens FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND p.user_id = auth.uid()
  )
);

-- =============================================
-- 2. Tabela de transições permitidas + trigger
-- =============================================
CREATE TABLE IF NOT EXISTS public.pedido_status_transicoes (
  de_status public.order_status NOT NULL,
  para_status public.order_status NOT NULL,
  PRIMARY KEY (de_status, para_status)
);

-- Transições válidas padrão
INSERT INTO public.pedido_status_transicoes (de_status, para_status) VALUES
  -- Fluxo normal
  ('recebido', 'em_producao'),
  ('recebido', 'cancelado'),
  ('em_producao', 'pronto'),
  ('em_producao', 'cancelado'),
  ('pronto', 'aguardando_motoboy'),
  ('pronto', 'cancelado'),
  ('aguardando_motoboy', 'em_rota'),
  ('aguardando_motoboy', 'cancelado'),
  ('em_rota', 'entregue'),
  ('em_rota', 'cancelado'),
  -- Retirada
  ('pronto', 'entregue'),
  -- Permitir voltar um passo (override admin com justificativa)
  ('em_producao', 'recebido'),
  ('pronto', 'em_producao'),
  ('aguardando_motoboy', 'pronto'),
  ('em_rota', 'aguardando_motoboy')
ON CONFLICT DO NOTHING;

-- Trigger para validar transição
CREATE OR REPLACE FUNCTION public.validar_transicao_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  eh_admin boolean := public.has_role(auth.uid(), 'admin');
BEGIN
  -- Se não mudou, ignora
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Admin pode tudo (com auditoria posterior)
  IF eh_admin THEN
    RETURN NEW;
  END IF;

  -- Verifica se transição é permitida
  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_status_transicoes
    WHERE de_status = OLD.status AND para_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'Transição de status não permitida: % → %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

-- Aplica trigger
DROP TRIGGER IF EXISTS trigger_validar_transicao ON public.pedidos;
CREATE TRIGGER trigger_validar_transicao
  BEFORE UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_transicao_status();

-- Comentários
COMMENT ON TABLE public.pedido_status_transicoes IS 'Transições de status permitidas (admin ignora via role).';$body$;
  RAISE NOTICE 'APLICADO 0041_status_transicoes_rls.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0041_status_transicoes_rls.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0042_estoque_reserva_fefo.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0042: estoque_movimentacoes + reserva atômica FEFO
-- Idempotente. Rode APÓS 0041.

-- =============================================
-- 1. Tabela de movimentações de estoque
-- =============================================
DO $$ BEGIN
DO $t$
BEGIN
  CREATE TYPE public.tipo_mov_estoque AS ENUM ('entrada_producao', 'entrada_manual', 'venda', 'reserva', 'liberacao', 'cancelamento', 'perda', 'vencimento', 'ajuste', 'devolucao', 'degustacao');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  tipo public.tipo_mov_estoque NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade != 0),
  saldo_anterior integer NOT NULL,
  saldo_posterior integer NOT NULL,
  referencia_id uuid, -- pedido_id, degustacao_id, etc.
  referencia_tipo text, -- 'pedido', 'degustacao', 'lote', 'manual'
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS est_mov_produto_idx ON public.estoque_movimentacoes (produto_id);
CREATE INDEX IF NOT EXISTS est_mov_lote_idx ON public.estoque_movimentacoes (lote_id);
CREATE INDEX IF NOT EXISTS est_mov_tipo_idx ON public.estoque_movimentacoes (tipo);
CREATE INDEX IF NOT EXISTS est_mov_created_idx ON public.estoque_movimentacoes (created_at);

-- =============================================
-- 2. Função helper para registrar movimentação
-- =============================================
CREATE OR REPLACE FUNCTION public.registrar_mov_estoque(
  p_produto_id uuid,
  p_tipo public.tipo_mov_estoque,
  p_quantidade integer,
  p_lote_id uuid DEFAULT NULL,
  p_referencia_id uuid DEFAULT NULL,
  p_referencia_tipo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_saldo_anterior integer;
  v_saldo_posterior integer;
BEGIN
  -- Trava o produto para evitar race condition
  PERFORM * FROM public.produtos WHERE id = p_produto_id FOR UPDATE;

  SELECT estoque INTO v_saldo_anterior FROM public.produtos WHERE id = p_produto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado: %', p_produto_id;
  END IF;

  v_saldo_posterior := v_saldo_anterior + p_quantidade;
  IF v_saldo_posterior < 0 THEN
    RAISE EXCEPTION 'Estoque não pode ficar negativo (produto: %, atual: %, tentando: %)',
      p_produto_id, v_saldo_anterior, p_quantidade;
  END IF;

  -- Atualiza estoque do produto
  UPDATE public.produtos SET estoque = v_saldo_posterior WHERE id = p_produto_id;

  -- Registra movimentação
  INSERT INTO public.estoque_movimentacoes (
    produto_id, lote_id, tipo, quantidade,
    saldo_anterior, saldo_posterior,
    referencia_id, referencia_tipo, usuario_id, observacao
  ) VALUES (
    p_produto_id, p_lote_id, p_tipo, p_quantidade,
    v_saldo_anterior, v_saldo_posterior,
    p_referencia_id, p_referencia_tipo, p_usuario_id, p_observacao
  );
END;
$$;

-- =============================================
-- 3. Reserva atômica FEFO para pedido confirmado
-- =============================================
CREATE OR REPLACE FUNCTION public.reservar_estoque_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_qtd_restante integer;
  v_lote record;
BEGIN
  -- Valida se pedido existe e está em status confirmado
  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos
    WHERE id = p_pedido_id AND status = 'em_producao'
  ) THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está em status "em_producao": %', p_pedido_id;
  END IF;

  -- Para cada item do pedido COM produto (combo montado tem produto_id NULL:
  -- é montagem, não baixa de lote — sem este filtro a confirmação de QUALQUER
  -- combo abortava com "estoque insuficiente para produto (null)").
  FOR v_item IN
    SELECT pi.produto_id, pi.quantidade
    FROM public.pedido_itens pi
    WHERE pi.pedido_id = p_pedido_id
      AND pi.produto_id IS NOT NULL
  LOOP
    v_qtd_restante := v_item.quantidade;

    -- Busca lotes FEFO (First Expire, First Out) com saldo disponível
    FOR v_lote IN
      SELECT id, restante
      FROM public.lotes
      WHERE produto_id = v_item.produto_id
        AND status = 'ativo'
        AND restante > 0
        AND (validade IS NULL OR validade >= CURRENT_DATE)
      ORDER BY validade ASC NULLS LAST, created_at ASC
    LOOP
      IF v_qtd_restante <= 0 THEN
        EXIT;
      END IF;

      DECLARE
        v_qtd_lote integer := LEAST(v_lote.restante, v_qtd_restante);
      BEGIN
        -- Atualiza lote
        UPDATE public.lotes
        SET restante = restante - v_qtd_lote
        WHERE id = v_lote.id;

        -- Registra movimentação de reserva
        PERFORM public.registrar_mov_estoque(
          v_item.produto_id,
          'reserva',
          -v_qtd_lote,
          v_lote.id,
          p_pedido_id,
          'pedido',
          NULL,
          'Reserva FEFO para pedido #' || (
            SELECT numero::text FROM public.pedidos WHERE id = p_pedido_id
          )
        );

        v_qtd_restante := v_qtd_restante - v_qtd_lote;
      END;
    END LOOP;

    IF v_qtd_restante > 0 THEN
      RAISE EXCEPTION 'Estoque insuficiente para produto % (faltam % unidades). Lotes disponíveis: %',
        v_item.produto_id, v_qtd_restante, (
          SELECT COALESCE(SUM(restante), 0)
          FROM public.lotes
          WHERE produto_id = v_item.produto_id
            AND status = 'ativo'
            AND restante > 0
        );
    END IF;
  END LOOP;
END;
$$;

-- =============================================
-- 4. Liberação de reserva (cancelamento pedido)
-- =============================================
CREATE OR REPLACE FUNCTION public.liberar_reserva_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mov record;
BEGIN
  -- Busca movimentações de reserva deste pedido
  FOR v_mov IN
    SELECT produto_id, lote_id, ABS(quantidade) AS qtd
    FROM public.estoque_movimentacoes
    WHERE referencia_id = p_pedido_id
      AND referencia_tipo = 'pedido'
      AND tipo = 'reserva'
  LOOP
    -- Devolve ao lote
    IF v_mov.lote_id IS NOT NULL THEN
      UPDATE public.lotes
      SET restante = restante + v_mov.qtd
      WHERE id = v_mov.lote_id;
    END IF;

    -- Registra liberação
    PERFORM public.registrar_mov_estoque(
      v_mov.produto_id,
      'liberacao',
      v_mov.qtd,
      v_mov.lote_id,
      p_pedido_id,
      'pedido',
      NULL,
      'Liberação de reserva por cancelamento/alteração do pedido'
    );
  END LOOP;
END;
$$;

-- =============================================
-- 5. Trigger: ao confirmar pedido (status -> em_producao), reserva estoque
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_reservar_estoque()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'em_producao' AND OLD.status = 'recebido' THEN
    PERFORM public.reservar_estoque_pedido(NEW.id);
  ELSIF NEW.status = 'recebido' AND OLD.status = 'em_producao' THEN
    PERFORM public.liberar_reserva_pedido(NEW.id);
  ELSIF NEW.status = 'cancelado' AND OLD.status IN ('recebido', 'em_producao') THEN
    PERFORM public.liberar_reserva_pedido(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_reserva_estoque_pedido ON public.pedidos;
CREATE TRIGGER trigger_reserva_estoque_pedido
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_reservar_estoque();

-- RLS
ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "est_mov staff" ON public.estoque_movimentacoes;
CREATE POLICY "est_mov staff" ON public.estoque_movimentacoes FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'financeiro')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'financeiro')
);

COMMENT ON TABLE public.estoque_movimentacoes IS 'Todas as movimentações de estoque (FEFO, reservas, liberações, ajustes). Nunca apagar.';$body$;
  RAISE NOTICE 'APLICADO 0042_estoque_reserva_fefo.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0042_estoque_reserva_fefo.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0043_fritura_fila.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0043: fritura_fila + tempo configurável por produto
-- Idempotente. Rode APÓS 0042.

-- =============================================
-- 1. Tempo de fritura por produto (base 50un = 3:30)
-- =============================================
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tempo_fritura_base_segundos integer DEFAULT 210 CHECK (tempo_fritura_base_segundos > 0),
  ADD COLUMN IF NOT EXISTS unidade_base_tempo_fritura integer DEFAULT 50 CHECK (unidade_base_tempo_fritura > 0);

-- =============================================
-- 2. Fila de fritura
-- =============================================
CREATE TABLE IF NOT EXISTS public.fritura_fila (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  tempo_previsto_segundos integer NOT NULL CHECK (tempo_previsto_segundos > 0),
  inicio timestamptz,
  fim timestamptz,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_fritura', 'concluido', 'pausado', 'cancelado')),
  funcionario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fritura_fila_pedido_idx ON public.fritura_fila (pedido_id);
CREATE INDEX IF NOT EXISTS fritura_fila_status_idx ON public.fritura_fila (status);
CREATE INDEX IF NOT EXISTS fritura_fila_funcionario_idx ON public.fritura_fila (funcionario_id);

-- NOTA 0049: 1 linha por pedido+produto (reconfirmar nunca frita em dobro).
-- Em bancos já criados, a 0049 deduplica e adiciona a constraint.
DO $$ BEGIN
  ALTER TABLE public.fritura_fila
    ADD CONSTRAINT fritura_fila_pedido_produto_key UNIQUE (pedido_id, produto_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 3. Função para calcular tempo de fritura
-- =============================================
CREATE OR REPLACE FUNCTION public.calcular_tempo_fritura(p_produto_id uuid, p_quantidade integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base_seg integer;
  v_base_qtd integer;
  v_tempo integer;
BEGIN
  -- NOTA 0052: prefere tempo_fritura_s (campo do admin, 0036).
  SELECT COALESCE(tempo_fritura_s, tempo_fritura_base_segundos, 210),
         COALESCE(unidade_base_tempo_fritura, 50)
  INTO v_base_seg, v_base_qtd
  FROM public.produtos
  WHERE id = p_produto_id;

  IF NOT FOUND OR v_base_seg IS NULL OR v_base_seg <= 0
     OR v_base_qtd IS NULL OR v_base_qtd <= 0 THEN
    RETURN 210; -- default 3:30 (igual a SEGUNDOS_POR_50_PADRAO)
  END IF;

  -- NOTA 0052: BLOCOS (teto em lotes de base_qtd, mínimo 1 lote), espelhando
  -- src/lib/cozinha.ts. O linear antigo dava 5s p/ 1 salgado.
  -- Em bancos já criados, a 0052 sobrescreve esta função (corpo idêntico).
  v_tempo := GREATEST(1, CEIL(GREATEST(0, p_quantidade)::numeric / v_base_qtd)) * v_base_seg;
  RETURN v_tempo;
END;
$$;

-- =============================================
-- 4. Trigger: ao confirmar pedido (em_producao), cria itens na fila de fritura
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_criar_fritura_fila()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_tempo integer;
BEGIN
  IF NEW.status = 'em_producao' AND OLD.status = 'recebido' THEN
    -- Só itens com produto (combo montado tem produto_id NULL: sem este filtro
    -- o INSERT violava NOT NULL e a confirmação de QUALQUER combo abortava).
    FOR v_item IN
      SELECT pi.produto_id, pi.quantidade
      FROM public.pedido_itens pi
      WHERE pi.pedido_id = NEW.id
        AND pi.produto_id IS NOT NULL
    LOOP
      v_tempo := public.calcular_tempo_fritura(v_item.produto_id, v_item.quantidade);
      INSERT INTO public.fritura_fila (pedido_id, produto_id, quantidade, tempo_previsto_segundos)
      VALUES (NEW.id, v_item.produto_id, v_item.quantidade, v_tempo)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_criar_fritura_fila ON public.pedidos;
CREATE TRIGGER trigger_criar_fritura_fila
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_criar_fritura_fila();

-- =============================================
-- 5. RLS
-- =============================================
ALTER TABLE public.fritura_fila ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fritura staff" ON public.fritura_fila;
CREATE POLICY "fritura staff" ON public.fritura_fila FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
);

COMMENT ON TABLE public.fritura_fila IS 'Fila de fritura por pedido/produto. Tempo calculado proporcional à quantidade (base 50un).';
COMMENT ON COLUMN public.produtos.tempo_fritura_base_segundos IS 'Tempo base em segundos para unidade_base_tempo_fritura unidades (ex: 210s = 3:30 para 50un).';$body$;
  RAISE NOTICE 'APLICADO 0043_fritura_fila.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0043_fritura_fila.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0044_motoboy_rotas.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0044: motoboy_estados + rotas + historico
-- Idempotente. Rode APÓS 0043.

-- =============================================
-- 1. Enum para status do motoboy
-- =============================================
-- DO block = reexecutável (0047 repete por segurança).
DO $$ BEGIN
DO $t$
BEGIN
  CREATE TYPE public.motoboy_status AS ENUM ('disponivel_base', 'preparando_saida', 'em_rota', 'retornando_base', 'aguardando_nova_rota', 'offline');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 2. Tabela de motoboys (estende papel existente)
-- =============================================
CREATE TABLE IF NOT EXISTS public.motoboys (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  status public.motoboy_status NOT NULL DEFAULT 'offline',
  veiculo text,
  placa text,
  observacao text,
  ultima_atualizacao timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS motoboys_status_idx ON public.motoboys (status);

-- =============================================
-- 3. Tabela de rotas
-- =============================================
CREATE TABLE IF NOT EXISTS public.rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id uuid NOT NULL REFERENCES public.motoboys(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'cancelada')),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz
);

CREATE INDEX IF NOT EXISTS rotas_motoboy_idx ON public.rotas (motoboy_id);
CREATE INDEX IF NOT EXISTS rotas_status_idx ON public.rotas (status);

-- =============================================
-- 4. Pedidos na rota (ordem de entrega)
-- =============================================
CREATE TABLE IF NOT EXISTS public.rota_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  UNIQUE (rota_id, pedido_id)
);

CREATE INDEX IF NOT EXISTS rota_pedidos_rota_idx ON public.rota_pedidos (rota_id);

-- =============================================
-- 5. Histórico do motoboy (saída, entrega, retorno, atrasos)
-- =============================================
CREATE TABLE IF NOT EXISTS public.motoboy_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id uuid NOT NULL REFERENCES public.motoboys(id) ON DELETE CASCADE,
  rota_id uuid REFERENCES public.rotas(id) ON DELETE SET NULL,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  evento text NOT NULL CHECK (evento IN (
    'saida_base',
    'chegada_entrega',
    'entrega_realizada',
    'atraso',
    'retorno_base',
    'inicio_preparacao_saida',
    'fim_preparacao_saida'
  )),
  detalhe text,
  localizacao_lat double precision,
  localizacao_lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS motoboy_hist_motoboy_idx ON public.motoboy_historico (motoboy_id);
CREATE INDEX IF NOT EXISTS motoboy_hist_created_idx ON public.motoboy_historico (created_at);
CREATE INDEX IF NOT EXISTS motoboy_hist_evento_idx ON public.motoboy_historico (evento);

-- =============================================
-- 6. Enum para motivos de atraso
-- =============================================
DO $$ BEGIN
DO $t$
BEGIN
  CREATE TYPE public.atraso_motivo AS ENUM ('transito', 'chuva', 'veiculo', 'endereco', 'cliente_ausente', 'espera', 'acidente_bloqueio', 'outro');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 7. Atrasos de entrega
-- =============================================
CREATE TABLE IF NOT EXISTS public.entrega_atrasos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  motoboy_id uuid REFERENCES public.motoboys(id) ON DELETE SET NULL,
  motivo public.atraso_motivo NOT NULL,
  descricao_outro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS atrasos_pedido_idx ON public.entrega_atrasos (pedido_id);
CREATE INDEX IF NOT EXISTS atrasos_motoboy_idx ON public.entrega_atrasos (motoboy_id);
CREATE INDEX IF NOT EXISTS atrasos_criado_idx ON public.entrega_atrasos (criado_em);

-- =============================================
-- 8. RLS
-- =============================================
ALTER TABLE public.motoboys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rota_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoboy_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrega_atrasos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "motoboys staff" ON public.motoboys;
CREATE POLICY "motoboys staff" ON public.motoboys FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "rotas staff" ON public.rotas;
CREATE POLICY "rotas staff" ON public.rotas FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "rota_pedidos staff" ON public.rota_pedidos;
CREATE POLICY "rota_pedidos staff" ON public.rota_pedidos FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "motoboy_hist staff" ON public.motoboy_historico;
CREATE POLICY "motoboy_hist staff" ON public.motoboy_historico FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "atrasos staff" ON public.entrega_atrasos;
CREATE POLICY "atrasos staff" ON public.entrega_atrasos FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

-- Comentários
COMMENT ON TYPE public.motoboy_status IS 'disponivel_base, preparando_saida, em_rota, retornando_base, aguardando_nova_rota, offline';
COMMENT ON TYPE public.atraso_motivo IS 'Motivos padronizados de atraso de entrega';$body$;
  RAISE NOTICE 'APLICADO 0044_motoboy_rotas.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0044_motoboy_rotas.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0045_entrega_apartamento.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0045: endereco_entrega completo + tipos de imovel + mensagem condominio
-- Idempotente. Rode APÓS 0044.

-- =============================================
-- 1. Endereço de entrega estruturado (já existe em pedidos, mas vamos garantir)
-- =============================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo_imovel text CHECK (tipo_imovel IN ('casa', 'apartamento')),
  ADD COLUMN IF NOT EXISTS apartamento text,
  ADD COLUMN IF NOT EXISTS bloco text,
  ADD COLUMN IF NOT EXISTS torre text,
  ADD COLUMN IF NOT EXISTS andar text,
  ADD COLUMN IF NOT EXISTS interfone text,
  ADD COLUMN IF NOT EXISTS pode_subir boolean DEFAULT false;

-- =============================================
-- 2. Trigger: ao sair para entrega, atualiza status motoboy + histórico
-- =============================================
-- NOTA 0047: pedidos.motoboy_id é auth.users.id (0000 + motoboy.tsx), então o
-- vínculo resolve via motoboys.user_id. Sem vínculo: troca o status sem
-- histórico (nunca aborta a entrega por FK).
CREATE OR REPLACE FUNCTION public.trigger_saida_motoboy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mb uuid;
BEGIN
  IF NEW.status = 'em_rota' AND OLD.status = 'aguardando_motoboy' AND NEW.motoboy_id IS NOT NULL THEN
    SELECT id INTO v_mb FROM public.motoboys WHERE user_id = NEW.motoboy_id;
    IF v_mb IS NOT NULL THEN
      -- Atualiza motoboy
      UPDATE public.motoboys
      SET status = 'em_rota',
          ultima_atualizacao = now()
      WHERE id = v_mb;

      -- Histórico
      INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
      VALUES (
        v_mb,
        NULL,
        NEW.id,
        'saida_base',
        'Iniciou rota de entrega para pedido #' || NEW.numero
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================
-- 3. Trigger: ao entregar, atualiza motoboy + histórico
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_entrega_motoboy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mb uuid;
  v_restam integer;
BEGIN
  IF NEW.status = 'entregue' AND OLD.status = 'em_rota' AND NEW.motoboy_id IS NOT NULL THEN
    SELECT id INTO v_mb FROM public.motoboys WHERE user_id = NEW.motoboy_id;
    IF v_mb IS NOT NULL THEN
      -- Atualiza motoboy
      UPDATE public.motoboys
      SET status = 'retornando_base',
          ultima_atualizacao = now()
      WHERE id = v_mb;

      -- Histórico
      INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
      VALUES (
        v_mb,
        NULL,
        NEW.id,
        'entrega_realizada',
        'Entregue pedido #' || NEW.numero || ' para ' || NEW.cliente_nome
      );

      -- Verifica se motoboy tem mais pedidos em rota
      SELECT count(*) INTO v_restam FROM public.pedidos
      WHERE motoboy_id = NEW.motoboy_id
        AND status IN ('em_rota', 'aguardando_motoboy');

      IF v_restam = 0 THEN
        -- Se não tem mais, marca como aguardando nova rota
        UPDATE public.motoboys
        SET status = 'aguardando_nova_rota',
            ultima_atualizacao = now()
        WHERE id = v_mb;

        INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
        VALUES (
          v_mb,
          NULL,
          NEW.id,
          'retorno_base',
          'Retornando à base - sem mais pedidos em rota'
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Aplica triggers
DROP TRIGGER IF EXISTS trigger_saida_motoboy ON public.pedidos;
CREATE TRIGGER trigger_saida_motoboy
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_saida_motoboy();

DROP TRIGGER IF EXISTS trigger_entrega_motoboy ON public.pedidos;
CREATE TRIGGER trigger_entrega_motoboy
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_entrega_motoboy();

-- =============================================
-- 4. Função: mensagem automática para apartamento/condomínio
-- =============================================
CREATE OR REPLACE FUNCTION public.gerar_msg_apartamento(p_pedido_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pedido record;
  v_msg text;
BEGIN
  SELECT tipo_imovel, apartamento, bloco, torre, andar, interfone, pode_subir, cliente_nome
  INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id;

  IF NOT FOUND OR v_pedido.tipo_imovel != 'apartamento' THEN
    RETURN NULL;
  END IF;

  v_msg := '🛵 Seu pedido já saiu para entrega!' || E'\n\n';

  IF v_pedido.pode_subir THEN
    v_msg := v_msg || 'Você autorizou que o motoboy suba até o apartamento. ';
  ELSE
    v_msg := v_msg || 'Se possível, pedimos que aguarde o motoboy na portaria no momento da chegada. 😊' || E'\n\n';
    v_msg := v_msg || 'Isso ajuda a agilizar sua entrega e também as próximas entregas da nossa rota.' || E'\n\n';
    v_msg := v_msg || 'Obrigado pela compreensão! ❤️';
  END IF;

  -- Info extra para o motoboy
  v_msg := v_msg || E'\n\n📍 Detalhes do local:';
  IF v_pedido.apartamento IS NOT NULL AND v_pedido.apartamento != '' THEN
    v_msg := v_msg || E'\n• Apartamento: ' || v_pedido.apartamento;
  END IF;
  IF v_pedido.bloco IS NOT NULL AND v_pedido.bloco != '' THEN
    v_msg := v_msg || E'\n• Bloco: ' || v_pedido.bloco;
  END IF;
  IF v_pedido.torre IS NOT NULL AND v_pedido.torre != '' THEN
    v_msg := v_msg || E'\n• Torre: ' || v_pedido.torre;
  END IF;
  IF v_pedido.andar IS NOT NULL AND v_pedido.andar != '' THEN
    v_msg := v_msg || E'\n• Andar: ' || v_pedido.andar;
  END IF;
  IF v_pedido.interfone IS NOT NULL AND v_pedido.interfone != '' THEN
    v_msg := v_msg || E'\n• Interfone: ' || v_pedido.interfone;
  END IF;

  RETURN v_msg;
END;
$$;

-- =============================================
-- 5. Trigger: ao criar pedido com apartamento, envia mensagem automática
-- =============================================
-- (O envio real é via WhatsApp no frontend/backend, esta função serve para gerar o texto)

-- =============================================
-- 6. Trigger: ao agendar, valida endereço completo
-- =============================================
CREATE OR REPLACE FUNCTION public.validar_endereco_entrega()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo_entrega = 'entrega' THEN
    IF NEW.endereco IS NULL OR NEW.endereco = '' THEN
      RAISE EXCEPTION 'Endereço é obrigatório para entrega';
    END IF;
    IF NEW.bairro IS NULL OR NEW.bairro = '' THEN
      RAISE EXCEPTION 'Bairro é obrigatório para entrega';
    END IF;
    IF NEW.cidade IS NULL OR NEW.cidade = '' THEN
      RAISE EXCEPTION 'Cidade é obrigatória para entrega';
    END IF;
    IF NEW.tipo_imovel = 'apartamento' THEN
      IF NEW.apartamento IS NULL OR NEW.apartamento = '' THEN
        RAISE EXCEPTION 'Número do apartamento é obrigatório';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- NOTA 0047: escopo restrito a colunas de endereço — troca de status (motoboy,
-- admin) nunca é barrada por endereço legado sem cidade.
DROP TRIGGER IF EXISTS trigger_validar_endereco ON public.pedidos;
CREATE TRIGGER trigger_validar_endereco
  BEFORE INSERT OR UPDATE OF tipo_entrega, endereco, bairro, cidade, tipo_imovel, apartamento
  ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_endereco_entrega();

COMMENT ON TABLE public.pedidos IS '...';
COMMENT ON COLUMN public.pedidos.tipo_imovel IS 'casa | apartamento (para mensagem automática condominio)';
COMMENT ON COLUMN public.pedidos.pode_subir IS 'Se true, motoboy sobe até o apto; se false, cliente aguarda na portaria';$body$;
  RAISE NOTICE 'APLICADO 0045_entrega_apartamento.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0045_entrega_apartamento.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0046_fiscal_integracao.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0046: Fiscal provider config + certificado ref + documento_fiscal_itens
-- Idempotente. Rode APÓS 0045.

-- =============================================
-- 1. Configuração do provedor fiscal (Focus NFe, Nuvem Fiscal, etc.)
-- =============================================
CREATE TABLE IF NOT EXISTS public.fiscal_provedor_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  provedor text NOT NULL DEFAULT 'focus' CHECK (provedor IN ('focus', 'nuvem_fiscal', 'tecnospeed', 'sefaz_direto')),
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao')),
  url_base text NOT NULL DEFAULT '',
  token text NOT NULL DEFAULT '',
  timeout_segundos integer NOT NULL DEFAULT 30,
  homologacao_url text,
  producao_url text,
  homologacao_token text,
  producao_token text,
  certificado_ref text, -- referência ao certificado no cofre (Azure Key Vault, AWS Secrets, etc.)
  certificado_senha_ref text,
  csc_id text,
  csc_token text,
  contingencia_habilitada boolean NOT NULL DEFAULT false,
  contingencia_tipo text CHECK (contingencia_tipo IN ('SVC-AN', 'SVC-RS', 'offline')),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.fiscal_provedor_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. Certificados digitais (referência segura, nunca armazena o .pfx aqui)
-- =============================================
CREATE TABLE IF NOT EXISTS public.fiscal_certificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id boolean NOT NULL DEFAULT true REFERENCES public.empresa_fiscal(id),
  nome text NOT NULL, -- ex: "Certificado A1 Produção"
  tipo text NOT NULL CHECK (tipo IN ('A1', 'A3')),
  ref_cofre text NOT NULL, -- URI/secreto no Azure Key Vault / AWS Secrets Manager / HashiCorp Vault
  senha_ref_cofre text, -- referência separada para a senha
  cnpj_titular text NOT NULL,
  validade_inicio date,
  validade_fim date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'vencido', 'revogado', 'teste')),
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao')),
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_cert_empresa_idx ON public.fiscal_certificados (empresa_id);
CREATE INDEX IF NOT EXISTS fiscal_cert_status_idx ON public.fiscal_certificados (status);

-- =============================================
-- 3. Itens fiscais do documento (dados por item para geração XML)
-- =============================================
CREATE TABLE IF NOT EXISTS public.documento_fiscal_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos_fiscais(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  n_item integer NOT NULL, -- número sequencial do item na nota (1, 2, 3...)
  codigo_produto text NOT NULL,
  descricao text NOT NULL,
  ncm text,
  cest text,
  cfop text,
  unidade text NOT NULL DEFAULT 'UN',
  quantidade numeric(10,3) NOT NULL,
  valor_unitario numeric(10,2) NOT NULL,
  valor_total numeric(10,2) NOT NULL,
  -- ICMS
  icms_origem text CHECK (icms_origem IN ('0','1','2','3','4','5','6','7','8')),
  icms_cst text,
  icms_csosn text,
  icms_aliquota numeric(5,2),
  icms_valor numeric(10,2),
  icms_base numeric(10,2),
  -- IPI
  ipi_cst text,
  ipi_aliquota numeric(5,2),
  ipi_valor numeric(10,2),
  -- PIS
  pis_cst text,
  pis_aliquota numeric(5,2),
  pis_valor numeric(10,2),
  -- COFINS
  cofins_cst text,
  cofins_aliquota numeric(5,2),
  cofins_valor numeric(10,2),
  -- Informações adicionais
  inf_adicionais text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_fiscal_itens_doc_idx ON public.documento_fiscal_itens (documento_id);
CREATE INDEX IF NOT EXISTS doc_fiscal_itens_prod_idx ON public.documento_fiscal_itens (produto_id);

-- =============================================
-- 4. Trigger: valida dados fiscais obrigatórios antes de emitir
-- =============================================
CREATE OR REPLACE FUNCTION public.validar_dados_fiscais_emissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa record;
  v_item record;
  v_faltando text[];
BEGIN
  -- Só valida em transição para em_processamento/autorizada
  IF NEW.status NOT IN ('em_processamento', 'autorizada') THEN
    RETURN NEW;
  END IF;

  -- Valida empresa
  SELECT * INTO v_empresa FROM public.empresa_fiscal WHERE id = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração fiscal da empresa não encontrada (execute migração 0033)';
  END IF;

  v_faltando := ARRAY[]::text[];
  IF v_empresa.razao_social = '' THEN v_faltando := array_append(v_faltando, 'razao_social'); END IF;
  IF v_empresa.cnpj = '' THEN v_faltando := array_append(v_faltando, 'cnpj'); END IF;
  IF v_empresa.inscricao_estadual = '' THEN v_faltando := array_append(v_faltando, 'inscricao_estadual'); END IF;
  IF v_empresa.endereco = '' THEN v_faltando := array_append(v_faltando, 'endereco'); END IF;
  IF v_empresa.cidade = '' THEN v_faltando := array_append(v_faltando, 'cidade'); END IF;
  IF v_empresa.uf = '' THEN v_faltando := array_append(v_faltando, 'uf'); END IF;
  IF v_empresa.cep = '' THEN v_faltando := array_append(v_faltando, 'cep'); END IF;
  IF v_empresa.regime_tributario = '' THEN v_faltando := array_append(v_faltando, 'regime_tributario'); END IF;
  IF v_empresa.serie = '' THEN v_faltando := array_append(v_faltando, 'serie'); END IF;
  IF v_empresa.modelo_padrao = '' THEN v_faltando := array_append(v_faltando, 'modelo_padrao (55 ou 65)'); END IF;
  IF v_empresa.ambiente = '' THEN v_faltando := array_append(v_faltando, 'ambiente'); END IF;
  IF v_empresa.provedor = '' THEN v_faltando := array_append(v_faltando, 'provedor'); END IF;

  IF array_length(v_faltando, 1) > 0 THEN
    RAISE EXCEPTION 'Configuração fiscal incompleta. Faltam: %', array_to_string(v_faltando, ', ');
  END IF;

  -- Itens avulsos (combo montado, produto_id NULL) não têm NCM próprio:
  -- bloqueia com mensagem clara em vez de emitir com tributo inventado.
  IF EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    WHERE pi.pedido_id = NEW.pedido_id AND pi.produto_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Pedido tem item avulso/combo sem produto vinculado. Desmembre em sabores com NCM/CFOP ou cadastre um produto kit antes de emitir.';
  END IF;

  -- Valida itens fiscais do pedido (usa NEW.pedido_id: no BEFORE INSERT a
  -- linha ainda não existe na tabela, então subquery em documentos_fiscais
  -- retornaria NULL e a validação seria silenciosamente pulada).
  FOR v_item IN
    SELECT DISTINCT p.id, p.nome, p.ncm, p.cst, p.csosn, p.cfop_padrao, p.origem_mercadoria
    FROM public.produtos p
    JOIN public.pedido_itens pi ON pi.produto_id = p.id
    WHERE pi.pedido_id = NEW.pedido_id
  LOOP
    v_faltando := ARRAY[]::text[];
    IF v_item.ncm IS NULL OR v_item.ncm = '' THEN v_faltando := array_append(v_faltando, 'NCM'); END IF;
    IF v_item.cst IS NULL AND v_item.csosn IS NULL THEN v_faltando := array_append(v_faltando, 'CST/CSOSN'); END IF;
    IF v_item.cfop_padrao IS NULL OR v_item.cfop_padrao = '' THEN v_faltando := array_append(v_faltando, 'CFOP'); END IF;
    IF v_item.origem_mercadoria IS NULL OR v_item.origem_mercadoria = '' THEN v_faltando := array_append(v_faltando, 'origem_mercadoria'); END IF;

    IF array_length(v_faltando, 1) > 0 THEN
      RAISE EXCEPTION 'Produto "%" sem dados fiscais obrigatórios: %', v_item.nome, array_to_string(v_faltando, ', ');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_fiscal_emissao ON public.documentos_fiscais;
CREATE TRIGGER trigger_validar_fiscal_emissao
  BEFORE INSERT OR UPDATE OF status ON public.documentos_fiscais
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_dados_fiscais_emissao();

-- RLS
ALTER TABLE public.fiscal_provedor_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_certificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_fiscal_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_provedor admin" ON public.fiscal_provedor_config;
CREATE POLICY "fiscal_provedor admin" ON public.fiscal_provedor_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "fiscal_cert admin" ON public.fiscal_certificados;
CREATE POLICY "fiscal_cert admin" ON public.fiscal_certificados FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "doc_fiscal_itens admin" ON public.documento_fiscal_itens;
CREATE POLICY "doc_fiscal_itens admin" ON public.documento_fiscal_itens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

COMMENT ON TABLE public.fiscal_provedor_config IS 'Configuração do provedor fiscal (Focus, Nuvem Fiscal, etc.). Singleton id=true.';
COMMENT ON TABLE public.fiscal_certificados IS 'Referências a certificados digitais no cofre seguro. NUNCA armazene .pfx ou senha aqui.';
COMMENT ON TABLE public.documento_fiscal_itens IS 'Dados fiscais detalhados por item para geração do XML da NF-e/NFC-e.';$body$;
  RAISE NOTICE 'APLICADO 0046_fiscal_integracao.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0046_fiscal_integracao.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0047_reconciliacao_entrega.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0047: reconciliação entrega/fiscal (pós 0044–0046).
-- Corrige 3 problemas reais que quebrariam produção:
--   (a) pedidos.motoboy_id guarda auth.users.id (não motoboys.id) — os triggers
--       0045 nunca achavam o motoboy e a escrita no histórico estourava FK,
--       abortando a saída para entrega;
--   (b) trigger_validar_endereco disparava em QUALQUER update (inclusive mudança
--       de status pelo motoboy) e barrava pedidos legados sem cidade;
--   (c) o front grava motivos novos (chuva/veiculo/endereco) mas o CHECK 0024 só
--       aceitava os nomes antigos — o atraso falhava no banco.
-- Idempotente. Rode APÓS 0046.

-- =============================================
-- 1. Garante os enums da 0044 (reexecutável)
-- =============================================
DO $$ BEGIN
  DO $t$
BEGIN
  CREATE TYPE public.motoboy_status AS ENUM ('disponivel_base', 'preparando_saida', 'em_rota', 'retornando_base', 'aguardando_nova_rota', 'offline');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DO $t$
BEGIN
  CREATE TYPE public.atraso_motivo AS ENUM ('transito', 'chuva', 'veiculo', 'endereco', 'cliente_ausente', 'espera', 'acidente_bloqueio', 'outro');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 2. Normaliza motivos legados + CHECK no vocabulário atual
-- =============================================
UPDATE public.pedidos SET atraso_motivo = 'chuva' WHERE atraso_motivo = 'chuva_via';
UPDATE public.pedidos SET atraso_motivo = 'veiculo' WHERE atraso_motivo = 'problema_veiculo';
UPDATE public.pedidos SET atraso_motivo = 'endereco' WHERE atraso_motivo IN ('endereco_dificil', 'problema_endereco');

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_atraso_motivo_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_atraso_motivo_check CHECK (
  atraso_motivo IS NULL OR atraso_motivo IN (
    'transito', 'chuva', 'veiculo', 'endereco',
    'cliente_ausente', 'espera', 'acidente_bloqueio', 'outro'
  )
);

-- =============================================
-- 3. Colunas do modelo 0044 que faltam em motoboys (0017)
-- =============================================
ALTER TABLE public.motoboys
  ADD COLUMN IF NOT EXISTS veiculo text,
  ADD COLUMN IF NOT EXISTS placa text,
  ADD COLUMN IF NOT EXISTS ultima_atualizacao timestamptz NOT NULL DEFAULT now();

-- =============================================
-- 4a. validar_endereco: só em colunas de endereço (nunca em troca de status)
-- =============================================
CREATE OR REPLACE FUNCTION public.validar_endereco_entrega()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo_entrega = 'entrega' THEN
    IF NEW.endereco IS NULL OR NEW.endereco = '' THEN
      RAISE EXCEPTION 'Endereço é obrigatório para entrega';
    END IF;
    IF NEW.bairro IS NULL OR NEW.bairro = '' THEN
      RAISE EXCEPTION 'Bairro é obrigatório para entrega';
    END IF;
    IF NEW.cidade IS NULL OR NEW.cidade = '' THEN
      RAISE EXCEPTION 'Cidade é obrigatória para entrega';
    END IF;
    IF NEW.tipo_imovel = 'apartamento' THEN
      IF NEW.apartamento IS NULL OR NEW.apartamento = '' THEN
        RAISE EXCEPTION 'Número do apartamento é obrigatório';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_endereco ON public.pedidos;
CREATE TRIGGER trigger_validar_endereco
  BEFORE INSERT OR UPDATE OF tipo_entrega, endereco, bairro, cidade, tipo_imovel, apartamento
  ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_endereco_entrega();

-- =============================================
-- 4b. saída/entrega: resolve motoboy via user_id (pedidos.motoboy_id é
-- auth.users.id, conforme 0000 + motoboy.tsx). Sem vínculo, só troca o
-- status sem histórico (nunca aborta a entrega por FK).
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_saida_motoboy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mb uuid;
BEGIN
  IF NEW.status = 'em_rota' AND OLD.status = 'aguardando_motoboy' AND NEW.motoboy_id IS NOT NULL THEN
    SELECT id INTO v_mb FROM public.motoboys WHERE user_id = NEW.motoboy_id;
    IF v_mb IS NOT NULL THEN
      UPDATE public.motoboys
      SET status = 'em_rota',
          ultima_atualizacao = now()
      WHERE id = v_mb;

      INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
      VALUES (
        v_mb,
        NULL,
        NEW.id,
        'saida_base',
        'Iniciou rota de entrega para pedido #' || NEW.numero
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_entrega_motoboy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mb uuid;
  v_restam integer;
BEGIN
  IF NEW.status = 'entregue' AND OLD.status = 'em_rota' AND NEW.motoboy_id IS NOT NULL THEN
    SELECT id INTO v_mb FROM public.motoboys WHERE user_id = NEW.motoboy_id;
    IF v_mb IS NOT NULL THEN
      UPDATE public.motoboys
      SET status = 'retornando_base',
          ultima_atualizacao = now()
      WHERE id = v_mb;

      INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
      VALUES (
        v_mb,
        NULL,
        NEW.id,
        'entrega_realizada',
        'Entregue pedido #' || NEW.numero || ' para ' || NEW.cliente_nome
      );

      SELECT count(*) INTO v_restam FROM public.pedidos
      WHERE motoboy_id = NEW.motoboy_id
        AND status IN ('em_rota', 'aguardando_motoboy');

      IF v_restam = 0 THEN
        UPDATE public.motoboys
        SET status = 'aguardando_nova_rota',
            ultima_atualizacao = now()
        WHERE id = v_mb;

        INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
        VALUES (
          v_mb,
          NULL,
          NEW.id,
          'retorno_base',
          'Retornando à base - sem mais pedidos em rota'
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_saida_motoboy ON public.pedidos;
CREATE TRIGGER trigger_saida_motoboy
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_saida_motoboy();

DROP TRIGGER IF EXISTS trigger_entrega_motoboy ON public.pedidos;
CREATE TRIGGER trigger_entrega_motoboy
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_entrega_motoboy();

COMMENT ON TRIGGER trigger_validar_endereco ON public.pedidos IS 'Escopo restrito a colunas de endereço (0047): troca de status nunca é barrada por endereço legado.';
$body$;
  RAISE NOTICE 'APLICADO 0047_reconciliacao_entrega.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0047_reconciliacao_entrega.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0048_combo_sem_produto.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0048: combos (produto_id NULL) não quebram confirmação do pedido.
-- Os triggers 0042 (reserva FEFO) e 0043 (fila de fritura) percorriam TODOS os
-- itens: o combo avulso abortava a transição recebido→em_producao ("estoque
-- insuficiente para produto null" / violação NOT NULL em fritura_fila).
-- Como o combo é o produto central (múltiplos de 50), isso travava o fluxo
-- principal. Correção: ambos ignoram itens sem produto (montagem).
-- Idempotente. Rode APÓS 0047. (Arquivos 0042/0043 já atualizados p/ fresh.)

-- Garante o enum da 0042 em reexecução
DO $$ BEGIN
DO $t$
BEGIN
  CREATE TYPE public.tipo_mov_estoque AS ENUM ('entrada_producao', 'entrada_manual', 'venda', 'reserva', 'liberacao', 'cancelamento', 'perda', 'vencimento', 'ajuste', 'devolucao', 'degustacao');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$t$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.reservar_estoque_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_qtd_restante integer;
  v_lote record;
BEGIN
  -- Valida se pedido existe e está em status confirmado
  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos
    WHERE id = p_pedido_id AND status = 'em_producao'
  ) THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está em status "em_producao": %', p_pedido_id;
  END IF;

  -- Só itens COM produto (combo montado = montagem, sem baixa de lote)
  FOR v_item IN
    SELECT pi.produto_id, pi.quantidade
    FROM public.pedido_itens pi
    WHERE pi.pedido_id = p_pedido_id
      AND pi.produto_id IS NOT NULL
  LOOP
    v_qtd_restante := v_item.quantidade;

    -- Busca lotes FEFO (First Expire, First Out) com saldo disponível
    FOR v_lote IN
      SELECT id, restante
      FROM public.lotes
      WHERE produto_id = v_item.produto_id
        AND status = 'ativo'
        AND restante > 0
        AND (validade IS NULL OR validade >= CURRENT_DATE)
      ORDER BY validade ASC NULLS LAST, created_at ASC
    LOOP
      IF v_qtd_restante <= 0 THEN
        EXIT;
      END IF;

      DECLARE
        v_qtd_lote integer := LEAST(v_lote.restante, v_qtd_restante);
      BEGIN
        -- Atualiza lote
        UPDATE public.lotes
        SET restante = restante - v_qtd_lote
        WHERE id = v_lote.id;

        -- Registra movimentação de reserva
        PERFORM public.registrar_mov_estoque(
          v_item.produto_id,
          'reserva',
          -v_qtd_lote,
          v_lote.id,
          p_pedido_id,
          'pedido',
          NULL,
          'Reserva FEFO para pedido #' || (
            SELECT numero::text FROM public.pedidos WHERE id = p_pedido_id
          )
        );

        v_qtd_restante := v_qtd_restante - v_qtd_lote;
      END;
    END LOOP;

    IF v_qtd_restante > 0 THEN
      RAISE EXCEPTION 'Estoque insuficiente para produto % (faltam % unidades). Lotes disponíveis: %',
        v_item.produto_id, v_qtd_restante, (
          SELECT COALESCE(SUM(restante), 0)
          FROM public.lotes
          WHERE produto_id = v_item.produto_id
            AND status = 'ativo'
            AND restante > 0
        );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_criar_fritura_fila()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_tempo integer;
BEGIN
  IF NEW.status = 'em_producao' AND OLD.status = 'recebido' THEN
    -- Só itens COM produto (fritura_fila.produto_id é NOT NULL)
    FOR v_item IN
      SELECT pi.produto_id, pi.quantidade
      FROM public.pedido_itens pi
      WHERE pi.pedido_id = NEW.id
        AND pi.produto_id IS NOT NULL
    LOOP
      v_tempo := public.calcular_tempo_fritura(v_item.produto_id, v_item.quantidade);
      INSERT INTO public.fritura_fila (pedido_id, produto_id, quantidade, tempo_previsto_segundos)
      VALUES (NEW.id, v_item.produto_id, v_item.quantidade, v_tempo)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reservar_estoque_pedido(uuid) IS '0048: ignora itens sem produto (combo montado = montagem, sem baixa de lote).';
COMMENT ON FUNCTION public.trigger_criar_fritura_fila() IS '0048: ignora itens sem produto (fritura_fila.produto_id é NOT NULL).';
$body$;
  RAISE NOTICE 'APLICADO 0048_combo_sem_produto.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0048_combo_sem_produto.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0049_dedup_uniques.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0049: unicidades que faltavam (idempotência real + sem fritar 2x).
--   (a) fritura_fila sem UNIQUE: o ON CONFLICT DO NOTHING nunca disparava e,
--       como 0041 permite voltar em_producao→recebido, reconfirmar o pedido
--       enfileirava tudo de novo (cozinha frita em dobro). Agora 1 linha por
--       pedido+produto.
--   (b) ajuda_artigos sem UNIQUE: reaplicar 0028 duplicava os 5 artigos.
-- Idempotente (dedup por ctid antes da constraint). Rode APÓS 0048.

-- (a) fritura_fila: mantém a linha mais antiga por pedido+produto
DELETE FROM public.fritura_fila a
USING public.fritura_fila b
WHERE a.ctid < b.ctid
  AND a.pedido_id = b.pedido_id
  AND a.produto_id IS NOT DISTINCT FROM b.produto_id;

ALTER TABLE public.fritura_fila
  DROP CONSTRAINT IF EXISTS fritura_fila_pedido_produto_key;
ALTER TABLE public.fritura_fila
  ADD CONSTRAINT fritura_fila_pedido_produto_key UNIQUE (pedido_id, produto_id);

-- (b) ajuda_artigos: mantém o artigo mais antigo por categoria+título
DELETE FROM public.ajuda_artigos a
USING public.ajuda_artigos b
WHERE a.ctid < b.ctid
  AND a.categoria = b.categoria
  AND a.titulo = b.titulo;

ALTER TABLE public.ajuda_artigos
  DROP CONSTRAINT IF EXISTS ajuda_artigos_categoria_titulo_key;
ALTER TABLE public.ajuda_artigos
  ADD CONSTRAINT ajuda_artigos_categoria_titulo_key UNIQUE (categoria, titulo);

COMMENT ON CONSTRAINT fritura_fila_pedido_produto_key ON public.fritura_fila
  IS '0049: 1 linha por pedido+produto — reconfirmar nunca frita em dobro.';
$body$;
  RAISE NOTICE 'APLICADO 0049_dedup_uniques.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0049_dedup_uniques.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0050_estoque_unico.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0050: um dono por coluna (0030 x 0042 debitavam produtos.estoque 2x).
-- Cenário: checkout reserva via 0030 (baixa produtos.estoque) e a confirmação
-- via 0042 baixava produtos.estoque DE NOVO + lotes. Cancelar sem RPC ainda
-- vazava. Regra única a partir daqui:
--   - 0030 é dona do produtos.estoque quando engajou (linhas em reservas_estoque);
--   - 0042 move LOTES e registra trilha; só encosta em produtos.estoque no modo
--     legado (sem 0030: tabela ausente ou sem linhas do pedido);
--   - no cancel, 0042 chama liberar_reserva_atomica antes de devolver os lotes,
--     então cancelar pelo admin (sem RPC no front) continua balanceado.
-- Idempotente (OR REPLACE + guards p/ 0030 ausente). Rode APÓS 0049.
-- 0050 é autoritativo nas 3 funções (0042/0048 ficam como histórico).

CREATE OR REPLACE FUNCTION public.registrar_mov_estoque(
  p_produto_id uuid,
  p_tipo public.tipo_mov_estoque,
  p_quantidade integer,
  p_lote_id uuid DEFAULT NULL,
  p_referencia_id uuid DEFAULT NULL,
  p_referencia_tipo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_atualizar_estoque boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_saldo_anterior integer;
  v_saldo_posterior integer;
BEGIN
  -- Trava o produto para evitar race condition
  PERFORM * FROM public.produtos WHERE id = p_produto_id FOR UPDATE;

  SELECT estoque INTO v_saldo_anterior FROM public.produtos WHERE id = p_produto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado: %', p_produto_id;
  END IF;

  -- Modo trilha (0030 já moveu produtos.estoque): só registra, não soma 2x
  IF p_atualizar_estoque THEN
    v_saldo_posterior := v_saldo_anterior + p_quantidade;
    IF v_saldo_posterior < 0 THEN
      RAISE EXCEPTION 'Estoque não pode ficar negativo (produto: %, atual: %, tentando: %)',
        p_produto_id, v_saldo_anterior, p_quantidade;
    END IF;

    -- Atualiza estoque do produto
    UPDATE public.produtos SET estoque = v_saldo_posterior WHERE id = p_produto_id;
  ELSE
    v_saldo_posterior := v_saldo_anterior;
  END IF;

  -- Registra movimentação
  INSERT INTO public.estoque_movimentacoes (
    produto_id, lote_id, tipo, quantidade,
    saldo_anterior, saldo_posterior,
    referencia_id, referencia_tipo, usuario_id, observacao
  ) VALUES (
    p_produto_id, p_lote_id, p_tipo, p_quantidade,
    v_saldo_anterior, v_saldo_posterior,
    p_referencia_id, p_referencia_tipo, p_usuario_id, p_observacao
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reservar_estoque_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_qtd_restante integer;
  v_lote record;
  v_ja_0030 boolean;
BEGIN
  -- Valida se pedido existe e está em status confirmado
  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos
    WHERE id = p_pedido_id AND status = 'em_producao'
  ) THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está em status "em_producao": %', p_pedido_id;
  END IF;

  -- Só itens COM produto (combo montado = montagem, sem baixa de lote)
  FOR v_item IN
    SELECT pi.produto_id, pi.quantidade
    FROM public.pedido_itens pi
    WHERE pi.pedido_id = p_pedido_id
      AND pi.produto_id IS NOT NULL
  LOOP
    -- 0030 já baixou produtos.estoque no checkout? Então aqui só movemos lotes.
    v_ja_0030 := false;
    BEGIN
      SELECT EXISTS(
        SELECT 1 FROM public.reservas_estoque
        WHERE pedido_id = p_pedido_id
          AND produto_id = v_item.produto_id
          AND status = 'ativa'
      ) INTO v_ja_0030;
    EXCEPTION WHEN undefined_table THEN
      v_ja_0030 := false;
    END;

    v_qtd_restante := v_item.quantidade;

    -- Busca lotes FEFO (First Expire, First Out) com saldo disponível
    FOR v_lote IN
      SELECT id, restante
      FROM public.lotes
      WHERE produto_id = v_item.produto_id
        AND status = 'ativo'
        AND restante > 0
        AND (validade IS NULL OR validade >= CURRENT_DATE)
      ORDER BY validade ASC NULLS LAST, created_at ASC
    LOOP
      IF v_qtd_restante <= 0 THEN
        EXIT;
      END IF;

      DECLARE
        v_qtd_lote integer := LEAST(v_lote.restante, v_qtd_restante);
      BEGIN
        -- Atualiza lote
        UPDATE public.lotes
        SET restante = restante - v_qtd_lote
        WHERE id = v_lote.id;

        -- Registra movimentação de reserva (sem rebaixar produtos.estoque se 0030 já o fez)
        PERFORM public.registrar_mov_estoque(
          v_item.produto_id,
          'reserva',
          -v_qtd_lote,
          v_lote.id,
          p_pedido_id,
          'pedido',
          NULL,
          'Reserva FEFO para pedido #' || (
            SELECT numero::text FROM public.pedidos WHERE id = p_pedido_id
          ),
          NOT v_ja_0030
        );

        v_qtd_restante := v_qtd_restante - v_qtd_lote;
      END;
    END LOOP;

    IF v_qtd_restante > 0 THEN
      RAISE EXCEPTION 'Estoque insuficiente para produto % (faltam % unidades). Lotes disponíveis: %',
        v_item.produto_id, v_qtd_restante, (
          SELECT COALESCE(SUM(restante), 0)
          FROM public.lotes
          WHERE produto_id = v_item.produto_id
            AND status = 'ativo'
            AND restante > 0
        );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_reserva_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mov record;
  v_tem_0030 boolean := false;
BEGIN
  -- 0030 primeiro: restaura produtos.estoque e marca as reservas (no-op se vazio).
  -- Erro aqui aborta o cancel com mensagem visível (melhor que corromper saldo
  -- em silêncio). Só ignora se 0030 nunca foi aplicada (modo legado).
  BEGIN
    PERFORM public.liberar_reserva_atomica(p_pedido_id);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  -- Se 0030 engajou neste pedido, ela é dona do produtos.estoque: aqui só
  -- devolvemos os LOTES (modo legado = sem linhas 0030 → restaura tudo).
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.reservas_estoque WHERE pedido_id = p_pedido_id
    ) INTO v_tem_0030;
  EXCEPTION WHEN undefined_table THEN
    v_tem_0030 := false;
  END;

  -- Busca movimentações de reserva deste pedido
  FOR v_mov IN
    SELECT produto_id, lote_id, ABS(quantidade) AS qtd
    FROM public.estoque_movimentacoes
    WHERE referencia_id = p_pedido_id
      AND referencia_tipo = 'pedido'
      AND tipo = 'reserva'
  LOOP
    -- Devolve ao lote
    IF v_mov.lote_id IS NOT NULL THEN
      UPDATE public.lotes
      SET restante = restante + v_mov.qtd
      WHERE id = v_mov.lote_id;
    END IF;

    -- Registra liberação (sem recreditar produtos.estoque se 0030 já o fez)
    PERFORM public.registrar_mov_estoque(
      v_mov.produto_id,
      'liberacao',
      v_mov.qtd,
      v_mov.lote_id,
      p_pedido_id,
      'pedido',
      NULL,
      'Liberação de reserva por cancelamento/alteração do pedido',
      NOT v_tem_0030
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.registrar_mov_estoque(uuid, public.tipo_mov_estoque, integer, uuid, uuid, text, uuid, text, boolean) IS '0050: p_atualizar_estoque=false registra trilha sem mover produtos.estoque (0030 é dona quando engajou).';
COMMENT ON FUNCTION public.reservar_estoque_pedido(uuid) IS '0050: regra única — 0030 dona de produtos.estoque; 0042 move lotes.';
COMMENT ON FUNCTION public.liberar_reserva_pedido(uuid) IS '0050: chama 0030 antes de devolver lotes; sem 0030, restaura tudo (legado).';
$body$;
  RAISE NOTICE 'APLICADO 0050_estoque_unico.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0050_estoque_unico.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0051_grants_faltantes.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0051: GRANTs que faltavam (0043–0046 criaram RLS+policies sem GRANT).
-- Sem GRANT, o PostgREST nega tudo mesmo com policy permissiva: a seção
-- Provedor do /fiscal e qualquer leitura dessas tabelas falhavam com
-- "permission denied". RLS continua mandando (só staff lê/escreve).
-- Idempotente. Rode APÓS 0050.

GRANT ALL ON public.fritura_fila TO authenticated;
GRANT ALL ON public.entrega_atrasos TO authenticated;
GRANT ALL ON public.motoboy_historico TO authenticated;
GRANT ALL ON public.rotas TO authenticated;
GRANT ALL ON public.estoque_movimentacoes TO authenticated;
GRANT ALL ON public.documento_fiscal_itens TO authenticated;
GRANT ALL ON public.fiscal_certificados TO authenticated;
GRANT ALL ON public.fiscal_provedor_config TO authenticated;

-- Transições de status: só o trigger (definer) usa hoje; RLS staff p/ leitura
-- futura sem abrir para anônimo (sem GRANT ninguém lia; sem RLS ninguém barrava).
ALTER TABLE public.pedido_status_transicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transicoes staff read" ON public.pedido_status_transicoes;
CREATE POLICY "transicoes staff read" ON public.pedido_status_transicoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'motoboy')
  );
GRANT SELECT ON public.pedido_status_transicoes TO authenticated;

COMMENT ON TABLE public.fritura_fila IS '0051: grants p/ leitura staff (preenchida pelo trigger ao confirmar). Não confundir com fila_fritura (UI da produção).';
$body$;
  RAISE NOTICE 'APLICADO 0051_grants_faltantes.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0051_grants_faltantes.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0052_tempo_fritura_blocos.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0052: tempo de fritura em BLOCOS (igual ao app) + usa o campo do admin.
-- A 0043 calculava linear (qtd/base*qtd*seg): 1 salgado = 5 segundos, o que
-- não existe em fritadeira — e divergia do src/lib/cozinha.ts (1 lote = 210s).
-- Além disso a 0043 lia tempo_fritura_base_segundos (coluna sem UI!), então o
-- "Fritura 50un em seg" que o admin preenche (tempo_fritura_s, 0036) nunca
-- chegava à fila. Agora: tempo_fritura_s > base > 210.
-- Modelo único: teto da quantidade em lotes de unidade_base (mínimo 1 lote).
-- Idempotente. Rode APÓS 0051. (Arquivo 0043 sincronizado p/ fresh.)

CREATE OR REPLACE FUNCTION public.calcular_tempo_fritura(p_produto_id uuid, p_quantidade integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base_seg integer;
  v_base_qtd integer;
BEGIN
  SELECT COALESCE(tempo_fritura_s, tempo_fritura_base_segundos, 210),
         COALESCE(unidade_base_tempo_fritura, 50)
  INTO v_base_seg, v_base_qtd
  FROM public.produtos
  WHERE id = p_produto_id;

  IF NOT FOUND OR v_base_seg IS NULL OR v_base_seg <= 0
     OR v_base_qtd IS NULL OR v_base_qtd <= 0 THEN
    RETURN 210; -- default 3:30 (igual a SEGUNDOS_POR_50_PADRAO)
  END IF;

  -- Blocos: 1un..50un = 1 lote; 51un..100un = 2 lotes (igual a tempoFritura()).
  RETURN GREATEST(1, CEIL(GREATEST(0, p_quantidade)::numeric / v_base_qtd)) * v_base_seg;
END;
$$;

COMMENT ON FUNCTION public.calcular_tempo_fritura(uuid, integer) IS '0052: blocos (teto), espelha src/lib/cozinha.ts tempoFritura().';
$body$;
  RAISE NOTICE 'APLICADO 0052_tempo_fritura_blocos.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0052_tempo_fritura_blocos.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0053_historico_dono.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0053: dono do pedido pode registrar o próprio histórico de status.
-- O checkout (cliente, sem papel staff) insere o nascimento recebido→recebido
-- em pedido_status_historico, mas a policy 0023 só permitia staff: a linha era
-- barrada em silêncio (catch vazio) e as métricas de ciclo (separação) perdiam
-- a origem. Agora o dono insere no PRÓPRIO pedido; staff como antes.
-- Idempotente. Rode APÓS 0052. (Arquivo 0023 sincronizado p/ fresh.)

DROP POLICY IF EXISTS "hist staff insert" ON public.pedido_status_historico;
CREATE POLICY "hist staff insert" ON public.pedido_status_historico FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
  OR EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id AND p.user_id = auth.uid()
  )
);

COMMENT ON TABLE public.pedido_status_historico IS '0053: dono insere no próprio pedido (nascimento via checkout); staff como antes.';
$body$;
  RAISE NOTICE 'APLICADO 0053_historico_dono.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0053_historico_dono.sql -> %', SQLERRM;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 0054_push_subscriptions.sql
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$-- 0054: inscrições Web Push (notificação de status sem WhatsApp).
-- Uma linha por aparelho/navegador (endpoint único). O dono gerencia as
-- próprias; o envio é pela Edge Function push-enviar (service_role).
-- Idempotente. Rode APÓS 0053.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_sub_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push own manage" ON public.push_subscriptions;
CREATE POLICY "push own manage" ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

GRANT ALL ON public.push_subscriptions TO authenticated;

COMMENT ON TABLE public.push_subscriptions IS '0054: endpoints Web Push por usuário (1 linha por aparelho). Envio via push-enviar.';
$body$;
  RAISE NOTICE 'APLICADO 0054_push_subscriptions.sql';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU 0054_push_subscriptions.sql -> %', SQLERRM;
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
