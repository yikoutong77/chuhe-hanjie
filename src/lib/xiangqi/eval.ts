import {
  A,
  BLACK,
  C,
  E,
  H,
  K,
  P,
  R,
  RED,
  SQUARES,
  fileOf,
  pieceSide,
  pieceType,
  rankOf,
  type Pos,
} from "./engine.ts";

export const MATE = 100_000;
export const MATE_THRESHOLD = 90_000;

export const VALUE: number[] = [];
VALUE[K] = 10_000;
VALUE[A] = 200;
VALUE[E] = 200;
VALUE[H] = 450;
VALUE[R] = 1_000;
VALUE[C] = 500;
VALUE[P] = 100;

/** Piece-square tables from red's view (rank 0 = red back rank). */
const PST: number[][] = [];

PST[P] = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, // 0
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  4, 0, 8, 0, 12, 0, 8, 0, 4, // starting pawns
  10, 14, 22, 28, 32, 28, 22, 14, 10, // river
  22, 30, 40, 50, 58, 50, 40, 30, 22, // crossed
  32, 40, 50, 62, 72, 62, 50, 40, 32,
  42, 50, 60, 72, 84, 72, 60, 50, 42,
  48, 56, 66, 78, 90, 78, 66, 56, 48,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
];

PST[H] = [
  -24, -10, 0, 2, 4, 2, 0, -10, -24,
  -10, 2, 14, 16, 18, 16, 14, 2, -10,
  0, 14, 22, 26, 28, 26, 22, 14, 0,
  4, 16, 26, 32, 36, 32, 26, 16, 4,
  8, 18, 28, 34, 38, 34, 28, 18, 8,
  8, 18, 28, 34, 38, 34, 28, 18, 8,
  4, 16, 24, 30, 32, 30, 24, 16, 4,
  -2, 10, 18, 22, 24, 22, 18, 10, -2,
  -12, 0, 8, 12, 14, 12, 8, 0, -12,
  -20, -8, -2, 2, 6, 2, -2, -8, -20,
];

PST[C] = [
  8, 12, 14, 16, 16, 16, 14, 12, 8,
  8, 14, 16, 18, 20, 18, 16, 14, 8,
  12, 16, 8, 12, 14, 12, 8, 16, 12, // starting rank (cannon nest)
  4, 10, 12, 14, 16, 14, 12, 10, 4,
  0, 6, 8, 12, 14, 12, 8, 6, 0,
  0, 6, 8, 12, 14, 12, 8, 6, 0,
  4, 10, 14, 16, 18, 16, 14, 10, 4,
  8, 12, 16, 18, 20, 18, 16, 12, 8,
  10, 14, 18, 20, 22, 20, 18, 14, 10,
  6, 10, 12, 14, 16, 14, 12, 10, 6,
];

PST[R] = [
  6, 8, 10, 12, 14, 12, 10, 8, 6,
  10, 14, 16, 18, 20, 18, 16, 14, 10,
  8, 12, 14, 16, 18, 16, 14, 12, 8,
  8, 12, 14, 16, 18, 16, 14, 12, 8,
  10, 14, 16, 18, 22, 18, 16, 14, 10,
  12, 16, 18, 22, 26, 22, 18, 16, 12,
  14, 18, 22, 26, 30, 26, 22, 18, 14,
  18, 22, 26, 30, 34, 30, 26, 22, 18,
  22, 26, 30, 34, 40, 34, 30, 26, 22,
  16, 20, 24, 28, 32, 28, 24, 20, 16,
];

PST[E] = [
  0, 0, 18, 0, 8, 0, 18, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  12, 0, 0, 0, 22, 0, 0, 0, 12,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 8, 0, 0, 0, 8, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
];

PST[A] = [
  0, 0, 0, 10, 0, 10, 0, 0, 0,
  0, 0, 0, 0, 22, 0, 0, 0, 0,
  0, 0, 0, 8, 0, 8, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
];

PST[K] = [
  2, 4, 8, 12, 28, 12, 8, 4, 2,
  -8, -6, 0, 8, 12, 8, 0, -6, -8,
  -16, -12, -8, 0, 4, 0, -8, -12, -16,
  -20, -16, -12, -8, -4, -8, -12, -16, -20,
  -24, -20, -16, -12, -8, -12, -16, -20, -24,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
];

function relSq(sq: number, side: number): number {
  if (side === RED) return sq;
  return (9 - rankOf(sq)) * 9 + fileOf(sq);
}

function pst(type: number, sq: number, side: number): number {
  const table = PST[type];
  if (!table) return 0;
  return table[relSq(sq, side)] ?? 0;
}

const SLIDE_DIR: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function onBoard(f: number, r: number): boolean {
  return f >= 0 && f <= 8 && r >= 0 && r <= 9;
}

