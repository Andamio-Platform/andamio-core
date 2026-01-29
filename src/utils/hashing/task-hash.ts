/**
 * Task Hash Utility
 *
 * Computes the task token name (hash) from task data.
 * This hash is used as the task_hash on-chain (content-addressed identifier).
 *
 * The algorithm matches the on-chain Plutus validator serialization.
 *
 * @module @andamio/core/hashing
 */

import blake from "blakejs";

/**
 * Native asset in ListValue format: [policyId.tokenName, quantity]
 */
type NativeAsset = [string, number];

/**
 * Task data structure matching the Atlas TX API ManageTasksTxRequest
 *
 * Fields must be arranged in this specific order for hashing:
 * 1. project_content (string, max 140 chars)
 * 2. expiration_time (number, Unix timestamp in milliseconds)
 * 3. lovelace_amount (number)
 * 4. native_assets (array of [asset_class, quantity] tuples)
 */
export interface TaskData {
  project_content: string;
  expiration_time: number;
  lovelace_amount: number;
  native_assets: NativeAsset[];
}

/**
 * Plutus chunk size for byte strings.
 */
const PLUTUS_CHUNK_SIZE = 64;

/**
 * Compute the task hash (token name / task_hash) from task data.
 *
 * This produces the same hash as the on-chain Plutus validator, allowing
 * clients to pre-compute or verify task hashes.
 *
 * @param task - Task data object
 * @returns 64-character hex string (256-bit Blake2b hash)
 *
 * @example
 * ```typescript
 * import { computeTaskHash } from "@andamio/core/hashing";
 *
 * const task = {
 *   project_content: "Open Task #1",
 *   expiration_time: 1769027280000,
 *   lovelace_amount: 15000000,
 *   native_assets: []
 * };
 *
 * const taskHash = computeTaskHash(task);
 * // Returns the on-chain task_hash
 * ```
 */
