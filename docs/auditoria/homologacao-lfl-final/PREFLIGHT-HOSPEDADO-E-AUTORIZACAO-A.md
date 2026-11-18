> ESTADO ATUAL: o proprietario NAO AUTORIZA pausar o job 1. Nenhuma escrita remota esta autorizada ou agendada. Job nao alterado; ativo na ultima leitura. Os comandos abaixo sao propostas, nao autorizacoes.

# Conferencia hospedada e primeira intervencao — 18/11/2026

## Resultado atual

**Acesso somente leitura restabelecido** por entrada manual oculta, autorizada pelo proprietario. Coleta 2026-11-18T13:36:09.154447+00:00, TLS verificado, PostgreSQL 17.6, banco postgres, referencia fixada no host db.lflzlcqinarrcgncafol.supabase.co:5432. O primeiro cliente fechou sem diagnostico detalhado; a nova tentativa foi explicitamente autorizada e concluiu com exit code zero. Senha nao foi gravada, impressa, lida pelo agente nem posta em argumentos; usada apenas transitoriamente pelo cliente, com descarte apos a partida. Nenhum login Auth nem SQL de escrita foi executado. Nao houve push/deploy ou acesso aos projetos protegidos.

69 tabelas public, 1 usuario Auth (ultimo login null), 31 produtos, zero pedidos/motoboys/rotas, 1 bucket e 3 objetos Storage. A assinatura das colunas e exatamente e0d524146402cf56f9928d77119af765. Comparacao com o backup: zero tabelas/colunas/constraints/funcoes adicionadas, removidas ou alteradas nos campos capturados; ACLs das funcoes iguais. As mesmas 29 tabelas continuam faltando para 0123.

RLS habilitada nas 69 tabelas public; 115 policies com os mesmos nomes, papeis, comandos e predicados comparados. As duas RPCs protegidas pela M24 continuam sem EXECUTE de anon/authenticated. Nenhum historico de migrations Supabase/Drizzle foi encontrado: decidir por metadados e precondicoes, nao pela numeracao.

O manifesto atualizado fixa as mesmas 26 fontes por hash, mais enum contador condicional. Ainda NAO e pacote remoto executavel: guardas de laboratorio e BEGIN/COMMIT internos precisam ser tratados num derivado revisado antes da autorizacao B. Esta rodada nao repetiu testes de negocio nem alterou funcionalidades.

## Uso e dependencias observados

Existem servicos ativos da plataforma: PostgREST 14.18, Storage API 1.96.4, pg_net, pg_cron, pooler e monitoramento. Realtime publica public.pedidos. Nas configuracoes locais .env dos dois repositorios, nenhuma referencia ao candidato foi encontrada (valores nao exibidos nem alterados).

Nao houve sessao de aplicacao comercial identificavel na coleta, nem pedidos/rotas ou login Auth; **isso nao prova ausencia de frontends, automacoes ou consumidores externos**. Nao foram consultados logs de hospedagens externas ou configuracoes secretas de Edge Functions. Nao invocar funcoes operacionais/HTTP para testar leitura. Preservar publicacoes Realtime e configuracoes Auth/Storage; requerer checagem antes/depois no pacote B.

O job 1 esta ATIVO, agenda 0 12 * * *, timezone GMT: diariamente as 12:00 UTC, ou 09:00 America/Sao_Paulo nesta data. Ultima execucao em 18/11/2026, das 12:00:00.226105Z as 12:00:00.372029Z; sete sucessos nos ultimos sete dias, nenhuma execucao running observada. Comando reconhecido SELECT public.processar_lembretes(), mesmo hash do backup. A funcao gera pedido_lembretes de 7d/3d/24h/dia, com deduplicacao, sem HTTP/Vault no corpo. Nenhum trigger de pedido_lembretes identificado.

