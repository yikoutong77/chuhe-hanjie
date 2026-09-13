import { useEffect, useRef } from "react";
import {
  A,
  C,
  E,
  H,
  K,
  P,
  PIECE_CHAR,
  R,
  fileOf,
  rankOf,
} from "@/lib/xiangqi/engine";

export type MoveBurstKind = "move" | "capture" | "check" | "mate";

export type MoveBurst = {
  id: number;
  from: number;
  to: number;
  kind: MoveBurstKind;
  red: boolean;
  piece: number;
  captured: boolean;
  victim: number;
};

const PAD = 30;
const CELL = 40;
const VB_W = PAD * 2 + CELL * 8;
const VB_H = PAD * 2 + CELL * 9;

type RGB = [number, number, number];

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  life: number;
  max: number;
  size: number;
  sizeEnd: number;
  rot: number;
  vr: number;
  rgb: RGB;
  kind: "glow" | "spark" | "dust" | "shard" | "streak" | "ray";
};

type Ring = {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  w: number;
  rgb: RGB;
};

type Slash = {
  x: number;
  y: number;
  ang: number;
  len: number;
  w: number;
  life: number;
  max: number;
  rgb: RGB;
};

function xy(file: number, rank: number, flipped: boolean) {
  const f = flipped ? 8 - file : file;
  const r = flipped ? rank : 9 - rank;
  return { x: PAD + f * CELL, y: PAD + r * CELL };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: RGB, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
  g.addColorStop(0.38, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * 0.32})`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function palette(red: boolean, capture: boolean) {
  const core: RGB = red ? [236, 86, 64] : [236, 214, 148];
  const hot: RGB = capture ? [255, 244, 220] : red ? [255, 196, 150] : [255, 236, 210];
  const dust: RGB = [158, 108, 58];
  const white: RGB = [255, 248, 236];
  return { core, hot, dust, white };
}

function bolt(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rgb: RGB,
  a: number,
) {
  const n = 7;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const jx = lerp(ax, bx, t);
    const jy = lerp(ay, by, t);
    const nx = -(by - ay);
    const ny = bx - ax;
    const L = Math.hypot(nx, ny) || 1;
    const mag = (i % 2 === 0 ? 1 : -1) * 10 * (1 - Math.abs(t - 0.5) * 2);
    ctx.lineTo(jx + (nx / L) * mag, jy + (ny / L) * mag);
  }
  ctx.lineTo(bx, by);
  ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.stroke();
}

export function MoveFxLayer({
  burst,
  flipped,
  kingSq,
}: {
  burst: MoveBurst;
  flipped: boolean;
  kingSq: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sx = w / VB_W;
    const sy = h / VB_H;
    const a0 = xy(fileOf(burst.from), rankOf(burst.from), flipped);
    const b0 = xy(fileOf(burst.to), rankOf(burst.to), flipped);
    const a = { x: a0.x * sx, y: a0.y * sy };
    const b = { x: b0.x * sx, y: b0.y * sy };
    const king =
      kingSq >= 0
        ? (() => {
            const k = xy(fileOf(kingSq), rankOf(kingSq), flipped);
            return { x: k.x * sx, y: k.y * sy };
          })()
        : null;
    const cell = CELL * sx;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const hop = burst.piece === H;
    const ctrl = {
      x: a.x + dx * 0.5 - dy * (hop ? 0.48 : 0.36),
      y: a.y + dy * 0.5 + dx * (hop ? 0.48 : 0.36),
    };

    const at = (t: number) => {
      if (!hop) return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
      const u = 1 - t;
      return {
        x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y,
      };
    };

    const capture = burst.captured || burst.kind === "capture";
    const big = capture || burst.kind === "check" || burst.kind === "mate";
    const { core, hot, dust, white } = palette(burst.red, capture);
    const parts: P[] = [];
    const rings: Ring[] = [];
    const slashes: Slash[] = [];
    let impactDone = false;
    let wave2 = false;
    const impactAt = burst.piece === C ? 0.32 : burst.piece === R ? 0.15 : 0.2;
    const duration = burst.kind === "mate" ? 1.35 : big ? 1.12 : 0.88;
    let flash = 0;

    const emit = (p: Omit<P, "life"> & { life?: number }) => {
      parts.push({ life: p.max, ...p });
    };

    const burstSparks = (x: number, y: number, n: number, speed: number, rgb: RGB, kind: P["kind"]) => {
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + rand(-0.25, 0.25);
        const sp = rand(speed * 0.4, speed);
        emit({
          x,
          y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          ay: kind === "spark" ? 520 : kind === "dust" ? 40 : 120,
          max: rand(0.4, 0.72),
          size: rand(cell * 0.06, cell * 0.14),
          sizeEnd: 0,
          rot: ang,
          vr: rand(-8, 8),
          rgb,
          kind,
        });
      }
    };

    const addRing = (x: number, y: number, vr: number, life: number, w: number, rgb: RGB, r0 = cell * 0.08) => {
      rings.push({ x, y, r: r0, vr, life, max: life, w, rgb });
    };

    const impact = () => {
      flash = big ? 0.85 : 0.45;
      addRing(b.x, b.y, cell * (big ? 7.2 : 5.2), 0.55, big ? 4.2 : 2.8, hot);
      addRing(b.x, b.y, cell * (big ? 4.6 : 3.2), 0.42, 2.4, core, cell * 0.04);
      addRing(b.x, b.y, cell * (big ? 3.2 : 2.2), 0.32, 1.6, white, cell * 0.02);

      burstSparks(b.x, b.y, big ? 22 : 14, cell * (big ? 5.4 : 3.4), hot, "spark");
      burstSparks(b.x, b.y, big ? 14 : 8, cell * (big ? 2.6 : 1.8), core, "glow");

      const rays = big ? 12 : 8;
      for (let i = 0; i < rays; i++) {
        const ang = (Math.PI * 2 * i) / rays + rand(-0.08, 0.08);
        emit({
          x: b.x,
          y: b.y,
          vx: 0,
          vy: 0,
          ay: 0,
          max: 0.38,
          size: cell * (big ? 2.4 : 1.5),
          sizeEnd: cell * 0.2,
          rot: ang,
          vr: 0,
          rgb: i % 2 ? white : hot,
          kind: "ray",
        });
      }

      const slashAng = Math.atan2(uy, ux);
      slashes.push({
        x: b.x,
        y: b.y,
        ang: slashAng,
        len: cell * (big ? 3.6 : 2.2),
        w: big ? 7 : 4,
        life: 0.34,
        max: 0.34,
        rgb: white,
      });
      if (capture) {
        slashes.push({
          x: b.x,
          y: b.y,
          ang: slashAng + 0.55,
          len: cell * 2.8,
          w: 4,
          life: 0.28,
          max: 0.28,
          rgb: core,
        });
      }

      if (burst.piece === C) {
        burstSparks(b.x, b.y, 20, cell * 6.2, hot, "spark");
        burstSparks(b.x, b.y, 12, cell * 2.2, dust, "dust");
        addRing(b.x, b.y, cell * 8.4, 0.62, 3.2, core);
        for (let i = 0; i < 14; i++) {
          emit({
            x: b.x,
            y: b.y,
            vx: rand(-cell, cell) * 0.7,
            vy: rand(-cell * 2.2, -cell * 0.2),
            ay: 60,
            max: rand(0.5, 0.9),
            size: rand(cell * 0.22, cell * 0.46),
            sizeEnd: cell * 0.7,
            rot: 0,
            vr: 0,
            rgb: dust,
            kind: "dust",
          });
        }
      }

      if (burst.piece === R) {
        for (let i = 0; i < 10; i++) {
          const t = i / 9;
          const p = at(t);
          emit({
            x: p.x + nx * rand(-cell * 0.15, cell * 0.15),
            y: p.y + ny * rand(-cell * 0.15, cell * 0.15),
            vx: ux * cell * 1.2,
            vy: uy * cell * 1.2,
            ay: 0,
            max: 0.4,
            size: cell * 0.42,
            sizeEnd: 0,
            rot: slashAng,
            vr: 0,
            rgb: hot,
            kind: "streak",
          });
        }
      }

      if (burst.piece === H) {
        burstSparks(b.x, b.y, 10, cell * 2.4, dust, "dust");
        for (let i = 1; i <= 4; i++) {
          const p = at(i / 5);
          emit({
            x: p.x,
            y: p.y,
            vx: 0,
            vy: cell * 0.3,
            ay: 40,
            max: 0.4,
            size: cell * 0.16,
            sizeEnd: cell * 0.3,
            rot: 0,
            vr: 0,
            rgb: dust,
            kind: "dust",
          });
        }
      }

      if (burst.piece === E) {
        addRing(b.x, b.y, cell * 6.8, 0.58, 5, dust, cell * 0.2);
        burstSparks(b.x, b.y, 12, cell * 2.8, dust, "dust");
      }

      if (burst.piece === A) {
        for (let i = 0; i < 4; i++) {
          slashes.push({
            x: b.x,
            y: b.y,
            ang: Math.PI / 4 + (i * Math.PI) / 2,
            len: cell * 1.6,
            w: 3,
            life: 0.32,
            max: 0.32,
            rgb: hot,
          });
        }
      }

      if (burst.piece === P) {
        burstSparks(b.x + ux * cell * 0.3, b.y + uy * cell * 0.3, 8, cell * 3.2, core, "spark");
      }

      if (burst.piece === K) {
        addRing(b.x, b.y, cell * 5.5, 0.6, 3, hot);
        addRing(b.x, b.y, cell * 3.8, 0.48, 2, white);
      }

      if (capture && burst.victim) {
        for (let i = 0; i < 12; i++) {
          const ang = (Math.PI * 2 * i) / 12 + rand(-0.12, 0.12);
          emit({
            x: b.x,
            y: b.y,
            vx: Math.cos(ang) * cell * rand(2.2, 4.2),
            vy: Math.sin(ang) * cell * rand(2.2, 4.2) - cell * 0.6,
            ay: 740,
            max: rand(0.45, 0.7),
            size: rand(cell * 0.12, cell * 0.22),
            sizeEnd: cell * 0.04,
            rot: rand(0, Math.PI),
            vr: rand(-14, 14),
            rgb: dust,
            kind: "shard",
          });
        }
      }

      if (king && (burst.kind === "check" || burst.kind === "mate")) {
        addRing(king.x, king.y, cell * 6.4, 0.7, 4.2, [220, 56, 48], cell * 0.15);
        addRing(king.x, king.y, cell * 3.8, 0.5, 2.4, white, cell * 0.06);
        burstSparks(king.x, king.y, 10, cell * 2.8, core, "spark");
      }
    };

    const samples = hop ? 9 : 7;
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const p = at(t);
      emit({
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        ay: 0,
        max: 0.4 + t * 0.16,
        size: cell * (0.34 - t * 0.08),
        sizeEnd: 0,
        rot: 0,
        vr: 0,
        rgb: core,
        kind: "glow",
      });
    }

    emit({
      x: a.x,
      y: a.y,
      vx: 0,
      vy: 0,
      ay: 0,
      max: 0.42,
      size: cell * 0.55,
      sizeEnd: 0,
      rot: 0,
      vr: 0,
      rgb: core,
      kind: "glow",
    });

    let last = performance.now();
    let t = 0;
    let raf = 0;
    const glyph = PIECE_CHAR[burst.red ? burst.piece : burst.piece | 8] ?? "";
    const victimGlyph = burst.victim ? PIECE_CHAR[burst.victim] : "";
    let drip = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      t += dt;
      if (!impactDone && t >= impactAt) {
        impactDone = true;
        impact();
      }
      if (!wave2 && t >= impactAt + 0.16) {
        wave2 = true;
        addRing(b.x, b.y, cell * (big ? 6.2 : 4.2), 0.48, 2.2, core, cell * 0.3);
        if (big) burstSparks(b.x, b.y, 8, cell * 3.2, white, "glow");
      }
      flash = Math.max(0, flash - dt * 2.4);

      ctx.clearRect(0, 0, w, h);

      const travel = Math.min(1, t / Math.max(0.12, impactAt));
      const pos = at(easeOut(travel));
      const ribbonAlpha = (1 - travel) ** 0.6;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      if (flash > 0.02) {
        glow(ctx, b.x, b.y, cell * (big ? 5.5 : 3.2), white, flash * 0.55);
        glow(ctx, b.x, b.y, cell * (big ? 2.2 : 1.3), hot, flash * 0.8);
        const vg = ctx.createRadialGradient(b.x, b.y, cell, b.x, b.y, Math.max(w, h) * 0.7);
        vg.addColorStop(0, `rgba(${core[0]},${core[1]},${core[2]},${0.12 * flash})`);
        vg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.strokeStyle = `rgba(${core[0]},${core[1]},${core[2]},${0.28 * ribbonAlpha})`;
      ctx.lineWidth = cell * 0.38;
      ctx.lineCap = "round";
      ctx.beginPath();
      if (hop) {
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, pos.x, pos.y);
      } else {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(pos.x, pos.y);
      }
      ctx.stroke();
      ctx.strokeStyle = `rgba(${hot[0]},${hot[1]},${hot[2]},${0.8 * ribbonAlpha})`;
      ctx.lineWidth = cell * 0.12;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,252,245,${0.95 * ribbonAlpha})`;
      ctx.lineWidth = cell * 0.045;
      ctx.stroke();

      if (burst.piece === R && travel < 1) {
        ctx.strokeStyle = `rgba(${hot[0]},${hot[1]},${hot[2]},${0.35 * ribbonAlpha})`;
        ctx.lineWidth = cell * 0.08;
        ctx.beginPath();
        ctx.moveTo(a.x + nx * cell * 0.22, a.y + ny * cell * 0.22);
        ctx.lineTo(pos.x + nx * cell * 0.22, pos.y + ny * cell * 0.22);
        ctx.moveTo(a.x - nx * cell * 0.22, a.y - ny * cell * 0.22);
        ctx.lineTo(pos.x - nx * cell * 0.22, pos.y - ny * cell * 0.22);
        ctx.stroke();
      }

      if (travel < 1) {
        drip += dt;
        if (drip > 0.018) {
          drip = 0;
          emit({
            x: pos.x + rand(-6, 6),
            y: pos.y + rand(-6, 6),
            vx: -ux * cell * 0.5 + rand(-30, 30),
            vy: -uy * cell * 0.5 + rand(-30, 30),
            ay: -20,
            max: 0.32,
            size: cell * (burst.piece === C ? 0.14 : 0.09),
            sizeEnd: 0,
            rot: 0,
            vr: 0,
            rgb: burst.piece === C ? hot : core,
            kind: "glow",
          });
        }
      }

      if (burst.piece === C && travel < 1) {
        glow(ctx, pos.x, pos.y, cell * 0.62, hot, 0.9);
        glow(ctx, pos.x, pos.y, cell * 0.26, white, 1);
      } else if (travel < 1) {
        glow(ctx, pos.x, pos.y, cell * 0.4, core, 0.5 * (1 - travel));
        glow(ctx, pos.x, pos.y, cell * 0.14, white, 0.55 * (1 - travel));
      }

      if (t < 0.46 && glyph) {
        ctx.globalCompositeOperation = "source-over";
        const fade = 1 - t / 0.46;
        ctx.globalAlpha = 0.28 * fade;
        ctx.fillStyle = burst.red ? "rgb(196,69,54)" : "rgb(26,21,18)";
        ctx.font = `700 ${cell * 0.48}px "Noto Serif SC", serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(glyph, a.x, a.y);
        const mid = at(0.45);
        ctx.globalAlpha = 0.16 * fade;
        ctx.fillText(glyph, mid.x, mid.y);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "lighter";
      }

      if (capture && victimGlyph && t < 0.5) {
        ctx.globalCompositeOperation = "source-over";
        const k = t / 0.5;
        ctx.globalAlpha = 0.75 * (1 - k);
        ctx.fillStyle = "rgb(26,21,18)";
        ctx.font = `700 ${cell * (0.55 + k * 0.4)}px "Noto Serif SC", serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(victimGlyph, b.x, b.y);
        ctx.globalAlpha = 1;
      }

      if (king && (burst.kind === "check" || burst.kind === "mate") && t > impactAt && t < impactAt + 0.45) {
        const ka = 1 - (t - impactAt) / 0.45;
        ctx.globalCompositeOperation = "lighter";
        bolt(ctx, b.x, b.y, king.x, king.y, [255, 180, 140], 0.75 * ka);
        bolt(ctx, b.x, b.y, king.x, king.y, [255, 248, 230], 0.4 * ka);
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        p.life -= dt;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        p.vy += p.ay * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const k = p.life / p.max;
        const size = lerp(p.sizeEnd, p.size, k);
        if (p.kind === "dust") {
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${0.28 * k})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === "shard") {
          ctx.globalCompositeOperation = "source-over";
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${0.9 * k})`;
          ctx.fillRect(-size, -size * 0.32, size * 2.1, size * 0.64);
          ctx.restore();
        } else if (p.kind === "streak") {
          ctx.globalCompositeOperation = "lighter";
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${0.62 * k})`;
          ctx.fillRect(-size * 1.3, -size * 0.1, size * 2.8, size * 0.2);
          ctx.restore();
        } else if (p.kind === "ray") {
          ctx.globalCompositeOperation = "lighter";
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const grd = ctx.createLinearGradient(0, 0, size, 0);
          grd.addColorStop(0, `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${0.9 * k})`);
          grd.addColorStop(1, `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},0)`);
          ctx.fillStyle = grd;
          ctx.fillRect(0, -1.6, size, 3.2);
          ctx.restore();
        } else {
          ctx.globalCompositeOperation = "lighter";
          glow(ctx, p.x, p.y, size * (p.kind === "spark" ? 2.1 : 2.6), p.rgb, 0.78 * k);
        }
      }

      ctx.globalCompositeOperation = "lighter";
      for (let i = slashes.length - 1; i >= 0; i--) {
        const s = slashes[i]!;
        s.life -= dt;
        if (s.life <= 0) {
          slashes.splice(i, 1);
          continue;
        }
        const k = s.life / s.max;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.ang);
        ctx.strokeStyle = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${0.95 * k})`;
        ctx.lineWidth = s.w * k;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-s.len, 0);
        ctx.lineTo(s.len, 0);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]!;
        ring.life -= dt;
        if (ring.life <= 0) {
          rings.splice(i, 1);
          continue;
        }
        ring.r += ring.vr * dt;
        const k = ring.life / ring.max;
        ctx.strokeStyle = `rgba(${ring.rgb[0]},${ring.rgb[1]},${ring.rgb[2]},${0.9 * k})`;
        ctx.lineWidth = Math.max(1, ring.w * k);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
      if (t < duration) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [burst, flipped, kingSq]);

  return <canvas ref={ref} className="xq-fx" aria-hidden="true" />;
}
