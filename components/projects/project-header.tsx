"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ProjectMetadataSummary } from "@/components/projects/project-metadata-summary";
import { useProject } from "@/lib/hooks/use-projects";
import { cn } from "@/lib/utils";

export function ProjectHeader({
  projectId,
  stickyTopClassName = "top-14",
}: {
  projectId: string;
  stickyTopClassName?: string;
}) {
  const { data: project, isLoading } = useProject(projectId);

  if (isLoading) {
    return (
      <div
        className={cn(
          "bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky z-20 flex flex-col gap-2 border-b py-3 backdrop-blur",
          stickyTopClassName,
        )}
      >
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-64" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky z-20 flex flex-col gap-2 border-b py-3 backdrop-blur",
        stickyTopClassName,
      )}
    >
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Project</p>
      <h1 className="text-3xl font-semibold tracking-tight">{project?.name ?? "Project"}</h1>
      {project ? <ProjectMetadataSummary project={project} className="mt-2" /> : null}
    </div>
  );
}
