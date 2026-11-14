# 1688 Official Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a separate automatic official-page export/download/import mode for 1688.
**Architecture:** Mode-specific persisted tasks and page driver, using official DOM controls and Electron download events rather than collection APIs or Network debugger. Reuse existing Store/ExcelJS and month selection. Preserve ordinary collection.
**Tech Stack:** Electron44, Vue3, TypeScript, ExcelJS4.4.0(MIT), Vitest/Playwright isolated test data.
**Spec:** docs/superpowers/specs/2026-11-15-alibaba-official-export.md

## Global Constraints
- Preserve all real orders and current user-run Xianyu task. Do not restart the running app or switch its platform during collection.
- Mode2 must not use debugger.attach, CDP response capture, or direct internal collection/export APIs.
- CAPTCHA/login is a paused human step. Unknown controls/report format stop with actionable message.
- Never claim complete scope without verified official total/range. No real data in git/tests.

## Review Focus
- Current-page-only export versus full search range, stale export record versus this task.
- Multi-product order rows with repeated order totals; unsafe numeric order IDs.
- Gapped month choices, account change, unparseable dates and conflicting fields.
- Interrupted submit/download/import must not duplicate exports or falsely complete.
- Switching modes must preserve independent histories and old tasks default ordinary.

### Task1: Official report parser and persisted mode
Files: src/shared/types.ts, src/core/store.ts, src/core/primary-collection-action.ts, new src/main/alibaba-official-report.ts, tests/alibaba-official-report.test.ts.
- [ ] Write and fail tests for full report import, aggregation, dates/amounts/ID precision, missing/invalid/conflicting fields, filters, old tasks/mode matching.
- [ ] Implement minimal parser returning orders plus audit summary and original columns; preserve unknown fields and flag unsupported formats.
- [ ] Add mode/task/checkpoint types and backward-compatible storage validation; run tests.

### Task2: Official page workflow and safe download
Files: new src/main/alibaba-official-page.ts, new src/main/alibaba-official-export.ts, src/main/collector.ts, src/main/index.ts, src/preload/index.ts, targeted unit and Electron fixture tests.
- [ ] Write fixture tests verifying visible search/export controls are invoked, no direct API/CDP capture, unknown scope blocks, verification pauses, download correlation/resume/account isolation.
- [ ] Separate normal official page from collection capture; handle transition from existing captured view without losing cookies or real task data.
- [ ] Implement sequential selected-range DOM workflow and Electron download listener, persistent bounded local files/checkpoints, audit import.
- [ ] Run tests without real requests. Real site selectors/header/date semantics require independent observed evidence; mark any unresolved live limitation.

### Task3: Mode UI and audit feedback
Files: src/renderer/src/App.vue, CollectionActivity.vue, stylesheet, optional focused audit component, mode UI smoke.
- [ ] Mode switch after1688heading; runtime disable, per-mode task history/restoration, step labels and automatic audit detail.
- [ ] Real stage progress, verification call to action, audit summary with explicit unverified completeness, no automatic per-order supplementation.
- [ ] Test legacy ordinary mode plus official task resume, changed range, mode switch, audit warnings and downloads in isolated data.

### Task4: Verify and deliver
- [ ] npm run check plus relevant Electron smoke; specialist review and address findings.
- [ ] Push only source/design/tests, verify GitHub Build and Sync to Gitee hashes.
- [ ] Run downloaded cloud artifact with isolated profile; switch real app only when user task is idle and preserve original records.
- [ ] State actual live official export acceptance and limitations honestly.
