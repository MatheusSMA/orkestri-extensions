# Builds Warp's open-source client for Windows x64 (channel "oss", warpdotdev/warp, AGPL-3.0) from a checkout of
# warpdotdev/warp, the way the orkestri.warp-oss package ships it: the program, the files its installer would put
# beside it, its licences and SOURCE.md. Run by .github/workflows/build-warp.yml; locally:
#   pwsh tools/warp/build.ps1 -Warp <checkout of warpdotdev/warp> -Out <empty folder> -Commit <its commit>
# Needs Rust (the commit's rust-toolchain.toml), protoc and cargo-about 0.8.4, as upstream's own CI.
param(
    [Parameter(Mandatory = $true)] [string]$Warp,
    [Parameter(Mandatory = $true)] [string]$Out,
    [Parameter(Mandatory = $true)] [string]$Commit,
    [string]$BuildScript = 'https://github.com/MatheusSMA/orkestri-extensions/blob/main/tools/warp/build.ps1'
)
$ErrorActionPreference = 'Stop'
$Out = (New-Item -ItemType Directory -Force -Path $Out).FullName
Set-Location $Warp

# Orkestri's changes to Warp's code (patch.ps1 says which and why).
& "$PSScriptRoot\patch.ps1"

# Upstream's release build of the oss channel (profile rlto: thin LTO), without debug info: a 4-core runner has
# 16 GB of memory, and upstream notes that debug info is what made its own CI run out of it.
$env:CARGO_PROFILE_RLTO_DEBUG = '0'
& .\script\windows\bundle.ps1 -CHANNEL oss -SKIP_BUILD_INSTALLER -ARCH x64
if ($LASTEXITCODE) { throw "bundle.ps1 failed: $LASTEXITCODE" }
$bin = 'target\x86_64-pc-windows-msvc\rlto'

# What windows-installer.iss puts beside the program.
$env:SETTINGS_SCHEMA_EXECUTABLE = (Resolve-Path "$bin\warp-oss.exe").Path
& .\script\windows\prepare_bundled_resources.ps1 -DestinationDir "$Out\resources" -Channel oss
if ($LASTEXITCODE) { throw "prepare_bundled_resources.ps1 failed: $LASTEXITCODE" }
Copy-Item "$bin\warp-oss.exe" $Out
$assets = 'app\assets\windows\x64'
foreach ($f in 'conpty.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll', 'dxcompiler.dll', 'dxil.dll') {
    Copy-Item "$assets\$f" $Out
}
New-Item -ItemType Directory -Force -Path "$Out\x64" | Out-Null
Copy-Item "$assets\OpenConsole.exe" "$Out\x64"
Copy-Item 'app\assets\bundled\bootstrap\pwsh.ps1' $Out
foreach ($f in 'LICENSE-AGPL', 'LICENSE-MIT', 'app\assets\windows\LICENSE-WINDOWS-TERMINAL', 'app\assets\windows\LICENSE-DXC') {
    Copy-Item $f $Out
}

@"
# Warp (open-source build)

Built by Orkestri from warpdotdev/warp's AGPL source; not made or endorsed by Warp.

- Source: https://github.com/warpdotdev/warp/tree/$Commit (the client is AGPL-3.0, its UI crates
  ``warpui_core`` and ``warpui`` MIT: ``LICENSE-AGPL``, ``LICENSE-MIT``). The same source, as built, is attached to
  this release as ``warp-oss-source-*.tar.gz``.
- Build script: $BuildScript (channel ``oss``, profile ``rlto`` without debug info, Windows x64).
- Modified (``tools/warp/patch.ps1`` beside the build script, applied before the build), so several copies can run
  side by side with separate data: ``WARP_DATA_PROFILE`` is read in release builds too (upstream: debug builds only),
  the single-instance lock and pipe are named after it, and ``WARP_DATA_ROOT``, when set, holds Warp's data, config,
  state and cache folders and its private preferences (a file instead of the registry), and Warp then does not
  register itself to start at login nor as the handler of ``warposs://`` links. Nothing else is changed.
- Third-party licences: ``resources/THIRD_PARTY_LICENSES.txt``, ``LICENSE-WINDOWS-TERMINAL`` (ConPTY, OpenConsole),
  ``LICENSE-DXC`` (DirectX Shader Compiler).
- The oss channel has no telemetry, crash reporting or auto-update. Sign-in, Warp Drive and hosted AI use Warp's
  own servers.
"@ | Set-Content -Encoding utf8 -LiteralPath "$Out\SOURCE.md"
Write-Output "built: $Out"
