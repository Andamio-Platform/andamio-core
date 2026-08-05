# Residual Review Findings — feat/canonical-v1-commitment-hash

Source: ce-code-review run `20260805-052411-dd27cf62` (LFG pipeline, 2026-08-05), reviewing the canonical-v1 commitment-hash branch against `main` (base `7a104b1`). Verdict: Ready with fixes. Findings #1 and #3 were applied and committed on this branch (`fix(review): apply review findings`); the item below is the remaining actionable residual.

## Residual Review Findings

- **P3** `src/utils/hashing/commitment-hash.ts:120` — **textEncoder const orphans computeCommitmentHash's JSDoc** (correctness, confidence 75; validator-confirmed via tsc declaration emit). The shared-encoder `const textEncoder = new TextEncoder();` sits between the canonical function's JSDoc block and its declaration, so the docblock attaches to the const and the generated `.d.ts` exports `computeCommitmentHash` without its documentation — package consumers lose the flagship API's hover docs. Suggested fix: move the const above the JSDoc block (directly after the blakejs import). Not auto-applied: single-reviewer anchor-75 finding, below the pipeline's apply bar. No tracker ticket was filed: the repo's tracker is GitHub Issues, but standing user policy prohibits unsolicited issue creation, so this committed record is the durable sink.

No `settled_conflict`-stamped findings were emitted by the review, and implementation reported no settled-decision conflicts.
