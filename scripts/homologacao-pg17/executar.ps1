param(
  [Parameter(Mandatory = $true)][string]$Scratch,
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [ValidateRange(1024, 65535)][int]$Port = 55435,
  [switch]$FixtureStaging
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$parent = (Resolve-Path -LiteralPath $Scratch).Path
$work = Join-Path $parent ('neia-pg17-' + [Guid]::NewGuid().ToString('N'))
if ($parent -eq $repo -or $parent.StartsWith($repo + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Escolha um diretório de testes fora do ERP.'
}
if (Test-Path -LiteralPath $work) { throw 'Diretório de teste já existe.' }
New-Item -ItemType Directory -Path $work | Out-Null
$data = Join-Path $work 'data'
$log = Join-Path $work 'sql.log'
$postgres = Join-Path $PgBin 'postgres.exe'
$pgctl = Join-Path $PgBin 'pg_ctl.exe'
$psql = Join-Path $PgBin 'psql.exe'
$senhaAnterior = $env:PGPASSWORD
$env:PGPASSWORD = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$pwfile = Join-Path $work 'init-password'
[IO.File]::WriteAllText($pwfile, $env:PGPASSWORD)
$server = $null

function Run-Sql([string]$File, [bool]$Transactional = $true, [string[]]$VariaveisPsql = @()) {
  $opts = @()
  if ($Transactional) { $opts += '--single-transaction' }
  # psql emite WARNING via stderr; under Windows PowerShell 5.1 com EAP=Stop isso
  # seria um erro terminante. Apenas o código de saída decide a falha.
  $preferenciaAnterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $psql -X -w -h 127.0.0.1 -p $Port -U neia_homologador -d postgres -v ON_ERROR_STOP=1 @opts @VariaveisPsql -f $File 2>&1 |
      Out-File -LiteralPath $log -Append -Encoding UTF8
  } finally {
    $ErrorActionPreference = $preferenciaAnterior
  }
  if ($LASTEXITCODE -ne 0) {
    Get-Content -LiteralPath $log -Tail 18
    throw "Falhou: $File"
  }
  Write-Host "OK $(Split-Path -Leaf $File)"
}
try {
  $version = & $postgres --version
  if ($LASTEXITCODE -ne 0 -or $version -notmatch 'PostgreSQL\) 17\.') { throw 'PostgreSQL 17 é obrigatório.' }
  & (Join-Path $PgBin 'initdb.exe') -D $data -U neia_homologador --encoding=UTF8 --locale=C --auth=scram-sha-256 --no-sync "--pwfile=$pwfile" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'initdb falhou.' }
  Remove-Item -LiteralPath $pwfile
  $server = Start-Process -FilePath $postgres -ArgumentList @('-D', ('"' + $data + '"'), '-h', '127.0.0.1', '-p', "$Port") -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $work 'server.out') -RedirectStandardError (Join-Path $work 'server.err')
  for ($i = 0; $i -lt 50; $i++) {
    $server.Refresh()
    if ($server.HasExited) { throw "Servidor de teste encerrou. Consulte $work\server.err." }
    & (Join-Path $PgBin 'pg_isready.exe') -h 127.0.0.1 -p $Port -q
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 200
  }
  # Confirma que a porta pertence ao cluster recém-criado antes da primeira escrita SQL.
  $target = & $psql -X -w -h 127.0.0.1 -p $Port -U neia_homologador -d postgres -At -c 'SHOW data_directory'
  if ($LASTEXITCODE -ne 0 -or $target.Replace('/', '\') -ne $data) {
    throw 'A porta não pertence ao cluster descartável.'
  }
  Run-Sql (Join-Path $PSScriptRoot 'plataforma-sintetica.sql')
  $migrations = @(Get-Content (Join-Path $PSScriptRoot 'instalacao-limpa.txt') |
    Where-Object { $_ -notmatch '^\s*(#|$)' })
  if ($migrations.Count -eq 0) { throw 'O manifesto de instalação está vazio.' }
  foreach ($name in $migrations) {
    if ($name -notmatch '^[0-9]{4}_[a-z0-9_]+\.sql$') { throw "Nome inválido no manifesto: $name" }
    Run-Sql (Join-Path $repo "drizzle\migrations\$name") ($name -notmatch '^(0003|0079)_')
  }
  if ($FixtureStaging) {
    Run-Sql (Join-Path $PSScriptRoot 'staging-usuarios-sinteticos.sql')
    Run-Sql (Join-Path $PSScriptRoot '..\homologacao-staging-fixture.sql') $true @('-v', 'staging_ref=abcdefghijklmnopqrst')
    Write-Host "Fixture de staging validada localmente. Evidências: $log"
    return
  }
  Run-Sql (Join-Path $PSScriptRoot 'regressoes.sql')
  Run-Sql (Join-Path $PSScriptRoot 'rotas-app.sql')
  Run-Sql (Join-Path $PSScriptRoot 'inicio-rota-integridade.sql')
  Run-Sql (Join-Path $PSScriptRoot 'inicio-rota-concorrencia.sql')
  Run-Sql (Join-Path $PSScriptRoot 'impressao.sql')
  Run-Sql (Join-Path $PSScriptRoot 'fechamento-turno.sql')
  Run-Sql (Join-Path $PSScriptRoot 'seguranca-financeira-motoboy.sql')
  Run-Sql (Join-Path $PSScriptRoot 'pagamento-turno.sql')
  Run-Sql (Join-Path $PSScriptRoot 'financeiro-motoboy-concorrencia.sql')
  Run-Sql (Join-Path $PSScriptRoot 'liberacao-central.sql')
  Run-Sql (Join-Path $PSScriptRoot 'liberacao-central-concorrencia.sql')
  Run-Sql (Join-Path $PSScriptRoot 'fluxo-completo-rota.sql')
  Run-Sql (Join-Path $PSScriptRoot 'motoboy-corte-gps.sql')
  Write-Host "PostgreSQL validado. Evidências locais: $log"
} finally {
  if (Test-Path -LiteralPath $pwfile) { Remove-Item -LiteralPath $pwfile }
  if ($server) {
    $server.Refresh()
    if (-not $server.HasExited) {
      & $pgctl -D $data stop -m fast -w -t 15 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "O cluster descartável pode continuar ativo em $data." }
    }
  }
  $env:PGPASSWORD = $senhaAnterior
}
