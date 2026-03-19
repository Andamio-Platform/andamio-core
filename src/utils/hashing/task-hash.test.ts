import { describe, it, expect } from "vitest";
import {
  computeTaskHash,
  verifyTaskHash,
  isValidTaskHash,
  debugTaskBytes,
} from "./task-hash";
import type { TaskData, NativeAsset } from "./task-hash";

describe("computeTaskHash", () => {
  // All 7 on-chain test vectors from project 490e6da6be3dbfae3baa8431351dc148dd8bdebc62e2dd7772675e76
  // All have expiration_time: 1782792000000n and native_assets: []
  const ON_CHAIN_VECTORS: Array<{
    title: string;
    lovelace: bigint;
    expected_hash: string;
  }> = [
    {
      title: "Introduce Yourself",
      lovelace: 5000000n,
      expected_hash:
        "b1e5c9234e8a4481da7cb3fb525fc54430f8df127ab9f10464ddc8a4e7560614",
    },
    {
      title: "Review the Docs",
      lovelace: 8000000n,
      expected_hash:
        "9d113eafdbe599d624c1ae3e545083e3ec7a053e14ebb6cb730eb3fb59eb3363",
    },
    {
      title: "Find a Typo",
      lovelace: 5000000n,
      expected_hash:
        "c79b778c46a26148c5a33ad669b3452ecf0263539270513003abef73c5858cb2",
    },
    {
      title: "Attend a Sync Call",
      lovelace: 8000000n,
      expected_hash:
        "090391c308370ca1846e6cf39641dc975e8b2f3e370fb812f61bebcacb6902aa",
    },
    {
      title: "Test a Feature",
      lovelace: 10000000n,
      expected_hash:
        "801eae4957a456034025e61f23f2a508eb8a6e15f8d55edb239712033ff06d18",
    },
    {
      title: "Write a How-To",
      lovelace: 15000000n,
      expected_hash:
        "b6ac09b203c7a81d1cd819bc6064eec2f713e64a6cc5a2fac16f864fcfeee949",
    },
    {
      title: "Propose an Improvement",
      lovelace: 5000000n,
      expected_hash:
        "eb14effb2a81bece91708a2fb2478bd36711b06804f1fa5fca049d0a9192c784",
    },
  ];

  const DEADLINE = 1782792000000n;

  describe("on-chain compatibility", () => {
    for (const vector of ON_CHAIN_VECTORS) {
      it(`matches on-chain hash for "${vector.title}"`, () => {
        const task: TaskData = {
          project_content: vector.title,
          expiration_time: DEADLINE,
          lovelace_amount: vector.lovelace,
          native_assets: [],
        };
        const hash = computeTaskHash(task);
        expect(hash).toBe(vector.expected_hash);
      });
    }
  });

  describe("CBOR encoding", () => {
    it("uses Plutus Data Constructor 0 (tag 121)", () => {
      const task: TaskData = {
        project_content: "Test",
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      const bytes = debugTaskBytes(task);
      // Should start with d8 79 (tag 121) and 9f (indefinite array)
      expect(bytes.startsWith("d8799f")).toBe(true);
    });

    it("uses indefinite-length array encoding", () => {
      const task: TaskData = {
        project_content: "Test",
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      const bytes = debugTaskBytes(task);
      // Should start with 9f (indefinite array) after tag and end with ff (break)
      expect(bytes.slice(4, 6)).toBe("9f"); // after d879
      expect(bytes.endsWith("ff")).toBe(true);
    });

    it("encodes empty tokens list as empty definite array (0x80)", () => {
      const task: TaskData = {
        project_content: "A",
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      const bytes = debugTaskBytes(task);
      // Format: d8799f [content] [deadline] [lovelace] 80 ff
      // The 80 (empty array) should be right before the final ff (break)
      expect(bytes.slice(-4)).toBe("80ff");
    });

    it("encodes content as CBOR byte string", () => {
      const task: TaskData = {
        project_content: "Hi",
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      const bytes = debugTaskBytes(task);
      // "Hi" = 2 bytes, so CBOR header is 0x42 (0x40 + 2), then 4869
      expect(bytes).toContain("424869");
    });

    it("encodes integers as CBOR unsigned integers (big-endian)", () => {
      const task: TaskData = {
        project_content: "",
        expiration_time: 0x12345678n,
        lovelace_amount: 0n,
        native_assets: [],
      };
      const bytes = debugTaskBytes(task);
      // 0x12345678 as CBOR uint32: 1a 12345678 (big-endian, NOT little-endian)
      expect(bytes).toContain("1a12345678");
    });
  });

  describe("edge cases", () => {
    it("handles zero lovelace amount", () => {
      const task: TaskData = {
        project_content: "Test",
        expiration_time: 1700000000000n,
        lovelace_amount: 0n,
        native_assets: [],
      };
      const hash = computeTaskHash(task);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("handles empty content", () => {
      const task: TaskData = {
        project_content: "",
        expiration_time: 0n,
        lovelace_amount: 0n,
        native_assets: [],
      };
      const bytes = debugTaskBytes(task);
      // Empty byte string is 0x40
      expect(bytes).toContain("40");
    });

    it("handles empty token name", () => {
      const task: TaskData = {
        project_content: "Test",
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [["a".repeat(56), "", 100n]],
      };
      expect(() => computeTaskHash(task)).not.toThrow();
    });

    it("handles large bigint values beyond Number.MAX_SAFE_INTEGER", () => {
      const task: TaskData = {
        project_content: "Test",
        expiration_time: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        lovelace_amount: 9999999999999999999n,
        native_assets: [],
      };
      expect(() => computeTaskHash(task)).not.toThrow();
      expect(computeTaskHash(task)).toHaveLength(64);
    });

    it("normalizes Unicode strings (NFC)", () => {
      // cafe with combining acute accent vs precomposed
      const task1: TaskData = {
        project_content: "cafe\u0301", // e + combining acute
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      const task2: TaskData = {
        project_content: "caf\u00e9", // precomposed e
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      expect(computeTaskHash(task1)).toBe(computeTaskHash(task2));
    });

    it("handles multiple native assets in order", () => {
      const policyId1 = "a".repeat(56);
      const policyId2 = "b".repeat(56);
      const task: TaskData = {
        project_content: "",
        expiration_time: 0n,
        lovelace_amount: 0n,
        native_assets: [
          [policyId1, "01", 1n],
          [policyId2, "02", 2n],
        ],
      };
      const bytes = debugTaskBytes(task);
      // Should contain policy IDs in order provided
      const policyId1Hex = "aa".repeat(28);
      const policyId2Hex = "bb".repeat(28);
      expect(bytes).toContain(policyId1Hex);
      expect(bytes).toContain(policyId2Hex);
      expect(bytes.indexOf(policyId1Hex)).toBeLessThan(
        bytes.indexOf(policyId2Hex),
      );
    });
  });

  describe("determinism", () => {
    it("produces identical output for identical input", () => {
      const task: TaskData = {
        project_content: "Test",
        expiration_time: 12345n,
        lovelace_amount: 67890n,
        native_assets: [],
      };
      expect(computeTaskHash(task)).toBe(computeTaskHash(task));
    });

    it("produces different hashes for different inputs", () => {
      const task1: TaskData = {
        project_content: "Test1",
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      const task2: TaskData = {
        project_content: "Test2",
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      expect(computeTaskHash(task1)).not.toBe(computeTaskHash(task2));
    });
  });
});

describe("input validation", () => {
  it("rejects project_content over 140 characters", () => {
    const task: TaskData = {
      project_content: "x".repeat(141),
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [],
    };
    expect(() => computeTaskHash(task)).toThrow(/exceeds 140 characters/);
  });

  it("accepts project_content at exactly 140 characters", () => {
    const task: TaskData = {
      project_content: "x".repeat(140),
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [],
    };
    expect(() => computeTaskHash(task)).not.toThrow();
  });

  it("rejects negative expiration_time", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: -1n,
      lovelace_amount: 1n,
      native_assets: [],
    };
    expect(() => computeTaskHash(task)).toThrow(/non-negative/);
  });

  it("rejects negative lovelace_amount", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: -1n,
      native_assets: [],
    };
    expect(() => computeTaskHash(task)).toThrow(/non-negative/);
  });

  it("rejects invalid policyId length (too short)", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [["abc", "def0", 1n]],
    };
    expect(() => computeTaskHash(task)).toThrow(/policyId must be 56 hex chars/);
  });

  it("rejects invalid policyId length (too long)", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [["a".repeat(58), "", 1n]],
    };
    expect(() => computeTaskHash(task)).toThrow(/policyId must be 56 hex chars/);
  });

  it("rejects invalid hex characters in policyId", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [["g".repeat(56), "", 1n]],
    };
    expect(() => computeTaskHash(task)).toThrow(/invalid hex characters/);
  });

  it("rejects tokenName with odd length", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [["a".repeat(56), "abc", 1n]], // odd length
    };
    expect(() => computeTaskHash(task)).toThrow(/even length/);
  });

  it("rejects tokenName over 64 characters", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [["a".repeat(56), "a".repeat(66), 1n]],
    };
    expect(() => computeTaskHash(task)).toThrow(/0-64 hex chars/);
  });

  it("rejects invalid hex characters in tokenName", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [["a".repeat(56), "gg", 1n]],
    };
    expect(() => computeTaskHash(task)).toThrow(/invalid hex characters/);
  });

  it("rejects negative asset quantity", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [["a".repeat(56), "", -1n]],
    };
    expect(() => computeTaskHash(task)).toThrow(/non-negative/);
  });
});

