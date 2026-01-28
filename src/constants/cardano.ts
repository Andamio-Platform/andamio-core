/**
 * Cardano Network Constants
 *
 * Network identifiers, explorer URLs, and other Cardano-specific constants.
 *
 * @module @andamio/core/constants
 */

/**
 * Supported Cardano networks
 */
export type CardanoNetwork = "mainnet" | "preprod" | "preview";

/**
 * Block explorer URLs by network
 */
export const EXPLORER_URLS: Record<CardanoNetwork, string> = {
  mainnet: "https://cardanoscan.io",
  preprod: "https://preprod.cardanoscan.io",
  preview: "https://preview.cardanoscan.io",
} as const;

/**
 * CExplorer URLs by network (alternative explorer)
 */
export const CEXPLORER_URLS: Record<CardanoNetwork, string> = {
  mainnet: "https://cexplorer.io",
  preprod: "https://preprod.cexplorer.io",
  preview: "https://preview.cexplorer.io",
} as const;

/**
 * Network magic numbers for Cardano networks
 */
export const NETWORK_MAGIC: Record<CardanoNetwork, number> = {
  mainnet: 764824073,
  preprod: 1,
  preview: 2,
} as const;

/**
 * Bech32 address prefixes by network
 */
export const ADDRESS_PREFIX: Record<CardanoNetwork, string> = {
  mainnet: "addr",
  preprod: "addr_test",
  preview: "addr_test",
} as const;

/**
 * Get explorer URL for a transaction
 */
export function getTxExplorerUrl(
  network: CardanoNetwork,
  txHash: string
): string {
  return `${EXPLORER_URLS[network]}/transaction/${txHash}`;
}

/**
 * Get explorer URL for an address
 */
export function getAddressExplorerUrl(
  network: CardanoNetwork,
  address: string
): string {
  return `${EXPLORER_URLS[network]}/address/${address}`;
}

/**
 * Get explorer URL for a token/asset
 */
export function getAssetExplorerUrl(
  network: CardanoNetwork,
  policyId: string,
  assetName?: string
): string {
  const assetId = assetName ? `${policyId}.${assetName}` : policyId;
  return `${EXPLORER_URLS[network]}/token/${assetId}`;
}

/**
 * Get explorer URL for a policy
 */
export function getPolicyExplorerUrl(
  network: CardanoNetwork,
  policyId: string
): string {
  return `${EXPLORER_URLS[network]}/tokenPolicy/${policyId}`;
}
