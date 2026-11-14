# Platform Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Allow independent platforms to collect concurrently while retaining per-platform task and response ownership.
**Architecture:** Per-platform generation leases, scoped IPC guards, isolated sessions/views, and selection-safe Vue updates. No new dependency.
**Tech Stack:** Existing Electron/Vue/SQLite/TypeScript/Vitest/isolated Electron fixtures.
**Spec:** docs/superpowers/specs/2026-11-15-platform-concurrency.md

## Verification record
- Backend, UI and integrated independent reviews completed. The auxiliary-startup admission race found in final review was fixed and reproduced by the real IPC fixture before/after rebuilding.
- Full suite: 217 Vitest tests plus 8 update-asset tests passed; production build passed.
- Isolated main IPC fixture passed overlapping collectors, account isolation, same-platform rejection, clear-confirmation recheck, export/collection overlap and proxy-startup admission.
- Isolated UI fixture passed platform switching, background verification, drain guards, stale responses and export snapshots.
- Existing plan UI, primary resume, five-platform details, collection activity and official-mode preparation smoke tests passed.
- Normal local source app loaded only after verifying no running task, with a local database backup. Real business collections were not started by the agent.

## Constraints
- Same platform single task including stopping/drain; preserve per-platform request pacing and existing data.
- Background captcha pauses only its task and never solves verification or steals focus.
- Global update lock and single export writer remain; one auxiliary proxy platform alongside browser platforms.
- Official mode2 remains unavailable. No real website/app/data manipulation for tests.

## Review Focus
- Stale responses after pause/resume (same task ID with new generation).
- Cross-platform account lookup and capture/stagnation counters.
- Concurrent ensure/show initialization, hidden background views and same-platform navigation.
- Clear confirmation races; proxy rebind and delayed body routing.
- Late UI state/orders/action responses and long export UI locks.

### Task1: Per-platform backend ownership
Files: src/main/collector.ts, src/main/index.ts, src/main/proxy.ts, src/shared/types.ts, optional focused run-registry module; new concurrency/capture/proxy tests and isolated integration fixture.
- [ ] Write failing tests for overlapping A/B, same-platform rejection and independent pause/verification.
- [ ] Replace globalactive/counters with scoped leases; explicit account and asynchronous response ownership.
- [ ] Split scoped IPC versus global maintenance; preserve proxy and export constraints, guard clearing both before and after confirmation.
- [ ] Prove stale generation/async body cannot write into another run, initialization dedup and per-platform mode protection.
- [ ] Verify targeted tests and build; independent code review/fix.

### Task2: Platform UI isolation
Files: src/renderer/src/App.vue, src/renderer/src/style.css, optional focused runtime helper; new isolated concurrency UI smoke.
- [ ] Platform-local operation controls and safe switching; separate exportBusy.
- [ ] Sidebar state badges within184px, no automatic focus/navigation on background validation.
- [ ] Selection generations guard refresh/orders/action results; preserve independent time/history/mode state.
- [ ] Fixture tests overlap, verify late result rejection and same-platform drain UI.
- [ ] Verify targeted tests/build; independent review/fix.

### Task3: Integration and delivery
- [ ] Full npm run check and meaningful source Electron concurrency/regression fixtures.
- [ ] Broad independent review, resolve material findings.
- [ ] Push source; Sync to Gitee success and all branch/tag hashes match.
- [ ] Verify cloud build/artifact as available, report any limitations.
- [ ] Back up local data and load normal source app only while idle; do not start real collections or interrupt user tasks.
