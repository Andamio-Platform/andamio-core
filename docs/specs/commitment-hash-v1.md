# Commitment Evidence Hash — canonical-v1

**Status: FROZEN.** This document specifies the canonical algorithm for hashing task-commitment evidence in the Andamio protocol, as implemented by `computeCommitmentHash` in `src/utils/hashing/commitment-hash.ts`. Any behavioral change to this algorithm is a new version (canonical-v2), never an edit to v1 or to this document. The freeze covers the reference implementation's observable behavior on **all** inputs, including out-of-contract ones: changing what a `Date` (or any non-JSON value) hashes to is also a new version.

The deprecated aliases `computeAssignmentInfoHash`, `verifyAssignmentInfoHash`, and `isValidAssignmentInfoHash` alias the canonical functions, so this freeze covers them identically.

## Purpose

The evidence body (a Tiptap JSON document) is stored off-chain; its hash is stored on-chain as `commitment_hash`. The hash provides compact storage, tamper-evidence, and privacy. This spec exists so that any reimplementation (e.g. a Go server-side verifier) can reproduce the hash byte-for-byte. The golden-vector fixture (see below) is the executable form of this contract.

## Input domain

The normative input domain is **JSON values** — anything obtainable from `JSON.parse`: `null`, booleans, finite numbers, strings, arrays, and plain objects. This matches the real hash-at-write flow, where evidence arrives as parsed JSON.

Behavior on other JavaScript values (`Date`, `bigint`, `NaN`, `Infinity`, functions, `undefined` in various positions) is **out-of-contract for portability**: it is not guaranteed reproducible in other languages, and callers must ensure JSON-domain input before hashing at write time (out-of-contract inputs are silently coerced — e.g. a `Date` normalizes to `{}`, and `{a: 1, b: undefined}` hashes identically to `{a: 1}`). It is still **frozen for the reference implementation**, per the freeze declaration above.

## Algorithm

```text
hash = lowercaseHex( blake2b-256( utf8( JSON.stringify( normalize(value) ) ) ) )
```

### 1. Normalize (recursive)

- `null` and `undefined` → `null`
- string → trimmed with the ECMAScript `String.prototype.trim` whitespace set (enumerated below)
- number, boolean → unchanged
- array → each element normalized recursively, order preserved
- object → keys sorted with JavaScript default sort (UTF-16 code-unit order); keys whose value is `undefined` are **dropped**; remaining values normalized recursively

**Trim whitespace set** (ECMAScript *WhiteSpace* ∪ *LineTerminator*):
U+0009 TAB, U+000A LF, U+000B VT, U+000C FF, U+000D CR, U+0020 SPACE, U+00A0 NBSP, U+1680, U+2000–U+200A, U+2028 LS, U+2029 PS, U+202F, U+205F, U+3000 IDEOGRAPHIC SPACE, U+FEFF ZWNBSP.

