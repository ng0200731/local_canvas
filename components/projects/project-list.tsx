"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FileImage,
  FolderOpen,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useQueries } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { useDeleteProject, useProjects } from "@/lib/hooks/use-projects";
import { formatDate } from "@/lib/format";
import { getCanvasStore, type Canvas, type Project } from "@/lib/store";

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Not set";
}

function formatCurrency(project: Project): string {
  if (!project.currencyCode) return "Not set";
  return project.currencySymbol
    ? `${project.currencyCode} (${project.currencySymbol})`
    : project.currencyCode;
}

function fuzzyMatch(value: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const haystack = value.toLocaleLowerCase();
  if (haystack.includes(needle)) return true;
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function getProjectSearchText(project: Project): string {
  return [
    project.customerName,
    project.employeeName,
    project.employeeTitle,
    project.employeeEmail,
    project.employeeTel,
    project.name,
    project.currencyCode,
    project.currencyName,
    project.currencySymbol,
    project.destinationCountryCode,
    project.destinationCountryName,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function ProjectCanvasDetailRow({
  project,
  canvases,
  loading,
  onOpenCanvas,
}: {
  project: Project;
  canvases: readonly Canvas[] | undefined;
  loading: boolean;
  onOpenCanvas?: (projectId: string, canvasId: string) => void;
}) {
  return (
    <tr className="bg-muted/20">
      <td colSpan={7} className="px-4 py-3">
        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-md" />
            ))}
          </div>
        ) : canvases && canvases.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {canvases.map((canvas) =>
              onOpenCanvas ? (
                <button
                  key={canvas.id}
                  type="button"
                  className="bg-background hover:border-primary/50 focus-visible:ring-ring flex items-start gap-3 rounded-md border p-3 text-left transition-colors outline-none focus-visible:ring-2"
                  onClick={() => onOpenCanvas(project.id, canvas.id)}
                >
                  <FileImage className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{canvas.name}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      Updated {formatDate(canvas.updatedAt)}
                    </span>
                  </span>
                </button>
              ) : (
                <Link
                  key={canvas.id}
                  href={`/projects/${project.id}/canvases/${canvas.id}`}
                  className="bg-background hover:border-primary/50 focus-visible:ring-ring flex items-start gap-3 rounded-md border p-3 text-left transition-colors outline-none focus-visible:ring-2"
                >
                  <FileImage className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{canvas.name}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      Updated {formatDate(canvas.updatedAt)}
                    </span>
                  </span>
                </Link>
              ),
            )}
          </div>
        ) : (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
            No canvases in this project.
          </p>
        )}
      </td>
    </tr>
  );
}

