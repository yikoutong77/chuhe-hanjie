import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Flag,
  Lightbulb,
  RotateCcw,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Board } from "@/components/xiangqi/Board";
import {
  CapturedRow,
  ConfirmOverlay,
  HelpOverlay,
  ResultOverlay,
} from "@/components/xiangqi/Overlays";
import { StartScreen } from "@/components/xiangqi/StartScreen";
import { Button } from "@/components/ui/button";
import {
  playCapture,
  playCheck,
  playDraw,
  playLose,
  playMove,
  playSelect,
  playWin,
  setSoundEnabled,
  unlockAudio,
} from "@/lib/audio";
import {
  defaultSave,
  loadSave,
  writeSave,
  type Difficulty,
  type PlayerSide,
  type SaveData,
} from "@/lib/save";
import {
  BLACK,
  RED,
  SQUARES,
  applyMove,
  capturedPieces,
  fromFen,
  legalFrom,
  outcome,
  pieceSide,
  startPos,
  toFen,
  type Move,
  type Outcome,
  type Pos,
} from "@/lib/xiangqi/engine";
import { formatMove } from "@/lib/xiangqi/notation";
import { cn } from "@/lib/utils";

type Overlay = "none" | "help" | "resign" | "result" | "newgame";

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

function assignIds(board: number[]): number[] {
  const ids = new Array<number>(SQUARES).fill(0);
  let n = 1;
  for (let i = 0; i < SQUARES; i++) if (board[i]) ids[i] = n++;
  return ids;
}

function shiftIds(ids: number[], from: number, to: number): number[] {
  const next = ids.slice();
  next[to] = next[from]!;
  next[from] = 0;
  return next;
}

type Hist = { fen: string; ids: number[]; notation: string; from: number; to: number };

