"use client";

import { useMemo } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  codeBlockLanguageLabel,
  normalizeCodeBlockTheme,
} from "@/lib/code-block-options";
import { splitCodeLines } from "@/lib/code-block-lines";

const codeContentStyle = {
  whiteSpace: "pre" as const,
  display: "block",
  margin: 0,
  padding: 0,
  background: "transparent",
  fontFamily: "var(--font-code)",
  fontStyle: "normal" as const,
  fontWeight: 400,
  lineHeight: "inherit",
  tabSize: 4,
};

export function CodeBlockNodeView({ node, selected }: NodeViewProps) {
  const theme = normalizeCodeBlockTheme(node.attrs.theme);
  const showLanguageLabel = Boolean(node.attrs.showLanguageLabel);
  const showLineNumbers = node.attrs.showLineNumbers !== false;
  const language = node.attrs.language ? String(node.attrs.language) : "";
  const text = node.textContent;

  const lines = useMemo(() => splitCodeLines(text), [text]);

  return (
    <NodeViewWrapper
      as="div"
      className="portal-code-block-node-view"
      data-selected={selected ? "true" : "false"}
    >
      <div className="portal-code-block-shell" data-theme={theme}>
        {showLanguageLabel ? (
          <div className="portal-code-block-header">
            {codeBlockLanguageLabel(language)}
          </div>
        ) : null}

        <div className="portal-code-block-body">
          {showLineNumbers ? (
            <table className="portal-code-block-table">
              <tbody>
                <tr>
                  <td className="portal-code-block-gutter">
                    {lines.map((_, index) => (
                      <div
                        key={`gutter-${index + 1}`}
                        className="portal-code-block-gutter-line"
                      >
                        {index + 1}
                      </div>
                    ))}
                  </td>
                  <td className="portal-code-block-line portal-code-block-code">
                    <NodeViewContent style={codeContentStyle} />
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="portal-code-block-body-plain">
              <NodeViewContent style={codeContentStyle} />
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
