# Online updates implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Complete NSIS software-internal download, verification, installation and restart with a domestic source option.
**Architecture:** electron-updater owns full-installer transport, SHA-512 verification and NSIS execution; a small coordinator owns state and busy protection. Vue renders coordinator state through the existing restricted IPC bridge. User chose free GitHub direct and explicitly disabled differential download.
**Tech Stack:** Electron 44, Vue 3, electron-builder 26.15.3, electron-updater 6.8.11, Vitest, Playwright.
**Spec:** ../specs/2026-11-14-in-app-updates-design.md

## Global Constraints

- Preserve original checkout, credentials, accounts and orders; use isolated test data and installation path.
- Do not host large binaries on the 3 Mbps server. No paid storage provisioning without answer.
- No automatic installation on ordinary app exit; install requires explicit user action and an idle application.
- GitHub branch push and Gitee hash verification required. Public Release publication is a separate final action.

## Review Focus

- Offline startup must not claim newest version.
- Cancel and repeated clicks must not race or install a partial file.
- Full download must be enforced in both build and runtime configuration.
- New business operations must not start after install begins.
- Publication must not expose a manifest before its binaries exist.

### Task 1: Update coordinator

Files: src/main/updater.ts, src/shared/types.ts, src/shared/config.ts, package.json/package-lock.json, tests/updater.test.ts.
Interfaces: UpdateState snapshot; UpdateController.check/download/cancel/install; dependency-injected updater adapter for tests, busy predicate and state callback.
- [ ] Write and run failing tests for check outcomes, events/progress, cancel/retry, duplicates, source identity, and busy install protection.
- [ ] Add exact compatible dependency and implement controller using library mechanisms.
- [ ] Run targeted tests; then full suite.

### Task 2: Main/IPC and update UI

Files: src/main/index.ts, src/preload/index.ts, src/shared/types.ts, src/renderer/src/App.vue, new UpdatePanel.vue, tests/update-ui-smoke.mjs.
Interfaces: state.update: UpdateState; checkUpdate/downloadUpdate/cancelUpdate/installUpdate IPC; update event refresh; idle guard includes installing.
- [ ] Add isolated UI smoke asserting unsupported dev and state-specific controls through real preload/IPC.
- [ ] Integrate controller and independent startup check; guard new business operations and install race.
- [ ] Add scoped accessible progress/actions UI matching existing styles; UX then UI specialist review precedes development.
- [ ] Run build, unit tests and real Electron smoke.

### Task 3: Release assets and domestic source delivery

Files: package.json build.publish, .github/workflows/build.yml and publish-release.yml, scripts/verify-update-assets.mjs, scripts/sync-update-source.mjs, docs/online-updates.md.
Interfaces: full installer + latest.yml, exact manifest verification; fixed official GitHub provider.
- [x] Add failing asset-verification tests covering wrong hashes and incomplete manifests; user change to no blockmap also verified RED→GREEN.
- [x] Configure GitHub build feed and upload complete update assets; require verified manifest before public publication.
- [x] Honor user's free direct preference: no paid domestic deployment; document actual activation status.
- [ ] Push code, inspect GitHub checks and Gitee matching hashes; download build and verify packaged NSIS updater. Prepare concrete final publication action if pending.
