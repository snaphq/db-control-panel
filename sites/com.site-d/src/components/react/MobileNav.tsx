import { useState } from "react";

interface MobileNavProps {
  links: readonly { label: string; href: string }[];
}

/** Client island: responsive menu toggle for the public header. */
export default function MobileNav({ links }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        aria-expanded={open}
        aria-label="Toggle navigation"
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        Menu
      </button>
      {open ? (
        <nav className="absolute inset-x-0 top-16 border-b border-zinc-200 bg-white p-4">
          <ul className="flex flex-col gap-3 text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
