import { TableCell, TableHeader } from "@tiptap/extension-table"

const VERTICAL_ALIGNS = new Set(["top", "middle", "bottom"])

function parseVerticalAlign(element: HTMLElement): string | null {
  const styleAlign = (element.style.verticalAlign || "").trim().toLowerCase()
  const attrAlign = (element.getAttribute("valign") || "").trim().toLowerCase()
  const value = styleAlign || attrAlign
  if (value === "center") return "middle"
  if (VERTICAL_ALIGNS.has(value)) return value
  return null
}

const verticalAlignAttribute = {
  default: null,
  parseHTML: parseVerticalAlign,
  renderHTML: (attributes: { verticalAlign?: string | null }) => {
    if (!attributes.verticalAlign) return {}
    return { style: `vertical-align: ${attributes.verticalAlign}` }
  },
}

export const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: verticalAlignAttribute,
    }
  },
})

export const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: verticalAlignAttribute,
    }
  },
})
