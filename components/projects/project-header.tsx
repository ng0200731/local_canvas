"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useProject } from "@/lib/hooks/use-projects";

export function ProjectHeader({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProject(projectId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-64" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Project</p>
      <h1 className="text-3xl font-semibold tracking-tight">{project?.name ?? "Project"}</h1>
      {project?.description && (
        <p className="text-muted-foreground max-w-2xl text-sm leading-6">{project.description}</p>
      )}
    </div>
  );
}
