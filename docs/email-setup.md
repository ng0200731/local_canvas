# SMTP email setup

Canvas Send and the test-email form use server-side SMTP. The browser never receives SMTP
credentials. Real delivery uses 163.com first and Gmail as the fallback. An optional local SMTP
catcher overrides both when configured. When Supabase authentication is enabled, email endpoints
require a signed-in user.

## Vercel environment variables

Open the Vercel project, then go to **Settings → Environment Variables**. Add one or both complete
credential pairs to the environments that need email delivery:

```text
SMTP_LOCAL_HOST=127.0.0.1
SMTP_LOCAL_PORT=1025
SMTP_LOCAL_SECURE=false

SMTP_163_USERNAME=sender@163.com
SMTP_163_PASSWORD=<163 SMTP authorization password>

SMTP_GMAIL_USERNAME=sender@gmail.com
SMTP_GMAIL_PASSWORD=<Google App Password>

SMTP_FROM_NAME=Infinite Canvas
```

`SMTP_FROM_NAME` is optional. Never add `NEXT_PUBLIC_` to any SMTP variable. After adding or changing
variables, redeploy the Vercel deployment; an existing deployment does not receive later environment
changes.

## Optional local SMTP catcher

For local development, run an SMTP catcher such as Mailpit or MailHog and set:

```text
SMTP_LOCAL_HOST=127.0.0.1
SMTP_LOCAL_PORT=1025
SMTP_LOCAL_SECURE=false
```

Restart `pnpm dev` after editing `.env.local`. When these two values are present, Canvas Send and
the test email use the catcher first. If the catcher is unavailable, the app continues to 163.com
and Gmail when those credentials are configured. Leave the `SMTP_LOCAL_*` values blank to send from
the local app through the real 163.com-to-Gmail provider chain.

## Configure 163.com (primary)

1. Sign in at [mail.163.com](https://mail.163.com/).
2. Open **Settings**, find the POP3/SMTP/IMAP service settings, and enable SMTP.
3. Complete any phone/security confirmation requested by 163.com.
4. Generate or copy the SMTP **authorization password**.
5. Set `SMTP_163_USERNAME` to the full 163.com mailbox and `SMTP_163_PASSWORD` to the authorization
   password. Do not use the normal webmail password.

The app connects to `smtp.163.com` on port `465` with SSL/TLS.

## Configure Gmail (backup)

1. Turn on **2-Step Verification** for the Google account.
2. Open the Google Account **App passwords** page and create an App Password for Mail. Google only
   exposes App Passwords after 2-Step Verification is active and may restrict them for managed
   Workspace accounts.
3. Set `SMTP_GMAIL_USERNAME` to the full Gmail address and `SMTP_GMAIL_PASSWORD` to the generated
   16-character App Password. Do not use the normal Google password.

The app connects to `smtp.gmail.com` on port `587` and requires STARTTLS. Gmail is attempted only
when 163.com cannot deliver the message. Each SMTP attempt uses 10-second connection, greeting, and
socket timeouts.

## Local setup and verification

Copy `.env.example` to `.env.local`, fill in local SMTP or one complete remote pair, and restart
`pnpm dev`. Then open **Settings → SMTP setting**, enter an address you can inspect, and select
**Send test email**.

If the test fails:

- confirm that both variables for the provider are present;
- confirm that the value is an authorization/App Password, not the account password;
- restart the local server or redeploy Vercel after changing variables;
- check spam/junk folders and the provider's outbound-email security notices;
- confirm that the provider has not blocked the server's sign-in as suspicious.

Canvas Send sends an HTML canvas report and attaches a PDF copy. Hosted image URLs are embedded or
listed without server-side fetching, so email delivery does not read arbitrary remote image URLs.
