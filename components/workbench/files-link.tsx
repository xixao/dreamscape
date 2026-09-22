import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/** Shared file-navigation control for Design and Variations. */
export function FilesLink({ href = '/' }: { href?: string }) {
  return <Link href={href} aria-label="Files" className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold hover:underline">
    <ArrowLeft className="size-3.5" aria-hidden />Files
  </Link>;
}