export function computeTaskHash(task: TaskData): string {
  // Serialize task data matching Plutus format
  const cborData = encodeTaskAsPlutusData(task);

  // Hash with Blake2b-256
  return blake.blake2bHex(cborData, undefined, 32);
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
 * @returns Hex string of the CBOR-encoded data (before hashing)
 */
export function debugTaskCBOR(task: TaskData): string {
  const cborData = encodeTaskAsPlutusData(task);
  return uint8ArrayToHex(cborData);
}

// =============================================================================
// Plutus Data Encoding (Internal)
// =============================================================================

/**
 * Encode task data matching Plutus serialiseData $ toBuiltinData format.
 *
 * Plutus represents this as a constructor with fields in an INDEFINITE array:
 * Constr 0 [project_content, expiration_time, lovelace_amount, native_assets]
 *
 * IMPORTANT: Plutus uses indefinite-length arrays (0x9f...0xff) not definite (0x84).
 *
 * @internal
 */
function encodeTaskAsPlutusData(task: TaskData): Uint8Array {
  const chunks: Uint8Array[] = [];

  // Plutus Constr 0 with indefinite array
  // CBOR tag 121 (0xd879) = Constr 0 in Plutus Data
  chunks.push(new Uint8Array([0xd8, 0x79])); // Tag 121 (Constr 0)
  chunks.push(new Uint8Array([0x9f])); // Start indefinite array

  // Field 1: project_content as BuiltinByteString
  chunks.push(encodePlutusBuiltinByteString(new TextEncoder().encode(task.project_content)));

  // Field 2: expiration_time as Integer
  chunks.push(encodePlutusInteger(task.expiration_time));

  // Field 3: lovelace_amount as Integer
  chunks.push(encodePlutusInteger(task.lovelace_amount));

  // Field 4: native_assets as List of pairs
  chunks.push(encodeNativeAssets(task.native_assets));

  // End indefinite array
  chunks.push(new Uint8Array([0xff])); // Break

  return concatUint8Arrays(chunks);
}

/**
 * Encode native assets as Plutus List of (AssetClass, Integer) pairs.
 *
 * Each asset is a pair: (policyId.tokenName, quantity)
 * In Plutus, this is: List [(ByteString, Integer)]
 *
 * @internal
 */
function encodeNativeAssets(assets: NativeAsset[]): Uint8Array {
  if (assets.length === 0) {
    // Empty list: definite-length array of 0 elements
    return new Uint8Array([0x80]); // Array(0)
  }

  const chunks: Uint8Array[] = [];

  // Start indefinite array
  chunks.push(new Uint8Array([0x9f]));

  for (const [assetClass, quantity] of assets) {
    // Each asset is a 2-element array: [bytestring, integer]
    chunks.push(new Uint8Array([0x82])); // Array of 2 elements
    chunks.push(encodePlutusBuiltinByteString(new TextEncoder().encode(assetClass)));
    chunks.push(encodePlutusInteger(quantity));
  }

  // End indefinite array
  chunks.push(new Uint8Array([0xff]));

  return concatUint8Arrays(chunks);
}

/**
 * Encode a byte buffer matching Plutus's stringToBuiltinByteString.
 *
 * - Strings <= 64 bytes: regular CBOR byte string
 * - Strings > 64 bytes: indefinite-length chunked byte string (64-byte chunks)
 *
 * @internal
 */
function encodePlutusBuiltinByteString(buffer: Uint8Array): Uint8Array {
  if (buffer.length <= PLUTUS_CHUNK_SIZE) {
    return encodeCBORByteString(buffer);
  }

  // Long string: use indefinite-length chunked encoding
  const chunks: Uint8Array[] = [];
  chunks.push(new Uint8Array([0x5f])); // Start indefinite byte string

  for (let i = 0; i < buffer.length; i += PLUTUS_CHUNK_SIZE) {
    const chunk = buffer.subarray(i, Math.min(i + PLUTUS_CHUNK_SIZE, buffer.length));
    chunks.push(encodeCBORByteString(chunk));
  }

  chunks.push(new Uint8Array([0xff])); // Break
  return concatUint8Arrays(chunks);
}

/**
 * Encode a number as a CBOR integer (Plutus Integer).
 *
 * @internal
 */
function encodePlutusInteger(n: number): Uint8Array {
  // CBOR integer encoding (major type 0 for positive, 1 for negative)
  if (n >= 0) {
    if (n <= 23) {
      return new Uint8Array([n]);
    } else if (n <= 0xff) {
      return new Uint8Array([0x18, n]);
    } else if (n <= 0xffff) {
      return new Uint8Array([0x19, n >> 8, n & 0xff]);
    } else if (n <= 0xffffffff) {
      return new Uint8Array([0x1a, (n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
    } else {
      // 64-bit integer - use BigInt for precision
      const buf = new Uint8Array(9);
      buf[0] = 0x1b;
      const big = BigInt(n);
      const view = new DataView(buf.buffer);
      view.setBigUint64(1, big, false); // false = big-endian
      return buf;
    }
  } else {
    // Negative integers: major type 1, encode (-1 - n)
    const absVal = -1 - n;
    if (absVal <= 23) {
      return new Uint8Array([0x20 + absVal]);
    } else if (absVal <= 0xff) {
      return new Uint8Array([0x38, absVal]);
    } else if (absVal <= 0xffff) {
      return new Uint8Array([0x39, absVal >> 8, absVal & 0xff]);
    } else if (absVal <= 0xffffffff) {
      return new Uint8Array([0x3a, (absVal >> 24) & 0xff, (absVal >> 16) & 0xff, (absVal >> 8) & 0xff, absVal & 0xff]);
    } else {
      const buf = new Uint8Array(9);
      buf[0] = 0x3b;
      const big = BigInt(absVal);
      const view = new DataView(buf.buffer);
      view.setBigUint64(1, big, false);
      return buf;
    }
  }
}

/**
 * Encode a byte buffer as a CBOR byte string (definite length).
 *
 * @internal
 */
function encodeCBORByteString(buffer: Uint8Array): Uint8Array {
  const len = buffer.length;

  if (len <= 23) {
    const result = new Uint8Array(1 + len);
    result[0] = 0x40 + len;
    result.set(buffer, 1);
    return result;
  } else if (len <= 255) {
    const result = new Uint8Array(2 + len);
    result[0] = 0x58;
    result[1] = len;
    result.set(buffer, 2);
    return result;
  } else if (len <= 65535) {
    const result = new Uint8Array(3 + len);
    result[0] = 0x59;
    result[1] = len >> 8;
    result[2] = len & 0xff;
    result.set(buffer, 3);
    return result;
  }
  throw new Error("Byte string too long for CBOR encoding");
}

/**
 * Concatenate multiple Uint8Arrays into one
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
 * Convert Uint8Array to hex string
 *
 * @internal
 */
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
