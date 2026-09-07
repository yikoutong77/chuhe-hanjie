import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLACK,
  RED,
  START_FEN,
  applyMove,
  fromFen,
  generateLegal,
  inCheck,
  isAttacked,
  isLegalMove,
  outcome,
  parseAlg,
  startPos,
  toFen,
} from "./engine.ts";

describe("xiangqi engine", () => {
  it("parses the starting fen and round-trips", () => {
    const pos = startPos();
    assert.equal(pos.side, RED);
    assert.equal(pos.board[parseAlg("e0")], 1);
    assert.equal(pos.board[parseAlg("e9")]! & 7, 1);
    const fen = toFen(pos);
    assert.ok(fen.startsWith("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"));
    assert.equal(fromFen(START_FEN).kings[0], parseAlg("e0"));
  });

  it("has 44 or 42 legal opening moves for red", () => {
    const n = generateLegal(startPos()).length;
    assert.ok(n === 42 || n === 44, `expected 42 or 44, got ${n}`);
  });

  it("blocks a hobbled horse", () => {
    const pos = fromFen("9/9/9/9/9/9/1P7/1N7/9/4K4 w");
    const from = parseAlg("b2");
    const legal = generateLegal(pos).filter((m) => m.from === from);
    const dest = new Set(legal.map((m) => m.to));
    assert.equal(dest.has(parseAlg("c4")), false);
    assert.equal(dest.has(parseAlg("d1")), true);
  });

  it("rejects flying general moves", () => {
    const pos = fromFen("4k4/9/9/9/9/9/9/9/4N4/4K4 w");
    assert.equal(isLegalMove(pos, parseAlg("e1"), parseAlg("d3")), false);
    assert.equal(isLegalMove(pos, parseAlg("e1"), parseAlg("f3")), false);
    assert.equal(isLegalMove(pos, parseAlg("e0"), parseAlg("d0")), true);
    assert.equal(isLegalMove(pos, parseAlg("e0"), parseAlg("f0")), true);
  });

  it("lets a cannon capture over exactly one screen", () => {
    const pos = fromFen("4k4/9/4n4/9/4P4/9/4C4/9/9/4K4 w");
    const from = parseAlg("e3");
    assert.equal(isLegalMove(pos, from, parseAlg("e7")), true);
    assert.equal(isLegalMove(pos, from, parseAlg("e9")), false);
  });

  it("keeps elephants on their side of the river", () => {
    const pos = fromFen("4k4/9/9/9/9/2B6/9/9/9/3K5 w");
    const from = parseAlg("c4");
    assert.equal(isLegalMove(pos, from, parseAlg("a6")), false);
    assert.equal(isLegalMove(pos, from, parseAlg("e6")), false);
    assert.equal(isLegalMove(pos, from, parseAlg("a2")), true);
  });

  it("lets a pawn move sideways only after crossing", () => {
    const before = fromFen("4k4/9/9/9/9/4P4/9/9/9/3K5 w");
    assert.equal(isLegalMove(before, parseAlg("e4"), parseAlg("d4")), false);
    assert.equal(isLegalMove(before, parseAlg("e4"), parseAlg("e5")), true);
    const after = fromFen("4k4/9/9/9/4P4/9/9/9/9/3K5 w");
    assert.equal(isLegalMove(after, parseAlg("e5"), parseAlg("d5")), true);
    assert.equal(isLegalMove(after, parseAlg("e5"), parseAlg("e4")), false);
  });

  it("detects check from a chariot", () => {
    const pos = fromFen("4k4/9/9/9/9/9/4R4/9/9/4K4 b");
    assert.equal(inCheck(pos, BLACK), true);
    assert.equal(isAttacked(pos, parseAlg("e9"), RED), true);
  });

  it("scores checkmate when the king has no escape", () => {
    const pos = fromFen("R3k4/R8/9/9/9/9/9/9/9/3K5 b");
    const end = outcome(pos);
    assert.equal(end.over, true);
    if (end.over) {
      assert.equal(end.winner, "red");
      assert.equal(end.reason, "checkmate");
    }
  });

  it("applyMove switches side", () => {
    const pos = startPos();
    const next = applyMove(pos, parseAlg("h2"), parseAlg("e2"));
    assert.equal(next.side, BLACK);
    assert.equal(pos.side, RED);
  });
});
