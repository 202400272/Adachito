# PowerShell script to remove comments from .html, .js, .css files
# WARNING: irreversible changes

Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$patterns = @('*.html','*.js','*.css')

# Regex patterns
$reBlock = '(?s)/\*.*?\*/'          # /* ... */
$reLineStart = '(?m)^[ \t]*//.*$'    # // at start of line
$reLineInline = '(?m)(?<!:)//.*$'     # inline // not preceded by ':' (avoid http://)
$reHTML = '(?s)<!--.*?-->'            # <!-- ... -->

Get-ChildItem -Path $root -Recurse -Include $patterns | ForEach-Object {
    $file = $_.FullName
    $text = Get-Content -Raw -LiteralPath $file -ErrorAction SilentlyContinue
    if ($null -eq $text) { return }

    $orig = $text

    # Remove HTML comments
    $text = [regex]::Replace($text, $reHTML, '', 'IgnoreCase')

    # Remove HTML comments
    $text = [regex]::Replace($text, $reHTML, '', 'Singleline')

    # Remove block comments (/* */)
    $text = [regex]::Replace($text, $reBlock, '', 'Singleline')

    # Remove line-start // comments
    $text = [regex]::Replace($text, $reLineStart, '', 'Multiline')

    # Remove inline // comments that are not part of URLs
    $text = [regex]::Replace($text, $reLineInline, '', 'Multiline')

    if ($text -ne $orig) {
        Set-Content -LiteralPath $file -Value $text -Force
        Write-Output "Cleaned: $file"
    }
}

Write-Output "Done removing comments."