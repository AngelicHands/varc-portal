"use client"

import type { Attrs, Node as PMNode } from "@tiptap/pm/model"
import type { EditorState, Transaction } from "@tiptap/pm/state"
import type { Editor } from "@tiptap/react"
import {
  CellSelection,
  isInTable,
  moveTableColumn,
  moveTableRow,
  selectedRect,
  tableNodeTypes,
} from "@tiptap/pm/tables"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { TableColumnAddIcon } from "@/components/tiptap-icons/table-column-add-icon"
import { TableColumnMoveLeftIcon } from "@/components/tiptap-icons/table-column-move-left-icon"
import { TableColumnMoveRightIcon } from "@/components/tiptap-icons/table-column-move-right-icon"
import { TableColumnRemoveIcon } from "@/components/tiptap-icons/table-column-remove-icon"
import { TableMergeCellsIcon } from "@/components/tiptap-icons/table-merge-cells-icon"
import { TableRemoveIcon } from "@/components/tiptap-icons/table-remove-icon"
import { TableRowAddIcon } from "@/components/tiptap-icons/table-row-add-icon"
import { TableRowMoveDownIcon } from "@/components/tiptap-icons/table-row-move-down-icon"
import { TableRowMoveUpIcon } from "@/components/tiptap-icons/table-row-move-up-icon"
import { TableRowRemoveIcon } from "@/components/tiptap-icons/table-row-remove-icon"
import { TableSplitCellIcon } from "@/components/tiptap-icons/table-split-cell-icon"
import { TableSplitCellVerticalIcon } from "@/components/tiptap-icons/table-split-cell-vertical-icon"
import {
  getCellVerticalAlign,
  TableCellVerticalAlignButtons,
  type CellVerticalAlign,
} from "@/components/tiptap-ui/table-cell-align-buttons"

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
  showMergeCells: boolean
  canMergeCells: boolean
  showSplitCell: boolean
  canSplitCellHorizontally: boolean
  canSplitCellVertically: boolean
  cellVerticalAlign: CellVerticalAlign
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
  showMergeCells: false,
  canMergeCells: false,
  showSplitCell: false,
  canSplitCellHorizontally: false,
  canSplitCellVertically: false,
  cellVerticalAlign: "top",
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

function countSelectedTableCells(state: EditorState): number {
  if (!isInTable(state)) return 0
  const selection = state.selection
  if (selection instanceof CellSelection) {
    let count = 0
    selection.forEachCell(() => {
      count += 1
    })
    return count
  }
  return 1
}

function addColSpan(attrs: Attrs, index: number, n = 1): Attrs {
  const colspan = Number(attrs.colspan ?? 1) + n
  const colwidth = Array.isArray(attrs.colwidth)
    ? [...attrs.colwidth]
    : null
  if (colwidth) {
    for (let i = 0; i < n; i++) colwidth.splice(index, 0, 0)
  }
  return { ...attrs, colspan, colwidth }
}

function getSingleSelectedCell(state: EditorState): {
  rect: ReturnType<typeof selectedRect>
  cell: PMNode
  cellPos: number
} | null {
  if (!isInTable(state)) return null
  const selection = state.selection
  if (
    selection instanceof CellSelection &&
    selection.$anchorCell.pos !== selection.$headCell.pos
  ) {
    return null
  }
  try {
    const rect = selectedRect(state)
    const cellPos = rect.map.map[rect.top * rect.map.width + rect.left]
    const cell = rect.table.nodeAt(cellPos)
    if (!cell) return null
    return { rect, cell, cellPos }
  } catch {
    return null
  }
}

type SplitAxis = "horizontal" | "vertical"

