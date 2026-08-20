export type LocaleHref =
  | "/"
  | "/callsigns"
  | "/account"
  | "/logbook"
  | "/qso/confirmed"
  | {
      pathname: "/news/[slug]" | "/pages/[slug]" | "/categories/[slug]";
      params: { slug: string };
    }
  | {
      pathname: "/callsigns/[sign]";
      params: { sign: string };
    }
  | {
      pathname: "/[callsign]";
      params: { callsign: string };
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

export function hamHref(callsign: string): LocaleHref {
  return { pathname: "/[callsign]", params: { callsign } };
}

export function localeHrefKey(href: LocaleHref): string {
  if (typeof href === "string") return href;
  if (href.pathname === "/callsigns/[sign]") return href.params.sign;
  if (href.pathname === "/[callsign]") return href.params.callsign;
  return href.params.slug;
}
