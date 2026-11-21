[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string[]]$Files,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedBranch,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedHead,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$CommitMessage,

    [Parameter()]
    [switch]$AllowMigration0105,

    [Parameter()]
    [switch]$AllowMigration0106,

    [Parameter()]
    [switch]$AllowMigration0107,

    [Parameter()]
    [switch]$AllowMigration0108,

    [Parameter()]
    [string]$RepoPath = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$GitArgs)

    $lines = @(& git -C $script:RepositoryRoot @GitArgs 2>&1)
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $detail = ($lines | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        throw "Git falhou ($exitCode): $detail"
    }
    return (($lines | ForEach-Object { [string]$_ }) -join [Environment]::NewLine)
}

function Get-StagedPaths {
    $text = Invoke-Git -GitArgs @('diff', '--cached', '--name-only', '--no-renames')
    if ([string]::IsNullOrWhiteSpace($text)) { return @() }
    return @($text -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Assert-ExpectedState {
    param([switch]$RequireEmptyIndex)

    [void](Invoke-Git -GitArgs @('status', '--porcelain=v1', '--untracked-files=all'))
    $top = Invoke-Git -GitArgs @('rev-parse', '--show-toplevel')
    $trimChars = [char[]]@('\', '/')
    $topPath = [System.IO.Path]::GetFullPath($top.Trim()).TrimEnd($trimChars)
    if (-not [string]::Equals($topPath, $script:RepositoryRoot.TrimEnd($trimChars), [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "O Git aponta para outro repositório: $topPath"
    }

    $branch = (Invoke-Git -GitArgs @('branch', '--show-current')).Trim()
    if ($branch -cne $ExpectedBranch) { throw "Branch inesperada: '$branch'. Esperada: '$ExpectedBranch'." }

    $head = (Invoke-Git -GitArgs @('rev-parse', 'HEAD')).Trim()
    if ($head -ine $ExpectedHead) { throw "HEAD inesperado: '$head'. Esperado: '$ExpectedHead'." }

    $staged = @(Get-StagedPaths)
    if ($RequireEmptyIndex -and $staged.Count -gt 0) {
        throw "O índice já contém alterações preparadas. Nada foi modificado pelo script. Arquivos: $($staged -join ', ')"
    }
}

function Assert-SafePath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    if ([System.IO.Path]::IsPathRooted($RelativePath) -or $RelativePath -match '(^|[\\/])\.\.([\\/]|$)') {
        throw "Informe somente caminhos relativos dentro do repositório: '$RelativePath'."
    }

    $normalized = $RelativePath.Replace('\', '/')
    $parts = @($normalized -split '/')
    $leaf = $parts[$parts.Count - 1]
    $isAuthorizedMigration0105 = $AllowMigration0105.IsPresent -and
        $normalized -ceq 'drizzle/migrations/0105_taxa_entrega_contrato_explicito.sql'
    $isAuthorizedMigration0106 = $AllowMigration0106.IsPresent -and
        $normalized -ceq 'drizzle/migrations/0106_financeiro_operacoes_atomicas.sql'
    $isAuthorizedMigration0107 = $AllowMigration0107.IsPresent -and
        $normalized -ceq 'drizzle/migrations/0107_movimento_estoque_manual_atomico.sql'
    $isAuthorizedMigration0108 = $AllowMigration0108.IsPresent -and
        $normalized -ceq 'drizzle/migrations/0108_criar_rota_entrega_atomica.sql'
    $isAuthorizedMigration = $isAuthorizedMigration0105 -or $isAuthorizedMigration0106 -or
        $isAuthorizedMigration0107 -or $isAuthorizedMigration0108
    if ($parts -contains '.git' -or $parts -contains '.vercel' -or $parts -contains 'supabase' -or
        (($parts -contains 'migrations') -and -not $isAuthorizedMigration) -or
        $parts -contains 'production') {
        throw "Caminho protegido não pode ser preparado: '$normalized'."
    }
    if ($leaf -match '(?i)^\.env($|\.)' -or
        $leaf -match '(?i)(secret|credential|password|token)' -or
        $leaf -match '(?i)\.(pem|key|p12|pfx|keystore)$') {
        throw "Arquivo sensível não pode ser preparado: '$normalized'."
    }

    $preservados = @(
        'AGENTS.md',
        'docs/erp-dark/prints/central-entregas-DEPOIS-celular.png',
        'docs/erp-dark/prints/central-entregas-DEPOIS.png',
        'docs/reembolsos-estornos/capturas-origens/central-com-novas-solicitacoes.png'
    )
    if ($preservados -contains $normalized) {
        throw "Arquivo explicitamente preservado não pode ser preparado: '$normalized'."
    }
    return $normalized
}

function Assert-NoSecretMaterial {
    param([Parameter(Mandatory = $true)][string]$DiffText)

    $patterns = @(
        '(?im)-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
        '(?i)AKIA[0-9A-Z]{16}',
        '(?i)eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}',
        '(?i)\b(sb_secret_|sk_live_|rk_live_|vcp_)[A-Za-z0-9_-]{12,}',
        '(?i)(api[_-]?key|secret|password|passwd|access[_-]?token|refresh[_-]?token|service[_-]?role)\s*[:=]\s*["'']?[A-Za-z0-9_./+=-]{12,}'
    )
    foreach ($pattern in $patterns) {
        if ([System.Text.RegularExpressions.Regex]::IsMatch($DiffText, $pattern)) {
            throw 'O conteúdo preparado parece conter credencial ou chave. O diff foi retido e o commit foi cancelado.'
        }
    }
}

$script:RepositoryRoot = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepoPath).Path).TrimEnd('\', '/')
$normalizedFiles = @()
$seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

foreach ($file in $Files) {
    if ([string]::IsNullOrWhiteSpace($file)) { throw 'A lista de arquivos contém um caminho vazio.' }
    $normalized = Assert-SafePath -RelativePath $file
    if (-not $seen.Add($normalized)) { throw "Arquivo repetido na lista: '$normalized'." }

    $absolute = [System.IO.Path]::GetFullPath((Join-Path $script:RepositoryRoot $normalized.Replace('/', '\')))
    if (-not $absolute.StartsWith($script:RepositoryRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "O caminho sai do repositório: '$normalized'."
    }
    if (-not (Test-Path -LiteralPath $absolute -PathType Leaf)) {
        throw "Arquivo autorizado não existe: '$normalized'."
    }
    $normalizedFiles += $normalized
}

if ($normalizedFiles.Count -eq 0) { throw 'Informe ao menos um arquivo autorizado.' }
if ($CommitMessage -match '[\r\n]' -or [string]::IsNullOrWhiteSpace($CommitMessage)) {
    throw 'A mensagem deve ser uma única linha não vazia.'
}

Assert-ExpectedState -RequireEmptyIndex
Write-Host "Repositório: $script:RepositoryRoot"
Write-Host "Branch/HEAD conferidos: $ExpectedBranch / $ExpectedHead"
Write-Host 'Índice vazio; preparando somente a lista autorizada.'

$addArgs = @('add', '--') + $normalizedFiles
[void](Invoke-Git -GitArgs $addArgs)

$stagedPaths = @(Get-StagedPaths)
$unexpected = @($stagedPaths | Where-Object { $normalizedFiles -notcontains $_ })
if ($unexpected.Count -gt 0) {
    throw "O índice contém arquivo não autorizado: $($unexpected -join ', '). Nenhum commit foi criado."
}
if ($stagedPaths.Count -eq 0) { throw 'Nenhuma alteração dos arquivos autorizados foi preparada.' }

[void](Invoke-Git -GitArgs @('diff', '--cached', '--check'))
$diff = Invoke-Git -GitArgs (@('diff', '--cached', '--no-ext-diff', '--no-color', '--') + $normalizedFiles)
Assert-NoSecretMaterial -DiffText $diff
$reviewedPaths = @($stagedPaths | Sort-Object)
$reviewedDiff = $diff

Write-Host ''
Write-Host 'Resumo preparado:'
Write-Host (Invoke-Git -GitArgs (@('diff', '--cached', '--stat', '--') + $normalizedFiles))
Write-Host ''
Write-Host 'Diff preparado:'
Write-Host $diff
Write-Host ''
Write-Host "Mensagem: $CommitMessage"
$confirmation = Read-Host 'Digite COMMIT exatamente para criar somente este commit local'
if ($confirmation -cne 'COMMIT') {
    $addedPathsText = Invoke-Git -GitArgs @('diff', '--cached', '--diff-filter=A', '--name-only')
    $addedPaths = @()
    if (-not [string]::IsNullOrWhiteSpace($addedPathsText)) { $addedPaths = @($addedPathsText -split "`r?`n") }
    if ($addedPaths.Count -gt 0) {
        [void](Invoke-Git -GitArgs (@('rm', '--cached', '--') + $addedPaths))
    }
    $trackedPrepared = @($normalizedFiles | Where-Object { $addedPaths -notcontains $_ -and $stagedPaths -contains $_ })
    if ($trackedPrepared.Count -gt 0) {
        [void](Invoke-Git -GitArgs (@('restore', '--staged', '--') + $trackedPrepared))
    }
    Write-Host 'Cancelado. Arquivos de trabalho preservados e índice restaurado ao estado vazio.'
    return
}

# Revalidação imediatamente antes do commit, para detectar mudanças durante a revisão.
Assert-ExpectedState
$stagedPaths = @(Get-StagedPaths)
if ($stagedPaths.Count -eq 0) { throw 'O índice ficou vazio após a revisão; nenhum commit foi criado.' }
$unexpected = @($stagedPaths | Where-Object { $normalizedFiles -notcontains $_ })
if ($unexpected.Count -gt 0) { throw "O índice mudou e contém arquivo não autorizado: $($unexpected -join ', ')." }
if ((@($stagedPaths | Sort-Object) -join "`n") -cne ($reviewedPaths -join "`n")) {
    throw 'A lista de arquivos preparados mudou após a revisão. Nenhum commit foi criado.'
}
$unstaged = Invoke-Git -GitArgs (@('diff', '--name-only', '--') + $normalizedFiles)
if (-not [string]::IsNullOrWhiteSpace($unstaged)) {
    throw "Arquivos autorizados mudaram após a revisão. Revise novamente antes do commit: $unstaged"
}
[void](Invoke-Git -GitArgs @('diff', '--cached', '--check'))
$diffFinal = Invoke-Git -GitArgs (@('diff', '--cached', '--no-ext-diff', '--no-color', '--') + $normalizedFiles)
if ($diffFinal -cne $reviewedDiff) { throw 'O diff preparado mudou após a revisão. Nenhum commit foi criado.' }
Assert-NoSecretMaterial -DiffText $diffFinal

[void](Invoke-Git -GitArgs @('commit', '-m', $CommitMessage))
$newHead = (Invoke-Git -GitArgs @('rev-parse', 'HEAD')).Trim()
$finalStatus = Invoke-Git -GitArgs @('status', '--short', '--untracked-files=normal')
Write-Host "Commit local criado: $newHead"
Write-Host 'Status final (resumo de não rastreados):'
if ([string]::IsNullOrWhiteSpace($finalStatus)) { Write-Host 'limpo' } else { Write-Host $finalStatus }
