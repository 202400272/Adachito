
param(
    [Parameter(Mandatory=$false)] [string]$BaseUrl = 'https://media.adashimaverse.com/Manga/',
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

$chapters = (1..56 | Where-Object { $_ -ne 29 }) | ForEach-Object { $_.ToString() }
$special = @('5.5','12.5','15.2','16.2','17.2','19.2','27.2','27.3','27.4','29.1','29.2','29.3','30.2','30.5','34.2','36.2','38.2','54.5')
$chapters = $chapters + $special + 'Antologia'

foreach ($ch in $chapters) {
    Write-Host "Procesando capítulo $ch..."
    $consecMiss = 0
    $count = 0
    for ($p = 1; $p -le $MaxPagesPerChapter; $p++) {
        $pageStr = $p.ToString().PadLeft(3,'0')
        if ($ch -eq 'Antologia') {
            $foldersToTry = @('Antologia')
        } else {
            $foldersToTry = @("Capitulo $ch", "Capítulo $ch")
        }

        $ok = $false
        foreach ($folder in $foldersToTry) {
            $urlPart = [uri]::EscapeUriString($folder) + '/' + $pageStr + '.jpg'
            $url = $BaseUrl.TrimEnd('/') + '/' + $urlPart
            $ok = Probe-Page -url $url
            if ($ok) { break }
        }
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

$manifestJson = $manifest | ConvertTo-Json -Depth 5
Set-Content -Path $Out -Value $manifestJson -Encoding UTF8
Write-Host "Manifiesto generado en $Out"
