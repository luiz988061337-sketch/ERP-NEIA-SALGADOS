#requires -Version 7.0
# ============================================================================
# COMPLEMENTO 04 - DRIVER OFICIAL DE LABORATORIO
# ============================================================================
# Torna reproduzivel a aplicacao de 04-complemento-hardening.sql sem alterar
# nenhum artefato aprovado: executar-local.ps1, ORIGEM.json, migrations e o
# lote 00-*-03-* permanecem exatamente como estavam.
#
# Fluxo:
#   1. preflight (manifesto, hashes, recursos, portas, confinamento)
#   2. portao de regressao: executa o procedimento original em 55500
#   3. cluster novo em 55501 com a estrutura ate 03
#   4. aplica 04 + T1-T6 + verificacoes de integridade
#   5. grava evidencias no estado privado (fora do Git)
#   6. encerra os clusters e remove somente o que esta execucao criou
#
# Sem Supabase, sem rede, sem trust, sem push.
# ============================================================================
[CmdletBinding()]
param(
  [string]$PrivateStatePath,
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [int]$PortGate = 55500,
  [int]$PortComplemento = 55501,
  [switch]$PularPortaoRegressao   # apenas iteracao local; a evidencia registra
)

$ErrorActionPreference = 'Stop'
$inicio = Get-Date

# ---------------------------------------------------------------------------
# Caminhos
# ---------------------------------------------------------------------------
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$lote = Join-Path $repo 'scripts\homologacao-pg17\lfl-finalizacao-0123'
$base = Join-Path $repo 'scripts\homologacao-pg17'
$manifesto = Join-Path $PSScriptRoot 'ORIGEM-COMPLEMENTO.json'

function Step([string]$msg) { Write-Output ('[COMPLEMENTO] ' + $msg) }
function Falhar([string]$msg) { throw ('PREFLIGHT/EXECUCAO: ' + $msg) }

# ---------------------------------------------------------------------------
# 1. PREFLIGHT
# ---------------------------------------------------------------------------
Step 'preflight: iniciando'

if (-not (Test-Path -LiteralPath $manifesto)) { Falhar 'ORIGEM-COMPLEMENTO.json ausente' }
if (-not $PrivateStatePath) { Falhar 'informe -PrivateStatePath do ensaio revisado' }
if (-not (Test-Path -LiteralPath $PrivateStatePath)) { Falhar 'estado privado inacessivel' }

