const { test } = require("node:test");
const assert = require("node:assert/strict");

const { normalizeInterests, interestOverlap, rankCandidates } = require("../src/matching/score");

test("normalizeInterests lowercases, trims, and de-duplicates", () => {
  assert.deepEqual(normalizeInterests([" Music ", "music", "GAMING"]), ["music", "gaming"]);
});

test("normalizeInterests drops non-strings and blanks", () => {
  assert.deepEqual(normalizeInterests(["ok", 5, "", null, "   "]), ["ok"]);
});

test("normalizeInterests caps count (10) and length (30)", () => {
  const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
  assert.equal(normalizeInterests(many).length, 10);
  assert.equal(normalizeInterests(["x".repeat(50)])[0].length, 30);
});

test("normalizeInterests tolerates non-array input", () => {
  assert.deepEqual(normalizeInterests(undefined), []);
  assert.deepEqual(normalizeInterests("music"), []);
});

test("interestOverlap counts shared tags", () => {
  assert.equal(interestOverlap(["a", "b", "c"], ["b", "c", "d"]), 2);
  assert.equal(interestOverlap([], ["a"]), 0);
  assert.equal(interestOverlap(["a"], []), 0);
});

test("rankCandidates orders by overlap, then by longest wait", () => {
  const searcher = { id: "s", interests: ["music", "art"] };
  const candidates = [
    { id: "a", interests: ["music"], joinedAt: 100 }, // overlap 1
    { id: "b", interests: ["music", "art"], joinedAt: 200 }, // overlap 2
    { id: "c", interests: ["sports"], joinedAt: 50 }, // overlap 0
    { id: "s", interests: ["music"], joinedAt: 0 }, // self — excluded
  ];
  assert.deepEqual(
    rankCandidates(searcher, candidates).map((r) => r.entry.id),
    ["b", "a", "c"],
  );
});

test("rankCandidates breaks overlap ties toward the oldest waiter", () => {
  const searcher = { id: "s", interests: ["x"] };
  const candidates = [
    { id: "young", interests: ["x"], joinedAt: 300 },
    { id: "old", interests: ["x"], joinedAt: 100 },
  ];
  assert.deepEqual(
    rankCandidates(searcher, candidates).map((r) => r.entry.id),
    ["old", "young"],
  );
});

test("rankCandidates excludes blocked candidates", () => {
  const searcher = { id: "s", interests: ["x"] };
  const candidates = [
    { id: "blocked", interests: ["x"], joinedAt: 1 },
    { id: "ok", interests: ["x"], joinedAt: 2 },
  ];
  const ranked = rankCandidates(searcher, candidates, { isBlocked: (e) => e.id === "blocked" });
  assert.deepEqual(ranked.map((r) => r.entry.id), ["ok"]);
});
