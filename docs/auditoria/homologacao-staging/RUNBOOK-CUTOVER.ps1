#Requires -Version 5.1
<#
  RUNBOOK DE CUTOVER — ERP NÉIA SALGADOS
  ======================================
  Por padrão, este script SÓ IMPRIME os comandos (modo `-Simulacao`, default).
  Nada é executado contra nenhum banco.

  Para executar de fato, é preciso:
    - `-Executar` (flag explícita);
    - `-Url "<DATABASE_URL>"` (ou a variável de ambiente `DATABASE_URL`);
    - `-Etapa <n>` para rodar UMA etapa por vez (recomendado);
    - confirmação digitada.

  NUNCA rode com `-Etapa 0` (todas) sem a janela aprovada.

  Etapas:
    1  Fechar novas vendas (ação manual/operacional)
    2  Confirmar ausência de gravações em andamento
    3  Backup (dump) + validação
    4  Verificações PRE (estado, gate das 19, combos)
    5  Migrations + configurações
    6  ACL/RLS (0098) + lockdown
    7  Deploy do build congelado
    8  Bloqueio de frontend antigo (VERSAO_MINIMA)
    9  controlado=true
    10 Smoke test
    11 Decisão GO/NO-GO
    12 Reabrir operação
#>
param(
  [int]$Etapa = 0,
  [switch]$Executar,
  [string]$Url = $env:DATABASE_URL,
  [string]$BuildVersion = "1792429500000",
  [string]$BuildLabel = "cutover-2026-10-19-a1",
  [string]$BuildSha256 = "9d13ed828e09e2936bd74f38cf20c115e0dc39711eda7417f7bfce1ad2203d1",
  [string]$Migrations = "C:\Users\User\ERP-NEIA-SALGADOS\drizzle\migrations",
  [string]$Saida = "C:\Users\User\ERP-NEIA-SALGADOS\docs\auditoria\homologacao-staging",
  # psql NAO esta no PATH nesta maquina: usar o caminho absoluto do PG16 portatil.
  [string]$Psql = "C:\Users\User\AppData\Local\Temp\pg16\pgsql\bin\psql.exe",
  # URL do mesmo servidor, sem o nome do banco (usado para `create database`).
  [string]$UrlVazia = ""
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Say([string]$m) { Write-Host $m }
function SayCmd([string]$m) { Write-Host ("    > " + $m) -ForegroundColor DarkCyan }

function RunPsql([string]$sql, [string]$label) {
  SayCmd "& `"$Psql`" `"$Url`" --no-password -v ON_ERROR_STOP=1 -c @'`n$sql`n'@   # $label"
  if ($Executar) {
    $env:PGCONNECT_TIMEOUT = "10"
    & $Psql $Url --no-password -v ON_ERROR_STOP=1 -c $sql
    if ($LASTEXITCODE -ne 0) { throw "FALHA na etapa '$label' (exit $LASTEXITCODE)" }
    Say "    [executado] $label"
  }
}

function RunPsqlFile([string]$file, [string]$label) {
  SayCmd "& `"$Psql`" `"$Url`" --no-password -v ON_ERROR_STOP=1 -f `"$file`"   # $label"
  if ($Executar) {
    & $Psql $Url --no-password -v ON_ERROR_STOP=1 -f $file
    if ($LASTEXITCODE -ne 0) { throw "FALHA na etapa '$label' (exit $LASTEXITCODE)" }
    Say "    [executado] $label"
  }
}

function Run([string]$cmd, [string]$label) {
  SayCmd "$cmd   # $label"
  if ($Executar) {
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) { throw "FALHA na etapa '$label' (exit $LASTEXITCODE)" }
    Say "    [executado] $label"
  }
}

$ordem = @(
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
)

if (-not $Executar) {
  Say ""
  Say "================================================================"
  Say " RUNBOOK DE CUTOVER — MODO SIMULAÇÃO (NADA SERÁ EXECUTADO)"
  Say "================================================================"
  Say " Build : $BuildVersion / $BuildLabel"
  Say " SHA256: $BuildSha256"
  Say " Etapa : $Etapa (0 = todas, apenas para leitura)"
  Say ""
}

if (-not $Url) { Say "AVISO: -Url/DATABASE_URL não informada — só será impresso." }
if ($Url -and -not $UrlVazia) {
  $u = [Uri]$Url
  $UrlVazia = "$($u.Scheme)://$($u.UserInfo)@$($u.Host):$($u.Port)"
}
if (-not (Test-Path $Psql)) { Say "AVISO: psql não encontrado em $Psql" }

$executarEtapa = { param($n) ($Etapa -eq 0) -or ($Etapa -eq $n) }

