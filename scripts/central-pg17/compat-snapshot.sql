-- Linha de base da cadeia limpa até 0123, antes de 0136/0139/0140/0141.
CREATE TABLE public.neia_teste_invalidos_base AS
SELECT (SELECT count(*) FROM pg_index WHERE NOT indisvalid) AS indices,
       (SELECT count(*) FROM pg_constraint WHERE NOT convalidated) AS restricoes;
