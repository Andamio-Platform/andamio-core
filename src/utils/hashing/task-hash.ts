/**
 * Task Hash Utility
 *
 * Computes the task token name (hash) from task data.
 * This hash is used as the task_hash on-chain (content-addressed identifier).
 *
 * The algorithm matches the on-chain Aiken hash_project_data function using
 * raw byte concatenation and little-endian integer encoding.
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
 * Fields are concatenated in this order for hashing:
 * 1. project_content (UTF-8 bytes, NFC normalized)
 * 2. expiration_time (little-endian, minimal bytes)
 * 3. lovelace_amount (little-endian, minimal bytes)
 * 4. native_assets (raw concatenation of each asset's bytes)
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
  // Validate inputs
  validateTaskData(task);

  // Encode task as raw bytes matching Aiken format
  const bytes = encodeTaskAsRawBytes(task);

  // Hash with Blake2b-256
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
 * Debug function to show the raw byte encoding of a task.
 * Useful for comparing against on-chain data.
 *
 * @param task - Task data object
 * @returns Hex string of the encoded data (before hashing)
 */
export function debugTaskBytes(task: TaskData): string {
  validateTaskData(task);
  const bytes = encodeTaskAsRawBytes(task);
  return uint8ArrayToHex(bytes);
}

// =============================================================================
// Raw Byte Encoding (Internal) - Matches Aiken hash_project_data
// =============================================================================

/**
 * Encode task data as raw bytes matching Aiken's hash_project_data format.
 *
 * Format: project_content ++ int_to_bbs(deadline) ++ int_to_bbs(lovelace) ++ combine_flat_val(tokens)
 *
 * @internal
 */
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

/**
 * Validate TaskData before hashing.
 *
 * @throws Error if validation fails
 * @internal
 */
function validateTaskData(task: TaskData): void {
  // Validate project_content
  if (task.project_content.length > 140) {
    throw new Error(
      `project_content exceeds 140 characters (got ${task.project_content.length})`,
    );
  }

  // Validate numeric fields
  if (task.expiration_time < 0n) {
    throw new Error("expiration_time must be non-negative");
  }
  if (task.lovelace_amount < 0n) {
    throw new Error("lovelace_amount must be non-negative");
  }

  // Validate native assets
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
 * Convert a non-negative bigint to little-endian byte representation.
 * Matches Aiken's integer_to_bytearray(False, 0, int).
 *
 * - False = little-endian byte order
 * - 0 = minimal byte length (no zero-padding)
 *
 * @param n - Non-negative bigint to convert
 * @returns Uint8Array with little-endian byte representation
 * @internal
 */
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

/**
 * Combine native assets into raw bytes matching Aiken's combine_flat_val.
 * Format: policy_id ++ token_name ++ quantity for each asset.
 *
 * @param assets - Array of native assets
 * @returns Uint8Array of concatenated asset bytes
 * @internal
 */
function combineNativeAssets(assets: readonly NativeAsset[]): Uint8Array {
  if (assets.length === 0) {
    return new Uint8Array([]);
  }

  const chunks: Uint8Array[] = [];
  for (const [policyId, tokenName, quantity] of assets) {
    chunks.push(hexToBytes(policyId));
    chunks.push(hexToBytes(tokenName));
    chunks.push(intToBytesLittleEndian(quantity));
  }
  return concatUint8Arrays(chunks);
}

/**
 * Convert hex string to Uint8Array.
 *
 * @param hex - Hexadecimal string (must be even length)
 * @returns Uint8Array of bytes
 * @internal
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0) {
    return new Uint8Array([]);
  }

  // Validation already done in validateTaskData, but defensive check
  if (hex.length % 2 !== 0) {
    throw new Error(`Invalid hex string: odd length (${hex.length})`);
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
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
