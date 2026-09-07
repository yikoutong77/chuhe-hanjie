import {
  doNull,
  generateLegal,
  generatePseudo,
  inCheck,
  isLegalMove,
  makeMove,
  parseAlg,
  pieceType,
  startPos,
  undoNull,
  unmakeMove,
  type Difficulty,
  type Move,
  type Pos,
} from "./engine.ts";
import { evaluateSide, MATE, MATE_THRESHOLD, VALUE } from "./eval.ts";

export type SearchResult = {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
};

type Cfg = {
  maxDepth: number;
  maxTime: number;
  noise: number;
  randomTop: number;
  book: boolean;
};

const CFG: Record<Difficulty, Cfg> = {
  easy: { maxDepth: 2, maxTime: 280, noise: 90, randomTop: 3, book: false },
  medium: { maxDepth: 5, maxTime: 900, noise: 0, randomTop: 1, book: true },
  hard: { maxDepth: 10, maxTime: 2400, noise: 0, randomTop: 1, book: true },
};

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
const TT_SIZE = 1 << 18;
const TT_MASK = TT_SIZE - 1;
const PACK_NONE = 0xffff;
const MAX_PLY = 64;
const QPLY = 12;

const ttHash = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttMove = new Uint16Array(TT_SIZE);

const killerA = new Uint16Array(MAX_PLY);
const killerB = new Uint16Array(MAX_PLY);
const hist = new Int32Array(90 * 90);

function pack(from: number, to: number): number {
  return (from << 7) | to;
}
function unpack(code: number): Move {
  return { from: code >> 7, to: code & 127 };
}

function ttIndex(hash: number): number {
  return hash & TT_MASK;
}

function ttToScore(score: number, ply: number): number {
  if (score >= MATE_THRESHOLD) return score - ply;
  if (score <= -MATE_THRESHOLD) return score + ply;
  return score;
}

function scoreToTt(score: number, ply: number): number {
  if (score >= MATE_THRESHOLD) return score + ply;
  if (score <= -MATE_THRESHOLD) return score - ply;
  return score;
}

function probeTt(
  hash: number,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
): { score: number; hit: boolean; move: number } {
  const i = ttIndex(hash);
  if (ttHash[i] !== hash) return { score: 0, hit: false, move: PACK_NONE };
  const move = ttMove[i] ?? PACK_NONE;
  if ((ttDepth[i] ?? 0) < depth) return { score: 0, hit: false, move };
  const score = ttToScore(ttScore[i] ?? 0, ply);
  const flag = ttFlag[i];
  if (flag === EXACT) return { score, hit: true, move };
  if (flag === LOWER && score >= beta) return { score, hit: true, move };
  if (flag === UPPER && score <= alpha) return { score, hit: true, move };
  return { score: 0, hit: false, move };
}

function storeTt(hash: number, depth: number, ply: number, score: number, flag: number, move: number): void {
  const i = ttIndex(hash);
  const prevDepth = ttDepth[i] ?? -1;
  if (prevDepth > depth && ttHash[i] === hash) return;
  ttHash[i] = hash;
  ttDepth[i] = depth;
  ttScore[i] = scoreToTt(score, ply);
  ttFlag[i] = flag;
  ttMove[i] = move === PACK_NONE ? 0 : move;
}

function isRepeat(pos: Pos): boolean {
  const h = pos.hash;
  const histArr = pos.history;
  let n = 0;
  for (let i = histArr.length - 3; i >= 0; i--) {
    if (histArr[i] === h) {
      n += 1;
      if (n >= 1) return true;
    }
  }
  return false;
}

function hasMajors(pos: Pos): boolean {
  const side = pos.side;
  const board = pos.board;
  for (let sq = 0; sq < 90; sq++) {
    const p = board[sq]!;
    if (!p || (p & 8) !== side) continue;
    const t = p & 7;
    if (t === 4 || t === 5 || t === 6) return true;
  }
  return false;
}

