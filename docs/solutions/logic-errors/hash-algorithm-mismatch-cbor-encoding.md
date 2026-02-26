---
title: "Fix task hash computation mismatch with on-chain Aiken validator"
category: logic-errors
tags: [hash-computation, cbor-encoding, little-endian, bigint, aiken, cardano, blake2b]
module: "@andamio/core - computeTaskHash"
symptom: "Task merge failures in gateway - tasks appearing as duplicates (db_only + chain_only) instead of single merged entry"
root_cause: "CBOR/Plutus Data encoding used instead of raw byte concatenation; big-endian integers instead of little-endian; wrong NativeAsset type structure"
date_solved: 2026-02-26
related_issues: ["andamio-core#1", "andamio-api#195"]
---

# Fix task hash computation mismatch with on-chain Aiken validator

## Problem Summary

The `computeTaskHash` function in `@andamio/core` produced hashes that didn't match the on-chain Aiken validator's `hash_project_data` function. This caused task merge failures in the gateway where tasks appeared as duplicates (`db_only` + `chain_only`) instead of a single `merged` entry.

## Root Cause Analysis

The `computeTaskHash` function was producing hashes that didn't match the on-chain Aiken validator's `hash_project_data` function due to four fundamental encoding mismatches:

| Aspect | Current (broken) | Required (Aiken) |
|--------|------------------|------------------|
| Overall structure | CBOR/Plutus Data with tag 121 | Raw byte concatenation |
| Integer format | Big-endian (CBOR standard) | Little-endian, minimal bytes |
| Empty asset list | CBOR `[0x80]` | Empty bytearray `""` |
| NativeAsset type | `[assetClass, quantity]` | `[policyId, tokenName, quantity]` |

### Aiken Source (Source of Truth)

```aiken
// ls-project/lib/types/project.ak

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
  integer_to_bytearray(False, 0, int)  // False = little-endian, 0 = minimal size
}
```

## Solution

### 1. Raw Byte Concatenation Instead of CBOR

**Before:** Used CBOR encoding with complex serialization
**After:** Simple sequential concatenation of encoded components

```typescript
function encodeTaskAsRawBytes(task: TaskData): Uint8Array {
  // Normalize Unicode for consistent hashing
  const normalizedContent = task.project_content.normalize("NFC");

  return concatUint8Arrays([
    new TextEncoder().encode(normalizedContent),
    intToBytesLittleEndian(task.expiration_time),
    intToBytesLittleEndian(task.lovelace_amount),
    combineNativeAssets(task.native_assets),
  ]);
}
```

### 2. Little-Endian Integer Encoding

Created `intToBytesLittleEndian` function matching Aiken's `integer_to_bytearray(False, 0, int)`:

```typescript
function intToBytesLittleEndian(n: bigint): Uint8Array {
  if (n < 0n) {
    throw new Error("Negative integers not supported");
  }
  if (n === 0n) {
    return new Uint8Array([0]);
  }

  const bytes: number[] = [];
  let remaining = n;

  while (remaining > 0n) {
    bytes.push(Number(remaining & 0xffn));
    remaining = remaining >> 8n;
  }

  return new Uint8Array(bytes);
}
```

**Key Points:**
- Zero encodes as a single byte `[0x00]`
- Uses minimal byte length (no zero-padding)
- Bytes are extracted in least-significant-first order (little-endian)
- Handles arbitrary-precision `bigint` values beyond `Number.MAX_SAFE_INTEGER`

### 3. Updated NativeAsset Type

Changed from 2-tuple to 3-tuple structure with bigint:

```typescript
export type NativeAsset = [
  policyId: string,  // 56 hex chars (28 bytes)
  tokenName: string, // hex encoded (0-64 chars / 0-32 bytes)
  quantity: bigint,  // arbitrary precision integer
];
```

### 4. Updated TaskData Type

Changed numeric fields to `bigint`:

```typescript
export interface TaskData {
  project_content: string;        // max 140 characters
  expiration_time: bigint;        // Unix timestamp in milliseconds
  lovelace_amount: bigint;        // Lovelace (micro-ADA)
  native_assets: readonly NativeAsset[];
}
```