**Risco independente:** processar_lembretes permite EXECUTE a PUBLIC/anon/authenticated/service_role. Pausar cron nao bloqueia sua invocacao manual/API nem outros consumidores. Nao se declara isolamento completo de mensagens/automacoes por essa pausa. Antes da autorizacao D, resolver a exposicao por permissao especifica ou comprovar controle equivalente; nenhuma ACL foi alterada nesta rodada.

## Grants e limite da comparacao

role_table_grants retornou 2.238 grants visiveis contra 2.679 no clone parcial. As 441 entradas sem correspondencia pertencem a auth/dashboard_user (182), auth/supabase_auth_admin (189) e storage/supabase_storage_admin (70); nenhuma diferenca foi encontrada nos grants visiveis de public. A view filtra papeis habilitados no contexto do consultante, conforme a definicao instalada do PostgreSQL. A diferenca e compativel com a visibilidade entre o superusuario local e postgres hospedado, mas NAO prova revogacao nem confirma todas as ACLs gerenciadas. Antes de B, comparar relacl/nspacl diretamente sob acesso autorizado, sem restaurar o grafo de 22 memberships. Nao inventar GRANT para compensar a diferenca de uma view.

## Primeira alteracao proposta — somente autorizacao A

Alterar **apenas active=true para active=false do job 1**, por cron.alter_job. Objetos afetados: uma linha de cron.job e a invalidacao interna de cache do proprio agendador. Nao altera comando, agenda, usuarios, funcoes do ERP, RLS, grants, pedidos, Auth, Storage, Realtime ou dados antigos. Nao executar/unschedule o job, nao cancelar sessoes e nao alterar os demais jobs.

Arquivos preparados, NAO executados:
- A-PAUSA-JOB-1-PROPOSTA.sql — SHA-256 27d64772c19f1b230527922849edb76cb313e9c0d945477fce6dbec75740e88c
- A-REVERSAO-JOB-1-PROPOSTA.sql — SHA-256 32ce247b280269a106fce1f4fd5ba9b9af809b8e98510dd041e02276fb59058e

A assinatura cron.alter_job foi lida do catalogo; uso de active e documentado oficialmente em https://supabase.com/docs/guides/cron/quickstart . Permissoes/ownership sao revalidados na execucao: se o dono nao for o executor postgres, houver falta de privilegio, job em andamento ou alteracao de agenda/comando/estado, a operacao ABORTA; nao ampliar privilegios.

**Antes:** executor separado fixado no host/TLS do candidato e autorizacao A por hash; reconsultar exatamente o job/dono/comando/agenda/active e execucoes, confirmar que pedidos continuam inexistentes, guardar antes-imagem privada. A marca GUC no arquivo e declaracao do executor, nao identificacao criptografica do projeto. Nao usar nem enfraquecer o cliente READ ONLY para escrever.

**Durante:** timeout 8 s, lock timeout 2 s, trava consultiva contra duplicacao desta operacao, cron.alter_job e validacao dentro da transacao de que nenhum campo alem de active mudou. Falha antes do commit implica rollback. A permissao de UPDATE direto de cron.job nao e exigida pelo arquivo: usa o mecanismo oficial e suas verificacoes internas.

**Depois:** leitura de active=false, mesmos campos/hash e execucoes sem novo inicio; nao prosseguir para B se houver consumidor/job em andamento. A pausa nao cancela trabalho ja iniciado. Nao ha parada geral do site prevista para esse campo, mas nao e possivel garantir indisponibilidade zero a consumidores desconhecidos. A execucao tera limite de 8 s; a pausa dura a janela aprovada, e pode atrasar/perder janelas de lembretes se longa.

**Reversao:** se a janela for abortada antes das demais fases, restaurar somente active=true com o segundo arquivo, mantendo identidade, agenda, comando e proprietario originais. O arquivo recusa pedidos novos/execucao em andamento/divergencia; nesses casos reavaliar, nao forcar. Nao retomar automaticamente com fixtures/automacoes nao isoladas. Nenhuma reversao de migration ou exclusao de dados integra A.

