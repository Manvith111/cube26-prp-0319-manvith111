"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

const PLATFORM = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/evidence", label: "Evidence Log", icon: "▤" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

const MANAGERS = [
  { href: "/prep", label: "Prep Manager", tag: "Judged", planned: false, icon: "✶" },
  { href: "/recovery", label: "Recovery Manager", tag: "Stretch", planned: false, icon: "↺" },
  { href: "/pack", label: "Pack Manager", tag: "Planned", planned: true, icon: "▣" },
  { href: "/receiving", label: "Receiving Manager", tag: "Planned", planned: true, icon: "⇥" },
  { href: "/returns", label: "Returns Manager", tag: "Planned", planned: true, icon: "⇤" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname() || "/";

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[color-mix(in_oklab,var(--panel-2)_88%,transparent)] backdrop-blur-xl">
      <div className="px-5 py-5">
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--grad-2)] via-[var(--grad-1)] to-[var(--accent)] font-black text-[var(--accent-ink)] shadow-[0_8px_24px_-8px_var(--glow)] transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
            <span className="text-lg drop-shadow">O</span>
          </div>
          <div>
            <div className="text-sm font-bold leading-tight tracking-tight">OpsConsole</div>
            <div className="text-[11px] text-[var(--muted)]">one evidence chain</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        <SectionLabel>Platform</SectionLabel>
        {PLATFORM.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}

        <div className="h-4" />
        <SectionLabel>Managers</SectionLabel>
        {MANAGERS.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      <div className="space-y-3 border-t border-[var(--border)] px-4 py-4">
        <ThemeToggle />
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          The AI observes. Fixed rules decide. Every verdict cites a photo and a rule.
        </p>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
      {children}
    </div>
  );
}

function NavItem({
  href,
  label,
  active,
  tag,
  planned,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  tag?: string;
  planned?: boolean;
  icon?: string;
}) {
  return (
    <Link
      href={href}
      className={`group relative mb-1 flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
        active
          ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--text)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]"
          : "text-[var(--muted)] hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)] hover:text-[var(--text)]"
      }`}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_2px_var(--glow)]" />
      ) : null}
      <span className="flex items-center gap-2.5">
        <span
          className={`text-[13px] transition-transform duration-200 group-hover:scale-110 ${
            active ? "text-[var(--accent)]" : "text-[var(--muted)]"
          }`}
        >
          {icon}
        </span>
        <span className="font-medium">{label}</span>
      </span>
      {tag ? (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            planned
              ? "bg-[color-mix(in_oklab,var(--muted)_22%,transparent)] text-[var(--muted)]"
              : tag === "Judged"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-sky-500/20 text-sky-400"
          }`}
        >
          {tag}
        </span>
      ) : null}
    </Link>
  );
}
