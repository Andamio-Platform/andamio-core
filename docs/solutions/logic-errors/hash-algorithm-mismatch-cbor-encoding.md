---
title: "Fix task hash computation to match on-chain Aiken validator (v2)"
category: logic-errors
tags: [hash-computation, cbor-encoding, plutus-data, bigint, aiken, cardano, blake2b]
module: "@andamio/core - computeTaskHash"
symptom: "Task merge failures in gateway - tasks appearing as duplicates (db_only + chain_only) instead of single merged entry"
root_cause: "Raw byte concatenation used instead of CBOR/Plutus Data serialization; definite-length arrays instead of indefinite-length"
date_solved: 2026-03-06
related_issues: ["andamio-core#3", "andamio-core#4", "andamio-app-v2#404"]
supersedes: "Previous fix (2026-02-26) for old Aiken branch using raw byte concatenation"
---

# Fix task hash computation to match on-chain Aiken validator (v2)

## Problem Summary

The `computeTaskHash` function in `@andamio/core` produced hashes that didn't match the on-chain Aiken validator's `hash_project_data` function. This caused task merge failures in the gateway where tasks appeared as duplicates (`db_only` + `chain_only`) instead of a single `merged` entry.

## Important Context: On-Chain Code Changed

The Aiken on-chain validator was updated on the `contributor-state-v2` branch. **Both Aiken and Haskell now use identical CBOR serialization:**

| Component | Old Branch | New Branch (`contributor-state-v2`) |
|-----------|------------|-------------------------------------|
| Aiken | Raw byte concatenation | `blake2b_256(serialise_data(project_data))` |
| Haskell | `serialiseData . toBuiltinData` | `serialiseData . toBuiltinData` (unchanged) |

This means the **previous fix** (raw byte concatenation with little-endian integers) is now incorrect. The correct approach is CBOR/Plutus Data serialization.

## Root Cause Analysis

The `computeTaskHash` function was producing hashes that didn't match because:

| Aspect | Previous Implementation | Required (New Aiken) |
|--------|------------------------|----------------------|
| Overall structure | Raw byte concatenation | CBOR/Plutus Data with tag 121 |
| Array encoding | N/A | **Indefinite-length** (`0x9f ... 0xff`) |
| Integer format | Little-endian | Big-endian (CBOR standard) |
| Empty asset list | Empty bytes `""` | CBOR empty array `[0x80]` |

### Aiken Source (Source of Truth)

```aiken
// ls-project/lib/joist-ls-project/project.ak (contributor-state-v2 branch)

pub fn hash_project_data(project_data: ProjectData) -> ByteArray {
  blake2b_256_serialise(project_data)
}
```

Where `blake2b_256_serialise` is defined in `lib/plumbline/plumb_bytearray.ak`:

```aiken
use aiken/builtin.{blake2b_256, serialise_data}

pub fn blake2b_256_serialise(a: Data) -> ByteArray {
  blake2b_256(serialise_data(a))
}
```

### Haskell Source (Matches Aiken)

```haskell
-- andamio-atlas-api-v2/andamio-tx/TxBuilding/Andamio/Utility/Types/Project.hs

hashProjectData :: TaskData -> BuiltinByteString
hashProjectData = blake2b_256 . serialiseData . toBuiltinData . pdToBPpd
```

## Solution

### Key Insight: Indefinite-Length CBOR Arrays

The critical discovery was that Haskell's `serialiseData . toBuiltinData` uses **indefinite-length CBOR arrays** (`0x9f ... 0xff`) for Plutus Data constructors, not definite-length arrays (`0x84`).

```
Wrong:   d8 79 84 [fields...]      (definite-length, 4 elements)
Correct: d8 79 9f [fields...] ff   (indefinite-length with break)
```

### 1. CBOR/Plutus Data Encoding

**Before:** Raw byte concatenation
**After:** CBOR serialization with Plutus Data Constructor 0 (tag 121)

```typescript
function encodeTaskAsPlutusData(task: TaskData): Uint8Array {
  const normalizedContent = task.project_content.normalize("NFC");
  const contentBytes = new TextEncoder().encode(normalizedContent);

  return concatUint8Arrays([
    // Tag 121 (Plutus Data Constructor 0) + indefinite array start
    new Uint8Array([0xd8, 121, 0x9f]),
    // Field 1: project_content (ByteArray)
    encodeCborBytes(contentBytes),
    // Field 2: deadline (Int)
    encodeCborUint(task.expiration_time),
    // Field 3: lovelace_am (Int)
    encodeCborUint(task.lovelace_amount),
    // Field 4: tokens (List<FlatValue>)
    encodeTokensList(task.native_assets),
    // Break (end of indefinite array)
    new Uint8Array([0xff]),
  ]);
}
```

### 2. CBOR Integer Encoding (Big-Endian)

CBOR uses big-endian integers with type-specific headers:

```typescript
function encodeCborUint(n: bigint): Uint8Array {
  if (n < 0n) {
    throw new Error("Negative integers not supported");
  }

  if (n < 24n) {
    return new Uint8Array([Number(n)]);           // Inline (0x00-0x17)
  } else if (n < 256n) {
    return new Uint8Array([0x18, Number(n)]);     // 1-byte uint
  } else if (n < 65536n) {
    return new Uint8Array([0x19, ...]);           // 2-byte uint (big-endian)
  } else if (n < 4294967296n) {
    return new Uint8Array([0x1a, ...]);           // 4-byte uint (big-endian)
  } else {
    return new Uint8Array([0x1b, ...]);           // 8-byte uint (big-endian)
  }
}
```

### 3. CBOR Byte String Encoding

