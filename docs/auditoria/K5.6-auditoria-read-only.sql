-- =============================================================
-- K5.6 — Pacote de auditoria READ-ONLY (Lovable Cloud / Supabase)
-- Projeto: ERP Néia Salgados. Revisa base para as migrations 0060–0064.
--
-- COMO USAR: cole CADA BLOCO separadamente no SQL Editor e execute.
-- Todos os blocos são SELECT em catálogos (pg_catalog /
-- information_schema). Nenhum bloco escreve, chama função de negócio,
-- lê dados de clientes/pedidos ou depende de outro bloco.
-- Nenhum bloco retorna segredos: só metadados (nomes, definições,
-- privilégios, contagens de catálogo).
-- ATENÇÃO (Bloco A): o corpo das funções (prosrc) é código-fonte — pode
-- conter credenciais codificadas diretamente no código. Inspecione o
-- retorno do Bloco A antes de compartilhá-lo e remova/redija qualquer
-- segredo eventualmente embutido; compartilhe apenas o necessário.
-- =============================================================

-- -------------------------------------------------------------
-- BLOCO A — Inventário de funções (assinatura, dono, DEFINER, corpo)
-- O que verifica: existência e definição das funções de estoque,
-- proteção e aceite, incluindo overloads.
-- Colunas importantes: assinatura (nome + tipos exatos), dono,
-- seguranca (DEFINER/INVOKER), corpo (prosrc).
-- Resultado vazio para um nome = função inexistente (ex.: nome errado
-- ou objeto de outra migration não aplicada) OU sem visibilidade para o
-- papel atual (ver Bloco H) — não afirmar inexistência sem considerar
-- privilégios e visibilidade.
-- Não conclui: privilégios efetivos (ver Bloco B) nem comportamento
-- em execução (exige staging).
-- Limite de acesso: papéis com pouca visibilidade podem não enxergar
-- algumas linhas. Distinguir três coisas diferentes: (1) visibilidade
-- dos metadados no catálogo, (2) permissão de RESOLUÇÃO do nome da
-- função e (3) permissão de EXECUÇÃO — a visibilidade aqui NÃO depende
-- necessariamente de USAGE no schema, e ver a função não implica poder
-- executá-la (ver Bloco B2). Linha ausente não prova inexistência.
-- -------------------------------------------------------------
SELECT
  n.nspname AS schema,
  p.oid::regprocedure AS assinatura,
  r.rolname AS dono,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS seguranca,
  p.proconfig AS search_path_config,
  l.lanname AS linguagem,
  p.prosrc AS corpo
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN (
    'reservar_estoque_atomica', 'liberar_reserva_atomica',
    'reservar_estoque_pedido', 'liberar_reserva_pedido',
    'registrar_mov_estoque', 'calcular_tempo_fritura',
    'gerar_msg_apartamento', 'pedidos_guard_update',
    'validar_transicao_status', 'trigger_criar_fritura_fila',
    'trigger_reservar_estoque', 'has_role'
  )
ORDER BY 2;

-- -------------------------------------------------------------
-- BLOCO B1 — ACL explícita das funções (o que está gravado no catálogo)
-- O que verifica: concessões explícitas por função.
-- Coluna importante: acl (lista de grantees).
-- INTERPRETAÇÃO OBRIGATÓRIA: proacl IS NULL significa "sem linha
-- explícita", ou seja, vale a ACL PADRÃO do PostgreSQL — e o padrão
-- para funções é EXECUTE liberado a PUBLIC. Portanto, NULL NÃO significa
-- ausência de permissão; na prática, tende a significar acesso amplo,
-- a confirmar no B2. Inversamente, uma ACL explícita SEM PUBLIC tampouco
-- prova, isoladamente, que todos os papéis estão sem acesso (há herança,
-- grants por membership e defaults a considerar — ver B2).
-- Linha ausente neste bloco = função inexistente para o papel atual
-- (não confundir com sem acesso; ver limites do Bloco A).
-- Não conclui: acesso efetivo por herança (ver B2).
-- -------------------------------------------------------------
SELECT
  p.oid::regprocedure AS funcao,
  COALESCE(p.proacl::text, '(default: sem linha explicita)') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'reservar_estoque_atomica', 'liberar_reserva_atomica',
    'reservar_estoque_pedido', 'liberar_reserva_pedido',
    'registrar_mov_estoque', 'calcular_tempo_fritura',
    'gerar_msg_apartamento'
  )
ORDER BY 1;

