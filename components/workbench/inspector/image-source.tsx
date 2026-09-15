'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ImageSource({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const embedded = value.startsWith('data:');
  return <div className="flex flex-col gap-2">
    <input ref={input} aria-label="Choose image file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="sr-only" onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type)) { setError('Choose a PNG, JPEG, WebP, GIF, or SVG image.'); return; }
      if (file.size > 5 * 1024 * 1024) { setError('Choose an image smaller than 5 MB, or use an image URL.'); return; }
      const reader = new FileReader();
      reader.onload = () => { setError(''); onChange(String(reader.result)); };
      reader.onerror = () => setError('Could not read that image. Please try again.');
      reader.readAsDataURL(file);
    }} />
    <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => input.current?.click()}>{value ? 'Replace image' : 'Choose image'}</Button>{value && <Button variant="ghost" size="sm" onClick={() => { onChange(''); setError(''); }}>Remove image</Button>}</div>
    <label className="flex flex-col gap-1 text-xs">Image URL<Input aria-label="Image URL" placeholder="https://example.com/image.jpg" value={embedded ? '' : value} onChange={event => { setError(''); onChange(event.target.value); }} /></label>
    {embedded && <p className="text-xs text-muted-foreground">Image saved with this file.</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
