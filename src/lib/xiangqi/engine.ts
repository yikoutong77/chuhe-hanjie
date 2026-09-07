/** Xiangqi (Chinese chess) rules engine. Board is 9 files × 10 ranks. */

export const WIDTH = 9;
export const HEIGHT = 10;
export const SQUARES = 90;

export const EMPTY = 0;
export const K = 1;
export const A = 2;
export const E = 3;
export const H = 4;
export const R = 5;
export const C = 6;
export const P = 7;
export const BLACK = 8;
export const RED = 0;

export type Side = typeof RED | typeof BLACK;
export type Difficulty = "easy" | "medium" | "hard";

export type Move = { from: number; to: number };

export type Pos = {
  board: number[];
  side: Side;
  kings: [number, number];
  hash: number;
  ply: number;
  halfmove: number;
  history: number[];
};

export type Undo = {
  from: number;
  to: number;
  captured: number;
  hash: number;
  halfmove: number;
  kingRed: number;
  kingBlack: number;
};

export type Outcome =
  | { over: false; inCheck: boolean }
  | {
      over: true;
      inCheck: boolean;
      winner: "red" | "black" | "draw";
      reason: "checkmate" | "stalemate" | "repeat" | "moves" | "resign";
    };

export const START_FEN =
  "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";

const FEN_CHAR: Record<string, number> = {
  K,
  A,
  B: E,
  E,
  N: H,
  H,
  R,
  C,
  P,
  k: K | BLACK,
  a: A | BLACK,
  b: E | BLACK,
  e: E | BLACK,
  n: H | BLACK,
  h: H | BLACK,
  r: R | BLACK,
  c: C | BLACK,
  p: P | BLACK,
};

const TO_FEN = new Map<number, string>([
  [K, "K"],
  [A, "A"],
  [E, "B"],
  [H, "N"],
  [R, "R"],
  [C, "C"],
  [P, "P"],
  [K | BLACK, "k"],
  [A | BLACK, "a"],
  [E | BLACK, "b"],
  [H | BLACK, "n"],
  [R | BLACK, "r"],
  [C | BLACK, "c"],
  [P | BLACK, "p"],
]);

export const PIECE_CHAR: Record<number, string> = {
  [K]: "帅",
  [A]: "仕",
  [E]: "相",
  [H]: "马",
  [R]: "车",
  [C]: "炮",
  [P]: "兵",
  [K | BLACK]: "将",
  [A | BLACK]: "士",
  [E | BLACK]: "象",
  [H | BLACK]: "马",
  [R | BLACK]: "车",
  [C | BLACK]: "砲",
  [P | BLACK]: "卒",
};

export function fileOf(sq: number): number {
  return sq % 9;
}
export function rankOf(sq: number): number {
  return (sq / 9) | 0;
}
export function makeSq(file: number, rank: number): number {
  return rank * 9 + file;
}
export function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file <= 8 && rank >= 0 && rank <= 9;
}
export function pieceType(p: number): number {
  return p & 7;
}
export function pieceSide(p: number): number {
  return p & 8;
}
export function sameSide(a: number, b: number): boolean {
  return a !== 0 && b !== 0 && (a & 8) === (b & 8);
}

export function alg(sq: number): string {
  return `${"abcdefghi"[fileOf(sq)]}${rankOf(sq)}`;
}

export function parseAlg(s: string): number {
  const file = s.charCodeAt(0) - 97;
  const rank = Number(s.slice(1));
  return makeSq(file, rank);
}

function inPalace(file: number, rank: number, side: Side): boolean {
  if (file < 3 || file > 5) return false;
  return side === RED ? rank <= 2 : rank >= 7;
}

function elephantOk(rank: number, side: Side): boolean {
  return side === RED ? rank <= 4 : rank >= 5;
}

const Z_PIECE = new Int32Array(16 * SQUARES);
const Z_SIDE = 0x9e3779b9;

(function initZobrist() {
  let seed = 0xa3413166;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return seed;
  };
  for (let i = 0; i < Z_PIECE.length; i++) Z_PIECE[i] = next();
})();

