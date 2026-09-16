'use client';

import type { SharedReview, SaveSharedReview } from '@/lib/presentation/model';

import type { Page, Screen } from '@/lib/files/repository';
import { ShareSettings } from './share-settings';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';

export function SharePrototypeButton({ playHref, screens = [], pages = [], currentScreenId, fileId, sharedReview, onSaveSharedReview }: { fileId?: string; sharedReview?: SharedReview; onSaveSharedReview?: SaveSharedReview; playHref: string; screens?: Screen[]; pages?: Page[]; currentScreenId?: string }) {
  return <Dialog>
      <DialogTrigger asChild><Button type="button" size="sm" aria-label="Share review" title="Share review"><Share2 className="size-4" aria-hidden />Share review</Button></DialogTrigger>
      <DialogContent onOpenAutoFocus={event => { event.preventDefault(); (event.currentTarget as HTMLElement | null)?.focus(); }} className="max-h-[85dvh] overflow-y-auto p-6 sm:max-w-3xl">
        <div className="pr-8"><DialogTitle>Share review</DialogTitle><DialogDescription className="mt-2">Create a focused review experience from this prototype.</DialogDescription></div>
        <ShareSettings fileId={fileId} sharedReview={sharedReview} onSaveSharedReview={onSaveSharedReview} playHref={playHref} screens={screens} pages={pages} currentScreenId={currentScreenId} storageKey={`dreamscape:share-draft:${playHref.split('?')[0]}`} />
      </DialogContent>
    </Dialog>;
}
