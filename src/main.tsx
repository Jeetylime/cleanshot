import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { store } from './store/store';
import * as actions from './store/actions';
import * as history from './store/history';
import { exportDocument } from './engine/export';
import { getImage } from './engine/images';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Debug handle for development and automated testing.
if (import.meta.env.DEV) {
  (window as unknown as { cleanshot: unknown }).cleanshot = { store, actions, history, exportDocument, getImage };
}
