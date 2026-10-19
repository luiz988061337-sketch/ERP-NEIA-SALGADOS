#Requires -Version 5.1
<#
  ENSAIO-PACOTE.ps1 — ensaio LOCAL e descartável do pacote de cutover.
  ==========================================================================
  NÃO toca produção. Cria um banco local a partir do snapshot pré-0087,
  aplica o pacote inteiro na ordem e confere os vereditos.

  Uso:
    powershell -ExecutionPolicy Bypass -File ENSAIO-PACOTE.ps1
    powershell -ExecutionPolicy Bypass -File ENSAIO-PACOTE.ps1 -Bin <caminho do psql> -Porta 55435

  Requisitos: um PostgreSQL 16 local e o snapshot
  `docs/auditoria/homologacao-staging/baseline/baseline-0086.full.sql`.
#>
param(
  [string]$Bin = 'C:\Users\User\AppData\Local\Temp\pg16\pgsql\bin',
  [int]$Porta = 55435,
  [string]$User = 'postgres',
  [string]$Db = 'homolog_pacote_ensaio',
  [string]$Snapshot = "$PSScriptRoot\..\homologacao-staging\baseline\baseline-0086.full.sql"
)

# 'Continue' para que NOTICE/erro de stderr do psql nao interrompa o script
# (a checagem real e pelo codigo de saida de cada etapa).
$ErrorActionPreference = 'Continue'
$pkg = $PSScriptRoot

function Step([string]$label, [string]$file) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $out = & "$Bin\psql.exe" -h 127.0.0.1 -p $Porta -U $User -d $Db --no-password --set ON_ERROR_STOP=1 --file $file 2>&1
    $code = $LASTEXITCODE
    $sw.Stop()
    $verdict = ($out | Select-String -Pattern 'NOTICE:\s+(PRECHECK_OK|VERIFY_POS_CORTE_OK|CONFIGURACAO_OK|CONTROLADO_OK|SMOKE_DATABASE_OK|QUARENTENA_OK|LOCKDOWN_OK)|EXCEPTION.*NO-GO' | ForEach-Object { $_.Line.Trim() }) -join ' | '
    Write-Host ("{0,-26} exit={1} {2,5}ms  {3}" -f $label, $code, $sw.ElapsedMilliseconds, $verdict)
    if ($code -ne 0) { $out | Select-Object -Last 5 | ForEach-Object { Write-Host ("    " + $_) } }
    return $code
}

Write-Host "=== ENSAIO LOCAL DO PACOTE DE CUTOVER (descartavel) ===`n"
if (-not (Test-Path $Bin)) { throw "psql nao encontrado em $Bin" }
if (-not (Test-Path $Snapshot)) { throw "snapshot nao encontrado: $Snapshot" }

& "$Bin\psql.exe" -h 127.0.0.1 -p $Porta -U $User -d postgres -v ON_ERROR_STOP=1 `
    -c "DROP DATABASE IF EXISTS $Db;" -c "CREATE DATABASE $Db TEMPLATE template0 ENCODING 'UTF8';" *> $null
& "$Bin\psql.exe" -h 127.0.0.1 -p $Porta -U $User -d $Db -v ON_ERROR_STOP=1 -f $Snapshot *> $null
Write-Host "snapshot pre-0087 restaurado no banco $Db`n"

Push-Location $pkg
$c = @{}
$c['01'] = Step '01_PRECHECK'           '01_PRECHECK.sql'
$c['02'] = Step '02_MIGRATIONS-CUTOVER' '02_MIGRATIONS-CUTOVER.sql'

# A categoria de teste existe apenas no clone de homologacao (em producao so ha
# os 5 slugs reais, semeados pela 0097). Define-se o preco dela para reproduzir
# o papel do operador.
& "$Bin\psql.exe" -h 127.0.0.1 -p $Porta -U $User -d $Db `
    -c "update public.categorias set combo_preco_unit=1.60 where slug='testes-homologacao';" *> $null
Write-Host "  (preco da categoria de teste definido - simula o operador)`n"

$c['03'] = Step '03_CONFIGURACAO'       '03_CONFIGURACAO-CUTOVER.sql'
$c['08'] = Step '08_LOCKDOWN-ACL'      '08_LOCKDOWN-ACL.sql'
$c['04'] = Step '04_ATIVAR-CONTROLADO'  '04_ATIVAR-CONTROLADO.sql'
$c['05'] = Step '05_VERIFY-POS-CORTE'   '05_VERIFY-POS-CORTE.sql'
$c['06'] = Step '06_SMOKE-DATABASE'     '06_SMOKE-DATABASE.sql'
$c['07'] = Step '07_QUARENTENA'         '07_QUARENTENA-19-RESERVAS.sql'
Pop-Location

$falhas = ($c.Values | Where-Object { $_ -ne 0 }).Count
Write-Host "`nRESULTADO: $($c.Values -join ',')  falhas=$falhas"
if ($falhas -gt 0) { exit 1 }
Write-Host "PACOTE_OK: todas as etapas executaram com sucesso no clone"
