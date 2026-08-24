"use client";

import { useState } from "react";

type Props = {
  src: string | null;
  label: string;
  compact?: boolean;
};

function initialsFromLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed || trimmed === "—") return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function AdminTextAvatar({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  const sizeClass = compact ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[10px]";
  return (
    <span
      className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full bg-gray-200 font-medium text-gray-600`}
      aria-hidden
    >
      {initialsFromLabel(label)}
    </span>
  );
}

export function AdminAuthorAvatar({ src, label, compact = false }: Props) {
  const [failed, setFailed] = useState(false);
  const sizeClass = compact ? "h-5 w-5" : "h-7 w-7";

  if (!src || failed) {
    return <AdminTextAvatar label={label} compact={compact} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote OAuth/Gravatar URLs
    <img
      src={src}
      alt=""
      className={`${sizeClass} shrink-0 rounded-full bg-gray-100 object-cover`}
      onError={() => setFailed(true)}
    />
  );
}
