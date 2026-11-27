-- CARGA EXEMPLIFICATIVA — SOMENTE HOMOLOGAÇÃO — NÃO APLICADA.
-- Preparada em 27/11/2026. Exige autorização expressa e destino declarado
-- --project-ref lflzlcqinarrcgncafol. NUNCA transferir para produção.
--
-- Pré-requisito: a 0129 revisada e a 0133 devem estar aplicadas (após as
-- migrations 0130–0132 da Central da Atendente). A execução
-- precisa de sessão autenticada como administrador (auth.uid() não nulo).
-- NÃO usar service_role nem `scripts/executar-sql-homolog.mjs` com chave de
-- serviço: a RPC exige papel funcional e não aceita transporte anônimo.
--
-- Idempotência: p_chave é determinístico por sabor. Reexecutar com a mesma
-- assinatura devolve 'ja_registrado' e não grava nova movimentação. Assinatura
-- divergente aborta. Lotes usam somente o prefixo HOMOLOGAÇÃO-TESTE.
--
-- As quantidades abaixo são o cenário aprovado para teste; NÃO são saldo real,
-- não valem para produção e não substituem inventário físico.

DO $carga$
DECLARE
  v_ator uuid := auth.uid();
  r      record;
  v_key  uuid;
  v_res  text;
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Carga exige sessão autenticada de administrador';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('coxinha-frango', 5000),
      ('bolinha-queijo', 4000),
      ('risoles-presunto-queijo', 2000),
      ('croquete', 2500),
      ('bolinho-calabresa', 1500),
      ('bolinho-milho-queijo', 1200),
      ('bolinho-azeitona', 800),
      ('trouxinha-milho-catupiry', 1500),
      ('kibe', 3000),
      ('pastel-carne', 2500),
      ('pastel-queijo', 2000),
      ('pastel-pizza', 1500),
      ('pastel-palmito', 800),
      ('esfirra-carne', 2500),
      ('esfirra-frango', 2000),
      ('esfirra-brocolis', 600),
      ('enroladinho-presunto-queijo', 1800),
      ('hamburguinho', 1200),
      ('ricota-zaatar', 100),
      ('empada-palmito', 800),
      ('empada-frango', 1500),
      ('pizza-calabresa', 1500),
      ('pizza-queijo', 1200),
      ('pizza-presunto-queijo', 1200),
      ('trouxinha-calabresa', 80),
      ('enroladinho-salsicha', 1500)
    ) t(chave, quantidade)
  LOOP
    v_key := md5('carga-exemplo-homologacao:' || r.chave)::uuid;
    v_res := public.movimentar_lote_salgado(
      p_sabor => r.chave,
      p_produto => NULL,
      p_tipo => 'entrada',
      p_quantidade => r.quantidade,
      p_chave => v_key,
      p_codigo => 'HOMOLOGAÇÃO-TESTE-' || upper(replace(r.chave, '-', '_')),
      p_fabricacao => DATE '2026-11-20',
      p_validade => DATE '2027-01-15',
      p_observacao => 'Carga exemplificativa de homologação — não inventário real'
    );
    IF v_res NOT IN ('registrado', 'ja_registrado') THEN
      RAISE EXCEPTION 'Falha na carga do sabor %: %', r.chave, v_res;
    END IF;
  END LOOP;
END
$carga$;
