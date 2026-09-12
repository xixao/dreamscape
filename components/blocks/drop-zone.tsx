export function DropZone() {
  return (
    <div className="flex min-h-20 w-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
      Drop here
    </div>
  );
}

export function StageEmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">This frame is empty</p>
      <p className="text-sm text-muted-foreground">
        Drag an asset from the Assets panel on the left and drop it here.
      </p>
    </div>
  );
}
