/**
 * Task Hash Utility
 *
 * Computes the task token name (hash) from task data.
 * This hash is used as the task_hash on-chain (content-addressed identifier).
 *
 * The algorithm matches the on-chain Aiken/Haskell hash_project_data function:
 * - Serialize task data as Plutus Data (CBOR with tag 121 for Constructor 0)
 * - Use indefinite-length arrays for constructor fields
 * - Hash with Blake2b-256
 *
 * @module @andamio/core/hashing
 */

import blake from "blakejs";

/**
 * Native asset in Cardano format: [policyId, tokenName, quantity]
 *
 * @example
 * ```typescript
 * const asset: NativeAsset = [
 *   "abc123def456...".repeat(4), // 56 hex chars (28 bytes) - policy ID
 *   "746f6b656e",                // hex-encoded token name
 *   1000n                        // quantity as bigint
 * ];
 * ```
 */
export type NativeAsset = [
  policyId: string, // 56 hex chars (28 bytes)
  tokenName: string, // hex encoded (0-64 chars / 0-32 bytes)
  quantity: bigint, // arbitrary precision integer
];

/**
 * Task data structure matching the Aiken ProjectData type.
 *
 * Serialized as Plutus Data Constructor 0 (CBOR tag 121) with fields:
 * 1. project_content (ByteArray - UTF-8 encoded, NFC normalized)
 * 2. deadline (Int - milliseconds)
 * 3. lovelace_am (Int - micro-ADA)
 * 4. tokens (List<FlatValue> - native assets)
 */
export interface TaskData {
  /** Task description (max 140 characters) */
  project_content: string;
  /** Unix timestamp in milliseconds */
  expiration_time: bigint;
  /** Lovelace amount (micro-ADA) */
  lovelace_amount: bigint;
  /** Native assets attached to task */
  native_assets: readonly NativeAsset[];
}

/**
 * Compute the task hash (token name / task_hash) from task data.
 *
 * This produces the same hash as the on-chain Aiken hash_project_data function,
 * allowing clients to pre-compute or verify task hashes.
 *
 * @param task - Task data object
 * @returns 64-character hex string (256-bit Blake2b hash)
 * @throws Error if task data validation fails
 *
 * @example
 * ```typescript
 * import { computeTaskHash } from "@andamio/core/hashing";
 *
 * const task = {
 *   project_content: "Open Task #1",
 *   expiration_time: 1769027280000n,
 *   lovelace_amount: 15000000n,
 *   native_assets: []
 * };
 *
 * const taskHash = computeTaskHash(task);
 * // Returns the on-chain task_hash
 * ```
 */
export function computeTaskHash(task: TaskData): string {
  validateTaskData(task);
  const bytes = encodeTaskAsPlutusData(task);
  return blake.blake2bHex(bytes, undefined, 32);
}

/**
 * Verify that a given hash matches the computed hash for a task.
 *
 * @param task - Task data object
 * @param expectedHash - The hash to verify (64-character hex string)
 * @returns true if the computed hash matches the expected hash
 */
