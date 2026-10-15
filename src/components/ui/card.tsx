import { cn } from "@/lib/cn";
import { focusRing } from "./styles";

export function Card({
  variant: _legacy,
  interactive,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** Legacy M3 names; every variant renders the one minimal card. */
  variant?: "filled" | "elevated" | "outlined";
  interactive?: boolean;
}) {
  return (
    <div
      {...props}
      className={cn(
        "relative rounded-3xl bg-surface text-foreground",
        interactive &&
          cn(
            focusRing,
            "cursor-pointer transition-[background-color,box-shadow] duration-150 ease-out hover:shadow-sm hover:shadow-black/5",
          ),
        className,
      )}
    />
  );
}
