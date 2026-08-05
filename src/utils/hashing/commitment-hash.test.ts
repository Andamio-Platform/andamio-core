import { describe, it, expect } from "vitest";
import {
  computeCommitmentHash,
  verifyCommitmentHash,
  isValidCommitmentHash,
  normalizeForHashing,
  legacyHashV0,
  verifyEvidenceAgainstEras,
} from "./commitment-hash";
import vectorsFixture from "./vectors/commitment-hash-vectors.json";

type CommitmentHashVector = {
  id: string;
  description: string;
  input: unknown;
  canonicalJson: string;
  v1Hash: string;
  v0Hash?: string;
};

const GOLDEN_VECTORS = vectorsFixture.vectors as CommitmentHashVector[];

// Golden vectors for the canonical-v1 algorithm. The hashes were generated
// by running computeCommitmentHash and FROZEN as literals in the fixture —
// if any of these tests fail, the implementation regressed; never
// regenerate the fixture to match new code. Each fixture entry's
// description flags deliberate behaviors (per-run trimming, trimming
// inside code blocks, no Unicode NFC normalization) that must not be
// "fixed".
//
// Cross-language parity: the fixture entry "cross-language-parity-bold"
// (expected hash
// 8bd3d0b5a9c157005616a34f3a6ec7ba5d4b4961cc277d408ddac8e86a17434f)
// is mirrored by the Go port of this algorithm in andamio-cli at
// cmd/andamio/helpers.go (normalizeForHashing + wrapEvidence), pinned by
// cmd/andamio/commitment_hash_parity_test.go with the SAME input and
// expected hash. Both sides must agree on:
//   - key sorting (alphabetical, recursive)
//   - string trimming (leading/trailing only; interior whitespace
//     preserved)
//   - null / undefined handling (undefined dropped, null preserved)
//   - JSON serialization + UTF-8 encoding + Blake2b-256
//
// If that vector changes (either side), update the twin vector in the
// other repo — otherwise CLI-submitted evidence won't match gateway-
// computed commitments on-chain.
describe("golden vectors (canonical v1)", () => {
  it("fixture integrity: contains exactly the 12 frozen vectors", () => {
    // Tripwire against silent vector deletion or truncation — changing a
    // frozen hash already fails the loop tests below; this catches a
    // vector quietly disappearing.
    expect(GOLDEN_VECTORS.map((v) => v.id)).toEqual([
      "cross-language-parity-bold",
      "boundary-whitespace-marked-runs",
      "code-block-indent-and-trailing-newline",
      "empty-paragraph",
      "whitespace-only-paragraph",
      "table-document",
      "unicode-text",
      "exotic-whitespace-trim-set",
      "unicode-nfc-composed",
      "unicode-nfd-decomposed",
      "json-serialization-escapes",
      "number-form-probes",
    ]);
  });

  it("includes the cross-language parity vector (andamio-cli Go twin)", () => {
    const parity = GOLDEN_VECTORS.find(
      (v) => v.id === "cross-language-parity-bold",
    );
    expect(parity?.v1Hash).toBe(
      "8bd3d0b5a9c157005616a34f3a6ec7ba5d4b4961cc277d408ddac8e86a17434f",
    );
  });

  for (const vector of GOLDEN_VECTORS) {
    it(`matches frozen canonical JSON and v1 hash for "${vector.id}"`, () => {
      expect(JSON.stringify(normalizeForHashing(vector.input))).toBe(
        vector.canonicalJson,
      );
      expect(computeCommitmentHash(vector.input)).toBe(vector.v1Hash);
    });

    it(`is idempotent over canonical JSON for "${vector.id}"`, () => {
      // Hashing the already-normalized form must yield the same hash
      // (normalization is a fixed point).
      expect(computeCommitmentHash(JSON.parse(vector.canonicalJson))).toBe(
        vector.v1Hash,
      );
    });
  }
});

describe("computeCommitmentHash", () => {
  it("produces a 64-character lowercase hex hash", () => {
    const hash = computeCommitmentHash({ type: "doc", content: [] });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical input", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
    };
    expect(computeCommitmentHash(doc)).toBe(computeCommitmentHash(doc));
  });

  it("produces the same hash regardless of object-key insertion order", () => {
    // normalizeForHashing sorts keys alphabetically before serializing,
    // so inputs that differ only in authoring order must hash identically.
    const docA = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    const docB = {
      content: [{ type: "paragraph" }],
      type: "doc",
    };
    expect(computeCommitmentHash(docA)).toBe(computeCommitmentHash(docB));
  });
});

