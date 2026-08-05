/**
 * Commitment Hash Utility
 *
 * Functions for computing and verifying hashes of commitment evidence.
 * The hash is stored on-chain as `commitment_hash` in the course state datum,
 * while the full evidence (Tiptap JSON document) is stored in the database.
 *
 * This provides:
 * - Compact on-chain storage (64-char hex hash vs full JSON)
 * - Tamper-evidence (can verify DB content matches on-chain commitment)
 * - Privacy (evidence details not exposed on-chain)
 *
 * The algorithm implemented by `computeCommitmentHash` is FROZEN as
 * canonical-v1. The normative specification and cross-implementation golden
 * vectors live in docs/specs/commitment-hash-v1.md and
 * src/utils/hashing/vectors/commitment-hash-vectors.json. Any behavioral
 * change is a new version, never an edit.
 *
 * @module @andamio/core/hashing
 */

import blake from "blakejs";

/**
 * Tiptap document structure (simplified)
 * The actual structure can be more complex with nested content
 */
export type TiptapDoc = {
  type: "doc";
  content?: TiptapNode[];
  [key: string]: unknown;
};

export type TiptapNode = {
  type: string;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
};

export type TiptapMark = {
  type: string;
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Normalizes a value for consistent hashing.
 *
 * Normalization rules:
 * - Objects: Sort keys alphabetically, recursively normalize values
 * - Arrays: Preserve order, recursively normalize items
 * - Strings: Trim whitespace
 * - Numbers/Booleans/null: Keep as-is
 * - undefined: Convert to null
 *
 * @param value - Any JSON-serializable value
 * @returns Normalized value
 */
export function normalizeForHashing(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForHashing);
  }

  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      const val = (value as Record<string, unknown>)[key];
      if (val !== undefined) {
        sorted[key] = normalizeForHashing(val);
      }
    }
    return sorted;
  }

  return value;
}

/**
 * Computes the commitment hash from evidence content.
 *
 * The hash is computed as:
 * 1. Normalize the evidence (sort keys, trim strings, etc.)
 * 2. Serialize to JSON string (deterministic due to normalization)
 * 3. Apply Blake2b-256 hash
 *
 * @param evidence - The evidence content (Tiptap JSON document or any JSON-serializable data)
 * @returns 64-character lowercase hex string (Blake2b-256 hash)
 *
 * @example
 * ```typescript
 * import { computeCommitmentHash } from "@andamio/core/hashing";
 *
 * const evidence = {
 *   type: "doc",
 *   content: [
 *     { type: "paragraph", content: [{ type: "text", text: "My submission" }] }
 *   ]
 * };
 *
 * const hash = computeCommitmentHash(evidence);
 * // Use this hash as commitment_hash in the transaction
 * ```
 */
const textEncoder = new TextEncoder();

export function computeCommitmentHash(evidence: unknown): string {
  const normalized = normalizeForHashing(evidence);
  const jsonString = JSON.stringify(normalized);
  const bytes = textEncoder.encode(jsonString);
  return blake.blake2bHex(bytes, undefined, 32);
}

/**
 * Verifies that evidence content matches an expected hash.
 *
 * Use this to verify that database evidence matches the on-chain commitment.
 *
 * @param evidence - The evidence content to verify
 * @param expectedHash - The expected hash (from on-chain data)
 * @returns True if the evidence produces the expected hash
 */