-- -------------------------------------------------------------
-- BLOCO B2 — Privilégio efetivo por papel (OIDs reais, sem texto suposto)
-- O que verifica: se cada papel PODE executar cada overload existente,
-- resolvido pelos OIDs reais de pg_roles e pg_proc (todas as
-- sobrecargas entram automaticamente; nenhuma assinatura textual é
-- presumida, evitando erro por divergência de tipos).
-- Leitura das colunas: papel ausente = papel inexistente no banco;
-- funcao ausente = função inexistente/inalcançável para o leitor;
-- pode_executar = privilégio efetivo (inclui herança e default).
-- has_function_privilege apenas lê privilégios; não testa JWT, não
-- autoriza negócio e não executa nada.
-- Não conclui: quem realmente chamou no passado (exige logs).
-- Limite: papéis/funções invisíveis ao leitor somem do resultado sem
-- provar inexistência (ver Bloco H).
-- -------------------------------------------------------------
SELECT r.rolname AS papel,
       p.oid::regprocedure AS funcao,
       has_function_privilege(r.oid, p.oid, 'EXECUTE') AS pode_executar
FROM (SELECT oid, rolname FROM pg_roles
      WHERE rolname IN ('anon','authenticated','service_role','postgres')) r
CROSS JOIN (
  SELECT p.oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'reservar_estoque_atomica', 'liberar_reserva_atomica',
      'reservar_estoque_pedido', 'liberar_reserva_pedido',
      'registrar_mov_estoque', 'calcular_tempo_fritura',
      'gerar_msg_apartamento'
    )
) p
ORDER BY 2, 1;

-- -------------------------------------------------------------
-- BLOCO C — Colunas e estruturas (0060–0064 e fluxos do aceite)
-- O que verifica: existência/tipo das colunas usadas nas migrations e
-- no congelamento de colunas do aceite do motoboy.
-- Colunas importantes: processada_em (0062), chaves pedido/lote/produto,
-- motoboy_id/aceito_em/status (aceite), conferência de valores.
-- Linha ausente = coluna inexistente (migration pendente ou base antiga)
-- OU sem visibilidade para o papel atual (ver Bloco H).
-- Não conclui: valores das linhas (nenhuma linha é lida aqui).
-- -------------------------------------------------------------
SELECT table_name AS tabela, column_name AS coluna, data_type AS tipo,
       is_nullable AS nulo, column_default AS padrao
FROM information_schema.columns
WHERE table_schema = 'public' AND (
  (table_name = 'estoque_movimentacoes' AND column_name IN
    ('id','produto_id','lote_id','tipo','quantidade','saldo_anterior',
     'saldo_posterior','referencia_id','referencia_tipo','processada_em','created_at'))
  OR (table_name = 'reservas_estoque' AND column_name IN
    ('id','pedido_id','produto_id','quantidade','status'))
  OR (table_name = 'lotes' AND column_name IN
    ('id','produto_id','codigo','quantidade','restante','validade','status'))
  OR (table_name = 'produtos' AND column_name IN ('id','estoque'))
  OR (table_name = 'pedidos' AND column_name IN
    ('id','numero','user_id','cliente_nome','telefone','endereco','bairro',
     'complemento','referencia','observacoes','forma_pagamento','subtotal',
     'taxa_entrega','desconto','total','cupom','status','producao_status',
     'motoboy_id','taxa_motoboy','destino_lat','destino_lng','motoboy_lat',
     'motoboy_lng','motoboy_atualizado_em','created_at','aceito_em',
     'entregue_em','cidade','tipo_entrega','pagamento_status','pagamento_em',
     'atrasado','problema','agendamento_janela','preparo_em','pronto_em',
     'saiu_em','atraso_motivo','atraso_descricao','pode_subir','tipo_imovel',
     'bloco','apartamento','torre','andar','interfone','rota_id','impresso',
     'origem_parceiro_id','indicado_por','cpf_cnpj','nome_fiscal',
     'origem_cliente','cep','confirmado_em','pago_em','agendado_para',
     'agendamento_obs','tipo_evento','campanha_origem'))
)
ORDER BY 1, 2;

-- -------------------------------------------------------------
-- BLOCO D — RLS e políticas da tabela pedidos (+ itens e motoboys)
-- O que verifica: RLS ativa, FORCE RLS e o texto integral das policies.
-- Colunas importantes: comando, papéis, usando (USING), checagem
-- (WITH CHECK). Comparar USING x WITH CHECK da claim do aceite.
-- Tabela sem linha em pg_policies = sem policy (acesso total ou negado
-- conforme RLS; ver rls_ativa). Policies invisíveis ao papel atual não
-- aparecem (ver Bloco H) — ausência aqui não prova ausência no banco.
-- Não conclui: teste real por JWT (exige staging).
-- -------------------------------------------------------------
SELECT tablename AS tabela, rowsecurity AS rls_ativa,
       forcerowsecurity AS force_rls
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('pedidos','pedido_itens','produtos','motoboys')
ORDER BY 1;

