import { type ClassNameValue, twMerge } from "tailwind-merge";

/** Joins classes; later Tailwind utilities override earlier conflicting ones. */
export const cn = (...c: ClassNameValue[]) => twMerge(c);
