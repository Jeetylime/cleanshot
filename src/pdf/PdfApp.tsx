import type { PdfToolKey } from '../app/route';
import { goPdf } from '../app/route';
import { ToolSection, type SectionConfig } from '../tools/ToolSection';
import { PDF_GROUPS, PDF_TOOLS } from './registry';
import { PdfPreview } from './PdfPreview';

const PDF_SECTION: SectionConfig = {
  label: 'PDF Tools',
  subtitle: 'Merge, split, sign and convert PDFs without uploading them anywhere.',
  groups: PDF_GROUPS,
  tools: PDF_TOOLS,
  go: (key) => goPdf(key as PdfToolKey | null),
  Preview: PdfPreview,
};

export default function PdfApp({ tool }: { tool: PdfToolKey | null }) {
  return <ToolSection config={PDF_SECTION} tool={tool} />;
}
