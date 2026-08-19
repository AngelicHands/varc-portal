import NextLink from "next/link";

type Props = {
  href: string;
  label: string;
};

/** Admin-only shortcut from a public CMS page. */
export function PageEditButton({ href, label }: Props) {
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 md:right-6">
      <NextLink
        href={href}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1.5 text-sm text-foreground shadow-[0_8px_24px_rgb(15_23_42/0.08)] transition hover:border-foreground/20 hover:bg-background"
        aria-label={label}
        title={label}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        <span>{label}</span>
      </NextLink>
    </div>
  );
}