function rookMobility(pos: Pos, sq: number): number {
  const f = fileOf(sq);
  const r = rankOf(sq);
  let n = 0;
  for (const [df, dr] of SLIDE_DIR) {
    let nf = f + df;
    let nr = r + dr;
    while (onBoard(nf, nr)) {
      const p = pos.board[nr * 9 + nf]!;
      if (p) {
        n += 1;
        break;
      }
      n += 1;
      nf += df;
      nr += dr;
    }
  }
  return n;
}

const H_DELTA: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 2, 0, 1],
  [1, -2, 0, -1],
  [-1, 2, 0, 1],
  [-1, -2, 0, -1],
  [2, 1, 1, 0],
  [2, -1, 1, 0],
  [-2, 1, -1, 0],
  [-2, -1, -1, 0],
];

function horseMobility(pos: Pos, sq: number): number {
  const f = fileOf(sq);
  const r = rankOf(sq);
  let n = 0;
  for (const [df, dr, hf, hr] of H_DELTA) {
    if (pos.board[(r + hr) * 9 + (f + hf)]) continue;
    const nf = f + df;
    const nr = r + dr;
    if (onBoard(nf, nr)) n += 1;
  }
  return n;
}

function filePressure(pos: Pos, sq: number, oppKing: number, isCannon: boolean): number {
  if (oppKing < 0) return 0;
  const f = fileOf(sq);
  const r = rankOf(sq);
  const kf = fileOf(oppKing);
  const kr = rankOf(oppKing);
  if (f !== kf && r !== kr) return 0;
  let seen = 0;
  if (f === kf) {
    const lo = Math.min(sq, oppKing);
    const hi = Math.max(sq, oppKing);
    for (let s = lo + 9; s < hi; s += 9) if (pos.board[s]) seen += 1;
  } else {
    const step = kf > f ? 1 : -1;
    for (let file = f + step; file !== kf; file += step) {
      if (pos.board[r * 9 + file]) seen += 1;
    }
  }
  if (isCannon) {
    if (seen === 1) return 42;
    if (seen === 0) return 12;
    return 0;
  }
  if (seen === 0) return 28;
  if (seen === 1) return 10;
  return 0;
}

function kingSafety(pos: Pos, side: number, advisors: number, elephants: number): number {
  const ksq = pos.kings[side === RED ? 0 : 1];
  if (ksq < 0) return -MATE;
  const f = fileOf(ksq);
  const r = rankOf(ksq);
  const back = side === RED ? 0 : 9;
  let s = 0;
  if (r === back) s += 16;
  else s -= 22;
  if (f === 4) s += 18;
  else if (f === 3 || f === 5) s += 6;
  else s -= 12;
  if (advisors === 2) s += 28;
  else if (advisors === 1) s += 8;
  else s -= 18;
  if (elephants === 2) s += 18;
  else if (elephants === 0) s -= 12;
  return s;
}

/** Positive = advantage for red. */
export function evaluate(pos: Pos): number {
  let score = 0;
  let redA = 0;
  let blackA = 0;
  let redE = 0;
  let blackE = 0;
  let redMaj = 0;
  let blackMaj = 0;
  const redKing = pos.kings[0];
  const blackKing = pos.kings[1];

  for (let sq = 0; sq < SQUARES; sq++) {
    const p = pos.board[sq]!;
    if (!p) continue;
    const type = pieceType(p);
    const side = pieceSide(p);
    const sign = side === RED ? 1 : -1;
    score += sign * (VALUE[type] ?? 0);
    score += sign * pst(type, sq, side);

    if (type === A) {
      if (side === RED) redA += 1;
      else blackA += 1;
    } else if (type === E) {
      if (side === RED) redE += 1;
      else blackE += 1;
    } else if (type === R) {
      score += sign * (rookMobility(pos, sq) * 3);
      score += sign * filePressure(pos, sq, side === RED ? blackKing : redKing, false);
      if (side === RED) redMaj += 1;
      else blackMaj += 1;
    } else if (type === C) {
      score += sign * filePressure(pos, sq, side === RED ? blackKing : redKing, true);
      if (side === RED) redMaj += 1;
      else blackMaj += 1;
    } else if (type === H) {
      const mob = horseMobility(pos, sq);
      score += sign * (mob * 6 - (mob <= 2 ? 14 : 0));
      if (side === RED) redMaj += 1;
      else blackMaj += 1;
    }
  }

  score += kingSafety(pos, RED, redA, redE);
  score -= kingSafety(pos, BLACK, blackA, blackE);

  const majors = redMaj + blackMaj;
  if (majors <= 4) {
    // Endgame: horses gain, cannons lose a little, extra king centralization.
    for (let sq = 0; sq < SQUARES; sq++) {
      const p = pos.board[sq]!;
      if (!p) continue;
      const type = pieceType(p);
      const sign = pieceSide(p) === RED ? 1 : -1;
      if (type === H) score += sign * 28;
      else if (type === C) score -= sign * 16;
      else if (type === P) score += sign * 12;
    }
  }

  return score;
}

export function evaluateSide(pos: Pos): number {
  const raw = evaluate(pos);
  return pos.side === RED ? raw : -raw;
}