describe("verifyCommitmentHash", () => {
  it("returns true for each golden vector's frozen hash", () => {
    for (const vector of GOLDEN_VECTORS) {
      expect(verifyCommitmentHash(vector.input, vector.v1Hash)).toBe(true);
    }
  });

  it("is case-insensitive on the expected hash", () => {
    const doc = { type: "doc" };
    const hash = computeCommitmentHash(doc);
    expect(verifyCommitmentHash(doc, hash.toUpperCase())).toBe(true);
  });

  it("returns false for a non-matching hash", () => {
    const doc = { type: "doc" };
    expect(verifyCommitmentHash(doc, "0".repeat(64))).toBe(false);
  });
});

describe("isValidCommitmentHash", () => {
  it("accepts 64-character lowercase hex", () => {
    expect(isValidCommitmentHash("a".repeat(64))).toBe(true);
  });

  it("accepts 64-character uppercase hex", () => {
    expect(isValidCommitmentHash("A".repeat(64))).toBe(true);
  });

  it("rejects strings that are too short", () => {
    expect(isValidCommitmentHash("a".repeat(63))).toBe(false);
  });

  it("rejects strings that are too long", () => {
    expect(isValidCommitmentHash("a".repeat(65))).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidCommitmentHash("g".repeat(64))).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isValidCommitmentHash("")).toBe(false);
  });
});

// v0Hash fixture values were CROSS-GENERATED by running the ORIGINAL
// andamio-app-v2 hasher (src/lib/hashing.ts: normalizeContentStructure +
// hashNormalizedContent, copied verbatim) against each input — never by
// running legacyHashV0. If legacyHashV0 disagrees with a v0Hash literal,
// the port is wrong; fix the port, never the frozen value.
describe("legacyHashV0", () => {
  it("matches every cross-generated v0Hash fixture value (port vs original)", () => {
    const withV0 = GOLDEN_VECTORS.filter((v) => v.v0Hash !== undefined);
    expect(withV0.length).toBeGreaterThan(0);
    for (const vector of withV0) {
      expect(legacyHashV0(vector.input)).toBe(vector.v0Hash);
    }
  });

  it("diverges from computeCommitmentHash on boundary whitespace", () => {
    const vector = GOLDEN_VECTORS.find(
      (v) => v.id === "boundary-whitespace-marked-runs",
    )!;
    const v0 = legacyHashV0(vector.input);
    expect(v0).toBe(vector.v0Hash);
    expect(v0).not.toBe(computeCommitmentHash(vector.input));
  });

  it("coincides with computeCommitmentHash when there is no boundary whitespace", () => {
    // Era-ambiguity property: for documents with no boundary whitespace,
    // v0 (no trimming) and v1 (trimming) normalize to identical bytes, so
    // a hash match does NOT identify which algorithm wrote the row.
    const vector = GOLDEN_VECTORS.find(
      (v) => v.id === "cross-language-parity-bold",
    )!;
    expect(legacyHashV0(vector.input)).toBe(vector.v1Hash);
    expect(legacyHashV0(vector.input)).toBe(
      computeCommitmentHash(vector.input),
    );
  });

  it("throws a descriptive error for undefined evidence", () => {
    expect(() => legacyHashV0(undefined)).toThrow(
      /not JSON-serializable.*undefined/,
    );
  });
});

