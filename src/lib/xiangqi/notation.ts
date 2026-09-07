import {
  A,
  E,
  H,
  PIECE_CHAR,
  RED,
  SQUARES,
  fileOf,
  pieceSide,
  pieceType,
  rankOf,
  type Move,
  type Pos,
  type Side,
} from "./engine";

function fileNum(file: number, side: Side): number {
  return side === RED ? 9 - file : file + 1;
}

const CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function numStr(n: number, side: Side): string {
  return side === RED ? (CN[n] ?? String(n)) : String(n);
}

function isForward(fromRank: number, toRank: number, side: Side): boolean {
  return side === RED ? toRank > fromRank : toRank < fromRank;
}

function sameTypeOnFile(pos: Pos, from: number): number[] {
  const piece = pos.board[from]!;
  const f = fileOf(from);
  const side = pieceSide(piece);
  const type = pieceType(piece);
  const sqs: number[] = [];
  for (let sq = 0; sq < SQUARES; sq++) {
    const p = pos.board[sq]!;
    if (p && pieceSide(p) === side && pieceType(p) === type && fileOf(sq) === f) {
      sqs.push(sq);
    }
  }
  return sqs;
}

export function formatMove(pos: Pos, move: Move): string {
  const piece = pos.board[move.from]!;
  if (!piece) return "?";
  const side = pieceSide(piece) as Side;
  const type = pieceType(piece);
  const name = PIECE_CHAR[piece] ?? "?";
  const fromF = fileOf(move.from);
  const fromR = rankOf(move.from);
  const toF = fileOf(move.to);
  const toR = rankOf(move.to);

  const mates = sameTypeOnFile(pos, move.from);
  let prefix = "";
  let useFile = true;
  if (mates.length >= 2) {
    useFile = false;
    const sorted = mates.slice().sort((a, b) => rankOf(a) - rankOf(b));
    const frontIsHigh = side === RED;
    const ordered = frontIsHigh ? sorted.slice().reverse() : sorted;
    if (ordered.length === 2) {
      prefix = ordered[0] === move.from ? "前" : "后";
    } else {
      const idx = ordered.indexOf(move.from);
      prefix = idx === 0 ? "前" : idx === ordered.length - 1 ? "后" : "中";
    }
  }

  let verb: string;
  let dest: string;
  if (fromR === toR) {
    verb = "平";
    dest = numStr(fileNum(toF, side), side);
  } else {
    verb = isForward(fromR, toR, side) ? "进" : "退";
    if (type === H || type === E || type === A) dest = numStr(fileNum(toF, side), side);
    else dest = numStr(Math.abs(toR - fromR), side);
  }

  if (useFile) return `${name}${numStr(fileNum(fromF, side), side)}${verb}${dest}`;
  return `${prefix}${name}${verb}${dest}`;
}

export function formatIccs(move: Move): string {
  const files = "abcdefghi";
  return `${files[fileOf(move.from)]}${rankOf(move.from)}${files[fileOf(move.to)]}${rankOf(move.to)}`;
}
