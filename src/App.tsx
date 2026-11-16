import { Suspense, lazy, useEffect } from 'react';
import { store, useEditor } from './store/store';
import { refreshRecents, initAutosave } from './store/actions';
import { TopBar } from './components/TopBar';
import { ToolSidebar } from './components/ToolSidebar';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { EditorCanvas } from './components/EditorCanvas';
import { EmptyState } from './components/EmptyState';
import { StartScreen } from './components/StartScreen';
import { BusyIndicator, DropOverlay, ShortcutsDialog, Toasts } from './components/Overlays';
import { useKeyboardShortcuts, usePasteAndDrop, useThemeSync } from './hooks/useGlobalInput';
import { getRoute, goEditor, useRoute } from './app/route';

const ToolsApp = lazy(() => import('./tools/ToolsApp'));
const AboutPage = lazy(() => import('./tools/AboutPage'));
const PdfApp = lazy(() => import('./pdf/PdfApp'));
const LegalPage = lazy(() => import('./legal/LegalPage'));

let booted = false;

function Editor() {
  const hasDoc = useEditor((s) => !!s.doc);
  return (
    <>
      <TopBar />
      {hasDoc ? (
        <div className="relative flex min-h-0 flex-1 animate-fade-in">
          <ToolSidebar />
          <main className="relative min-w-0 flex-1" aria-label="Canvas">
            <EditorCanvas />
          </main>
          <PropertiesPanel />
        </div>
      ) : (
        <EmptyState />
      )}
      <ShortcutsDialog />
    </>
  );
}

export default function App() {
  const route = useRoute();
  const dragging = usePasteAndDrop();
  useKeyboardShortcuts();
  useThemeSync();

  useEffect(() => {
    if (booted) return;
    booted = true;
    initAutosave();
    void refreshRecents();
    // Any newly opened screenshot belongs in the editor.
    let lastId = store.get().doc?.id;
    store.subscribe(() => {
      const id = store.get().doc?.id;
      if (id && id !== lastId && getRoute().section !== 'tools' && getRoute().section !== 'pdf') goEditor();
      lastId = id;
    });
  }, []);

  useEffect(() => {
    if (route.section !== 'tools' && route.section !== 'pdf') void refreshRecents();
  }, [route.section]);

  return (
    <div className="flex h-full flex-col bg-window text-fg">
      {route.section === 'home' && <StartScreen />}
      {route.section === 'editor' && <Editor />}
      {route.section === 'about' && (
        <Suspense fallback={<div className="flex-1" />}>
          <AboutPage />
        </Suspense>
      )}
      {route.section === 'legal' && (
        <Suspense fallback={<div className="flex-1" />}>
          <LegalPage doc={route.doc} />
        </Suspense>
      )}
      {route.section === 'pdf' && (
        <Suspense fallback={<div className="flex-1" />}>
          <PdfApp tool={route.tool} />
        </Suspense>
      )}
      {route.section === 'tools' && (
        <Suspense fallback={<div className="flex-1" />}>
          <ToolsApp tool={route.tool} />
        </Suspense>
      )}
      <DropOverlay active={dragging} />
      <BusyIndicator />
      <Toasts />
    </div>
  );
}
