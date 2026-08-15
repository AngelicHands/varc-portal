import { Link } from "@/i18n/navigation";

type Props = {
  locale: string;
  query: string;
  placeholder: string;
  submitLabel: string;
  clearLabel: string;
};

export function CallsignSearchForm({
  locale,
  query,
  placeholder,
  submitLabel,
  clearLabel,
}: Props) {
  return (
    <form
      action={`/${locale}/callsigns`}
      method="get"
      role="search"
      className="mt-10"
    >
      <label htmlFor="callsign-q" className="sr-only">
        {placeholder}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <input
          id="callsign-q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          minLength={2}
          autoFocus
          className="min-h-12 flex-1 rounded-none border-0 border-b border-foreground/25 bg-transparent px-0 py-3 font-display text-xl tracking-wide text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent"
        />
        <button
          type="submit"
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-white transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-foreground"
        >
          {submitLabel}
        </button>
      </div>
      {query ? (
        <p className="mt-3">
          <Link
            href="/callsigns"
            className="text-sm text-muted transition hover:text-accent"
          >
            {clearLabel}
          </Link>
        </p>
      ) : null}
    </form>
  );
}
