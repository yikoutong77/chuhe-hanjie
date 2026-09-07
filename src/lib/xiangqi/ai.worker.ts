/// <reference lib="webworker" />

import { fromFen, type Difficulty } from "./engine.ts";
import { findBestMove } from "./search.ts";

type InMsg = {
  requestId: number;
  fen: string;
  difficulty: Difficulty;
};

let generation = 0;

self.onmessage = (event: MessageEvent<InMsg>) => {
  const { requestId, fen, difficulty } = event.data;
  const my = ++generation;
  try {
    const pos = fromFen(fen);
    const result = findBestMove(pos, difficulty, () => generation !== my);
    if (generation !== my) return;
    self.postMessage({
      requestId,
      from: result.move?.from ?? -1,
      to: result.move?.to ?? -1,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
    });
  } catch (err) {
    if (generation !== my) return;
    self.postMessage({
      requestId,
      from: -1,
      to: -1,
      score: 0,
      depth: 0,
      nodes: 0,
      error: err instanceof Error ? err.message : "search failed",
    });
  }
};
