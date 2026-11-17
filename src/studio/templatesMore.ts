import { makeFrame, makeIcon, makeLine, makeShape, makeText } from './factory';
import type { StudioElement } from './types';
import type { Template } from './templates';

/**
 * Additional starter templates. Same rules as templates.ts: coordinates are in
 * the template's own pixel size, text boxes get explicit widths, and photo
 * spots are empty frames (drop an image on them).
 */

const T = makeText;
type D = { width: number; height: number };

/** An empty photo frame at an exact box. */
const frame = (d: D, mask: 'rect' | 'ellipse', box: { x: number; y: number; w: number; h: number; radius?: number; name?: string; rotation?: number }): StudioElement => ({
  ...makeFrame(d, mask),
  ...box,
  radius: box.radius ?? 0,
  name: box.name ?? 'Photo',
  rotation: box.rotation ?? 0,
});

export const MORE_TEMPLATES: Template[] = [
  {
    id: 'tips-list',
    name: 'Tips list',
    category: 'Social',
    keywords: ['tips', 'list', 'listicle', 'how to', 'advice', 'steps', 'carousel', 'wellness', 'self care', 'sleep', 'numbered', 'educational'],
    width: 1080,
    height: 1350,
    background: { kind: 'solid', color: '#f4f1ea' },
    build: (d) => {
      const items = ['Keep the same bedtime every night', 'Dim the lights an hour before bed', 'Skip caffeine after 2 PM', 'Keep your room cool and dark', 'Leave your phone in another room'];
      const out: StudioElement[] = [
        T(d, { kind: 'body', text: 'SELF-CARE', bold: true, fontSize: 30, letterSpacing: 8, color: '#7c6f5b', align: 'left', x: 92, w: 600, y: 110 }),
        T(d, { kind: 'heading', text: '5 tips for\nbetter sleep', fontFamily: 'montserrat', fontSize: 96, lineHeight: 1.05, color: '#1f2a24', align: 'left', x: 88, w: 900, y: 160 }),
      ];
      items.forEach((text, i) => {
        const y = 470 + i * 150;
        out.push(
          makeShape(d, 'ellipse', { x: 90, y, w: 84, h: 84, fill: '#2f5d50', name: `Number ${i + 1}` }),
          T(d, { kind: 'body', text: String(i + 1), bold: true, fontSize: 40, color: '#ffffff', x: 90, w: 84, y: y + 17 }),
          T(d, { kind: 'body', text, fontSize: 42, color: '#1f2a24', align: 'left', x: 210, w: 790, y: y + 15 }),
        );
      });
      out.push(T(d, { kind: 'body', text: '@yourhandle', fontSize: 30, color: '#7c6f5b', align: 'left', x: 92, w: 600, y: 1240 }));
      return out;
    },
  },
  {
    id: 'testimonial',
    name: 'Customer review',
    category: 'Social',
    keywords: ['testimonial', 'review', 'customer', 'feedback', 'rating', 'stars', 'quote', 'social proof', 'client', 'dark'],
    width: 1080,
    height: 1080,
    background: { kind: 'solid', color: '#0f172a' },
    build: (d) => [
      ...[0, 1, 2, 3, 4].map((i) => makeIcon(d, 'star', { x: 348 + i * 80, y: 170, w: 64, h: 64, color: '#fbbf24', filled: true, weight: 1.5, name: `Star ${i + 1}` })),
      T(d, { kind: 'heading', text: '“The easiest tool we’ve ever used. Our whole team was up and running in minutes.”', fontFamily: 'montserrat', bold: false, fontSize: 58, lineHeight: 1.28, color: '#ffffff', x: 110, w: 860, y: 310 }),
      frame(d, 'ellipse', { x: 470, y: 690, w: 140, h: 140, name: 'Customer photo' }),
      T(d, { kind: 'body', text: 'Jordan Lee', bold: true, fontSize: 40, color: '#ffffff', x: 240, w: 600, y: 860 }),
      T(d, { kind: 'body', text: 'Head of Marketing, Northwind', fontSize: 30, color: '#94a3b8', x: 240, w: 600, y: 916 }),
    ],
  },
  {
    id: 'giveaway',
    name: 'Giveaway',
    category: 'Promo',
    keywords: ['giveaway', 'contest', 'win', 'prize', 'free', 'competition', 'follow', 'like', 'tag', 'instagram', 'purple', 'pink'],
    width: 1080,
    height: 1080,
    background: { kind: 'gradient', from: '#7c3aed', to: '#db2777', angle: 135 },
    build: (d) => [
      makeIcon(d, 'gift', { x: 450, y: 100, w: 180, h: 180, color: '#ffffff', weight: 1.6 }),
      T(d, { kind: 'heading', text: 'GIVEAWAY', fontFamily: 'bebas', fontSize: 230, color: '#ffffff', x: 40, w: 1000, y: 300 }),
      T(d, { kind: 'subheading', text: 'Win a year of free coffee', bold: true, fontSize: 54, color: '#ffffff', x: 90, w: 900, y: 560 }),
      ...(['Follow us', 'Like this post', 'Tag a friend'] as const).flatMap((step, i) => [
        makeShape(d, 'rect', { x: 90 + i * 310, y: 680, w: 280, h: 200, radius: 24, fill: '#ffffff26', name: `Step ${i + 1}` }),
        T(d, { kind: 'body', text: `${i + 1}\n${step}`, bold: true, fontSize: 38, lineHeight: 1.35, color: '#ffffff', x: 90 + i * 310, w: 280, y: 722 }),
      ]),
      T(d, { kind: 'body', text: 'Ends Sunday · Winner announced Monday', fontSize: 30, color: '#fce7f3', x: 90, w: 900, y: 950 }),
    ],
  },
  {
    id: 'webinar',
    name: 'Webinar invite',
    category: 'Announcement',
    keywords: ['webinar', 'online', 'event', 'talk', 'workshop', 'live', 'speaker', 'register', 'link post', 'linkedin', 'facebook', 'dark'],
    width: 1200,
    height: 628,
    background: { kind: 'solid', color: '#0b1220' },
    build: (d) => [
      makeShape(d, 'ellipse', { x: 760, y: 70, w: 420, h: 420, fill: '#38bdf81f', name: 'Glow' }),
      T(d, { kind: 'body', text: 'FREE WEBINAR', bold: true, fontSize: 26, letterSpacing: 6, color: '#38bdf8', align: 'left', x: 72, w: 600, y: 92 }),
      T(d, { kind: 'heading', text: 'Design systems that scale', fontFamily: 'montserrat', fontSize: 66, lineHeight: 1.08, color: '#ffffff', align: 'left', x: 68, w: 640, y: 140 }),
      T(d, { kind: 'body', text: 'Thursday, May 22 · 11 AM PT', fontSize: 30, color: '#cbd5e1', align: 'left', x: 72, w: 600, y: 392 }),
      makeShape(d, 'rect', { x: 72, y: 466, w: 280, h: 76, radius: 38, fill: '#38bdf8', name: 'Button' }),
      T(d, { kind: 'body', text: 'Save your seat', bold: true, fontSize: 28, color: '#0b1220', x: 72, w: 280, y: 487 }),
      frame(d, 'ellipse', { x: 820, y: 120, w: 300, h: 300, name: 'Speaker photo' }),
      T(d, { kind: 'body', text: 'with Sam Rivera\nDesign lead, Acme', fontSize: 26, lineHeight: 1.45, color: '#cbd5e1', x: 770, w: 400, y: 448 }),
    ],
  },
  {
    id: 'this-or-that',
    name: 'This or that',
    category: 'Social',
    keywords: ['this or that', 'poll', 'vote', 'versus', 'vs', 'compare', 'choice', 'story', 'engagement', 'instagram', 'tiktok', 'question'],
    width: 1080,
    height: 1920,
    background: { kind: 'solid', color: '#fff7ed' },
    build: (d) => [
      T(d, { kind: 'heading', text: 'THIS OR THAT?', fontFamily: 'bebas', fontSize: 170, color: '#1c1917', x: 40, w: 1000, y: 200 }),
      frame(d, 'rect', { x: 80, y: 480, w: 430, h: 580, radius: 32, name: 'Option A photo' }),
      frame(d, 'rect', { x: 570, y: 480, w: 430, h: 580, radius: 32, name: 'Option B photo' }),
      makeShape(d, 'ellipse', { x: 470, y: 700, w: 140, h: 140, fill: '#f97316', name: 'VS badge' }),
      T(d, { kind: 'body', text: 'VS', fontFamily: 'bebas', fontSize: 72, color: '#ffffff', x: 470, w: 140, y: 732 }),
      T(d, { kind: 'subheading', text: 'Coffee', bold: true, fontSize: 60, color: '#1c1917', x: 80, w: 430, y: 1100 }),
      T(d, { kind: 'subheading', text: 'Tea', bold: true, fontSize: 60, color: '#1c1917', x: 570, w: 430, y: 1100 }),
      T(d, { kind: 'body', text: 'Vote in the poll below', fontSize: 44, color: '#57534e', x: 140, w: 800, y: 1380 }),
      makeIcon(d, 'arrow-down', { x: 500, y: 1470, w: 80, h: 80, color: '#f97316', weight: 2.2 }),
    ],
  },
  {
    id: 'recipe',
    name: 'Recipe card',
    category: 'Food',
    keywords: ['recipe', 'cooking', 'food', 'kitchen', 'ingredients', 'method', 'dinner', 'pasta', 'meal', 'blog', 'print'],
    width: 1275,
    height: 1650,
    background: { kind: 'solid', color: '#fffaf3' },
    build: (d) => [
      frame(d, 'rect', { x: 0, y: 0, w: 1275, h: 600, name: 'Dish photo' }),
      T(d, { kind: 'body', text: 'DINNER IN 30 MINUTES', bold: true, fontSize: 28, letterSpacing: 6, color: '#c2410c', align: 'left', x: 100, w: 1000, y: 670 }),
      T(d, { kind: 'heading', text: 'Lemon garlic pasta', fontFamily: 'playfair', bold: true, fontSize: 96, color: '#292524', align: 'left', x: 96, w: 1100, y: 720 }),
      T(d, { kind: 'body', text: 'Serves 4 · 10 min prep · 20 min cook', fontSize: 32, color: '#78716c', align: 'left', x: 100, w: 1000, y: 860 }),
      makeLine(d, false, { x: 100, y: 920, w: 1075, h: 24, color: '#e7e5e4', strokeWidth: 3 }),
      T(d, { kind: 'subheading', text: 'Ingredients', bold: true, fontSize: 44, color: '#292524', align: 'left', x: 100, w: 450, y: 980 }),
      T(d, { kind: 'body', text: '400 g spaghetti\n3 cloves garlic\n1 lemon, zest and juice\n4 tbsp olive oil\nParmesan, to serve\nSalt and pepper', fontSize: 31, lineHeight: 1.75, color: '#44403c', align: 'left', x: 100, w: 470, y: 1050 }),
      T(d, { kind: 'subheading', text: 'Method', bold: true, fontSize: 44, color: '#292524', align: 'left', x: 640, w: 535, y: 980 }),
      T(d, { kind: 'body', text: '1. Cook the pasta in well-salted water.\n2. Warm the oil and garlic gently.\n3. Add the zest, juice and a splash of pasta water.\n4. Toss with the pasta and top with Parmesan.', fontSize: 31, lineHeight: 1.55, color: '#44403c', align: 'left', x: 640, w: 535, y: 1050 }),
    ],
  },
  {
    id: 'pizza-special',
    name: 'Restaurant special',
    category: 'Food',
    keywords: ['restaurant', 'pizza', 'special', 'deal', 'offer', 'food', 'takeaway', 'delivery', 'menu', 'promo', 'red'],
    width: 1080,
    height: 1350,
    background: { kind: 'solid', color: '#b91c1c' },
    build: (d) => [
      makeIcon(d, 'pizza', { x: 700, y: 90, w: 300, h: 300, color: '#fde68a', weight: 1.3 }),
      T(d, { kind: 'body', text: 'TUESDAYS ONLY', bold: true, fontSize: 34, letterSpacing: 8, color: '#fde68a', align: 'left', x: 90, w: 600, y: 160 }),
      T(d, { kind: 'heading', text: '2 FOR 1\nPIZZA', fontFamily: 'bebas', fontSize: 260, lineHeight: 0.88, color: '#ffffff', align: 'left', x: 84, w: 920, y: 400 }),
      T(d, { kind: 'body', text: 'Any large pizza, dine in or takeaway', fontSize: 40, color: '#fecaca', align: 'left', x: 90, w: 900, y: 900 }),
      makeShape(d, 'rect', { x: 90, y: 990, w: 380, h: 104, radius: 52, fill: '#fde68a', name: 'Button' }),
      T(d, { kind: 'body', text: 'Order now', bold: true, fontSize: 40, color: '#7f1d1d', x: 90, w: 380, y: 1017 }),
      T(d, { kind: 'body', text: 'Luigi’s Kitchen · 14 Market Street', fontSize: 32, color: '#fecaca', align: 'left', x: 90, w: 900, y: 1210 }),
    ],
  },
  {
    id: 'open-house',
    name: 'Open house',
    category: 'Real estate',
    keywords: ['real estate', 'open house', 'property', 'home', 'house', 'listing', 'for sale', 'realtor', 'apartment', 'agent'],
    width: 1080,
    height: 1350,
    background: { kind: 'solid', color: '#ffffff' },
    build: (d) => [
      frame(d, 'rect', { x: 0, y: 0, w: 1080, h: 740, name: 'House photo' }),
      makeShape(d, 'rect', { x: 60, y: 690, w: 330, h: 90, radius: 12, fill: '#0f766e', name: 'Tag' }),
      T(d, { kind: 'body', text: 'OPEN HOUSE', bold: true, fontSize: 36, letterSpacing: 4, color: '#ffffff', x: 60, w: 330, y: 713 }),
      T(d, { kind: 'heading', text: '24 Willow Lane', fontFamily: 'montserrat', fontSize: 76, color: '#0f172a', align: 'left', x: 58, w: 960, y: 830 }),
      T(d, { kind: 'body', text: '3 bed · 2 bath · 1,850 sq ft', fontSize: 38, color: '#475569', align: 'left', x: 60, w: 960, y: 940 }),
      makeLine(d, false, { x: 60, y: 1010, w: 960, h: 24, color: '#e2e8f0', strokeWidth: 3 }),
      T(d, { kind: 'subheading', text: 'Sunday, 1–4 PM', bold: true, fontSize: 44, color: '#0f172a', align: 'left', x: 60, w: 520, y: 1070 }),
      T(d, { kind: 'subheading', text: '$649,000', bold: true, fontSize: 56, color: '#0f766e', align: 'right', x: 560, w: 460, y: 1062 }),
      T(d, { kind: 'body', text: 'Jamie Park · Coastline Realty · (555) 012-3456', fontSize: 30, color: '#64748b', align: 'left', x: 60, w: 960, y: 1210 }),
    ],
  },
  {
    id: 'fitness-class',
    name: 'Fitness class',
    category: 'Fitness',
    keywords: ['fitness', 'gym', 'workout', 'class', 'hiit', 'training', 'exercise', 'sport', 'schedule', 'story', 'green'],
    width: 1080,
    height: 1920,
    background: { kind: 'gradient', from: '#111827', to: '#065f46', angle: 170 },
    build: (d) => [
      makeIcon(d, 'dumbbell', { x: 440, y: 260, w: 200, h: 200, color: '#34d399', weight: 1.6 }),
      T(d, { kind: 'body', text: 'NEW CLASS', bold: true, fontSize: 40, letterSpacing: 10, color: '#34d399', x: 140, w: 800, y: 540 }),
      T(d, { kind: 'heading', text: 'HIIT\nBURN', fontFamily: 'bebas', fontSize: 340, lineHeight: 0.85, color: '#ffffff', x: 40, w: 1000, y: 620 }),
      T(d, { kind: 'subheading', text: 'Mon · Wed · Fri\n6:30 AM and 6:00 PM', bold: true, fontSize: 56, lineHeight: 1.4, color: '#ffffff', x: 90, w: 900, y: 1280 }),
      makeShape(d, 'rect', { x: 290, y: 1520, w: 500, h: 120, radius: 60, fill: '#34d399', name: 'Button' }),
      T(d, { kind: 'body', text: 'Book your spot', bold: true, fontSize: 46, color: '#064e3b', x: 290, w: 500, y: 1552 }),
      T(d, { kind: 'body', text: 'Studio 9 Fitness', fontSize: 36, color: '#a7f3d0', x: 140, w: 800, y: 1760 }),
    ],
  },
  {
    id: 'save-the-date',
    name: 'Save the date',
    category: 'Wedding',
    keywords: ['wedding', 'save the date', 'engagement', 'marriage', 'invitation', 'couple', 'elegant', 'ceremony', 'love'],
    width: 1080,
    height: 1350,
    background: { kind: 'solid', color: '#f8f5f0' },
    build: (d) => [
      makeShape(d, 'rect', { x: 60, y: 60, w: 960, h: 1230, radius: 0, fill: null, stroke: '#c8b28a', strokeWidth: 3, name: 'Border' }),
      T(d, { kind: 'body', text: 'SAVE THE DATE', bold: true, fontSize: 40, letterSpacing: 12, color: '#8a7350', x: 140, w: 800, y: 220 }),
      T(d, { kind: 'heading', text: 'Emma & Noah', fontFamily: 'playfair', bold: false, italic: true, fontSize: 130, color: '#3f3a33', x: 60, w: 960, y: 330 }),
      makeLine(d, false, { x: 440, y: 560, w: 200, h: 24, color: '#c8b28a', strokeWidth: 3 }),
      T(d, { kind: 'subheading', text: '06 · 20 · 2027', fontFamily: 'playfair', bold: false, fontSize: 80, color: '#3f3a33', x: 140, w: 800, y: 640 }),
      T(d, { kind: 'body', text: 'Lake Como, Italy\nInvitation to follow', fontFamily: 'lora', italic: true, fontSize: 40, lineHeight: 1.5, color: '#6b5e4b', x: 140, w: 800, y: 820 }),
      makeShape(d, 'heart', { x: 505, y: 1080, w: 70, h: 64, fill: '#c8b28a', name: 'Heart' }),
    ],
  },
  {
    id: 'thank-you',
    name: 'Thank you post',
    category: 'Social',
    keywords: ['thank you', 'thanks', 'gratitude', 'milestone', 'followers', 'celebration', 'appreciation', 'customers', 'green'],
    width: 1080,
    height: 1080,
    background: { kind: 'solid', color: '#ecfdf5' },
    build: (d) => [
      makeIcon(d, 'heart-handshake', { x: 450, y: 160, w: 180, h: 180, color: '#047857', weight: 1.6 }),
      T(d, { kind: 'heading', text: 'Thank you!', fontFamily: 'pacifico', bold: false, fontSize: 150, color: '#064e3b', x: 40, w: 1000, y: 400 }),
      T(d, { kind: 'body', text: 'We just reached 10,000 followers.\nWe couldn’t have done it without you.', fontSize: 40, lineHeight: 1.5, color: '#065f46', x: 110, w: 860, y: 650 }),
      T(d, { kind: 'body', text: '@yourbrand', bold: true, fontSize: 36, color: '#047857', x: 240, w: 600, y: 880 }),
    ],
  },
  {
    id: 'holiday',
    name: 'Holiday greeting',
    category: 'Holiday',
    keywords: ['holiday', 'christmas', 'season', 'greetings', 'winter', 'new year', 'card', 'festive', 'snow', 'xmas', 'green'],
    width: 1080,
    height: 1350,
    background: { kind: 'gradient', from: '#14532d', to: '#052e16', angle: 180 },
    build: (d) => [
      ...(
        [
          [120, 140, 90],
          [860, 200, 70],
          [520, 80, 50],
          [180, 1100, 70],
          [880, 1040, 110],
        ] as const
      ).map(([x, y, s], i) => makeIcon(d, 'snowflake', { x, y, w: s, h: s, color: '#ffffff66', weight: 1.4, name: `Snowflake ${i + 1}` })),
      T(d, { kind: 'body', text: 'SEASON’S', bold: true, fontSize: 46, letterSpacing: 14, color: '#fde68a', x: 140, w: 800, y: 430 }),
      T(d, { kind: 'heading', text: 'Greetings', fontFamily: 'pacifico', bold: false, fontSize: 170, color: '#ffffff', x: 40, w: 1000, y: 490 }),
      T(d, { kind: 'body', text: 'Wishing you a warm and joyful holiday season', fontFamily: 'lora', italic: true, fontSize: 44, lineHeight: 1.4, color: '#dcfce7', x: 160, w: 760, y: 780 }),
      T(d, { kind: 'body', text: 'from all of us at Studio North', fontSize: 34, color: '#fde68a', x: 140, w: 800, y: 960 }),
    ],
  },
  {
    id: 'travel-thumbnail',
    name: 'Travel thumbnail',
    category: 'Thumbnail',
    keywords: ['travel', 'trip', 'vlog', 'guide', 'city', 'vacation', 'destination', 'youtube', 'thumbnail', 'video', 'blue'],
    width: 1280,
    height: 720,
    background: { kind: 'solid', color: '#0c4a6e' },
    build: (d) => [
      frame(d, 'rect', { x: 0, y: 0, w: 1280, h: 720, name: 'Background photo' }),
      makeShape(d, 'rect', { x: 0, y: 0, w: 780, h: 720, radius: 0, fill: '#0c4a6ee6', name: 'Overlay' }),
      T(d, { kind: 'body', text: 'TRAVEL GUIDE', bold: true, fontSize: 34, letterSpacing: 8, color: '#fde047', align: 'left', x: 72, w: 600, y: 140 }),
      T(d, { kind: 'heading', text: '48 HOURS\nIN LISBON', fontFamily: 'bebas', fontSize: 175, lineHeight: 0.9, color: '#ffffff', align: 'left', x: 66, w: 700, y: 190 }),
      makeIcon(d, 'plane', { x: 72, y: 560, w: 76, h: 76, color: '#fde047', weight: 1.8 }),
      T(d, { kind: 'body', text: 'Where to eat, stay and explore', fontSize: 34, color: '#ffffff', align: 'left', x: 170, w: 580, y: 577 }),
    ],
  },
  {
    id: 'how-to-thumbnail',
    name: 'How-to thumbnail',
    category: 'Thumbnail',
    keywords: ['tutorial', 'how to', 'guide', 'tips', 'course', 'lesson', 'youtube', 'thumbnail', 'video', 'screenshot', 'steps'],
    width: 1280,
    height: 720,
    background: { kind: 'solid', color: '#f8fafc' },
    build: (d) => [
      T(d, { kind: 'heading', text: 'EDIT LIKE\nA PRO', fontFamily: 'bebas', fontSize: 190, lineHeight: 0.88, color: '#0f172a', align: 'left', x: 72, w: 640, y: 120 }),
      makeShape(d, 'rect', { x: 78, y: 520, w: 400, h: 82, radius: 16, fill: '#2563eb', name: 'Tag' }),
      T(d, { kind: 'body', text: 'IN 3 EASY STEPS', bold: true, fontSize: 34, letterSpacing: 2, color: '#ffffff', x: 78, w: 400, y: 541 }),
      frame(d, 'rect', { x: 740, y: 100, w: 460, h: 520, radius: 28, rotation: 4, name: 'Screenshot' }),
      makeLine(d, true, { x: 560, y: 320, w: 170, h: 60, color: '#2563eb', strokeWidth: 14, name: 'Arrow' }),
    ],
  },
  {
    id: 'agenda-slide',
    name: 'Agenda slide',
    category: 'Presentation',
    keywords: ['agenda', 'slide', 'presentation', 'meeting', 'outline', 'overview', 'deck', 'business', 'plan', 'list'],
    width: 1920,
    height: 1080,
    background: { kind: 'solid', color: '#ffffff' },
    build: (d) => {
      const items: [string, string][] = [
        ['Where we are', 'Highlights from the last quarter'],
        ['What we learned', 'Wins, misses and surprises'],
        ['What’s next', 'Priorities for the coming months'],
        ['Q&A', 'Your questions'],
      ];
      const out: StudioElement[] = [
        T(d, { kind: 'heading', text: 'Agenda', fontFamily: 'montserrat', fontSize: 110, color: '#111827', align: 'left', x: 156, w: 1000, y: 130 }),
        makeLine(d, false, { x: 160, y: 290, w: 120, h: 24, color: '#6366f1', strokeWidth: 8 }),
      ];
      items.forEach(([title, desc], i) => {
        const y = 380 + i * 160;
        out.push(
          T(d, { kind: 'heading', text: String(i + 1).padStart(2, '0'), fontFamily: 'montserrat', fontSize: 72, color: '#6366f1', align: 'left', x: 160, w: 150, y }),
          T(d, { kind: 'subheading', text: title, bold: true, fontSize: 50, color: '#111827', align: 'left', x: 330, w: 1300, y: y + 2 }),
          T(d, { kind: 'body', text: desc, fontSize: 34, color: '#6b7280', align: 'left', x: 330, w: 1300, y: y + 70 }),
        );
      });
      return out;
    },
  },
  {
    id: 'stats-slide',
    name: 'Results slide',
    category: 'Presentation',
    keywords: ['stats', 'numbers', 'results', 'metrics', 'kpi', 'data', 'growth', 'report', 'slide', 'presentation', 'dark', 'annual'],
    width: 1920,
    height: 1080,
    background: { kind: 'solid', color: '#0f172a' },
    build: (d) => {
      const stats: [string, string][] = [
        ['2.4M', 'Visitors this year'],
        ['+38%', 'Growth in revenue'],
        ['96%', 'Customer satisfaction'],
      ];
      const out: StudioElement[] = [
        T(d, { kind: 'body', text: 'BY THE NUMBERS', bold: true, fontSize: 34, letterSpacing: 8, color: '#818cf8', align: 'left', x: 160, w: 1600, y: 150 }),
        T(d, { kind: 'heading', text: 'A record year', fontFamily: 'montserrat', fontSize: 96, color: '#ffffff', align: 'left', x: 156, w: 1600, y: 200 }),
      ];
      stats.forEach(([value, label], i) => {
        const x = 160 + i * 547;
        out.push(
          makeShape(d, 'rect', { x, y: 440, w: 507, h: 420, radius: 28, fill: '#1e293b', name: `Card ${i + 1}` }),
          T(d, { kind: 'heading', text: value, fontFamily: 'montserrat', fontSize: 130, color: '#818cf8', x, w: 507, y: 520 }),
          T(d, { kind: 'body', text: label, fontSize: 38, color: '#cbd5e1', x, w: 507, y: 730 }),
        );
      });
      return out;
    },
  },
  {
    id: 'x-header',
    name: 'Social header',
    category: 'Banner',
    keywords: ['twitter', 'x', 'header', 'banner', 'profile', 'cover', 'personal', 'creator', 'pastel', 'bluesky'],
    width: 1500,
    height: 500,
    background: { kind: 'gradient', from: '#fdf2f8', to: '#e0e7ff', angle: 90 },
    build: (d) => [
      makeShape(d, 'ellipse', { x: 1150, y: -120, w: 460, h: 460, fill: '#c7d2fe', name: 'Circle' }),
      makeShape(d, 'ellipse', { x: 1000, y: 290, w: 240, h: 240, fill: '#fbcfe8', name: 'Circle 2' }),
      T(d, { kind: 'heading', text: 'Writing about design,\ncode and coffee', fontFamily: 'montserrat', fontSize: 56, lineHeight: 1.15, color: '#1e1b4b', align: 'left', x: 440, w: 820, y: 150 }),
      T(d, { kind: 'body', text: 'New essay every Tuesday', fontSize: 32, color: '#4338ca', align: 'left', x: 472, w: 620, y: 320 }),
    ],
  },
  {
    id: 'newsletter-header',
    name: 'Newsletter header',
    category: 'Newsletter',
    keywords: ['newsletter', 'email', 'header', 'issue', 'blog', 'digest', 'weekly', 'substack', 'masthead', 'coffee'],
    width: 1200,
    height: 600,
    background: { kind: 'solid', color: '#fef3c7' },
    build: (d) => [
      T(d, { kind: 'body', text: 'ISSUE #42 · MAY 2027', bold: true, fontSize: 26, letterSpacing: 6, color: '#92400e', align: 'left', x: 80, w: 700, y: 140 }),
      T(d, { kind: 'heading', text: 'The Weekly Brew', fontFamily: 'playfair', bold: true, fontSize: 86, color: '#451a03', align: 'left', x: 76, w: 800, y: 190 }),
      T(d, { kind: 'body', text: 'Stories, tips and good reads from our team', fontFamily: 'lora', italic: true, fontSize: 34, color: '#78350f', align: 'left', x: 80, w: 760, y: 340 }),
      makeIcon(d, 'coffee', { x: 880, y: 130, w: 240, h: 240, color: '#92400e', weight: 1.4 }),
      makeLine(d, false, { x: 80, y: 460, w: 1040, h: 24, color: '#d97706', strokeWidth: 3 }),
    ],
  },
  {
    id: 'music-flyer',
    name: 'Concert flyer',
    category: 'Flyer',
    keywords: ['flyer', 'poster', 'concert', 'music', 'gig', 'party', 'club', 'dj', 'night', 'event', 'tickets', 'neon', 'print'],
    width: 1275,
    height: 1650,
    background: { kind: 'solid', color: '#09090b' },
    build: (d) => [
      makeShape(d, 'ellipse', { x: 300, y: 160, w: 900, h: 900, fill: '#a855f733', name: 'Glow' }),
      makeShape(d, 'ellipse', { x: -200, y: 900, w: 700, h: 700, fill: '#06b6d433', name: 'Glow 2' }),
      T(d, { kind: 'body', text: 'LIVE MUSIC', bold: true, fontSize: 44, letterSpacing: 16, color: '#22d3ee', x: 100, w: 1075, y: 220 }),
      T(d, { kind: 'heading', text: 'NEON\nNIGHTS', fontFamily: 'bebas', fontSize: 380, lineHeight: 0.85, color: '#ffffff', x: 60, w: 1155, y: 300 }),
      T(d, { kind: 'subheading', text: 'DJ AURORA · THE LOW TIDES · KAI', bold: true, fontSize: 46, letterSpacing: 3, color: '#e9d5ff', x: 100, w: 1075, y: 1040 }),
      T(d, { kind: 'body', text: 'Saturday, July 12 · Doors 9 PM\nThe Warehouse, 88 Dock Road', fontSize: 44, lineHeight: 1.5, color: '#d4d4d8', x: 100, w: 1075, y: 1170 }),
      makeShape(d, 'rect', { x: 387, y: 1400, w: 500, h: 110, radius: 55, fill: '#22d3ee', name: 'Button' }),
      T(d, { kind: 'body', text: 'Tickets $25', bold: true, fontSize: 46, color: '#09090b', x: 387, w: 500, y: 1427 }),
    ],
  },
  {
    id: 'business-card',
    name: 'Business card',
    category: 'Business',
    keywords: ['business card', 'card', 'contact', 'professional', 'name', 'logo', 'networking', 'print', 'dark', 'gold'],
    width: 1050,
    height: 600,
    background: { kind: 'solid', color: '#111827' },
    build: (d) => [
      makeShape(d, 'rect', { x: 0, y: 0, w: 18, h: 600, radius: 0, fill: '#f59e0b', name: 'Accent' }),
      T(d, { kind: 'heading', text: 'Riley Chen', fontFamily: 'montserrat', fontSize: 64, color: '#ffffff', align: 'left', x: 80, w: 600, y: 140 }),
      T(d, { kind: 'body', text: 'Brand Designer', bold: true, fontSize: 32, color: '#f59e0b', align: 'left', x: 82, w: 600, y: 230 }),
      T(d, { kind: 'body', text: 'riley@studio.com\n(555) 019-2847\nrileychen.design', fontSize: 28, lineHeight: 1.6, color: '#d1d5db', align: 'left', x: 82, w: 600, y: 330 }),
      makeShape(d, 'hexagon', { x: 760, y: 190, w: 200, h: 200, fill: '#f59e0b', name: 'Logo' }),
      T(d, { kind: 'body', text: 'RC', fontFamily: 'montserrat', bold: true, fontSize: 64, color: '#111827', x: 760, w: 200, y: 252 }),
    ],
  },
];
