import type { ReactNode } from "react";

export function SettingsPanelHeader({
  eyebrow = "Settings",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
