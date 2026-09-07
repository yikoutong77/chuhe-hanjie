import { BookOpen, Flag, RotateCcw, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PIECE_CHAR } from "@/lib/xiangqi/engine";
import type { Outcome } from "@/lib/xiangqi/engine";
import type { PlayerSide } from "@/lib/save";

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="xq-overlay" role="dialog" aria-labelledby="help-title">
      <div className="xq-modal">
        <div className="xq-modal-head">
          <BookOpen className="size-4" />
          <h2 id="help-title">行棋规则</h2>
        </div>
        <p className="xq-help-lead">
          棋盘九路十行，红先黑后。棋子走在交叉点上。将死或困毙对方则胜。
        </p>
        <ul className="xq-help-list">
          <li>
            <b>帅 / 将</b> 九宫内横竖一格。两将不能隔空对脸。
          </li>
          <li>
            <b>仕 / 士</b> 九宫内斜走一格。
          </li>
          <li>
            <b>相 / 象</b> 田字，不能过河；象眼被堵则不能走。
          </li>
          <li>
            <b>马</b> 日字；蹩马腿则不能走。
          </li>
          <li>
            <b>车</b> 横竖任意，不可越子。
          </li>
          <li>
            <b>炮 / 砲</b> 移动如车；吃子须隔一子炮架。
          </li>
          <li>
            <b>兵 / 卒</b> 未过河只能向前；过河后可横走，不能后退。
          </li>
        </ul>
        <p className="xq-help-note">
          被将军时必须应将。无棋可走（困毙）算负，与国际象棋不同。
        </p>
        <Button className="mt-2 w-full" onClick={onClose}>
          知道了
        </Button>
      </div>
    </div>
  );
}

export function ConfirmOverlay({
  title,
  body,
  confirm,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="xq-overlay" role="dialog" aria-labelledby="confirm-title">
      <div className="xq-modal xq-modal-sm">
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="xq-modal-actions">
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={onConfirm}>{confirm}</Button>
        </div>
      </div>
    </div>
  );
}

const REASON: Record<string, string> = {
  checkmate: "将死",
  stalemate: "困毙",
  repeat: "重复局面",
  resign: "认输",
};

export function ResultOverlay({
  result,
  playerSide,
  onAgain,
  onMenu,
}: {
  result: Extract<Outcome, { over: true }>;
  playerSide: PlayerSide;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const youWin = result.winner === playerSide;
  const draw = result.winner === "draw";
  const title = draw ? "和棋" : youWin ? "你赢了" : "你输了";
  const who =
    result.winner === "draw"
      ? REASON[result.reason]
      : `${result.winner === "red" ? "红方" : "黑方"}胜 · ${REASON[result.reason]}`;
  return (
    <div className="xq-overlay" role="dialog" aria-labelledby="result-title">
      <div className="xq-modal xq-modal-sm">
        <div className="xq-result-icon">
          {draw ? <Flag className="size-6" /> : <Swords className="size-6" />}
        </div>
        <h2 id="result-title">{title}</h2>
        <p>{who}</p>
        <div className="xq-modal-actions">
          <Button variant="secondary" onClick={onMenu}>
            返回
          </Button>
          <Button onClick={onAgain}>
            <RotateCcw />
            再来一局
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CapturedRow({ pieces, label }: { pieces: number[]; label: string }) {
  if (!pieces.length) {
    return (
      <div className="xq-caps">
        <span className="xq-caps-label">{label}</span>
        <span className="xq-caps-empty">无</span>
      </div>
    );
  }
  return (
    <div className="xq-caps">
      <span className="xq-caps-label">{label}</span>
      <div className="xq-caps-row">
        {pieces.map((p, i) => (
          <span
            key={`${p}-${i}`}
            className={p & 8 ? "xq-mini xq-mini-black" : "xq-mini xq-mini-red"}
          >
            {PIECE_CHAR[p]}
          </span>
        ))}
      </div>
    </div>
  );
}
