# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-08-05

**Hash compatibility guarantee: no hash output changes.** Canonical-v1 is a blessing of `computeCommitmentHash`'s existing behavior — every previously produced hash still verifies. `legacyHashV0` and `verifyEvidenceAgainstEras` are additive. All deprecated aliases are retained.

### Added

- Frozen **canonical-v1** specification for the commitment evidence hash: `docs/specs/commitment-hash-v1.md`. Any behavioral change is a new version, never an edit.
- Golden-vector fixture `src/utils/hashing/vectors/commitment-hash-vectors.json` — 12 characterization vectors (boundary whitespace, code blocks, empty/whitespace-only paragraphs, tables, unicode, NFC/NFD, serialization escaping, number forms) as the cross-implementation contract; first test coverage for `commitment-hash.ts` (parity-vector branch merged)
- `legacyHashV0` (deprecated) — faithful port of app-v2's pre-canonical non-trimming hasher, cross-validated against the original implementation; for era-aware verification only. Note: v0 remains app-v2's active assignment write path until andamio-app-v2#832 lands.
- `verifyEvidenceAgainstEras(evidence, onChainHash)` — tries canonical-v1 then legacy v0 (guarded, never throws) and reports which algorithm matched
- `EraVerificationResult` type
- PR CI workflow running typecheck and the test suite

### Fixed

- README hashing examples and API-table signatures now match the actual function signatures (`verifyCommitmentHash(evidence, expectedHash)`, `verifyTaskHash(taskData, expectedHash)`, `computeSltHash(slts)`)

## [0.3.1] - 2026-05-07

### Fixed

- `computeTaskHash`: CBOR byte-string chunking for content longer than 64 bytes, matching on-chain `serialise_data` behavior (release published 2026-05-07; fix landed 2026-03-19)

## [0.3.0] - 2026-03-06

### Fixed

- `computeTaskHash` reverted to CBOR/Plutus Data encoding to match the updated on-chain Aiken validator (supersedes the 0.2.0 raw-byte encoding)

### Security

- Bumped rollup to fix a path-traversal vulnerability

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
