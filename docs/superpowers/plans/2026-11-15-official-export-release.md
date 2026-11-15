# Official export repair and release

User authorizes repairing reviewed blockers, enabling official export, testing and publishing when passed. Preserve incoming DeepSeek work; use existing dependencies. No remote1688 access through tools due to prior site restriction. Source and isolated fixtures only; do not claim independent live-site acceptance.

## Design / rulings
- Keep full official report then local selected-month filtering; status/audit explicitly distinguish local import from independently verified platform completeness.
- Cancel/guard before each driver operation and real input; account + lease checks immediately before generation and download; AbortSignal interrupts waits and download.
- Snapshot visible records before generation, close records dialog through confirmed DOM controls, compare new timestamp identities, reject old/duplicate/ambiguous records. Persist baseline before the click; pre-click pause remains prepared and resumable, while genuinely unknown submissions require manual confirmation and never auto-adopt later records. Timestamp alone is not absolute ownership; ambiguity must stop.
- Reuse visible CAPTCHA detection including shadow DOM and iframe URL signals during all phases.
- A valid report containing zero selected orders is a successful local import, not an endless error.
- Enable normal application by default; explicit emergency env disable remains possible and covered.

## Tasks
1. Driver: failing tests for stale/ambiguous records, cancel before generation, mid-poll verification, real injected DOM extraction. Implement guarded adapter, identity delta and cancellation. Owned files page.ts and driver tests.
2. Collector/orchestration/report: add guards, safe checkpoint transitions/recovery, signal/download cancellation, zero-result import and audit; test real isolated IPC fixtures. Owned collector.ts, export.ts, report.ts and backend tests.
3. Root: default-on gate/UI wording, tests, version/CI/release metadata. Independent review, all unit/build and applicable Electron smokes. No real data/credentials/artifacts committed.
4. Push source, verify Gitee synchronization and refs, wait GitHub Windows build; download installer, validate manifest/hash and packaged isolated functional smoke. Create/publish verified release only after checks. Report limits plainly.

## Verification
Targeted RED/GREEN tests, npm run check, official driver DOM/IPC smoke, default-enabled and explicit-disabled gate, selected-month zero and nonzero imports, account/stop/captcha/download routing, existing parallel platform/update smokes. Tests avoid real platform network.
