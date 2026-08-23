import { z } from "zod";

export const operationSchema = z.enum([
  "language.generate",
  "language.stream",
  "image.generate",
  "image.edit",
  "video.generate",
  "video.status",
  "video.cancel",
  "files.upload",
  "search.ground",
]);

export type Operation = z.infer<typeof operationSchema>;
