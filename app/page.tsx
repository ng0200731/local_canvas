import { WorkspaceShell } from "@/components/welcome/workspace-shell";
import { isFalConfigured, isSupabaseConfigured } from "@/lib/env";

export default function Home() {
  return (
    <WorkspaceShell
      isSupabaseConfigured={isSupabaseConfigured}
      isFalConfigured={isFalConfigured}
    />
  );
}
