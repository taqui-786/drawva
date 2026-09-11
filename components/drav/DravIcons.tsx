import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FavouriteIcon, Comment01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface IconProps {
  filled?: boolean;
  className?: string;
  size?: number | string;
}

export function DravLikeIcon({ filled, className }: IconProps) {
  if (filled) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn("size-3.5 fill-current", className)}
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  return (
    <HugeiconsIcon
      icon={FavouriteIcon}
      className={cn("size-3.5", className)}
    />
  );
}

export function DravCommentIcon({ filled, className }: IconProps) {
  if (filled) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn("size-3.5 fill-current", className)}
      >
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
      </svg>
    );
  }
  return (
    <HugeiconsIcon
      icon={Comment01Icon}
      className={cn("size-3.5", className)}
    />
  );
}
