#requires -Version 7.0
[CmdletBinding()]
param(
  [string]$BackupDirectory,
  [string]$Scratch,
  [string]$PgBin='C:\Program Files\PostgreSQL\17\bin',
  [ValidateRange(1024,65535)][int]$Port=55491,
  [switch]$ExecutarRestauracao
)
$ErrorActionPreference='Stop'

function New-NeiaPrivateDirectory([string]$Parent,[string]$Prefix){
  $parentPath=(Resolve-Path -LiteralPath $Parent).Path
  foreach($repo in @('C:\Users\User\ERP-NEIA-SALGADOS','C:\Users\User\ERP-NEIA-BOY-WT')){
    if($parentPath -eq $repo -or $parentPath.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Use pasta de ensaio fora dos repositorios.'}
  }
  $root=Join-Path $parentPath ($Prefix+[Guid]::NewGuid().ToString('N'))
  if(Test-Path -LiteralPath $root){throw 'Diretorio de ensaio ja existe.'}
  New-Item -ItemType Directory -Path $root -ErrorAction Stop|Out-Null
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
  foreach($s in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
  Set-Acl -LiteralPath $root -AclObject $acl
  if(-not(Get-Acl -LiteralPath $root).AreAccessRulesProtected){throw 'Protecao local nao confirmada.'}
  return $root
}
function Invoke-NeiaLocalPg($Cluster,[string]$Name,[string[]]$Arguments){
  if($Cluster.Host -ne '127.0.0.1' -or $Cluster.Port -lt 1024){throw 'Somente loopback local.'}
  if($Name -notin @('psql','pg_dump','pg_dumpall','pg_restore')){throw 'Ferramenta local nao permitida.'}
  $psi=[Diagnostics.ProcessStartInfo]::new();$psi.FileName=Join-Path $Cluster.PgBin ($Name+'.exe');$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
  foreach($a in $Arguments){$psi.ArgumentList.Add($a)}
  foreach($n in @('PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGSSLCERT','PGSSLKEY')){$psi.Environment.Remove($n)|Out-Null}
  $psi.Environment['PGHOST']='127.0.0.1';$psi.Environment['PGHOSTADDR']='127.0.0.1'
  $psi.Environment['PGPORT']=[string]$Cluster.Port;$psi.Environment['PGUSER']=$Cluster.User;$psi.Environment['PGDATABASE']='postgres'
  $psi.Environment['PGPASSWORD']=$Cluster.LocalPassword;$psi.Environment['PGPASSFILE']=Join-Path $Cluster.Root 'no-password-file'
  $psi.Environment['PGSSLMODE']='disable';$psi.Environment['PGCONNECT_TIMEOUT']='5';$psi.Environment['PGCLIENTENCODING']='UTF8'
  $psi.Environment['PGOPTIONS']='-c timezone=UTC -c lock_timeout=5000';$psi.Environment['PGAPPNAME']='neia_recovery_local_only'
  $psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  $psi.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$psi.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
  $process=[Diagnostics.Process]::Start($psi)
  try{
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync();$process.WaitForExit()
    $text=$stdout.GetAwaiter().GetResult();$errorText=$stderr.GetAwaiter().GetResult()
    [IO.File]::AppendAllText((Join-Path $Cluster.Root 'private-native.log'),$errorText,[Text.UTF8Encoding]::new($false))
    if($process.ExitCode -ne 0){throw ($Name+' local falhou. Consulte somente o log privado; nenhuma tentativa remota.')}
    return $text
  }finally{$process.Dispose()}
}
function New-NeiaDisposableCluster([string]$Parent,[string]$Tools,[int]$LocalPort){
  if(Get-NetTCPConnection -LocalPort $LocalPort -ErrorAction SilentlyContinue){throw 'Porta ocupada; nao conectar ao banco existente.'}
  $root=New-NeiaPrivateDirectory $Parent 'neia-recovery-'
  $cluster=[pscustomobject]@{Host='127.0.0.1';Port=$LocalPort;Root=$root;Data=(Join-Path $root 'data');PgBin=$Tools;User=('restore_'+[Guid]::NewGuid().ToString('N').Substring(0,12));LocalPassword=([Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N'));Process=$null;Verified=$false}
  $pw=Join-Path $root 'init-password.tmp'
  try{
    [IO.File]::WriteAllText($pw,$cluster.LocalPassword,[Text.UTF8Encoding]::new($false))
    & (Join-Path $Tools 'initdb.exe') -D $cluster.Data -U $cluster.User --encoding=UTF8 --locale=C --auth=scram-sha-256 --no-sync ('--pwfile='+$pw) 1> (Join-Path $root 'init.log') 2> (Join-Path $root 'init.err')
    if($LASTEXITCODE -ne 0){throw 'initdb local falhou.'}
  }finally{if(Test-Path -LiteralPath $pw){Remove-Item -LiteralPath $pw}}
  $cluster.Process=Start-Process -FilePath (Join-Path $Tools 'postgres.exe') -ArgumentList @('-D',('"'+$cluster.Data+'"'),'-h','127.0.0.1','-p',"$LocalPort") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'server.out') -RedirectStandardError (Join-Path $root 'server.err')
  try{
    $ready=$false
    for($i=0;$i -lt 60;$i++){
      $cluster.Process.Refresh();if($cluster.Process.HasExited){throw 'Servidor local encerrou.'}
      & (Join-Path $Tools 'pg_isready.exe') -h 127.0.0.1 -p $LocalPort -q
      if($LASTEXITCODE -eq 0){$ready=$true;break};Start-Sleep -Milliseconds 200
    }
    if(-not $ready){throw 'Servidor local nao respondeu.'}
    $actual=(Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-A','-t','-v','ON_ERROR_STOP=1','-c','SHOW data_directory')).Trim()
    if($actual.Replace('/','\') -ne $cluster.Data){throw 'data_directory nao pertence ao cluster recem-criado.'}
    $preload=(Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-A','-t','-c','SHOW shared_preload_libraries')).Trim()
    if($preload){throw 'Preload inesperado; nao ativar agendadores ou servicos.'}
    $cluster.Verified=$true
    return $cluster
  }catch{
    if($cluster.Process -and -not $cluster.Process.HasExited){& (Join-Path $Tools 'pg_ctl.exe') -D $cluster.Data stop -m fast -w -t 15|Out-Null}
    throw
  }
}
function Stop-NeiaDisposableCluster($Cluster){
  if($Cluster -and $Cluster.Process){
    $Cluster.Process.Refresh()
    if(-not $Cluster.Process.HasExited){& (Join-Path $Cluster.PgBin 'pg_ctl.exe') -D $Cluster.Data stop -m fast -w -t 15|Out-Null;if($LASTEXITCODE -ne 0){throw 'Cluster local pode continuar ativo; nao apagar seus arquivos.'}}
    $Cluster.LocalPassword=$null
  }
}
function Assert-NeiaRecoveryExtensions([string[]]$Extensions,[string]$Tools){
  $allowed=@('plpgsql','pgcrypto','uuid-ossp','pg_stat_statements')
  foreach($extension in $Extensions){if($extension -notin $allowed -or -not(Test-Path -LiteralPath (Join-Path $Tools ('..\share\extension\'+$extension+'.control')))){throw ('Extensao sem suporte no ensaio nativo: '+$extension+'. Nao instalar ou omitir automaticamente.')}}
}
function Test-NeiaBackupPackage([string]$Directory,[string]$Tools){
  $root=(Resolve-Path -LiteralPath $Directory).Path
  if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Backup nao pode ser um link.'}
  $result=Get-Content -LiteralPath (Join-Path $root 'RESULT.json') -Raw|ConvertFrom-Json
  if($result.project -notin @('lflzlcqinarrcgncafol','synthetic-local') -or $result.stage -ne 'EXPORTS_READY'){throw 'Projeto ou exportacao nao aprovados; preservar pacote parcial.'}
  $manifest=@(Get-Content -LiteralPath (Join-Path $root 'SHA256-initial.json') -Raw|ConvertFrom-Json)
  foreach($name in @('database-full.dump','roles-no-passwords.sql')){
    $entry=@($manifest|Where-Object file -eq $name)
    if($entry.Count -ne 1){throw 'Manifesto incompleto ou repetido.'}
    $file=Get-Item -LiteralPath (Join-Path $root $name)
    if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $file.Length -le 0 -or $file.Length -ne $entry[0].size -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne $entry[0].sha256){throw 'Arquivo vazio, link ou hash/tamanho divergente.'}
  }
  $toc=& (Join-Path $Tools 'pg_restore.exe') --list (Join-Path $root 'database-full.dump') 2>$null
  if($LASTEXITCODE -ne 0){throw 'Arquivo de backup nao reconhecido.'}
  $extensions=@($toc|ForEach-Object{if($_ -match '^\d+; \d+ \d+ EXTENSION - (\S+)'){$Matches[1]}})
  Assert-NeiaRecoveryExtensions $extensions $Tools
  return [pscustomobject]@{Root=$root;Origin=$result.project;TableEntries=@($toc|Where-Object{$_ -match '^\d+; \d+ \d+ TABLE DATA '}).Count;Extensions=$extensions;CreatesPublicSchema=(@($toc|Where-Object{$_ -match '^\d+; \d+ \d+ SCHEMA - public '}).Count -gt 0)}
}
function Get-NeiaRowFingerprint([string[]]$Rows=@()){
  $hashes=@(@(foreach($row in $Rows){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($row)))})|Sort-Object -CaseSensitive)
  return [pscustomobject]@{count=$hashes.Count;sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($hashes -join "`n"))))}
}
function Read-NeiaCopyFingerprints([string]$SqlFile){
  $reader=[IO.StreamReader]::new($SqlFile,[Text.Encoding]::UTF8)
  $items=[Collections.Generic.List[object]]::new();$current=$null;$rows=[Collections.Generic.List[string]]::new()
  try{
    while($null -ne ($line=$reader.ReadLine())){
      if($current){
        if($line -eq '\.'){$fp=Get-NeiaRowFingerprint -Rows $rows.ToArray();$current.count=$fp.count;$current.sha256=$fp.sha256;$items.Add([pscustomobject]$current);$current=$null;$rows.Clear()}
        else{$rows.Add($line)}
      }elseif($line -match '^COPY ([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*) \((.+)\) FROM stdin;$'){
        $schema=$Matches[1];$table=$Matches[2];$columns=$Matches[3]
        foreach($column in ($columns -split ',\s*')){if($column -notmatch '^(?:[a-z_][a-z0-9_]*|"[a-z_][a-z0-9_]*")$'){throw 'Identificador nao suportado para verificacao de COPY.'}}
        $current=@{schema=$schema;table=$table;columns=$columns;count=0;sha256=''}
      }elseif($line.StartsWith('COPY ')){throw 'COPY nao suportado; nao declarar integridade aprovada.'}
    }
    if($current){throw 'Secao COPY incompleta.'}
  }finally{$reader.Dispose()}
  return $items.ToArray()
}
function Restore-NeiaBackup($Package,[string]$Parent,[string]$Tools,[int]$LocalPort){
  $cluster=$null
  try{
    $cluster=New-NeiaDisposableCluster $Parent $Tools $LocalPort
    if(-not $cluster.Verified){throw 'Cluster nao confirmado.'}
    $dataSql=Join-Path $cluster.Root 'private-source-data.sql'
    Invoke-NeiaLocalPg $cluster 'pg_restore' @('--data-only','-f',$dataSql,(Join-Path $Package.Root 'database-full.dump'))|Out-Null
    $fingerprints=@(Read-NeiaCopyFingerprints $dataSql)
    if($fingerprints.Count -ne $Package.TableEntries){throw 'Nem todas as tabelas de dados podem ser verificadas por COPY; nao declarar recuperacao.'}
    Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-v','ON_ERROR_STOP=1','-f',(Join-Path $Package.Root 'roles-no-passwords.sql'))|Out-Null
    Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE neia_recovery TEMPLATE template0;')|Out-Null
    # Alguns dumps usam o public de template0; outros o recriam explicitamente.
    # Remover somente o schema vazio recem-criado quando o arquivo o recria.
    if($Package.CreatesPublicSchema){Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-d','neia_recovery','-v','ON_ERROR_STOP=1','-c','DROP SCHEMA public;')|Out-Null}
    Invoke-NeiaLocalPg $cluster 'pg_restore' @('-w','--exit-on-error','--single-transaction','--no-subscriptions','-d','neia_recovery',(Join-Path $Package.Root 'database-full.dump'))|Out-Null
    foreach($table in $fingerprints){
      $output=Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-d','neia_recovery','-A','-t','-v','ON_ERROR_STOP=1','-c',('COPY '+$table.schema+'.'+$table.table+' ('+$table.columns+') TO STDOUT;'))
      $rows=@()
      if($output.Length){$normalized=$output.Replace("`r`n","`n");if($normalized.EndsWith("`n")){$normalized=$normalized.Substring(0,$normalized.Length-1)};$rows=$normalized.Split("`n")}
      $actual=Get-NeiaRowFingerprint -Rows $rows
      if($actual.count -ne $table.count -or $actual.sha256 -ne $table.sha256){throw 'Contagem/hash de tabela diverge do conteudo do dump; consulte somente os arquivos privados.'}
    }
    $fingerprints|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $cluster.Root 'table-verification-private.json') -Encoding utf8
    $counts=Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-d','neia_recovery','-A','-t','-v','ON_ERROR_STOP=1','-c',"SELECT json_build_object('public_tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'auth_tables',(SELECT count(*) FROM pg_tables WHERE schemaname='auth'),'storage_tables',(SELECT count(*) FROM pg_tables WHERE schemaname='storage'),'invalid_indexes',(SELECT count(*) FROM pg_index WHERE NOT indisvalid),'unvalidated_constraints',(SELECT count(*) FROM pg_constraint WHERE NOT convalidated),'function_count',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage')),'trigger_count',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND NOT t.tgisinternal),'policy_count',(SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','auth','storage')),'grants',(SELECT json_agg(x) FROM (SELECT grantee,table_schema,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema IN ('public','auth','storage')) x),'rls_tables',(SELECT json_agg(x) FROM (SELECT n.nspname AS schema,c.relname AS name,c.relrowsecurity AS enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind='r') x));")
    [IO.File]::WriteAllText((Join-Path $cluster.Root 'catalog-counts.json'),$counts,[Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{Status='LOCAL_RESTORE_COPY_HASHES_MATCHED';Origin=$Package.Origin;Path=$cluster.Root;TablesVerified=$fingerprints.Count;Subscriptions='NOT_EXECUTED';SupabaseServices='NOT_TESTED'}
  }finally{Stop-NeiaDisposableCluster $cluster}
}

if($MyInvocation.InvocationName -eq '.'){return}
$version=& (Join-Path $PgBin 'pg_restore.exe') --version
if($LASTEXITCODE -ne 0 -or $version -notmatch 'PostgreSQL\) 17\.'){throw 'PostgreSQL 17 obrigatorio.'}
if(-not $ExecutarRestauracao){Write-Output 'PREPARACAO LOCAL: nenhuma conexao, senha, arquivo de dados ou restauracao. Use -ExecutarRestauracao com pacote e Scratch explicitos.';return}
if(-not $BackupDirectory -or -not $Scratch){throw 'BackupDirectory e Scratch obrigatorios.'}
$package=Test-NeiaBackupPackage $BackupDirectory $PgBin
$result=Restore-NeiaBackup $package $Scratch $PgBin $Port
$result|ConvertTo-Json