function pieceHash(piece: number, sq: number): number {
  return Z_PIECE[piece * SQUARES + sq] ?? 0;
}

function computeHash(board: number[], side: Side): number {
  let h = side === BLACK ? Z_SIDE : 0;
  for (let sq = 0; sq < SQUARES; sq++) {
    const p = board[sq]!;
    if (p) h ^= pieceHash(p, sq);
  }
  return h;
}

export function clonePos(pos: Pos): Pos {
  return {
    board: pos.board.slice(),
    side: pos.side,
    kings: [pos.kings[0], pos.kings[1]],
    hash: pos.hash,
    ply: pos.ply,
    halfmove: pos.halfmove,
    history: pos.history.slice(),
  };
}

export function startPos(): Pos {
  return fromFen(START_FEN);
}

export function fromFen(fen: string): Pos {
  const parts = fen.trim().split(/\s+/);
  const rows = (parts[0] ?? START_FEN).split("/");
  const board = new Array<number>(SQUARES).fill(0);
  let kings: [number, number] = [-1, -1];
  for (let i = 0; i < rows.length && i < 10; i++) {
    const rank = 9 - i;
    const row = rows[i] ?? "";
    let file = 0;
    for (const ch of row) {
      if (file > 8) break;
      if (ch >= "1" && ch <= "9") {
        file += Number(ch);
        continue;
      }
      const piece = FEN_CHAR[ch];
      if (!piece) continue;
      const sq = makeSq(file, rank);
      board[sq] = piece;
      if (pieceType(piece) === K) {
        kings[pieceSide(piece) === RED ? 0 : 1] = sq;
      }
      file += 1;
    }
  }
  const side: Side = parts[1] === "b" ? BLACK : RED;
  const ply = Number(parts[5] ?? 1) * 2 - (side === RED ? 2 : 1);
  const pos: Pos = {
    board,
    side,
    kings,
    hash: 0,
    ply: Math.max(0, ply),
    halfmove: Number(parts[4] ?? 0) || 0,
    history: [],
  };
  pos.hash = computeHash(board, side);
  pos.history = [pos.hash];
  return pos;
}

export function toFen(pos: Pos): string {
  const ranks: string[] = [];
  for (let rank = 9; rank >= 0; rank--) {
    let empty = 0;
    let row = "";
    for (let file = 0; file < 9; file++) {
      const p = pos.board[makeSq(file, rank)]!;
      if (!p) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += String(empty);
        empty = 0;
      }
      row += TO_FEN.get(p) ?? "?";
    }
    if (empty) row += String(empty);
    ranks.push(row);
  }
  const side = pos.side === RED ? "w" : "b";
  const moveNo = (pos.ply >> 1) + 1;
  return `${ranks.join("/")} ${side} - - ${pos.halfmove} ${moveNo}`;
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

const E_DELTA: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [2, -2],
  [-2, 2],
  [-2, -2],
];

const A_DELTA: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const K_DELTA: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const SLIDE: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function addMove(
  pos: Pos,
  from: number,
  file: number,
  rank: number,
  side: Side,
  out: Move[],
): void {
  if (!onBoard(file, rank)) return;
  const to = makeSq(file, rank);
  const target = pos.board[to]!;
  if (target && pieceSide(target) === side) return;
  out.push({ from, to });
}

