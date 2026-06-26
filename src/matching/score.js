// Pure, dependency-light matching helpers. No sockets, no I/O — just data in,
// ranking out. This is the highest-value logic to keep unit-testable.
const config = require("../config");

/**
 * Clean a raw interest list from a client into a safe, canonical form:
 * lowercased, trimmed, de-duplicated, length-capped, and count-capped.
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeInterests(raw) {
  if (!Array.isArray(raw)) return [];
  const { maxInterests, maxInterestLength } = config.matching;
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim().toLowerCase().slice(0, maxInterestLength);
    if (cleaned) seen.add(cleaned);
    if (seen.size >= maxInterests) break;
  }
  return [...seen];
}

/**
 * Number of interests two normalized lists share.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number}
 */
function interestOverlap(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(large);
  let count = 0;
  for (const tag of small) {
    if (set.has(tag)) count++;
  }
  return count;
}

/**
 * Rank candidate entries for a searcher, best match first.
 * Ordering: higher interest overlap wins; ties break toward the longest waiter
 * (FIFO fairness). The searcher itself and any blocked candidate are excluded.
 *
 * @param {{ id: string, interests: string[] }} searcher
 * @param {Array<{ id: string, interests: string[], joinedAt: number }>} candidates
 * @param {{ isBlocked?: (entry) => boolean }} [options]
 * @returns {Array<{ entry: object, overlap: number }>}
 */
function rankCandidates(searcher, candidates, options = {}) {
  const { isBlocked = () => false } = options;
  const ranked = [];
  for (const entry of candidates) {
    if (entry.id === searcher.id) continue;
    if (isBlocked(entry)) continue;
    ranked.push({ entry, overlap: interestOverlap(searcher.interests, entry.interests) });
  }
  ranked.sort((x, y) => y.overlap - x.overlap || x.entry.joinedAt - y.entry.joinedAt);
  return ranked;
}

module.exports = { normalizeInterests, interestOverlap, rankCandidates };
