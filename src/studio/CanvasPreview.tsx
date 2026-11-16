import { TemplateThumb } from './LeftPanel';

/** Template thumbnails for the home screen's Canvas card (lazy-loaded with Studio). */
export default function CanvasPreview() {
  return (
    <div className="flex items-center justify-center gap-3">
      {['quote', 'youtube', 'event'].map((id) => (
        <div key={id} className={id === 'youtube' ? 'w-[104px]' : 'w-[76px]'}>
          <TemplateThumb id={id} />
        </div>
      ))}
    </div>
  );
}
