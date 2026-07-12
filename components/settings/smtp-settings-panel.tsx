import { Mail, Server, ShieldCheck } from "lucide-react";

import { SettingsPanelHeader } from "./settings-panel-header";

const providers = [
  {
    label: "Primary",
    name: "163.com",
    server: "smtp.163.com",
    port: "465 SSL",
    username: "SMTP_163_USERNAME",
    password: "SMTP_163_PASSWORD",
  },
  {
    label: "Backup",
    name: "Gmail",
    server: "smtp.gmail.com",
    port: "587 TLS",
    username: "SMTP_GMAIL_USERNAME",
    password: "SMTP_GMAIL_PASSWORD",
  },
] as const;

export function SmtpSettingsPanel() {
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6">
      <SettingsPanelHeader
        title="SMTP delivery"
        description="Outbound email credentials remain in server-side environment variables. The workspace uses 163.com as its primary provider and Gmail as backup."
      />

      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/40 grid gap-px md:grid-cols-2">
          {providers.map((provider) => (
            <article key={provider.name} className="bg-background p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="bg-secondary text-secondary-foreground grid size-9 place-items-center rounded-md">
                  <Mail className="size-4" />
                </span>
                <div>
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    {provider.label}
                  </p>
                  <h3 className="font-semibold">{provider.name}</h3>
                </div>
              </div>
              <dl className="grid gap-3 text-sm">
                <div className="grid grid-cols-[7rem_1fr] items-center gap-3 border-t pt-3">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <Server className="size-3.5" /> Server
                  </dt>
                  <dd className="text-right font-medium">{provider.server}</dd>
                </div>
                <div className="grid grid-cols-[7rem_1fr] items-center gap-3 border-t pt-3">
                  <dt className="text-muted-foreground">Port</dt>
                  <dd className="text-right font-medium">{provider.port}</dd>
                </div>
                <div className="grid grid-cols-[7rem_1fr] items-center gap-3 border-t pt-3">
                  <dt className="text-muted-foreground">Username</dt>
                  <dd className="truncate text-right font-mono text-xs">{provider.username}</dd>
                </div>
                <div className="grid grid-cols-[7rem_1fr] items-center gap-3 border-t pt-3">
                  <dt className="text-muted-foreground">Password</dt>
                  <dd className="truncate text-right font-mono text-xs">{provider.password}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>

      <div className="bg-muted/35 flex items-start gap-3 rounded-lg border p-4 text-sm leading-6">
        <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
        <p>
          Configure these names in Vercel Project Settings under Environment Variables. Email
          credentials must never use the <span className="font-mono text-xs">NEXT_PUBLIC_</span>{" "}
          prefix.
        </p>
      </div>
    </section>
  );
}
