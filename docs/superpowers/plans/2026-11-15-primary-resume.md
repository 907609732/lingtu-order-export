# Primary Collection Resume Implementation Plan

> **For agentic workers:** Use subagent-driven-development for implementation and review.

**Goal:** Let the second numbered action resume an interrupted collection instead of creating a new task.

**Architecture:** Reuse desk.resume and existing persisted task/bucket cursors. Keep the same task ID, order records, completed buckets and operation, without changing collector routing or retry semantics.

**Tech Stack:** Existing Vue 3, TypeScript, Electron and Playwright.

**Spec:** User reported a real 1688 TIMEOUT after 104 orders and 8/12 completed segments, and requested checkpoint continuation through the existing start button.

## Rules

- Unfinished paused, login-required, failed or partial tasks with the same confirmed time selection use ② 继续采集 and desk.resume(taskId). Interrupted manual details retain operation=details.
- Completed collection retains the user's existing ② 重置采集 label; no task/cache-cleared state uses ② 开始采集. Running state is disabled and may read ② 采集中….
- A changed confirmed time selection starts a new task, with a visible note that the original task progress is retained; it must not silently resume the old time range.
- Remove duplicate secondary continue/retry controls. Keep pause/finish controls and clear status guidance.
- Do not call retry, reset cursor, clear orders or create a new task when resuming.
- Do not start a real collection for tests. Verify the reported task/checkpoint read-only and preserve its 104 orders and 8 completed segments during UI refresh.

## Work

- [x] Add a failing isolated UI regression for the primary resume action.
- [x] Implement primary action selection and status guidance using the existing resume API.
- [x] Verify simulated 1688 page failure/resume uses the same task ID, skips completed months, resumes the saved page and deduplicates already stored orders; include process restart persistence and details continuation.
- [ ] Run build, relevant tests and review; push, verify GitHub/Gitee refs and run the Windows artifact locally.
