"use client"

import type { Attrs } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/react"
import { isInTable, selectionCell } from "@tiptap/pm/tables"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { AlignVerticalBottomIcon } from "@/components/tiptap-icons/align-vertical-bottom-icon"
import { AlignVerticalMiddleIcon } from "@/components/tiptap-icons/align-vertical-middle-icon"
import { AlignVerticalTopIcon } from "@/components/tiptap-icons/align-vertical-top-icon"

export type CellVerticalAlign = "top" | "middle" | "bottom"

const VERTICAL_ALIGNS = new Set<CellVerticalAlign>(["top", "middle", "bottom"])

export function getSelectedCellAttrs(editor: Editor | null): Attrs | null {
  if (!editor || editor.isDestroyed || !isInTable(editor.state)) return null
  try {
    return selectionCell(editor.state).nodeAfter?.attrs ?? null
  } catch {
    return null
  }
}

export function getCellVerticalAlign(editor: Editor | null): CellVerticalAlign {
  const value = getSelectedCellAttrs(editor)?.verticalAlign
  return VERTICAL_ALIGNS.has(value as CellVerticalAlign)
    ? (value as CellVerticalAlign)
    : "top"
}

export function setCellVerticalAlign(
  editor: Editor,
  align: CellVerticalAlign,
): boolean {
  if (!isInTable(editor.state)) return false
  if (getCellVerticalAlign(editor) === align) return true
  editor.view.focus()
  return editor.chain().focus().setCellAttribute("verticalAlign", align).run()
}

type TableCellVerticalAlignButtonsProps = {
  editor: Editor
  verticalAlign: CellVerticalAlign
  size?: "small" | "default"
}

export function TableCellVerticalAlignButtons({
  editor,
  verticalAlign,
  size = "default",
}: TableCellVerticalAlignButtonsProps) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size}
        data-active-state={verticalAlign === "top" ? "on" : "off"}
        tooltip="Align top"
        onClick={() => setCellVerticalAlign(editor, "top")}
      >
        <AlignVerticalTopIcon className="tiptap-button-icon" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        data-active-state={verticalAlign === "middle" ? "on" : "off"}
        tooltip="Align middle"
        onClick={() => setCellVerticalAlign(editor, "middle")}
      >
        <AlignVerticalMiddleIcon className="tiptap-button-icon" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        data-active-state={verticalAlign === "bottom" ? "on" : "off"}
        tooltip="Align bottom"
        onClick={() => setCellVerticalAlign(editor, "bottom")}
      >
        <AlignVerticalBottomIcon className="tiptap-button-icon" />
      </Button>
    </>
  )
}
