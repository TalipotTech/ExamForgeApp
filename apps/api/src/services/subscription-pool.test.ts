import { describe, expect, it } from "vitest";
import {
  allocateShares,
  periodBounds,
  previousPeriodMonth,
  type CreatorScore,
} from "./subscription-pool.js";

const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";
const D = "00000000-0000-0000-0000-000000000004";
const E = "00000000-0000-0000-0000-000000000005";

function score(creatorId: string, freeViewCount: number, totalWatchMinutes: number): CreatorScore {
  return {
    creatorId,
    freeViewCount,
    totalWatchMinutes,
    weightedScore: freeViewCount * 1 + totalWatchMinutes * 0.5,
  };
}

describe("subscription-pool / periodBounds", () => {
  it("returns the start of the month and the start of the next month (UTC)", () => {
    const { startsAt, endsAt } = periodBounds("2026-04");
    expect(startsAt.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("rejects malformed periodMonth", () => {
    expect(() => periodBounds("2026-13")).toThrow(/Invalid periodMonth/);
    expect(() => periodBounds("2026-1")).toThrow(/Invalid periodMonth/);
    expect(() => periodBounds("not-a-date")).toThrow(/Invalid periodMonth/);
  });
});

describe("subscription-pool / previousPeriodMonth", () => {
  it("returns YYYY-MM for the prior calendar month", () => {
    expect(previousPeriodMonth(new Date(Date.UTC(2026, 4, 5)))).toBe("2026-04");
    expect(previousPeriodMonth(new Date(Date.UTC(2026, 0, 1)))).toBe("2025-12");
  });
});

describe("subscription-pool / weighted score formula", () => {
  it("weighted_score = freeViewCount * 1 + totalWatchMinutes * 0.5", () => {
    expect(score(A, 100, 200).weightedScore).toBe(200); // 100 + 100
    expect(score(B, 50, 80).weightedScore).toBe(90); //   50 + 40
    expect(score(C, 200, 0).weightedScore).toBe(200); // 200 + 0
    expect(score(D, 0, 60).weightedScore).toBe(30); //    0 + 30
  });
});

describe("subscription-pool / allocateShares — pool sums to total when caps don't bind", () => {
  it("5 equal creators (each 20% pro-rata): sum = pool, no caps tripped", () => {
    const scores = [
      score(A, 100, 0),
      score(B, 100, 0),
      score(C, 100, 0),
      score(D, 100, 0),
      score(E, 100, 0),
    ];
    const totalPool = 100_000;

    const { shares, allCreatorsScore } = allocateShares(scores, totalPool);

    expect(allCreatorsScore).toBe(500);
    const sum = shares.reduce((acc, s) => acc + s.poolShareInr, 0);
    expect(sum).toBe(totalPool);
    for (const s of shares) {
      expect(s.poolShareInr).toBe(20_000);
      expect(s.cappedAtSingleCreatorMax).toBe(false);
    }
  });
});

describe("subscription-pool / allocateShares — single-creator cap (the gaming case)", () => {
  it("90% creator + 4 minor: hot creator gets exactly the 25% cap, sum = pool", () => {
    // A = 900 (90%), B/C/D/E = 25 each (2.5% each, 10% combined).
    // After A is capped at 25,000, the 4 minor creators absorb the remaining
    // 75,000 pro-rata — none of them trip the cap.
    const scores = [
      score(A, 900, 0),
      score(B, 25, 0),
      score(C, 25, 0),
      score(D, 25, 0),
      score(E, 25, 0),
    ];
    const totalPool = 100_000;

    const { shares } = allocateShares(scores, totalPool);

    const byId = Object.fromEntries(shares.map((s) => [s.creatorId, s]));

    expect(byId[A]?.poolShareInr).toBe(25_000); // exactly 25% cap
    expect(byId[A]?.cappedAtSingleCreatorMax).toBe(true);

    // Sum invariant: the four minors absorb the residue.
    const sum = shares.reduce((acc, s) => acc + s.poolShareInr, 0);
    expect(sum).toBe(totalPool);

    // None of the minors breach the cap.
    for (const id of [B, C, D, E]) {
      expect(byId[id]?.poolShareInr).toBeLessThan(25_000);
      expect(byId[id]?.cappedAtSingleCreatorMax).toBe(false);
    }
  });

  it("hard cap: when too few minors exist to absorb surplus, residue is unallocated", () => {
    // A=900, B=50, C=50: every creator's pro-rata exceeds the cap once
    // the surplus from earlier rounds is folded in. Residue stays unspent.
    const scores = [score(A, 900, 0), score(B, 50, 0), score(C, 50, 0)];
    const totalPool = 100_000;

    const { shares } = allocateShares(scores, totalPool);

    for (const s of shares) {
      expect(s.poolShareInr).toBeLessThanOrEqual(25_000);
      expect(s.cappedAtSingleCreatorMax).toBe(true);
    }
    // Surplus is structural — cap > "sum=pool" when they conflict.
    const sum = shares.reduce((acc, s) => acc + s.poolShareInr, 0);
    expect(sum).toBeLessThanOrEqual(totalPool);
    expect(sum).toBe(75_000); // exactly 3 × cap
  });
});

describe("subscription-pool / allocateShares — rounding remainder", () => {
  it("absorbs floor() residue on the last uncapped creator (by creatorId asc)", () => {
    // A is hot (capped at 25% of 100), B-E split the remaining 75 pro-rata.
    // Each minor's ideal = 75 / 4 = 18.75 → floor 18. Sum = 25 + 4*18 = 97.
    // Residue 3 paisa → E (last uncapped by id asc) absorbs.
    const scores = [
      score(A, 30, 0),
      score(B, 10, 0),
      score(C, 10, 0),
      score(D, 10, 0),
      score(E, 10, 0),
    ];
    const totalPool = 100;

    const { shares } = allocateShares(scores, totalPool);
    const byId = Object.fromEntries(shares.map((s) => [s.creatorId, s]));

    expect(byId[A]?.poolShareInr).toBe(25); // hard cap at 25%
    expect(byId[A]?.cappedAtSingleCreatorMax).toBe(true);

    expect(byId[B]?.poolShareInr).toBe(18);
    expect(byId[C]?.poolShareInr).toBe(18);
    expect(byId[D]?.poolShareInr).toBe(18);
    expect(byId[E]?.poolShareInr).toBe(21); // 18 + 3 paisa residue

    const sum = shares.reduce((acc, s) => acc + s.poolShareInr, 0);
    expect(sum).toBe(totalPool);
  });
});

describe("subscription-pool / allocateShares — degenerate cases", () => {
  it("returns zero shares but preserves rows when pool is zero", () => {
    const scores = [score(A, 100, 0), score(B, 50, 0)];
    const { shares, allCreatorsScore } = allocateShares(scores, 0);

    expect(shares).toHaveLength(2);
    expect(allCreatorsScore).toBe(150);
    for (const s of shares) {
      expect(s.poolShareInr).toBe(0);
      expect(s.cappedAtSingleCreatorMax).toBe(false);
    }
  });

  it("returns empty allocation when no creators participated", () => {
    const { shares, allCreatorsScore } = allocateShares([], 100_000);
    expect(shares).toEqual([]);
    expect(allCreatorsScore).toBe(0);
  });

  it("single creator at 100% receives exactly the cap, residue unallocated", () => {
    const scores = [score(A, 1000, 0)];
    const totalPool = 100_000;
    const { shares } = allocateShares(scores, totalPool);

    expect(shares).toHaveLength(1);
    expect(shares[0]?.poolShareInr).toBe(25_000);
    expect(shares[0]?.cappedAtSingleCreatorMax).toBe(true);
  });
});
