"use client";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type IconButtonProps = Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "aria-pressed"
> & {
  label: string;
  active?: boolean;
};

export default function IconButton({
  label,
  active,
  children,
  variant,
  size = "icon",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            {...props}
            type={type}
            size={size}
            variant={variant ?? (active ? "secondary" : "ghost")}
            aria-label={label}
            aria-pressed={active}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
