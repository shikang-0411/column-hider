<#
.SYNOPSIS
    Stages, commits, and pushes changes, retrying automatically if a git
    command transiently fails (e.g. "unable to write new index file" /
    "couldn't set 'HEAD'") because another process (GitLens/GitKraken's
    background "gk" watcher) briefly locks files under .git on this drive.

.USAGE
    .\git-sync.ps1 "Your commit message"
    .\git-sync.ps1                # uses a default timestamped message
#>

param(
    [string]$Message = "Update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

function Invoke-GitRetry {
    param([string[]]$GitArgs, [int]$MaxAttempts = 100, [int]$DelayMs = 500)
    for ($i = 0; $i -lt $MaxAttempts; $i++) {
        & git @GitArgs 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return $true }
        Start-Sleep -Milliseconds $DelayMs
    }
    Write-Host "FAILED after $MaxAttempts attempts: git $GitArgs" -ForegroundColor Red
    return $false
}

Write-Host "Staging changes..."
if (-not (Invoke-GitRetry -GitArgs @('add', '-A'))) { exit 1 }

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "Nothing to commit, working tree clean."
} else {
    Write-Host "Committing..."
    if (-not (Invoke-GitRetry -GitArgs @('commit', '-m', $Message))) { exit 1 }
}

Write-Host "Pushing..."
if (-not (Invoke-GitRetry -GitArgs @('push', 'origin', 'main'))) { exit 1 }

Write-Host "Done." -ForegroundColor Green
git log --oneline -3