function mvvLva(pos: Pos, m: Move): number {
  const victim = pos.board[m.to]!;
  if (!victim) return 0;
  const attacker = pos.board[m.from]!;
  return 10_000 + (VALUE[pieceType(victim)] ?? 0) * 16 - (VALUE[pieceType(attacker)] ?? 0);
}

function scoreMove(pos: Pos, m: Move, ply: number, ttPacked: number): number {
  const packed = pack(m.from, m.to);
  if (ttPacked !== PACK_NONE && packed === ttPacked) return 1_000_000;
  const cap = pos.board[m.to]!;
  if (cap) return mvvLva(pos, m);
  if (ply < MAX_PLY) {
    if (killerA[ply] === packed) return 9_000;
    if (killerB[ply] === packed) return 8_500;
  }
  return hist[m.from * 90 + m.to] ?? 0;
}

function orderMoves(pos: Pos, moves: Move[], ply: number, ttPacked: number): Move[] {
  moves.sort((a, b) => scoreMove(pos, b, ply, ttPacked) - scoreMove(pos, a, ply, ttPacked));
  return moves;
}

function recordKiller(ply: number, m: Move): void {
  if (ply >= MAX_PLY) return;
  const packed = pack(m.from, m.to);
  if (killerA[ply] !== packed) {
    killerB[ply] = killerA[ply] ?? 0;
    killerA[ply] = packed;
  }
  const i = m.from * 90 + m.to;
  hist[i] = Math.min(20_000, (hist[i] ?? 0) + 8);
}

type SearchCtx = {
  nodes: number;
  stopped: boolean;
  deadline: number;
  shouldStop?: () => boolean;
  rootPly: number;
};

function timeUp(ctx: SearchCtx): boolean {
  if (ctx.stopped) return true;
  if (ctx.shouldStop?.()) {
    ctx.stopped = true;
    return true;
  }
  if ((ctx.nodes & 255) === 0 && Date.now() >= ctx.deadline) {
    ctx.stopped = true;
    return true;
  }
  return false;
}

function qsearch(pos: Pos, alpha: number, beta: number, ply: number, ctx: SearchCtx): number {
  ctx.nodes += 1;
  if (timeUp(ctx) || ply >= MAX_PLY) return evaluateSide(pos);
  if (isRepeat(pos)) return 0;

  const checked = inCheck(pos);
  if (!checked) {
    const stand = evaluateSide(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply - ctx.rootPly >= QPLY) return stand;
  }

  const raw = checked ? generatePseudo(pos) : generatePseudo(pos).filter((m) => pos.board[m.to]);
  orderMoves(pos, raw, ply, PACK_NONE);

  let legal = 0;
  let best = checked ? -MATE + ply : alpha;
  const us = pos.side;
  for (const m of raw) {
    const cap = pos.board[m.to]!;
    if (!checked && cap) {
      if (best + (VALUE[pieceType(cap)] ?? 0) + 80 <= alpha) continue;
    }
    const undo = makeMove(pos, m.from, m.to);
    if (inCheck(pos, us)) {
      unmakeMove(pos, undo);
      continue;
    }
    legal += 1;
    const score = cap && pieceType(cap) === 1 ? MATE - ply : -qsearch(pos, -beta, -alpha, ply + 1, ctx);
    unmakeMove(pos, undo);
    if (score >= beta) return score;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (timeUp(ctx)) break;
  }
  if (checked && legal === 0) return -MATE + ply;
  return best;
}

