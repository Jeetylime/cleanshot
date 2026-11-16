import { useEffect } from 'react';
import { useStudio } from './store';
import * as A from './actions';
import { onHandoff, takeHandoff } from './handoff';
import { CanvasStart } from './CanvasStart';
import { CanvasEditor } from './CanvasEditor';

/** Canvas section: the start page when no design is open, the editor otherwise. */
export default function CanvasApp() {
  const hasDoc = useStudio((s) => !!s.doc);

  useEffect(() => {
    const consume = () => {
      const h = takeHandoff();
      if (h) void A.openImageInCanvas(h.blob, h.name, { newDesign: h.newDesign });
    };
    consume();
    const off = onHandoff(consume);
    return () => {
      off();
    };
  }, []);

  return hasDoc ? <CanvasEditor /> : <CanvasStart />;
}
