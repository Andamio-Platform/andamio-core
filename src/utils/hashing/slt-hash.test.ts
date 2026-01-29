import { describe, it, expect } from "vitest";
import { computeSltHash } from "./slt-hash";

describe("computeSltHash", () => {
  it("matches the expected on-chain hash for known SLTs", () => {
    const slts = [
      "I can set up a Typescript development environment.",
      "I can use Github CLI to create an issue.",
      "I can run the Andamio T3 App Template locally.",
    ];

    const hash = computeSltHash(slts);

    expect(hash).toBe(
      "eff7d90a6ed2eaf32b523efb25d95f748166158bcce048717a4920478be052cf",
    );
  });
});
