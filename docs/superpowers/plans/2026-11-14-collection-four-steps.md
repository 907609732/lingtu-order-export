# Collection Four Steps Implementation Plan

> **For agentic workers:** Use subagent-driven-development for implementation and review.

**Goal:** Consolidate collection time and plan controls into the user's four numbered actions.

**Architecture:** Reuse the existing Vue/Element Plus date dialog, dateSegments, desk.start and desk.clear. Keep collection and storage behavior unchanged; the dialog confirms a local selection and the second action creates the task.

**Tech Stack:** Existing Vue 3, TypeScript, Element Plus, Electron and Playwright.

**Spec:** User's current request: ①选择采集时间 → ②开始采集 → ③提取订单详情 → ④导出文件; after list completion show ②重置采集; successful platform cache clearing restores ②开始采集.

## Global Constraints

- Preserve all historical task data and exports when starting a new collection.
- Keep all twelve month choices and daily selection for the five plan platforms; proxy platforms use a continuous date range.
- Confirming time must not call desk.start; cancelling must preserve the confirmed selection.
- Complete means listOutcome=complete or legacy status=completed, including partial tasks with missing details; running work cannot restart.
- Rehydrate selections from historical tasks, isolate platform selections and retain pause/resume behavior.

## Review Focus

- Nonconsecutive selected months survive dialog reopen, task reload and reset.
- Cancelled cache clearing preserves task/selection; successful clearing restores the initial start state.
- Time summaries must distinguish a new selection from the displayed task progress.
- No duplicate progress entry or inline date fields remain in the main toolbar.
- Small windows keep the four actions visible without horizontal overflow.

## Task 1: Implement and verify the complete workflow

**Files:** App.vue, ExtractionPlan.vue, style.css, affected UI smoke tests and the Windows build workflow.

- [x] Extend the existing plan UI smoke with confirm-without-start, numbered controls, completion/reset and cache-clear assertions; run a failing test.
- [x] Turn the dialog into a time selector with a confirm event and independent draft, preserving selected segments on reopen.
- [x] Add a confirmed selection to App, restore it from tasks, and move task creation to step two; retain inline progress as status with expandable segments.
- [x] Remove duplicate date controls and update the in-app guide, labels and affected test selectors.
- [x] Verify npm test, npm run build, targeted plan/execution smoke and 1120x740 screenshots. Add the isolated collection smoke to Windows CI.
- [ ] Review the diff, publish only relevant code to GitHub, verify Windows CI and Sync to Gitee, report any unsynchronized side.
