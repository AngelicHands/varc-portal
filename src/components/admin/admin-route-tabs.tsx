import Link from "next/link";

type Tab = {
  id: string;
  label: string;
  href: string;
};

export function AdminRouteTabs({
  tabs,
  active,
}: {
  tabs: Tab[];
  active: string;
}) {
  return (
    <div className="mt-6 flex gap-1 border-b border-gray-200">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              selected
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
