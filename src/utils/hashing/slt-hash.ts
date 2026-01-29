/**
 * SLT Hash Utility
 *
 * Computes the module token name (hash) from a list of Student Learning Targets (SLTs).
 * This hash is used as the token name when minting module tokens on-chain.
 *
 * The algorithm matches the on-chain Plutus validator:
 * ```haskell
 * sltsToBbs MintModuleV2{slts} = blake2b_256 $ serialiseData $ toBuiltinData $ map stringToBuiltinByteString slts
 * ```
 *
 * Serialization format:
 * 1. Convert each SLT string to UTF-8 bytes
 * 2. Encode as CBOR indefinite-length array of byte strings
 * 3. Hash with Blake2b-256 (32 bytes / 256 bits)
 *
 * @module @andamio/core/hashing
 */

import blake from "blakejs";

/**
 * Plutus chunk size for byte strings.
 * Strings longer than this are encoded as indefinite-length chunked byte strings.
 */
const PLUTUS_CHUNK_SIZE = 64;

/**
 * Compute the module hash matching Plutus on-chain encoding.
 *
 * Plutus's `stringToBuiltinByteString` chunks byte strings at 64 bytes.
 * This function replicates that behavior:
 * - Strings <= 64 bytes: encoded as regular CBOR byte strings
 * - Strings > 64 bytes: encoded as indefinite-length chunked byte strings
 *
 * @param slts - Array of Student Learning Target strings
 * @returns 64-character hex string (256-bit Blake2b hash)
 *
 * @example
 * ```typescript
 * import { computeSltHash } from "@andamio/core/hashing";
 *
 * const slts = [
 *   "I can mint an access token.",
 *   "I can complete an assignment to earn a credential."
 * ];
 *
 * const moduleHash = computeSltHash(slts);
 * // Returns: "8dcbe1b925d87e6c547bbd8071c23a712db4c32751454b0948f8c846e9246b5c"
 * ```
 */
export function computeSltHash(slts: string[]): string {
  const sltBytes = slts.map((slt) => new TextEncoder().encode(slt));
  const cborData = encodeAsPlutusArray(sltBytes);
  return blake.blake2bHex(cborData, undefined, 32);
}

/**
 * @deprecated Use `computeSltHash` instead. This alias is kept for backwards compatibility.
 */
export const computeSltHashDefinite = computeSltHash;

/**
 * Verify that a given hash matches the computed hash for SLTs.
 *
 * @param slts - Array of Student Learning Target strings
 * @param expectedHash - The hash to verify (64-character hex string)
 * @returns true if the computed hash matches the expected hash
 */
export function verifySltHash(slts: string[], expectedHash: string): boolean {
  const computedHash = computeSltHash(slts);
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Validate that a string is a valid SLT hash format.
 *
 * SLT hashes are 64-character hexadecimal strings (256-bit Blake2b hash).
 *
 * @param hash - String to validate
 * @returns true if the string is a valid SLT hash format
 */
export function isValidSltHash(hash: string): boolean {
  if (hash.length !== 64) {
    return false;
  }
  return /^[0-9a-fA-F]{64}$/.test(hash);
}

// =============================================================================
// Plutus-Compatible Encoding (Internal)
// =============================================================================

/**
 * Encode an array of byte buffers matching Plutus serialization.
 *
 * Uses indefinite-length array with chunked byte strings for long values.
 *
 * @internal
 */
function encodeAsPlutusArray(items: Uint8Array[]): Uint8Array {
  const chunks: Uint8Array[] = [];

  // Start indefinite array
  chunks.push(new Uint8Array([0x9f]));

  // Encode each item (with chunking for long strings)
  for (const item of items) {
    chunks.push(encodePlutusBuiltinByteString(item));
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
    // Short string: encode normally
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
 * Encode a byte buffer as a CBOR byte string (definite length).
 *
 * @internal
 */
function encodeCBORByteString(buffer: Uint8Array): Uint8Array {
  const len = buffer.length;

  // CBOR byte string encoding (major type 2 = 0x40):
  // - 0-23 bytes: length inline (0x40 + len)
  // - 24-255 bytes: 0x58 + 1-byte length
  // - 256-65535 bytes: 0x59 + 2-byte length (big-endian)
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
