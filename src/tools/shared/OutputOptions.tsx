import { useEffect, useState } from 'react';
import { Segmented, Slider } from '../../components/ui/controls';
import { canEncode, FORMATS, type OutFormat } from './encode';

export type OutChoice = OutFormat | 'original';

/** Format + quality picker shared by tools that export images. */
export function OutputOptions({
  format,
  quality,
  onFormat,
  onQuality,
  allowOriginal = false,
  formats = ['png', 'jpeg', 'webp'],
}: {
  format: OutChoice;
  quality: number;
  onFormat: (f: OutChoice) => void;
  onQuality: (q: number) => void;
  allowOriginal?: boolean;
  formats?: OutFormat[];
}) {
  const [avif, setAvif] = useState<boolean | null>(null);
  useEffect(() => {
    if (formats.includes('avif')) void canEncode('avif').then(setAvif);
  }, [formats]);
  const options: { value: OutChoice; label: string; title?: string }[] = [
    ...(allowOriginal ? [{ value: 'original' as OutChoice, label: 'Original', title: 'Keep each file’s format' }] : []),
    ...formats.map((f) => ({ value: f as OutChoice, label: FORMATS[f].label })),
  ];
  const lossy = format === 'original' || FORMATS[format].lossy;
  return (
    <div className="flex flex-col gap-3">
      <Segmented<OutChoice>
        ariaLabel="Output format"
        value={format}
        onChange={(f) => (f === 'avif' && avif === false ? undefined : onFormat(f))}
        options={options}
      />
      {format === 'avif' && avif === false && <p className="text-xs text-danger">AVIF encoding isn’t supported by this browser.</p>}
      {lossy && <Slider label="Quality" value={quality} min={10} max={100} unit="%" onChange={(q) => onQuality(Math.round(q))} />}
    </div>
  );
}

/** Resolve "original" to a concrete encodable format for a given input type. */
export function resolveFormat(choice: OutChoice, inputType: string): OutFormat {
  if (choice !== 'original') return choice;
  if (inputType === 'image/jpeg') return 'jpeg';
  if (inputType === 'image/webp') return 'webp';
  return 'png';
}
