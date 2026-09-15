'use client';

import type { Page, Screen } from '@/lib/files/repository';
import { ShareSettings } from './share-settings';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';

export function SharePrototypeButton({ playHref, screens = [], pages = [], currentScreenId }: { playHref: string; screens?: Screen[]; pages?: Page[]; currentScreenId?: string }) {
  return <Dialog>
      <DialogTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Share" title="Share"><Share2 className="size-4" aria-hidden /></Button></DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto p-6 sm:max-w-3xl">
        <div className="pr-8"><DialogTitle>Share prototype</DialogTitle><DialogDescription className="mt-2">Choose where viewers start and how they can review your prototype.</DialogDescription></div>
        <ShareSettings playHref={playHref} screens={screens} pages={pages} currentScreenId={currentScreenId} storageKey={`dreamscape:share-draft:${playHref.split('?')[0]}`} />
      </DialogContent>
    </Dialog>;
}
