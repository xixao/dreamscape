import type { SerializedNodes } from '@craftjs/core';

/** Export a self-contained Craft subtree, including linked slots and responsive props. */
export function selectionCode(nodes: SerializedNodes, id: string): string {
  const tree: SerializedNodes = {};
  const visit = (key: string) => {
    const node = structuredClone(nodes[key]);
    tree[key === id ? 'ROOT' : key] = node;
    node.parent = key === id ? null : node.parent === id ? 'ROOT' : node.parent;
    node.nodes.forEach(visit);
    Object.values(node.linkedNodes).forEach(visit);
  };
  visit(id);
  return `import { Editor, Frame } from '@craftjs/core';\nimport { resolver } from '@/components/blocks/registry';\nimport { StageProvider } from '@/components/workbench/stage-context';\n\n// Current element and descendants, including responsive styling and linked slots.\nconst layout = ${JSON.stringify(tree, null, 2)};\n\nexport default function SelectionPreview() {\n  return (\n    <StageProvider>\n      <Editor resolver={resolver} enabled={false}>\n        <Frame data={JSON.stringify(layout)} />\n      </Editor>\n    </StageProvider>\n  );\n}\n`;
}
