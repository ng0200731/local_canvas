"use client";

import { FolderOpen } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";
import { useProjects } from "@/lib/hooks/use-projects";

export function ProjectList({
  redirectOnCreate = true,
  onOpenProject,
  onProjectCreated,
}: {
  redirectOnCreate?: boolean;
  onOpenProject?: (projectId: string) => void;
  onProjectCreated?: (projectId: string) => void;
}) {
  const { data: projects, isLoading, isError, error } = useProjects();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Workspace
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Organize canvases for products, suppliers, customers, and image workflows.
          </p>
        </div>
        <CreateProjectDialog
          redirectOnCreate={redirectOnCreate}
          onCreated={(project) => onProjectCreated?.(project.id)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          Failed to load projects: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={onOpenProject} />
          ))}
        </div>
      ) : (
        <div className="bg-card flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center shadow-sm">
          <div className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-lg">
            <FolderOpen className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-base font-medium">No projects yet</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Create your first project to start arranging canvas nodes.
            </p>
          </div>
          <CreateProjectDialog
            redirectOnCreate={redirectOnCreate}
            onCreated={(project) => onProjectCreated?.(project.id)}
          />
        </div>
      )}
    </div>
  );
}