function splitCellAlongAxis(
  state: EditorState,
  axis: SplitAxis,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const selected = getSingleSelectedCell(state)
  if (!selected) return false
  if (!dispatch) return true

  const { rect, cell, cellPos } = selected
  const colspan = Number(cell.attrs.colspan ?? 1)
  const rowspan = Number(cell.attrs.rowspan ?? 1)
  const colwidth = Array.isArray(cell.attrs.colwidth)
    ? (cell.attrs.colwidth as number[])
    : null
  const tr = state.tr
  const { map, table, tableStart } = rect

  if (axis === "horizontal") {
    if (colspan > 1) {
      const leftCols = Math.ceil(colspan / 2)
      const rightCols = colspan - leftCols
      const rightNode = cell.type.createAndFill({
        ...cell.attrs,
        colspan: rightCols,
        rowspan,
        colwidth: colwidth ? colwidth.slice(leftCols) : null,
      })
      if (!rightNode) return false
      tr.setNodeMarkup(tableStart + cellPos, null, {
        ...cell.attrs,
        colspan: leftCols,
        colwidth: colwidth ? colwidth.slice(0, leftCols) : null,
      })
      tr.insert(tableStart + cellPos + cell.nodeSize, rightNode)
    } else {
      const nextCell = cell.type.createAndFill({
        ...cell.attrs,
        colspan: 1,
        rowspan,
      })
      if (!nextCell) return false
      const insertCol = rect.right
      const pos = map.positionAt(rect.top, insertCol, table)
      tr.insert(tr.mapping.map(tableStart + pos), nextCell)
      const seen = new Set<number>([cellPos])
      for (let row = 0; row < map.height; ) {
        if (row >= rect.top && row < rect.bottom) {
          row += 1
          continue
        }
        const occupierPos = map.map[row * map.width + (insertCol - 1)]
        if (seen.has(occupierPos)) {
          row += 1
          continue
        }
        seen.add(occupierPos)
        const occupier = table.nodeAt(occupierPos)
        if (!occupier) {
          row += 1
          continue
        }
        tr.setNodeMarkup(
          tr.mapping.map(tableStart + occupierPos),
          null,
          addColSpan(occupier.attrs, Number(occupier.attrs.colspan ?? 1)),
        )
        row += Number(occupier.attrs.rowspan ?? 1)
      }
    }
  } else if (rowspan > 1) {
    const topRows = Math.ceil(rowspan / 2)
    const bottomRows = rowspan - topRows
    const bottomNode = cell.type.createAndFill({
      ...cell.attrs,
      colspan,
      rowspan: bottomRows,
    })
    if (!bottomNode) return false
    tr.setNodeMarkup(tableStart + cellPos, null, {
      ...cell.attrs,
      rowspan: topRows,
    })
    const insertPos = map.positionAt(rect.top + topRows, rect.left, table)
    tr.insert(tableStart + insertPos, bottomNode)
  } else {
    const nextCell = cell.type.createAndFill({
      ...cell.attrs,
      colspan,
      rowspan: 1,
    })
    if (!nextCell) return false
    const insertRow = rect.bottom
    let rowPos = tableStart
    for (let i = 0; i < insertRow; i++) {
      rowPos += table.child(i).nodeSize
    }
    const seen = new Set<number>([cellPos])
    for (let col = 0; col < map.width; ) {
      if (col >= rect.left && col < rect.right) {
        col += 1
        continue
      }
      const occupierPos = map.map[rect.top * map.width + col]
      if (seen.has(occupierPos)) {
        col += 1
        continue
      }
      seen.add(occupierPos)
      const occupier = table.nodeAt(occupierPos)
      if (!occupier) {
        col += 1
        continue
      }
      tr.setNodeMarkup(tableStart + occupierPos, null, {
        ...occupier.attrs,
        rowspan: Number(occupier.attrs.rowspan ?? 1) + 1,
      })
      col += Number(occupier.attrs.colspan ?? 1)
    }
    tr.insert(
      rowPos,
      tableNodeTypes(state.schema).row.create(null, nextCell),
    )
  }

  dispatch(tr)
  return true
}

export function splitCurrentTableCell(
  editor: Editor,
  axis: SplitAxis,
): boolean {
  editor.view.focus()
  return splitCellAlongAxis(editor.state, axis, editor.view.dispatch)
}

export function getTableControlState(editor: Editor | null): TableControlState {
  if (!editor || editor.isDestroyed) return EMPTY_TABLE_CONTROL_STATE
  const inTable = isInTable(editor.state)
  const selectedCellCount = inTable
    ? countSelectedTableCells(editor.state)
    : 0
  const canMergeCells = inTable && editor.can().mergeCells()
  const canSplitCell = inTable && splitCellAlongAxis(editor.state, "horizontal")
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
    showMergeCells: selectedCellCount >= 2,
    canMergeCells,
    showSplitCell: selectedCellCount === 1,
    canSplitCellHorizontally: canSplitCell,
    canSplitCellVertically: canSplitCell,
    cellVerticalAlign: inTable ? getCellVerticalAlign(editor) : "top",
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
      {state.showMergeCells || state.showSplitCell ? (
        <>
          <span className="table-controls-menu__separator" aria-hidden />
          {state.showMergeCells ? (
            <Button
              type="button"
              variant="ghost"
              size={size}
              disabled={!state.canMergeCells}
              data-disabled={!state.canMergeCells}
              tooltip="Merge cells"
              onClick={() => editor.chain().focus().mergeCells().run()}
            >
              <TableMergeCellsIcon className="tiptap-button-icon" />
            </Button>
          ) : null}
          {state.showSplitCell ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size={size}
                disabled={!state.canSplitCellHorizontally}
                data-disabled={!state.canSplitCellHorizontally}
                tooltip="Split horizontally"
                onClick={() => splitCurrentTableCell(editor, "horizontal")}
              >
                <TableSplitCellIcon className="tiptap-button-icon" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size={size}
                disabled={!state.canSplitCellVertically}
                data-disabled={!state.canSplitCellVertically}
                tooltip="Split vertically"
                onClick={() => splitCurrentTableCell(editor, "vertical")}
              >
                <TableSplitCellVerticalIcon className="tiptap-button-icon" />
              </Button>
            </>
          ) : null}
        </>
      ) : null}
      <span className="table-controls-menu__separator" aria-hidden />
      <TableCellVerticalAlignButtons
        editor={editor}
        verticalAlign={state.cellVerticalAlign}
        size={size}
      />
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
