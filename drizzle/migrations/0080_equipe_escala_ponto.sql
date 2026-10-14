-- 0080: ETAPA O.1 — equipe (cadastro, escala, ponto, vales)
-- funcionarios com vínculo opcional ao login (user_id) p/ ponto e escala
-- próprios; vales/adiantamentos; folha vira conta a pagar pelo app.
-- RLS: admin/financeiro tudo; equipe vê/aponta o próprio.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text NOT NULL,
  funcao text NOT NULL DEFAULT '',
  tipo_remuneracao text NOT NULL DEFAULT 'mensal' CHECK (tipo_remuneracao IN ('mensal','diaria')),
  valor numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  contato text NOT NULL DEFAULT '',
  documentos text NOT NULL DEFAULT '',
  admissao date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funcionarios_user_idx ON public.funcionarios (user_id);

CREATE TABLE IF NOT EXISTS public.escalas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  dia_semana integer NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  entrada time NOT NULL,
  saida time NOT NULL,
  UNIQUE (funcionario_id, dia_semana)
);

CREATE TABLE IF NOT EXISTS public.pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  entrada timestamptz,
  saida timestamptz,
  local_info text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pontos_func_data_idx ON public.pontos (funcionario_id, data);

CREATE TABLE IF NOT EXISTS public.vales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  data date NOT NULL DEFAULT CURRENT_DATE,
  descricao text NOT NULL DEFAULT '',
  descontado boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vales_func_idx ON public.vales (funcionario_id);

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pontos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "func staff" ON public.funcionarios;
CREATE POLICY "func staff" ON public.funcionarios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "escalas read" ON public.escalas;
CREATE POLICY "escalas read" ON public.escalas FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
    OR EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = escalas.funcionario_id AND f.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "escalas write" ON public.escalas;
CREATE POLICY "escalas write" ON public.escalas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

-- Ponto: cada um aponta o próprio (via vínculo); staff vê tudo.
DROP POLICY IF EXISTS "pontos read" ON public.pontos;
CREATE POLICY "pontos read" ON public.pontos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = pontos.funcionario_id AND f.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "pontos insert" ON public.pontos;
CREATE POLICY "pontos insert" ON public.pontos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "pontos admin update" ON public.pontos;
CREATE POLICY "pontos admin update" ON public.pontos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "vales read" ON public.vales;
CREATE POLICY "vales read" ON public.vales FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
    OR EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = vales.funcionario_id AND f.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "vales write" ON public.vales;
CREATE POLICY "vales write" ON public.vales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

GRANT ALL ON public.funcionarios TO authenticated;
GRANT ALL ON public.escalas TO authenticated;
GRANT ALL ON public.pontos TO authenticated;
GRANT ALL ON public.vales TO authenticated;
GRANT ALL ON public.funcionarios TO service_role;
GRANT ALL ON public.escalas TO service_role;
GRANT ALL ON public.pontos TO service_role;
GRANT ALL ON public.vales TO service_role;