function genFrom(pos: Pos, from: number, out: Move[]): void {
  const piece = pos.board[from]!;
  if (!piece) return;
  const side = pieceSide(piece) as Side;
  const type = pieceType(piece);
  const f = fileOf(from);
  const r = rankOf(from);

  if (type === K) {
    for (const [df, dr] of K_DELTA) {
      const nf = f + df;
      const nr = r + dr;
      if (!inPalace(nf, nr, side)) continue;
      addMove(pos, from, nf, nr, side, out);
    }
    return;
  }

  if (type === A) {
    for (const [df, dr] of A_DELTA) {
      const nf = f + df;
      const nr = r + dr;
      if (!inPalace(nf, nr, side)) continue;
      addMove(pos, from, nf, nr, side, out);
    }
    return;
  }

  if (type === E) {
    for (const [df, dr] of E_DELTA) {
      const nf = f + df;
      const nr = r + dr;
      if (!onBoard(nf, nr) || !elephantOk(nr, side)) continue;
      const eye = makeSq(f + df / 2, r + dr / 2);
      if (pos.board[eye]) continue;
      addMove(pos, from, nf, nr, side, out);
    }
    return;
  }

  if (type === H) {
    for (const [df, dr, hf, hr] of H_DELTA) {
      const nf = f + df;
      const nr = r + dr;
      if (!onBoard(nf, nr)) continue;
      if (pos.board[makeSq(f + hf, r + hr)]) continue;
      addMove(pos, from, nf, nr, side, out);
    }
    return;
  }

  if (type === P) {
    const forward = side === RED ? 1 : -1;
    addMove(pos, from, f, r + forward, side, out);
    const crossed = side === RED ? r >= 5 : r <= 4;
    if (crossed) {
      addMove(pos, from, f + 1, r, side, out);
      addMove(pos, from, f - 1, r, side, out);
    }
    return;
  }

  if (type === R) {
    for (const [df, dr] of SLIDE) {
      let nf = f + df;
      let nr = r + dr;
      while (onBoard(nf, nr)) {
        const to = makeSq(nf, nr);
        const target = pos.board[to]!;
        if (!target) out.push({ from, to });
        else {
          if (pieceSide(target) !== side) out.push({ from, to });
          break;
        }
        nf += df;
        nr += dr;
      }
    }
    return;
  }

  if (type === C) {
    for (const [df, dr] of SLIDE) {
      let nf = f + df;
      let nr = r + dr;
      let screen = false;
      while (onBoard(nf, nr)) {
        const to = makeSq(nf, nr);
        const target = pos.board[to]!;
        if (!screen) {
          if (!target) out.push({ from, to });
          else screen = true;
        } else if (target) {
          if (pieceSide(target) !== side) out.push({ from, to });
          break;
        }
        nf += df;
        nr += dr;
      }
    }
  }
}

export function generatePseudo(pos: Pos): Move[] {
  const out: Move[] = [];
  const side = pos.side;
  for (let sq = 0; sq < SQUARES; sq++) {
    const p = pos.board[sq]!;
    if (p && pieceSide(p) === side) genFrom(pos, sq, out);
  }
  return out;
}

function kingsFacing(pos: Pos): boolean {
  const red = pos.kings[0];
  const black = pos.kings[1];
  if (red < 0 || black < 0) return false;
  if (fileOf(red) !== fileOf(black)) return false;
  const lo = Math.min(red, black);
  const hi = Math.max(red, black);
  for (let sq = lo + 9; sq < hi; sq += 9) {
    if (pos.board[sq]) return false;
  }
  return true;
}

function sliderAttacks(
  pos: Pos,
  file: number,
  rank: number,
  df: number,
  dr: number,
  bySide: Side,
): boolean {
  let nf = file + df;
  let nr = rank + dr;
  let seen = 0;
  while (onBoard(nf, nr)) {
    const p = pos.board[makeSq(nf, nr)]!;
    if (p) {
      if (seen === 0) {
        if (pieceSide(p) === bySide && pieceType(p) === R) return true;
        seen = 1;
      } else {
        return pieceSide(p) === bySide && pieceType(p) === C;
      }
    }
    nf += df;
    nr += dr;
  }
  return false;
}