function negamax(
  pos: Pos,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchCtx,
  allowNull: boolean,
): number {
  ctx.nodes += 1;
  if (timeUp(ctx) || ply >= MAX_PLY) return evaluateSide(pos);
  if (ply > 0 && isRepeat(pos)) return 0;

  const checked = inCheck(pos);
  if (checked && ply < 24) depth += 1;

  if (depth <= 0) return qsearch(pos, alpha, beta, ply, ctx);

  const origAlpha = alpha;
  const tt = probeTt(pos.hash, depth, ply, alpha, beta);
  if (ply > 0 && tt.hit) return tt.score;
  const ttPacked = tt.move === 0 ? PACK_NONE : tt.move;

  if (allowNull && !checked && depth >= 3 && hasMajors(pos) && ply > 0) {
    const R = 2 + ((depth / 4) | 0);
    doNull(pos);
    const score = -negamax(pos, depth - 1 - R, -beta, -beta + 1, ply + 1, ctx, false);
    undoNull(pos);
    if (score >= beta) return score;
    if (timeUp(ctx)) return evaluateSide(pos);
  }

  const moves = orderMoves(pos, generatePseudo(pos), ply, ttPacked);
  const us = pos.side;
  let best = -MATE * 2;
  let bestPacked = PACK_NONE;
  let legal = 0;
  let searched = 0;

  for (const m of moves) {
    const cap = pos.board[m.to]!;
    const undo = makeMove(pos, m.from, m.to);
    if (inCheck(pos, us)) {
      unmakeMove(pos, undo);
      continue;
    }
    legal += 1;

    if (cap && pieceType(cap) === 1) {
      unmakeMove(pos, undo);
      best = MATE - ply;
      bestPacked = pack(m.from, m.to);
      alpha = best;
      break;
    }

    let newDepth = depth - 1;
    if (!checked && !cap && searched >= 3 && depth >= 3) {
      newDepth = depth - 2;
    }

    let score: number;
    if (searched === 0) {
      score = -negamax(pos, newDepth, -beta, -alpha, ply + 1, ctx, true);
    } else {
      score = -negamax(pos, newDepth, -alpha - 1, -alpha, ply + 1, ctx, true);
      if (score > alpha && score < beta) {
        score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, ctx, true);
      } else if (newDepth < depth - 1 && score > alpha) {
        score = -negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1, ctx, true);
        if (score > alpha && score < beta) {
          score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, ctx, true);
        }
      }
    }
    unmakeMove(pos, undo);
    searched += 1;

    if (score > best) {
      best = score;
      bestPacked = pack(m.from, m.to);
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!cap) recordKiller(ply, m);
      break;
    }
    if (timeUp(ctx)) break;
  }

  if (legal === 0) return -MATE + ply;

  const flag = best <= origAlpha ? UPPER : best >= beta ? LOWER : EXACT;
  storeTt(pos.hash, depth, ply, best, flag, bestPacked);
  return best;
}

type BookEntry = { from: number; to: number };

const BOOK = new Map<number, BookEntry[]>();

(function buildBook() {
  const lines: string[][] = [
    ["h2e2", "b9c7", "h0g2", "h9g7", "b0c2", "a9b9", "i0h0", "i9h9", "g3g4", "c6c5"],
    ["h2e2", "h7e7", "h0g2", "h9g7", "b0c2", "b9c7", "i0h0", "a9b9"],
    ["h2e2", "b7e7", "h0g2", "h9g7", "b0c2", "b9c7"],
    ["b2e2", "h9g7", "b0c2", "b9c7", "h0g2", "a9b9"],
    ["c3c4", "h7e7", "h0g2", "h9g7", "b0c2", "b9c7"],
    ["c3c4", "b9c7", "b0c2", "h9g7", "g3g4", "c6c5"],
    ["g3g4", "h7e7", "h0g2", "h9g7"],
    ["h0g2", "h9g7", "b0c2", "b9c7", "g3g4", "c6c5"],
    ["g0e2", "h9g7", "h0g2", "b9c7"],
    ["c0e2", "b9c7", "b0c2", "h9g7"],
  ];
  const add = (hash: number, from: number, to: number) => {
    const list = BOOK.get(hash) ?? [];
    if (!list.some((e) => e.from === from && e.to === to)) {
      list.push({ from, to });
      BOOK.set(hash, list);
    }
  };
  for (const line of lines) {
    const pos = startPos();
    for (const step of line) {
      const from = parseAlg(step.slice(0, 2));
      const to = parseAlg(step.slice(2, 4));
      if (!isLegalMove(pos, from, to)) break;
      add(pos.hash, from, to);
      makeMove(pos, from, to);
    }
  }
})();

