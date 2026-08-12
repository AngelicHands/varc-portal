import type { ReactNode } from "react";
import { contentFontStyle } from "@/lib/fonts";

type Props = {
  fontFamily?: string | null;
  className?: string;
  children: ReactNode;
};

/** Scopes a page font so headings, prose, forms, and blocks inherit the same family. */
export function PageFontScope({ fontFamily, className, children }: Props) {
  const normalized = (fontFamily ?? "default").trim() || "default";
  const style = contentFontStyle(normalized);
  const classes = ["page-font-scope", className].filter(Boolean).join(" ");

  if (normalized === "default" || !Object.keys(style).length) {
    if (!className) return <>{children}</>;
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={classes} data-page-font={normalized} style={style}>
      {children}
    </div>
  );
}