### 5. Native Asset Encoding

```typescript
function combineNativeAssets(assets: readonly NativeAsset[]): Uint8Array {
  if (assets.length === 0) {
    return new Uint8Array([]);  // Empty bytes, not CBOR [0x80]
  }

  const chunks: Uint8Array[] = [];
  for (const [policyId, tokenName, quantity] of assets) {
    chunks.push(hexToBytes(policyId));
    chunks.push(hexToBytes(tokenName));
    chunks.push(intToBytesLittleEndian(quantity));
  }
  return concatUint8Arrays(chunks);
}
```

### 6. Input Validation

Added comprehensive validation with descriptive error messages:

```typescript
function validateTaskData(task: TaskData): void {
  if (task.project_content.length > 140) {
    throw new Error(`project_content exceeds 140 characters (got ${task.project_content.length})`);
  }
  if (task.expiration_time < 0n) {
    throw new Error("expiration_time must be non-negative");
  }
  // ... validate policyId length (56), tokenName format, etc.
}
```

## Key Code Changes

**File:** `src/utils/hashing/task-hash.ts`

**Byte Encoding Format (matching Aiken's `hash_project_data`):**

```
encoded_data = project_content ++ expiration_time_bytes ++ lovelace_amount_bytes ++ native_assets_bytes

Where:
- project_content: UTF-8 bytes (NFC normalized)
- expiration_time_bytes: little-endian integer, minimal length
- lovelace_amount_bytes: little-endian integer, minimal length
- native_assets_bytes: concatenated [policyId_bytes || tokenName_bytes || quantity_bytes] for each asset
```

## Prevention Strategies

- **Establish encoding specification as single source of truth** - Document the exact byte serialization format in both on-chain validator and client code with side-by-side examples

- **Create cross-language validation suite** - Build golden test vectors with known inputs and expected outputs, verified against the on-chain validator

- **Use bigint for all blockchain numeric values** - Enforce strict typing with `bigint` instead of `number` to prevent silent precision loss above `Number.MAX_SAFE_INTEGER`

- **Implement debug/inspect utilities** - Provide `debugTaskBytes()` functions that return hex-encoded intermediate states before hashing

- **Add comprehensive input validation** - Validate all constraints at the entry point with descriptive error messages

- **Normalize Unicode consistently** - Apply NFC normalization to string inputs before hashing

- **Use explicit byte order specifications** - Use function names that make endianness explicit: `intToBytesLittleEndian()` vs `intToBytesBigEndian()`

## Testing Recommendations

- **Golden test vectors from on-chain data** - Query Andamioscan for known transactions with their associated hashes

- **Byte-level regression tests** - Verify exact byte encoding at intermediate steps using `debugTaskBytes()`

- **Endianness verification tests**:
  ```typescript
  // 0x12345678 in little-endian should be [0x78, 0x56, 0x34, 0x12]
  expect(debugTaskBytes({expiration_time: 0x12345678n})).toContain("78563412");
  ```

- **Edge case coverage** - Test zero, 1, powers of 2, Number.MAX_SAFE_INTEGER±1, boundary values

- **Unicode normalization tests** - Test combining character variants produce same hash after NFC

## Related Documentation

### Internal
- **GitHub Issue**: [andamio-core#1](https://github.com/Andamio-Platform/andamio-core/issues/1) - Fix task hash computation
- **Gateway Issue**: andamio-api#195 - Task merge failures
- **Implementation Plan**: `docs/plans/2026-02-26-fix-task-hash-aiken-match-plan.md`

### External
- [Aiken Builtins - integer_to_bytearray](https://aiken-lang.org/uplc/builtins)
- [MDN BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt)
- [blakejs npm](https://www.npmjs.com/package/blakejs)

## Files Changed

| File | Change |
|------|--------|
| `src/utils/hashing/task-hash.ts` | Complete rewrite with raw byte encoding |
| `src/utils/hashing/task-hash.test.ts` | New test file (34 tests) |
| `src/utils/hashing/index.ts` | Export NativeAsset, rename debugTaskBytes |
| `CHANGELOG.md` | Breaking change documentation |
| `package.json` | Version bump to 0.2.0 |