describe("verifyEvidenceAgainstEras", () => {
  const divergent = GOLDEN_VECTORS.find(
    (v) => v.id === "boundary-whitespace-marked-runs",
  )!;

  it("reports algorithm v1 for a v1-hashed document", () => {
    const result = verifyEvidenceAgainstEras(divergent.input, divergent.v1Hash);
    expect(result.isValid).toBe(true);
    expect(result.algorithm).toBe("v1");
    expect(result.computedHashes.v1).toBe(divergent.v1Hash);
    expect(result.computedHashes.v0).toBeUndefined();
  });

  it("reports algorithm v0 for a v0-only document", () => {
    const result = verifyEvidenceAgainstEras(divergent.input, divergent.v0Hash!);
    expect(result.isValid).toBe(true);
    expect(result.algorithm).toBe("v0");
    expect(result.computedHashes.v1).toBe(divergent.v1Hash);
    expect(result.computedHashes.v0).toBe(divergent.v0Hash);
    expect(result.message).toMatch(/legacy/i);
  });

  it("is case-insensitive on the expected hash", () => {
    const result = verifyEvidenceAgainstEras(
      divergent.input,
      divergent.v0Hash!.toUpperCase(),
    );
    expect(result.isValid).toBe(true);
    expect(result.algorithm).toBe("v0");
  });

  it("returns both computed hashes for a mismatch", () => {
    const result = verifyEvidenceAgainstEras(divergent.input, "0".repeat(64));
    expect(result.isValid).toBe(false);
    expect(result.algorithm).toBeNull();
    expect(result.computedHashes.v1).toBe(divergent.v1Hash);
    expect(result.computedHashes.v0).toBe(divergent.v0Hash);
  });

  it("returns a format-error result for a malformed expected hash", () => {
    const result = verifyEvidenceAgainstEras(divergent.input, "not-a-hash");
    expect(result.isValid).toBe(false);
    expect(result.algorithm).toBeNull();
    expect(result.computedHashes).toEqual({ v1: "" });
    expect(result.message).toMatch(/Invalid on-chain hash format/);
  });

  it("skips the v0 leg for undefined evidence without throwing", () => {
    // computeCommitmentHash(undefined) is defined (normalizes to null),
    // but legacyHashV0(undefined) throws — the v0 leg must be skipped.
    const result = verifyEvidenceAgainstEras(undefined, "0".repeat(64));
    expect(result.isValid).toBe(false);
    expect(result.algorithm).toBeNull();
    expect(result.computedHashes.v1).toMatch(/^[0-9a-f]{64}$/);
    expect("v0" in result.computedHashes).toBe(false);
    expect(result.message).toMatch(/v0 hash not computable/);
  });
});

describe("verifyCommitmentHash malformed expected hash", () => {
  it("returns false for a non-hash string without throwing", () => {
    expect(verifyCommitmentHash("anything", "not-a-hash")).toBe(false);
  });

  it("returns false for an empty expected hash without throwing", () => {
    expect(verifyCommitmentHash({ type: "doc" }, "")).toBe(false);
  });
});

describe("normalizeForHashing", () => {
  it("sorts object keys alphabetically (recursive)", () => {
    const input = { c: 1, a: { z: 1, y: 2 }, b: 2 };
    const normalized = normalizeForHashing(input) as Record<string, unknown>;
    expect(Object.keys(normalized)).toEqual(["a", "b", "c"]);
    expect(Object.keys(normalized.a as Record<string, unknown>)).toEqual([
      "y",
      "z",
    ]);
  });

  it("preserves array order", () => {
    const input = ["c", "a", "b"];
    expect(normalizeForHashing(input)).toEqual(["c", "a", "b"]);
  });

  it("trims leading and trailing whitespace from strings", () => {
    expect(normalizeForHashing("  hello  ")).toBe("hello");
  });

  it("preserves interior whitespace", () => {
    expect(normalizeForHashing("hello  world")).toBe("hello  world");
  });

  it("converts undefined to null", () => {
    expect(normalizeForHashing(undefined)).toBeNull();
  });

  it("preserves null as null", () => {
    expect(normalizeForHashing(null)).toBeNull();
  });

  it("drops undefined values from objects", () => {
    const input = { a: 1, b: undefined, c: 2 };
    const normalized = normalizeForHashing(input) as Record<string, unknown>;
    expect(normalized).toEqual({ a: 1, c: 2 });
    expect("b" in normalized).toBe(false);
  });

  it("preserves null values in objects", () => {
    const input = { a: 1, b: null, c: 2 };
    expect(normalizeForHashing(input)).toEqual({ a: 1, b: null, c: 2 });
  });

  it("preserves numbers and booleans", () => {
    expect(normalizeForHashing(42)).toBe(42);
    expect(normalizeForHashing(true)).toBe(true);
    expect(normalizeForHashing(false)).toBe(false);
  });
});
