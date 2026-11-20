import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { store } from './store/store';
import * as actions from './store/actions';
import * as history from './store/history';
import { exportDocument } from './engine/export';
import { getImage } from './engine/images';
import { goEditor, isPdf, openFilesIn } from './app/route';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Debug handle for development and automated testing.
if (import.meta.env.DEV) {
  (window as unknown as { cleanshot: unknown }).cleanshot = { store, actions, history, exportDocument, getImage };
}

// Offline support: cache the app shell and every chunk as it loads (production only).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Some hosts (sandboxed previews) don't allow service workers; the app works without one.
    });
  });
}

// Installed app: files opened from the OS ("Open with Studiolo") arrive through the Launch Queue API.
interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}
const launchQueue = (window as unknown as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }).launchQueue;
launchQueue?.setConsumer(async (params) => {
  if (!params.files.length) return;
  const files = await Promise.all(params.files.map((h) => h.getFile()));
  const pdfs = files.filter(isPdf);
  if (pdfs.length) return openFilesIn({ section: 'pdf', tool: pdfs.length > 1 ? 'pdf-merge' : 'pdf-organize' }, pdfs);
  const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (images.length > 1) return openFilesIn({ section: 'tools', tool: 'compressor' }, images);
  if (images[0]) {
    goEditor();
    void actions.openImageBlob(images[0], images[0].name);
  }
});
