import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Download, Pause, Play } from 'lucide-react';
import { Button, ColorWell, NumberInput, Segmented, Slider, ToggleRow } from '../../components/ui/controls';
import { ctx2d } from '../../engine/images';
import { showToast } from '../../store/actions';
import { errorMessage } from '../shared/batch';
import { BatchList } from '../shared/BatchList';
import { Dropzone, FileRow, PanelSection, ProgressBar, saveBlob, Spinner, Stage, ToolLayout, useFileSink, useImageList } from '../shared/ui';
import { paintAt, renderGif, renderVideo, totalDuration, videoType, type AnimationOptions, type Transition } from '../../lib/animate';

type Out = 'gif' | 'video';

export default function AnimationMaker() {
  const list = useImageList({ multiple: true });
  useFileSink(list.add);
  const first = list.items[0];
  const [width, setWidth] = useState(1080);
  const [hold, setHold] = useState(1.2);
  const [transition, setTransition] = useState<Transition>('fade');
  const [trans, setTrans] = useState(0.5);
  const [fps, setFps] = useState(20);
  const [background, setBackground] = useState('#000000');
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [loopBack, setLoopBack] = useState(true);
  const [out, setOut] = useState<Out>('gif');
  const [playing, setPlaying] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useMemo(() => videoType(), []);

  // Output size follows the first image's aspect ratio.
  const height = first ? Math.max(2, Math.round((width * first.height) / first.width / 2) * 2) : Math.round(width * 0.5625);
  const opts: AnimationOptions = useMemo(
    () => ({ width, height, hold: hold * 1000, transition, transitionMs: trans * 1000, fps, background, fit, loopBack }),
    [width, height, hold, transition, trans, fps, background, fit, loopBack],
  );
  const slides = useMemo(() => list.items.map((i) => ({ source: i.source, width: i.width, height: i.height })), [list.items]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !slides.length) return;
    const k = Math.min(1, 720 / Math.max(width, height));
    const po = { ...opts, width: Math.round(width * k), height: Math.round(height * k) };
    c.width = po.width;
    c.height = po.height;
    const ctx = ctx2d(c);
    const total = totalDuration(slides.length, po);
    if (!playing) {
      paintAt(ctx, slides, po, 0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      paintAt(ctx, slides, po, (performance.now() - t0) % total);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [slides, opts, playing, width, height]);

  const download = async () => {
    setBusy(0);
    try {
      const blob = out === 'gif' ? await renderGif(slides, opts, setBusy) : await renderVideo(slides, opts, setBusy);
      await saveBlob(blob, `animation.${out === 'gif' ? 'gif' : video!.ext}`);
    } catch (err) {
      showToast(`Couldn’t create the animation: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const seconds = slides.length ? totalDuration(slides.length, opts) / 1000 : 0;

  const main = list.items.length ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <Stage>
        <canvas ref={canvas} className="max-h-full max-w-full rounded-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.18)]" />
      </Stage>
      <div className="max-h-[34%] shrink-0 border-t border-line">
        <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="pt-2">
          {list.items.map((img, i) => (
            <FileRow
              key={img.id}
              img={img}
              onRemove={() => list.remove(img.id)}
              status={<span className="text-subtle">Slide {i + 1}</span>}
              right={
                <span className="flex gap-0.5 text-xs">
                  <button type="button" aria-label={`Move ${img.name} earlier`} disabled={i === 0} onClick={() => list.move(img.id, -1)} className="h-[24px] w-[24px] rounded-[6px] text-muted hover:bg-hover disabled:opacity-30">↑</button>
                  <button type="button" aria-label={`Move ${img.name} later`} disabled={i === list.items.length - 1} onClick={() => list.move(img.id, 1)} className="h-[24px] w-[24px] rounded-[6px] text-muted hover:bg-hover disabled:opacity-30">↓</button>
                </span>
              }
            />
          ))}
        </BatchList>
      </div>
    </div>
  ) : (
    <Dropzone multiple onFiles={list.add} title="Drop images to animate" hint="Make a GIF or video slideshow with transitions" icon={<Clapperboard size={20} />} />
  );

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          <PanelSection title="Timing" aside={slides.length ? <button type="button" aria-label={playing ? 'Pause preview' : 'Play preview'} onClick={() => setPlaying((p) => !p)} className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-muted hover:bg-hover">{playing ? <Pause size={13} /> : <Play size={13} />}</button> : undefined}>
            <Slider label="Show each" value={hold} min={0.2} max={6} step={0.1} unit="s" onChange={(v) => setHold(Math.round(v * 10) / 10)} />
            <span className="text-xs text-muted">Transition</span>
            <Segmented<Transition>
              ariaLabel="Transition"
              value={transition}
              onChange={setTransition}
              options={[
                { value: 'cut', label: 'Cut' },
                { value: 'fade', label: 'Fade' },
                { value: 'slide', label: 'Slide' },
                { value: 'push', label: 'Push' },
                { value: 'zoom', label: 'Zoom' },
              ]}
            />
            {transition !== 'cut' && <Slider label="Transition length" value={trans} min={0.1} max={2} step={0.1} unit="s" onChange={(v) => setTrans(Math.round(v * 10) / 10)} />}
            <ToggleRow label="Transition back to the start" checked={loopBack} onChange={setLoopBack} />
            {seconds > 0 && <p className="text-xs text-subtle tabular-nums">Length: {seconds.toFixed(1)} s</p>}
          </PanelSection>
          <PanelSection title="Frame">
            <NumberInput ariaLabel="Width" prefix="W" suffix="px" value={width} min={64} max={3840} onChange={setWidth} />
            <p className="text-2xs text-subtle tabular-nums">Height {height} px (from the first image)</p>
            <Segmented ariaLabel="Image fit" value={fit} onChange={setFit} options={[{ value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Fill' }]} />
            <ColorWell label="Background" value={background} onChange={setBackground} />
          </PanelSection>
          <PanelSection title="Output">
            <Segmented<Out> ariaLabel="Output format" value={out} onChange={setOut} options={[{ value: 'gif', label: 'GIF' }, { value: 'video', label: video ? `Video (${video.ext.toUpperCase()})` : 'Video (unsupported)' }]} />
            <Slider label="Frame rate" value={fps} min={5} max={out === 'gif' ? 30 : 60} unit=" fps" onChange={(v) => setFps(Math.round(v))} />
            {out === 'gif' && <p className="text-2xs leading-[15px] text-subtle">GIFs use 256 colors per frame and get large at big sizes; 600–1080 px wide works well.</p>}
            {out === 'video' && <p className="text-2xs leading-[15px] text-subtle">Video records in real time ({seconds.toFixed(1)} s).</p>}
            {busy !== null && <ProgressBar value={busy} label={out === 'gif' ? 'Encoding GIF…' : 'Recording…'} />}
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!slides.length || busy !== null || (out === 'video' && !video)} onClick={() => void download()}>
          {busy !== null ? <Spinner size={13} /> : <Download size={14} />} Download {out === 'gif' ? 'GIF' : 'video'}
        </Button>
      }
    />
  );
}
