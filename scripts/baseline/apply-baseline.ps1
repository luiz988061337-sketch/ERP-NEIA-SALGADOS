param(
  [string]$Database = "homolog_baseline",
  [string]$Psql = "psql",
  [string]$Host = "127.0.0.1",
  [int]$Port = 55435,
  [string]$User = "postgres",
  [string]$Baseline = "$PSScriptRoot\..\..\docs\auditoria\homologacao-staging\baseline\baseline-0086.full.sql"
)

$ErrorActionPreference = "Stop"
$migrations = @(
  "0087_reserva_consumos.sql",
  "0088_reservar_estoque_atomica.sql",
  "0089_reservar_pedido_atomico.sql",
  "0090_liberar_pedido_atomico.sql",
  "0091_registrar_consumo_reserva.sql",
  "0092_reserva_proveniencia.sql",
  "0093_cancelar_pedido_atomico.sql",
  "0094_protecao_pagamento_cancelado.sql",
  "0095_criar_pedido_com_reserva.sql",
  "0096_reparo_parceiros_rls.sql",
  "0097_modelagem_combo.sql",
  "0098_acl_menor_privilegio.sql"
)
$repo = Resolve-Path "$PSScriptRoot\..\.."
$migDir = Join-Path $repo "drizzle\migrations"
$common = @("-h", $Host, "-p", "$Port", "-U", $User, "-v", "ON_ERROR_STOP=1")

if (-not (Test-Path $Baseline)) { throw "Baseline nao encontrada: $Baseline" }

Write-Host "== recriando $Database =="
& $Psql @common -d postgres -c "DROP DATABASE IF EXISTS $Database;"
if ($LASTEXITCODE -ne 0) { throw "falha ao dropar $Database" }
& $Psql @common -d postgres -c "CREATE DATABASE $Database TEMPLATE template0 ENCODING 'UTF8';"
if ($LASTEXITCODE -ne 0) { throw "falha ao criar $Database" }

Write-Host "== restaurando baseline =="
& $Psql @common -d $Database -f $Baseline
if ($LASTEXITCODE -ne 0) { throw "falha ao restaurar baseline" }

foreach ($f in $migrations) {
  Write-Host "== aplicando $f =="
  & $Psql @common -d $Database -f (Join-Path $migDir $f)
  if ($LASTEXITCODE -ne 0) { throw "falha em $f" }
}
Write-Host "OK: baseline + 0087-0098 aplicadas em $Database"
