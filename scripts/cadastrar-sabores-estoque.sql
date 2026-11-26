-- Aplicação manual, somente após aprovação e confirmação do ambiente.
-- Registra metadados por sabor. Nesta execução não há vinculação automática:
-- novos registros entram com produto_id nulo e vínculos preexistentes são
-- preservados (ON CONFLICT DO NOTHING).
BEGIN;

CREATE TABLE IF NOT EXISTS public.sabores_estoque (
  chave text PRIMARY KEY,
  categoria text NOT NULL CHECK (categoria IN ('fritos', 'mini-pasteis', 'assados', 'empadas', 'mini-pizzas')),
  nome text NOT NULL UNIQUE,
  ordem smallint NOT NULL UNIQUE CHECK (ordem > 0),
  produto_id uuid UNIQUE REFERENCES public.produtos(id) ON DELETE SET NULL
);

ALTER TABLE public.sabores_estoque ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sabores_estoque FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sabores_estoque TO authenticated;

DROP POLICY IF EXISTS sabores_estoque_leitura_equipe ON public.sabores_estoque;
CREATE POLICY sabores_estoque_leitura_equipe ON public.sabores_estoque
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'financeiro')
  );

LOCK TABLE public.produtos IN SHARE MODE;

WITH oficial(chave, categoria, nome, ordem, apelidos) AS (
  VALUES
    ('coxinha-frango', 'fritos', 'Coxinha de frango', 1, ARRAY['Coxinha de frango', 'Mini coxinha', 'Mini coxinha de frango', 'Coxinha mini']),
    ('bolinha-queijo', 'fritos', 'Bolinha de queijo', 2, ARRAY['Bolinha de queijo', 'Mini bolinha de queijo', 'Bolinho de queijo']),
    ('risoles-presunto-queijo', 'fritos', 'Risoles de presunto e queijo', 3, ARRAY['Risoles de presunto e queijo', 'Risole de presunto e queijo', 'Risoles de presunto & queijo', 'Risoles P&Q']),
    ('croquete', 'fritos', 'Croquete', 4, ARRAY['Croquete', 'Mini croquete']),
    ('bolinho-calabresa', 'fritos', 'Bolinho de calabresa', 5, ARRAY['Bolinho de calabresa', 'Bolinha de calabresa']),
    ('bolinho-milho-queijo', 'fritos', 'Bolinho de milho com queijo', 6, ARRAY['Bolinho de milho com queijo', 'Bolinha de milho com queijo']),
    ('bolinho-azeitona', 'fritos', 'Bolinho de azeitona', 7, ARRAY['Bolinho de azeitona', 'Bolinha de azeitona']),
    ('trouxinha-milho-catupiry', 'fritos', 'Trouxinha de milho com catupiry', 8, ARRAY['Trouxinha de milho com catupiry']),
    ('kibe', 'fritos', 'Kibe', 9, ARRAY['Kibe', 'Mini kibe', 'Kibe frito', 'Mini kibe frito', 'Quibe', 'Quibe frito']),
    ('pastel-carne', 'mini-pasteis', 'Mini pastel de carne', 10, ARRAY['Mini pastel de carne', 'Pastel de carne']),
    ('pastel-queijo', 'mini-pasteis', 'Mini pastel de queijo', 11, ARRAY['Mini pastel de queijo', 'Pastel de queijo']),
    ('pastel-pizza', 'mini-pasteis', 'Mini pastel de pizza', 12, ARRAY['Mini pastel de pizza', 'Pastel de pizza']),
    ('pastel-palmito', 'mini-pasteis', 'Mini pastel de palmito', 13, ARRAY['Mini pastel de palmito', 'Pastel de palmito']),
    ('esfirra-carne', 'assados', 'Esfirra de carne', 14, ARRAY['Esfirra de carne', 'Esfiha de carne', 'Mini esfiha de carne']),
    ('esfirra-frango', 'assados', 'Esfirra de frango', 15, ARRAY['Esfirra de frango', 'Esfiha de frango', 'Mini esfiha de frango']),
    ('esfirra-brocolis', 'assados', 'Esfirra de brócolis', 16, ARRAY['Esfirra de brócolis', 'Esfiha de brócolis', 'Mini esfiha de brócolis']),
    ('enroladinho-presunto-queijo', 'assados', 'Enroladinho de presunto e queijo', 17, ARRAY['Enroladinho de presunto e queijo', 'Enroladinho P&Q']),
    ('hamburguinho', 'assados', 'Hamburguinho', 18, ARRAY['Hamburguinho', 'Mini hamburguinho']),
    ('ricota-zaatar', 'assados', 'Ricota com zaatar', 19, ARRAY['Ricota com zaatar', 'Trouxinha de ricota com zaatar']),
    ('empada-palmito', 'empadas', 'Mini empada de palmito', 20, ARRAY['Mini empada de palmito', 'Mini empadinha de palmito', 'Empadinha de palmito', 'Empada de palmito']),
    ('empada-frango', 'empadas', 'Mini empada de frango', 21, ARRAY['Mini empada de frango', 'Mini empadinha de frango', 'Empadinha de frango', 'Empada de frango']),
    ('pizza-calabresa', 'mini-pizzas', 'Mini pizza de calabresa', 22, ARRAY['Mini pizza de calabresa']),
    ('pizza-queijo', 'mini-pizzas', 'Mini pizza de queijo', 23, ARRAY['Mini pizza de queijo', 'Mini pizza de mussarela', 'Mini pizza de muçarela']),
    ('pizza-presunto-queijo', 'mini-pizzas', 'Mini pizza de presunto e queijo', 24, ARRAY['Mini pizza de presunto e queijo', 'Mini pizza P&Q']),
    ('trouxinha-calabresa', 'assados', 'Trouxinha de calabresa', 25, ARRAY['Trouxinha de calabresa']),
    ('enroladinho-salsicha', 'assados', 'Enroladinho de salsicha', 26, ARRAY['Enroladinho de salsicha'])
),
produtos_unitarios AS (
  SELECT p.id,
    lower(trim(regexp_replace(regexp_replace(normalize(p.nome, NFD), U&'[\0300-\036F]+', '', 'g'), '[[:space:]]+', ' ', 'g'))) AS nome
  FROM public.produtos p
  JOIN public.categorias c ON c.id = p.categoria_id
  WHERE c.slug IN (
    'mini-fritos', 'mini-assados', 'mini-pasteis', 'mini-pizzas', 'mini-empadinhas',
    'salgados-fritos', 'salgados-assados', 'mini-salgados', 'fritos', 'assados'
  )
  AND p.unidade_medida IN ('un', 'unidade')
  AND p.tipo_venda IN ('unidade', 'combo_50')
),
candidatos AS (
  SELECT o.chave, array_agg(DISTINCT p.id ORDER BY p.id) AS ids
  FROM oficial o
  CROSS JOIN LATERAL unnest(o.apelidos) AS apelido(nome)
  JOIN produtos_unitarios p
    ON p.nome = lower(regexp_replace(normalize(apelido.nome, NFD), U&'[\0300-\036F]+', '', 'g'))
  GROUP BY o.chave
),
vinculos AS (
  SELECT o.*, coalesce(cardinality(c.ids), 0) AS candidatos,
    CASE WHEN cardinality(c.ids) = 1 THEN c.ids[1] END AS produto_id
  FROM oficial o
  LEFT JOIN candidatos c ON c.chave = o.chave
), gravados AS (
  INSERT INTO public.sabores_estoque (chave, categoria, nome, ordem, produto_id)
  SELECT v.chave, v.categoria, v.nome, v.ordem, NULL::uuid
  FROM vinculos v
  ORDER BY v.ordem
  ON CONFLICT (chave) DO NOTHING
  RETURNING chave
)
SELECT v.chave, v.categoria, v.nome, s.produto_id AS produto_id,
  CASE WHEN g.chave IS NOT NULL THEN 'Registro criado' ELSE 'Registro preexistente' END AS acao,
  CASE
    WHEN s.produto_id IS NOT NULL THEN 'Vínculo preexistente preservado'
    ELSE 'Sem vínculo automático'
  END AS situacao,
  v.candidatos AS candidatos_por_nome
FROM vinculos v
LEFT JOIN gravados g ON g.chave = v.chave
LEFT JOIN public.sabores_estoque s ON s.chave = v.chave
ORDER BY v.ordem;

COMMIT;
