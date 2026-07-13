import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const decisionSchema = z.enum(["approved", "rejected"]);
const responseSchema = z.object({
  sequence: z.string(),
  status: z.enum(["approved", "rejected"]),
  alreadyResponded: z.boolean().optional(),
});

export const runtime = "nodejs";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resultPage(input: {
  sequence: string;
  status: "approved" | "rejected";
  alreadyResponded: boolean;
  redirectUrl: string;
}) {
  const title = input.alreadyResponded
    ? "Link already used"
    : input.status === "approved"
      ? "Approval confirmed"
      : "Reject recorded";
  const accent = input.status === "approved" ? "#166534" : "#991b1b";
  const statusLine = input.alreadyResponded
    ? `This link is deactivated because canvas send <strong>${escapeHtml(
        input.sequence,
      )}</strong> was already <strong>${escapeHtml(input.status)}</strong>.`
    : `Canvas send <strong>${escapeHtml(input.sequence)}</strong> is now <strong>${escapeHtml(
        input.status,
      )}</strong>.`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f7f5;color:#171717;font-family:Arial,sans-serif}
    main{width:min(92vw,480px);border:1px solid #ddd;background:#fff;border-radius:12px;padding:28px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.08)}
    .mark{width:54px;height:54px;margin:0 auto 16px;border-radius:999px;background:${accent};color:#fff;display:grid;place-items:center;font-size:28px;font-weight:700}
    h1{margin:0 0 8px;font-size:24px}
    p{margin:0;color:#666;line-height:1.6}
    strong{color:#111}
    a{color:${accent};font-weight:700}
  </style>
</head>
<body>
  <main>
    <div class="mark">${input.status === "approved" ? "OK" : "NO"}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${statusLine}</p>
    <p>Returning to the project table in <strong id="count">5</strong> seconds.</p>
    <p><a href="${escapeHtml(input.redirectUrl)}">Go now</a></p>
  </main>
  <script>
    let count = 5;
    const target = ${JSON.stringify(input.redirectUrl)};
    const node = document.getElementById("count");
    const timer = window.setInterval(() => {
      count -= 1;
      if (node) node.textContent = String(Math.max(0, count));
      if (count <= 0) {
        window.clearInterval(timer);
        window.location.replace(target);
      }
    }, 1000);
  </script>
</body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const decision = decisionSchema.safeParse(url.searchParams.get("decision"));
  if (!token || !decision.success) {
    return NextResponse.json({ error: "Invalid approval link." }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const response = await supabase.rpc("respond_canvas_send", {
      p_status: decision.data,
      p_token: token,
    });
    if (response.error) throw new Error(response.error.message);

    const send = responseSchema.parse(response.data);
    return new NextResponse(
      resultPage({
        sequence: send.sequence,
        status: send.status,
        alreadyResponded: send.alreadyResponded ?? false,
        redirectUrl: `${url.origin}/projects`,
      }),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval update failed." },
      { status: 500 },
    );
  }
}
