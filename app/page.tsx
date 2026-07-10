import { WorkspaceShell } from "@/components/welcome/workspace-shell";
import { isSupabaseConfigured, isXiangsuConfigured } from "@/lib/env";

export default function Home() {
  return (
    <WorkspaceShell
      isSupabaseConfigured={isSupabaseConfigured}
      isImageGenerationConfigured={isXiangsuConfigured}
    />
  );
}
