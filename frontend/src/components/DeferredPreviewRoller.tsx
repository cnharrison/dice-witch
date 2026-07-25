import { PreviewRoller } from './PreviewRoller';
import { TooltipProvider } from './ui/tooltip';

export default function DeferredPreviewRoller() {
  return (
    <TooltipProvider>
      <PreviewRoller />
    </TooltipProvider>
  );
}
