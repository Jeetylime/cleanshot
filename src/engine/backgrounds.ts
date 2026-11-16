import type { AspectRatioId, BackgroundFill, BackgroundSettings } from '../types';

export interface BackgroundPreset {
  id: string;
  name: string;
  fill: BackgroundFill;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'sonoma',
    name: 'Sonoma',
    fill: {
      kind: 'mesh',
      base: '#7fb7a4',
      blobs: [
        { x: 0.1, y: 0.15, r: 0.75, color: '#f3d9a4' },
        { x: 0.95, y: 0.2, r: 0.7, color: '#4f9d8c' },
        { x: 0.55, y: 1.05, r: 0.8, color: '#2f6f8f' },
      ],
    },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    fill: {
      kind: 'mesh',
      base: '#f0a39a',
      blobs: [
        { x: 0.0, y: 0.0, r: 0.8, color: '#f8d0b0' },
        { x: 1.0, y: 0.1, r: 0.75, color: '#c38fd8' },
        { x: 0.6, y: 1.0, r: 0.8, color: '#7c7ce0' },
      ],
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    fill: {
      kind: 'mesh',
      base: '#161a3a',
      blobs: [
        { x: 0.05, y: 0.1, r: 0.7, color: '#4b3fb5' },
        { x: 0.95, y: 0.25, r: 0.65, color: '#1f6fb2' },
        { x: 0.5, y: 1.05, r: 0.75, color: '#a8327d' },
      ],
    },
  },
  {
    id: 'glacier',
    name: 'Glacier',
    fill: {
      kind: 'mesh',
      base: '#cfe3f5',
      blobs: [
        { x: 0.0, y: 0.0, r: 0.8, color: '#f4f8fc' },
        { x: 1.0, y: 0.3, r: 0.7, color: '#9cc3ee' },
        { x: 0.3, y: 1.1, r: 0.7, color: '#b7b4ec' },
      ],
    },
  },
  {
    id: 'sky',
    name: 'Sky',
    fill: { kind: 'gradient', from: '#a5c8ff', to: '#6f8ff8', angle: 150 },
  },
  {
    id: 'blossom',
    name: 'Blossom',
    fill: { kind: 'gradient', from: '#f9d5e5', to: '#c5b6f3', angle: 135 },
  },
  {
    id: 'citrus',
    name: 'Citrus',
    fill: { kind: 'gradient', from: '#fde7a6', to: '#f6a77c', angle: 140 },
  },
  {
    id: 'meadow',
    name: 'Meadow',
    fill: { kind: 'gradient', from: '#d8f0c6', to: '#7cc3a3', angle: 145 },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    fill: { kind: 'gradient', from: '#2e5f8a', to: '#16213e', angle: 160 },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    fill: { kind: 'gradient', from: '#3d3d42', to: '#1b1b1e', angle: 160 },
  },
  {
    id: 'paper',
    name: 'Paper',
    fill: { kind: 'solid', color: '#f2f2f4' },
  },
  {
    id: 'ink',
    name: 'Ink',
    fill: { kind: 'solid', color: '#141416' },
  },
];

export const SOLID_SWATCHES = [
  '#ffffff',
  '#f2f2f4',
  '#d9d9de',
  '#8e8e93',
  '#2c2c2e',
  '#000000',
  '#ffd6d1',
  '#ffe9b8',
  '#d3f2dc',
  '#cfe4ff',
  '#e3d7ff',
  '#0a84ff',
];

export const ASPECT_RATIOS: { id: AspectRatioId; label: string; value: number | null }[] = [
  { id: 'auto', label: 'Auto', value: null },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '3:2', label: '3:2', value: 3 / 2 },
  { id: '16:10', label: '16:10', value: 16 / 10 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '4:5', label: '4:5', value: 4 / 5 },
  { id: '9:16', label: '9:16', value: 9 / 16 },
];

export function aspectValue(id: AspectRatioId): number | null {
  return ASPECT_RATIOS.find((a) => a.id === id)?.value ?? null;
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  enabled: false,
  fill: BACKGROUND_PRESETS[0].fill,
  presetId: BACKGROUND_PRESETS[0].id,
  padding: 64,
  radius: 12,
  shadow: 45,
  aspect: 'auto',
};

/** CSS preview for a fill (used by swatches in the UI). */
export function fillToCss(fill: BackgroundFill): string {
  switch (fill.kind) {
    case 'transparent':
      return 'repeating-conic-gradient(#8a8a90 0% 25%, #c8c8cc 0% 50%) 50% / 10px 10px';
    case 'solid':
      return fill.color;
    case 'gradient':
      return `linear-gradient(${fill.angle}deg, ${fill.from}, ${fill.to})`;
    case 'mesh': {
      const layers = fill.blobs.map(
        (b) => `radial-gradient(circle at ${b.x * 100}% ${b.y * 100}%, ${b.color} 0%, ${b.color}00 ${b.r * 100}%)`,
      );
      return `${layers.join(', ')}, ${fill.base}`;
    }
  }
}

/** Paint a background fill into the rect (0, 0, w, h) of the current transform. */
export function paintFill(ctx: CanvasRenderingContext2D, fill: BackgroundFill, w: number, h: number) {
  switch (fill.kind) {
    case 'transparent':
      return;
    case 'solid':
      ctx.fillStyle = fill.color;
      ctx.fillRect(0, 0, w, h);
      return;
    case 'gradient': {
      // CSS angle semantics: 0deg points up, 90deg points right.
      const a = (fill.angle * Math.PI) / 180;
      const dx = Math.sin(a);
      const dy = -Math.cos(a);
      const len = Math.abs(w * dx) + Math.abs(h * dy);
      const cx = w / 2;
      const cy = h / 2;
      const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
      g.addColorStop(0, fill.from);
      g.addColorStop(1, fill.to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    case 'mesh': {
      ctx.fillStyle = fill.base;
      ctx.fillRect(0, 0, w, h);
      const m = Math.max(w, h);
      for (const b of fill.blobs) {
        const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * m);
        g.addColorStop(0, b.color);
        g.addColorStop(1, `${b.color}00`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      return;
    }
  }
}
