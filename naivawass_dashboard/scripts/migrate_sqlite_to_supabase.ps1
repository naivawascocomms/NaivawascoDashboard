param(
    [Parameter(Mandatory = $true)]
    [string]$DatabaseUrl,

    [string]$ExportFile = "sqlite_export.json",

    [switch]$SkipExport
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$python = Join-Path $projectRoot "venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "Virtualenv Python was not found at $python"
}

if (-not $SkipExport) {
    Write-Host "Exporting current SQLite data to $ExportFile ..."
    $oldDatabaseUrl = $env:DATABASE_URL
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    & $python manage.py dumpdata --natural-foreign --natural-primary --exclude contenttypes --exclude auth.permission --indent 2 -o $ExportFile
    if ($null -ne $oldDatabaseUrl) {
        $env:DATABASE_URL = $oldDatabaseUrl
    }
}

Write-Host "Installing backend requirements ..."
& $python -m pip install -r requirements.txt

Write-Host "Running Django migrations on Supabase Postgres ..."
$env:DATABASE_URL = $DatabaseUrl
& $python manage.py migrate

Write-Host "Loading exported SQLite data into Supabase Postgres ..."
& $python manage.py loaddata $ExportFile

Write-Host "Verifying Supabase-backed Django database ..."
& $python manage.py check
& $python manage.py shell -c "from django.contrib.auth import get_user_model; print('Users:', get_user_model().objects.count())"

Write-Host "Done. The backend is now wired to Supabase whenever DATABASE_URL is set."
