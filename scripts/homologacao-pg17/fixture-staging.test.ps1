#requires -Version 7.0
param([Parameter(Mandatory=$true)][string]$ClusterRoot,[Parameter(Mandatory=$true)][int]$Port,[string]$PgBin='C:\Program Files\PostgreSQL\17\bin')
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $ClusterRoot).Path
if((Split-Path -Leaf $root) -notmatch '^neia-pg17-[0-9a-f]{32}$'){throw 'Teste restrito ao cluster sintetico recem-criado pelo executor.'}
. (Join-Path $PSScriptRoot 'restaurar-backup-local.ps1') -Scratch $root -Port $Port -PgBin $PgBin
# Esta senha e apenas a aleatoria do cluster local criado por executar.ps1.
$cluster=[pscustomobject]@{Host='127.0.0.1';Port=$Port;Root=$root;Data=(Join-Path $root 'data');PgBin=$PgBin;User='neia_homologador';LocalPassword=$env:PGPASSWORD}
function Sql([string]$Query){return (Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',$Query)).Trim()}
function Check([bool]$Condition,[string]$Name){if(-not $Condition){throw ('Fixture: '+$Name)};Write-Output ('OK '+$Name)}
$actual=Sql 'SHOW data_directory'
if($actual.Replace('/','\') -ne $cluster.Data){throw 'Cluster local inesperado; nenhuma escrita.'}
if((Sql "SELECT inet_server_addr()='127.0.0.1'::inet AND current_user='neia_homologador' AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='encrypted_password')") -ne 't'){throw 'Auth real ou destino inesperado; nenhuma escrita.'}
$ref='abcdefghijklmnopqrst';$protocol=[Guid]::NewGuid().ToString()
$fixture=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\homologacao-staging-fixture.sql')).Path
$generator=Join-Path $PSScriptRoot 'staging-usuarios-sinteticos.sql'
# O Auth real ja possui estas colunas. Preparar o stub antes de medir os legados.
Sql "ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz; ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb NOT NULL DEFAULT '{}';"|Out-Null
$legacyA='fac00000-0000-4000-8000-000000000001';$legacyB='fac00000-0000-4000-8000-000000000002'
Sql "INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('$legacyA','legado-a@example.invalid',jsonb_build_object('nome','Legado sintetico A')),('$legacyB','legado-b@example.invalid',jsonb_build_object('nome','Legado sintetico B')); UPDATE public.user_roles SET role='admin' WHERE user_id='$legacyA';"|Out-Null
$legacyQuery="SELECT md5(jsonb_build_object('auth',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM auth.users u WHERE id IN ('$legacyA','$legacyB')),'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.profiles p WHERE id IN ('$legacyA','$legacyB')),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.user_roles r WHERE user_id IN ('$legacyA','$legacyB')))::text)"
$before=Sql $legacyQuery
$mapText=Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v',('fixture_protocolo='+$protocol),'-v',('staging_ref='+$ref),'-f',$generator)
$actors=$mapText.Trim()|ConvertFrom-Json -AsHashtable
Check ($actors.Count -eq 8 -and (Sql 'SELECT count(*) FROM auth.users') -eq '10') 'oito contas identificadas coexistem com dois usuarios preservados'
function Run-Fixture($Map,[string]$Authorization=$ref){
  Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v',('staging_ref='+$ref),'-v',('escritas_autorizadas_ref='+$Authorization),'-v',('fixture_protocolo='+$protocol),'-v',('fixture_atores='+($Map|ConvertTo-Json -Compress)),'-f',$fixture)|Out-Null
}
function Expect-Rejected($Map,[string]$Name,[string]$Authorization=$ref){
  $rejected=$false;try{Run-Fixture $Map $Authorization}catch{$rejected=$true}
  Check $rejected $Name
  Check ((Sql "SELECT to_regnamespace('neia_homologacao') IS NULL AND NOT EXISTS(SELECT 1 FROM public.pedidos) AND NOT EXISTS(SELECT 1 FROM public.motoboys) AND NOT EXISTS(SELECT 1 FROM public.rotas_entrega)") -eq 't' -and (Sql $legacyQuery) -eq $before) 'rollback nao deixa fixture, pedidos, rotas ou alteracoes nos legados'
}
Expect-Rejected $actors 'leitura nao autoriza instalar fixture de escrita' 'outrareferenciaaaaaaa'
$duplicate=$actors.Clone();$duplicate.cliente=$duplicate.motoboyA
Expect-Rejected $duplicate 'UUIDs repetidos sao recusados'
$old=$actors.Clone();$old.cliente=$legacyA
Expect-Rejected $old 'usuario legado nao pode ser selecionado apenas pelo UUID'
$client=$actors.cliente
Sql "UPDATE auth.users SET raw_app_meta_data='{}' WHERE id='$client'"|Out-Null
Expect-Rejected $actors 'conta sem atestado administrativo e recusada'
Sql "UPDATE auth.users SET raw_app_meta_data=jsonb_build_object('neia_homologacao',jsonb_build_object('protocolo','$protocol','conta','cliente','staging_ref','$ref')) WHERE id='$client'; UPDATE public.user_roles SET role='admin' WHERE user_id='$client';"|Out-Null
Expect-Rejected $actors 'papel inesperado nao e descartado silenciosamente'
Sql "UPDATE public.user_roles SET role='cliente' WHERE user_id='$client'; CREATE SCHEMA teste_fixture_staging; CREATE TABLE teste_fixture_staging.falha(ativa boolean); INSERT INTO teste_fixture_staging.falha VALUES(true);"|Out-Null
Sql @'
CREATE FUNCTION teste_fixture_staging.falhar_segunda_rota() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM teste_fixture_staging.falha WHERE ativa) AND EXISTS(
  SELECT 1 FROM public.rotas_entrega r JOIN public.motoboys m ON m.id=r.motoboy_id WHERE r.id=NEW.rota_id AND m.nome=U&'Entregador fict\00edcio B') THEN
  RAISE EXCEPTION 'falha sintetica na segunda rota' USING ERRCODE='P0498';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER falhar_segunda_rota BEFORE INSERT ON public.rota_pedidos FOR EACH ROW EXECUTE FUNCTION teste_fixture_staging.falhar_segunda_rota();
'@|Out-Null
Expect-Rejected $actors 'falha na segunda rota desfaz tambem a primeira e as mudancas de papeis'
Check ((Sql "SELECT count(*) FROM public.user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE raw_app_meta_data->'neia_homologacao'->>'protocolo'='$protocol') AND role='cliente'") -eq '8') 'papeis de bootstrap tambem voltam apos falha intermediaria'
Sql 'UPDATE teste_fixture_staging.falha SET ativa=false'|Out-Null
Run-Fixture $actors
Check ((Sql "SELECT count(*) FROM neia_homologacao.atores") -eq '8' -and (Sql 'SELECT count(*) FROM auth.users') -eq '10' -and (Sql $legacyQuery) -eq $before) 'fixture instalada sem alterar Auth, profiles ou papeis dos usuarios antigos'
Check ((Sql 'SELECT count(*) FROM public.rotas_entrega') -eq '2' -and (Sql "SELECT count(*) FROM public.rotas_entrega WHERE liberada_central_em IS NOT NULL") -eq '0') '0123 preservada: fixture atribui rotas sem aceite ou liberacao automatica'
$rejected=$false;try{Run-Fixture $actors}catch{$rejected=$true}
Check ($rejected -and (Sql 'SELECT count(*) FROM public.rotas_entrega') -eq '2' -and (Sql $legacyQuery) -eq $before) 'repeticao recusa sobrescrita e nao duplica rotas ou altera legados'
Write-Output 'Fixture por UUID/protocolo: testes apenas PostgreSQL sintetico; Auth/PostgREST/RLS reais NAO TESTADOS.'
