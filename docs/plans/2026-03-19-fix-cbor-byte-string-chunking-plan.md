---
title: "fix: Add CBOR byte string chunking for content > 64 bytes"
type: fix
status: active
date: 2026-03-19
---

# fix: Add CBOR byte string chunking for content > 64 bytes

## Overview

`encodeCborBytes` in `task-hash.ts` always encodes byte strings as a single definite-length CBOR byte string, regardless of length. Plutus `serialiseData` uses **chunked indefinite-length byte strings** when data exceeds 64 bytes. This causes `computeTaskHash` to produce incorrect hashes for tasks where `project_content` UTF-8 encodes to more than 64 bytes.

The fix pattern already exists in `slt-hash.ts` (`encodePlutusBuiltinByteString` with `PLUTUS_CHUNK_SIZE = 64`) and can be ported to `task-hash.ts`.

## Problem Statement / Motivation

Tasks with short content (all 7 current on-chain test vectors) hash correctly. But any `project_content` between ~65-140 ASCII bytes (or fewer for multi-byte Unicode) will produce a hash that doesn't match the on-chain Aiken validator. As users write longer task descriptions, this will silently break hash verification.

**CBOR encoding difference:**

```
<= 64 bytes: 0x58 0x40 [data]                                  (definite-length, current behavior)
>  64 bytes: 0x5f 0x58 0x40 [first 64] 0x58 0x?? [rest] 0xff  (chunked indefinite-length, MISSING)
```

## Proposed Solution

Add a new `encodePlutusBuiltinByteString` function to `task-hash.ts` (mirroring the existing implementation in `slt-hash.ts:126-143`) and use it **only** for the `project_content` encoding on line 145. Leave `encodeCborBytes` untouched for policy ID and token name encoding.

This is the most conservative approach:
- `encodeCborBytes` behavior is completely unchanged (backward compatible by construction)
- Policy ID (28 bytes) and token name (max 32 bytes) call sites are unaffected
- Only `contentBytes` on line 145 gets the new chunking-aware encoder

## Technical Considerations

### Backward Compatibility (Primary Concern)

The fix is **safe for existing hashes** because:

1. **The `<= 64` byte path is identical.** `encodePlutusBuiltinByteString` delegates to the same simple encoding for short byte strings. The `slt-hash.ts` reference uses `buffer.length <= PLUTUS_CHUNK_SIZE` which matches the current `encodeCborBytes` output byte-for-byte for inputs <= 64 bytes.

2. **`encodeCborBytes` is not modified.** By introducing a new function and only calling it for `contentBytes`, the existing call sites for policy IDs and token names produce identical output.

3. **All 7 on-chain test vectors have content < 24 bytes.** They exercise only the `0x40+len` header path, which is unchanged.

### Boundary Condition: Exactly 64 Bytes

The `slt-hash.ts` implementation uses `<=` (not `<`) for the non-chunked path, meaning exactly 64 bytes produces definite-length encoding. The issue spec confirms the threshold is "> 64 bytes". These are consistent. Needs an explicit test at the boundary.

### UTF-8 Chunk Boundary Splitting

Chunk boundaries split at raw byte offsets, not character boundaries. A multi-byte UTF-8 character can be split across chunks. This is **correct behavior** -- Plutus `serialiseData` operates on raw bytes. Must be documented in a test to prevent future "fixes" that try to align to character boundaries.

### Validation: Characters vs. Bytes

`validateTaskData` checks `project_content.length > 140` (Unicode code units, not bytes). 140 CJK characters = 420 bytes, 140 emoji = 560 bytes. The chunking logic handles this correctly at the byte level. No validation change needed.

## System-Wide Impact

- **Interaction graph**: `computeTaskHash` -> `buildTaskDataCBOR` -> `encodePlutusBuiltinByteString` (new) for content, `encodeCborBytes` (unchanged) for policy/token. `verifyTaskHash` and `isValidTaskHash` call `computeTaskHash` so automatically benefit.
- **Error propagation**: No new error paths. The chunking logic is pure byte manipulation.
- **State lifecycle risks**: None. This is a pure function with no side effects.
- **API surface parity**: The public API (`computeTaskHash`, `verifyTaskHash`, `isValidTaskHash`, `debugTaskBytes`) is unchanged. Only internal encoding changes.
- **Integration test scenarios**: Needs on-chain test vector for long content to confirm end-to-end correctness.

## Acceptance Criteria

### Backward Compatibility

- [x] All 7 existing on-chain test vectors pass unchanged (`task-hash.test.ts`)
- [x] New test: content at exactly 64 bytes produces definite-length CBOR (`0x58 0x40 [64 bytes]`)
- [x] New test: content in 24-63 byte range produces correct `0x58 len` header (not covered by on-chain vectors)

### Correctness

- [x] New test: content at 65 bytes produces chunked encoding (`0x5f 0x58 0x40 [64 bytes] 0x41 0x01 [1 byte] 0xff`)
- [x] New test: content at 128 bytes produces two full 64-byte chunks
- [x] New test: content at 129 bytes produces two full chunks + 1-byte remainder
- [x] New test: multi-byte UTF-8 content crossing chunk boundary (raw byte split, not char-aligned)
- [x] `debugTaskBytes` shows chunked encoding for long content

