import { makeFrame, makeIcon, makeLine, makeShape, makeText } from './factory';
import type { StudioElement, StudioFill } from './types';
import { MORE_TEMPLATES } from './templatesMore';

export interface SizePreset {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'square', label: 'Square post', hint: 'Instagram, Facebook', width: 1080, height: 1080 },
  { id: 'portrait', label: 'Portrait post', hint: 'Instagram 4:5', width: 1080, height: 1350 },
  { id: 'story', label: 'Story', hint: 'Instagram, TikTok 9:16', width: 1080, height: 1920 },
  { id: 'youtube', label: 'YouTube thumbnail', hint: '16:9', width: 1280, height: 720 },
  { id: 'presentation', label: 'Presentation', hint: '1920 × 1080', width: 1920, height: 1080 },
  { id: 'banner', label: 'Web banner', hint: 'Header 3:1', width: 1500, height: 500 },
  { id: 'linkedin', label: 'LinkedIn banner', hint: '1584 × 396', width: 1584, height: 396 },
  { id: 'podcast', label: 'Podcast cover', hint: 'Square 1500', width: 1500, height: 1500 },
  { id: 'letter', label: 'US Letter', hint: '8.5 × 11 in at 150 dpi', width: 1275, height: 1650 },
  { id: 'a4', label: 'A4', hint: '210 × 297 mm at 150 dpi', width: 1240, height: 1754 },
];

export const RATIO_PRESETS = [
  { label: '1:1', w: 1, h: 1 },
  { label: '4:5', w: 4, h: 5 },
  { label: '3:2', w: 3, h: 2 },
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
  { label: '3:1', w: 3, h: 1 },
];

export const MAX_CANVAS_SIDE = 8000;

export interface Template {
  id: string;
  name: string;
  category:
    | 'Social'
    | 'Thumbnail'
    | 'Banner'
    | 'Announcement'
    | 'Promo'
    | 'Presentation'
    | 'Quote'
    | 'Menu'
    | 'Invitation'
    | 'Certificate'
    | 'Podcast'
    | 'Food'
    | 'Real estate'
    | 'Fitness'
    | 'Wedding'
    | 'Holiday'
    | 'Newsletter'
    | 'Flyer'
    | 'Business';
  /** Extra search words (never shown); name and category are searched too. */
  keywords: string[];
  width: number;
  height: number;
  background: StudioFill;
  build: (d: { width: number; height: number }) => StudioElement[];
}

const T = makeText;

