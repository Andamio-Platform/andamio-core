# @andamio/core

Core utilities and constants for the Andamio protocol. Zero React dependencies - can be used in any JavaScript/TypeScript environment.

## Installation

```bash
npm install @andamio/core
```

## Usage

### Hashing Utilities

```typescript
import {
  computeSltHash,
  computeTaskHash,
  computeCommitmentHash,
} from "@andamio/core/hashing";

// SLT (Student Learning Target) hashing
const sltHash = computeSltHash(["SLT 1.1: ...", "SLT 1.2: ..."]);

// Task hashing (for project tasks)
const taskHash = computeTaskHash({
  project_content: "Write the docs",
  expiration_time: 1754350000000n,
  lovelace_amount: 5000000n,
  native_assets: [],
});

// Commitment/Assignment evidence hashing (canonical-v1)
const commitmentHash = computeCommitmentHash({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Evidence" }] }],
});
```

#### Canonical evidence hash (canonical-v1)

`computeCommitmentHash` is the canonical evidence hasher, frozen as **canonical-v1** — any behavioral change is a new version, never an edit. The full algorithm specification, cross-implementation golden vectors, and the legacy-v0 appendix live in [`docs/specs/commitment-hash-v1.md`](docs/specs/commitment-hash-v1.md).

`verifyCommitmentHash(evidence, expectedHash)` is the one supported verifier (case-insensitive, never throws). For rows that may predate canonical-v1, `verifyEvidenceAgainstEras(evidence, onChainHash)` tries v1 then the deprecated `legacyHashV0` and reports which algorithm matched.

### Constants

```typescript
import {
  POLICY_IDS,
  getTxExplorerUrl,
  getAddressExplorerUrl,
} from "@andamio/core/constants";

// Get policy IDs for a network
const policyIds = POLICY_IDS.preprod;
console.log(policyIds.accessToken);

// Generate explorer URLs
const txUrl = getTxExplorerUrl("preprod", "abc123...");
const addrUrl = getAddressExplorerUrl("preprod", "addr_test1...");
```

## API Reference

### Hashing Functions

| Function | Description |
|----------|-------------|
| `computeSltHash(slts)` | Compute SLT token name hash from an array of SLT strings |
| `computeSltHashDefinite(slts)` | Alias of `computeSltHash` |
| `verifySltHash(slts, expectedHash)` | Verify an SLT hash matches inputs |
| `computeTaskHash(taskData)` | Compute project task hash |
| `verifyTaskHash(taskData, expectedHash)` | Verify a task hash matches inputs |
| `computeCommitmentHash(evidence)` | Compute canonical-v1 hash of Tiptap JSON evidence ([spec](docs/specs/commitment-hash-v1.md)) |
| `verifyCommitmentHash(evidence, expectedHash)` | The supported evidence verifier — case-insensitive, never throws |
| `verifyEvidenceDetailed(evidence, onChainHash)` | Detailed verification result with both hashes and a message |
| `verifyEvidenceAgainstEras(evidence, onChainHash)` | Era-aware verify: tries canonical-v1, then legacy v0 |
| `legacyHashV0(evidence)` | Deprecated pre-canonical hasher (no trimming) — era-aware verification only |
| `isValidCommitmentHash(hash)` | Validate 64-hex commitment hash format |

### Constants

| Export | Description |
|--------|-------------|
| `POLICY_IDS` | Policy IDs by network (preprod, preview, mainnet) |
| `EXPLORER_URLS` | Block explorer base URLs |
| `getTxExplorerUrl(network, txHash)` | Get transaction explorer URL |
| `getAddressExplorerUrl(network, address)` | Get address explorer URL |
| `getAssetExplorerUrl(network, policyId, assetName)` | Get asset explorer URL |

## License

Apache-2.0
