import type { HTMLAttributes, PropsWithChildren } from "react";

export type PresentationAttributes<Attributes> = Attributes &
  Partial<Record<`data-${string}`, boolean | number | string | undefined>>;

interface PresentationContentProps {
  attributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
}

export function PresentationContent({
  attributes,
  children,
}: PropsWithChildren<PresentationContentProps>) {
  if (!attributes) return <>{children}</>;
  return <div {...attributes}>{children}</div>;
}
