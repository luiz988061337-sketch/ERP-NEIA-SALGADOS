#requires -Version 7.0
param([Parameter(Mandatory=$true)][string]$Scratch,[string]$PgBin='C:\Program Files\PostgreSQL\17\bin')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'restaurar-backup-local.ps1') -Scratch $Scratch -PgBin $PgBin
function Check([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};Write-Output ('OK '+$Message)}
function Free-Port{
  $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
  $listener.Start();try{return $listener.LocalEndpoint.Port}finally{$listener.Stop()}
}
$a=Get-NeiaRowFingerprint -Rows @('b','a','a')
$b=Get-NeiaRowFingerprint -Rows @('a','b','a')
$c=Get-NeiaRowFingerprint -Rows @('a','b')
Check ($a.count -eq 3 -and $a.sha256 -eq $b.sha256) 'hash independente de ordem e preservando duplicatas'
Check ($a.sha256 -ne $c.sha256) 'perda de linha duplicada e detectada'
$empty=Get-NeiaRowFingerprint -Rows @();$blank=Get-NeiaRowFingerprint -Rows @('')
Check ($empty.count -eq 0 -and $blank.count -eq 1 -and $empty.sha256 -ne $blank.sha256) 'tabela vazia difere de linha com texto vazio'
$blocked=$false;try{Invoke-NeiaLocalPg ([pscustomobject]@{Host='db.lflzlcqinarrcgncafol.supabase.co';Port=5432}) 'psql' @('-c','SELECT 1')|Out-Null}catch{$blocked=$true}
Check $blocked 'destino remoto recusado antes de criar processo de banco'
$blocked=$false;try{Assert-NeiaRecoveryExtensions @('pg_cron','supabase_vault') $PgBin}catch{$blocked=$true}
Check $blocked 'extensoes de plataforma nao sao instaladas ou omitidas para forcar sucesso'
$source=$null
try{
  $source=New-NeiaDisposableCluster $Scratch $PgBin (Free-Port)
  $fixture=@'
CREATE ROLE neia_fixture_reader NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE NOT NULL);
INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001','somente-sintetico@example.invalid');
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY);
CREATE TABLE storage.objects(id integer PRIMARY KEY,bucket_id text REFERENCES storage.buckets(id),owner_id uuid REFERENCES auth.users(id));
INSERT INTO storage.buckets VALUES('sintetico');
INSERT INTO storage.objects VALUES(1,'sintetico','00000000-0000-4000-8000-000000000001');
CREATE TABLE public.produtos(id integer PRIMARY KEY,nome text,ativo boolean NOT NULL,valor numeric(10,2) CHECK(valor>=0));
INSERT INTO public.produtos VALUES(1,'Salgado sintetico',true,1.25),(2,'Outro sintetico',false,2.50);
CREATE TABLE public.vazia(valor text);
CREATE TABLE public.textos(valor text);
INSERT INTO public.textos VALUES(''),('a'),('a'),('b');
CREATE FUNCTION public.somar_sintetico(p integer) RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT p+1';
CREATE FUNCTION public.guard_sintetico() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';
CREATE TRIGGER guard_sintetico BEFORE INSERT ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.guard_sintetico();
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY sintetico_leitura ON public.produtos FOR SELECT TO neia_fixture_reader USING(ativo);
GRANT USAGE ON SCHEMA public TO neia_fixture_reader;
GRANT SELECT ON public.produtos TO neia_fixture_reader;
'@
  Invoke-NeiaLocalPg $source 'psql' @('-X','-w','-v','ON_ERROR_STOP=1','-c',$fixture)|Out-Null
  $packageRoot=New-NeiaPrivateDirectory $Scratch 'neia-synthetic-backup-'
  Invoke-NeiaLocalPg $source 'pg_dump' @('-w','-Fc','-f',(Join-Path $packageRoot 'database-full.dump'))|Out-Null
  Invoke-NeiaLocalPg $source 'pg_dumpall' @('-w','--roles-only','--no-role-passwords','-f',(Join-Path $packageRoot 'roles-no-passwords.sql'))|Out-Null
  @{project='synthetic-local';stage='EXPORTS_READY'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $packageRoot 'RESULT.json') -Encoding utf8
  $files=@(foreach($name in @('database-full.dump','roles-no-passwords.sql')){$file=Get-Item -LiteralPath (Join-Path $packageRoot $name);@{file=$name;size=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}})
  $files|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $packageRoot 'SHA256-initial.json') -Encoding utf8
  $package=Test-NeiaBackupPackage $packageRoot $PgBin
  Check ($package.Origin -eq 'synthetic-local' -and $package.TableEntries -eq 6) 'arquivo e manifesto sinteticos reconhecidos'
  $restored=Restore-NeiaBackup $package $Scratch $PgBin (Free-Port)
  Check ($restored.Status -eq 'LOCAL_RESTORE_COPY_HASHES_MATCHED' -and $restored.TablesVerified -eq 6) 'restauracao real de seis tabelas sinteticas com contagens e SHA-256'
  $catalog=Get-Content -LiteralPath (Join-Path $restored.Path 'catalog-counts.json') -Raw|ConvertFrom-Json
  Check ($catalog.invalid_indexes -eq 0 -and $catalog.unvalidated_constraints -eq 0) 'indices e constraints restaurados validos'
  Check ($catalog.function_count -eq 2 -and $catalog.trigger_count -eq 1 -and $catalog.policy_count -eq 1) 'funcoes, trigger e policy sinteticos restaurados'
  Check (@($catalog.grants|Where-Object{$_.grantee -eq 'neia_fixture_reader' -and $_.table_name -eq 'produtos' -and $_.privilege_type -eq 'SELECT'}).Count -eq 1 -and @($catalog.rls_tables|Where-Object{$_.schema -eq 'public' -and $_.name -eq 'produtos' -and $_.enabled}).Count -eq 1) 'grant e habilitacao RLS sinteticos preservados sem afirmar Auth real'
  $tampered=Join-Path $packageRoot 'roles-no-passwords.sql'
  [IO.File]::AppendAllText($tampered,"`n-- alteracao sintetica para testar deteccao de integridade`n")
  $blocked=$false;try{Test-NeiaBackupPackage $packageRoot $PgBin|Out-Null}catch{$blocked=$true}
  Check $blocked 'arquivo adulterado e recusado antes de criar cluster'
  Write-Output ('SYNTHETIC_ONLY source='+$source.Root+' recovery='+$restored.Path)
  Write-Output 'Backup real, Auth/PostgREST/Storage hospedados: NAO TESTADOS.'
}finally{Stop-NeiaDisposableCluster $source}
