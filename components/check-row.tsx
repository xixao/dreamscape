import { AlertCircle, CheckCircle2, ShieldCheck, Unplug } from "lucide-react";

const variants = {
  passed: { icon: CheckCircle2, label: "Passed" },
  "needs-work": { icon: AlertCircle, label: "Needs work" },
  manual: { icon: ShieldCheck, label: "Required" },
  unavailable: { icon: Unplug, label: "Not connected" },
} as const;

export default function CheckRow({
  status,
  title,
  kind,
  detail,
}: {
  status: keyof typeof variants;
  title: string;
  kind: string;
  detail: string;
}) {
  const { icon: Icon, label } = variants[status];
  return (
    <div className="check-row" data-status={status}>
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span className="check-row-meta">
          {kind} · {label}
        </span>
        <p>{detail}</p>
      </div>
    </div>
  );
}
