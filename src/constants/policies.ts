/**
 * Andamio Policy IDs
 *
 * Policy IDs for Andamio protocol tokens by network.
 * These are used to identify access tokens, course tokens, and other
 * protocol-specific assets on-chain.
 *
 * @module @andamio/core/constants
 */

import type { CardanoNetwork } from "./cardano";

/**
 * Policy ID configuration for a network
 */
export interface NetworkPolicies {
  /** Access token policy ID - identifies user access tokens */
  accessToken: string;
  /** Course token policy ID - identifies course tokens */
  courseToken: string;
  /** Module token policy ID - identifies module tokens */
  moduleToken: string;
  /** Assignment token policy ID - identifies assignment tokens */
  assignmentToken: string;
  /** Project token policy ID - identifies project tokens */
  projectToken: string;
  /** Task token policy ID - identifies task tokens */
  taskToken: string;
  /** Contributor token policy ID - identifies contributor tokens */
  contributorToken: string;
}

/**
 * Policy IDs by network
 *
 * Note: These should be loaded from environment variables in production.
 * The values here are examples/defaults for the preprod network.
 */
export const POLICY_IDS: Record<CardanoNetwork, NetworkPolicies> = {
  preprod: {
    accessToken: "4758613867a8a7aa500b5d57a0e877f01a8e63c1365469589b12063c",
    courseToken: "", // Set via environment
    moduleToken: "", // Set via environment
    assignmentToken: "", // Set via environment
    projectToken: "", // Set via environment
    taskToken: "", // Set via environment
    contributorToken: "", // Set via environment
  },
  preview: {
    accessToken: "",
    courseToken: "",
    moduleToken: "",
    assignmentToken: "",
    projectToken: "",
    taskToken: "",
    contributorToken: "",
  },
  mainnet: {
    accessToken: "",
    courseToken: "",
    moduleToken: "",
    assignmentToken: "",
    projectToken: "",
    taskToken: "",
    contributorToken: "",
  },
} as const;

/**
 * Get the access token policy ID for a network
 */
export function getAccessTokenPolicyId(network: CardanoNetwork): string {
  return POLICY_IDS[network].accessToken;
}

/**
 * Validate a policy ID format (56 hex characters)
 */
export function isValidPolicyId(policyId: string): boolean {
  if (typeof policyId !== "string") {
    return false;
  }
  if (policyId.length !== 56) {
    return false;
  }
  return /^[0-9a-fA-F]{56}$/.test(policyId);
}

/**
 * Validate an asset name format (hex string, max 64 chars / 32 bytes)
 */
export function isValidAssetName(assetName: string): boolean {
  if (typeof assetName !== "string") {
    return false;
  }
  if (assetName.length > 64) {
    return false;
  }
  if (assetName.length % 2 !== 0) {
    return false;
  }
  return /^[0-9a-fA-F]*$/.test(assetName);
}

/**
 * Convert a UTF-8 string to hex asset name
 */
export function stringToAssetName(str: string): string {
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert a hex asset name to UTF-8 string
 */
export function assetNameToString(hex: string): string {
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );
  return new TextDecoder().decode(bytes);
}
