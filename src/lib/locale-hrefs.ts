export type LocaleHref =
  | "/"
  | "/callsigns"
  | {
      pathname: "/news/[slug]" | "/pages/[slug]" | "/categories/[slug]";
      params: { slug: string };
    }
  | {
      pathname: "/callsigns/[sign]";
      params: { sign: string };
    };

export function pageHref(slug: string): LocaleHref {
  return { pathname: "/pages/[slug]", params: { slug } };
}

export function newsHref(slug: string): LocaleHref {
  return { pathname: "/news/[slug]", params: { slug } };
}

export function categoryHref(slug: string): LocaleHref {
  return { pathname: "/categories/[slug]", params: { slug } };
}

export function callsignHref(sign: string): LocaleHref {
  return { pathname: "/callsigns/[sign]", params: { sign } };
}

export function localeHrefKey(href: LocaleHref): string {
  if (typeof href === "string") return href;
  if (href.pathname === "/callsigns/[sign]") return href.params.sign;
  return href.params.slug;
}
