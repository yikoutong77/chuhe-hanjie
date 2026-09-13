import { BookOpen, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Difficulty } from "@/lib/xiangqi/engine";
import type { PlayerSide, Stats } from "@/lib/save";
import { cn } from "@/lib/utils";

const DIFFS: Array<{
  id: Difficulty;
  name: string;
  code: string;
  blurb: string;
  scan: string;
  bars: number;
}> = [
  { id: "easy", name: "简单", code: "01", blurb: "入门练习，电脑偶尔漏着", scan: "浅层检索", bars: 1 },
  { id: "medium", name: "中等", code: "02", blurb: "开局有谱，能攻能守", scan: "中层博弈", bars: 2 },
  { id: "hard", name: "困难", code: "03", blurb: "置换表深搜，会夺子反击", scan: "深层夺子", bars: 3 },
];

type Props = {
  difficulty: Difficulty;
  playerSide: PlayerSide;
  stats: Stats;
  hasSave: boolean;
  onDifficulty: (d: Difficulty) => void;
  onSide: (s: PlayerSide) => void;
  onStart: () => void;
  onResume: () => void;
  onHelp: () => void;
};

function Schematic() {
  const lines = [];
  for (let i = 0; i <= 8; i++) {
    lines.push(<line key={`v${i}`} x1={20 + i * 40} y1={20} x2={20 + i * 40} y2={380} />);
  }
  for (let i = 0; i <= 9; i++) {
    lines.push(<line key={`h${i}`} x1={20} y1={20 + i * 40} x2={340} y2={20 + i * 40} />);
  }
  return (
    <svg className="xq-menu-schematic" viewBox="0 0 360 400" aria-hidden="true">
      <g className="xq-menu-schematic-grid">{lines}</g>
      <path className="xq-menu-schematic-x" d="M140 20 L220 100 M220 20 L140 100 M140 300 L220 380 M220 300 L140 380" />
      <text className="xq-menu-schematic-river" x="180" y="208">
        楚河 汉界
      </text>
    </svg>
  );
}

export function StartScreen({
  difficulty,
  playerSide,
  stats,
  hasSave,
  onDifficulty,
  onSide,
  onStart,
  onResume,
  onHelp,
}: Props) {
  const s = stats[difficulty];
  const active = DIFFS.find((d) => d.id === difficulty)!;

  return (
    <div className="xq-menu">
      <Schematic />
      <div className="xq-menu-inner">
        <div className="xq-hud-panel stagger-item">
          <span className="xq-hud-corner is-tl" />
          <span className="xq-hud-corner is-tr" />
          <span className="xq-hud-corner is-bl" />
          <span className="xq-hud-corner is-br" />

          <div className="xq-hud-bar">
            <span>XIANGQI · 9×10</span>
            <span className="xq-hud-live">
              <i />
              READY
            </span>
          </div>

          <p className="xq-kicker">中国象棋终端</p>
          <h1 className="xq-title">楚河汉界</h1>
          <p className="xq-tagline">红黑对坐，落子无悔</p>

          <div className="xq-hud-label">
            <span>01</span>
            选择难度
          </div>
          <div className="xq-diff">
            {DIFFS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={cn("xq-diff-card", difficulty === d.id && "is-on")}
                onClick={() => onDifficulty(d.id)}
              >
                <span className="xq-diff-code">LV.{d.code}</span>
                <span className="xq-diff-name">{d.name}</span>
                <span className="xq-diff-blurb">{d.blurb}</span>
                <span className="xq-diff-meter" aria-hidden="true">
                  {Array.from({ length: 3 }, (_, i) => (
                    <i key={i} className={cn(i < d.bars && "is-lit")} />
                  ))}
                </span>
                <span className="xq-diff-scan">{d.scan}</span>
              </button>
            ))}
          </div>

          <div className="xq-hud-label">
            <span>02</span>
            执棋方位
          </div>
          <div className="xq-side-pick">
            <button
              type="button"
              className={cn("xq-side-btn", playerSide === "red" && "is-on")}
              onClick={() => onSide("red")}
            >
              <span className="xq-piece xq-piece-red xq-piece-static">
                <span className="xq-piece-ring">
                  <span className="xq-piece-face">帅</span>
                </span>
              </span>
              <span className="xq-side-meta">
                <b>红方</b>
                <em>先行</em>
              </span>
            </button>
            <button
              type="button"
              className={cn("xq-side-btn", playerSide === "black" && "is-on")}
              onClick={() => onSide("black")}
            >
              <span className="xq-piece xq-piece-black xq-piece-static">
                <span className="xq-piece-ring">
                  <span className="xq-piece-face">将</span>
                </span>
              </span>
              <span className="xq-side-meta">
                <b>黑方</b>
                <em>后手</em>
              </span>
            </button>
          </div>

          <div className="xq-telemetry">
            <div>
              <span>模式</span>
              <strong>{active.name}</strong>
            </div>
            <div>
              <span>胜</span>
              <strong className="tabular-nums">{s.win}</strong>
            </div>
            <div>
              <span>负</span>
              <strong className="tabular-nums">{s.loss}</strong>
            </div>
            <div>
              <span>和</span>
              <strong className="tabular-nums">{s.draw}</strong>
            </div>
          </div>

          <div className="xq-menu-actions">
            <Button size="lg" className="xq-start-btn" onClick={onStart}>
              <Play />
              开始对局
            </Button>
            {hasSave ? (
              <Button size="lg" variant="secondary" className="min-h-12" onClick={onResume}>
                <RotateCcw />
                继续上局
              </Button>
            ) : null}
            <Button size="lg" variant="ghost" className="min-h-12" onClick={onHelp}>
              <BookOpen />
              规则
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
