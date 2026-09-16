import { Accessibility, MessageCircle, NotebookPen } from 'lucide-react';
import type { NoteKind } from '@/lib/comments/store';
export const NOTE_META = {
  comment: { label: 'Comment', plural: 'Comments', icon: MessageCircle, pin: 'bg-blue-600', text: 'text-blue-400' },
  annotation: { label: 'Annotation', plural: 'Annotations', icon: NotebookPen, pin: 'bg-violet-600', text: 'text-violet-400' },
  accessibility: { label: 'Accessibility note', plural: 'Accessibility', icon: Accessibility, pin: 'bg-teal-700', text: 'text-teal-400' },
} satisfies Record<NoteKind, { label: string; plural: string; icon: typeof MessageCircle; pin: string; text: string }>;
export const NOTE_KINDS: NoteKind[] = ['comment', 'annotation', 'accessibility'];
