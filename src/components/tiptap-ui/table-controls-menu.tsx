"use client"

import type { Editor } from "@tiptap/react"
import {
  isInTable,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from "@tiptap/pm/tables"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { TableColumnAddIcon } from "@/components/tiptap-icons/table-column-add-icon"
import { TableColumnMoveLeftIcon } from "@/components/tiptap-icons/table-column-move-left-icon"
import { TableColumnMoveRightIcon } from "@/components/tiptap-icons/table-column-move-right-icon"
import { TableColumnRemoveIcon } from "@/components/tiptap-icons/table-column-remove-icon"
import { TableRemoveIcon } from "@/components/tiptap-icons/table-remove-icon"
import { TableRowAddIcon } from "@/components/tiptap-icons/table-row-add-icon"
import { TableRowMoveDownIcon } from "@/components/tiptap-icons/table-row-move-down-icon"
import { TableRowMoveUpIcon } from "@/components/tiptap-icons/table-row-move-up-icon"
import { TableRowRemoveIcon } from "@/components/tiptap-icons/table-row-remove-icon"

export type TableControlState = {
  inTable: boolean
  canInsertTable: boolean
  canAddRow: boolean
  canAddColumn: boolean
  canDeleteRow: boolean
  canDeleteColumn: boolean
  canDeleteTable: boolean
  canMoveRowUp: boolean
  canMoveRowDown: boolean
  canMoveColumnLeft: boolean
  canMoveColumnRight: boolean
}

const EMPTY_TABLE_CONTROL_STATE: TableControlState = {
  inTable: false,
  canInsertTable: false,
  canAddRow: false,
  canAddColumn: false,
  canDeleteRow: false,
  canDeleteColumn: false,
  canDeleteTable: false,
  canMoveRowUp: false,
  canMoveRowDown: false,
  canMoveColumnLeft: false,
  canMoveColumnRight: false,
}

function getSelectedTableRect(editor: Editor) {
  if (!isInTable(editor.state)) return null
  try {
    return selectedRect(editor.state)
  } catch {
    return null
  }
}

function canMoveRow(editor: Editor, direction: -1 | 1): boolean {
  const rect = getSelectedTableRect(editor)
  if (!rect) return false
  const from = rect.top
  const to = from + direction
  if (to < 0 || to >= rect.map.height) return false
  return moveTableRow({ from, to, select: false })(editor.state)
}

function canMoveColumn(editor: Editor, direction: -1 | 1): boolean {
  const rect = getSelectedTableRect(editor)
  if (!rect) return false
  const from = rect.left
  const to = from + direction
  if (to < 0 || to >= rect.map.width) return false
  return moveTableColumn({ from, to, select: false })(editor.state)
}

export function moveCurrentTableRow(editor: Editor, direction: -1 | 1): boolean {
  const rect = getSelectedTableRect(editor)
  if (!rect) return false
  const from = rect.top
  const to = from + direction
  if (to < 0 || to >= rect.map.height) return false
  editor.view.focus()
  return moveTableRow({ from, to })(editor.state, editor.view.dispatch)
}

export function moveCurrentTableColumn(
  editor: Editor,
  direction: -1 | 1,
): boolean {
  const rect = getSelectedTableRect(editor)
  if (!rect) return false
  const from = rect.left
  const to = from + direction
  if (to < 0 || to >= rect.map.width) return false
  editor.view.focus()
  return moveTableColumn({ from, to })(editor.state, editor.view.dispatch)
}

export function getTableControlState(editor: Editor | null): TableControlState {
  if (!editor || editor.isDestroyed) return EMPTY_TABLE_CONTROL_STATE
  const inTable = isInTable(editor.state)
  return {
    inTable,
    canInsertTable: editor
      .can()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    canAddRow: inTable && editor.can().addRowAfter(),
    canAddColumn: inTable && editor.can().addColumnAfter(),
    canDeleteRow: inTable && editor.can().deleteRow(),
    canDeleteColumn: inTable && editor.can().deleteColumn(),
    canDeleteTable: inTable && editor.can().deleteTable(),
    canMoveRowUp: inTable && canMoveRow(editor, -1),
    canMoveRowDown: inTable && canMoveRow(editor, 1),
    canMoveColumnLeft: inTable && canMoveColumn(editor, -1),
    canMoveColumnRight: inTable && canMoveColumn(editor, 1),
  }
}

type TableEditButtonsProps = {
  editor: Editor
  state: TableControlState
  size?: "small" | "default"
}

export function TableEditButtons({
  editor,
  state,
  size = "default",
}: TableEditButtonsProps) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={!state.canMoveRowUp}
        data-disabled={!state.canMoveRowUp}
        tooltip="Move row up"
        onClick={() => moveCurrentTableRow(editor, -1)}
      >
        <TableRowMoveUpIcon className="tiptap-button-icon" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={!state.canMoveRowDown}
        data-disabled={!state.canMoveRowDown}
        tooltip="Move row down"
        onClick={() => moveCurrentTableRow(editor, 1)}
      >
        <TableRowMoveDownIcon className="tiptap-button-icon" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={!state.canMoveColumnLeft}
        data-disabled={!state.canMoveColumnLeft}
        tooltip="Move column left"
        onClick={() => moveCurrentTableColumn(editor, -1)}
      >
        <TableColumnMoveLeftIcon className="tiptap-button-icon" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={!state.canMoveColumnRight}
        data-disabled={!state.canMoveColumnRight}
        tooltip="Move column right"
        onClick={() => moveCurrentTableColumn(editor, 1)}
      >
        <TableColumnMoveRightIcon className="tiptap-button-icon" />
      </Button>
      <span className="table-controls-menu__separator" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={!state.canAddRow}
        data-disabled={!state.canAddRow}
        tooltip="Add row"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        <TableRowAddIcon className="tiptap-button-icon" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={!state.canAddColumn}
        data-disabled={!state.canAddColumn}
        tooltip="Add column"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <TableColumnAddIcon className="tiptap-button-icon" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={!state.canDeleteRow}
        data-disabled={!state.canDeleteRow}
        tooltip="Delete row"
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        <TableRowRemoveIcon className="tiptap-button-icon" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={!state.canDeleteColumn}
        data-disabled={!state.canDeleteColumn}
        tooltip="Delete column"
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        <TableColumnRemoveIcon className="tiptap-button-icon" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={!state.canDeleteTable}
        data-disabled={!state.canDeleteTable}
        tooltip="Delete table"
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        <TableRemoveIcon className="tiptap-button-icon" />
      </Button>
    </>
  )
}