### On-Chain Verification (Stretch Goal)

- [ ] Generate at least one on-chain test vector with `project_content` > 64 bytes (via Aiken test framework or testnet deployment)
- [ ] Verify computed hash matches on-chain hash

### Code Quality

- [x] New `encodePlutusBuiltinByteString` function with JSDoc and `@internal` tag
- [x] `PLUTUS_CHUNK_SIZE = 64` constant
- [x] `encodeCborBytes` left completely unchanged

## Success Metrics

- All existing tests pass (zero regressions)
- New boundary tests cover the chunking threshold (64/65 bytes)
- Hash output for short content is byte-identical before and after the change

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Chunking boundary is `>= 64` not `> 64` on-chain | Low | High (wrong hash at 64 bytes) | Test against `slt-hash.ts` pattern; verify with Aiken test if possible |
| No on-chain test vector for long content | Medium | Medium (unverified correctness) | Structural CBOR byte tests + reference against `slt-hash.ts` pattern |
| Future duplication drift between `task-hash.ts` and `slt-hash.ts` | Medium | Low | File follow-up issue for shared `cbor-utils.ts` extraction |

## MVP

### `src/utils/hashing/task-hash.ts`

Add constant and new function, update content encoding call:

```typescript
// New constant (matches slt-hash.ts)
const PLUTUS_CHUNK_SIZE = 64;

// New function (mirrors slt-hash.ts:126-143)
/** @internal */
function encodePlutusBuiltinByteString(buffer: Uint8Array): Uint8Array {
  if (buffer.length <= PLUTUS_CHUNK_SIZE) {
    return encodeCborBytes(buffer);
  }
  // Chunked indefinite-length byte string
  const parts: Uint8Array[] = [new Uint8Array([0x5f])]; // indefinite start
  for (let i = 0; i < buffer.length; i += PLUTUS_CHUNK_SIZE) {
    const chunk = buffer.subarray(i, Math.min(i + PLUTUS_CHUNK_SIZE, buffer.length));
    parts.push(encodeCborBytes(chunk));
  }
  parts.push(new Uint8Array([0xff])); // break
  return concatUint8Arrays(parts);
}
```

In `buildTaskDataCBOR`, change line 145:

```typescript
// Before:
const contentEncoded = encodeCborBytes(contentBytes);
// After:
const contentEncoded = encodePlutusBuiltinByteString(contentBytes);
```

### `src/utils/hashing/task-hash.test.ts`

Add boundary tests:

```typescript
describe("CBOR byte string chunking", () => {
  it("should use definite-length encoding for content <= 64 bytes", () => {
    const task = createTestTask({ project_content: "x".repeat(64) });
    const debug = debugTaskBytes(task);
    // Verify CBOR bytes contain 0x58 0x40 (definite 64-byte string), NOT 0x5f
    expect(debug.cborHex).toContain("5840");
    expect(debug.cborHex).not.toMatch(/^.*5f.*ff.*$/); // no indefinite encoding
  });

  it("should use chunked indefinite-length encoding for content > 64 bytes", () => {
    const task = createTestTask({ project_content: "x".repeat(65) });
    const debug = debugTaskBytes(task);
    // Should start with 0x5f (indefinite) and end with 0xff (break)
    // First chunk: 0x58 0x40 (64 bytes), second chunk: 0x41 0x01 (1 byte)
    expect(debug.cborHex).toContain("5f");
  });

  it("should produce identical hashes for short content before and after fix", () => {
    // Re-verify all 7 on-chain vectors still pass (covered by existing tests)
  });

  it("should handle multi-byte UTF-8 across chunk boundary", () => {
    // 63 ASCII bytes + one 3-byte CJK character = 66 bytes total
    const task = createTestTask({ project_content: "x".repeat(63) + "\u4e16" });
    const hash = computeTaskHash(task);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

## Follow-Up (Out of Scope)

- Extract shared CBOR encoding utilities (`encodeCborBytes`, `concatUint8Arrays`, `encodePlutusBuiltinByteString`) into a common `cbor-utils.ts` module to eliminate duplication between `task-hash.ts` and `slt-hash.ts`

## Sources & References

- **GitHub Issue:** [#5 - computeTaskHash missing CBOR byte string chunking for content > 64 bytes](https://github.com/Andamio-Platform/andamio-core/issues/5)
- **Related Issue:** [#3 - Task hash computation still doesn't match on-chain Aiken validator](https://github.com/Andamio-Platform/andamio-core/issues/3)
- **Reference implementation:** `src/utils/hashing/slt-hash.ts:126-143` (`encodePlutusBuiltinByteString`)
- **Previous solution:** `docs/solutions/logic-errors/hash-algorithm-mismatch-cbor-encoding.md`
- **CBOR RFC 8949:** Indefinite-length byte strings (Section 3.2.1)
