param([string]$Arquivo, [string]$Impressora = "TANCA TP-550", [int]$Tamanho = 11)
Add-Type -AssemblyName System.Drawing
$texto = Get-Content -LiteralPath $Arquivo -Raw -Encoding UTF8
$linhas = ($texto -split "`n").Count
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $Impressora
if (-not $doc.PrinterSettings.IsValid) { Write-Output "IMPRESSORA INVALIDA"; exit 1 }
$fonte = New-Object System.Drawing.Font("Consolas", $Tamanho, [System.Drawing.FontStyle]::Bold)
$alturaLinha = [int]($Tamanho * 1.35 * 100 / 72) + 4
$altura = $linhas * $alturaLinha + 60
if ($altura -lt 200) { $altura = 200 }
$doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("Comanda80", 315, $altura)
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(8, 8, 8, 8)
$estado = @{ texto = $texto; fonte = $fonte }
$h = Register-ObjectEvent -InputObject $doc -EventName PrintPage -Action {
  $e = $Event.SourceEventArgs
  $e.Graphics.DrawString($estado.texto, $estado.fonte, [System.Drawing.Brushes]::Black, $e.MarginBounds)
  $e.HasMorePages = $false
}
$doc.Print()
$doc.Dispose()
$fonte.Dispose()
Write-Output "OK tamanho=$Tamanho impressora=$Impressora"
