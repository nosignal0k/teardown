export type TopicSlug = string & { readonly __brand: "TopicSlug" };

export type TopicMeta = {
  readonly slug: TopicSlug;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly tags: readonly string[];
};

export type TopicFile = {
  readonly rel: string;
  readonly abs: string;
};

export type TopicSource = TopicMeta & {
  readonly root: string;
  readonly files: readonly TopicFile[];
};

export type IssueCode = "topics-dir" | "slug" | "metadata" | "entry" | "file" | "reference";

export type CheckIssue = {
  readonly code: IssueCode;
  readonly slug: string;
  readonly message: string;
};

export type Discovery = {
  readonly topics: readonly TopicSource[];
  readonly sharedFiles: readonly TopicFile[];
  readonly issues: readonly CheckIssue[];
};