## Recuperacao e autorizacoes seguintes

Para a alteracao isolada de active, o estado anterior foi capturado e o retorno pelo mesmo mecanismo e uma reversao especifica suficiente enquanto identidade, dados e servico permanecerem consistentes. Nao exige restaurar toda a extensao. Isso NAO comprova restauracao integral do ambiente.

Para B e fases posteriores, persistem limites: cron/Vault/Realtime, seis event triggers, 22 memberships e servicos gerenciados Auth/Storage nao possuem recuperacao integral comprovada. Contagens iguais nao garantem conteudo remoto identico ao backup; antes de B, atualizar backup/verificar sua atualidade e preparar compensacao especifica. Enum contador nao tem down trivial; apos novas escritas, evitar downgrade que perca ledger ou reabra baixas inseguras. Preferir rollback da transacao ainda aberta ou correcao incremental revisada, preservando eventos.

Autorizar separadamente: **A** pausa e retorno descritos; **B** pacote SQL hospedado final, hash/precondicoes/rollback; **C** oito usuarios ficticios atestados preservando todos os existentes; **D** fixture, papeis/capacidades, flags e testes com escrita Auth/PostgREST/RLS/E2E; **E** Preview isolado; **F** producao/cutover. Nenhuma dessas autorizacoes foi concedida nesta rodada.

Caixa e Financeiro continuam distintos na proposta ja testada: Caixa conferir_caixa/receber_pagamento; Financeiro executar_financeiro/receber_pagamento; responsavel distinto aprova, sem autoatribuir capacidade monetaria. Testes reais de API seguem pendentes. O E2E preparado cobre checkout/reserva/FEFO/frete/producao/entregas/retorno/acerto/pagamento, apenas com produtos e contas ficticios, sem usar os 31 produtos antigos, senhas ou gateways reais.

## Decisao solicitada

E possivel avancar com seguranca **somente para A**, apos as revalidacoes e aceitando a suspensao temporaria da geracao automatica de lembretes; nenhuma garantia de congelamento global. Nao autorizar B/C/D/E/F como consequencia dessa decisao.

Texto de autorizacao proposto: **Autorizo somente pausar o job 1 em lflzlcqinarrcgncafol, com as precondicoes e o hash A apresentados, e retornar ao estado original se essa janela for abortada antes das outras fases. Nao autorizo migrations, usuarios, alteracoes de grants/RLS, testes com escrita ou publicacao.**


## Preservacao antes do limite — decisao atual do proprietario

Pausa negada nesta janela. Nao reapresentar a proposta antiga como autorizacao, nao preencher automaticamente marcas GUC e nao executar os arquivos SQL. Nenhuma acao de homologacao foi agendada; leitores locais encerrados. A rotina normal do job 1 continua conforme seu estado ativo observado, sem intervencao nossa.

Consolidacao seletiva: somente esta documentacao, JANELA-CONTROLADA.md e SQL-INCREMENTAL-MANIFESTO.json, apos validacao offline e confirmacao manual do commit-seguro.ps1. As duas propostas SQL ficam preservadas fora do commit porque nao foram homologadas com a extensao pg_cron. Copias textuais abaixo permitem recupera-las sem perder o preparo; nao constituem testes de execucao, concorrencia ou rollback da extensao.

### Primeiros comandos da proxima execucao — locais e sem conexao

~~~powershell
Set-Location 'C:\Users\User\ERP-NEIA-SALGADOS'
git branch --show-current
git rev-parse HEAD
git diff --cached --name-only
Get-Content -LiteralPath 'docs\auditoria\homologacao-lfl-final\PREFLIGHT-HOSPEDADO-E-AUTORIZACAO-A.md'
Get-FileHash -Algorithm SHA256 -LiteralPath 'docs\auditoria\homologacao-lfl-final\A-PAUSA-JOB-1-PROPOSTA.sql','docs\auditoria\homologacao-lfl-final\A-REVERSAO-JOB-1-PROPOSTA.sql'
~~~

