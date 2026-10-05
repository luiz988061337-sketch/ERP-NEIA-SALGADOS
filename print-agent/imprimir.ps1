param([string]$Arquivo, [string]$Impressora = "TANCA TP-550", [int]$Colunas = 42)
Add-Type -AssemblyName System.Drawing
$texto = Get-Content -LiteralPath $Arquivo -Raw -Encoding UTF8
$linhas = ($texto -split "`n").Count
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $Impressora
if (-not $doc.PrinterSettings.IsValid) { Write-Output "IMPRESSORA INVALIDA"; exit 1 }
# Papel NATIVO do driver (personalizado é rejeitado): 80mm largura cheia,
# contínuo. Ordem de preferência por largura imprimível.
$papel = $null
foreach ($nome in @("82(80) x 3276 mm", "80(76) x 3276 mm", "80(72.1) x 297 mm")) {
  $papel = @($doc.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -eq $nome })[0]
  if ($papel) { break }
}
if ($papel) { $doc.DefaultPageSettings.PaperSize = $papel }
else { $doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("Comanda80", 315, ($linhas * 60 + 150)) }
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(6, 6, 6, 6)
$estado = @{ texto = $texto; colunas = $Colunas }
$h = Register-ObjectEvent -InputObject $doc -EventName PrintPage -Action {
  $e = $Event.SourceEventArgs
  $g = $e.Graphics
  # Largura TOTAL do papel (ignora margens do driver) — 315 = 80mm em 1/100pol.
  $largTotal = 315 - 12
  $charW = $largTotal / $estado.colunas
  $pt = $charW / 100 / 0.6 * 72
  if ($pt -lt 6) { $pt = 6 }
  if ($pt -gt 18) { $pt = 18 }
  $f = New-Object System.Drawing.Font("Consolas", $pt, [System.Drawing.FontStyle]::Bold)
  $area = New-Object System.Drawing.RectangleF(6, 6, $largTotal, ($e.PageBounds.Height - 12))
  $g.DrawString($estado.texto, $f, [System.Drawing.Brushes]::Black, $area)
  $f.Dispose()
  $e.HasMorePages = $false
}
$doc.Print()
$doc.Dispose()
Write-Output "OK colunas=$Colunas impressora=$Impressora"