function ProjectTable({
  projects,
  onOpenProject,
  onOpenCanvas,
}: {
  projects: Project[];
  onOpenProject?: (projectId: string) => void;
  onOpenCanvas?: (projectId: string, canvasId: string) => void;
}) {
  const del = useDeleteProject();
  const [query, setQuery] = useState("");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const visibleProjects = projects.filter((project) =>
    fuzzyMatch(getProjectSearchText(project), query),
  );
  const canvasQueries = useQueries({
    queries: visibleProjects.map((project) => ({
      queryKey: ["canvases", project.id] as const,
      queryFn: () => getCanvasStore().listCanvases(project.id),
    })),
  });
  const canvasResultByProjectId = new Map(
    visibleProjects.map((project, index) => [project.id, canvasQueries[index]] as const),
  );

  async function onDelete(projectId: string) {
    await del.mutateAsync(projectId);
    toast.success("Project deleted");
  }

  return (
    <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="bg-muted/60 text-muted-foreground border-b text-xs font-medium tracking-wide uppercase">
            <tr>
              <th scope="col" colSpan={7} className="px-4 py-3">
                <div className="relative max-w-md">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Fuzzy search projects"
                    aria-label="Fuzzy search projects"
                    className="bg-background h-9 pl-8 text-sm normal-case"
                  />
                </div>
              </th>
            </tr>
            <tr>
              <th scope="col" className="px-4 py-3">
                Customer name
              </th>
              <th scope="col" className="px-4 py-3">
                Employee name
              </th>
              <th scope="col" className="px-4 py-3">
                Project name
              </th>
              <th scope="col" className="px-4 py-3">
                Currency
              </th>
              <th scope="col" className="px-4 py-3">
                Destination
              </th>
              <th scope="col" className="px-4 py-3 text-center">
                Canvas #
              </th>
              <th scope="col" className="w-28 px-4 py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleProjects.length ? (
              visibleProjects.map((project) => {
                const canvasResult = canvasResultByProjectId.get(project.id);
                const canvases = canvasResult?.data;
                const expanded = expandedProjectId === project.id;
                const count = canvases?.length ?? 0;
                return (
                  <Fragment key={project.id}>
                    <tr className="hover:bg-muted/35 transition-colors">
                      <td className="max-w-56 px-4 py-3 align-top font-medium break-words">
                        {displayValue(project.customerName)}
                      </td>
                      <td className="max-w-56 px-4 py-3 align-top break-words">
                        <span className="font-medium">{displayValue(project.employeeName)}</span>
                        {project.employeeTitle || project.employeeEmail ? (
                          <span className="text-muted-foreground mt-1 block text-xs">
                            {[project.employeeTitle, project.employeeEmail]
                              .filter(Boolean)
                              .join(" / ")}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-64 px-4 py-3 align-top">
                        {onOpenProject ? (
                          <button
                            type="button"
                            onClick={() => onOpenProject(project.id)}
                            className="focus-visible:ring-ring hover:text-primary rounded-sm text-left font-medium break-words outline-none focus-visible:ring-2"
                          >
                            {project.name}
                          </button>
                        ) : (
                          <Link
                            href={`/projects/${project.id}`}
                            className="focus-visible:ring-ring hover:text-primary rounded-sm font-medium break-words outline-none focus-visible:ring-2"
                          >
                            {project.name}
                          </Link>
                        )}
                        <span className="text-muted-foreground mt-1 block text-xs">
                          Updated {formatDate(project.updatedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">{formatCurrency(project)}</td>
                      <td className="max-w-48 px-4 py-3 align-top break-words">
                        {displayValue(project.destinationCountryName)}
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1.5 px-2"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Collapse" : "Expand"} ${project.name} canvases`}
                          onClick={() =>
                            setExpandedProjectId((current) =>
                              current === project.id ? null : project.id,
                            )
                          }
                        >
                          {expanded ? <ChevronDown /> : <ChevronRight />}
                          {canvasResult?.isLoading ? "..." : count}
                        </Button>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex justify-end gap-1">
                          {onOpenProject ? (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Open ${project.name}`}
                              onClick={() => onOpenProject(project.id)}
                            >
                              <ArrowUpRight />
                            </Button>
                          ) : (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Open ${project.name}`}
                              render={<Link href={`/projects/${project.id}`} />}
                            >
                              <ArrowUpRight />
                            </Button>
                          )}
                          <ConfirmDialog
                            title="Delete project?"
                            description="This permanently deletes the project and all of its canvases."
                            onConfirm={() => onDelete(project.id)}
                            trigger={
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Delete ${project.name}`}
                              >
                                <Trash2 />
                              </Button>
                            }
                          />
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <ProjectCanvasDetailRow
                        project={project}
                        canvases={canvases}
                        loading={Boolean(canvasResult?.isLoading)}
                        onOpenCanvas={onOpenCanvas}
                      />
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-4 py-10 text-center">
                  No matching projects.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProjectList({
  redirectOnCreate = true,
  onOpenProject,
  onOpenCanvas,
  onProjectCreated,
}: {
  redirectOnCreate?: boolean;
  onOpenProject?: (projectId: string) => void;
  onOpenCanvas?: (projectId: string, canvasId: string) => void;
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
        <div className="bg-card rounded-lg border p-3 shadow-sm">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-11 last:mb-0" />
          ))}
        </div>
      ) : isError ? (
        <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          Failed to load projects: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : projects && projects.length > 0 ? (
        <ProjectTable
          projects={projects}
          onOpenProject={onOpenProject}
          onOpenCanvas={onOpenCanvas}
        />
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
