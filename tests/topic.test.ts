import { describe, expect, test } from "bun:test";
import { filterTopics, listTopics } from "../src/cli.ts";
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

describe("filterTopics", () => {
  test("matches label and slug case-insensitively", () => {
    expect(filterTopics(tags, "POLIT").map((tag) => tag.id)).toEqual(["2", "188"]);
    expect(filterTopics(tags, "uptspt").map((tag) => tag.id)).toEqual(["188"]);
  });

  test("returns all topics when search is empty", () => {
    expect(filterTopics(tags, "").map((tag) => tag.id)).toEqual(["2", "188", "3"]);
  });

  test("listTopics truncates by limit", () => {
    expect(listTopics(tags, null, 2).map((tag) => tag.id)).toEqual(["2", "188"]);
  });
});
