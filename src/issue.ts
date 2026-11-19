import type { CheckIssue, IssueCode } from "./types.ts";

export function issue(code: IssueCode, slug: string, message: string): CheckIssue {
  return { code, slug, message };
}

export function formatIssue(item: CheckIssue): string {
  return item.slug === "" ? `${item.code}: ${item.message}` : `${item.code} ${item.slug}: ${item.message}`;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