Explicitly **not** trimmed (common cross-language traps): U+0085 NEL (Go's `strings.TrimSpace` trims it; this algorithm does not), U+200B ZWSP. The `exotic-whitespace-trim-set` golden vector pins these facts.

**No Unicode normalization.** The algorithm applies no NFC/NFD normalization: composed and decomposed forms of the same visible text hash differently (pinned by the `unicode-nfc-composed` / `unicode-nfd-decomposed` vector pair). Note this deliberately differs from this package's `computeTaskHash`, which applies NFC — do not copy that convention here.

### 2. Serialize — ECMAScript `JSON.stringify` semantics (normative)

- No whitespace between tokens (no indent, no spaces).
- Minimal escaping only: `"` → `\"`, `\` → `\\`, control characters U+0000–U+001F as `\b`, `\t`, `\n`, `\f`, `\r` or `\uXXXX`.
- **No HTML escaping:** `<`, `>`, `&` are emitted raw.
- U+2028 and U+2029 are emitted raw (inside strings they will already have been trimmed at boundaries by step 1, but interior occurrences stay raw).
- Numbers use ECMAScript number-to-string form: shortest round-trip decimal, exponent notation below 1e-6 and at/above 1e21 (`1e-7`, `1e+21`), and `-0` serializes as `"0"`. The `number-form-probes` vector pins these.

**Go implementer guidance:** `encoding/json`'s `json.Marshal` HTML-escapes `<`, `>`, `&` and escapes U+2028/U+2029 — that output is **wrong** for this spec. Use a `json.Encoder` with `SetEscapeHTML(false)`, note that `Encoder.Encode` appends a trailing newline which must be stripped, and verify number formatting against the vectors (Go's default float formatting differs from ECMAScript, e.g. exponent digit counts).

### 3. Encode and digest

UTF-8 encode the serialized string, hash with Blake2b-256 (32-byte digest, no key), and render as 64 lowercase hex characters.

## Tamper-evidence boundary

The hash commits to the **parsed JSON value**, not the stored bytes. The following stored-text differences are invisible to verification, by design:

- whitespace at string-run boundaries (trimmed during normalization — including leading indent and trailing newlines inside code-block text)
- object key order and insignificant inter-token whitespace in the stored text
- duplicate keys in stored JSON text — parsers disagree (first-wins vs last-wins), so verifiers **must render exactly the parsed value they hashed**, from the same parse; never re-read the raw stored bytes for display after verifying the parsed value

Two visually or byte-wise different stored documents can therefore share a valid hash. Whitespace-boundary edits are outside tamper-evidence.

A hash carries **no algorithm identifier**: era (v0 vs v1) is inferred by verifiers, never encoded. Any future canonical-v2 must introduce an out-of-band algorithm marker.

## Golden vectors

The cross-implementation contract is `src/utils/hashing/vectors/commitment-hash-vectors.json`: 12 synthetic Tiptap documents with, for each, the exact `canonicalJson` (the serialized normalized form — use it to tell normalization bugs from serialization bugs) and the frozen `v1Hash`. Entries covering the legacy algorithm also carry `v0Hash` (see appendix).

The fixture is not reachable through the package's `exports` map — reimplementations vendor or copy the file (it ships in the npm tarball under `src/`). A reimplementation is correct when it reproduces every `canonicalJson` and `v1Hash` byte-for-byte. Never regenerate frozen values: if an implementation disagrees with the fixture, the implementation is wrong.

## Supported verifiers

- `verifyCommitmentHash(evidence, expectedHash)` — the supported boolean verifier. Case-insensitive hash compare; returns `false` on malformed `expectedHash`; never throws.
- `verifyEvidenceDetailed(evidence, onChainHash)` — result object with both hashes and a message.
- `verifyEvidenceAgainstEras(evidence, onChainHash)` — tries v1 then legacy v0 (guarded: skips v0 when it cannot be computed); returns which algorithm matched. A v0 match is evidence, not proof, of era — see appendix.

## Appendix: legacy v0 (`legacyHashV0`)

The pre-canonical algorithm, from andamio-app-v2's `src/lib/hashing.ts`. **v0 is still a live writer**: app-v2's assignment commit/update paths hash with it until Andamio-Platform/andamio-app-v2#832 lands, so rows verifiable only under v0 continue to be written — a growing set, not a closed era.

v0 differs from v1 **only** in normalization's string handling: **no trimming** (and no explicit undefined-valued-key drop — `JSON.stringify` drops those keys anyway, so the observable difference is trimming alone). Serialization, encoding, and digest are identical. Consequences:

- v0 and v1 produce **identical** hashes for any document with no boundary whitespace in any string — most documents. Era classification from a hash match is therefore impossible in general; a matched algorithm is evidence, not proof, of era.
- The four whitespace-boundary vectors in the fixture carry a `v0Hash` differing from `v1Hash`; `cross-language-parity-bold` carries a coinciding `v0Hash` pinning the ambiguity property.
- `v0Hash` fixture values were **cross-generated from app-v2's actual implementation**, not from this package's port — the port is validated against them.
- Port difference (deliberate, the only one): the app-v2 original crashes on input that `JSON.stringify` maps to `undefined` (e.g. top-level `undefined`); `legacyHashV0` throws a descriptive error instead. No production hash can exist for such input.

Never hash new content with v0. It exists for era-aware verification only.
