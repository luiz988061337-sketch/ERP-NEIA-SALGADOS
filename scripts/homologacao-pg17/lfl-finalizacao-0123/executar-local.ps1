#requires -Version 7.0
[CmdletBinding()]
param([string]$PrivateStatePath,[string]$PgBin='C:\Program Files\PostgreSQL\17\bin',
 [ValidateRange(1024,65535)][int]$Port=55500,[switch]$Executar)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\restaurar-backup-local.ps1') -PgBin $PgBin -Port $Port
if(-not $Executar){Write-Output 'PREPARACAO: nenhuma conexao. -Executar cria somente cluster descartavel local, restaura apenas estrutura e usa dados sinteticos.';return}
if(-not $PrivateStatePath){throw 'Informe o estado privado do ensaio parcial previamente revisado.'}
$origem=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ORIGEM.json') -Raw|ConvertFrom-Json
foreach($entry in $origem.files.PSObject.Properties){
 if($entry.Name -notmatch '^[a-zA-Z0-9_.-]+$'){throw 'Manifesto com caminho invalido'}
 $f=Get-Item -LiteralPath (Join-Path $PSScriptRoot $entry.Name)
 if(($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash -ine $entry.Value){throw 'Arquivo do lote diverge do manifesto'}
}
$v=& (Join-Path $PgBin 'pg_restore.exe') --version
if($LASTEXITCODE -ne 0 -or $v -notmatch 'PostgreSQL\) 17\.'){throw 'Exige PostgreSQL 17'}
$SomenteFinal=$false;$SomenteConcorrencia=$false;$Interativo=$false
$s=Get-Content -LiteralPath $PrivateStatePath -Raw|ConvertFrom-Json
foreach($entry in $origem.privateSupport.PSObject.Properties){
 $f=Get-Item -LiteralPath (Join-Path $s.path $entry.Name)
 if(($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash -ine $entry.Value){throw 'Suporte privado diverge do ensaio revisado'}
}
$dump=Get-Item -LiteralPath (Join-Path $s.copy 'database-full.dump')
$manifest=@(Get-Content -LiteralPath (Join-Path $s.copy 'SHA256-initial.json') -Raw|ConvertFrom-Json)
$expected=@($manifest|Where-Object file -eq 'database-full.dump')
if($expected.Count -ne 1 -or ($dump.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $dump.Length -ne $expected[0].size -or (Get-FileHash -LiteralPath $dump.FullName -Algorithm SHA256).Hash -ine $expected[0].sha256){throw 'Copia privada do backup nao confere'}
$cluster=$null;$applied=[Collections.Generic.List[string]]::new();$current='bootstrap'
try{
 $cluster=New-NeiaDisposableCluster $s.path $PgBin $Port
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-f',(Join-Path $s.path 'roles-definitions-local.sql'))|Out-Null
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE lfl_partial OWNER postgres TEMPLATE template0;')|Out-Null
 Invoke-NeiaLocalPg $cluster 'pg_restore' @('-w','--schema-only','--exit-on-error','--single-transaction','--use-list',(Join-Path $s.path 'partial-restore.list'),'-d','lfl_partial',(Join-Path $s.copy 'database-full.dump'))|Out-Null
 $count=(Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-c','SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.produtos)+(SELECT count(*) FROM public.pedidos);')).Trim()
 if($count -ne '0'){throw 'Dados reais presentes no laboratorio de RPCs; parar'}
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',(Join-Path $PSScriptRoot '..\lfl-base-aditiva-local.sql'),'-c','COMMIT;')|Out-Null
 # Somente laboratorio sem dados reais: decisao de enum nao aplicada no original.
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"ALTER TYPE public.app_role ADD VALUE 'contador';")|Out-Null
 $current='dependencia atribuir 0084'
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',(Join-Path $PSScriptRoot '00-dependencias-operacionais.sql'))|Out-Null
 $current='guard de pedidos adaptado'
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',(Join-Path $PSScriptRoot '00-guard-pedido.sql'))|Out-Null
 $files=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\..\..\drizzle\migrations') -File|Where-Object {$_.Name -match '^01(0[5-9]|1[0-9]|2[0-3])_'}|Sort-Object Name
 if($files.Count -ne 19){throw 'Cadeia operacional inesperada'}
 foreach($file in $files){
  $current=$file.Name
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',$file.FullName)|Out-Null
  $applied.Add($file.Name);Write-Output ('APPLIED_SYNTHETIC '+$file.Name)
 }
 $current='delta das onze funcoes'
 foreach($name in @('01-funcoes-essenciais.sql','02-estorno-compativel.sql')){
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',((Join-Path $PSScriptRoot $name)))|Out-Null
 }
 $current='owners locais de implantacao'
 $owners=@'
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
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',$owners)|Out-Null
 # Apenas o subconjunto para SET ROLE das sessoes de teste. Nao representa o
 # grafo gerenciado integral; nao concede heranca automatica a postgres.
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c','GRANT authenticated,anon TO postgres WITH INHERIT FALSE;')|Out-Null
 $current='permissoes novas'
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',(Join-Path $PSScriptRoot '00-permissoes-novas.sql'))|Out-Null
 $current='regressoes.sql'
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c','SET SESSION AUTHORIZATION postgres;','-f',(Join-Path $PSScriptRoot '..\regressoes.sql'))|Out-Null
 $current='testes onze funcoes'
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c','SET SESSION AUTHORIZATION postgres;','-f',(Join-Path $PSScriptRoot 'funcoes-essenciais.test.sql'))|Out-Null
 if($SomenteFinal){Write-Output 'PASSOU final11';return}
 $current='concorrencia sem extensao'
 & (Join-Path $PSScriptRoot 'concorrencia.test.ps1') -Cluster $cluster -State $s
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c','UPDATE public.reserva_proveniencia_config SET controlado=false WHERE id;')|Out-Null
 $current='guard cliente sintetico'
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c','SET SESSION AUTHORIZATION postgres;','-f',(Join-Path $PSScriptRoot 'cliente-isolamento.test.sql'))|Out-Null
 if($SomenteConcorrencia){Write-Output 'Concorrencia e guard cliente verificados; demais suites anteriores nao repetidas.';return}
 $tests=[Collections.Generic.List[string]]::new();$tests.Add('regressoes.sql')
 foreach($test in @('rotas-app.sql','inicio-rota-integridade.sql','impressao.sql','fechamento-turno.sql','seguranca-financeira-motoboy.sql','pagamento-turno.sql','liberacao-central.sql','fluxo-completo-rota.sql','motoboy-corte-gps.sql')){
  $current=$test
  if($test -eq 'motoboy-corte-gps.sql'){
   # O teste GPS consome casos iniciados pela suite dblink no runner original.
   # Sem instalar dblink, preparar o mesmo estado somente pelas RPCs reais.
   $prepare=@'
SET LOCAL ROLE authenticated;
DO $$ DECLARE c record; p uuid; r jsonb; BEGIN
 FOR c IN SELECT * FROM teste_inicio.casos WHERE n IN (4,5) ORDER BY n LOOP
  PERFORM set_config('request.jwt.claim.sub',c.usuario::text,true);
  FOREACH p IN ARRAY c.pedidos LOOP
   r:=public.confirmar_retirada(p);
   IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Retirada de fixture GPS falhou'; END IF;
  END LOOP;
  r:=public.iniciar_rota(c.rota);
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Inicio de fixture GPS falhou'; END IF;
 END LOOP;
END $$;
'@
   Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c','SET SESSION AUTHORIZATION postgres;','-c',$prepare)|Out-Null
  }
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c','SET SESSION AUTHORIZATION postgres;','-f',((Join-Path $PSScriptRoot ('..\'+$test))))|Out-Null
  $tests.Add($test);Write-Output ('PASSED_SYNTHETIC '+$test)
 }
 $current='capacidades e fluxo integrado com atores distintos'
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',(Join-Path $PSScriptRoot '03-capacidades-financeiras.sql'))|Out-Null
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c','SET SESSION AUTHORIZATION postgres;','-f',(Join-Path $PSScriptRoot 'capacidades-integracao.test.sql'))|Out-Null
 Write-Output 'PASSED_SYNTHETIC financeiro-capacidades-integrado'
 @{status='ESSENTIAL_11_AND_CAPABILITIES_PASSED_LOCAL';applied=@($applied);regressionSuites=@($tests);essentialSuite=$true;cashFinanceIntegration=$true;concurrencyChecks=14;authServicesTested=$false;fullRestoreApproved=$false;remoteWrites=0}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $s.path 'final11-result.json') -Encoding utf8
 Write-Output 'PASSOU: 11 funcoes, fluxo Caixa/Financeiro separado, dez suites de regressao e 14 verificacoes de concorrencia. Auth/PostgREST hospedados nao testados.'
}catch{
 @{status='BLOCKED_NOT_ROLLOUT_READY';at=$current;applied=@($applied);privateLog=if($cluster){Join-Path $cluster.Root 'private-native.log'}else{$null};remoteWrites=0}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $s.path 'rpc-compat-result.json') -Encoding utf8
 throw
}finally{
 Stop-NeiaDisposableCluster $cluster
}
