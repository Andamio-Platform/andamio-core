---
title: Fix task hash computation to match on-chain Aiken validator (v2)
type: fix
status: active
date: 2026-03-05
related_issue: "#3"
previous_attempt: docs/plans/2026-02-26-fix-task-hash-aiken-match-plan.md
---

# Fix task hash computation to match on-chain Aiken validator (v2)

## Overview

The `computeTaskHash()` function in `@andamio/core` **still produces incorrect hashes** despite the fix in PR #2. Issue #3 provides 7 real on-chain test vectors from Andamioscan that prove the current implementation doesn't match.

**Impact:**
- DB tasks have incorrect hashes before on-chain creation
- Tasks appear as duplicates (`db_only` + `chain_only`) in merged API responses
- Commitments reference wrong task hashes, making them invisible in frontend
- Staging environment required manual database fixes

## Problem Statement

### Current Behavior

```typescript
const task = {
  project_content: "Introduce Yourself",
  expiration_time: 1782792000000n,
  lovelace_amount: 5000000n,
  native_assets: []
};

computeTaskHash(task);
// Actual:   93d6ffc3c535edccb3fafc16b28a497ba357e525d05b0e53f904bd644bb1b887
// Expected: b1e5c9234e8a4481da7cb3fb525fc54430f8df127ab9f10464ddc8a4e7560614
```

### On-Chain Test Vectors

These are real on-chain tasks from project `490e6da6be3dbfae3baa8431351dc148dd8bdebc62e2dd7772675e76`:

| Title | Lovelace | Expected Hash |
|-------|----------|---------------|
| Introduce Yourself | 5000000 | `b1e5c9234e8a4481da7cb3fb525fc54430f8df127ab9f10464ddc8a4e7560614` |
| Review the Docs | 8000000 | `9d113eafdbe599d624c1ae3e545083e3ec7a053e14ebb6cb730eb3fb59eb3363` |
| Find a Typo | 5000000 | `c79b778c46a26148c5a33ad669b3452ecf0263539270513003abef73c5858cb2` |
| Attend a Sync Call | 8000000 | `090391c308370ca1846e6cf39641dc975e8b2f3e370fb812f61bebcacb6902aa` |
| Test a Feature | 10000000 | `801eae4957a456034025e61f23f2a508eb8a6e15f8d55edb239712033ff06d18` |
| Write a How-To | 15000000 | `b6ac09b203c7a81d1cd819bc6064eec2f713e64a6cc5a2fac16f864fcfeee949` |
| Propose an Improvement | 5000000 | `eb14effb2a81bece91708a2fb2478bd36711b06804f1fa5fca049d0a9192c784` |

All vectors have `expiration_time: 1782792000000n` (milliseconds) and `native_assets: []`.

## Research Findings

### On-Chain Algorithm (Aiken)

**File:** `/Users/james/projects/01-projects/ls-project/lib/types/project.ak`

```aiken
pub fn hash_project_data(project_data: ProjectData) -> ByteArray {
  blake2b_256(
    append_bytearray(
      project_data.project_content,
      append_bytearray(
        int_to_bbs(project_data.deadline),
        append_bytearray(
          int_to_bbs(project_data.lovelace_am),
          combine_flat_val(project_data.tokens),
        ),
      ),
    ),
  )
}

fn int_to_bbs(int: Int) -> ByteArray {
  integer_to_bytearray(False, 0, int)  // False = little-endian, 0 = minimal bytes
}
```

**Data Structure:**
```aiken
pub type ProjectData {
  project_content: ByteArray,  // Field 1
  deadline: Int,               // Field 2
  lovelace_am: Lovelace,       // Field 3
  tokens: List<FlatValue>,     // Field 4
}
```

**Encoding Order:** `project_content ++ deadline ++ lovelace_am ++ tokens`

### Off-Chain Algorithm (Haskell Atlas API)

**File:** `/Users/james/projects/01-projects/andamio-atlas-api-v2/andamio-tx/TxBuilding/Andamio/Utility/Types/Project.hs`

```haskell
hashProjectData :: TaskData -> BuiltinByteString
hashProjectData = blake2b_256 . serialiseData . toBuiltinData . pdToBPpd
```

**Critical Finding:** The Haskell code uses `serialiseData . toBuiltinData` which is **CBOR/Plutus Data encoding**, NOT raw byte concatenation like the Aiken code.