export function verifyTaskHash(task: TaskData, expectedHash: string): boolean {
  const computedHash = computeTaskHash(task);
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Validate that a string is a valid task hash format.
 *
 * Task hashes are 64-character hexadecimal strings (256-bit Blake2b hash).
 */
export function isValidTaskHash(hash: string): boolean {
  if (hash.length !== 64) {
    return false;
  }
  return /^[0-9a-fA-F]{64}$/.test(hash);
}

/**
 * Debug function to show the CBOR encoding of a task.
 * Useful for comparing against on-chain data.
 *
 * @param task - Task data object
 * @returns Hex string of the CBOR-encoded Plutus Data (before hashing)
 */
export function debugTaskBytes(task: TaskData): string {
  validateTaskData(task);
  const bytes = encodeTaskAsPlutusData(task);
  return uint8ArrayToHex(bytes);
}

// =============================================================================
// Plutus Data CBOR Encoding (Internal)
// =============================================================================

/**
 * Encode task data as Plutus Data matching Aiken/Haskell serialization.
 *
 * Format: tag(121) + indefinite-array + [content, deadline, lovelace, tokens] + break
 *
 * The key insight is that Haskell's `serialiseData . toBuiltinData` uses
 * indefinite-length CBOR arrays (0x9f ... 0xff) for Plutus Data constructors.
 *
 * @internal
 */
function encodeTaskAsPlutusData(task: TaskData): Uint8Array {
  const normalizedContent = task.project_content.normalize("NFC");
  const contentBytes = new TextEncoder().encode(normalizedContent);

  return concatUint8Arrays([
    // Tag 121 (Plutus Data Constructor 0) + indefinite array start
    new Uint8Array([0xd8, 121, 0x9f]),
    // Field 1: project_content (ByteArray) - uses Plutus chunking for >64 bytes
    encodePlutusBuiltinByteString(contentBytes),
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

/**
 * Encode a list of native assets as Plutus Data.
 *
 * Each FlatValue is encoded as a Plutus Data constructor with:
 * - PolicyId (ByteArray)
 * - AssetName (ByteArray)
 * - Quantity (Int)
 *
 * @internal
 */
function encodeTokensList(assets: readonly NativeAsset[]): Uint8Array {
  if (assets.length === 0) {
    // Empty definite-length array
    return new Uint8Array([0x80]);
  }

  // Encode as indefinite-length array of FlatValue constructors
  const parts: Uint8Array[] = [new Uint8Array([0x9f])]; // indefinite array start

  for (const [policyId, tokenName, quantity] of assets) {
    // Each FlatValue is Constructor 0 with 3 fields
    parts.push(new Uint8Array([0xd8, 121, 0x9f])); // tag 121, indefinite array
    parts.push(encodeCborBytes(hexToBytes(policyId)));
    parts.push(encodeCborBytes(hexToBytes(tokenName)));
    parts.push(encodeCborUint(quantity));
    parts.push(new Uint8Array([0xff])); // break
  }

  parts.push(new Uint8Array([0xff])); // break (end of list)
  return concatUint8Arrays(parts);
}

/**
 * Plutus chunk size for byte strings.
 * Strings longer than this are encoded as indefinite-length chunked byte strings.
 * @internal
 */
const PLUTUS_CHUNK_SIZE = 64;

/**
 * Maximum value for CBOR uint64 encoding.
 * @internal
 */
const MAX_UINT64 = 18446744073709551615n; // 2^64 - 1

/**
 * Encode CBOR unsigned integer (major type 0).
 *
 * @internal
 */
function encodeCborUint(n: bigint): Uint8Array {
  if (n < 0n) {
    throw new Error("Negative integers not supported");
  }
  if (n > MAX_UINT64) {
    throw new Error(
      `Integer exceeds maximum CBOR uint64 value (got ${n}, max ${MAX_UINT64})`,
    );
  }

  if (n < 24n) {
    return new Uint8Array([Number(n)]);
  } else if (n < 256n) {
    return new Uint8Array([0x18, Number(n)]);
  } else if (n < 65536n) {
    return new Uint8Array([0x19, Number(n >> 8n) & 0xff, Number(n) & 0xff]);
  } else if (n < 4294967296n) {
    return new Uint8Array([
      0x1a,
      Number((n >> 24n) & 0xffn),
      Number((n >> 16n) & 0xffn),
      Number((n >> 8n) & 0xffn),
      Number(n & 0xffn),
    ]);
  } else {
    // 8-byte unsigned integer
    return new Uint8Array([
      0x1b,
      Number((n >> 56n) & 0xffn),
      Number((n >> 48n) & 0xffn),
      Number((n >> 40n) & 0xffn),
      Number((n >> 32n) & 0xffn),
      Number((n >> 24n) & 0xffn),
      Number((n >> 16n) & 0xffn),
      Number((n >> 8n) & 0xffn),
      Number(n & 0xffn),
    ]);
  }
}

/**
 * Encode a byte buffer matching Plutus's stringToBuiltinByteString.
 *
 * - Bytes <= 64: regular CBOR byte string (definite-length)
 * - Bytes > 64: indefinite-length chunked byte string (64-byte chunks)
 *
 * @internal
 */
function encodePlutusBuiltinByteString(buffer: Uint8Array): Uint8Array {
  if (buffer.length <= PLUTUS_CHUNK_SIZE) {
    return encodeCborBytes(buffer);
  }

  // Chunked indefinite-length byte string
  const parts: Uint8Array[] = [new Uint8Array([0x5f])]; // indefinite start
  for (let i = 0; i < buffer.length; i += PLUTUS_CHUNK_SIZE) {
    const chunk = buffer.subarray(
      i,
      Math.min(i + PLUTUS_CHUNK_SIZE, buffer.length),
    );
    parts.push(encodeCborBytes(chunk));
  }
  parts.push(new Uint8Array([0xff])); // break
  return concatUint8Arrays(parts);
}

/**
 * Encode CBOR byte string (major type 2).
 *
 * @internal
 */
function encodeCborBytes(bytes: Uint8Array): Uint8Array {
  const len = bytes.length;
  let header: Uint8Array;

  if (len < 24) {
    header = new Uint8Array([0x40 + len]);
  } else if (len < 256) {
    header = new Uint8Array([0x58, len]);
  } else if (len < 65536) {
    header = new Uint8Array([0x59, (len >> 8) & 0xff, len & 0xff]);
  } else {
    throw new Error("Byte string too long for CBOR encoding");
  }

  return concatUint8Arrays([header, bytes]);
}

/**
 * Validate TaskData before hashing.
 *
 * @throws Error if validation fails
 * @internal
 */
function validateTaskData(task: TaskData): void {
  if (task.project_content.length > 140) {
    throw new Error(
      `project_content exceeds 140 characters (got ${task.project_content.length})`,
    );
  }

  if (task.expiration_time < 0n) {
    throw new Error("expiration_time must be non-negative");
  }
  if (task.lovelace_amount < 0n) {
    throw new Error("lovelace_amount must be non-negative");
  }

  for (const [policyId, tokenName, quantity] of task.native_assets) {
    if (policyId.length !== 56) {
      throw new Error(
        `policyId must be 56 hex chars (got ${policyId.length})`,
      );
    }
    if (!/^[0-9a-fA-F]*$/.test(policyId)) {
      throw new Error("policyId contains invalid hex characters");
    }
    if (tokenName.length > 64 || tokenName.length % 2 !== 0) {
      throw new Error(
        `tokenName must be 0-64 hex chars with even length (got ${tokenName.length})`,
      );
    }
    if (tokenName.length > 0 && !/^[0-9a-fA-F]*$/.test(tokenName)) {
      throw new Error("tokenName contains invalid hex characters");
    }
    if (quantity < 0n) {
      throw new Error("asset quantity must be non-negative");
    }
  }
}

/**
 * Convert hex string to Uint8Array.
 *
 * @internal
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0) {
    return new Uint8Array([]);
  }

  if (hex.length % 2 !== 0) {
    throw new Error(`Invalid hex string: odd length (${hex.length})`);
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(
        `Invalid hex character at position ${i * 2}: "${hex.slice(i * 2, i * 2 + 2)}"`,
      );
    }
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * Concatenate multiple Uint8Arrays into one.
 *
 * @internal
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Convert Uint8Array to hex string.
 *
 * @internal
 */
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
