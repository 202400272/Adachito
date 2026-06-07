<#
PowerShell script para generar `manga-manifest.json` automático.
Uso:
  powershell -ExecutionPolicy Bypass -File .\tools\generate_manga_manifest.ps1 -BaseUrl "https://pub-.../Manga/" -Out "manga-manifest.json"

El script prueba secuencialmente páginas por capítulo y cuenta hasta que encuentra N fallos consecutivos.
#>
param(
    [Parameter(Mandatory=$false)] [string]$BaseUrl = 'https://pub-552c8df9ee0f4e8da0690fb94530494c.r2.dev/Manga/',
    [Parameter(Mandatory=$false)] [string]$Out = 'manga-manifest.json',
    [Parameter(Mandatory=$false)] [int]$MaxChapter = 56,
    [Parameter(Mandatory=$false)] [int]$MaxPagesPerChapter = 150,
    [Parameter(Mandatory=$false)] [int]$MaxConsecutiveMiss = 2,
    [Parameter(Mandatory=$false)] [int]$TimeoutMs = 7000
)

function Probe-Page {
    param($url)
    try {
        $r = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec ([math]::Ceiling($TimeoutMs/1000)) -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

Write-Host "Generando manifiesto de manga usando base: $BaseUrl"
$manifest = @{}

# capítulos 1..56 excepto 29
$chapters = (1..56 | Where-Object { $_ -ne 29 }) | ForEach-Object { $_.ToString() }
$special = @('5.5','12.5','15.2','16.2','17.2','19.2','27.2','27.3','27.4','29.1','29.2','29.3','30.2','30.5','34.2','36.2','38.2','54.5')
$chapters = $chapters + $special + 'Antologia'

foreach ($ch in $chapters) {
    Write-Host "Procesando capítulo $ch..."
    $consecMiss = 0
    $count = 0
    for ($p = 1; $p -le $MaxPagesPerChapter; $p++) {
        $pageStr = $p.ToString().PadLeft(3,'0')
        # Construir folder name como en JS
        if ($ch -eq 'Antologia') {
            $folder = 'Antologia'
        } else {
            $num = [double]::Parse($ch)
            $useAccent = ($num -ge 40 -and $num -le 55)
            if ($useAccent) { $folder = "Capítulo $ch" } else { $folder = "Capitulo $ch" }
        }
        $urlPart = [uri]::EscapeUriString($folder) + '/' + $pageStr + '.jpg'
        $url = $BaseUrl.TrimEnd('/') + '/' + $urlPart

        $ok = Probe-Page -url $url
        if ($ok) {
            $count++
            $consecMiss = 0
            Write-Host "  página $p -> OK"
        } else {
            $consecMiss++
            Write-Host "  página $p -> MISSING (consec $consecMiss)"
            if ($consecMiss -ge $MaxConsecutiveMiss) { break }
        }
    }
    if ($count -gt 0) {
        $manifest[$ch] = $count
    } else {
        $manifest[$ch] = 0
    }
}

# Guardar JSON
$manifestJson = $manifest | ConvertTo-Json -Depth 5
Set-Content -Path $Out -Value $manifestJson -Encoding UTF8
Write-Host "Manifiesto generado en $Out"
