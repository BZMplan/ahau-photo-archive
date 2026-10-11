import { ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="bg-muted/20 flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
      <div className="bg-background text-muted-foreground mb-6 flex size-16 items-center justify-center rounded-lg border">
        <ImageIcon className="size-6" strokeWidth={1.25} aria-hidden="true" />
      </div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-muted-foreground mt-3 max-w-md text-sm leading-7">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
