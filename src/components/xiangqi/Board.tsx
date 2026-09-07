import {
  PIECE_CHAR,
  SQUARES,
  fileOf,
  pieceSide,
  pieceType,
  rankOf,
  type Move,
  type Pos,
  K,
} from "@/lib/xiangqi/engine";
import { cn } from "@/lib/utils";

const PAD = 30;
const CELL = 40;
const VB_W = PAD * 2 + CELL * 8;
const VB_H = PAD * 2 + CELL * 9;

const CANNONS: Array<[number, number]> = [
  [1, 2],
  [7, 2],
  [1, 7],
  [7, 7],
];
const PAWNS: Array<[number, number]> = [
  [0, 3],
  [2, 3],
  [4, 3],
  [6, 3],
  [8, 3],
  [0, 6],
  [2, 6],
  [4, 6],
  [6, 6],
  [8, 6],
];

function xy(file: number, rank: number, flipped: boolean): { x: number; y: number } {
  const f = flipped ? 8 - file : file;
  const r = flipped ? rank : 9 - rank;
  return { x: PAD + f * CELL, y: PAD + r * CELL };
}

function Cross({ x, y, edge }: { x: number; y: number; edge: "left" | "right" | "both" }) {
  const s = 6;
  const g = 3;
  const h = edge !== "left";
  const v = edge !== "right";
  return (
    <g className="xq-mark">
      {h ? (
        <>
          <path d={`M ${x - s} ${y - g} h ${s - g} v ${-s + g}`} />
          <path d={`M ${x - s} ${y + g} h ${s - g} v ${s - g}`} />
        </>
      ) : null}
      {v ? (
        <>
          <path d={`M ${x + s} ${y - g} h ${-s + g} v ${-s + g}`} />
          <path d={`M ${x + s} ${y + g} h ${-s + g} v ${s - g}`} />
        </>
      ) : null}
    </g>
  );
}

