import { BookOpen, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Difficulty } from "@/lib/xiangqi/engine";
import type { PlayerSide, Stats } from "@/lib/save";
import { cn } from "@/lib/utils";

const DIFFS: Array<{
  id: Difficulty;
  name: string;
  blurb: string;
}> = [
  { id: "easy", name: "简单", blurb: "入门练习，电脑偶尔漏着" },
  { id: "medium", name: "中等", blurb: "开局有谱，能攻能守" },
  { id: "hard", name: "困难", blurb: "置换表深搜，会夺子反击" },
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
  return (
    <div className="xq-menu">
      <div className="xq-menu-inner">
        <p className="xq-kicker stagger-item">中国象棋</p>
        <h1 className="xq-title stagger-item">楚河汉界</h1>
        <p className="xq-tagline stagger-item">红黑对坐，落子无悔</p>

        <div className="xq-diff stagger-item">
          {DIFFS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={cn("xq-diff-card", difficulty === d.id && "is-on")}
              onClick={() => onDifficulty(d.id)}
            >
              <span className="xq-diff-name">{d.name}</span>
              <span className="xq-diff-blurb">{d.blurb}</span>
            </button>
          ))}
        </div>

        <div className="xq-side-pick stagger-item">
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
            <span>执红先行</span>
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
            <span>执黑后手</span>
          </button>
        </div>

        <p className="xq-stats-line stagger-item">
          {DIFFS.find((d) => d.id === difficulty)?.name}战绩
          <span className="tabular-nums">
            {" "}
            {s.win} 胜 · {s.loss} 负 · {s.draw} 和
          </span>
        </p>

        <div className="xq-menu-actions stagger-item">
          <Button size="lg" className="min-h-12 w-full sm:w-auto sm:min-w-44" onClick={onStart}>
            <Play />
            开始对局
          </Button>
          {hasSave ? (
            <Button
              size="lg"
              variant="secondary"
              className="min-h-12 w-full sm:w-auto"
              onClick={onResume}
            >
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
  );
}
