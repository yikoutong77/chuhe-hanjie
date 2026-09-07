import type { Difficulty } from "@/lib/xiangqi/engine";

export type { Difficulty } from "@/lib/xiangqi/engine";

export type PlayerSide = "red" | "black";

export type Stats = Record<Difficulty, { win: number; loss: number; draw: number }>;

export type SavedGame = {
  fen: string;
  notations: string[];
  difficulty: Difficulty;
  playerSide: PlayerSide;
  lastFrom: number | null;
  lastTo: number | null;
};

export type SaveData = {
  version: 1;
  sound: boolean;
  difficulty: Difficulty;
  playerSide: PlayerSide;
  stats: Stats;
  game: SavedGame | null;
};

const KEY = "xiangqi-chuhehanjie-v1";

const emptyStats = (): Stats => ({
  easy: { win: 0, loss: 0, draw: 0 },
  medium: { win: 0, loss: 0, draw: 0 },
  hard: { win: 0, loss: 0, draw: 0 },
});

export const defaultSave = (): SaveData => ({
  version: 1,
  sound: true,
  difficulty: "medium",
  playerSide: "red",
  stats: emptyStats(),
  game: null,
});

export function loadSave(): SaveData {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1) return base;
    return {
      ...base,
      ...parsed,
      version: 1,
      stats: { ...emptyStats(), ...parsed.stats },
      game: parsed.game ?? null,
    };
  } catch {
    return base;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota */
  }
}
