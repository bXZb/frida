# v1.9.32
- WebUI rebuilt in Vue 3 (Targets / Gadget tabs); dist is generated at assemble time
- Default gadget config uses `on_load: resume` so injection does not ANR waiting for a client
- Gadget is no longer bundled or unpacked on install; install your own `.so` via WebUI or `cp`
- WebUI: scan/install/remove gadget binary; optional clear of `injected_libraries`
- Fresh installs and WebUI start with an empty target list (demo `com.example.package` removed)
- Stopped auto-bump of a bundled Frida version

# v1.9.20
- Fixed WebUI-saved config file permissions so the target app can read them (thanks @limbang, #7)

# v1.9.4
- Frida gadget updated to 17.9.1
- Switched to own patched Frida fork
- Added auto-update workflow

# v1.9.3
- Auto-update support via KernelSU/Magisk Manager
- Updated docs to match current config schema
- Fixed child gating modes in WebUI
- Default gadget config set to listen mode

# v1.9.2
- Rebranded to KsuFrida
- Removed Riru support (Zygisk only)
- Rewrote WebUI with dark theme
- Fixed ksu.exec callback mechanism
- Added kernel_assisted_evasion toggle
- Added app labels in WebUI target list
- Fixed cpplint errors