SELECT tablename AS tabela, policyname AS politica, cmd AS comando,
       roles AS papeis, permissive AS permissiva, qual AS usando,
       with_check AS checagem
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pedidos','pedido_itens','produtos','motoboys')
ORDER BY 1, 2;

-- -------------------------------------------------------------
-- BLOCO E — Triggers e proteção (pedidos e filas)
-- O que verifica: triggers não internos, timing, nível e definição.
-- Coluna importante: estado (ATIVA/INATIVA) e definicao (quando disparam
-- e qual função chamam). Comparar com 0041/0043/0045/0047/0005.
-- Trigger ausente aqui (e não interno, ver coluna) = inexistente para o
-- leitor atual. Não executa triggers nem funções. Ordem de disparo entre
-- triggers BEFORE não sai deste bloco (exige teste em staging).
-- Estados tgenabled: O = ativo (origin), A = sempre ativo,
-- R = ativo (replica), D = desabilitado. R é ATIVO em réplica — nunca
-- classificar R como inativo.
-- -------------------------------------------------------------
SELECT t.tgname AS trigger, c.relname AS tabela,
       CASE t.tgenabled::text
         WHEN 'O' THEN 'ATIVO (origin)'
         WHEN 'A' THEN 'ATIVO (sempre)'
         WHEN 'R' THEN 'ATIVO (replica)'
         WHEN 'D' THEN 'DESABILITADO'
         ELSE 'OUTRO' END AS estado,
       CASE WHEN (t.tgtype::integer & 64) = 64 THEN 'INSTEAD'
            WHEN (t.tgtype::integer & 2) = 2 THEN 'BEFORE'
            ELSE 'AFTER' END AS timing,
       CASE WHEN (t.tgtype::integer & 1) = 1 THEN 'LINHA' ELSE 'STATEMENT' END AS nivel,
       NOT t.tgisinternal AS nao_interno,
       pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('pedidos','fritura_fila','fila_fritura','fila_impressao')
ORDER BY 2, 1;

-- -------------------------------------------------------------
-- BLOCO F — Constraints, índices e enum de status
-- O que verifica: PKs/UNIQUE/FKs/CHECKs, índices de idempotência e os
-- valores válidos de order_status (base do aceite e das transições).
-- UNIQUE (pedido,produto) ausente = risco de fila duplicada (ver 0049).
-- Enum diferente do local = transições 0041/0063 precisam de revisão.
-- Não conclui dados duplicados reais (exigiria contar linhas). Índice ou
-- constraint ausente aqui não é falha por si só: pode existir com outro
-- nome ou estar invisível ao papel atual (ver Bloco H).
-- -------------------------------------------------------------
SELECT c.relname AS tabela, con.conname AS constraint,
       con.contype AS tipo, pg_get_constraintdef(con.oid) AS definicao
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.oid = con.connamespace
WHERE n.nspname = 'public'
  AND c.relname IN
    ('pedidos','pedido_itens','produtos','fritura_fila','fila_fritura',
     'reservas_estoque','estoque_movimentacoes','lotes',
     'pedido_status_transicoes')
ORDER BY 1, 2;

SELECT t.typname AS enum, e.enumlabel AS valor, e.enumsortorder AS ordem
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'order_status'
ORDER BY 3;

SELECT tablename AS tabela, indexname AS indice, indexdef AS definicao
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN
    ('reservas_estoque','estoque_movimentacoes','fritura_fila',
     'fila_fritura','pedidos')
ORDER BY 1, 2;

-- -------------------------------------------------------------
-- BLOCO G — Descoberta de histórico de migrations (sem presumir nome)
-- Passo G1: lista tabelas candidatas em QUALQUER schema.
-- Vazio = nenhum histórico acessível (declarar inconclusivo; não criar).
-- Passo G2 (só se G1 retornar algo): colunas da candidata, para então
-- pedir um SELECT dirigido só de versão/hash (fora deste pacote).
-- Não lê valores de negócio nem instala ferramenta.
-- -------------------------------------------------------------
SELECT table_schema AS schema, table_name AS tabela
FROM information_schema.tables
WHERE table_name ILIKE '%migrat%'
ORDER BY 1, 2;

SELECT table_schema AS schema, table_name AS tabela,
       column_name AS coluna, data_type AS tipo
FROM information_schema.columns
WHERE table_name ILIKE '%migrat%'
ORDER BY 1, 2, 3;

-- -------------------------------------------------------------
-- BLOCO H — Contexto da sessão (interpretação dos blocos acima)
-- O que verifica: com qual papel o SQL Editor executa (muda o que cada
-- bloco consegue enxergar). Sem segredos: só nomes de papéis.
-- Se usuario = anon/authenticated, resultados podem vir incompletos;
-- nesse caso, ausência de linha NÃO prova inexistência do objeto.
-- -------------------------------------------------------------
SELECT current_user AS usuario, session_user AS sessao;
