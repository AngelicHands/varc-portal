"use client"

import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import type { Editor } from "@tiptap/react"
import {
  isInTable,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from "@tiptap/pm/tables"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { ArrowRightIcon } from "@/components/tiptap-icons/arrow-right-icon"
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"
import { ChevronUpIcon } from "@/components/tiptap-icons/chevron-up-icon"
import { TableColumnAddIcon } from "@/components/tiptap-icons/table-column-add-icon"
import { TableColumnRemoveIcon } from "@/components/tiptap-icons/table-column-remove-icon"
import { TableRemoveIcon } from "@/components/tiptap-icons/table-remove-icon"
import { TableRowAddIcon } from "@/components/tiptap-icons/table-row-add-icon"
import { TableRowRemoveIcon } from "@/components/tiptap-icons/table-row-remove-icon"

type Props = {
  editor: Editor | null
}

type MenuPosition = {
  top: number
  left: number
  placeAbove: boolean
}

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

export function isSelectionInTable(editor: Editor | null): boolean {
  if (!editor || editor.isDestroyed) return false
  return isInTable(editor.state)
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

function getTableAnchor(editor: Editor): HTMLElement | null {
  const { from } = editor.state.selection
  const { node } = editor.view.domAtPos(from)
  const el = node instanceof HTMLElement ? node : node.parentElement
  if (!el) return null
  const table = el.closest("table")
  if (table instanceof HTMLElement) return table
  const wrapper = el.closest(".tableWrapper")
  return wrapper instanceof HTMLElement ? wrapper : null
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
        <ChevronUpIcon className="tiptap-button-icon" />
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
        <ChevronDownIcon className="tiptap-button-icon" />
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
        <ArrowLeftIcon className="tiptap-button-icon" />
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
        <ArrowRightIcon className="tiptap-button-icon" />
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

export function TableControlsMenu({ editor }: Props) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<MenuPosition>({
    top: 0,
    left: 0,
    placeAbove: true,
  })
  const [state, setState] = useState<TableControlState>(EMPTY_TABLE_CONTROL_STATE)

  const syncMenu = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isEditable) {
      setVisible(false)
      return
    }

    if (!isSelectionInTable(editor)) {
      setVisible(false)
      return
    }

    const anchor = getTableAnchor(editor)
    if (!anchor) {
      setVisible(false)
      return
    }

    const rect = anchor.getBoundingClientRect()
    const menuWidth = 360
    const menuHeight = 44
    const gap = 8
    const placeAbove = rect.top >= menuHeight + gap + 56
    const top = placeAbove ? rect.top - gap : rect.top + gap
    const left = Math.min(
      Math.max(8 + menuWidth / 2, rect.right - menuWidth / 2),
      window.innerWidth - 8 - menuWidth / 2,
    )

    setPosition({ top, left, placeAbove })
    setState(getTableControlState(editor))
    setVisible(true)
  }, [editor])

  useLayoutEffect(() => {
    syncMenu()
  }, [syncMenu])

  useEffect(() => {
    if (!editor) return

    const onUpdate = () => {
      requestAnimationFrame(() => syncMenu())
    }

    editor.on("selectionUpdate", onUpdate)
    editor.on("transaction", onUpdate)
    editor.on("focus", onUpdate)

    const scrollParents: EventTarget[] = [window]
    const content = editor.view.dom.closest(".simple-editor-content")
    if (content) scrollParents.push(content)

    scrollParents.forEach((target) => {
      target.addEventListener("scroll", onUpdate, true)
    })
    window.addEventListener("resize", onUpdate)

    return () => {
      editor.off("selectionUpdate", onUpdate)
      editor.off("transaction", onUpdate)
      editor.off("focus", onUpdate)
      scrollParents.forEach((target) => {
        target.removeEventListener("scroll", onUpdate, true)
      })
      window.removeEventListener("resize", onUpdate)
    }
  }, [editor, syncMenu])

  if (!editor || !visible) return null

  return (
    <div
      className="table-controls-menu"
      role="toolbar"
      aria-label="Table options"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        transform: position.placeAbove
          ? "translate(-50%, -100%)"
          : "translate(-50%, 0)",
        zIndex: 80,
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <TableEditButtons editor={editor} state={state} size="small" />
    </div>
  )
}