```typescript
function encodeCborBytes(bytes: Uint8Array): Uint8Array {
  const len = bytes.length;
  let header: Uint8Array;

  if (len < 24) {
    header = new Uint8Array([0x40 + len]);        // Inline length
  } else if (len < 256) {
    header = new Uint8Array([0x58, len]);         // 1-byte length
  } else if (len < 65536) {
    header = new Uint8Array([0x59, len >> 8, len & 0xff]); // 2-byte length
  }

  return concatUint8Arrays([header, bytes]);
}
```

### 4. Native Asset Encoding

Empty list uses definite-length empty array (`0x80`), non-empty uses indefinite:

```typescript
function encodeTokensList(assets: readonly NativeAsset[]): Uint8Array {
  if (assets.length === 0) {
    return new Uint8Array([0x80]);  // Empty definite-length array
  }

  // Non-empty: indefinite-length array of FlatValue constructors
  const parts: Uint8Array[] = [new Uint8Array([0x9f])];

  for (const [policyId, tokenName, quantity] of assets) {
    parts.push(new Uint8Array([0xd8, 121, 0x9f])); // Constructor 0
    parts.push(encodeCborBytes(hexToBytes(policyId)));
    parts.push(encodeCborBytes(hexToBytes(tokenName)));
    parts.push(encodeCborUint(quantity));
    parts.push(new Uint8Array([0xff]));            // Break
  }

  parts.push(new Uint8Array([0xff]));              // Break (end of list)
  return concatUint8Arrays(parts);
}
```

## Byte Encoding Format

```
CBOR Structure:
  d8 79          Tag 121 (Plutus Data Constructor 0)
  9f             Indefinite-length array start
    [content]    CBOR byte string (major type 2)
    [deadline]   CBOR unsigned integer (major type 0)
    [lovelace]   CBOR unsigned integer (major type 0)
    [tokens]     CBOR array (0x80 if empty, 0x9f...0xff if non-empty)
  ff             Break (end of indefinite array)
```

**Example for "Introduce Yourself" task:**
```
d8799f 52 496e74726f6475636520596f757273656c66 1b0000019f16af1200 1a004c4b40 80 ff
       ^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^ ^^ ^^
       |  "Introduce Yourself" (18 bytes)          deadline           lovelace   [] break
       18-byte string header (0x40 + 18 = 0x52)
```

## On-Chain Test Vectors

All 7 test vectors verified against live blockchain data:

| Task Title | Lovelace | Expected Hash |
|------------|----------|---------------|
| Introduce Yourself | 5000000 | `b1e5c9234e8a4481da7cb3fb525fc54430f8df127ab9f10464ddc8a4e7560614` |
| Review the Docs | 8000000 | `9d113eafdbe599d624c1ae3e545083e3ec7a053e14ebb6cb730eb3fb59eb3363` |
| Find a Typo | 5000000 | `c79b778c46a26148c5a33ad669b3452ecf0263539270513003abef73c5858cb2` |
| Attend a Sync Call | 8000000 | `090391c308370ca1846e6cf39641dc975e8b2f3e370fb812f61bebcacb6902aa` |
| Test a Feature | 10000000 | `801eae4957a456034025e61f23f2a508eb8a6e15f8d55edb239712033ff06d18` |
| Write a How-To | 15000000 | `b6ac09b203c7a81d1cd819bc6064eec2f713e64a6cc5a2fac16f864fcfeee949` |
| Propose an Improvement | 5000000 | `eb14effb2a81bece91708a2fb2478bd36711b06804f1fa5fca049d0a9192c784` |

All vectors have `expiration_time: 1782792000000n` and `native_assets: []`.

## Prevention Strategies

- **Track on-chain validator changes** - When Aiken validators are updated, verify client-side hash computation still matches

- **Use golden test vectors from on-chain data** - Verify against actual blockchain transactions, not just theoretical expectations

- **Understand CBOR encoding nuances** - Definite vs indefinite-length arrays produce different bytes and different hashes

- **Test both Aiken and Haskell paths** - The off-chain Haskell code must match the on-chain Aiken code exactly

- **Document the CBOR structure explicitly** - Include byte-level breakdowns in documentation

## Testing Recommendations

- **On-chain test vectors** - Use real task hashes from Andamioscan as golden tests

- **CBOR structure tests** - Verify the encoding starts with `d8799f` and ends with `ff`

- **Indefinite array verification** - Ensure `0x9f` (not `0x84`) is used for the outer array

- **Empty vs non-empty tokens** - Test both `0x80` (empty) and `0x9f...0xff` (non-empty) cases

## Related Documentation

### Internal
- **GitHub Issue #3**: Task hash computation still doesn't match on-chain Aiken validator
- **GitHub Issue #4**: Investigation: Task hash encoding mismatch between Aiken validator and on-chain data
- **Implementation Plan**: `docs/plans/2026-03-05-fix-task-hash-v2-on-chain-match-plan.md`

### External
- [CBOR RFC 8949](https://www.rfc-editor.org/rfc/rfc8949.html)
- [Plutus Data Encoding](https://github.com/input-output-hk/plutus)
- [blakejs npm](https://www.npmjs.com/package/blakejs)

## Files Changed

| File | Change |
|------|--------|
| `src/utils/hashing/task-hash.ts` | Complete rewrite with CBOR/Plutus Data encoding |
| `src/utils/hashing/task-hash.test.ts` | Added 7 on-chain test vectors, 45 total tests |

## Historical Note

This solution supersedes the previous fix (2026-02-26) which used raw byte concatenation with little-endian integers. That fix was correct for the **old Aiken branch** but became incorrect when the on-chain validator was updated to use `serialise_data` on the `contributor-state-v2` branch.
