import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMove,
  fromFen,
  generateLegal,
  isLegalMove,
  outcome,
  parseAlg,
  startPos,
} from "./engine.ts";
import { evaluate } from "./eval.ts";
import { findBestMove } from "./search.ts";

describe("xiangqi search", () => {
  it("returns a legal opening move", () => {
    const pos = startPos();
    const result = findBestMove(pos, "easy");
    assert.ok(result.move, "expected a move");
    assert.equal(isLegalMove(pos, result.move.from, result.move.to), true);
  });

  it("starting eval is balanced", () => {
    assert.equal(evaluate(startPos()), 0);
  });

  it("grabs a hanging chariot", () => {
    const pos = fromFen("4k4/9/9/9/9/4r4/9/9/4R4/4K4 w");
    const result = findBestMove(pos, "medium");
    assert.ok(result.move);
    assert.equal(result.move.from, parseAlg("e1"));
    assert.equal(result.move.to, parseAlg("e4"));
  });

  it("finds mate in one", () => {
    const pos = fromFen("k8/1R7/9/9/9/9/9/9/9/R3K4 w");
    const mates = generateLegal(pos).filter((m) => {
      const next = applyMove(pos, m.from, m.to);
      const end = outcome(next);
      return end.over && end.reason === "checkmate";
    });
    assert.ok(mates.length > 0, "fixture should contain mate in one");
    const result = findBestMove(pos, "medium");
    assert.ok(result.move);
    assert.ok(
      mates.some((m) => m.from === result.move!.from && m.to === result.move!.to),
      "did not pick a mating move",
    );
  });
});
