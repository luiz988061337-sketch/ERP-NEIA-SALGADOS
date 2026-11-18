param($Cluster,$State,$OriginalFingerprints,[string]$SqlPath)
$ErrorActionPreference='Stop'
function Sql([string]$q){(Invoke-NeiaLocalPg $Cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-v','ON_ERROR_STOP=1','-c',$q)).Trim()}
function Check([bool]$ok,[string]$name){if(-not $ok){throw ('Delta: '+$name)};Write-Output ('OK '+$name)}
$base=if($SqlPath){(Resolve-Path -LiteralPath $SqlPath).Path.Replace('\','/')}else{(Join-Path $State.path 'incremental-base-local.sql').Replace('\','/')}
$marker="SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';"
$rollback=Join-Path $Cluster.Root 'delta-rollback.sql'
[IO.File]::WriteAllText($rollback,"\i '$base'`nDO `$`$ BEGIN IF (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')<>98 THEN RAISE EXCEPTION 'estrutura incompleta'; END IF; END `$`$;`nROLLBACK;",[Text.UTF8Encoding]::new($false))
$rejected=$false;try{Invoke-NeiaLocalPg $Cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',$rollback)|Out-Null}catch{$rejected=$true}
Check ($rejected -and (Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'") -eq '69') 'sem marcador de ensaio nenhuma estrutura e alterada'
Invoke-NeiaLocalPg $Cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',$marker,'-f',$rollback)|Out-Null
Check ((Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'") -eq '69') 'base aditiva cria 98 tabelas e rollback retorna a 69'
$failure=Join-Path $Cluster.Root 'delta-failure.sql'
[IO.File]::WriteAllText($failure,"\i '$base'`nDO `$`$ BEGIN RAISE EXCEPTION 'falha sintetica apos DDL'; END `$`$;`nCOMMIT;",[Text.UTF8Encoding]::new($false))
$rejected=$false;try{Invoke-NeiaLocalPg $Cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',$marker,'-f',$failure)|Out-Null}catch{$rejected=$true}
Check ($rejected -and (Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'") -eq '69') 'erro intermediario reverte toda a base aditiva'
$commit=Join-Path $Cluster.Root 'delta-commit.sql'
[IO.File]::WriteAllText($commit,"\i '$base'`nCOMMIT;",[Text.UTF8Encoding]::new($false))
Invoke-NeiaLocalPg $Cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',$marker,'-f',$commit)|Out-Null
Check ((Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'") -eq '98') '29 tabelas ausentes adicionadas sem recriar as antigas'
$old=Get-Content -LiteralPath (Join-Path $State.path 'partial-catalog-private.json') -Raw|ConvertFrom-Json
$newNames=@(Get-Content -LiteralPath (Join-Path $State.path 'catalog-delta-private.json') -Raw|ConvertFrom-Json).missingTables
foreach($table in $OriginalFingerprints){
 $output=Invoke-NeiaLocalPg $Cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-v','ON_ERROR_STOP=1','-c',('COPY '+$table.schema+'.'+$table.table+' ('+$table.columns+') TO STDOUT;'))
 $rows=@();if($output.Length){$s=$output.Replace("`r`n","`n");if($s.EndsWith("`n")){$s=$s.Substring(0,$s.Length-1)};$rows=$s.Split("`n")}
 $fp=Get-NeiaRowFingerprint -Rows $rows
 if($fp.count -ne $table.count -or $fp.sha256 -ne $table.sha256){throw 'Dados anteriores alterados pelo delta'}
}
Check $true '106 tabelas preservam linhas e SHA-256 das colunas anteriores apos o delta'
$names=($newNames|ForEach-Object {"'$_'"}) -join ','
Check ((Sql "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ($names) AND c.relrowsecurity") -eq '29') 'RLS habilitada em todas as novas tabelas'
Check ((Sql "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(role) WHERE n.nspname='public' AND c.relname IN ($names) AND has_table_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,DELETE')") -eq '0') 'tabelas novas fechadas para anon authenticated e service_role'
Check ((Sql "SELECT NOT has_function_privilege('authenticated','public.reservar_estoque_atomica(uuid,uuid,integer)','EXECUTE') AND NOT has_function_privilege('authenticated','public.liberar_reserva_atomica(uuid)','EXECUTE')") -eq 't') 'grants contidos pela M24 permanecem bloqueados'
Check ((Sql 'SELECT count(*) FROM pg_index WHERE NOT indisvalid') -eq '0' -and (Sql 'SELECT count(*) FROM pg_constraint WHERE NOT convalidated') -eq '0') 'indices e constraints validos apos a base'
$rejected=$false;try{Invoke-NeiaLocalPg $Cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial','-c',$marker,'-f',$commit)|Out-Null}catch{$rejected=$true}
Check ($rejected -and (Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'") -eq '98') 'repeticao recusa baseline alterada sem duplicar objetos'
@{status='ADDITIVE_BASE_PASSED';checks=10;originalTablesUnchanged=106;publicTables=98;newTables=29;addedColumns=35;remoteApproved=$false;operationalRPCsInstalled=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $State.path 'incremental-base-result.json') -Encoding utf8
