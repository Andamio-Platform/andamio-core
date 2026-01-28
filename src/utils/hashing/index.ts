/**
 * Andamio Hashing Utilities
 *
 * Content-addressed hashing functions for on-chain data verification.
 * All hashes are 64-character hex strings (Blake2b-256).
 *
 * @module @andamio/core/hashing
 */

// SLT (Student Learning Target) hashing
export {
  computeSltHash,
  computeSltHashDefinite,
  verifySltHash,
  isValidSltHash,
} from "./slt-hash";

// Task hashing
export {
  computeTaskHash,
  verifyTaskHash,
  isValidTaskHash,
  debugTaskCBOR,
  type TaskData,
} from "./task-hash";

// Commitment (assignment evidence) hashing
export {
  computeCommitmentHash,
  verifyCommitmentHash,
  isValidCommitmentHash,
  verifyEvidenceDetailed,
  normalizeForHashing,
  // Backwards compatibility aliases
  computeAssignmentInfoHash,
  verifyAssignmentInfoHash,
  isValidAssignmentInfoHash,
  // Types
  type TiptapDoc,
  type TiptapNode,
  type TiptapMark,
  type EvidenceVerificationResult,
} from "./commitment-hash";
