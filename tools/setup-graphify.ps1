# Install graphify (code knowledge graph) on Windows and build the graph for this repo. The graph (graphify-out/) is git-ignored and rebuilt per machine in about 20 s.
$ErrorActionPreference = "Stop"
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"; $env:Path = "$env:USERPROFILE\.local\bin;$env:Path" }
uv tool install graphifyy --python 3.12
Set-Location (Join-Path $PSScriptRoot "..")
graphify update .
Write-Host "graphify ready."