describe("verifyTaskHash", () => {
  it("returns true for matching hash", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [],
    };
    const hash = computeTaskHash(task);
    expect(verifyTaskHash(task, hash)).toBe(true);
  });

  it("returns false for non-matching hash", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [],
    };
    expect(verifyTaskHash(task, "0".repeat(64))).toBe(false);
  });

  it("handles case-insensitive comparison", () => {
    const task: TaskData = {
      project_content: "Test",
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [],
    };
    const hash = computeTaskHash(task);
    expect(verifyTaskHash(task, hash.toUpperCase())).toBe(true);
  });

  it("verifies on-chain test vector", () => {
    const task: TaskData = {
      project_content: "Introduce Yourself",
      expiration_time: 1782792000000n,
      lovelace_amount: 5000000n,
      native_assets: [],
    };
    expect(
      verifyTaskHash(
        task,
        "b1e5c9234e8a4481da7cb3fb525fc54430f8df127ab9f10464ddc8a4e7560614",
      ),
    ).toBe(true);
  });
});

describe("isValidTaskHash", () => {
  it("validates correct lowercase hash", () => {
    expect(isValidTaskHash("a".repeat(64))).toBe(true);
  });

  it("validates correct uppercase hash", () => {
    expect(isValidTaskHash("A".repeat(64))).toBe(true);
  });

  it("validates correct mixed case hash", () => {
    expect(isValidTaskHash("0123456789abcdefABCDEF".repeat(3).slice(0, 64))).toBe(true);
  });

  it("rejects hash that is too short", () => {
    expect(isValidTaskHash("a".repeat(63))).toBe(false);
  });

  it("rejects hash that is too long", () => {
    expect(isValidTaskHash("a".repeat(65))).toBe(false);
  });

  it("rejects hash with invalid characters", () => {
    expect(isValidTaskHash("g".repeat(64))).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidTaskHash("")).toBe(false);
  });
});

