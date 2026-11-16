import type { ToolKey } from '../app/route';
import { goTools } from '../app/route';
import { TOOLS, TOOL_GROUPS } from './registry';
import { ToolPreview } from './ToolPreview';
import { ToolSection, type SectionConfig } from './ToolSection';

const IMAGE_TOOLS: SectionConfig = {
  label: 'Image Tools',
  subtitle: 'Focused utilities for everyday image work.',
  groups: TOOL_GROUPS,
  tools: TOOLS,
  go: (key) => goTools(key as ToolKey | null),
  Preview: ToolPreview as SectionConfig['Preview'],
};

export default function ToolsApp({ tool }: { tool: ToolKey | null }) {
  return <ToolSection config={IMAGE_TOOLS} tool={tool} />;
}