Primeiro passo operacional: retomar por este checkpoint, conferir o Git e as propostas e obter NOVA autorizacao especifica A para a proxima janela. Apos eventual aprovacao, revalidar por leitura o job e o baseline antes de escrever; se houve mudanca, parar e revisar so o delta. Nao repetir as auditorias ou testes de negocio ja aprovados. Nao iniciar outra autenticacao automaticamente nem solicitar senha pelo chat.

### Sequencia exata de autorizacoes futuras

1. A: pausa do job 1 e eventual retorno ao estado anterior se a janela for abortada, com hashes/precondicoes. Atualmente NEGADA.
2. B: migrations/delta hospedado definitivo, por hash e com transacoes/recuperacao revisadas; nao executar diretamente as 26 fontes guardadas.
3. C: oito usuarios Auth ficticios, atestados por protocolo e preservando todos os existentes.
4. D: fixture, capacidades distintas Caixa/Financeiro, flags, Auth/PostgREST/RLS e E2E com escrita apenas sintetica; resolver a exposicao manual dos lembretes antes dos testes. Login tambem faz parte dessa autorizacao.
5. E: Preview ERP e App, isolado e sem variaveis produtivas.
6. F: producao/cutover, apenas apos homologacao e confirmacao final propria.

Cada autorizacao e independente; nenhuma implica a seguinte. Recuperacao integral de cron/Vault/Realtime e servicos gerenciados continua nao comprovada. Nao ativar mensagens, gateways ou cobrancas reais.

### Copia documental da pausa — NAO EXECUTAR

Arquivo original preservado: A-PAUSA-JOB-1-PROPOSTA.sql. SHA-256 27d64772c19f1b230527922849edb76cb313e9c0d945477fce6dbec75740e88c.

~~~sql
-- PROPOSTA NAO EXECUTADA. Operacao A_PAUSAR_JOB_1, somente candidato lflzlcqinarrcgncafol.
-- Requer autorizacao humana especifica e executor fixado no host/TLS do candidato.
-- As marcas abaixo sao declaracoes do executor, nao comprovam a identidade sozinhas.
-- Nao usar o leitor READ ONLY para executar escrita. Nao alterar os scripts protegidos.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='2s';
DO $operacao$
DECLARE antes jsonb; depois jsonb;
BEGIN
 IF current_setting('neia_homologacao.project_ref',true) IS DISTINCT FROM 'lflzlcqinarrcgncafol'
 OR current_setting('neia_homologacao.operacao_autorizada',true) IS DISTINCT FROM 'A_PAUSAR_JOB_1' THEN
  RAISE EXCEPTION 'Sem autorizacao especifica desta operacao';
 END IF;
 IF current_user<>'postgres' OR current_database()<>'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) THEN
  RAISE EXCEPTION 'Executor ou TLS inesperado';
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('neia:lfl:homologacao:cron:1',0)) THEN
  RAISE EXCEPTION 'Outra operacao desta janela em andamento';
 END IF;
 SELECT to_jsonb(j) INTO antes FROM cron.job j WHERE jobid=1;
 IF antes IS NULL OR antes->>'schedule'<>'0 12 * * *' OR antes->>'database'<>'postgres'
 OR antes->>'username'<>current_user OR md5(antes->>'command')<>'07eac244df4872c8cc446aee7afc9f17'
 OR (antes->>'active')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Job diverge do snapshot; parar sem alterar';
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job_run_details WHERE jobid=1 AND status='running' AND end_time IS NULL) THEN
  RAISE EXCEPTION 'Job em execucao; nao cancelar processo nem prosseguir';
 END IF;
 IF EXISTS(SELECT 1 FROM public.pedidos) THEN
  RAISE EXCEPTION 'Pedidos passaram a existir; revisar impacto antes desta operacao';
 END IF;
 PERFORM cron.alter_job(job_id:=1,active:=false);
 SELECT to_jsonb(j) INTO depois FROM cron.job j WHERE jobid=1;
 IF depois IS NULL OR (depois->>'active')::boolean IS DISTINCT FROM false
 OR (antes-'active') IS DISTINCT FROM (depois-'active') THEN
  RAISE EXCEPTION 'Alteracao excedeu o unico campo autorizado';
 END IF;
