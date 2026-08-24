"use client";

import { useRouter } from "next/navigation";
import {
  CALLSIGN_OPERATOR_KIND_FILTERS,
  CALLSIGN_PERMIT_TYPE_FILTERS,
  type OperatorKindFilter,
  type PermitTypeFilter,
} from "@/lib/callsigns-filters";

type Props = {
  q: string;
  operatorKind: OperatorKindFilter;
  permitType: PermitTypeFilter;
};

function callsignsHref(form: HTMLFormElement): string {
  const data = new FormData(form);
  const params = new URLSearchParams();
  const q = String(data.get("q") ?? "").trim();
  if (q) params.set("q", q);
  const operatorKind = String(data.get("operatorKind") ?? "all");
  if (operatorKind !== "all") params.set("operatorKind", operatorKind);
  const permitType = String(data.get("permitType") ?? "all");
  if (permitType !== "all") params.set("permitType", permitType);
  const query = params.toString();
  return query ? `/admin/callsigns?${query}` : "/admin/callsigns";
}

export function CallsignListFilters({ q, operatorKind, permitType }: Props) {
  const router = useRouter();

  function apply(form: HTMLFormElement) {
    router.push(callsignsHref(form));
  }

  return (
    <form
      key={`${q}|${operatorKind}|${permitType}`}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply(event.currentTarget);
      }}
    >
      <label className="block min-w-56 flex-1 text-sm">
        <span className="mb-1 block font-medium">Search</span>
        <input
          name="q"
          defaultValue={q}
          placeholder="XV2T or operator name"
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="block min-w-44 text-sm">
        <span className="mb-1 block font-medium">Operator type</span>
        <select
          name="operatorKind"
          defaultValue={operatorKind}
          onChange={(event) => {
            const form = event.currentTarget.form;
            if (form) apply(form);
          }}
          className="w-full rounded border border-gray-300 bg-white px-3 py-2"
        >
          {CALLSIGN_OPERATOR_KIND_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-36 text-sm">
        <span className="mb-1 block font-medium">Kind</span>
        <select
          name="permitType"
          defaultValue={permitType}
          onChange={(event) => {
            const form = event.currentTarget.form;
            if (form) apply(form);
          }}
          className="w-full rounded border border-gray-300 bg-white px-3 py-2"
        >
          {CALLSIGN_PERMIT_TYPE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
      >
        Search
      </button>
    </form>
  );
}