export function verifyCommitmentHash(
  evidence: unknown,
  expectedHash: string
): boolean {
  if (!isValidCommitmentHash(expectedHash)) {
    return false;
  }
  let computedHash: string;
  try {
    computedHash = computeCommitmentHash(evidence);
  } catch {
    // Non-JSON-serializable evidence (BigInt, circular): not a match, never a throw.
    return false;
  }
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Validates that a string is a valid commitment hash format.
 *
 * A valid hash is a 64-character hexadecimal string (Blake2b-256 output).
 *
 * @param hash - The string to validate
 * @returns True if the string is a valid hash format
 */
export function isValidCommitmentHash(hash: string): boolean {
  if (typeof hash !== "string") {
    return false;
  }
  if (hash.length !== 64) {
    return false;
  }
  return /^[0-9a-fA-F]{64}$/.test(hash);
}

/**
 * Result of comparing evidence with an on-chain hash
 */
export type EvidenceVerificationResult = {
  /** Whether the evidence matches the on-chain hash */
  isValid: boolean;
  /** The hash computed from the evidence */
  computedHash: string;
  /** The expected hash (from on-chain) */
  expectedHash: string;
  /** Human-readable status message */
  message: string;
};

/**
 * Performs a detailed verification of evidence against an on-chain hash.
 *
 * Returns a detailed result object with both hashes and a status message,
 * useful for debugging and user feedback.
 *
 * @param evidence - The evidence content to verify
 * @param onChainHash - The hash from on-chain data
 * @returns Detailed verification result
 */
export function verifyEvidenceDetailed(
  evidence: unknown,
  onChainHash: string
): EvidenceVerificationResult {
  if (!isValidCommitmentHash(onChainHash)) {
    return {
      isValid: false,
      computedHash: "",
      expectedHash: onChainHash,
      message: `Invalid on-chain hash format: expected 64 hex characters, got "${onChainHash}"`,
    };
  }

  let computedHash: string;
  try {
    computedHash = computeCommitmentHash(evidence);
  } catch {
    return {
      isValid: false,
      computedHash: "",
      expectedHash: onChainHash.toLowerCase(),
      message:
        "Evidence is not hashable (canonical v1 hash not computable for this input)",
    };
  }
  const isValid = computedHash.toLowerCase() === onChainHash.toLowerCase();

  return {
    isValid,
    computedHash,
    expectedHash: onChainHash.toLowerCase(),
    message: isValid
      ? "Evidence matches on-chain commitment"
      : "Evidence does not match on-chain commitment - content may have been modified",
  };
}

// =============================================================================
// Legacy (pre-canonical-v1) Algorithm and Era-Aware Verification
// =============================================================================

/**
 * Normalizes a value using the legacy (v0) rules from andamio-app-v2.
 *
 * Faithful port of `normalizeContentStructure` in
 * andamio-app-v2/src/lib/hashing.ts. Differences from `normalizeForHashing`:
 * - NO string trimming
 * - Falsy values (including "" and 0) hit the primitive base case as-is
 * - Objects recurse into EVERY key with no explicit undefined-drop
 *   (JSON.stringify drops undefined-valued keys later)
 *
 * @param content - Any value
 * @returns Legacy-normalized value
 * @internal
 */
function normalizeForLegacyHashV0(content: unknown): unknown {
  // BASE CASE 1: Handle primitive values (strings, numbers, null, etc.)
  // Preserves the original's exact branching: any falsy value (null,
  // undefined, "", 0, false, NaN) returns as-is.
  if (!content || typeof content !== "object") {
    return content;
  }

  // BASE CASE 2: Handle arrays
  // undefined elements stay undefined here; JSON.stringify serializes
  // them as null later (same as the original).
  if (Array.isArray(content)) {
    return content.map(normalizeForLegacyHashV0);
  }

  // RECURSIVE CASE: Handle objects (sort keys, recurse into every key)
  const normalized: Record<string, unknown> = {};
  const sortedKeys = Object.keys(content as Record<string, unknown>).sort();
  for (const key of sortedKeys) {
    normalized[key] = normalizeForLegacyHashV0(
      (content as Record<string, unknown>)[key],
    );
  }
  return normalized;
}

/**
 * Computes the legacy (v0) commitment hash from evidence content.
 *
 * Faithful port of andamio-app-v2's `hashNormalizedContent`
 * (src/lib/hashing.ts): legacy normalization (sort keys, NO trimming) →
 * JSON.stringify → UTF-8 bytes → Blake2b-256 → lowercase hex. The one
 * deliberate difference from the original: top-level input that is not
 * JSON-serializable (undefined, a function, a bare symbol) throws a
 * descriptive Error instead of crashing with an unhelpful TypeError.
 *
 * @deprecated This is the pre-canonical-v1 algorithm (no string trimming).
 * It remains andamio-app-v2's ACTIVE assignment write path until
 * Andamio-Platform/andamio-app-v2#832 lands, so v0-hashed rows are still
 * being written on-chain — a growing set, not a closed era. This export
 * exists for era-aware verification of those rows only (see
 * `verifyEvidenceAgainstEras`) — NEVER hash new content with it; use
 * `computeCommitmentHash`.
 *
 * @param evidence - The evidence content (Tiptap JSON document or any JSON-serializable data)
 * @returns 64-character lowercase hex string (Blake2b-256 hash)
 * @throws Error if the evidence is not JSON-serializable at the top level
 *
 * @example
 * ```typescript
 * import { legacyHashV0, computeCommitmentHash } from "@andamio/core/hashing";
 *
 * const doc = {
 *   type: "doc",
 *   content: [
 *     { type: "paragraph", content: [{ type: "text", text: "padded  " }] }
 *   ]
 * };
 *
 * legacyHashV0(doc) !== computeCommitmentHash(doc);
 * // true - v0 preserves the boundary whitespace that v1 trims
 * ```
 */
export function legacyHashV0(evidence: unknown): string {
  const normalized = normalizeForLegacyHashV0(evidence);
  const jsonString = JSON.stringify(normalized);
  if (jsonString === undefined) {
    throw new Error(
      `legacyHashV0: evidence is not JSON-serializable (JSON.stringify returned undefined for input of type ${typeof evidence})`,
    );
  }
  const bytes = textEncoder.encode(jsonString);
  return blake.blake2bHex(bytes, undefined, 32);
}

/**
 * Result of verifying evidence against an on-chain hash across hash eras
 */
export type EraVerificationResult = {
  /** Whether the evidence matches the on-chain hash under any supported algorithm */
  isValid: boolean;
  /** Which algorithm matched ("v1" canonical, "v0" legacy), or null if none */
  algorithm: "v1" | "v0" | null;
  /** The hashes computed from the evidence (v0 only present when it was computed) */
  computedHashes: { v1: string; v0?: string };
  /** The expected hash (from on-chain) */
  expectedHash: string;
  /** Human-readable status message */
  message: string;
};

/**
 * Verifies evidence against an on-chain hash, trying each supported hash era.
 *
 * Tries the canonical v1 algorithm (`computeCommitmentHash`) first, then
 * falls back to the legacy v0 algorithm (`legacyHashV0`) for rows written
 * by andamio-app-v2's pre-canonical write path. Never throws: if the v0
 * hash cannot be computed for the input (e.g. `undefined` evidence), the
 * v0 leg is skipped and the result reports the v1 miss.
 *
 * CAVEAT — `algorithm` is evidence, not proof, of era: v0 and v1 produce
 * IDENTICAL hashes for any document with no boundary whitespace, and a
 * v1 match is reported without ever computing v0. Consumers should also
 * treat v0 matches on rows written after andamio-app-v2 unifies on the
 * canonical algorithm (Andamio-Platform/andamio-app-v2#832) as suspect.
 *
 * @param evidence - The evidence content to verify
 * @param onChainHash - The hash from on-chain data
 * @returns Era-aware verification result (never throws)
 */
export function verifyEvidenceAgainstEras(
  evidence: unknown,
  onChainHash: string,
): EraVerificationResult {
  if (!isValidCommitmentHash(onChainHash)) {
    return {
      isValid: false,
      algorithm: null,
      computedHashes: { v1: "" },
      expectedHash: onChainHash,
      message: `Invalid on-chain hash format: expected 64 hex characters, got "${onChainHash}"`,
    };
  }

  const expectedHash = onChainHash.toLowerCase();

  let v1Hash: string;
  try {
    v1Hash = computeCommitmentHash(evidence);
  } catch {
    // Non-JSON-serializable evidence (BigInt, circular): report, never throw.
    return {
      isValid: false,
      algorithm: null,
      computedHashes: { v1: "" },
      expectedHash,
      message:
        "Evidence is not hashable (canonical v1 hash not computable for this input)",
    };
  }

  if (v1Hash === expectedHash) {
    return {
      isValid: true,
      algorithm: "v1",
      computedHashes: { v1: v1Hash },
      expectedHash,
      message: "Evidence matches on-chain commitment (canonical v1 algorithm)",
    };
  }

  // Guarded v0 leg: legacyHashV0 throws for non-JSON-serializable input
  // (including undefined evidence) — skip v0 rather than propagate.
  let v0Hash: string;
  try {
    v0Hash = legacyHashV0(evidence);
  } catch {
    return {
      isValid: false,
      algorithm: null,
      computedHashes: { v1: v1Hash },
      expectedHash,
      message:
        "Evidence does not match on-chain commitment (legacy v0 hash not computable for this input)",
    };
  }

  if (v0Hash === expectedHash) {
    return {
      isValid: true,
      algorithm: "v0",
      computedHashes: { v1: v1Hash, v0: v0Hash },
      expectedHash,
      message:
        "Evidence matches on-chain commitment via the legacy v0 (pre-trimming) algorithm",
    };
  }

  return {
    isValid: false,
    algorithm: null,
    computedHashes: { v1: v1Hash, v0: v0Hash },
    expectedHash,
    message:
      "Evidence does not match on-chain commitment under any supported algorithm - content may have been modified",
  };
}

// =============================================================================
// Backwards Compatibility Aliases (deprecated)
// =============================================================================

/**
 * @deprecated Use `computeCommitmentHash` instead.
 */
export const computeAssignmentInfoHash = computeCommitmentHash;

/**
 * @deprecated Use `verifyCommitmentHash` instead.
 */
export const verifyAssignmentInfoHash = verifyCommitmentHash;

/**
 * @deprecated Use `isValidCommitmentHash` instead.
 */
export const isValidAssignmentInfoHash = isValidCommitmentHash;
