import { z } from "zod";

/** 需求反馈（意见征集）Schema */

export const submitFeedbackSchema = z.object({
  source: z.string().trim().min(1).max(100),
  content: z.string().trim().min(5, "请至少写 5 个字").max(2000, "最多 2000 字"),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