export function GameApp() {
  const [save, setSave] = useState<SaveData>(defaultSave);
  const [screen, setScreen] = useState<"menu" | "play">("menu");
  const [pos, setPos] = useState<Pos>(() => startPos());
  const [ids, setIds] = useState<number[]>(() => assignIds(startPos().board));
  const [history, setHistory] = useState<Hist[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [hint, setHint] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [hydrated, setHydrated] = useState(false);

  const difficulty = save.difficulty;
  const playerSide = save.playerSide;
  const sound = save.sound;
  const stats = save.stats;

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, (data: WorkerOut) => void>());
  const ridRef = useRef(0);
  const jobRef = useRef(0);
  const scoredRef = useRef(false);

  type WorkerOut = { requestId: number; from: number; to: number };

  useEffect(() => {
    const data = loadSave();
    setSave(data);
    setSoundEnabled(data.sound);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeSave(save);
  }, [save, hydrated]);

  useEffect(() => {
    setSoundEnabled(sound);
  }, [sound]);

  useEffect(() => {
    let alive = true;
    let worker: Worker | null = null;
    void import("@/lib/xiangqi/ai.worker.ts?worker").then((mod) => {
      if (!alive) return;
      worker = new mod.default();
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<WorkerOut>) => {
        const cb = pendingRef.current.get(event.data.requestId);
        if (cb) {
          pendingRef.current.delete(event.data.requestId);
          cb(event.data);
        }
      };
    });
    return () => {
      alive = false;
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  const askAi = useCallback((fen: string, diff: Difficulty) => {
    const requestId = ++ridRef.current;
    return new Promise<WorkerOut>((resolve) => {
      pendingRef.current.set(requestId, resolve);
      const w = workerRef.current;
      if (w) {
        w.postMessage({ requestId, fen, difficulty: diff });
        return;
      }
      void import("@/lib/xiangqi/engine").then(async (eng) => {
        const search = await import("@/lib/xiangqi/search");
        const result = search.findBestMove(eng.fromFen(fen), diff);
        resolve({
          requestId,
          from: result.move?.from ?? -1,
          to: result.move?.to ?? -1,
        });
      });
    });
  }, []);

  const persistGame = useCallback(
    (
      nextPos: Pos,
      nextHistory: Hist[],
      nextLast: { from: number; to: number } | null,
      side: PlayerSide,
      diff: Difficulty,
    ) => {
      setSave((s) => ({
        ...s,
        difficulty: diff,
        playerSide: side,
        game: {
          fen: toFen(nextPos),
          notations: nextHistory.map((h) => h.notation),
          difficulty: diff,
          playerSide: side,
          lastFrom: nextLast?.from ?? null,
          lastTo: nextLast?.to ?? null,
        },
      }));
    },
    [],
  );

  const recordResult = useCallback((end: Extract<Outcome, { over: true }>, side: PlayerSide, diff: Difficulty) => {
    if (scoredRef.current) return;
    scoredRef.current = true;
    setSave((s) => {
      const row = { ...s.stats[diff] };
      if (end.winner === "draw") row.draw += 1;
      else if (end.winner === side) row.win += 1;
      else row.loss += 1;
      return { ...s, stats: { ...s.stats, [diff]: row }, game: null };
    });
    if (end.winner === "draw") playDraw();
    else if (end.winner === side) playWin();
    else playLose();
  }, []);

  const finishIfOver = useCallback(
    (next: Pos, side: PlayerSide, diff: Difficulty) => {
      const end = outcome(next);
      if (end.over) {
        setThinking(false);
        setOverlay("result");
        recordResult(end, side, diff);
        return true;
      }
      if (end.inCheck) playCheck();
      return false;
    },
    [recordResult],
  );

  const runAi = useCallback(
    async (current: Pos, currentIds: number[], side: PlayerSide, diff: Difficulty) => {
      const job = ++jobRef.current;
      setThinking(true);
      setSelected(null);
      setHint(null);
      const reply = await askAi(toFen(current), diff);
      if (job !== jobRef.current) return;
      if (reply.from < 0) {
        setThinking(false);
        return;
      }
      const next = applyMove(current, reply.from, reply.to);
      const notation = formatMove(current, { from: reply.from, to: reply.to });
      const captured = current.board[reply.to] !== 0;
      if (captured) playCapture();
      else playMove();
      const nextIds = shiftIds(currentIds, reply.from, reply.to);
      const hist: Hist = {
        fen: toFen(current),
        ids: currentIds.slice(),
        notation,
        from: reply.from,
        to: reply.to,
      };
      setIds(nextIds);
      setPos(next);
      setLastMove({ from: reply.from, to: reply.to });
      setHistory((h) => {
        const nh = [...h, hist];
        persistGame(next, nh, { from: reply.from, to: reply.to }, side, diff);
        return nh;
      });
      setThinking(false);
      finishIfOver(next, side, diff);
    },
    [askAi, finishIfOver, persistGame],
  );

  const begin = useCallback(
    (diff: Difficulty, side: PlayerSide, resume = false) => {
      unlockAudio();
      scoredRef.current = false;
      setOverlay("none");
      setHint(null);
      setSelected(null);
      jobRef.current += 1;
      if (resume && save.game) {
        const g = save.game;
        const loaded = fromFen(g.fen);
        setPos(loaded);
        setIds(assignIds(loaded.board));
        setHistory(
          g.notations.map((notation) => ({
            fen: g.fen,
            ids: [],
            notation,
            from: g.lastFrom ?? 0,
            to: g.lastTo ?? 0,
          })),
        );
        setLastMove(
          g.lastFrom != null && g.lastTo != null
            ? { from: g.lastFrom, to: g.lastTo }
            : null,
        );
        setScreen("play");
        const turn = loaded.side === RED ? "red" : "black";
        if (turn !== g.playerSide && !outcome(loaded).over) {
          void runAi(loaded, assignIds(loaded.board), g.playerSide, g.difficulty);
        }
        return;
      }
      const next = startPos();
      const nextIds = assignIds(next.board);
      setPos(next);
      setIds(nextIds);
      setHistory([]);
      setLastMove(null);
      setScreen("play");
      persistGame(next, [], null, side, diff);
      if (side === "black") {
        void runAi(next, nextIds, side, diff);
      }
    },
    [persistGame, runAi, save.game],
  );

  const status = useMemo(() => outcome(pos), [pos]);
  const legal = useMemo<Move[]>(() => {
    if (selected == null) return [];
    return legalFrom(pos, selected);
  }, [pos, selected]);

  const playerTurn =
    !thinking &&
    !status.over &&
    (pos.side === RED ? "red" : "black") === playerSide;

  function onSquare(sq: number) {
    if (!playerTurn) return;
    unlockAudio();
    if (selected != null) {
      const mv = legal.find((m) => m.to === sq);
      if (mv) {
        const captured = pos.board[mv.to] !== 0;
        const notation = formatMove(pos, mv);
        const next = applyMove(pos, mv.from, mv.to);
        const nextIds = shiftIds(ids, mv.from, mv.to);
        const hist: Hist = {
          fen: toFen(pos),
          ids: ids.slice(),
          notation,
          from: mv.from,
          to: mv.to,
        };
        const nextHist = [...history, hist];
        setPos(next);
        setIds(nextIds);
        setHistory(nextHist);
        setLastMove({ from: mv.from, to: mv.to });
        setSelected(null);
        setHint(null);
        if (captured) playCapture();
        else playMove();
        persistGame(next, nextHist, { from: mv.from, to: mv.to }, playerSide, difficulty);
        if (!finishIfOver(next, playerSide, difficulty)) {
          void runAi(next, nextIds, playerSide, difficulty);
        }
        return;
      }
    }
    const piece = pos.board[sq]!;
    if (piece && pieceSide(piece) === pos.side) {
      setSelected(sq);
      playSelect();
      return;
    }
    setSelected(null);
  }

  function undo() {
    if (thinking || history.length === 0) return;
    jobRef.current += 1;
    setThinking(false);
    const want = playerTurn ? 2 : 1;
    const cut = Math.min(want, history.length);
    const rewind = history[history.length - cut]!;
    const restored = fromFen(rewind.fen);
    const restoredIds = rewind.ids.length ? rewind.ids : assignIds(restored.board);
    const nextHist = history.slice(0, history.length - cut);
    const prev = nextHist[nextHist.length - 1];
    setPos(restored);
    setIds(restoredIds);
    setHistory(nextHist);
    setLastMove(prev ? { from: prev.from, to: prev.to } : null);
    setSelected(null);
    setHint(null);
    setOverlay("none");
    scoredRef.current = false;
    persistGame(
      restored,
      nextHist,
      prev ? { from: prev.from, to: prev.to } : null,
      playerSide,
      difficulty,
    );
  }

  async function onHint() {
    if (!playerTurn || hinting) return;
    setHinting(true);
    const reply = await askAi(toFen(pos), difficulty === "easy" ? "medium" : difficulty);
    setHinting(false);
    if (reply.from >= 0) setHint({ from: reply.from, to: reply.to });
  }

  const caps = capturedPieces(
    history.map((h) => h.fen),
    pos,
  );
  const redTaken = caps.filter((p) => pieceSide(p) === RED);
  const blackTaken = caps.filter((p) => pieceSide(p) === BLACK);

  const turnText = status.over
    ? status.winner === "draw"
      ? "和棋"
      : `${status.winner === "red" ? "红方" : "黑方"}胜`
    : thinking
      ? "对方思考中"
      : pos.side === RED
        ? "红方行棋"
        : "黑方行棋";

  return (
    <div className="xq-app">
      {screen === "menu" ? (
        <StartScreen
          difficulty={difficulty}
          playerSide={playerSide}
          stats={stats}
          hasSave={hydrated && !!save.game}
          onDifficulty={(d) => setSave((s) => ({ ...s, difficulty: d }))}
          onSide={(side) => setSave((s) => ({ ...s, playerSide: side }))}
          onStart={() => begin(difficulty, playerSide, false)}
          onResume={() => begin(save.game?.difficulty ?? difficulty, save.game?.playerSide ?? playerSide, true)}
          onHelp={() => setOverlay("help")}
        />
      ) : (
        <div className="xq-play">
          <header className="xq-top">
            <button type="button" className="xq-brand" onClick={() => setScreen("menu")}>
              楚河汉界
            </button>
            <div className="xq-top-meta">
              <span className="xq-chip">{DIFF_LABEL[difficulty]}</span>
              <span className={cn("xq-chip", status.inCheck && !status.over && "xq-chip-warn")}>
                {status.inCheck && !status.over ? "将军" : turnText}
              </span>
            </div>
            <div className="xq-top-actions">
              <Button
                variant="ghost"
                size="icon"
                aria-label={sound ? "关闭声音" : "打开声音"}
                onClick={() => setSave((s) => ({ ...s, sound: !s.sound }))}
              >
                {sound ? <Volume2 /> : <VolumeX />}
              </Button>
            </div>
          </header>

          <div className="xq-stage">
            <Board
              pos={pos}
              ids={ids}
              flipped={playerSide === "black"}
              selected={selected}
              legal={legal}
              lastMove={lastMove}
              hint={hint}
              inCheck={status.inCheck && !status.over}
              interactive={playerTurn}
              onSquare={onSquare}
            />

            <aside className="xq-panel">
              <p className="xq-turn-copy">
                {thinking ? (
                  <span className="xq-thinking">
                    对方正在思考
                    <span className="xq-dots" aria-hidden="true" />
                  </span>
                ) : playerTurn ? (
                  "轮到你了"
                ) : (
                  turnText
                )}
              </p>
              <CapturedRow pieces={blackTaken} label="红方吃子" />
              <CapturedRow pieces={redTaken} label="黑方吃子" />
              <div className="xq-moves">
                <div className="xq-moves-head">着法</div>
                <ol className="xq-moves-list">
                  {history.length === 0 ? (
                    <li className="xq-moves-empty">尚无着法</li>
                  ) : (
                    Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => {
                      const a = history[i * 2];
                      const b = history[i * 2 + 1];
                      return (
                        <li key={i}>
                          <span className="xq-mn tabular-nums">{i + 1}.</span>
                          <span>{a?.notation}</span>
                          {b ? <span>{b.notation}</span> : null}
                        </li>
                      );
                    })
                  )}
                </ol>
              </div>
              <div className="xq-tools">
                <Button variant="secondary" disabled={history.length === 0 || thinking} onClick={undo}>
                  <Undo2 />
                  悔棋
                </Button>
                <Button variant="secondary" disabled={!playerTurn || hinting} onClick={() => void onHint()}>
                  <Lightbulb />
                  {hinting ? "计算中" : "提示"}
                </Button>
                <Button
                  variant="outline"
                  disabled={status.over}
                  onClick={() => setOverlay("resign")}
                >
                  <Flag />
                  认输
                </Button>
                <Button variant="ghost" onClick={() => setOverlay("newgame")}>
                  <RotateCcw />
                  新局
                </Button>
              </div>
            </aside>
          </div>
        </div>
      )}

      {overlay === "help" ? <HelpOverlay onClose={() => setOverlay("none")} /> : null}
      {overlay === "resign" ? (
        <ConfirmOverlay
          title="认输？"
          body="本局将记为失败。"
          confirm="认输"
          onCancel={() => setOverlay("none")}
          onConfirm={() => {
            const end: Extract<Outcome, { over: true }> = {
              over: true,
              inCheck: status.inCheck,
              winner: playerSide === "red" ? "black" : "red",
              reason: "resign",
            };
            setOverlay("result");
            recordResult(end, playerSide, difficulty);
          }}
        />
      ) : null}
      {overlay === "newgame" ? (
        <ConfirmOverlay
          title="开始新局？"
          body="当前对局进度会丢失。"
          confirm="新局"
          onCancel={() => setOverlay("none")}
          onConfirm={() => begin(difficulty, playerSide, false)}
        />
      ) : null}
      {overlay === "result" && status.over ? (
        <ResultOverlay
          result={status}
          playerSide={playerSide}
          onAgain={() => begin(difficulty, playerSide, false)}
          onMenu={() => {
            setOverlay("none");
            setScreen("menu");
          }}
        />
      ) : null}
      {overlay === "result" && !status.over ? (
        <ResultOverlay
          result={{
            over: true,
            inCheck: false,
            winner: playerSide === "red" ? "black" : "red",
            reason: "resign",
          }}
          playerSide={playerSide}
          onAgain={() => begin(difficulty, playerSide, false)}
          onMenu={() => {
            setOverlay("none");
            setScreen("menu");
          }}
        />
      ) : null}
    </div>
  );
}