### Current TypeScript Implementation

**File:** `src/utils/hashing/task-hash.ts:137-147`

```typescript
function encodeTaskAsRawBytes(task: TaskData): Uint8Array {
  const normalizedContent = task.project_content.normalize("NFC");
  return concatUint8Arrays([
    new TextEncoder().encode(normalizedContent),  // UTF-8 bytes
    intToBytesLittleEndian(task.expiration_time), // Little-endian, minimal
    intToBytesLittleEndian(task.lovelace_amount), // Little-endian, minimal
    combineNativeAssets(task.native_assets),      // Raw concat
  ]);
}
```

This follows the Aiken algorithm but still doesn't match on-chain hashes.

### Key Discovery: "Arbitrary Hash"

The user mentioned that the app passes an "already hashed string" called "arbitrary hash" for task content. This suggests `project_content` on-chain might NOT be the raw UTF-8 bytes of the title.

**Potential interpretations:**
1. `project_content` is a pre-computed hash of the full task description
2. `project_content` includes more than just the title (e.g., JSON content)
3. The encoding transformation happens in the Atlas API before on-chain submission

## Open Questions (Blocking Implementation)

### 1. What exactly is `project_content` on-chain?

The issue shows content hex `496e74726f6475636520596f757273656c66` which decodes to "Introduce Yourself" as UTF-8. But if none of our hash attempts match, either:
- The actual on-chain content is different
- There's additional transformation we're not aware of

**Action needed:** Query the actual on-chain UTxO data for one of the test tasks to verify what `project_content` bytes are stored.

### 2. Haskell vs Aiken Hash Mismatch

The Haskell off-chain code uses CBOR serialization:
```haskell
blake2b_256 . serialiseData . toBuiltinData . pdToBPpd
```

But the Aiken on-chain code uses raw byte concatenation.

**Question:** Which one computes the hash that becomes the token name / `task_hash`? Is the Haskell function even used, or is the on-chain hash authoritative?

### 3. Integer Encoding Edge Cases

Aiken's `integer_to_bytearray(False, 0, int)`:
- `False` = little-endian
- `0` = minimal byte length

**Question:** How does this handle zero? Empty bytes or `[0x00]`?

## Proposed Investigation Steps

### Phase 1: Verify On-Chain Data

1. **Query actual on-chain task data:**
   ```bash
   # Use cardano-cli or Andamioscan API to get the actual UTxO datum
   # for one of the test tasks (e.g., task hash b1e5c9234e...)
   ```

2. **Extract the raw `project_content` bytes** from the datum CBOR

3. **Compare with expected UTF-8 encoding** of "Introduce Yourself"

### Phase 2: Trace Hash Generation Path

1. **In Atlas API:** Trace where `hashProjectData` is called and whether its result is actually used as the token name

2. **In App:** Verify what value is passed to `project_content` when creating tasks

3. **On-chain:** Confirm which function (Aiken or Plutus) actually computes the token name

### Phase 3: Fix Implementation

Once we understand the exact encoding:
1. Update `computeTaskHash()` to match
2. Add all 7 test vectors to the test suite
3. Verify against on-chain data

## Acceptance Criteria

- [ ] All 7 on-chain test vectors pass
- [ ] `computeTaskHash()` produces identical output to on-chain `hash_project_data`
- [ ] Gateway task merge works correctly (no more duplicates)
- [ ] Comprehensive test coverage with real on-chain test vectors

## Files to Modify

- `src/utils/hashing/task-hash.ts` - Fix encoding algorithm
- `src/utils/hashing/task-hash.test.ts` - Add on-chain test vectors

## Dependencies

- **Blocking:** Need to verify actual on-chain data format before implementation
- **Related:** May require coordination with Atlas API if encoding happens there

## Sources & References

### Internal References

- Current implementation: `src/utils/hashing/task-hash.ts`
- Previous fix plan: `docs/plans/2026-02-26-fix-task-hash-aiken-match-plan.md`
- Aiken source: `/Users/james/projects/01-projects/ls-project/lib/types/project.ak`
- Haskell source: `/Users/james/projects/01-projects/andamio-atlas-api-v2/andamio-tx/TxBuilding/Andamio/Utility/Types/Project.hs`

### Related Issues

- GitHub Issue #3: Task hash computation still doesn't match on-chain Aiken validator
- Previous PR #2 (commit `2f33f49`): First fix attempt
