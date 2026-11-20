export interface SocialSize {
  id: string;
  platform: string;
  name: string;
  w: number;
  h: number;
}

/** Common recommended sizes (2026). Checked against each platform's help pages. */
export const SOCIAL_SIZES: SocialSize[] = [
  { id: 'ig-square', platform: 'Instagram', name: 'Square post', w: 1080, h: 1080 },
  { id: 'ig-portrait', platform: 'Instagram', name: 'Portrait post', w: 1080, h: 1350 },
  { id: 'ig-story', platform: 'Instagram', name: 'Story / Reel', w: 1080, h: 1920 },
  { id: 'fb-post', platform: 'Facebook', name: 'Shared image', w: 1200, h: 630 },
  { id: 'fb-cover', platform: 'Facebook', name: 'Page cover', w: 1640, h: 624 },
  { id: 'x-post', platform: 'X', name: 'Post image', w: 1600, h: 900 },
  { id: 'x-header', platform: 'X', name: 'Header', w: 1500, h: 500 },
  { id: 'li-post', platform: 'LinkedIn', name: 'Post image', w: 1200, h: 627 },
  { id: 'li-banner', platform: 'LinkedIn', name: 'Profile banner', w: 1584, h: 396 },
  { id: 'yt-thumb', platform: 'YouTube', name: 'Thumbnail', w: 1280, h: 720 },
  { id: 'yt-banner', platform: 'YouTube', name: 'Channel banner', w: 2560, h: 1440 },
  { id: 'pin', platform: 'Pinterest', name: 'Pin', w: 1000, h: 1500 },
  { id: 'tiktok', platform: 'TikTok', name: 'Video cover', w: 1080, h: 1920 },
  { id: 'og', platform: 'Web', name: 'Open Graph / link preview', w: 1200, h: 630 },
  { id: 'avatar', platform: 'Web', name: 'Profile picture', w: 800, h: 800 },
];
