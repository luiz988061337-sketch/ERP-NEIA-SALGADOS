-- Lote 06: somente laboratorio descartavel. Nao aplicar em projeto hospedado.
-- Nao concede EXECUTE. Preserva OIDs, assinaturas, ACLs e corpos de negocio.
BEGIN;
SET LOCAL search_path = pg_catalog, public;
DO $local$
BEGIN
  IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR current_database() <> 'lfl_partial'
     OR current_user !~ '^restore_[a-f0-9]{12}$'
     OR current_setting('neia_homologacao.ensaio',true)
        IS DISTINCT FROM 'LFL_LOCAL_ADITIVO_0123' THEN
    RAISE EXCEPTION 'Lote 06 exclusivamente no laboratorio local isolado';
  END IF;
END $local$;

DO $dono$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid IN (
      to_regprocedure('public.receber_compra_item(uuid,numeric,text,date)'),
      to_regprocedure('public.consumir_insumos_pedido(uuid)'),
      to_regprocedure('public.consumir_insumos_pedido_trigger()'),
      to_regprocedure('public.enfileirar_cupom(uuid)'),
      to_regprocedure('public.gerar_cupons_pedidos_pagos()'))
      AND pg_get_userbyid(proowner)<>'postgres') THEN
    RAISE EXCEPTION 'Dono divergente: revisar o contrato antes de aplicar';
  END IF;
END $dono$;

-- O atendente pode liberar a cozinha e disparar o trigger, mas nao usar
-- diretamente a RPC para consumir qualquer pedido. Nao usar profundidade
-- de trigger como credencial; o worker e privado e nao tem EXECUTE publico.
DO $consumo$
DECLARE v_oid oid; v_def text; v_owner name; v_body text;
BEGIN
  v_oid := to_regprocedure('public.consumir_insumos_pedido(uuid)');
  IF v_oid IS NULL OR to_regnamespace('neia_operacao') IS NULL THEN
    RAISE EXCEPTION 'Dependencias de consumo/03 ausentes';
  END IF;
  IF to_regprocedure('neia_operacao.consumir_insumos_pedido_interno(uuid)') IS NULL THEN
    SELECT pg_get_functiondef(p.oid), pg_get_userbyid(p.proowner), p.prosrc
      INTO v_def,v_owner,v_body FROM pg_proc p WHERE p.oid=v_oid;
    IF v_body LIKE '%lote06:%' THEN RAISE EXCEPTION 'Consumo parcialmente adaptado'; END IF;
    v_def := replace(v_def,'FUNCTION public.consumir_insumos_pedido(',
      'FUNCTION neia_operacao.consumir_insumos_pedido_interno(');
    EXECUTE v_def;
    EXECUTE format('ALTER FUNCTION neia_operacao.consumir_insumos_pedido_interno(uuid) OWNER TO %I',v_owner);
  END IF;
  REVOKE ALL ON FUNCTION neia_operacao.consumir_insumos_pedido_interno(uuid)
    FROM PUBLIC,anon,authenticated,service_role;
END $consumo$;

CREATE OR REPLACE FUNCTION public.consumir_insumos_pedido(p_pedido_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  -- lote06: consumo publico com autorizacao por papel
  IF ((current_setting('role',true)='none' AND pg_catalog.pg_has_role(session_user,'postgres','USAGE'))
      OR (auth.uid() IS NOT NULL AND (
      public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'financeiro'::public.app_role)
      OR public.has_role(auth.uid(),'producao'::public.app_role)))) IS NOT TRUE THEN
    RAISE EXCEPTION 'lote06_consumo_nao_autorizado' USING ERRCODE='42501';
  END IF;
  RETURN neia_operacao.consumir_insumos_pedido_interno(p_pedido_id);
END $function$;

-- Adaptador minimo: preserva NEW.id, retorno NEW e o trigger existente.
-- EXECUTE desta funcao permanece exclusivo do dono, conforme lote 05.
CREATE OR REPLACE FUNCTION public.consumir_insumos_pedido_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  PERFORM neia_operacao.consumir_insumos_pedido_interno(NEW.id);
  RETURN NEW;
END $function$;

-- Apenas antepoe a guarda ao corpo instalado nas outras tres funcoes.
-- CREATE OR REPLACE preserva assinatura, defaults, dono, OID e ACL.
DO $guardas$
DECLARE r record; v_def text; v_src text; v_pos integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.receber_compra_item(uuid,numeric,text,date)', $g$
  IF ((current_setting('role',true)='none' AND pg_catalog.pg_has_role(session_user,'postgres','USAGE'))
      OR (auth.uid() IS NOT NULL AND (
      public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'financeiro'::public.app_role)))) IS NOT TRUE THEN
    RAISE EXCEPTION 'lote06_compra_nao_autorizada' USING ERRCODE='42501';
  END IF;
$g$),
    ('public.enfileirar_cupom(uuid)', $g$
  IF ((current_setting('role',true)='none' AND pg_catalog.pg_has_role(session_user,'postgres','USAGE'))
      OR (auth.jwt()->>'role') = 'service_role' OR (auth.uid() IS NOT NULL AND (
      public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'financeiro'::public.app_role)
      OR public.has_role(auth.uid(),'producao'::public.app_role)
      OR public.has_role(auth.uid(),'atendente'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.pedidos AS autorizado
          WHERE autorizado.id=p_pedido_id AND autorizado.user_id=auth.uid())))) IS NOT TRUE THEN
    RAISE EXCEPTION 'lote06_impressao_nao_autorizada' USING ERRCODE='42501';
  END IF;
$g$),
    ('public.gerar_cupons_pedidos_pagos()', $g$
  IF ((current_setting('role',true)='none' AND pg_catalog.pg_has_role(session_user,'postgres','USAGE'))
      OR (auth.uid() IS NOT NULL AND
      public.has_role(auth.uid(),'admin'::public.app_role))) IS NOT TRUE THEN
    RAISE EXCEPTION 'lote06_reprocessamento_nao_autorizado' USING ERRCODE='42501';
  END IF;
$g$)
  ) AS regras(sig,guarda)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN RAISE EXCEPTION 'Funcao ausente: %',r.sig; END IF;
    SELECT pg_get_functiondef(p.oid),p.prosrc INTO v_def,v_src
      FROM pg_proc p WHERE p.oid=to_regprocedure(r.sig) AND p.prosecdef
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql');
    IF v_def IS NULL THEN RAISE EXCEPTION 'Contrato DEFINER/plpgsql divergente: %',r.sig; END IF;
    IF position('-- lote06:inicio' IN v_src)>0 THEN CONTINUE; END IF;
    v_pos := strpos(v_def,'BEGIN');
    IF v_pos=0 THEN RAISE EXCEPTION 'Corpo sem BEGIN: %',r.sig; END IF;
    v_def := overlay(v_def placing ('BEGIN'||E'\n-- lote06:inicio'||r.guarda||'-- lote06:fim')
      FROM v_pos FOR 5);
    EXECUTE v_def;
  END LOOP;
END $guardas$;
COMMIT;
