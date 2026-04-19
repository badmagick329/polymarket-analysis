import type { GammaTag, TopicResolution } from "./types.ts";

export function resolveTopic(input: string, tags: GammaTag[]): TopicResolution {
  const query = normalize(input);
  if (!query) return { kind: "not_found", candidates: [] };

  const exact = tags.find((tag) => tag.id === input || normalize(tag.slug ?? "") === query || normalize(tag.label ?? "") === query);
  if (exact) return { kind: "matched", tag: exact };

  const scored = tags
    .map((tag) => ({ tag, score: scoreTag(query, tag) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || tagName(a.tag).localeCompare(tagName(b.tag)));

  if (scored.length === 0) return { kind: "not_found", candidates: [] };

  const bestScore = scored[0]?.score ?? 0;
  const candidates = scored.filter((entry) => bestScore - entry.score <= 10).slice(0, 10).map((entry) => entry.tag);

  if (candidates.length === 1 && bestScore >= 70) {
    return { kind: "matched", tag: candidates[0]! };
  }

  return { kind: "ambiguous", candidates };
}

export function tagName(tag: GammaTag): string {
  return tag.label || tag.slug || tag.id;
}

function scoreTag(query: string, tag: GammaTag): number {
  const slug = normalize(tag.slug ?? "");
  const label = normalize(tag.label ?? "");
  const haystacks = [slug, label].filter(Boolean);

  if (haystacks.some((value) => value.startsWith(query))) return 80;
  if (haystacks.some((value) => value.includes(query))) return 70;
  if (haystacks.some((value) => query.includes(value) && value.length >= 4)) return 60;
  return 0;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
