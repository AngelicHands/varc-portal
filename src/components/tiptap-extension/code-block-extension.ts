import CodeBlock from "@tiptap/extension-code-block"
import { mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { CodeBlockNodeView } from "@/components/tiptap-node/code-block-node/code-block-node-view"
import {
  codeBlockLanguageLabel,
  normalizeCodeBlockTheme,
  parseBooleanAttr,
  type CodeBlockTheme,
} from "@/lib/code-block-options"

function clipboardPlainText(event: ClipboardEvent): string | null {
  const data = event.clipboardData
  if (!data) return null

  const plain = data.getData("text/plain")
  if (plain) {
    return plain.replace(/\r\n?/g, "\n")
  }

  const html = data.getData("text/html")
  if (!html || typeof document === "undefined") return null

  const container = document.createElement("div")
  container.innerHTML = html
  container.querySelectorAll("br").forEach((br) => {
    br.replaceWith("\n")
  })

  return (container.textContent ?? "").replace(/\r\n?/g, "\n")
}

function languageFromElement(element: HTMLElement): string | null {
  const fromData = element.getAttribute("data-language")
  if (fromData) return fromData

  const code = element.querySelector("code")
  if (!code) return null

  const match = Array.from(code.classList)
    .find((className) => className.startsWith("language-"))
    ?.replace(/^language-/, "")

  return match || null
}

export type PortalCodeBlockAttrs = {
  language: string | null
  theme: CodeBlockTheme
  showLanguageLabel: boolean
  showLineNumbers: boolean
}

/**
 * Code block with plain-text paste inside an existing block so multi-line
 * snippets stay in one pre/code block instead of splitting into paragraphs.
 */
export const PortalCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      theme: {
        default: "dark",
        parseHTML: (element) =>
          normalizeCodeBlockTheme(element.getAttribute("data-theme")),
        renderHTML: (attributes) => ({
          "data-theme": normalizeCodeBlockTheme(attributes.theme),
        }),
      },
      showLanguageLabel: {
        default: false,
        parseHTML: (element) =>
          parseBooleanAttr(element.getAttribute("data-show-language-label"), false),
        renderHTML: (attributes) => ({
          "data-show-language-label": attributes.showLanguageLabel ? "true" : "false",
        }),
      },
      showLineNumbers: {
        default: true,
        parseHTML: (element) =>
          parseBooleanAttr(element.getAttribute("data-show-line-numbers"), true),
        renderHTML: (attributes) => ({
          "data-show-line-numbers": attributes.showLineNumbers ? "true" : "false",
        }),
      },
      language: {
        default: this.options.defaultLanguage,
        parseHTML: (element) => languageFromElement(element),
        renderHTML: (attributes) => {
          const language = attributes.language
            ? String(attributes.language)
            : null
          return language ? { "data-language": language } : {}
        },
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },

  renderHTML({ node, HTMLAttributes }) {
    const language = node.attrs.language
      ? String(node.attrs.language)
      : null

    return [
      "pre",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-theme": normalizeCodeBlockTheme(node.attrs.theme),
        "data-show-language-label": node.attrs.showLanguageLabel ? "true" : "false",
        "data-show-line-numbers": node.attrs.showLineNumbers ? "true" : "false",
        ...(language ? { "data-language": language } : {}),
        ...(language && node.attrs.showLanguageLabel
          ? { "data-language-label": codeBlockLanguageLabel(language) }
          : {}),
      }),
      [
        "code",
        {
          class: language
            ? this.options.languageClassPrefix + language
            : null,
        },
        0,
      ],
    ]
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? []

    return [
      ...parentPlugins,
      new Plugin({
        key: new PluginKey("portalCodeBlockPlainTextPaste"),
        props: {
          handlePaste: (view, event) => {
            const { state } = view
            const { $from, from, to } = state.selection

            if ($from.parent.type !== this.type) {
              return false
            }

            const text = clipboardPlainText(event)
            if (text == null) {
              return false
            }

            view.dispatch(state.tr.insertText(text, from, to))
            return true
          },
        },
      }),
    ]
  },
})
