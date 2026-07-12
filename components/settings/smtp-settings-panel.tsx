"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Mail, Send, Server, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendTestEmail } from "@/lib/email/client";
import { emailRecipientSchema } from "@/lib/email/schemas";

import { SettingsPanelHeader } from "./settings-panel-header";

const providers = [
  {
    label: "Optional override",
    name: "Local catcher",
    server: "SMTP_LOCAL_HOST",
    port: "SMTP_LOCAL_PORT",
    username: "SMTP_LOCAL_USERNAME",
    password: "SMTP_LOCAL_PASSWORD",
  },
  {
    label: "Primary",
    name: "163.com",
    server: "smtp.163.com",
    port: "465 / SSL",
    username: "SMTP_163_USERNAME",
    password: "SMTP_163_PASSWORD",
  },
  {
    label: "Backup",
    name: "Gmail",
    server: "smtp.gmail.com",
    port: "587 / STARTTLS",
    username: "SMTP_GMAIL_USERNAME",
    password: "SMTP_GMAIL_PASSWORD",
  },
] as const;

const setupSteps = [
  {
    name: "Local catcher (optional)",
    steps: [
      "For local testing, run Mailpit, MailHog, or another local SMTP catcher.",
      "Set SMTP_LOCAL_HOST and SMTP_LOCAL_PORT in .env.local. SMTP_LOCAL_SECURE defaults to false.",
      "Leave these variables blank to send from the local app through 163.com, then Gmail.",
    ],
  },
  {
    name: "163.com (primary)",
    steps: [
      "Sign in to mail.163.com, open Settings, then enable the SMTP service under POP3/SMTP/IMAP.",
      "Generate an authorization password. Do not use the normal 163.com account password.",
      "Set SMTP_163_USERNAME to the complete 163.com email address and SMTP_163_PASSWORD to that authorization password.",
    ],
  },
  {
    name: "Gmail (backup)",
    steps: [
      "Enable 2-Step Verification on the Google account, then create an App Password for Mail.",
      "Set SMTP_GMAIL_USERNAME to the complete Gmail address and SMTP_GMAIL_PASSWORD to the 16-character App Password.",
      "Gmail uses required STARTTLS on port 587 and is attempted only if 163.com cannot deliver.",
    ],
  },
] as const;

export function SmtpSettingsPanel() {
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);

  async function handleTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedRecipient = emailRecipientSchema.safeParse(recipient);
    if (!parsedRecipient.success) {
      toast.error(parsedRecipient.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }

    setSending(true);
    try {
      const result = await sendTestEmail({ to: parsedRecipient.data });
      toast.success(
        `Test email accepted by ${
          result.provider === "local"
            ? "Local SMTP"
            : result.provider === "163"
              ? "163.com"
              : "Gmail"
        }.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test email failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6">
      <SettingsPanelHeader
        title="SMTP delivery"
        description="Send a real test message using 163.com first and Gmail as fallback. An optional local SMTP catcher can override real delivery."
      />

      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/40 grid gap-px md:grid-cols-3">
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

      <form onSubmit={(event) => void handleTest(event)} className="rounded-lg border p-5">
        <div className="flex items-start gap-3">
          <span className="bg-secondary text-secondary-foreground grid size-9 shrink-0 place-items-center rounded-md">
            <Send className="size-4" />
          </span>
          <div>
            <h3 className="font-semibold">Send a test email</h3>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              This performs a real SMTP delivery using the same primary and backup flow as Canvas
              Send.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="smtp-test-recipient">Recipient email</Label>
            <Input
              id="smtp-test-recipient"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              disabled={sending}
              required
            />
          </div>
          <Button type="submit" disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {sending ? "Sending..." : "Send test email"}
          </Button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        {setupSteps.map((provider) => (
          <article key={provider.name} className="rounded-lg border p-5">
            <h3 className="font-semibold">{provider.name}</h3>
            <ol className="text-muted-foreground mt-3 grid list-decimal gap-2 pl-5 text-sm leading-6">
              {provider.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>

      <div className="bg-muted/35 flex items-start gap-3 rounded-lg border p-4 text-sm leading-6">
        <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
        <div>
          <p>
            In Vercel, open Project Settings → Environment Variables, add one complete credential
            pair, and redeploy. Add local SMTP variables only for a local catcher, and add both
            remote pairs to enable 163.com-to-Gmail fallback. You may also set{" "}
            <span className="font-mono text-xs">SMTP_FROM_NAME</span> for the sender display name.
          </p>
          <p className="mt-2">
            Email credentials must never use the{" "}
            <span className="font-mono text-xs">NEXT_PUBLIC_</span> prefix and must not be entered
            in the browser.
          </p>
        </div>
      </div>
    </section>
  );
}
