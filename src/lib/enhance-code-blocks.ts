import {
  codeBlockLanguageLabel,
  parseBooleanAttr,
} from "@/lib/code-block-options";
import { splitCodeLines } from "@/lib/code-block-lines";

function readLanguage(pre: HTMLElement, code: HTMLElement): string {
  return (
    pre.getAttribute("data-language") ||
    Array.from(code.classList)
      .find((className) => className.startsWith("language-"))
      ?.replace(/^language-/, "") ||
    ""
  );
}

function buildLineNumberTable(lines: string[]): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "portal-code-block-table";

  const tbody = document.createElement("tbody");
  lines.forEach((line, index) => {
    const row = document.createElement("tr");

    const gutter = document.createElement("td");
    gutter.className = "portal-code-block-gutter";
    gutter.textContent = String(index + 1);

    const content = document.createElement("td");
    content.className = "portal-code-block-line";
    content.textContent = line;

    row.appendChild(gutter);
    row.appendChild(content);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

function buildCopyButton(codeText: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "portal-code-block-copy";
  button.setAttribute("aria-label", "Copy code");
  button.title = "Copy code";
  button.innerHTML = `
    <span class="portal-code-block-copy__icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect>
        <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"></path>
      </svg>
    </span>
    <span class="portal-code-block-copy__label">Copy</span>
  `;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    void (async () => {
      try {
        await navigator.clipboard.writeText(codeText);
        button.classList.add("is-copied");
        button.setAttribute("aria-label", "Copied");
        button.title = "Copied";
        const label = button.querySelector(".portal-code-block-copy__label");
        if (label) label.textContent = "Copied";
        window.setTimeout(() => {
          button.classList.remove("is-copied");
          button.setAttribute("aria-label", "Copy code");
          button.title = "Copy code";
          if (label) label.textContent = "Copy";
        }, 2000);
      } catch {
        button.classList.add("is-error");
        window.setTimeout(() => button.classList.remove("is-error"), 2000);
      }
    })();
  });

  return button;
}

/**
 * Replace editor `pre.portal-code-block` nodes with a themed shell that
 * supports language labels and optional line numbers on the published portal.
 */
export function enhanceCodeBlocksInRoot(root: ParentNode): void {
  const blocks = root.querySelectorAll<HTMLElement>(
    "pre.portal-code-block:not([data-portal-enhanced])",
  );

  blocks.forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;

    pre.setAttribute("data-portal-enhanced", "true");

    const theme = pre.getAttribute("data-theme") || "dark";
    const showLanguageLabel = parseBooleanAttr(
      pre.getAttribute("data-show-language-label"),
      false,
    );
    const showLineNumbers = parseBooleanAttr(
      pre.getAttribute("data-show-line-numbers"),
      true,
    );
    const language = readLanguage(pre, code);
    const text = code.textContent ?? "";
    const lines = splitCodeLines(text);

    const shell = document.createElement("div");
    shell.className = "portal-code-block-shell portal-code-block-shell--rendered";
    shell.setAttribute("data-theme", theme);
    if (language) {
      shell.setAttribute("data-language", language);
    }

    if (showLanguageLabel) {
      const header = document.createElement("div");
      header.className = "portal-code-block-header";
      header.textContent = codeBlockLanguageLabel(language);
      shell.appendChild(header);
    }

    const body = document.createElement("div");
    body.className = "portal-code-block-body";

    if (showLineNumbers) {
      body.appendChild(buildLineNumberTable(lines));
    } else {
      const plain = document.createElement("div");
      plain.className = "portal-code-block-body-plain";
      const codeEl = document.createElement("code");
      if (language) {
        codeEl.className = code.className || `language-${language}`;
      }
      codeEl.textContent = text;
      plain.appendChild(codeEl);
      body.appendChild(plain);
    }

    shell.appendChild(body);
    shell.appendChild(buildCopyButton(text));
    pre.replaceWith(shell);
  });
}
