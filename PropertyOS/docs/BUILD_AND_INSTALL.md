# Build and install PropertyOS independently

## What is actually provided

The release contains editable source, an npm lockfile, a tested `dist/` web/PWA
build, Tauri 2 Rust source/configuration, installer icons and build scripts.
**There is no compiled `.app`, DMG, MSI, EXE, APK or IPA in this package.**
The delivery host is Linux with no Rust compiler; native compilation and native
storage/export integration remain unverified. Do not treat source packaging as
successful native installation.

The Tauri project uses the same local SQLite engine, encrypted snapshot format
and React application as the tested browser build. Rust only manages local files.
No hosted server/database is needed after a desktop build is installed.

## Build-machine setup

Install Node.js 22+ (24 was used for this build), npm, stable Rust via rustup,
and the tools for your target OS. Dependency installation is an initial online
build step, not a runtime internet requirement.

```sh
npm ci
npm test
npm run build
```

Before your first native release, resolve and commit the Rust lockfile:

```sh
cd src-tauri
cargo generate-lockfile
cargo test
cd ..
```

Do not invent a Cargo.lock or use `--locked` until an actual native toolchain has
resolved it. Review the resolved dependencies and commit it with the source.

## macOS (Apple Silicon or Intel)

Install Xcode Command Line Tools (`xcode-select --install`) and stable Rust.
For mobile iOS development install full Xcode, not only command-line tools.
Then, from the project root:

```sh
npm run desktop:build
```

Tauri creates the `.app` and DMG below `src-tauri/target/release/bundle/`.
Open the DMG, drag PropertyOS into Applications and launch it normally.

For explicit architecture builds, install that Rust target then use:

```sh
rustup target add aarch64-apple-darwin
npm run desktop:build -- --target aarch64-apple-darwin
# or x86_64-apple-darwin for Intel
```

Unsigned personal builds may be blocked by macOS Gatekeeper. After verifying
that you built the source yourself, use Finder's Open action/System Settings
Privacy & Security approval for that app. Public distribution should use your
own Developer ID certificate and Apple notarization. No certificates or account
credentials are included. Keep signing secrets outside version control.

## Windows

Install Rust's MSVC toolchain and Visual Studio Build Tools with Desktop
development with C++ and the Windows SDK. On the Windows build machine:

```powershell
npm ci
npm test
npm run desktop:build
```

NSIS setup EXE and/or MSI outputs appear under
`src-tauri/target/release/bundle/`. Install and launch from the Start menu.
The configuration requests an offline WebView2 installer, making the first
installation independent of downloading WebView2 on the end-user machine.
The build machine downloads the runtime during packaging. Native QA must
confirm bundle size/install behavior and both installer targets.

Windows code signing is optional for private use but useful for distribution.
SmartScreen can warn about unsigned installers. The owner supplies any signing
certificate; no vendor-controlled license check is present.

## Local desktop storage

Tauri's `app_data_dir` uses the identifier `com.propertyos.private`:

- Mac: usually `~/Library/Application Support/com.propertyos.private/`.
- Windows: usually `%APPDATA%\com.propertyos.private\`.

The framework resolves the directory; do not hardcode paths in application code.
Files: `workspace.posvault`, `recovery.posvault`, `pre-restore.posvault`,
`workspace.lock`, and dated encrypted `backups/*.posvault`. All contents are local.
The exact directory and atomic replacement/export permissions must be confirmed
in the native smoke tests before production deployment.

## PWA installation or private static hosting

Serve `dist/` on HTTPS or localhost. It is plain static content and needs no
API, remote database or authentication service. A static host can provide initial
asset installation. Local mode keeps records in each browser/device. Optional
cloud mode uses the Supabase adapter; follow DEPLOY_GITHUB_VERCEL.md. Native
Tauri CSP remains local-only, so use local mode in the retained native shell.

On supported desktop browsers, use Install application. On iPhone/iPad Safari,
open the HTTPS address then Share → Add to Home Screen. Android Chrome provides
an Install/Add to Home Screen action. Once the cache is installed, the app works
offline. Storage durability and device export/picker behavior must still be
validated on physical iOS/Android devices; no such QA has been completed here.

The code does not publish anything automatically. Upload only static `dist/`
assets to your chosen private host. Never upload encrypted backups or exports
as website assets. Different origins/profiles/installations have independent data.

## Android native (source preparation only)

Install Android Studio, its SDK/NDK, a suitable JDK and Tauri Android prerequisites.
Generate the native project with the included Tauri mobile entry point:

```sh
npx tauri android init
npm run mobile:android
npx tauri android build
```

Test local data, encryption, background/resume and especially file dialogs,
backup import/export, PDF saving and printing on a device. The shared export
path currently calls the dialog save plugin, whose mobile behavior needs a
platform-specific file/share implementation if unsupported. Production Android
signing requires the owner's keystore. Native Android is not a tested deliverable.

## iOS native (source preparation only)

On a Mac install full Xcode, Rust iOS targets and Tauri iOS prerequisites:

```sh
npx tauri ios init
npm run mobile:ios
npx tauri ios build
```

Simulator builds differ from physical-device builds. A physical app needs
appropriate Apple provisioning/signing. Use your own Apple account/team.
Mobile document saving, biometric/key lifecycle, device transfer and resume
behavior still require implementation/QA; no IPA is included.

## Build automation

`.github/workflows/desktop.yml` runs on manually triggered workflows or version
tags. It builds Mac ARM64, Mac Intel, and Windows x64 packages and uploads build
artifacts. It does not publish public releases or deploy a service. Place this
source in your own private repository to use it. Actions availability/costs belong
to your hosting account; local builds remain possible independently.

## Platform documentation

Primary references consulted for platform setup and packaging:

- https://v2.tauri.app/start/prerequisites/
- https://v2.tauri.app/distribute/
- https://v2.tauri.app/distribute/windows-installer/
- https://v2.tauri.app/distribute/pipelines/github/
- https://v2.tauri.app/plugin/dialog/
- https://v2.tauri.app/plugin/file-system/
- https://vite.dev/guide/build

Platform requirements change; consult those official instructions when building.