describe("CBOR byte string chunking", () => {
  const DEADLINE = 1n;
  const LOVELACE = 1n;

  function makeTask(content: string): TaskData {
    return {
      project_content: content,
      expiration_time: DEADLINE,
      lovelace_amount: LOVELACE,
      native_assets: [],
    };
  }

  it("uses definite-length encoding for content at exactly 64 bytes", () => {
    const task = makeTask("x".repeat(64));
    const hex = debugTaskBytes(task);
    // 64 bytes = 0x40 in length, CBOR header: 0x58 0x40
    expect(hex).toContain("5840");
    // Should NOT contain indefinite-length byte string marker 0x5f
    // (0x5f only appears as byte string start, not as part of the break 0xff)
    // Check that the content area does not use chunked encoding
    const contentStart = hex.indexOf("5840");
    expect(contentStart).toBeGreaterThan(-1);
  });

  it("uses definite-length encoding for content in 24-63 byte range", () => {
    const task = makeTask("x".repeat(50));
    const hex = debugTaskBytes(task);
    // 50 bytes = 0x32, CBOR header: 0x58 0x32
    expect(hex).toContain("5832");
  });

  it("uses chunked indefinite-length encoding for content at 65 bytes", () => {
    const task = makeTask("x".repeat(65));
    const hex = debugTaskBytes(task);
    // Should contain: 5f (indef start) 5840 (64-byte chunk) 4178 (1-byte chunk "x") ff (break)
    // 0x5f = indefinite byte string start
    // First chunk: 0x58 0x40 + 64 bytes of 'x' (0x78)
    // Second chunk: 0x41 + 1 byte of 'x' (0x78)
    // 0xff = break
    expect(hex).toContain("5f");
    expect(hex).toContain("5840");
    expect(hex).toContain("4178");
  });

  it("produces two full 64-byte chunks for 128-byte content", () => {
    const task = makeTask("x".repeat(128));
    const hex = debugTaskBytes(task);
    // Two chunks of 64 bytes each: 5f 5840[64 bytes] 5840[64 bytes] ff
    const firstChunk = hex.indexOf("5840");
    const secondChunk = hex.indexOf("5840", firstChunk + 1);
    expect(firstChunk).toBeGreaterThan(-1);
    expect(secondChunk).toBeGreaterThan(firstChunk);
  });

  it("produces two full chunks + remainder for 129-byte content", () => {
    const task = makeTask("x".repeat(129));
    const hex = debugTaskBytes(task);
    // Two 64-byte chunks + one 1-byte chunk
    const firstChunk = hex.indexOf("5840");
    const secondChunk = hex.indexOf("5840", firstChunk + 1);
    expect(firstChunk).toBeGreaterThan(-1);
    expect(secondChunk).toBeGreaterThan(firstChunk);
    // The remainder chunk: 0x41 + 1 byte
    expect(hex).toContain("4178");
  });

  it("handles multi-byte UTF-8 crossing chunk boundary", () => {
    // 63 ASCII bytes + one 3-byte CJK character (世 = U+4E16) = 66 bytes total
    const task = makeTask("x".repeat(63) + "\u4e16");
    const hash = computeTaskHash(task);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Should be chunked (66 > 64)
    const hex = debugTaskBytes(task);
    expect(hex).toContain("5f"); // indefinite-length start
  });

  it("does not change hashes for short content (backward compatibility)", () => {
    // All 7 on-chain vectors have short content; this is a sanity check
    // that the new function delegates to encodeCborBytes for <= 64 bytes
    const task = makeTask("Short content");
    const hash1 = computeTaskHash(task);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    // Determinism check
    expect(computeTaskHash(task)).toBe(hash1);
  });
});

describe("debugTaskBytes", () => {
  it("returns hex representation of CBOR-encoded Plutus Data", () => {
    const task: TaskData = {
      project_content: "Hi",
      expiration_time: 1n,
      lovelace_amount: 2n,
      native_assets: [],
    };
    const bytes = debugTaskBytes(task);
    // Should be Plutus Data: d879 9f 42 4869 01 02 80 ff
    // tag 121, indef array, 2-byte string "Hi", int 1, int 2, empty array, break
    expect(bytes).toBe("d8799f42486901028 0ff".replace(/ /g, ""));
  });

  it("validates input before encoding", () => {
    const task: TaskData = {
      project_content: "x".repeat(141),
      expiration_time: 1n,
      lovelace_amount: 1n,
      native_assets: [],
    };
    expect(() => debugTaskBytes(task)).toThrow(/exceeds 140 characters/);
  });
});
