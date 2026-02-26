import { describe, it, expect } from "vitest";
import {
  computeTaskHash,
  verifyTaskHash,
  isValidTaskHash,
  debugTaskBytes,
} from "./task-hash";
import type { TaskData, NativeAsset } from "./task-hash";

describe("computeTaskHash", () => {
  // Golden tests - must match on-chain hashes
  // TODO: Replace placeholder hashes with actual on-chain test vectors from Andamioscan
  describe("on-chain compatibility", () => {
    it.skip("matches known on-chain hash for simple task", () => {
      const task: TaskData = {
        project_content: "Open Task #1",
        expiration_time: 1769027280000n,
        lovelace_amount: 15000000n,
        native_assets: [],
      };
      const hash = computeTaskHash(task);
      // TODO: Replace with actual on-chain hash from Andamioscan
      expect(hash).toBe("EXPECTED_HASH_FROM_ANDAMIOSCAN");
    });

    it.skip("matches known on-chain hash for task with native assets", () => {
      const task: TaskData = {
        project_content: "Task with tokens",
        expiration_time: 1700000000000n,
        lovelace_amount: 1000000n,
        native_assets: [
          // TODO: Replace with real policy ID and token name from on-chain data
          ["a".repeat(56), "746f6b656e6e616d65", 1000n],
        ],
      };
      const hash = computeTaskHash(task);
      // TODO: Replace with actual on-chain hash from Andamioscan
      expect(hash).toBe("EXPECTED_HASH_FROM_ANDAMIOSCAN");
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

    it("encodes zero as single byte [0x00]", () => {
      const task: TaskData = {
        project_content: "",
        expiration_time: 0n,
        lovelace_amount: 0n,
        native_assets: [],
      };
      const bytes = debugTaskBytes(task);
      // Empty content + 0x00 for expiration + 0x00 for lovelace = "0000"
      expect(bytes).toBe("0000");
    });

    it("handles empty native assets as empty bytes", () => {
      const task: TaskData = {
        project_content: "Test",
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      const bytes = debugTaskBytes(task);
      // Should be: "Test" (54657374) + 0x01 + 0x01 = "5465737401 01"
      expect(bytes).toBe("546573740101");
      // No CBOR empty array marker (0x80)
      expect(bytes).not.toContain("80");
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

    it("encodes large integers in little-endian format", () => {
      const task: TaskData = {
        project_content: "",
        expiration_time: 0x12345678n,
        lovelace_amount: 0n,
        native_assets: [],
      };
      const bytes = debugTaskBytes(task);
      // 0x12345678 in little-endian is 78 56 34 12
      // Then 0x00 for lovelace
      expect(bytes).toBe("7856341200");
    });

    it("normalizes Unicode strings (NFC)", () => {
      // café with combining acute accent vs precomposed
      const task1: TaskData = {
        project_content: "cafe\u0301", // e + combining acute
        expiration_time: 1n,
        lovelace_amount: 1n,
        native_assets: [],
      };
      const task2: TaskData = {
        project_content: "caf\u00e9", // precomposed é
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

describe("debugTaskBytes", () => {
  it("returns hex representation of encoded bytes", () => {
    const task: TaskData = {
      project_content: "Hi",
      expiration_time: 1n,
      lovelace_amount: 2n,
      native_assets: [],
    };
    const bytes = debugTaskBytes(task);
    // "Hi" = 0x48 0x69, then 0x01 for expiration, 0x02 for lovelace
    expect(bytes).toBe("48690102");
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
