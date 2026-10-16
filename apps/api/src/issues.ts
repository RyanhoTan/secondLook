import {
  issueTypesSchema,
  issuesMatchCategory,
  type IssueType,
} from "@secondlook/contracts";
import { HttpError } from "./http.js";

export function checkIssueCategory(
  category: string,
  issues: readonly IssueType[],
) {
  if (!issuesMatchCategory(category, issues))
    throw new HttpError(400, "问题类型与对象类别不匹配，请重新选择");
}
export const storedIssues = (value: unknown) => issueTypesSchema.parse(value);
export const postIssues = (rows: { code: string }[]) =>
  storedIssues(rows.map((r) => r.code));
