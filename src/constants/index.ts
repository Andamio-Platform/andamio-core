/**
 * Andamio Constants
 *
 * Network configuration, policy IDs, and other constants.
 *
 * @module @andamio/core/constants
 */

// Cardano network constants
export {
  type CardanoNetwork,
  EXPLORER_URLS,
  CEXPLORER_URLS,
  NETWORK_MAGIC,
  ADDRESS_PREFIX,
  getTxExplorerUrl,
  getAddressExplorerUrl,
  getAssetExplorerUrl,
  getPolicyExplorerUrl,
} from "./cardano";

// Policy ID constants
export {
  type NetworkPolicies,
  POLICY_IDS,
  getAccessTokenPolicyId,
  isValidPolicyId,
  isValidAssetName,
  stringToAssetName,
  assetNameToString,
} from "./policies";
