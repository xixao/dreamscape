type LabelData = {
  name?: string;
  displayName?: string;
  props?: Record<string, unknown>;
  custom?: Record<string, unknown>;
};

/** Content labels stay live; a deliberate layer rename opts out. */
export function layerLabel(data: LabelData, fallback = 'Frame'): string {
  const custom = data.custom ?? {};
  if (custom.layerNameExplicit && custom.layerName) return String(custom.layerName);
  const type = data.name || data.displayName;
  const content = type === 'Text' ? data.props?.text : type === 'Button' ? data.props?.label : undefined;
  if (typeof content === 'string' && content.trim()) return content;
  return String(custom.layerName || data.displayName || data.name || fallback);
}
