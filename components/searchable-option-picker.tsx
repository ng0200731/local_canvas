"use client";

import { useId, useState, type FocusEvent } from "react";
import { Check, Heart, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
  isFavorite?: boolean;
}

export function fuzzyOptionMatch(option: SearchableOption, query: string): boolean {
  const needle = query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!needle) return true;
  const haystack = [option.label, option.description, option.searchText]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
  if (haystack.includes(needle)) return true;

  let queryIndex = 0;
  for (const character of haystack) {
    if (character === needle[queryIndex]) queryIndex += 1;
    if (queryIndex === needle.length) return true;
  }
  return false;
}

interface SearchableOptionPickerProps {
  id?: string;
  query: string;
  value: string | null;
  options: readonly SearchableOption[];
  placeholder: string;
  emptyMessage: string;
  noMatchesMessage?: string;
  loading?: boolean;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  onQueryChange: (query: string) => void;
  onValueChange: (value: string | null) => void;
}

export function SearchableOptionPicker({
  id,
  query,
  value,
  options,
  placeholder,
  emptyMessage,
  noMatchesMessage = "No matching options.",
  loading = false,
  error = false,
  disabled = false,
  autoFocus = false,
  className,
  onQueryChange,
  onValueChange,
}: SearchableOptionPickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-options`;
  const [open, setOpen] = useState(false);
  const visibleOptions = options
    .filter((option) => fuzzyOptionMatch(option, query))
    .sort((left, right) => Number(Boolean(right.isFavorite)) - Number(Boolean(left.isFavorite)));

  function closeWhenFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  return (
    <div className={cn("relative", className)} onBlur={closeWhenFocusLeaves}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2" />
      <Input
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-invalid={error}
        autoFocus={autoFocus}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        className="h-10 pl-9"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onQueryChange(event.target.value);
          onValueChange(null);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />

      {open && !disabled ? (
        <div
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground absolute top-[calc(100%+0.35rem)] right-0 left-0 z-50 max-h-64 overflow-y-auto rounded-lg border p-1 shadow-lg"
        >
          {loading ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">Loading options...</p>
          ) : error ? (
            <p className="text-destructive px-3 py-4 text-sm">Unable to load options.</p>
          ) : options.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">{emptyMessage}</p>
          ) : visibleOptions.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">{noMatchesMessage}</p>
          ) : (
            visibleOptions.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "hover:bg-accent focus-visible:bg-accent focus-visible:ring-ring flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2",
                    selected && "bg-accent/70",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onValueChange(option.value);
                    onQueryChange(option.label);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {option.isFavorite ? (
                        <Heart className="size-3 shrink-0 fill-current text-rose-500" />
                      ) : null}
                      <span className="block truncate font-medium">{option.label}</span>
                    </span>
                    {option.description ? (
                      <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {selected ? <Check className="text-primary mt-0.5 size-4 shrink-0" /> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
