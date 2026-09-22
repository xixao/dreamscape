import type { DiagramNode } from "@/lib/diagram/store";
import { tableCells } from "@/lib/diagram/table";
import { serializeDelimited } from "@/lib/diagram/table-model";
import { renderDiagramSvg, svgToPngBlob } from "@/lib/diagram/export";
export async function exportTable(
  node: DiagramNode,
  format: "csv" | "svg" | "png" | "pdf",
) {
  let blob: Blob;
  if (format === "csv")
    blob = new Blob(["\uFEFF", serializeDelimited(tableCells(node))], {
      type: "text/csv;charset=utf-8",
    });
  else {
    const ctx = document.createElement("canvas").getContext("2d");
    const result = renderDiagramSvg({
      nodes: [node],
      edges: [],
      frames: [],
      measureText: (text, font) => {
        if (!ctx) return text.length * font.size * 0.6;
        ctx.font = `${font.weight ?? 400} ${font.size}px ${font.family}`;
        return ctx.measureText(text).width;
      },
    });
    if (!result) throw new Error("Unable to export table.");
    if (format === "svg")
      blob = new Blob([result.svg], { type: "image/svg+xml" });
    else {
      // Bound raster size for very tall tables. SVG/CSV retain full precision.
      const scale = Math.min(
        2,
        8000 / Math.max(node.width + 80, node.height + 80),
      );
      const png = await svgToPngBlob(result.svg, { scale });
      if (format === "png") blob = png;
      else {
        const { jsPDF } = await import("jspdf");
        const image = await createImageBitmap(png);
        const pdf = new jsPDF({
          orientation: image.width > image.height ? "landscape" : "portrait",
          unit: "pt",
          format: "a4",
        });
        const pageW = pdf.internal.pageSize.getWidth(),
          pageH = pdf.internal.pageSize.getHeight(),
          margin = 24;
        const drawnWidth = pageW - margin * 2,
          drawnHeight = (image.height / image.width) * drawnWidth;
        const data = new Uint8Array(await png.arrayBuffer());
        for (let y = 0; y < drawnHeight; y += pageH - margin * 2) {
          if (y) pdf.addPage();
          pdf.addImage(
            data,
            "PNG",
            margin,
            margin - y,
            drawnWidth,
            drawnHeight,
          );
        }
        image.close();
        blob = pdf.output("blob");
      }
    }
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `Table.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
