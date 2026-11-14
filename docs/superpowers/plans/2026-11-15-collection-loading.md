# Collection Loading Implementation Plan

> **For agentic workers:** Use subagent-driven-development for implementation and review.

**Goal:** Make active collection unmistakable with a prominent loading card above the order table.

**Architecture:** Reuse the installed Element Plus Loading icon and existing Task state. Add an optional display-only activityPhase from the collector's existing stage events, without changing operation or collection routing. Keep authentication, order storage, four-step actions and existing progress details unchanged.

**Tech Stack:** Existing Vue 3, TypeScript, Element Plus icons and Playwright.

**Spec:** The user requested more obvious collection progress, preferably a loading indicator. Planning, interaction and UI reviews selected a nonblocking blue activity card outside the optional execution log.

## Constraints

- Spin only for the selected task's running state, including separate list/details titles.
- Show the real task message and counts. For list plans show actual completed segments; details must not reuse list completion as their own progress. Do not invent order percentages or completion times.
- Paused, login-required and failed states stop animation and show clear recovery status. Incomplete partial tasks may show a static message; completed tasks remove the loading card.
- Keep pause/resume and table interaction accessible, with the card visible even when execution logs are disabled.
- Respect reduced motion and 1120x740 layout; include the card in the table's workspace height allowance.
- Use isolated synthetic data for automated scenarios; do not start or interrupt a real collection for testing.

## Implementation

- [x] Extend existing execution/plan smoke tests to fail on missing loading, and cover waiting, pause, resume, login/error, completion and log-hidden behavior.
- [x] Add a small CollectionActivity Vue component and integrate it above results, reusing installed icons and task state.
- [x] Verify list/details activity and real segment counts, reduced motion and small-window screenshots; run build and relevant tests. Verify automatic Pinduoduo details keep the original operation while recording their display phase.
- [ ] Review, push code, verify GitHub/Gitee synchronization and Windows build, run the downloaded artifact locally.
