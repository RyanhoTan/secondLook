import { z } from "zod";

export const issueLabels = {
  RECRUITMENT: "招聘描述",
  PAY: "薪酬约定",
  WORK: "工作安排",
  SERVICE: "服务体验",
  TASTE: "口味体验",
  PRICING: "收费说明",
  QUEUE: "排队服务",
  HYGIENE: "卫生体验",
  PROMOTION: "宣传信息",
  FACILITIES: "设施体验",
  ORDER: "服务秩序",
  INFORMATION: "信息差异",
} as const;
export type IssueType = keyof typeof issueLabels;
export const categoryIssues = {
  COMPANY: ["RECRUITMENT", "PAY", "WORK", "SERVICE"],
  RESTAURANT: ["TASTE", "PRICING", "QUEUE", "HYGIENE"],
  ATTRACTION: ["PROMOTION", "PRICING", "FACILITIES", "ORDER"],
  OTHER: ["INFORMATION", "PRICING", "SERVICE"],
} as const satisfies Record<string, readonly IssueType[]>;
export const issueTypeSchema = z.enum(
  Object.keys(issueLabels) as [IssueType, ...IssueType[]],
);
// Canonical ordering makes retries independent of the order of checkbox clicks.
export const issueTypesSchema = z
  .array(issueTypeSchema)
  .max(4, "最多选择 4 个问题类型")
  .refine((v) => new Set(v).size === v.length, "问题类型不能重复")
  .transform((v) => [...v].sort());
export function issuesMatchCategory(
  category: string,
  issues: readonly IssueType[],
) {
  const allowed = categoryIssues[category as keyof typeof categoryIssues] as
    readonly string[] | undefined;
  return !!allowed && issues.every((issue) => allowed.includes(issue));
}
