import { formatIssue } from "./issue.ts";
import { isDirectRun, resolveSitePaths } from "./site.ts";
import { discoverTopics } from "./topic.ts";

if (isDirectRun(import.meta.url)) {
  const paths = resolveSitePaths(process.env);
  const found = discoverTopics({ topicsDir: paths.topicsDir, sharedDir: paths.sharedDir });
  if (found.issues.length > 0) {
    for (const item of found.issues) console.error(formatIssue(item));
    process.exitCode = 1;
  } else {
    console.log(`检查通过（${found.topics.length} 个主题）`);
  }
}
