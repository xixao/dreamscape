"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { phoneModels, type PhoneModel } from "@/lib/preview-devices";

export default function PhoneModelSelect({ value, onChange, className }: { value: PhoneModel; onChange: (value: PhoneModel) => void; className?: string }) {
  return <Select value={value} onValueChange={(next) => onChange(next as PhoneModel)}>
    <SelectTrigger aria-label="Phone model" className={className}><SelectValue /></SelectTrigger>
    <SelectContent>{phoneModels.map((model) => <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>)}</SelectContent>
  </Select>;
}
