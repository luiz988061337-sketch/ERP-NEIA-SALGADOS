-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'producao', 'motoboy', 'cliente');
CREATE TYPE public.order_status AS ENUM ('recebido','em_producao','pronto','aguardando_motoboy','em_rota','entregue','cancelado');
CREATE TYPE public.prod_status AS ENUM ('aguardando','produzindo','finalizado');
CREATE TYPE public.pagamento AS ENUM ('pix','dinheiro','credito','debito');

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
 ('Salgados Fritos','salgados-fritos',1),
 ('Salgados Assados','salgados-assados',2),
 ('Salgados Congelados','salgados-congelados',3),
 ('Mini Salgados','mini-salgados',4),
 ('Kits para Festa','kits-para-festa',5),
 ('Bebidas','bebidas',6);

INSERT INTO public.produtos (categoria_id, nome, descricao, preco, preco_promocional)
SELECT c.id, v.nome, v.descricao, v.preco, v.promo FROM public.categorias c
JOIN (VALUES
 ('salgados-fritos','Coxinha de Frango','Massa crocante com recheio cremoso de frango desfiado',6.50,NULL::numeric),
 ('salgados-fritos','Bolinha de Queijo','Queijo mussarela derretido em massa dourada',6.00,4.90),
 ('salgados-fritos','Risole de Carne','Recheio suculento de carne moída temperada',6.50,NULL),
 ('salgados-fritos','Kibe Recheado','Kibe de trigo com recheio de catupiry',7.00,NULL),
 ('salgados-assados','Empada de Frango','Massa amanteigada com frango e catupiry',7.50,NULL),
 ('salgados-assados','Esfiha de Carne','Esfiha aberta tradicional assada na hora',5.50,NULL),
 ('salgados-assados','Enroladinho de Salsicha','Massa assada macia com salsicha',5.00,4.20),
 ('salgados-congelados','Coxinha Congelada 50un','Pacote com 50 coxinhas prontas para fritar',89.90,79.90),
 ('salgados-congelados','Mix Congelado 100un','100 salgados sortidos congelados',149.90,NULL),
 ('salgados-congelados','Esfiha Congelada 30un','30 esfihas de carne congeladas',69.90,NULL),
 ('mini-salgados','Mini Coxinha 25un','25 mini coxinhas fritas na hora',39.90,NULL),
 ('mini-salgados','Mini Mix 50un','50 mini salgados sortidos fritos',74.90,69.90),
 ('mini-salgados','Mini Empada 20un','20 mini empadas de frango',44.90,NULL),
 ('kits-para-festa','Kit Festa 100 Salgados','100 salgados sortidos + 1 refrigerante 2L',179.90,159.90),
 ('kits-para-festa','Kit Aniversário 200un','200 salgados sortidos + 2 refrigerantes',329.90,NULL),
 ('kits-para-festa','Kit Reunião 50un','50 salgados sortidos ideais para escritório',94.90,NULL),
 ('bebidas','Coca-Cola 2L','Refrigerante gelado 2 litros',12.00,NULL),
 ('bebidas','Guaraná 2L','Refrigerante guaraná 2 litros',10.00,NULL),
 ('bebidas','Suco Natural 500ml','Suco de laranja natural',8.00,NULL),
 ('bebidas','Água Mineral 500ml','Água mineral sem gás',3.50,NULL)
) AS v(slug,nome,descricao,preco,promo) ON v.slug = c.slug;

INSERT INTO public.cupons (codigo, tipo, valor, minimo) VALUES
 ('NEIA10','percentual',10,50),
 ('FRETEGRATIS','valor',8,80);