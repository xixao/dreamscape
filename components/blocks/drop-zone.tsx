import { usePlay } from '@/components/play/play-context';

export function DropZone() {
  const play = usePlay();
  if (play.mode === 'play') return null;
  return (
    <div className="flex min-h-20 w-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
      Drop here
    </div>
  );
}

export function StageEmptyState() {
  const play = usePlay();
  if (play.mode === 'play') return null;
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">This frame is empty</p>
      <p className="text-sm text-muted-foreground">
        Drag a component from the Components panel on the right and drop it here.
      </p>
    </div>
  );
}