function bookMove(pos: Pos): Move | null {
  const list = BOOK.get(pos.hash);
  if (!list || list.length === 0) return null;
  const pick = list[Math.floor(Math.random() * list.length)]!;
  return { from: pick.from, to: pick.to };
}

export function findBestMove(
  pos: Pos,
  difficulty: Difficulty,
  shouldStop?: () => boolean,
): SearchResult {
  const cfg = CFG[difficulty];
  if (cfg.book && pos.ply < 16) {
    const booked = bookMove(pos);
    if (booked) {
      return { move: booked, score: 0, depth: 0, nodes: 0 };
    }
  }

  const ctx: SearchCtx = {
    nodes: 0,
    stopped: false,
    deadline: Date.now() + cfg.maxTime,
    shouldStop,
    rootPly: pos.ply,
  };

  const rootMoves = generateLegal(pos);
  if (rootMoves.length === 0) {
    return { move: null, score: -MATE, depth: 0, nodes: ctx.nodes };
  }
  if (rootMoves.length === 1) {
    return { move: rootMoves[0]!, score: 0, depth: 1, nodes: 1 };
  }

  const rootTt = probeTt(pos.hash, 0, 0, -MATE, MATE);
  orderMoves(pos, rootMoves, 0, rootTt.move === 0 ? PACK_NONE : rootTt.move);

  let bestMove = rootMoves[0]!;
  let bestScore = -MATE * 2;
  let reached = 0;

  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    let localBest = bestMove;
    let localScore = -MATE * 2;
    let a = -MATE * 2;
    const scored: { move: Move; score: number }[] = [];
    let first = true;

    if (Date.now() >= ctx.deadline && depth > 1) break;

    for (const m of rootMoves) {
      const undo = makeMove(pos, m.from, m.to);
      let score: number;
      if (first || cfg.randomTop > 1) {
        score = -negamax(pos, depth - 1, -MATE * 2, -a, 1, ctx, true);
        first = false;
      } else {
        score = -negamax(pos, depth - 1, -a - 1, -a, 1, ctx, true);
        if (score > a) {
          score = -negamax(pos, depth - 1, -MATE * 2, -a, 1, ctx, true);
        }
      }
      unmakeMove(pos, undo);
      scored.push({ move: m, score });
      if (score > localScore) {
        localScore = score;
        localBest = m;
      }
      if (score > a) a = score;
      if (ctx.stopped && depth > 1) break;
    }

    if (ctx.stopped && depth > 1) break;
    bestMove = localBest;
    bestScore = localScore;
    reached = depth;

    scored.sort((x, y) => y.score - x.score);
    rootMoves.length = 0;
    for (const s of scored) rootMoves.push(s.move);

    if (cfg.randomTop > 1 && depth === cfg.maxDepth) {
      const window = cfg.noise;
      const pool = scored.filter((s, i) => i < cfg.randomTop || s.score >= localScore - window);
      const pick = pool[Math.floor(Math.random() * Math.max(1, pool.length))];
      if (pick) {
        bestMove = pick.move;
        bestScore = pick.score;
      }
    }

    if (Math.abs(bestScore) >= MATE_THRESHOLD) break;
    const remain = ctx.deadline - Date.now();
    if (remain < cfg.maxTime * 0.12 && depth >= 3) break;
  }

  if (cfg.noise && difficulty === "easy" && Math.random() < 0.18) {
    const idx = 1 + Math.floor(Math.random() * Math.min(4, rootMoves.length - 1));
    bestMove = rootMoves[idx] ?? bestMove;
  }

  storeTt(pos.hash, reached, 0, bestScore, EXACT, pack(bestMove.from, bestMove.to));
  return { move: bestMove, score: bestScore, depth: reached, nodes: ctx.nodes };
}
