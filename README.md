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
const sltHash = computeSltHash("course-123", "module-456", 1);

// Task hashing (for project tasks)
const taskHash = computeTaskHash({
  projectTokenPolicyId: "abc123...",
  taskCreatorTokenName: "creator-token",
  taskIndex: 0,
});

// Commitment/Assignment info hashing
const commitmentHash = computeCommitmentHash({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Evidence" }] }],
});
```

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
| `computeSltHash(courseId, moduleCode, moduleIndex)` | Compute SLT token name hash |
| `computeSltHashDefinite(courseId, moduleCode, moduleIndex)` | Same as above, always returns string (throws on error) |
| `verifySltHash(hash, courseId, moduleCode, moduleIndex)` | Verify an SLT hash matches inputs |
| `computeTaskHash(taskData)` | Compute project task hash |
| `verifyTaskHash(hash, taskData)` | Verify a task hash matches inputs |
| `computeCommitmentHash(evidence)` | Compute hash of Tiptap JSON evidence |
| `verifyCommitmentHash(hash, evidence)` | Verify a commitment hash |

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
