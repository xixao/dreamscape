import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-control)] text-[length:var(--type-control-size)] font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        bare: "",
      },
      size: {
        default: "min-h-[var(--control-height-standard)] px-[var(--space-4)] py-[var(--space-2)] has-[>svg]:px-[var(--space-3)]",
        xs: "min-h-6 gap-[var(--space-1)] px-[var(--space-2)] text-xs has-[>svg]:px-[var(--space-1)] [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-[var(--control-height-compact)] gap-[var(--space-1)] px-[var(--space-3)] has-[>svg]:px-[var(--space-2)]",
        lg: "min-h-12 px-[var(--space-5)] py-[var(--space-3)] has-[>svg]:px-[var(--space-4)]",
        icon: "size-[var(--control-height-standard)] p-0",
        "icon-xs": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[var(--control-height-compact)] p-0",
        "icon-lg": "size-11 p-0",
        auto: "h-auto min-w-0 items-start justify-start gap-[var(--space-2)] p-0 whitespace-normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type = "button",
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      type={type}
      {...props}
    />
  )
}

export { Button, buttonVariants }
