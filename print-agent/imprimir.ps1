param(
  [string]$Arquivo,
  [string]$Impressora = "HP Smart Tank 584",
  [int]$Colunas = 42,
  # Largura do bloco do cupom em mm (modo folha). 80mm = largura de um cupom
  # termico real, desenhado centralizado na folha A4/Carta.
  [double]$LarguraCupomMm = 80
)

# Sai SEMPRE por exit code: 0 = enviado a impressora, 1 = falha.
# NUNCA escreve "OK" na tela: quem le o codigo de saida e o agent.ts, que decide
# se o trabalho vai para "impresso" ou "erro".
#
# Dois modos de papel:
#  - ROLO CONTINUO (Tanca TP-550, driver XP-80C): "80(72.1) x 3276 mm".
#    A impressao ocupa toda a largura util.
#  - FOLHA (HP Smart Tank 584, Microsoft IPP Class Driver): A4/Carta. Nao
#    existe rolo de 80mm nesse driver; o cupom e desenhado como um bloco de
#    80mm centralizado na folha.
$ErrorActionPreference = "Stop"

if (-not $Arquivo -or -not (Test-Path -LiteralPath $Arquivo)) { exit 1 }

Add-Type -AssemblyName System.Drawing

$texto = Get-Content -LiteralPath $Arquivo -Raw -Encoding UTF8
if ($null -eq $texto) { $texto = "" }

$doc = $null
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $Impressora
  if (-not $doc.PrinterSettings.IsValid) { $doc.Dispose(); $doc = $null; exit 1 }

  # Papel nativo do rolo continuo (unico papel valido para a Tanca neste driver).
  $papel = @($doc.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -eq "80(72.1) x 3276 mm" })[0]
  if (-not $papel) {
    # rede de seguranca: qualquer papel de rolo (3276mm) que o driver ofereca
    $papel = @($doc.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -match '3276' })[0]
  }

  $margemLateral = 6
  $margemTopo = 6
  $margemBase = 6

  if ($papel) {
    # --- MODO ROLO (Tanca) -------------------------------------------------
    $doc.DefaultPageSettings.PaperSize = $papel
    # Margem minima que o driver respeita de verdade (medido: 6 -> 271 de 283 utilizaveis).
    # Nao usar as margens DEFAULT do driver (100): cortam o cupom para 2,1mm.
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(6, 6, 6, 6)
  } else {
    # --- MODO FOLHA (HP Smart Tank 584 / A4 / Carta) ------------------------
    # Mantem o papel configurado na fila da impressora (A4 ou Carta).
    $largFolha = $doc.DefaultPageSettings.PaperSize.Width
    $largCupom = $LarguraCupomMm * 72 / 25.4
    $margemLateral = [int][Math]::Max(0, [Math]::Floor(($largFolha - $largCupom) / 2))
    $margemTopo = [int][Math]::Round(10 * 72 / 25.4)
    $margemBase = [int][Math]::Round(10 * 72 / 25.4)
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(
      $margemLateral, $margemLateral, $margemTopo, $margemBase)
  }

  # Fonte monoespacada: Consolas (0.55 em de avance) ou Courier New (0.60).
  $fam = "Consolas"
  $avanco = 0.55
  if (-not ([System.Drawing.FontFamily]::Families | Where-Object { $_.Name -eq "Consolas" })) {
    $fam = "Courier New"
    $avanco = 0.60
  }

  $estado = @{ texto = $texto; colunas = $Colunas; avanco = $avanco }

  # Handler .NET (add_PrintPage) e OBRIGATORIO: com Register-ObjectEvent -Action a acao
  # roda ASSINCRONA em outra runspace, o $doc.Print() retorna antes do desenho, o
  # $e.Graphics ja esta invalidado e a pagina sai EM BRANCO (spool de 244 bytes).
  # Com add_PrintPage o desenho roda sincrono dentro do $doc.Print().
  $handler = [System.Drawing.Printing.PrintPageEventHandler] {
    param($sender, $e)
    $g = $e.Graphics
    # MarginBounds = caixa REALMENTE imprimivel ja com as margens aplicadas.
    $mb = $e.MarginBounds
    $largUtil = $mb.Width
    if ($largUtil -le 0) { $largUtil = $e.PageBounds.Width }
    $altUtil = $e.PageBounds.Height
    # As 42 colunas cabem na largura util: fonte derivada da largura real.
    # 2% de folga para o DrawString NAO quebrar a linha (quebra = cupom torto).
    $charW = $largUtil / $estado.colunas
    $pt = $charW * 0.98 / $estado.avanco
    if ($pt -lt 5) { $pt = 5 }
    if ($pt -gt 18) { $pt = 18 }
    $f = New-Object System.Drawing.Font($estado.fam, $pt, [System.Drawing.FontStyle]::Bold)
    $area = New-Object System.Drawing.RectangleF($mb.X, $mb.Y, $largUtil, $altUtil)
    $g.DrawString($estado.texto, $f, [System.Drawing.Brushes]::Black, $area)
    $f.Dispose()
    $e.HasMorePages = $false
  }
  $estado.fam = $fam
  $doc.add_PrintPage($handler)

  try {
    $doc.Print()
  } finally {
    $doc.remove_PrintPage($handler)
  }
} catch {
  if ($doc) { try { $doc.Dispose() } catch { } }
  exit 1
}

if ($doc) { $doc.Dispose() }
exit 0
