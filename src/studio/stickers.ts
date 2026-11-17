import { uid } from '../lib/utils';
import { makeIcon, makeLine, makeShape, makeText } from './factory';
import type { StudioElement } from './types';

/**
 * Ready-made decorations built from ordinary elements and grouped, so they
 * stay fully editable. Each builder lays out around (0, 0) in a box of the
 * given size; the caller moves the group into place.
 */

export interface Sticker {
  id: string;
  label: string;
  category: 'Stickers' | 'Badges' | 'Dividers';
  /** Natural size (design px at a 1080 px canvas). */
  w: number;
  h: number;
  build: () => StudioElement[];
}

const D = { width: 1080, height: 1080 };
const T = (over: Parameters<typeof makeText>[1]) => makeText(D, over);

export const STICKERS: Sticker[] = [
  {
    id: 'sale-burst',
    label: 'Sale burst',
    category: 'Stickers',
    w: 300,
    h: 300,
    build: () => [
      makeShape(D, 'star', { x: 0, y: 0, w: 300, h: 300, fill: '#ff375f', name: 'Burst' }),
      T({ kind: 'body', text: 'SALE', fontFamily: 'bebas', fontSize: 78, color: '#ffffff', x: 40, w: 220, y: 118, lineHeight: 1 }),
    ],
  },
  {
    id: 'new-pill',
    label: 'New pill',
    category: 'Stickers',
    w: 220,
    h: 80,
    build: () => [
      makeShape(D, 'rect', { x: 0, y: 0, w: 220, h: 80, radius: 40, fill: '#30d158', name: 'Pill' }),
      T({ kind: 'body', text: 'NEW', fontSize: 34, bold: true, letterSpacing: 4, color: '#ffffff', x: 0, w: 220, y: 20 }),
    ],
  },
  {
    id: 'price-tag',
    label: 'Price tag',
    category: 'Stickers',
    w: 260,
    h: 130,
    build: () => [
      makeShape(D, 'rect', { x: 0, y: 0, w: 260, h: 130, radius: 22, fill: '#ffd60a', name: 'Tag' }),
      makeShape(D, 'ellipse', { x: 22, y: 51, w: 28, h: 28, fill: '#1d1d1f', name: 'Hole' }),
      T({ kind: 'body', text: '$29', fontFamily: 'bebas', fontSize: 84, color: '#1d1d1f', x: 60, w: 190, y: 22, lineHeight: 1 }),
    ],
  },
  {
    id: 'limited',
    label: 'Limited offer',
    category: 'Stickers',
    w: 340,
    h: 90,
    build: () => [
      makeShape(D, 'rect', { x: 0, y: 0, w: 340, h: 90, radius: 14, fill: '#1d1d1f', name: 'Banner' }),
      makeIcon(D, 'hourglass', { x: 22, y: 22, w: 46, h: 46, color: '#ffd60a', weight: 2 }),
      T({ kind: 'body', text: 'Limited offer', fontSize: 34, bold: true, color: '#ffffff', align: 'left', x: 82, w: 240, y: 24 }),
    ],
  },
  {
    id: 'speech',
    label: 'Speech bubble',
    category: 'Stickers',
    w: 320,
    h: 220,
    build: () => [
      makeShape(D, 'bubble', { x: 0, y: 0, w: 320, h: 220, fill: '#ffffff', stroke: '#1d1d1f', strokeWidth: 6, name: 'Bubble' }),
      T({ kind: 'body', text: 'Hello!', fontFamily: 'caveat', fontSize: 70, bold: true, color: '#1d1d1f', x: 20, w: 280, y: 44 }),
    ],
  },
  {
    id: 'thanks',
    label: 'Thank you',
    category: 'Stickers',
    w: 420,
    h: 120,
    build: () => [T({ kind: 'heading', text: 'Thank you', fontFamily: 'pacifico', bold: false, fontSize: 84, color: '#ff375f', x: 0, w: 420, y: 10 })],
  },
  {
    id: 'arrow-callout',
    label: 'Look here',
    category: 'Stickers',
    w: 360,
    h: 140,
    build: () => [
      T({ kind: 'body', text: 'Look here!', fontFamily: 'caveat', fontSize: 64, bold: true, color: '#1d1d1f', align: 'left', x: 0, w: 260, y: 0 }),
      makeLine(D, true, { x: 150, y: 80, w: 200, h: 40, color: '#1d1d1f', strokeWidth: 6, rotation: 18, name: 'Arrow' }),
    ],
  },
  {
    id: 'circle-badge',
    label: 'Circle badge',
    category: 'Badges',
    w: 240,
    h: 240,
    build: () => [
      makeShape(D, 'ellipse', { x: 0, y: 0, w: 240, h: 240, fill: '#0a84ff', name: 'Badge' }),
      makeShape(D, 'ellipse', { x: 14, y: 14, w: 212, h: 212, fill: null, stroke: '#ffffff', strokeWidth: 4, name: 'Ring' }),
      T({ kind: 'body', text: 'BEST\nSELLER', fontFamily: 'oswald', bold: true, fontSize: 44, lineHeight: 1, color: '#ffffff', x: 20, w: 200, y: 76 }),
    ],
  },
  {
    id: 'seal',
    label: 'Seal',
    category: 'Badges',
    w: 240,
    h: 240,
    build: () => [
      makeShape(D, 'star', { x: 0, y: 0, w: 240, h: 240, fill: '#ffd60a', name: 'Seal' }),
      makeIcon(D, 'badge-check', { x: 80, y: 82, w: 80, h: 80, color: '#1d1d1f', weight: 2 }),
    ],
  },
  {
    id: 'ribbon',
    label: 'Ribbon',
    category: 'Badges',
    w: 420,
    h: 90,
    build: () => [
      makeShape(D, 'diamond', { x: 0, y: 15, w: 60, h: 60, fill: '#c41e3a', name: 'Ribbon end' }),
      makeShape(D, 'diamond', { x: 360, y: 15, w: 60, h: 60, fill: '#c41e3a', name: 'Ribbon end' }),
      makeShape(D, 'rect', { x: 30, y: 0, w: 360, h: 90, radius: 6, fill: '#ff375f', name: 'Ribbon' }),
      T({ kind: 'body', text: 'SPECIAL EDITION', fontSize: 30, bold: true, letterSpacing: 3, color: '#ffffff', x: 30, w: 360, y: 28 }),
    ],
  },
  {
    id: 'rating',
    label: 'Rating',
    category: 'Badges',
    w: 360,
    h: 70,
    build: () => [0, 1, 2, 3, 4].map((i) => makeShape(D, 'star', { x: i * 74, y: 0, w: 66, h: 66, fill: '#ffd60a', name: 'Star' })),
  },
  {
    id: 'verified',
    label: 'Verified',
    category: 'Badges',
    w: 300,
    h: 80,
    build: () => [
      makeShape(D, 'rect', { x: 0, y: 0, w: 300, h: 80, radius: 40, fill: '#e8f2ff', name: 'Pill' }),
      makeIcon(D, 'shield-check', { x: 22, y: 18, w: 44, h: 44, color: '#0a84ff', weight: 2 }),
      T({ kind: 'body', text: 'Verified', fontSize: 32, bold: true, color: '#0a84ff', align: 'left', x: 78, w: 200, y: 20 }),
    ],
  },
  {
    id: 'div-line',
    label: 'Thin line',
    category: 'Dividers',
    w: 600,
    h: 24,
    build: () => [makeLine(D, false, { x: 0, y: 0, w: 600, h: 24, strokeWidth: 3, color: '#1d1d1f', name: 'Divider' })],
  },
  {
    id: 'div-dots',
    label: 'Dotted',
    category: 'Dividers',
    w: 600,
    h: 24,
    build: () => [makeLine(D, false, { x: 0, y: 0, w: 600, h: 24, strokeWidth: 8, color: '#1d1d1f', dash: 'dotted', name: 'Divider' })],
  },
  {
    id: 'div-diamond',
    label: 'Diamond',
    category: 'Dividers',
    w: 600,
    h: 40,
    build: () => [
      makeLine(D, false, { x: 0, y: 8, w: 270, h: 24, strokeWidth: 3, color: '#1d1d1f', name: 'Divider left' }),
      makeShape(D, 'diamond', { x: 286, y: 6, w: 28, h: 28, fill: '#1d1d1f', name: 'Diamond' }),
      makeLine(D, false, { x: 330, y: 8, w: 270, h: 24, strokeWidth: 3, color: '#1d1d1f', name: 'Divider right' }),
    ],
  },
  {
    id: 'div-star',
    label: 'Star',
    category: 'Dividers',
    w: 600,
    h: 50,
    build: () => [
      makeLine(D, false, { x: 0, y: 13, w: 260, h: 24, strokeWidth: 2, color: '#1d1d1f', dash: 'dashed', name: 'Divider left' }),
      makeIcon(D, 'sparkles', { x: 280, y: 5, w: 40, h: 40, color: '#1d1d1f', weight: 2 }),
      makeLine(D, false, { x: 340, y: 13, w: 260, h: 24, strokeWidth: 2, color: '#1d1d1f', dash: 'dashed', name: 'Divider right' }),
    ],
  },
  {
    id: 'div-double',
    label: 'Double',
    category: 'Dividers',
    w: 600,
    h: 30,
    build: () => [
      makeLine(D, false, { x: 0, y: 0, w: 600, h: 16, strokeWidth: 3, color: '#1d1d1f', name: 'Line' }),
      makeLine(D, false, { x: 0, y: 14, w: 600, h: 16, strokeWidth: 3, color: '#1d1d1f', name: 'Line' }),
    ],
  },
];

/** Build a sticker scaled for a canvas and grouped (single-element stickers stay ungrouped). */
export function buildSticker(s: Sticker, canvas: { width: number; height: number }, at: { x: number; y: number }): StudioElement[] {
  const k = Math.min(canvas.width, canvas.height) / 1080;
  const els = s.build();
  const gid = els.length > 1 ? uid('grp') : null;
  const w = s.w * k;
  const h = s.h * k;
  return els.map((e) => {
    const scaled: StudioElement = { ...e, x: at.x - w / 2 + e.x * k, y: at.y - h / 2 + e.y * k, w: e.w * k, h: e.h * k, groupId: gid };
    if (scaled.type === 'text') return { ...scaled, fontSize: scaled.fontSize * k, letterSpacing: scaled.letterSpacing * k };
    if (scaled.type === 'shape') return { ...scaled, strokeWidth: scaled.strokeWidth * k, radius: scaled.radius * k };
    if (scaled.type === 'line') return { ...scaled, strokeWidth: scaled.strokeWidth * k };
    return scaled;
  });
}