function Grid({ flipped }: { flipped: boolean }) {
  const p = (f: number, r: number) => xy(f, r, flipped);
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  for (let rank = 0; rank <= 9; rank++) {
    const a = p(0, rank);
    const b = p(8, rank);
    lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  for (let file = 0; file <= 8; file++) {
    const bottom = p(file, 0);
    const riverS = p(file, 4);
    const riverN = p(file, 5);
    const top = p(file, 9);
    lines.push({ x1: bottom.x, y1: bottom.y, x2: riverS.x, y2: riverS.y });
    lines.push({ x1: riverN.x, y1: riverN.y, x2: top.x, y2: top.y });
  }

  const palace = [
    [p(3, 0), p(5, 2)],
    [p(5, 0), p(3, 2)],
    [p(3, 9), p(5, 7)],
    [p(5, 9), p(3, 7)],
  ];

  const riverMid = {
    y: (p(0, 4).y + p(0, 5).y) / 2,
    left: p(0, 4).x,
    right: p(8, 4).x,
  };

  return (
    <svg
      className="xq-grid"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      aria-hidden="true"
    >
      <rect
        className="xq-board-fill"
        x={PAD - 14}
        y={PAD - 14}
        width={CELL * 8 + 28}
        height={CELL * 9 + 28}
        rx={4}
      />
      <rect
        className="xq-board-inner"
        x={PAD - 6}
        y={PAD - 6}
        width={CELL * 8 + 12}
        height={CELL * 9 + 12}
      />
      {lines.map((ln, i) => (
        <line key={i} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} />
      ))}
      {palace.map(([a, b], i) => (
        <line key={`p${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      ))}
      {CANNONS.map(([f, r]) => {
        const c = p(f, r);
        return <Cross key={`c${f}${r}`} x={c.x} y={c.y} edge="both" />;
      })}
      {PAWNS.map(([f, r]) => {
        const c = p(f, r);
        const edge = f === 0 ? "right" : f === 8 ? "left" : "both";
        return <Cross key={`w${f}${r}`} x={c.x} y={c.y} edge={edge} />;
      })}
      <text
        className="xq-river"
        x={(riverMid.left + riverMid.right) / 2 - CELL * 2.1}
        y={riverMid.y + 5}
      >
        楚 河
      </text>
      <text
        className="xq-river"
        x={(riverMid.left + riverMid.right) / 2 + CELL * 2.1}
        y={riverMid.y + 5}
      >
        汉 界
      </text>
    </svg>
  );
}

function FileLabels({ flipped }: { flipped: boolean }) {
  const redNums = ["九", "八", "七", "六", "五", "四", "三", "二", "一"];
  const blackNums = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const bottom = flipped ? blackNums : redNums;
  const top = flipped ? redNums : blackNums;
  return (
    <>
      <div className="xq-files xq-files-bottom">
        {bottom.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="xq-files xq-files-top">
        {top.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
    </>
  );
}

type BoardProps = {
  pos: Pos;
  ids: number[];
  flipped: boolean;
  selected: number | null;
  legal: Move[];
  lastMove: { from: number; to: number } | null;
  hint: { from: number; to: number } | null;
  inCheck: boolean;
  interactive: boolean;
  onSquare: (sq: number) => void;
};

export function Board({
  pos,
  ids,
  flipped,
  selected,
  legal,
  lastMove,
  hint,
  inCheck,
  interactive,
  onSquare,
}: BoardProps) {
  const legalTo = new Set(legal.map((m) => m.to));
  const kingSq = inCheck ? pos.kings[pos.side === 0 ? 0 : 1] : -1;

  const pieces: Array<{ sq: number; code: number; id: number }> = [];
  for (let sq = 0; sq < SQUARES; sq++) {
    const code = pos.board[sq]!;
    if (code) pieces.push({ sq, code, id: ids[sq] ?? sq + 1 });
  }

  return (
    <div className="xq-board-frame">
      <div className="xq-board">
        <Grid flipped={flipped} />
        <FileLabels flipped={flipped} />
        {lastMove ? (
          <>
            <div
              className="xq-last"
              style={dotStyle(lastMove.from, flipped)}
            />
            <div
              className="xq-last xq-last-to"
              style={dotStyle(lastMove.to, flipped)}
            />
          </>
        ) : null}
        {hint ? (
          <>
            <div className="xq-hint" style={dotStyle(hint.from, flipped)} />
            <div className="xq-hint xq-hint-to" style={dotStyle(hint.to, flipped)} />
          </>
        ) : null}
        {Array.from({ length: SQUARES }, (_, sq) => (
          <button
            key={`h${sq}`}
            type="button"
            className="xq-hotspot"
            style={dotStyle(sq, flipped)}
            disabled={!interactive}
            aria-label={`${"abcdefghi"[fileOf(sq)]}${rankOf(sq)}`}
            onClick={() => onSquare(sq)}
          />
        ))}
        {Array.from(legalTo, (sq) => (
          <div
            key={`l${sq}`}
            className={cn("xq-legal", pos.board[sq] ? "xq-legal-cap" : "xq-legal-dot")}
            style={dotStyle(sq, flipped)}
          />
        ))}
        {pieces.map((p) => {
          const { x, y } = xy(fileOf(p.sq), rankOf(p.sq), flipped);
          const red = pieceSide(p.code) === 0;
          const selectedHere = selected === p.sq;
          const checked = kingSq === p.sq && pieceType(p.code) === K;
          return (
            <button
              key={p.id}
              type="button"
              className={cn(
                "xq-piece",
                red ? "xq-piece-red" : "xq-piece-black",
                selectedHere && "xq-piece-sel",
                checked && "xq-piece-check",
              )}
              style={{
                left: `${(x / VB_W) * 100}%`,
                top: `${(y / VB_H) * 100}%`,
              }}
              disabled={!interactive}
              aria-label={`${red ? "红" : "黑"} ${PIECE_CHAR[p.code]}`}
              onClick={() => onSquare(p.sq)}
            >
              <span className="xq-piece-ring">
                <span className="xq-piece-face">{PIECE_CHAR[p.code]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function dotStyle(sq: number, flipped: boolean): { left: string; top: string } {
  const { x, y } = xy(fileOf(sq), rankOf(sq), flipped);
  return { left: `${(x / VB_W) * 100}%`, top: `${(y / VB_H) * 100}%` };
}
