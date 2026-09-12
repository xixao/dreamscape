import Link from 'next/link';
import { EMPTY, EMPTY_TITLE } from '@/components/workbench/chrome';
import { cn } from '@/lib/utils';

export default function FolderNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className={cn(EMPTY, 'max-w-md')}>
        <b className={EMPTY_TITLE}>This folder does not exist</b>
        <Link href="/" className="text-[13px] font-medium text-acc hover:underline">
          Back to files
        </Link>
      </div>
    </main>
  );
}
