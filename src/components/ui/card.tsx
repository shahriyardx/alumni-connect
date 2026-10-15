import { cn } from "@/lib/cn";
import { stateLayer } from "./styles";

const variants = {
  filled: "bg-surface-container-highest",
  elevated: "bg-surface-container-low shadow-elevation-1",
  outlined: "border border-outline-variant bg-surface",
};

export function Card({
  variant = "filled",
  interactive,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: keyof typeof variants;
  interactive?: boolean;
}) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-[28px] text-on-surface",
        variants[variant],
        interactive &&
          cn(
            stateLayer,
            "cursor-pointer transition-[scale,box-shadow,border-radius] duration-300 ease-[var(--ease-spring)] hover:shadow-elevation-2 active:scale-[0.99] active:rounded-[24px]",
          ),
        className,
      )}
    />
  );
}
