import { useLang } from './i18n';
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
import { TextDialog } from './components/TextDialog';
import { RecordingBar } from './components/RecordingBar';
import { CommandPalette } from './components/CommandPalette';
import { useEditorCommands } from './components/editorCommands';
import { useKeyboardShortcuts, usePasteAndDrop, useThemeSync } from './hooks/useGlobalInput';
import { getRoute, goEditor, useRoute, type Route } from './app/route';
import { TOOLS } from './tools/registry';
import { noteRoute } from './app/recentTools';
import { PDF_TOOLS } from './pdf/registry';

const ToolsApp = lazy(() => import('./tools/ToolsApp'));
const PdfApp = lazy(() => import('./pdf/PdfApp'));
const LegalPage = lazy(() => import('./legal/LegalPage'));
const CanvasApp = lazy(() => import('./studio/StudioApp'));
const AboutPage = lazy(() => import('./components/AboutPage'));
const StoragePage = lazy(() => import('./components/StoragePage'));

let booted = false;

function pageTitle(route: Route): string | null {
  switch (route.section) {
    case 'home':
      return 'Studiolo: private image, design and PDF tools';
    case 'editor':
      return 'Edit · Studiolo';
    case 'canvas':
      return 'Canvas · Studiolo';
    case 'tools':
      return `${route.tool ? `${TOOLS.find((t) => t.key === route.tool)?.name} · ` : ''}Image Tools · Studiolo`;
    case 'pdf':
      return `${route.tool ? `${PDF_TOOLS.find((t) => t.key === route.tool)?.name} · ` : ''}PDF Tools · Studiolo`;
    default:
      return null;
  }
}

function Editor() {
  const hasDoc = useEditor((s) => !!s.doc);
  useEditorCommands();
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
      <TextDialog />
    </>
  );
}

export default function App() {
  const route = useRoute();
  // Re-render everything when the language changes.
  useLang();
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
      if (id && id !== lastId && !['tools', 'pdf', 'canvas'].includes(getRoute().section)) goEditor();
      lastId = id;
    });
  }, []);

  useEffect(() => {
    if (route.section !== 'tools' && route.section !== 'pdf') void refreshRecents();
  }, [route.section]);

  // Every view gets its own document title (WCAG 2.4.2). Legal, About and Storage pages set theirs.
  useEffect(() => {
    const t = pageTitle(route);
    if (t) document.title = t;
    noteRoute(route);
  }, [route]);

  return (
    <div className="flex h-full flex-col bg-window text-fg">
      <a
        href="#main-content"
        data-no-underline
        onClick={(e) => {
          e.preventDefault();
          const main = document.querySelector<HTMLElement>('main');
          if (!main) return;
          if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
          main.focus();
        }}
        className="sr-only z-[300] rounded-[8px] bg-accent-fill px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>
      {route.section === 'home' && <StartScreen />}
      {route.section === 'editor' && <Editor />}
      {route.section === 'canvas' && (
        <Suspense fallback={<div className="flex-1" />}>
          <CanvasApp />
        </Suspense>
      )}
      {route.section === 'about' && (
        <Suspense fallback={<div className="flex-1" />}>
          <AboutPage />
        </Suspense>
      )}
      {route.section === 'storage' && (
        <Suspense fallback={<div className="flex-1" />}>
          <StoragePage />
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
      <DropOverlay active={dragging && route.section !== 'canvas'} />
      <BusyIndicator />
      <Toasts />
      <RecordingBar />
      <CommandPalette />
    </div>
  );
}
