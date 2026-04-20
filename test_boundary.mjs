// Test the exact boundary between 64 and 65 bytes
import { debugTaskBytes } from './dist/utils/hashing/index.mjs';

// Helper
function makeTask(content) {
  return {
    project_content: content,
    expiration_time: 1n,
    lovelace_amount: 1n,
    native_assets: []
  };
}

// Test: 63 bytes
const task63 = makeTask("x".repeat(63));
const hex63 = debugTaskBytes(task63);
console.log("63 bytes hex (first 100 chars):", hex63.substring(0, 100));
console.log("63 bytes contains 5840:", hex63.includes("5840"));
console.log("63 bytes contains 5f:", hex63.includes("5f"));

// Test: 64 bytes
const task64 = makeTask("x".repeat(64));
const hex64 = debugTaskBytes(task64);
console.log("\n64 bytes hex (first 100 chars):", hex64.substring(0, 100));
console.log("64 bytes contains 5840:", hex64.includes("5840"));
console.log("64 bytes contains 5f (before ff):", hex64.substring(0, hex64.length - 4).includes("5f"));

// Test: 65 bytes
const task65 = makeTask("x".repeat(65));
const hex65 = debugTaskBytes(task65);
console.log("\n65 bytes hex (first 100 chars):", hex65.substring(0, 100));
console.log("65 bytes contains 5f:", hex65.includes("5f"));
console.log("65 bytes contains 5840:", hex65.includes("5840"));

// Check structure: 65 bytes should be: d8799f 5f 5840[64] 4178 ff ... ff
console.log("\nStructure check for 65 bytes:");
const idx5f = hex65.indexOf("5f");
const idx5840 = hex65.indexOf("5840");
const idxFinal = hex65.lastIndexOf("ff");
console.log("  0x5f at position:", idx5f);
console.log("  0x5840 at position:", idx5840);
console.log("  0xff (last) at position:", idxFinal);
console.log("  Order correct (5f < 5840 < ff):", idx5f < idx5840 && idx5840 < idxFinal);
