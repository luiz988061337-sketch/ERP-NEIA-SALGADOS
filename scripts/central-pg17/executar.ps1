param(
  [Parameter(Mandatory = $true)][string]$Scratch,
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [ValidateRange(1024, 65535)][int]$Port = 55439
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$parent = (Resolve-Path -LiteralPath $Scratch).Path
if ($parent -eq $repo -or $parent.StartsWith($repo + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Escolha um diretório de testes fora do ERP.'
}
$work = Join-Path $parent ('neia-central-atendente-pg17-' + [Guid]::NewGuid().ToString('N'))
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
$psqlBase = @('-X', '-w', '-h', '127.0.0.1', '-p', "$Port", '-U', 'neia_homologador', '-v', 'ON_ERROR_STOP=1')

function Write-Log([string]$Texto) {
  Add-Content -LiteralPath $log -Value $Texto -Encoding UTF8
}

function Run-Sql([string]$File, [string]$Db = 'postgres', [bool]$Transactional = $true) {
  $opts = @()
  if ($Transactional) { $opts += '--single-transaction' }
  $preferenciaAnterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $psql @psqlBase -d $Db @opts -f $File 2>&1 | Out-File -LiteralPath $log -Append -Encoding UTF8
  } finally {
    $ErrorActionPreference = $preferenciaAnterior
  }
  if ($LASTEXITCODE -ne 0) {
    Get-Content -LiteralPath $log -Tail 30
    throw "Falhou: $File (banco $Db)"
  }
  Write-Host "OK $(Split-Path -Leaf $File) [$Db]"
}

function Start-Psql([string]$File, [string]$Out, [string]$Err, [string[]]$Vars = @()) {
  $args = $psqlBase + @('-d', 'central_retirada_teste', '-A', '-t') + $Vars + @('-f', ('"' + $File + '"'))
  return Start-Process -FilePath $psql -ArgumentList $args -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $Out -RedirectStandardError $Err
}

function Assert-Output([string]$Out, [string]$Pattern, [string]$Mensagem) {
  $conteudo = Get-Content -LiteralPath $Out -Raw
  if ($conteudo -notmatch $Pattern) {
    Get-Content -LiteralPath $Out
    throw $Mensagem
  }
}

try {
  $versao = & $postgres --version
  if ($LASTEXITCODE -ne 0 -or $versao -notmatch 'PostgreSQL\) 17\.') {
    throw 'PostgreSQL 17.x é obrigatório.'
  }
  Write-Log "Postgres: $versao"

  & (Join-Path $PgBin 'initdb.exe') -D $data -U neia_homologador --encoding=UTF8 --locale=C `
    --auth=scram-sha-256 --no-sync "--pwfile=$pwfile" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'initdb falhou.' }
  Remove-Item -LiteralPath $pwfile

  $server = Start-Process -FilePath $postgres `
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
  $alvo = & $psql @psqlBase -d postgres -At -c 'SHOW data_directory'
  if ($LASTEXITCODE -ne 0 -or $alvo.Replace('/', '\') -ne $data) {
    throw 'A porta não pertence ao cluster descartável.'
  }

  # Fase A — compatibilidade: cadeia limpa até 0123 (inclui 0084/0094/0106),
  # seguida de 0136 e das três migrations novas, no mesmo banco.
  Run-Sql (Join-Path $repo 'scripts\homologacao-pg17\plataforma-sintetica.sql') 'postgres' $false
  $manifest = @(Get-Content (Join-Path $repo 'scripts\homologacao-pg17\instalacao-limpa.txt') |
    Where-Object { $_ -notmatch '^\s*(#|$)' })
  if ($manifest.Count -eq 0) { throw 'Manifesto de instalação vazio.' }
  foreach ($nome in $manifest) {
    if ($nome -notmatch '^[0-9]{4}_[a-z0-9_]+\.sql$') { throw "Nome inválido no manifesto: $nome" }
    Run-Sql (Join-Path $repo "drizzle\migrations\$nome") 'postgres' ($nome -notmatch '^(0003|0079)_')
  }
  Run-Sql (Join-Path $PSScriptRoot 'compat-snapshot.sql') 'postgres' $false
  foreach ($nome in @(
    '0136_retirada_quitacao_balcao.sql',
    '0139_recebimento_balcao_atendente.sql',
    '0140_edicao_observacoes_auditada.sql',
    '0141_guard_recebimento_com_capacidade.sql'
  )) {
    Run-Sql (Join-Path $repo "drizzle\migrations\$nome") 'postgres'
  }
  Run-Sql (Join-Path $PSScriptRoot 'compat.verificar.sql') 'postgres' $false
  # 0142 é aplicada depois da verificação da cadeia anterior: ela substitui
  # assinaturas e acrescenta colunas anuláveis ao ledger.
  Run-Sql (Join-Path $repo 'drizzle\migrations\0142_forma_efetiva_pagamentos.sql') 'postgres'
  Run-Sql (Join-Path $PSScriptRoot 'fase1-forma-efetiva.verificar.sql') 'postgres' $false

  # Fase B — comportamento, concorrência e reversão em banco sintético isolado.
  Run-Sql (Join-Path $PSScriptRoot 'criar-banco.sql') 'postgres' $false
  Run-Sql (Join-Path $repo 'scripts\homologacao-pg17\retirada-quitacao-balcao.test.sql') `
    'central_retirada_teste' $false
  Run-Sql (Join-Path $PSScriptRoot 'fase1-forma-efetiva.test.sql') `
    'central_retirada_teste' $false
  Run-Sql (Join-Path $PSScriptRoot 'concorrencia-setup.sql') 'central_retirada_teste' $false

  $registrar = Join-Path $PSScriptRoot 'concorrencia-registrar.sql'
  $a = Start-Psql $registrar (Join-Path $work 'concorrencia-a.out') (Join-Path $work 'concorrencia-a.err') `
    @('-v', 'pedido=00000000-0000-4000-8000-000000000050', '-v', 'chave=concorrencia:50', '-v', 'valor=4000')
  $b = Start-Psql $registrar (Join-Path $work 'concorrencia-b.out') (Join-Path $work 'concorrencia-b.err') `
    @('-v', 'pedido=00000000-0000-4000-8000-000000000050', '-v', 'chave=concorrencia:50', '-v', 'valor=4000')
  Wait-Process -Id $a.Id, $b.Id -ErrorAction SilentlyContinue
  $saidas = @('a', 'b') | ForEach-Object {
    $linhas = Get-Content -LiteralPath (Join-Path $work "concorrencia-$_.out") |
      Where-Object { $_ -match '\S' }
    $linhas[-1].Trim()
  }
  if (-not ($saidas -contains 'registrado') -or -not ($saidas -contains 'repetido')) {
    throw "Concorrência com chave repetida falhou: $($saidas -join ',')"
  }

  $a = Start-Psql $registrar (Join-Path $work 'concorrencia-c.out') (Join-Path $work 'concorrencia-c.err') `
    @('-v', 'pedido=00000000-0000-4000-8000-000000000051', '-v', 'chave=concorrencia:51:a', '-v', 'valor=4000')
  $b = Start-Psql $registrar (Join-Path $work 'concorrencia-d.out') (Join-Path $work 'concorrencia-d.err') `
    @('-v', 'pedido=00000000-0000-4000-8000-000000000051', '-v', 'chave=concorrencia:51:b', '-v', 'valor=6000')
  Wait-Process -Id $a.Id, $b.Id -ErrorAction SilentlyContinue
  Assert-Output (Join-Path $work 'concorrencia-c.out') 'registrado' 'Parcial concorrente A não registrado.'
  Assert-Output (Join-Path $work 'concorrencia-d.out') 'registrado' 'Parcial concorrente B não registrado.'
  Run-Sql (Join-Path $PSScriptRoot 'concorrencia-verificar.sql') 'central_retirada_teste' $false

  # Reversão da 0142 antes da reversão da cadeia 0139-0141.
  Run-Sql (Join-Path $PSScriptRoot 'reverter-0142.sql') 'central_retirada_teste' $false
  Run-Sql (Join-Path $PSScriptRoot 'reversao.test.sql') 'central_retirada_teste' $false

  Write-Host 'PG17 OK: compatibilidade, comportamento, concorrência, forma efetiva e reversão.'
  Write-Host "Evidências: $work"
} finally {
  if (Test-Path -LiteralPath $pwfile) { Remove-Item -LiteralPath $pwfile }
  if ($server) {
    $server.Refresh()
    if (-not $server.HasExited) {
      & $pgctl -D $data stop -m fast -w -t 15 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "O cluster pode continuar ativo em $data." }
    }
  }
  $env:PGPASSWORD = $senhaAnterior
}
