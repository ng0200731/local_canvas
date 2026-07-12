"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function OrderButton({
  label,
  disabled,
  onClick,
  direction,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  direction: "up" | "down";
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {direction === "up" ? <ArrowUp /> : <ArrowDown />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function OrderControls({
  label,
  index,
  total,
  disabled = false,
  onMove,
}: {
  label: string;
  index: number;
  total: number;
  disabled?: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${label} sequence controls`}>
      <OrderButton
        label={`Move ${label} up`}
        direction="up"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      />
      <OrderButton
        label={`Move ${label} down`}
        direction="down"
        disabled={disabled || index >= total - 1}
        onClick={() => onMove(1)}
      />
    </div>
  );
}
