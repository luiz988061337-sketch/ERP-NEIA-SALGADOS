#requires -Version 7.0
[CmdletBinding()]
param([string]$PrivateStatePath,[string]$PgBin='C:\Program Files\PostgreSQL\17\bin',
 [ValidateRange(1024,65535)][int]$Port=55501,[switch]$Executar)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\restaurar-backup-local.ps1') -PgBin $PgBin -Port $Port
if(-not $Executar){Write-Output 'PREPARACAO: nenhuma conexao. -Executar cria somente cluster descartavel local, restaura uma COPIA PRIVADA PARCIAL, confere hashes antigos e testa fixture local. Nao comprova recuperacao integral.';return}
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
 Invoke-NeiaLocalPg $cluster 'pg_restore' @('-w','--no-subscriptions','--exit-on-error','--single-transaction','--use-list',(Join-Path $s.path 'partial-restore.list'),'-d','lfl_partial',(Join-Path $s.copy 'database-full.dump'))|Out-Null
 $count=(Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-c','SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.produtos)+(SELECT count(*) FROM public.pedidos);')).Trim()
 if($count -ne '32'){throw 'Inventario esperado da copia privada mudou; parar sem imprimir dados'}
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
 $current='capacidades vazias, sem modificar usuarios antigos'
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",'-f',(Join-Path $PSScriptRoot '03-capacidades-financeiras.sql'))|Out-Null
 $tables=@(Get-Content -LiteralPath (Join-Path $s.path 'partial-table-hashes-private.json') -Raw|ConvertFrom-Json)
 $verified=0
 foreach($table in $tables){
  $current='conferencia privada de colunas originais'
  $output=Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-v','ON_ERROR_STOP=1','-c',('COPY '+$table.schema+'.'+$table.table+' ('+$table.columns+') TO STDOUT;'))
  $rows=@();if($output.Length){$lf=[string][char]10;$crlf=([string][char]13)+$lf;$v=$output.Replace($crlf,$lf);if($v.EndsWith($lf)){$v=$v.Substring(0,$v.Length-1)};$rows=$v.Split($lf)}
  $fp=Get-NeiaRowFingerprint -Rows $rows
  if($fp.count -ne $table.count -or $fp.sha256 -ne $table.sha256){throw 'Divergencia de linhas/colunas originais; nao divulgar conteudo'}
  $verified++
 }
 $checks=Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-c',"SELECT jsonb_build_object('auth_preservado',(SELECT count(*)=1 FROM auth.users),'capacidades_vazias',(SELECT count(*)=0 FROM neia_operacao.financeiro_capacidades),'m24_helpers_fechados',NOT has_function_privilege('authenticated','public.reservar_estoque_atomica(uuid,uuid,integer)','EXECUTE') AND NOT has_function_privilege('authenticated','public.liberar_reserva_atomica(uuid)','EXECUTE'),'indices_invalidos',(SELECT count(*) FROM pg_index WHERE NOT indisvalid),'constraints_invalidas',(SELECT count(*) FROM pg_constraint WHERE NOT convalidated));")|ConvertFrom-Json
 if(-not $checks.auth_preservado -or -not $checks.capacidades_vazias -or -not $checks.m24_helpers_fechados -or $checks.indices_invalidos -or $checks.constraints_invalidas){throw 'Invariante de compatibilidade falhou'}
 @{status='PARTIAL_COPY_INCREMENTAL_ORIGINAL_COLUMNS_PRESERVED';tablesVerified=$verified;checks=$checks;fullRestoreApproved=$false;remoteWrites=0}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $s.path 'compatibilidade-final11-private.json') -Encoding utf8
 $current='fixture local com oito usuarios novos e um anterior preservado'
 Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',(Join-Path $PSScriptRoot 'fixture-coexistencia.test.sql'))|Out-Null
 $auth=@($tables|Where-Object {$_.schema -eq 'auth' -and $_.table -eq 'users'})[0]
 $output=Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',('COPY (SELECT '+$auth.columns+" FROM auth.users WHERE coalesce(raw_app_meta_data->'neia_homologacao'->>'protocolo','')<>'d0000000-0000-4000-8000-000000000123') TO STDOUT;"))
 $lf=[string][char]10;$v=$output.Replace(([string][char]13)+$lf,$lf);if($v.EndsWith($lf)){$v=$v.Substring(0,$v.Length-1)}
 $fp=Get-NeiaRowFingerprint -Rows @($v.Split($lf))
 if($fp.count -ne $auth.count -or $fp.sha256 -ne $auth.sha256){throw 'Usuario Auth antigo mudou durante a fixture local'}
 @{status='PARTIAL_COPY_AND_FIXTURE_PASSED';tablesVerified=$verified;originalAuthUnchanged=$true;syntheticActors=8;totalAuth=9;preFixtureChecks=$checks;fullRestoreApproved=$false;authServicesTested=$false;remoteWrites=0}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $s.path 'compatibilidade-final11-private.json') -Encoding utf8
 Write-Output 'PASSOU fixture LOCAL: oito atores novos, nove usuarios no total, hash do Auth anterior intacto e capacidades distintas. Servico Auth real NAO testado.'
 Write-Output ('PASSOU: '+$verified+' tabelas da copia parcial com contagens/hashes das colunas antigas preservados; Auth antigo intacto; capacidades inicialmente vazias e depois atribuidas somente a novas contas sinteticas; helpers M24 fechados. Restauracao integral NAO aprovada.')
}catch{
 @{status='BLOCKED';at=$current;privateLog=(Join-Path $cluster.Root 'private-native.log');remoteWrites=0}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $s.path 'compatibilidade-final11-private.json') -Encoding utf8
 throw
}finally{Stop-NeiaDisposableCluster $cluster}
