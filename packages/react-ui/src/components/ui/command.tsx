"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";
import { Dialog, DialogTitle } from "./dialog";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground",
      "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1",
      "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase",
      "[&_[cmdk-group]]:px-1.5",
      "[&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4",
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

interface CommandDialogProps extends DialogProps {}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-[18vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2",
            "overflow-hidden rounded-xl border border-neutral-200/80 bg-popover shadow-2xl shadow-black/10",
            "dark:border-neutral-800 dark:shadow-black/40",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98",
            "duration-150",
          )}
        >
          <DialogTitle className="sr-only">Command Menu</DialogTitle>
          <Command>{children}</Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
};

interface CommandInputProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> {
  /** Optional right-side adornment (e.g. an Esc kbd hint). */
  rightSlot?: React.ReactNode;
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  CommandInputProps
>(({ className, rightSlot, ...props }, ref) => (
  <div
    className="flex h-11 items-center gap-2 border-b border-border/60 px-3"
    cmdk-input-wrapper=""
  >
    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-full w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
    {rightSlot}
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      "scrollbar-thin max-h-[420px] overflow-y-auto overflow-x-hidden p-1.5",
      className,
    )}
    {...props}
  />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-8 text-center text-sm text-muted-foreground"
    {...props}
  />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn("overflow-hidden text-foreground", className)}
    {...props}
  />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("mx-2 my-1 h-px bg-border/60", className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground outline-hidden",
      "aria-selected:bg-accent aria-selected:text-accent-foreground",
      "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
      "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
      "aria-selected:[&_svg]:text-foreground",
      className,
    )}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

/**
 * Reusable kbd chip used inside the command bar (input hint, item shortcut, footer).
 * Mirrors the SidebarFinder styling so all command surfaces share the same key visual.
 */
const CommandKbd = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) => (
  <kbd
    className={cn(
      "pointer-events-none flex h-5 min-w-5 select-none items-center justify-center rounded border border-neutral-200 bg-neutral-50 px-1.5 font-medium text-[10px] text-muted-foreground",
      "dark:border-neutral-700 dark:bg-neutral-800",
      className,
    )}
    {...props}
  />
);
CommandKbd.displayName = "CommandKbd";

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn("ml-auto text-xs text-muted-foreground", className)}
    {...props}
  />
);
CommandShortcut.displayName = "CommandShortcut";

/**
 * Bottom hint bar — `↑↓ navigate · ↵ select · esc close`.
 * Renders inside CommandDialog after CommandList to give the palette
 * a finished, Vercel-style feel.
 */
const CommandFooter = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex h-9 items-center gap-3 border-t border-border/60 bg-muted/30 px-3 text-[11px] text-muted-foreground",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <span className="flex items-center gap-1.5">
          <CommandKbd>↑</CommandKbd>
          <CommandKbd>↓</CommandKbd>
          navigate
        </span>
        <span className="flex items-center gap-1.5">
          <CommandKbd>↵</CommandKbd>
          select
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <CommandKbd>esc</CommandKbd>
          close
        </span>
      </>
    )}
  </div>
);
CommandFooter.displayName = "CommandFooter";

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
  CommandKbd,
  CommandFooter,
};