END $operacao$;
COMMIT;
SELECT jobid,schedule,active,database,md5(command) AS command_md5 FROM cron.job WHERE jobid=1;
-- Apos commit: confirmar novamente ausencia de execucao em andamento por leitura.
-- O job pode ter sido invocado por outro caminho; esta operacao nao revoga EXECUTE.
~~~

### Copia documental da reversao — NAO EXECUTAR

Arquivo original preservado: A-REVERSAO-JOB-1-PROPOSTA.sql. SHA-256 32ce247b280269a106fce1f4fd5ba9b9af809b8e98510dd041e02276fb59058e.

~~~sql
-- PROPOSTA NAO EXECUTADA. Operacao A_REVERTER_PAUSA_JOB_1, somente candidato lflzlcqinarrcgncafol.
-- Requer autorizacao humana especifica e executor fixado no host/TLS do candidato.
-- As marcas abaixo sao declaracoes do executor, nao comprovam a identidade sozinhas.
-- Nao usar o leitor READ ONLY para executar escrita. Nao alterar os scripts protegidos.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='2s';
DO $operacao$
DECLARE antes jsonb; depois jsonb;
BEGIN
 IF current_setting('neia_homologacao.project_ref',true) IS DISTINCT FROM 'lflzlcqinarrcgncafol'
 OR current_setting('neia_homologacao.operacao_autorizada',true) IS DISTINCT FROM 'A_REVERTER_PAUSA_JOB_1' THEN
  RAISE EXCEPTION 'Sem autorizacao especifica desta operacao';
 END IF;
 IF current_user<>'postgres' OR current_database()<>'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) THEN
  RAISE EXCEPTION 'Executor ou TLS inesperado';
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('neia:lfl:homologacao:cron:1',0)) THEN
  RAISE EXCEPTION 'Outra operacao desta janela em andamento';
 END IF;
 SELECT to_jsonb(j) INTO antes FROM cron.job j WHERE jobid=1;
 IF antes IS NULL OR antes->>'schedule'<>'0 12 * * *' OR antes->>'database'<>'postgres'
 OR antes->>'username'<>current_user OR md5(antes->>'command')<>'07eac244df4872c8cc446aee7afc9f17'
 OR (antes->>'active')::boolean IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Job diverge do snapshot; parar sem alterar';
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job_run_details WHERE jobid=1 AND status='running' AND end_time IS NULL) THEN
  RAISE EXCEPTION 'Job em execucao; nao cancelar processo nem prosseguir';
 END IF;
 IF EXISTS(SELECT 1 FROM public.pedidos) THEN
  RAISE EXCEPTION 'Pedidos passaram a existir; revisar impacto antes desta operacao';
 END IF;
 PERFORM cron.alter_job(job_id:=1,active:=true);
 SELECT to_jsonb(j) INTO depois FROM cron.job j WHERE jobid=1;
 IF depois IS NULL OR (depois->>'active')::boolean IS DISTINCT FROM true
 OR (antes-'active') IS DISTINCT FROM (depois-'active') THEN
  RAISE EXCEPTION 'Alteracao excedeu o unico campo autorizado';
 END IF;
END $operacao$;
COMMIT;
SELECT jobid,schedule,active,database,md5(command) AS command_md5 FROM cron.job WHERE jobid=1;
-- Apos commit: confirmar novamente ausencia de execucao em andamento por leitura.
-- O job pode ter sido invocado por outro caminho; esta operacao nao revoga EXECUTE.
~~~
