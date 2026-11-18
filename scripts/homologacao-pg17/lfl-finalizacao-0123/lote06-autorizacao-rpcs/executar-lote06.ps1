#requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$PrivateStatePath,
  [string]$PgBin='C:\Program Files\PostgreSQL\17\bin',
  [int]$Port=55506
)
$ErrorActionPreference='Stop'
$lote06Directory=$PSScriptRoot
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$lote05Directory=Join-Path $repo 'scripts\homologacao-pg17\lfl-finalizacao-0123\complemento-b-laboratorio'
$manifest=Get-Content (Join-Path $PSScriptRoot 'ORIGEM-06.json') -Raw | ConvertFrom-Json
foreach($entry in $manifest.files.PSObject.Properties){
  $file=Join-Path $repo $entry.Name
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $entry.Value){throw ('Hash divergente: '+$entry.Name)}
}
$original=Join-Path $lote05Directory 'executar-complemento.ps1'
if((Get-FileHash $original -Algorithm SHA256).Hash -ine $manifest.driver05){throw 'Driver 05 divergente'}

# Instrumentacao em memoria do driver aprovado; nao escreve nele, nao muda seus
# hashes e nao enfraquece suas ACLs. Reutiliza preparo, isolamento e regressoes.
# O portao pre-05 ja aprovado e pulado; todas as suites POS-06 sao executadas.
$source=Get-Content -LiteralPath $original -Raw
$source=$source.Replace('$PSScriptRoot','$lote05Directory')
$applyMarker="  Step 'lote05: 05-correcoes-b0-seguranca.sql aplicado (COMMIT)'"
$testMarker="  Step 'lote05: postura de seguranca inalterada apos as 14 suites'"
foreach($marker in @($applyMarker,$testMarker)){
  if(([regex]::Matches($source,[regex]::Escape($marker))).Count -ne 1){throw 'Ponto de instrumentacao divergente'}
}

$lote06CatalogSql=@'
SELECT json_agg(json_build_object(
 'name',p.proname,'identity',p.oid::regprocedure::text,'oid',p.oid,
 'owner',p.proowner,'acl',p.proacl::text,'args',pg_get_function_arguments(p.oid),
 'result',pg_get_function_result(p.oid),'config',p.proconfig,
 'body',md5(p.prosrc),
 'clean',md5(regexp_replace(p.prosrc,E'\n-- lote06:inicio.*?-- lote06:fim','','s'))
) ORDER BY p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
'@
$apply=@'
  function Ler-Catalogo06 {
    return @(Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-c',$lote06CatalogSql) | ConvertFrom-Json)
  }
  $antes06=Ler-Catalogo06
  function Aplicar-06 {
    Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-v','ON_ERROR_STOP=1','-d','lfl_partial',
      '-c',"SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';",
      '-f',(Join-Path $lote06Directory '06-autorizacao-rpcs.sql')) | Out-Null
  }
  Aplicar-06
  $apos06=Ler-Catalogo06
  Aplicar-06
  if(($apos06|ConvertTo-Json -Depth 5 -Compress) -cne ((Ler-Catalogo06)|ConvertTo-Json -Depth 5 -Compress)){
    throw 'Lote 06 nao idempotente'
  }
  Step 'lote06: aplicado duas vezes sem divergencia; regressoes seguintes executam POS-06'
'@
$validate=@'
  # A sessao administrativa local pode assumir service_role para a matriz;
  # postgres restaurado nao pode. Cada caso continua SET ROLE nao privilegiado.
  $teste06=Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','--single-transaction','-v','ON_ERROR_STOP=1',
    '-d','lfl_partial',
    '-f',(Join-Path $lote06Directory '06-autorizacao-rpcs.test.sql'))
  Set-Content (Join-Path $evidencias ($carimbo+'-lote06.log')) $teste06 -Encoding utf8
  if($teste06 -notmatch 'LOTE 06: matriz e fluxos aprovados'){throw 'Testes 06 incompletos'}
  $final06=Ler-Catalogo06
  if($final06.Count -ne $antes06.Count){throw 'Numero de funcoes publicas alterado'}
  $allowed=@('receber_compra_item','consumir_insumos_pedido','consumir_insumos_pedido_trigger','enfileirar_cupom','gerar_cupons_pedidos_pagos')
  foreach($a in $antes06){
    $b=@($final06|Where-Object oid -eq $a.oid)
    if($b.Count -ne 1){throw ('OID alterado: '+$a.name)}
    $b=$b[0]
    foreach($field in @('identity','owner','acl','args','result')){
      if(($a.$field|ConvertTo-Json -Compress) -cne ($b.$field|ConvertTo-Json -Compress)){
        throw ('Contrato/ACL alterado: '+$a.name+' / '+$field)
      }
    }
    if($a.name -notin $allowed -and (($a|ConvertTo-Json -Depth 4 -Compress) -cne ($b|ConvertTo-Json -Depth 4 -Compress))){
      throw ('Funcao fora do escopo alterada: '+$a.name)
    }
    if($a.name -in @('receber_compra_item','enfileirar_cupom','gerar_cupons_pedidos_pagos') -and $a.body -cne $b.clean){
      throw ('Corpo de negocio alterado: '+$a.name)
    }
  }
  $originalConsumo=($antes06|Where-Object name -eq 'consumir_insumos_pedido').body
  $worker=(Invoke-NeiaLocalPg $cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-c',
    "SELECT md5(prosrc) FROM pg_proc WHERE oid='neia_operacao.consumir_insumos_pedido_interno(uuid)'::regprocedure;")).Trim()
  if($worker -cne $originalConsumo){throw 'Corpo original de consumo nao preservado'}
  $resultado['lote06']=[ordered]@{aplicado=$true;idempotente=$true;matriz=$true;
    contratoPreservado=$true;corposPreservados=$true;outrasFuncoesPreservadas=$true;
    jobPreservado=$true;sqlPos06=$suites.Count;concorrencia=14}
  Step 'lote06: matriz, compras, consumo, producao, impressao, servico e contratos aprovados'
'@
$source=$source.Replace($applyMarker,$applyMarker+[Environment]::NewLine+$apply)
$source=$source.Replace($testMarker,$testMarker+[Environment]::NewLine+$validate)
& ([scriptblock]::Create($source)) -PrivateStatePath $PrivateStatePath -PgBin $PgBin `
  -PortGate ($Port+1) -PortComplemento $Port -PularPortaoRegressao