# ---------------------------------------------------------------------------
if (& $executarEtapa 1) {
  Say "`n=== ETAPA 1 — FECHAR NOVAS VENDAS ====================================="
  Say "    Ação OPERACIONAL (não é script): publicar aviso de manutenção,"
  Say "    bloquear o cardápio/pedido no canal público e colocar o balcão em pausa."
  Say "    Critério de erro: pedidos ainda entrando => NÃO avançar."
  Say "    Rollback: reabrir o canal (nenhuma escrita no banco envolvida)."
  SayCmd "(ação manual — ver CHECKLIST-AUTORIZACAO-CUTOVER.md passo 1)"
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 2) {
  Say "`n=== ETAPA 2 — AUSÊNCIA DE GRAVAÇÕES EM ANDAMENTO ======================="
  RunPsql @"
select now()                                        AS ts,
       (select count(*) from public.pedidos
         where created_at > now() - interval '2 minutes')  AS pedidos_2min,
       (select count(*) from public.pedido_status_historico
         where created_at > now() - interval '2 minutes')  AS historico_2min,
       (select count(*) from public.reservas_estoque
         where created_at > now() - interval '2 minutes')  AS reservas_2min;
"@ "contadores de escrita (rodar 2x, 30s de intervalo; devem ficar estáveis)"
  Say "    Critério de erro: contadores subindo => NÃO avançar (há escrita em curso)."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 3) {
  Say "`n=== ETAPA 3 — BACKUP ==================================================="
  $stamp = (Get-Date -Format "yyyyMMdd-HHmmss")
  $dump  = Join-Path $Saida "backup-producao-pre-corte-$stamp.sql"
  $sha   = Join-Path $Saida "backup-producao-pre-corte-$stamp.sql.sha256"
  # FORMATO PLAIN (SQL). O binario `pg_restore` NAO EXISTE nesta maquina;
  # o dump plain e restauravel com `psql -f`, que esta disponivel.
  # (Se o `pg_restore` for fornecido, `--format=custom` tambem passa a ser valido.)
  SayCmd "& `"$Psql`" `"$Url`" --no-password --set ON_ERROR_STOP=1 --file `"$dump`""
  SayCmd "Get-FileHash -Algorithm SHA256 `"$dump`" | Select-Object -ExpandProperty Hash | Set-Content `"$sha`""
  SayCmd "# VALIDAÇÃO: restaurar o dump num banco descartável e rodar os verify-*.sql"
  SayCmd "& `"$Psql`" `"$UrlVazia`" --no-password -c `"create database homolog_restore_test`""
  SayCmd "& `"$Psql`" `"$UrlVazia`" --no-password --set ON_ERROR_STOP=1 --file `"$dump`" --dbname homolog_restore_test"
  SayCmd "# registrar o SHA-256 em baseline/MANIFEST.json"
  Say "    FORMATO: SQL plain (restaurável com `psql -f`; `pg_restore` não existe aqui)."
  Say "    Critério de erro: dump vazio, hash divergente ou restore que falha => NO-GO."
  Say "    Rollback: nenhum (o backup é leitura)."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 4) {
  Say "`n=== ETAPA 4 — VERIFICAÇÕES PRE ========================================"
  SayCmd "& `"$Psql`" `"$Url`" --no-password -v ON_ERROR_STOP=1 -f reconciliacao-19-reservas-legado.sql   # read-only"
  RunPsqlFile (Join-Path $Saida "reconciliacao-19-reservas-legado.sql") "classificação das reservas históricas (READ ONLY)"
  RunPsqlFile (Join-Path $Saida "preflight-gate-19-reservas.sql") "gate das 19 reservas (READ ONLY)"
  RunPsql @"
select c.id, c.slug, c.nome, c.ativo, c.combo_preco_unit,
       (select count(*) from public.produtos p
         where p.categoria_id = c.id and p.tipo_venda = 'combo_50') as prods_combo
  from public.categorias c
 where c.ativo
   and (c.combo_preco_unit is null
        or exists (select 1 from public.produtos p
                    where p.categoria_id = c.id and p.tipo_venda = 'combo_50'))
 order by c.slug;
"@ "categorias de combo e seus preços"
  Say "    Critério de erro: gate das 19 = 'NAO', ou categoria de combo sem preço => NO-GO."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 5) {
  Say "`n=== ETAPA 5 — MIGRATIONS E CONFIGURAÇÕES =============================="
  $aplicar = @(
    "0087_reserva_consumos.sql",
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
  Say "    0088 NAO APLICAR (decisão registrada; ver RELATORIO-PREFLIGHT-CUTOVER.md §3)."
  foreach ($m in $aplicar) {
    RunPsqlFile (Join-Path $Migrations $m) "aplicar $m"
  }
  SayCmd "# Configurar combo_preco_unit (valores do seed da 0097):"
  SayCmd "#   mini-fritos 1.60 | mini-assados 2.30 | mini-pasteis 2.30"
  SayCmd "#   mini-pizzas 3.70 | mini-empadinhas 2.40"
  SayCmd "UPDATE public.categorias SET combo_preco_unit = 1.60 WHERE slug = 'mini-fritos'   AND combo_preco_unit IS NULL;"
  SayCmd "UPDATE public.categorias SET combo_preco_unit = 2.30 WHERE slug = 'mini-assados'  AND combo_preco_unit IS NULL;"
  SayCmd "UPDATE public.categorias SET combo_preco_unit = 2.30 WHERE slug = 'mini-pasteis'  AND combo_preco_unit IS NULL;"
  SayCmd "UPDATE public.categorias SET combo_preco_unit = 3.70 WHERE slug = 'mini-pizzas'   AND combo_preco_unit IS NULL;"
  SayCmd "UPDATE public.categorias SET combo_preco_unit = 2.40 WHERE slug = 'mini-empadinhas' AND combo_preco_unit IS NULL;"
  Say "    Critério de erro: qualquer migration com erro => PARAR e restaurar do backup."
  Say "    Rollback: ROLLBACK transacional ou restore do dump. NUNCA aplicar a 0088."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 6) {
  Say "`n=== ETAPA 6 — ACL/RLS =================================================="
  RunPsqlFile (Join-Path $Migrations "0098_acl_menor_privilegio.sql") "garantir 0098 aplicada"
  RunPsqlFile (Join-Path $Saida "pg16\cutover-lockdown.sql") "lockdown: revogar DML/RPC legadas"
  SayCmd "node scripts/auditoria-rls.mjs   # espera: 79 tabelas com RLS+GRANT"
  Say "    Critério de erro: auditoria RLS != 79, ou fluxo novo quebrado => PARAR."
  Say "    Rollback: o lockdown NÃO é revertido (é a barreira). Reverter = risco."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 7) {
  Say "`n=== ETAPA 7 — DEPLOY DO BUILD CONGELADO ================================"
  SayCmd "# conferir o artefato antes de publicar"
  SayCmd "node scripts/preflight-artefato.mjs   # espera: PREFLIGHT_ARTEFATO_OK"
  SayCmd "# publicar o artefato $BuildVersion ($BuildLabel)"
  SayCmd "#   SHA-256 esperado: $BuildSha256"
  SayCmd "# (o comando de publicação depende do provedor; o bundle é .output/)"
  Say "    Critério de erro: SHA-256 divergente do BUILD-CUTOVER.json => NÃO PUBLICAR."
  Say "    Rollback: republicar o bundle anterior (o piso de versão impede que ele opere)."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 8) {
  Say "`n=== ETAPA 8 — BLOQUEIO DO FRONTEND ANTIGO =============================="
  SayCmd "# no runtime do servidor (variável de ambiente):"
  SayCmd "VERSAO_MINIMA=$BuildVersion"
  SayCmd "# conferir:"
  SayCmd "curl -s -D- https://<host>/api/versao"
  Say "    Esperado: HTTP 200, cache-control: no-store, minimo=$BuildVersion, corte=true"
  Say "    Critério de erro: sem no-store, ou minimo != versão do build => NÃO ABRIR VENDAS."
  Say "    Rollback: manter o piso (o bundle antigo não opera) e republicar."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 9) {
  Say "`n=== ETAPA 9 — controlado=true ========================================="
  RunPsql @"
update public.reserva_proveniencia_config
   set controlado = true
 where id = true
returning id, controlado;
"@ "ativar controlado=true (o ponto homologado)"
  SayCmd "select id, controlado from public.reserva_proveniencia_config where id = true;"
  Say "    Ponto homologado: DEPOIS das migrations e ANTES de abrir vendas."
  Say "    Critério de erro: comando não retornar exatamente 1 linha => PARAR."
  Say "    Rollback: NÃO reverter controlado=true. Se causar erro, corrigir a cobertura."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 10) {
  Say "`n=== ETAPA 10 — SMOKE TEST =============================================="
  SayCmd "# contra PRODUÇÃO (somente leitura + criação de pedidos de teste):"
  SayCmd "#   1. checkout retirada  2. checkout entrega  3. PDV  4. atendimento"
  SayCmd "#   5. combo 50  6. combo misto  7. retirada parcial  8. cancelamento s/ consumo"
  SayCmd "#   9. cancelamento c/ consumo  10. pedido pago (cancelamento bloqueado)"
  SayCmd "#  11. produção  12. entrega  13. fila de impressão  14. /api/versao"
  Say "    Critério de erro: qualquer falha => NO-GO, manter fechado."
  Say "    Rollback: cancelar os pedidos de teste via 0093 (libera só o não consumido)."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 11) {
  Say "`n=== ETAPA 11 — DECISÃO GO / NO-GO ====================================="
  Say "    Preencher a seção 9 do CHECKLIST-AUTORIZACAO-CUTOVER.md (todos os [x])."
  Say "    Um item sem [x] = NO-GO. Sem exceções."
}

# ---------------------------------------------------------------------------
if (& $executarEtapa 12) {
  Say "`n=== ETAPA 12 — REABRIR OPERAÇÃO ======================================="
  SayCmd "# (ação manual) publicar aviso de reabertura e reativar o canal de pedidos"
  Say "    Critério de erro:Erro na verificação de versão em produção => reabrir e escalar."
}

Say ""
if ($Executar) {
  Say "EXECUTADO. Registre as evidências no CHECKLIST-AUTORIZACAO-CUTOVER.md §7."
} else {
  Say "SIMULAÇÃO ENCERRADA. Nenhum comando foi executado."
}
