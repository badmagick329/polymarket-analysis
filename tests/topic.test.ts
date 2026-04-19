import { describe, expect, test } from "bun:test";
import { resolveTopic } from "../src/topic.ts";
import type { GammaTag } from "../src/types.ts";

const tags: GammaTag[] = [
  { id: "2", label: "Politics", slug: "politics" },
  { id: "188", label: "U.S. Politics", slug: "uptspt-politics" },
  { id: "3", label: "Crypto", slug: "crypto" },
];

describe("resolveTopic", () => {
  test("matches exact id", () => {
    expect(resolveTopic("2", tags)).toEqual({ kind: "matched", tag: tags[0]! });
  });

  test("matches exact slug", () => {
    expect(resolveTopic("crypto", tags)).toEqual({ kind: "matched", tag: tags[2]! });
  });

  test("matches exact label", () => {
    expect(resolveTopic("Politics", tags)).toEqual({ kind: "matched", tag: tags[0]! });
  });

  test("returns ambiguous fuzzy candidates", () => {
    const result = resolveTopic("pol", tags);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates.map((tag) => tag.id)).toEqual(["2", "188"]);
    }
  });
});
