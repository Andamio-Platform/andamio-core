# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-26

### Breaking Changes

- **`NativeAsset` type changed**: Now `[policyId, tokenName, quantity]` instead of `[assetClass, quantity]`
  - `policyId`: 56 hex characters (28 bytes)
  - `tokenName`: 0-64 hex characters (0-32 bytes)
  - `quantity`: `bigint` (was `number`)

- **`TaskData` fields changed to `bigint`**:
  - `expiration_time`: `bigint` (was `number`)
  - `lovelace_amount`: `bigint` (was `number`)

- **`debugTaskCBOR` renamed to `debugTaskBytes`** to reflect the new raw byte encoding

### Fixed

- `computeTaskHash` now produces hashes matching the on-chain Aiken `hash_project_data` validator
- Previously used CBOR/Plutus Data encoding; now uses raw byte concatenation per Aiken spec
- Integers now encoded as little-endian with minimal byte length

### Added

- Input validation with descriptive error messages for `TaskData` fields
- Unicode normalization (NFC) for consistent hashing of `project_content`
- `NativeAsset` type is now exported from `@andamio/core/hashing`

## [0.1.1] - 2026-02-26

### Fixed

- Fix blakejs CJS/ESM interop issue

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
