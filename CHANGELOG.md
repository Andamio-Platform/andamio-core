# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-28

### Added

- Initial release
- **Hashing utilities**:
  - `computeSltHash` / `computeSltHashDefinite` - SLT (Student Learning Target) token name hashing
  - `verifySltHash` / `isValidSltHash` - SLT hash verification
  - `computeTaskHash` - Project task hash computation
  - `verifyTaskHash` / `isValidTaskHash` / `debugTaskCBOR` - Task hash verification
  - `computeCommitmentHash` - Commitment/assignment evidence hashing
  - `verifyCommitmentHash` / `isValidCommitmentHash` - Commitment hash verification
  - `verifyEvidenceDetailed` / `normalizeForHashing` - Evidence processing utilities
- **Constants**:
  - `POLICY_IDS` - Policy IDs for preprod, preview, and mainnet networks
  - `EXPLORER_URLS` - Block explorer base URLs
  - `getTxExplorerUrl` / `getAddressExplorerUrl` / `getAssetExplorerUrl` - Explorer URL generators
- **TypeScript types**:
  - `TaskData` - Task hash input type
  - `TiptapDoc` / `TiptapNode` / `TiptapMark` - Tiptap document types
  - `EvidenceVerificationResult` - Evidence verification result type
  - `CardanoNetwork` - Network type (preprod | preview | mainnet)