export function isAttacked(pos: Pos, sq: number, bySide: Side): boolean {
  const f = fileOf(sq);
  const r = rankOf(sq);

  const pawnDir = bySide === RED ? -1 : 1;
  const pr = r + pawnDir;
  if (onBoard(f, pr)) {
    const p = pos.board[makeSq(f, pr)]!;
    if (p && pieceSide(p) === bySide && pieceType(p) === P) return true;
  }
  const pawnCrossed = bySide === RED ? (rank: number) => rank >= 5 : (rank: number) => rank <= 4;
  for (const df of [-1, 1]) {
    if (!onBoard(f + df, r)) continue;
    const p = pos.board[makeSq(f + df, r)]!;
    if (
      p &&
      pieceSide(p) === bySide &&
      pieceType(p) === P &&
      pawnCrossed(rankOf(makeSq(f + df, r)))
    ) {
      return true;
    }
  }

  for (const [df, dr] of K_DELTA) {
    const nf = f + df;
    const nr = r + dr;
    if (!onBoard(nf, nr)) continue;
    const p = pos.board[makeSq(nf, nr)]!;
    if (p && pieceSide(p) === bySide && pieceType(p) === K && inPalace(nf, nr, bySide)) {
      return true;
    }
  }

  for (const [df, dr] of A_DELTA) {
    const nf = f + df;
    const nr = r + dr;
    if (!onBoard(nf, nr)) continue;
    const p = pos.board[makeSq(nf, nr)]!;
    if (p && pieceSide(p) === bySide && pieceType(p) === A && inPalace(nf, nr, bySide)) {
      return true;
    }
  }

  for (const [df, dr] of E_DELTA) {
    const nf = f + df;
    const nr = r + dr;
    if (!onBoard(nf, nr) || !elephantOk(nr, bySide)) continue;
    const eyeF = f + df / 2;
    const eyeR = r + dr / 2;
    if (pos.board[makeSq(eyeF, eyeR)]) continue;
    const p = pos.board[makeSq(nf, nr)]!;
    if (p && pieceSide(p) === bySide && pieceType(p) === E) return true;
  }

  for (const [df, dr] of H_DELTA) {
    const nf = f + df;
    const nr = r + dr;
    if (!onBoard(nf, nr)) continue;
    const hobbleF = nf - (Math.abs(df) === 2 ? (df > 0 ? 1 : -1) : 0);
    const hobbleR = nr - (Math.abs(dr) === 2 ? (dr > 0 ? 1 : -1) : 0);
    if (pos.board[makeSq(hobbleF, hobbleR)]) continue;
    const p = pos.board[makeSq(nf, nr)]!;
    if (p && pieceSide(p) === bySide && pieceType(p) === H) return true;
  }

  for (const [df, dr] of SLIDE) {
    if (sliderAttacks(pos, f, r, df, dr, bySide)) return true;
  }

  const oppKing = pos.kings[bySide === RED ? 0 : 1];
  if (oppKing >= 0 && oppKing !== sq && fileOf(oppKing) === f) {
    const lo = Math.min(oppKing, sq);
    const hi = Math.max(oppKing, sq);
    let blocked = false;
    for (let s = lo + 9; s < hi; s += 9) {
      if (pos.board[s]) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return true;
  }

  return false;
}

export function inCheck(pos: Pos, side: Side = pos.side): boolean {
  const king = pos.kings[side === RED ? 0 : 1];
  if (king < 0) return true;
  return isAttacked(pos, king, (side ^ BLACK) as Side) || kingsFacing(pos);
}

export function makeMove(pos: Pos, from: number, to: number): Undo {
  const moving = pos.board[from]!;
  const captured = pos.board[to]!;
  const undo: Undo = {
    from,
    to,
    captured,
    hash: pos.hash,
    halfmove: pos.halfmove,
    kingRed: pos.kings[0],
    kingBlack: pos.kings[1],
  };

  pos.hash ^= pieceHash(moving, from);
  if (captured) pos.hash ^= pieceHash(captured, to);
  pos.board[from] = EMPTY;
  pos.board[to] = moving;
  pos.hash ^= pieceHash(moving, to);

  if (pieceType(moving) === K) {
    pos.kings[pieceSide(moving) === RED ? 0 : 1] = to;
  }
  if (captured && pieceType(captured) === K) {
    pos.kings[pieceSide(captured) === RED ? 0 : 1] = -1;
  }

  pos.halfmove = captured ? 0 : pos.halfmove + 1;
  pos.ply += 1;
  pos.side = (pos.side ^ BLACK) as Side;
  pos.hash ^= Z_SIDE;
  pos.history.push(pos.hash);
  return undo;
}

export function unmakeMove(pos: Pos, undo: Undo): void {
  pos.history.pop();
  pos.side = (pos.side ^ BLACK) as Side;
  pos.ply -= 1;
  pos.hash = undo.hash;
  pos.halfmove = undo.halfmove;
  pos.kings[0] = undo.kingRed;
  pos.kings[1] = undo.kingBlack;
  const moving = pos.board[undo.to]!;
  pos.board[undo.to] = undo.captured;
  pos.board[undo.from] = moving;
}

/** Switch side without moving a piece. Used for null-move pruning. */
export function doNull(pos: Pos): void {
  pos.side = (pos.side ^ BLACK) as Side;
  pos.hash ^= Z_SIDE;
  pos.ply += 1;
}

export function undoNull(pos: Pos): void {
  pos.ply -= 1;
  pos.hash ^= Z_SIDE;
  pos.side = (pos.side ^ BLACK) as Side;
}

export function applyMove(pos: Pos, from: number, to: number): Pos {
  const next = clonePos(pos);
  makeMove(next, from, to);
  return next;
}

export function generateLegal(pos: Pos): Move[] {
  const side = pos.side;
  const pseudo = generatePseudo(pos);
  const legal: Move[] = [];
  for (const m of pseudo) {
    const undo = makeMove(pos, m.from, m.to);
    const safe = !inCheck(pos, side);
    unmakeMove(pos, undo);
    if (safe) legal.push(m);
  }
  return legal;
}

export function legalFrom(pos: Pos, from: number): Move[] {
  return generateLegal(pos).filter((m) => m.from === from);
}

export function isLegalMove(pos: Pos, from: number, to: number): boolean {
  return generateLegal(pos).some((m) => m.from === from && m.to === to);
}

function repeatCount(pos: Pos): number {
  const h = pos.hash;
  let n = 0;
  for (const x of pos.history) if (x === h) n += 1;
  return n;
}

export function outcome(pos: Pos): Outcome {
  const check = inCheck(pos);
  if (repeatCount(pos) >= 3) {
    return { over: true, inCheck: check, winner: "draw", reason: "repeat" };
  }
  if (pos.halfmove >= 120) {
    return { over: true, inCheck: check, winner: "draw", reason: "moves" };
  }
  const moves = generateLegal(pos);
  if (moves.length === 0) {
    const winner = pos.side === RED ? "black" : "red";
    return {
      over: true,
      inCheck: check,
      winner,
      reason: check ? "checkmate" : "stalemate",
    };
  }
  return { over: false, inCheck: check };
}

export function sideName(side: Side): "red" | "black" {
  return side === RED ? "red" : "black";
}

export function capturedPieces(historyFens: string[], current: Pos): number[] {
  const start = fromFen(START_FEN).board;
  const now = current.board;
  const startCount = new Map<number, number>();
  const nowCount = new Map<number, number>();
  for (const p of start) if (p) startCount.set(p, (startCount.get(p) ?? 0) + 1);
  for (const p of now) if (p) nowCount.set(p, (nowCount.get(p) ?? 0) + 1);
  const out: number[] = [];
  for (const [p, n] of startCount) {
    const gone = n - (nowCount.get(p) ?? 0);
    for (let i = 0; i < gone; i++) out.push(p);
  }
  void historyFens;
  return out;
}

export function boardToString(pos: Pos): string {
  const lines: string[] = [];
  for (let rank = 9; rank >= 0; rank--) {
    let row = `${rank} `;
    for (let file = 0; file < 9; file++) {
      const p = pos.board[makeSq(file, rank)]!;
      row += p ? (TO_FEN.get(p) ?? "?") : ".";
    }
    lines.push(row);
  }
  lines.push(`  abcdefghi  ${pos.side === RED ? "red" : "black"}`);
  return lines.join("\n");
}
