param(
  [Parameter(Mandatory = $true)][string]$Scratch,
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [ValidateRange(1024, 65535)][int]$Port = 55440
)

# Ensaio LOCAL e descartável das reversões não destrutivas de 0129 e 0133.
# Não executa os testes funcionais já aprovados e não acessa banco remoto.

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$parent = (Resolve-Path -LiteralPath $Scratch).Path
if ($parent -eq $repo -or $parent.StartsWith($repo + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Escolha um diretório de testes fora do ERP.'
}
$work = Join-Path $parent ('neia-reversao-pg17-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$data = Join-Path $work 'data'
$log = Join-Path $work 'sql.log'
$psql = Join-Path $PgBin 'psql.exe'
$pgctl = Join-Path $PgBin 'pg_ctl.exe'
$senhaAnterior = $env:PGPASSWORD
$env:PGPASSWORD = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$pwfile = Join-Path $work 'init-password'
[IO.File]::WriteAllText($pwfile, $env:PGPASSWORD)
$server = $null
$psqlBase = @('-X','-w','-h','127.0.0.1','-p',"$Port",'-U','neia_homologador','-d','postgres','-v','ON_ERROR_STOP=1')

function Write-Log([string]$Texto) {
  Add-Content -LiteralPath $log -Value $Texto -Encoding UTF8
}

function Run-Sql([string]$File, [bool]$Transactional = $true) {
  $opts = @()
  if ($Transactional) { $opts += '--single-transaction' }
  $preferenciaAnterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $psql @psqlBase @opts -f $File 2>&1 | Out-File -LiteralPath $log -Append -Encoding UTF8
  } finally {
    $ErrorActionPreference = $preferenciaAnterior
  }
  if ($LASTEXITCODE -ne 0) {
    Get-Content -LiteralPath $log -Tail 30
    throw "Falhou: $File"
  }
  Write-Host "OK $(Split-Path -Leaf $File)"
}

function Run-AdminSql([string]$File) {
  $wrapper = Join-Path $work ('admin-' + [Guid]::NewGuid().ToString('N') + '.sql')
  $pre = @(
    'SET ROLE authenticated;',
    "SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);",
    ''
  )
  [IO.File]::WriteAllText(
    $wrapper,
    ($pre -join [Environment]::NewLine) + [Environment]::NewLine + [IO.File]::ReadAllText($File)
  )
  Run-Sql $wrapper $false
}

try {
  $versao = & (Join-Path $PgBin 'postgres.exe') --version
  if ($LASTEXITCODE -ne 0 -or $versao -notmatch 'PostgreSQL\) 17\.') {
    throw 'PostgreSQL 17.x é obrigatório.'
  }
  Write-Log "Postgres: $versao"

  & (Join-Path $PgBin 'initdb.exe') -D $data -U neia_homologador --encoding=UTF8 --locale=C `
    --auth=scram-sha-256 --no-sync "--pwfile=$pwfile" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'initdb falhou.' }
  Remove-Item -LiteralPath $pwfile

  $server = Start-Process -FilePath (Join-Path $PgBin 'postgres.exe') `
    -ArgumentList @('-D', ('"' + $data + '"'), '-h', '127.0.0.1', '-p', "$Port") `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $work 'server.out') `
    -RedirectStandardError (Join-Path $work 'server.err')
  for ($i = 0; $i -lt 50; $i++) {
    $server.Refresh()
    if ($server.HasExited) { throw "Servidor encerrou. Consulte $work\server.err." }
    & (Join-Path $PgBin 'pg_isready.exe') -h 127.0.0.1 -p $Port -q
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 200
  }
  $alvo = & $psql @psqlBase -At -c 'SHOW data_directory'
  if ($LASTEXITCODE -ne 0 -or $alvo.Replace('/', '\') -ne $data) {
    throw 'A porta não pertence ao cluster descartável.'
  }

  Run-Sql (Join-Path $repo 'scripts\homologacao-pg17\plataforma-sintetica.sql') $false
  Run-Sql (Join-Path $PSScriptRoot 'plataforma-sintetica-est.sql') $false

  $manifestos = @(Get-Content (Join-Path $repo 'scripts\homologacao-pg17\instalacao-limpa.txt') |
    Where-Object { $_ -notmatch '^\s*(#|$)' })
  $adicionais = @(
    '0124_acl_menor_privilegio_m24.sql',
    '0125_a01_tarefas_administrativas.sql',
    '0126_a02_recomendacoes_estado.sql',
    '0127_a01_tarefas_gestao.sql'
  )
  foreach ($nome in @($manifestos + $adicionais)) {
    if ($nome -notmatch '^[0-9]{4}_[a-z0-9_]+\.sql$') { throw "Nome inválido no manifesto: $nome" }
    Run-Sql (Join-Path $repo "drizzle\migrations\$nome") ($nome -notmatch '^(0003|0079)_')
  }
  Run-Sql (Join-Path $repo 'scripts\cadastrar-sabores-estoque.sql') $false
  Run-Sql (Join-Path $repo 'drizzle\migrations\0128_organizar_sabores_estoque.sql') $false
  Run-Sql (Join-Path $repo 'drizzle\migrations\0129_vinculos_operacionais_salgados.sql') $false
  Run-Sql (Join-Path $repo 'drizzle\migrations\0133_acl_reserva_estoque_dia.sql') $false
  Run-Sql (Join-Path $PSScriptRoot 'fixture.sql') $false

  Run-AdminSql (Join-Path $PSScriptRoot 'reversao-setup.sql')
  Run-Sql (Join-Path $repo 'scripts\reverter-0133-acl-reserva-estoque-dia.sql') $false
  Run-Sql (Join-Path $repo 'scripts\reverter-0129-estoque-operacional-nao-destrutivo.sql') $false
  Run-Sql (Join-Path $PSScriptRoot 'verificar-reversao.sql') $false

  # Idempotência: repetir as reversões não pode remover marcadores nem mudar o modo.
  Run-Sql (Join-Path $repo 'scripts\reverter-0133-acl-reserva-estoque-dia.sql') $false
  Run-Sql (Join-Path $repo 'scripts\reverter-0129-estoque-operacional-nao-destrutivo.sql') $false
  Run-Sql (Join-Path $PSScriptRoot 'verificar-reversao.sql') $false

  Write-Host "REVERSAO PG17 OK. Evidências: $log"
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