const BASE_TEMPLATES: Template[] = [
  {
    id: 'quote',
    keywords: ['quote', 'inspiration', 'motivation', 'saying', 'words', 'wisdom', 'pink', 'peach', 'instagram'],
    name: 'Quote post',
    category: 'Social',
    width: 1080,
    height: 1080,
    background: { kind: 'gradient', from: '#fbe3c8', to: '#f2a7a0', angle: 135 },
    build: (d) => [
      makeIcon(d, 'quote', { x: 476, y: 170, w: 128, h: 128, color: '#5a2a27', weight: 1.6, name: 'Quote mark' }),
      T(d, { kind: 'heading', text: 'Make it simple, but significant.', fontFamily: 'playfair', italic: true, bold: false, fontSize: 92, color: '#3d1f1d', x: 110, w: 860, y: 360, lineHeight: 1.15 }),
      makeLine(d, false, { x: 470, y: 700, w: 140, h: 24, color: '#5a2a27', strokeWidth: 4 }),
      T(d, { kind: 'body', text: 'YOUR NAME', fontSize: 30, letterSpacing: 6, bold: true, color: '#5a2a27', x: 240, w: 600, y: 750 }),
    ],
  },
  {
    id: 'sale',
    keywords: ['sale', 'discount', 'offer', 'percent', 'off', 'summer', 'shop', 'store', 'black', 'friday', 'deal', 'retail'],
    name: 'Sale announcement',
    category: 'Promo',
    width: 1080,
    height: 1350,
    background: { kind: 'solid', color: '#111114' },
    build: (d) => [
      makeShape(d, 'star', { x: 640, y: 80, w: 360, h: 360, fill: '#ffd60a', name: 'Burst' }),
      T(d, { kind: 'body', text: '50%\nOFF', fontFamily: 'bebas', fontSize: 84, lineHeight: 0.92, color: '#111114', x: 720, w: 200, y: 200 }),
      T(d, { kind: 'heading', text: 'SUMMER\nSALE', fontFamily: 'bebas', fontSize: 300, lineHeight: 0.88, color: '#ffffff', align: 'left', x: 80, w: 920, y: 470 }),
      T(d, { kind: 'body', text: 'Everything in store. This weekend only.', fontSize: 40, color: '#c7c7cc', align: 'left', x: 86, w: 900, y: 1010 }),
      makeShape(d, 'rect', { x: 86, y: 1110, w: 340, h: 104, radius: 52, fill: '#ffd60a', name: 'Button' }),
      T(d, { kind: 'body', text: 'Shop now', bold: true, fontSize: 40, color: '#111114', x: 86, w: 340, y: 1137 }),
    ],
  },
  {
    id: 'youtube',
    keywords: ['youtube', 'thumbnail', 'video', 'vlog', 'challenge', 'clickbait', 'orange', 'creator'],
    name: 'Bold thumbnail',
    category: 'Thumbnail',
    width: 1280,
    height: 720,
    background: { kind: 'gradient', from: '#ff3b30', to: '#ff9f0a', angle: 120 },
    build: (d) => [
      makeShape(d, 'ellipse', { x: 760, y: 120, w: 520, h: 520, fill: '#ffffff33', name: 'Circle accent' }),
      T(d, { kind: 'heading', text: 'I TRIED IT\nFOR 30 DAYS', fontFamily: 'bebas', fontSize: 170, lineHeight: 0.92, color: '#ffffff', strokeWidth: 8, strokeColor: '#1d1d1f', align: 'left', x: 70, w: 760, y: 150, shadow: { enabled: true, color: '#000000', blur: 0, x: 8, y: 10, opacity: 0.45 } }),
      makeLine(d, true, { x: 640, y: 480, w: 240, h: 60, color: '#ffffff', strokeWidth: 16, rotation: -20, name: 'Arrow' }),
      makeShape(d, 'rect', { x: 74, y: 560, w: 300, h: 80, radius: 14, fill: '#1d1d1f', name: 'Tag' }),
      T(d, { kind: 'body', text: 'NEW VIDEO', fontFamily: 'oswald', bold: true, fontSize: 40, letterSpacing: 3, color: '#ffffff', x: 74, w: 300, y: 572 }),
    ],
  },
  {
    id: 'event',
    keywords: ['event', 'invite', 'invitation', 'party', 'launch', 'night', 'rsvp', 'story', 'purple'],
    name: 'Event story',
    category: 'Announcement',
    width: 1080,
    height: 1920,
    background: { kind: 'gradient', from: '#1e1b4b', to: '#7c3aed', angle: 160 },
    build: (d) => [
      makeShape(d, 'ellipse', { x: -200, y: -160, w: 760, h: 760, fill: '#a78bfa33', name: 'Glow' }),
      makeShape(d, 'ellipse', { x: 560, y: 1380, w: 700, h: 700, fill: '#f472b633', name: 'Glow 2' }),
      T(d, { kind: 'body', text: 'YOU’RE INVITED', bold: true, fontSize: 40, letterSpacing: 10, color: '#c4b5fd', x: 140, w: 800, y: 520 }),
      T(d, { kind: 'heading', text: 'Launch Night', fontFamily: 'playfair', fontSize: 170, color: '#ffffff', x: 90, w: 900, y: 610, lineHeight: 1.05 }),
      makeLine(d, false, { x: 440, y: 1000, w: 200, h: 24, color: '#c4b5fd', strokeWidth: 4 }),
      T(d, { kind: 'subheading', text: 'Friday, June 14 · 7 PM', fontSize: 54, color: '#ffffff', x: 140, w: 800, y: 1080 }),
      T(d, { kind: 'body', text: 'The Glass Room, 21 Main Street', fontSize: 40, color: '#ddd6fe', x: 140, w: 800, y: 1170 }),
      makeShape(d, 'rect', { x: 340, y: 1330, w: 400, h: 110, radius: 55, fill: '#ffffff', name: 'Button' }),
      T(d, { kind: 'body', text: 'RSVP', bold: true, fontSize: 44, letterSpacing: 4, color: '#4c1d95', x: 340, w: 400, y: 1357 }),
    ],
  },
  {
    id: 'presentation',
    keywords: ['slide', 'presentation', 'title', 'deck', 'keynote', 'report', 'quarterly', 'business', 'review'],
    name: 'Title slide',
    category: 'Presentation',
    width: 1920,
    height: 1080,
    background: { kind: 'solid', color: '#f5f5f7' },
    build: (d) => [
      makeShape(d, 'rect', { x: 0, y: 0, w: 28, h: 1080, radius: 0, fill: '#0a84ff', name: 'Accent bar' }),
      T(d, { kind: 'body', text: 'QUARTERLY REVIEW', bold: true, fontSize: 34, letterSpacing: 8, color: '#0a84ff', align: 'left', x: 180, w: 1200, y: 380 }),
      T(d, { kind: 'heading', text: 'Building what’s next', fontFamily: 'inter', fontSize: 132, color: '#1d1d1f', align: 'left', x: 172, w: 1500, y: 440, lineHeight: 1.05 }),
      T(d, { kind: 'body', text: 'Results, lessons and the plan for the year ahead', fontSize: 46, color: '#6e6e73', align: 'left', x: 180, w: 1400, y: 640 }),
      T(d, { kind: 'body', text: 'Presenter Name · Team', fontSize: 32, color: '#86868b', align: 'left', x: 180, w: 900, y: 900 }),
    ],
  },
  {
    id: 'banner',
    keywords: ['header', 'banner', 'blog', 'website', 'newsletter', 'cover', 'green'],
    name: 'Header banner',
    category: 'Banner',
    width: 1500,
    height: 500,
    background: { kind: 'pattern', pattern: 'dots', bg: '#0b3d2e', fg: '#1d6b52', size: 36 },
    build: (d) => [
      T(d, { kind: 'heading', text: 'Fresh ideas, every week', fontFamily: 'montserrat', fontSize: 86, color: '#ffffff', align: 'left', x: 110, w: 900, y: 150, lineHeight: 1.05 }),
      T(d, { kind: 'body', text: 'Design · Product · Writing', fontSize: 34, letterSpacing: 2, color: '#9fe3c6', align: 'left', x: 114, w: 800, y: 330 }),
      makeShape(d, 'ellipse', { x: 1120, y: 90, w: 300, h: 300, fill: '#34c759', name: 'Circle' }),
      makeIcon(d, 'sparkles', { x: 1195, y: 165, w: 150, h: 150, color: '#0b3d2e', weight: 1.8 }),
    ],
  },
  {
    id: 'product',
    keywords: ['product', 'launch', 'new', 'release', 'ecommerce', 'shop', 'announcement', 'photo'],
    name: 'Product launch',
    category: 'Promo',
    width: 1080,
    height: 1080,
    background: { kind: 'solid', color: '#e8eef7' },
    build: (d) => [
      makeShape(d, 'rect', { x: 140, y: 120, w: 800, h: 560, radius: 36, fill: '#ffffff', name: 'Image frame', shadow: { enabled: true, color: '#1d3557', blur: 50, x: 0, y: 24, opacity: 0.18 } }),
      makeIcon(d, 'camera', { x: 470, y: 330, w: 140, h: 140, color: '#a5b4c8', weight: 1.4, name: 'Placeholder icon' }),
      makeShape(d, 'rect', { x: 140, y: 740, w: 150, h: 56, radius: 28, fill: '#0a84ff', name: 'Badge' }),
      T(d, { kind: 'body', text: 'NEW', bold: true, fontSize: 28, letterSpacing: 4, color: '#ffffff', x: 140, w: 150, y: 752 }),
      T(d, { kind: 'heading', text: 'Meet the all-new Model One', fontSize: 64, color: '#1d1d1f', align: 'left', x: 140, w: 800, y: 820, lineHeight: 1.1 }),
      T(d, { kind: 'body', text: 'Available now from $99', fontSize: 34, color: '#52617a', align: 'left', x: 140, w: 800, y: 980 }),
    ],
  },
  {
    id: 'hiring',
    keywords: ['hiring', 'job', 'jobs', 'career', 'recruiting', 'vacancy', 'team', 'work', 'yellow'],
    name: 'We’re hiring',
    category: 'Announcement',
    width: 1080,
    height: 1350,
    background: { kind: 'solid', color: '#ffd60a' },
    build: (d) => [
      T(d, { kind: 'heading', text: 'WE’RE\nHIRING', fontFamily: 'bebas', fontSize: 330, lineHeight: 0.86, color: '#1d1d1f', align: 'left', x: 80, w: 920, y: 120 }),
      makeLine(d, false, { x: 86, y: 700, w: 908, h: 24, color: '#1d1d1f', strokeWidth: 6 }),
      T(d, { kind: 'subheading', text: 'Senior Designer', fontSize: 64, color: '#1d1d1f', align: 'left', x: 86, w: 900, y: 760 }),
      T(d, { kind: 'body', text: 'Remote · Full time\nApply at yoursite.com/jobs', fontSize: 40, lineHeight: 1.45, color: '#3a3a3c', align: 'left', x: 86, w: 900, y: 860 }),
      makeIcon(d, 'rocket', { x: 820, y: 1090, w: 180, h: 180, color: '#1d1d1f', weight: 1.6 }),
    ],
  },
  {
    id: 'quote-dark',
    keywords: ['quote', 'dark', 'bold', 'motivation', 'inspiration', 'saying'],
    name: 'Bold quote',
    category: 'Quote',
    width: 1080,
    height: 1350,
    background: { kind: 'solid', color: '#0f0f12' },
    build: (d) => [
      T(d, { kind: 'body', text: '“', fontFamily: 'playfair', fontSize: 260, color: '#ffd60a', align: 'left', x: 90, w: 300, y: 120, lineHeight: 1 }),
      T(d, { kind: 'heading', text: 'The best way to predict the future is to create it.', fontFamily: 'montserrat', fontSize: 84, color: '#ffffff', align: 'left', x: 96, w: 880, y: 420, lineHeight: 1.12 }),
      makeShape(d, 'rect', { x: 100, y: 1010, w: 90, h: 8, radius: 4, fill: '#ffd60a', name: 'Accent' }),
      T(d, { kind: 'body', text: 'Peter Drucker', fontSize: 38, bold: true, color: '#c7c7cc', align: 'left', x: 100, w: 700, y: 1050 }),
    ],
  },
  {
    id: 'menu',
    keywords: ['menu', 'cafe', 'coffee', 'restaurant', 'food', 'drinks', 'price', 'list', 'breakfast', 'print'],
    name: 'Café menu',
    category: 'Menu',
    width: 1275,
    height: 1650,
    background: { kind: 'solid', color: '#f6efe4' },
    build: (d) => {
      const items: [string, string, string][] = [
        ['Espresso', 'Rich, short and bold', '$3'],
        ['Flat white', 'Velvety milk, double shot', '$4.5'],
        ['Cold brew', 'Steeped for 18 hours', '$5'],
        ['Matcha latte', 'Ceremonial grade, oat milk', '$5.5'],
        ['Almond croissant', 'Baked fresh every morning', '$4'],
        ['Avocado toast', 'Sourdough, chili, lemon', '$9'],
      ];
      const out = [
        T(d, { kind: 'heading', text: 'Morning Menu', fontFamily: 'playfair', fontSize: 110, color: '#3b2a1a', x: 100, w: 1075, y: 140 }),
        makeLine(d, false, { x: 487, y: 330, w: 300, h: 24, color: '#a0754a', strokeWidth: 3 }),
      ];
      items.forEach(([name, desc, price], i) => {
        const y = 450 + i * 170;
        out.push(
          T(d, { kind: 'subheading', text: name, fontFamily: 'playfair', fontSize: 52, bold: true, color: '#3b2a1a', align: 'left', x: 140, w: 800, y }),
          T(d, { kind: 'body', text: desc, fontFamily: 'lora', italic: true, fontSize: 32, color: '#7a5c3e', align: 'left', x: 140, w: 800, y: y + 70 }),
          T(d, { kind: 'subheading', text: price, fontFamily: 'playfair', fontSize: 52, bold: true, color: '#a0754a', align: 'right', x: 900, w: 235, y }),
        );
      });
      return out;
    },
  },
  {
    id: 'invitation',
    keywords: ['birthday', 'invitation', 'party', 'celebration', 'invite', 'rsvp', 'pink'],
    name: 'Birthday invitation',
    category: 'Invitation',
    width: 1080,
    height: 1350,
    background: { kind: 'gradient', from: '#ffe5ec', to: '#ffc2d1', angle: 170 },
    build: (d) => [
      makeIcon(d, 'party-popper', { x: 470, y: 150, w: 140, h: 140, color: '#c9184a', weight: 1.6 }),
      T(d, { kind: 'body', text: 'YOU’RE INVITED TO', fontSize: 36, bold: true, letterSpacing: 8, color: '#c9184a', x: 140, w: 800, y: 360 }),
      T(d, { kind: 'heading', text: 'Mia’s 30th', fontFamily: 'pacifico', bold: false, fontSize: 150, color: '#590d22', x: 60, w: 960, y: 430 }),
      T(d, { kind: 'subheading', text: 'Saturday, August 9 · 7 PM', fontSize: 50, color: '#590d22', x: 100, w: 880, y: 720 }),
      T(d, { kind: 'body', text: 'The Rooftop, 12 Harbor Street\nRSVP to mia@example.com', fontSize: 38, lineHeight: 1.5, color: '#800f2f', x: 140, w: 800, y: 820 }),
      makeShape(d, 'heart', { x: 505, y: 1080, w: 70, h: 64, fill: '#ff4d6d', name: 'Heart' }),
    ],
  },
  {
    id: 'certificate',
    keywords: ['certificate', 'award', 'achievement', 'diploma', 'recognition', 'print', 'gold'],
    name: 'Certificate',
    category: 'Certificate',
    width: 1650,
    height: 1275,
    background: { kind: 'solid', color: '#fffdf7' },
    build: (d) => [
      makeShape(d, 'rect', { x: 50, y: 50, w: 1550, h: 1175, radius: 0, fill: null, stroke: '#b08d57', strokeWidth: 10, name: 'Border' }),
      makeShape(d, 'rect', { x: 80, y: 80, w: 1490, h: 1115, radius: 0, fill: null, stroke: '#b08d57', strokeWidth: 2, name: 'Inner border' }),
      T(d, { kind: 'body', text: 'CERTIFICATE OF ACHIEVEMENT', fontSize: 44, bold: true, letterSpacing: 10, color: '#7a5c2e', x: 200, w: 1250, y: 220 }),
      T(d, { kind: 'body', text: 'This certificate is proudly presented to', fontFamily: 'lora', italic: true, fontSize: 40, color: '#5c5c5c', x: 200, w: 1250, y: 380 }),
      T(d, { kind: 'heading', text: 'Alex Morgan', fontFamily: 'playfair', bold: false, italic: true, fontSize: 140, color: '#1d1d1f', x: 150, w: 1350, y: 460 }),
      makeLine(d, false, { x: 425, y: 660, w: 800, h: 24, color: '#b08d57', strokeWidth: 3 }),
      T(d, { kind: 'body', text: 'for outstanding work and dedication throughout 2026', fontFamily: 'lora', fontSize: 38, color: '#5c5c5c', x: 250, w: 1150, y: 720 }),
      makeLine(d, false, { x: 250, y: 990, w: 400, h: 24, color: '#1d1d1f', strokeWidth: 2 }),
      T(d, { kind: 'body', text: 'Director', fontSize: 30, color: '#5c5c5c', x: 250, w: 400, y: 1030 }),
      makeLine(d, false, { x: 1000, y: 990, w: 400, h: 24, color: '#1d1d1f', strokeWidth: 2 }),
      T(d, { kind: 'body', text: 'Date', fontSize: 30, color: '#5c5c5c', x: 1000, w: 400, y: 1030 }),
      makeShape(d, 'star', { x: 760, y: 900, w: 130, h: 130, fill: '#d4af37', name: 'Seal' }),
    ],
  },
  {
    id: 'linkedin',
    keywords: ['linkedin', 'banner', 'profile', 'header', 'personal', 'brand', 'career', 'professional'],
    name: 'LinkedIn banner',
    category: 'Banner',
    width: 1584,
    height: 396,
    background: { kind: 'gradient', from: '#0a2540', to: '#1e5aa8', angle: 100 },
    build: (d) => [
      T(d, { kind: 'heading', text: 'Product designer · Writer', fontFamily: 'montserrat', fontSize: 60, color: '#ffffff', align: 'right', x: 600, w: 900, y: 120 }),
      T(d, { kind: 'body', text: 'Helping teams build simple, useful software', fontSize: 30, color: '#b8d4f5', align: 'right', x: 600, w: 900, y: 210 }),
      makeShape(d, 'ellipse', { x: 1180, y: -200, w: 600, h: 600, fill: '#ffffff12', name: 'Circle' }),
    ],
  },
  {
    id: 'podcast',
    keywords: ['podcast', 'cover', 'art', 'episode', 'show', 'audio', 'spotify', 'apple', 'music'],
    name: 'Podcast cover',
    category: 'Podcast',
    width: 1500,
    height: 1500,
    background: { kind: 'solid', color: '#1b1b3a' },
    build: (d) => [
      makeShape(d, 'ellipse', { x: 950, y: -150, w: 700, h: 700, fill: '#ff6b6b', name: 'Circle' }),
      { ...makeFrame(d, 'ellipse'), x: 160, y: 300, w: 620, h: 620, name: 'Host photo' },
      makeIcon(d, 'mic', { x: 860, y: 520, w: 160, h: 160, color: '#ffd166', weight: 1.8 }),
      T(d, { kind: 'heading', text: 'THE\nCREATIVE\nHOUR', fontFamily: 'bebas', fontSize: 180, lineHeight: 0.9, color: '#ffffff', align: 'left', x: 160, w: 1200, y: 960 }),
      T(d, { kind: 'body', text: 'Weekly conversations with makers', fontSize: 40, color: '#c9c9f0', align: 'left', x: 860, w: 560, y: 720 }),
    ],
  },
];

export const TEMPLATES: Template[] = [...BASE_TEMPLATES, ...MORE_TEMPLATES];
