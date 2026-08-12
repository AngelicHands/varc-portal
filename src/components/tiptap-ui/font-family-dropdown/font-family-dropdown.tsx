"use client"

import { forwardRef, useCallback, useState } from "react"
import type { Editor } from "@tiptap/react"

import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"
import { TypeIcon } from "@/components/tiptap-icons/type-icon"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import {
  CONTENT_FONT_OPTIONS,
  contentFontStack,
  matchContentFontPreset,
  type ContentFontPreset,
} from "@/lib/fonts"
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
} from "@/components/tiptap-ui-primitive/dropdown-menu"

export interface FontFamilyDropdownProps extends Omit<ButtonProps, "type"> {
  editor?: Editor | null
  onOpenChange?: (isOpen: boolean) => void
  modal?: boolean
}

function currentPreset(editor: Editor | null): ContentFontPreset {
  if (!editor) return "default"
  const fontFamily = editor.getAttributes("textStyle").fontFamily as
    | string
    | undefined
  return matchContentFontPreset(fontFamily)
}

function applyFont(editor: Editor, preset: ContentFontPreset) {
  const stack = contentFontStack(preset)
  if (!stack) {
    editor.chain().focus().unsetFontFamily().run()
    return
  }
  editor.chain().focus().setFontFamily(stack).run()
}

export const FontFamilyDropdown = forwardRef<
  HTMLButtonElement,
  FontFamilyDropdownProps
>(
  (
    {
      editor: providedEditor,
      onOpenChange,
      children,
      modal = false,
      ...buttonProps
    },
    ref,
  ) => {
    const { editor } = useTiptapEditor(providedEditor)
    const [isOpen, setIsOpen] = useState(false)
    const active = currentPreset(editor)
    const activeLabel =
      CONTENT_FONT_OPTIONS.find((option) => option.value === active)?.label ??
      "Default (site fonts)"
    const canSet = Boolean(editor?.isEditable)

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!editor || !canSet) return
        setIsOpen(open)
        onOpenChange?.(open)
      },
      [canSet, editor, onOpenChange],
    )

    if (!editor) return null

    return (
      <DropdownMenu modal={modal} open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            data-active-state={active !== "default" ? "on" : "off"}
            role="button"
            tabIndex={-1}
            disabled={!canSet}
            data-disabled={!canSet}
            aria-label="Font family"
            tooltip="Font"
            {...buttonProps}
            ref={ref}
          >
            {children ? (
              children
            ) : (
              <>
                <TypeIcon className="tiptap-button-icon" />
                <span className="tiptap-button-text max-w-[7.5rem] truncate">
                  {activeLabel}
                </span>
                <ChevronDownIcon className="tiptap-button-dropdown-small" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {CONTENT_FONT_OPTIONS.map((option) => {
              const selected = option.value === active
              return (
                <DropdownMenuItem key={option.value} asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    data-active-state={selected ? "on" : "off"}
                    aria-pressed={selected}
                    showTooltip={false}
                    onClick={() => applyFont(editor, option.value)}
                  >
                    <span
                      className="tiptap-button-text"
                      style={
                        contentFontStack(option.value)
                          ? { fontFamily: contentFontStack(option.value)! }
                          : undefined
                      }
                    >
                      {option.label}
                    </span>
                  </Button>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  },
)

FontFamilyDropdown.displayName = "FontFamilyDropdown"