foreach ($tool in @('initdb.exe','postgres.exe','pg_restore.exe','psql.exe','pg_isready.exe','pg_ctl.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $tool))) { Falhar ('binario ausente: ' + $tool) }
}
$versaoPg = (& (Join-Path $PgBin 'pg_restore.exe') --version)
if ($LASTEXITCODE -ne 0 -or $versaoPg -notmatch 'PostgreSQL\) 17\.') { Falhar 'exige PostgreSQL 17' }
if ($PSVersionTable.PSVersion.Major -lt 7) { Falhar 'exige PowerShell 7' }

# 1.1 hashes de tudo que este driver usa (inclui o proprio driver)
$man = Get-Content -LiteralPath $manifesto -Raw | ConvertFrom-Json
if ($man.schema -ne 'neia-complemento-proveniencia-1') { Falhar 'schema de manifesto desconhecido' }
$verificados = 0
foreach ($entry in $man.arquivos.PSObject.Properties) {
  $alvo = Join-Path $repo $entry.Name.Replace('/', '\')
  if (-not (Test-Path -LiteralPath $alvo)) { Falhar ('dependencia ausente: ' + $entry.Name) }
  $item = Get-Item -LiteralPath $alvo
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { Falhar ('reparse point recusado: ' + $entry.Name) }
  $hash = (Get-FileHash -LiteralPath $alvo -Algorithm SHA256).Hash
  if ($hash -ine $entry.Value) { Falhar ('hash diverge do manifesto: ' + $entry.Name) }
  $verificados++
}
Step ("preflight: $verificados arquivos conferem com ORIGEM-COMPLEMENTO.json")

# 1.2 lote aprovado continua intacto (autoridade e' o ORIGEM.json original)
$origem = Get-Content -LiteralPath (Join-Path $lote 'ORIGEM.json') -Raw | ConvertFrom-Json
$loteOk = 0
foreach ($entry in $origem.files.PSObject.Properties) {
  $f = Get-Item -LiteralPath (Join-Path $lote $entry.Name)
  if (($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash -ine $entry.Value) { Falhar ('lote aprovado divergiu: ' + $entry.Name) }
  $loteOk++
}
Step ("preflight: lote aprovado intacto ($loteOk/13)")

# 1.3 estado privado + copia do backup
$s = Get-Content -LiteralPath $PrivateStatePath -Raw | ConvertFrom-Json
$privOk = 0
foreach ($entry in $origem.privateSupport.PSObject.Properties) {
  $f = Get-Item -LiteralPath (Join-Path $s.path $entry.Name)
  if (($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash -ine $entry.Value) { Falhar ('suporte privado divergiu: ' + $entry.Name) }
  $privOk++
}
$dump = Get-Item -LiteralPath (Join-Path $s.copy 'database-full.dump')
$dumpMan = @(Get-Content -LiteralPath (Join-Path $s.copy 'SHA256-initial.json') -Raw | ConvertFrom-Json)
$dumpExp = @($dumpMan | Where-Object file -eq 'database-full.dump')
if ($dumpExp.Count -ne 1 -or $dump.Length -ne $dumpExp[0].size -or (Get-FileHash -LiteralPath $dump.FullName -Algorithm SHA256).Hash -ine $dumpExp[0].sha256) { Falhar 'copia privada do backup nao confere' }
Step ("preflight: suporte privado ($privOk/2) e dump conferem")

# 1.4 portas e ausencia de laboratorio ativo
foreach ($p in @($PortGate, $PortComplemento)) {
  if (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue) { Falhar ('porta ocupada: ' + $p + ' (nao conectar em banco existente)') }
}
$vivos = @(Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | Where-Object { $_.CommandLine -match 'neia-recovery' })
if ($vivos.Count -gt 0) { Falhar ('laboratorio anterior ainda ativo: PID ' + ($vivos.ProcessId -join ',')) }
Step 'preflight: portas livres e nenhum cluster de laboratorio ativo'

# 1.5 procedimento original presente
foreach ($n in @('executar-local.ps1','00-dependencias-operacionais.sql','00-guard-pedido.sql','00-permissoes-novas.sql',
                 '01-funcoes-essenciais.sql','02-estorno-compativel.sql','03-capacidades-financeiras.sql',
                 'complemento-b-laboratorio\04-complemento-hardening.sql','complemento-b-laboratorio\complemento-hardening.test.sql')) {
  if (-not (Test-Path -LiteralPath (Join-Path $lote $n))) { Falhar ('arquivo exigido ausente: ' + $n) }
}
$migr = @(Get-ChildItem -LiteralPath (Join-Path $repo 'drizzle\migrations') -File | Where-Object { $_.Name -match '^01(0[5-9]|1[0-9]|2[0-3])_' } | Sort-Object Name)
if ($migr.Count -ne 19) { Falhar ('cadeia operacional inesperada: ' + $migr.Count + ' migrations') }
Step 'preflight: procedimento original e cadeia de 19 migrations presentes'

# 1.6 snapshots para limpeza seletiva
$clustersAntes = @(Get-ChildItem -LiteralPath $s.path -Directory -Filter 'neia-recovery-*' | Select-Object -ExpandProperty Name)
$evidencias = Join-Path $s.path 'complemento-resultados'
if (-not (Test-Path -LiteralPath $evidencias)) { New-Item -ItemType Directory -Path $evidencias | Out-Null }
$carimbo = $inicio.ToString('yyyyMMdd-HHmmss')

# preserva as evidencias anteriores que o portao de regressao regrava
$preservadas = [Collections.Generic.List[string]]::new()
foreach ($n in @('final11-result.json','rpc-compat-result.json')) {
  $orig = Join-Path $s.path $n
  if (Test-Path -LiteralPath $orig) {
    $destino = Join-Path $evidencias ($carimbo + '-anterior-' + $n)
    Copy-Item -LiteralPath $orig -Destination $destino -Force
    $preservadas.Add($destino)
  }
}
Step ('preflight: aprovado; evidencias anteriores preservadas em ' + (Split-Path $evidencias -Leaf))

# ---------------------------------------------------------------------------
# 2. PORTAO DE REGRESSAO - procedimento original, sem alteracao
# ---------------------------------------------------------------------------
$resultado = [ordered]@{
  schema = 'neia-complemento-resultado-1'
  iniciado = $inicio.ToString('o')
  estadoPrivado = $s.path
  portaoRegressao = $null
  complemento = $null
  arquivosVerificados = $verificados
  evidenciasAnteriores = @($preservadas)
  clustersCriados = @()
  clustersRemovidos = @()
  status = 'EM_EXECUCAO'
}

. (Join-Path $base 'restaurar-backup-local.ps1') -PgBin $PgBin -Port $PortComplemento
$cluster = $null
$sucesso = $false
$saidaPortao = $null
try {
if (-not $PularPortaoRegressao) {
  Step ('portao: executando procedimento original na porta ' + $PortGate)
  # processo filho: garante codigo de saida real e preserva a saida mesmo em falha
  $pwshExe = (Get-Process -Id $PID).Path
  $saidaPortao = & $pwshExe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $lote 'executar-local.ps1') -PrivateStatePath $PrivateStatePath -PgBin $PgBin -Port $PortGate -Executar 2>&1
  $codigoPortao = $LASTEXITCODE
  $textoPortao = ($saidaPortao | Out-String)
  Set-Content -LiteralPath (Join-Path $evidencias ($carimbo + '-portao.log')) -Value $textoPortao -Encoding utf8
  $aprovado = ($codigoPortao -eq 0) -and ($textoPortao -match 'PASSOU: 11 funcoes')
  $resultado.portaoRegressao = [ordered]@{
    executado = $true
    exit = $codigoPortao
    aprovado = $aprovado
    suites = @([regex]::Matches($textoPortao, 'PASSED_SYNTHETIC (\S+)') | ForEach-Object { $_.Groups[1].Value })
    concorrencia = @([regex]::Matches($textoPortao, 'OK ') ).Count
    log = (Join-Path $evidencias ($carimbo + '-portao.log'))
  }
  if (-not $aprovado) { Falhar ('portao de regressao reprovou (exit ' + $codigoPortao + ')') }
  Step 'portao: procedimento original aprovado'
} else {
  $resultado.portaoRegressao = [ordered]@{ executado = $false; motivo = 'PularPortaoRegressao' }
  Step 'portao: PULADO por parametro explicito (nao usar como evidencia final)'
}

# ---------------------------------------------------------------------------
# 3. CLUSTER DE COMPLEMENTO (55501) - estrutura ate 03
# ---------------------------------------------------------------------------
$cluster = New-NeiaDisposableCluster $s.path $PgBin $PortComplemento
  Step ('complemento: cluster descartavel em ' + (Split-Path $cluster.Root -Leaf))

  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-f',(Join-Path $s.path 'roles-definitions-local.sql')) | Out-Null
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE lfl_partial OWNER postgres TEMPLATE template0;') | Out-Null
  Invoke-NeiaLocalPg $cluster 'pg_restore' @('-w','--schema-only','--exit-on-error','--single-transaction','--use-list',(Join-Path $s.path 'partial-restore.list'),'-d','lfl_partial',(Join-Path $s.copy 'database-full.dump')) | Out-Null
  $linhas = (Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-c','SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.produtos)+(SELECT count(*) FROM public.pedidos);')).Trim()
  if ($linhas -ne '0') { Falhar 'dados reais presentes no laboratorio; parar' }
  Step 'complemento: restauracao parcial sem dados reais'

  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',(Join-Path $base 'lfl-base-aditiva-local.sql'),'-c','COMMIT;') | Out-Null
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"ALTER TYPE public.app_role ADD VALUE 'contador';") | Out-Null
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',(Join-Path $lote '00-dependencias-operacionais.sql')) | Out-Null
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',(Join-Path $lote '00-guard-pedido.sql')) | Out-Null
  foreach ($file in $migr) {
    Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',$file.FullName) | Out-Null
  }
  foreach ($nome in @('01-funcoes-essenciais.sql','02-estorno-compativel.sql')) {
    Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',(Join-Path $lote $nome)) | Out-Null
  }
  $owners = @'
DO $$ DECLARE x record; BEGIN
 FOR x IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'neia_%' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) LOOP
  EXECUTE format('ALTER SCHEMA %I OWNER TO postgres',x.nspname);
 END LOOP;
 FOR x IN SELECT n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE (n.nspname='public' OR n.nspname LIKE 'neia_%') AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND c.relkind IN ('r','p','S','v') LOOP
  EXECUTE format('ALTER %s %I.%I OWNER TO postgres',CASE x.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' ELSE 'TABLE' END,x.nspname,x.relname);
 END LOOP;
 FOR x IN SELECT n.nspname,t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE (n.nspname='public' OR n.nspname LIKE 'neia_%') AND t.typowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND t.typtype IN ('e','d') LOOP
  EXECUTE format('ALTER TYPE %I.%I OWNER TO postgres',x.nspname,x.typname);
 END LOOP;
 FOR x IN SELECT p.oid::regprocedure AS identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='public' OR n.nspname LIKE 'neia_%') AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',x.identity);
 END LOOP;
END $$;
'@
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',$owners) | Out-Null
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c','GRANT authenticated,anon TO postgres WITH INHERIT FALSE;') | Out-Null
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',(Join-Path $lote '00-permissoes-novas.sql')) | Out-Null
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',(Join-Path $lote '03-capacidades-financeiras.sql')) | Out-Null
  Step 'complemento: estrutura reproduzida ate 03-capacidades-financeiras'

  # ---- sonda antes do complemento (base para provar que 04 nao inventa regra)
  $sonda = @'
select jsonb_build_object(
  'tabelas_public', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
  'policies_public', (select count(*) from pg_policies where schemaname='public'),
  'tabelas_sem_rls', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  'indices_novos', (select count(*) from pg_indexes where schemaname='public' and indexname in ('caixa_sessao_aberta_unica','rotas_preparando_motoboy_uniq','notificacoes_log_idem_idx')),
  'trigger_fechamento', (select count(*) from pg_trigger where tgname='contas_fechamento_trg' and not tgisinternal),
  'trigger_conferencia_0084', (select count(*) from pg_trigger where tgname='trigger_exigir_conferencia' and not tgisinternal),
  'trigger_reserva_producao_postergado', (select count(*) from pg_trigger where tgname='trigger_exigir_reserva_producao' and not tgisinternal),
  'trigger_consumo_producao_postergado', (select count(*) from pg_trigger where tgname='trigger_exigir_consumo_producao' and not tgisinternal),
  'triggers_neia_teste', (select count(*) from pg_trigger where tgname like 'neia_exigir%' and not tgisinternal),
  'tabelas_29_com_policy', (select count(distinct tablename) from pg_policies where schemaname='public' and tablename in ('acertos_motoboy','acertos_rota','acertos_rota_eventos','caixa_sessoes','centros_custo','config_entrega','conta_pagamento_eventos','contador_acessos','contas','contas_bancarias','escalas','estoque_mov_operacoes','extratos','fechamentos_mensais','funcionarios','notificacoes_log','pedido_item_componentes','pedido_pagamento_eventos','plano_contas','pontos','precificacao_config','preco_historico','reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','solicitacoes_contador','turnos_motoboy','turnos_motoboy_eventos','vales')),
  'rpcs_anon_executaveis', (select count(*) from (values
     ('public.conferir_acerto_rota_independente(uuid,text,bigint,bigint,text)'),
     ('public.confirmar_pagamento_turno_motoboy(uuid,bigint,text,timestamptz,text,text)'),
     ('public.registrar_pagamento_conta(uuid,bigint,text)'),
     ('public.estornar_pagamento_conta(uuid,bigint,text,text)'),
     ('public.cancelar_conta_financeira(uuid)'),
     ('public.conciliar_extrato_atomico(uuid,text,uuid)'),
     ('public.registrar_movimento_caixa(text,bigint,text)'),
     ('public.registrar_pagamento_pedido(uuid,bigint,text)'),
     ('public.estornar_pagamento_pedido(uuid,bigint,text,text)'),
     ('public.estornar_conta(uuid,text)')) t(sig)
    where has_function_privilege('anon', t.sig, 'EXECUTE')),
  'rpcs_authenticated_executaveis', (select count(*) from (values
     ('public.conferir_acerto_rota_independente(uuid,text,bigint,bigint,text)'),
     ('public.confirmar_pagamento_turno_motoboy(uuid,bigint,text,timestamptz,text,text)'),
     ('public.registrar_pagamento_conta(uuid,bigint,text)'),
     ('public.estornar_pagamento_conta(uuid,bigint,text,text)'),
     ('public.cancelar_conta_financeira(uuid)'),
     ('public.conciliar_extrato_atomico(uuid,text,uuid)'),
     ('public.registrar_movimento_caixa(text,bigint,text)'),
     ('public.registrar_pagamento_pedido(uuid,bigint,text)'),
     ('public.estornar_pagamento_pedido(uuid,bigint,text,text)'),
     ('public.estornar_conta(uuid,text)')) t(sig)
    where has_function_privilege('authenticated', t.sig, 'EXECUTE')),
  'delete_authenticated_15', (select count(*) from (values ('contas'),('caixa_sessoes'),('contas_bancarias'),('centros_custo'),('plano_contas'),('extratos'),('fechamentos_mensais'),('precificacao_config'),('preco_historico'),('acertos_motoboy'),('funcionarios'),('escalas'),('pontos'),('vales'),('config_entrega')) t(n)
    where has_table_privilege('authenticated','public.'||quote_ident(t.n),'DELETE')),
  'select_authenticated_15', (select count(*) from (values ('contas'),('caixa_sessoes'),('contas_bancarias'),('centros_custo'),('plano_contas'),('extratos'),('fechamentos_mensais'),('precificacao_config'),('preco_historico'),('acertos_motoboy'),('funcionarios'),('escalas'),('pontos'),('vales'),('config_entrega')) t(n)
    where has_table_privilege('authenticated','public.'||quote_ident(t.n),'SELECT'))
);
'@
  $antesTexto = (Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-c',$sonda)).Trim()
  $antes = $antesTexto | ConvertFrom-Json
  Step 'complemento: sonda registrada antes do 04'

  # -------------------------------------------------------------------------
  # 4. APLICACAO DO COMPLEMENTO + T1-T6
  # -------------------------------------------------------------------------
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',(Join-Path $PSScriptRoot '04-complemento-hardening.sql')) | Out-Null
  Step 'complemento: 04-complemento-hardening.sql aplicado (COMMIT)'

  $saidaTeste = (Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',(Join-Path $PSScriptRoot 'complemento-hardening.test.sql')))
  $aprovadoTeste = $saidaTeste -match 'testes locais aprovados \(T1-T6\)'
  if (-not $aprovadoTeste) { Falhar 'T1-T6 nao reportaram aprovacao' }
  Set-Content -LiteralPath (Join-Path $evidencias ($carimbo + '-t1-t6.log')) -Value $saidaTeste -Encoding utf8
  Step 'complemento: T1-T6 aprovados'

  $depoisTexto = (Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-c',$sonda)).Trim()
  $depois = $depoisTexto | ConvertFrom-Json

  # ---- verificacoes de integridade do complemento
  $falhas = [Collections.Generic.List[string]]::new()
  if ($depois.indices_novos -ne 3) { $falhas.Add('indices: ' + $depois.indices_novos) }
  if ($depois.trigger_fechamento -ne 1) { $falhas.Add('trigger fechamento: ' + $depois.trigger_fechamento) }
  if ($antes.trigger_fechamento -ne 0) { $falhas.Add('guarda de fechamento ja existia antes do 04') }
  if ($depois.trigger_reserva_producao_postergado -ne 0) { $falhas.Add('trigger de reserva instalado indevidamente') }
  if ($depois.trigger_consumo_producao_postergado -ne 0) { $falhas.Add('trigger de consumo instalado indevidamente') }
  if ($antes.policies_public -ne $depois.policies_public) { $falhas.Add('04 alterou policies: ' + $antes.policies_public + ' -> ' + $depois.policies_public) }
  if ($antes.tabelas_public -ne $depois.tabelas_public) { $falhas.Add('04 alterou tabelas') }
  if ($depois.tabelas_29_com_policy -ne 29) { $falhas.Add('tabelas com policy: ' + $depois.tabelas_29_com_policy + '/29') }
  if ($depois.tabelas_sem_rls -ne 0) { $falhas.Add('tabelas sem RLS: ' + $depois.tabelas_sem_rls) }
  if ($depois.rpcs_anon_executaveis -ne 0) { $falhas.Add('RPC executavel por anon: ' + $depois.rpcs_anon_executaveis) }
  if ($depois.rpcs_authenticated_executaveis -ne 10) { $falhas.Add('RPCs para authenticated: ' + $depois.rpcs_authenticated_executaveis) }
  if ($depois.delete_authenticated_15 -ne 0) { $falhas.Add('DELETE remanescente: ' + $depois.delete_authenticated_15) }
  if ($depois.select_authenticated_15 -ne 15) { $falhas.Add('SELECT perdido: ' + $depois.select_authenticated_15 + '/15') }
  if ($falhas.Count -gt 0) { Falhar ('verificacoes de integridade: ' + ($falhas -join '; ')) }
  Step 'complemento: verificacoes de integridade aprovadas'

  $resultado.complemento = [ordered]@{
    porta = $PortComplemento
    aplicado = $true
    t1aT6 = $aprovadoTeste
    antes = $antes
    depois = $depois
    verificacoes = 'aprovadas'
  }
  $resultado.status = 'APROVADO'
  $sucesso = $true
}
catch {
  $resultado.status = 'REPROVADO'
  $resultado.erro = $_.Exception.Message
  throw
}
finally {
  Stop-NeiaDisposableCluster $cluster
  # limpeza seletiva: apenas clusters criados nesta execucao, e somente no sucesso
  $clustersDepois = @(Get-ChildItem -LiteralPath $s.path -Directory -Filter 'neia-recovery-*' | Select-Object -ExpandProperty Name)
  $resultado.clustersCriados = @($clustersDepois | Where-Object { $_ -notin $clustersAntes })
  if ($sucesso) {
    foreach ($nome in $resultado.clustersCriados) {
      $alvo = Join-Path $s.path $nome
      if ($nome -notmatch '^neia-recovery-[0-9a-f]{32}$') { continue }
      if (-not $alvo.StartsWith($s.path, [StringComparison]::OrdinalIgnoreCase)) { continue }
      $dataDir = Join-Path $alvo 'data'
      if (Test-Path -LiteralPath $dataDir) {
        & (Join-Path $PgBin 'pg_ctl.exe') -D $dataDir status 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) { continue }   # ainda ativo: nao apagar
      }
      # preserva o log nativo do cluster antes de remover o diretorio
      $logNativo = Join-Path $alvo 'private-native.log'
      if (Test-Path -LiteralPath $logNativo) {
        Copy-Item -LiteralPath $logNativo -Destination (Join-Path $evidencias ($carimbo + '-cluster-' + $nome.Substring(14, 8) + '.log')) -Force
      }
      Remove-Item -LiteralPath $alvo -Recurse -Force
      $resultado.clustersRemovidos += $nome
    }
  }
  $resultado.finalizado = (Get-Date).ToString('o')
  $resultado.duracaoSegundos = [int]((Get-Date) - $inicio).TotalSeconds
  $destino = Join-Path $evidencias ('complemento-' + $carimbo + '.json')
  $resultado | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $destino -Encoding utf8
  Write-Output ('[COMPLEMENTO] evidencia: ' + $destino)
  Write-Output ('[COMPLEMENTO] status: ' + $resultado.status)
}

if (-not $sucesso) { exit 1 }
Write-Output 'PASSOU: complemento 04 reproduzido e verificado no laboratorio isolado.'
