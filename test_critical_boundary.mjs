// Critical test: does the implementation use <= or <?
// The plan documentation claims ">64 bytes" triggers chunking
// Which means "<=64 bytes" should NOT chunk (definite length)

import { debugTaskBytes, computeTaskHash } from './dist/utils/hashing/index.mjs';

function makeTask(content) {
  return {
    project_content: content,
    expiration_time: 1782792000000n,
    lovelace_amount: 5000000n,
    native_assets: []
  };
}

// Generate a known good hash for 64 bytes from the spec
const contentFor64 = "Introduce Yourself".padEnd(64, 'x');
console.log("64-byte content length:", contentFor64.length);
const hash64 = computeTaskHash(makeTask(contentFor64));
console.log("Hash for 64-byte content:", hash64);

// What about exactly 65?
const contentFor65 = "Introduce Yourself".padEnd(65, 'x');
console.log("\n65-byte content length:", contentFor65.length);
const hash65 = computeTaskHash(makeTask(contentFor65));
console.log("Hash for 65-byte content:", hash65);

// Are they different? (they MUST be)
console.log("\nHashes different:", hash64 !== hash65);

// Now check CBOR structure for 64 vs 65
const hex64 = debugTaskBytes(makeTask("x".repeat(64)));
const hex65 = debugTaskBytes(makeTask("x".repeat(65)));

// Count 0x5f occurrences (indefinite byte string markers)
const count5f_64 = (hex64.match(/5f/g) || []).length;
const count5f_65 = (hex65.match(/5f/g) || []).length;

console.log("\nCBOR indefinite-length markers (0x5f):");
console.log("  64 bytes:", count5f_64, "(should be 0)");
console.log("  65 bytes:", count5f_65, "(should be > 0)");

// Critical: verify the hex structure matches RFC 8949 chunked format
// 0x5f = start indefinite-length byte string
// 0x58 0x40 = definite 64-byte string
// 0x41 = definite 1-byte string
// 0xff = break

const expectedStructure65 = hex65.substring(6, 30).match(/5f5840/);
console.log("\n65 bytes starts chunking with 0x5f 0x5840:", expectedStructure65 !== null);
