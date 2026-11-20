# The changes Orkestri makes to Warp's code (a checkout of warpdotdev/warp, run from its root), so each Orkestri card
# runs its own Warp with its settings and data in the card's folder; called by build.ps1:
# 1. WARP_DATA_PROFILE is read in release builds too (upstream reads it only in debug builds);
# 2. the single-instance lock and pipe are named after it too (upstream: one Warp per channel, a second start hands
#    its arguments to the first and quits);
# 3. WARP_DATA_ROOT, when set, holds every folder Warp keeps (data, config with settings.toml, state, cache, its
#    home config) instead of the person's AppData and home;
# 4. with WARP_DATA_ROOT set, Warp keeps its private preferences in a file there (user_preferences.json, as on Linux)
#    instead of the registry (HKCU\Software\Warp.dev\WarpOss), and does not register itself to start at login nor
#    as the handler of warposs:// links (both are HKCU registry entries pointing at the card's copy).
# Each change must match exactly once, or the script stops: a new upstream commit is checked, not patched blindly.
$ErrorActionPreference = 'Stop'
function Edit-Source([string]$File, [string]$Pattern, [string]$Replacement) {
    $text = Get-Content -Raw -LiteralPath $File
    if ([regex]::Matches($text, $Pattern).Count -ne 1) { throw "$File changed upstream: '$Pattern' does not match once" }
    Set-Content -NoNewline -LiteralPath $File -Value ([regex]::Replace($text, $Pattern, $Replacement))
}
Edit-Source 'crates\warp_core\src\channel\state.rs' 'if cfg!\(debug_assertions\) \{(\r?\n\s+std::env::var\("WARP_DATA_PROFILE"\)\.ok\(\))' 'if true {$1'
$single = 'app\src\app_services\windows\single_instance_manager.rs'
$byProfile = 'ChannelState::data_profile().unwrap_or_default()'
Edit-Source $single 'format!\("Warp\{:\?\}_URI_CHANNEL", ChannelState::channel\(\)\)' "format!(`"Warp{:?}{}_URI_CHANNEL`", ChannelState::channel(), $byProfile)"
Edit-Source $single 'format!\("Local\\\\Warp\{:\?\}_SingleInstance", ChannelState::channel\(\)\)' "format!(`"Local\\Warp{:?}{}_SingleInstance`", ChannelState::channel(), $byProfile)"
$paths = 'crates\warp_core\src\paths.rs'
$root = 'std::env::var_os("WARP_DATA_ROOT").map(std::path::PathBuf::from)'
foreach ($f in @(
        @('data_dir', 'PathBuf', 'data'), @('config_local_dir', 'PathBuf', 'config'), @('state_dir', 'PathBuf', 'state'),
        @('cache_dir', 'PathBuf', 'cache'), @('gui_config_local_dir', 'Option<PathBuf>', 'config'),
        @('warp_home_config_dir', 'Option<PathBuf>', 'home'))) {
    $name, $type, $sub = $f
    $value = if ($type -eq 'PathBuf') { 'root.join("' + $sub + '")' } else { 'Some(root.join("' + $sub + '"))' }
    $guard = '    if let Some(root) = ' + $root + " {`n        return $value;`n    }`n"
    Edit-Source $paths ('(pub fn ' + $name + '\(\) -> ' + [regex]::Escape($type) + ' \{\r?\n)') ('$1' + $guard)
}
$inCard = 'std::env::var_os("WARP_DATA_ROOT").is_some()'
$skip = "    if $inCard {`n        return;`n    }`n"
Edit-Source 'app\src\login_item\windows.rs' '(pub\(super\) fn maybe_register_app_as_login_item\(ctx: &mut AppContext\) \{\r?\n)' ('$1' + $skip)
Edit-Source 'app\src\app_services\windows\registry.rs' '(pub\(super\) fn register_uri_handler\(\) \{\r?\n)' ('$1' + $skip)
$file = "            if $inCard {`n                if let Ok(prefs) = user_preferences::file_backed::FileBackedUserPreferences::new(super::user_preferences_file_path()) {`n                    return Box::new(prefs) as user_preferences::Model;`n                }`n            }`n"
Edit-Source 'app\src\settings\init.rs' '(\} else if #\[cfg\(target_os = "windows"\)\] \{\r?\n)(\s+let app_id = warp_core::channel::ChannelState::app_id\(\);\r?\n\s+Box::new\(user_preferences::registry_backed)' ('$1' + $file + '$2')
Write-Output 'patched'
