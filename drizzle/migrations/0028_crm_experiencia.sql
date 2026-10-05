-- 0028: CRM/fidelidade — jornada, indicação, parceiros, degustação, avaliações públicas, ajuda, alta demanda
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
