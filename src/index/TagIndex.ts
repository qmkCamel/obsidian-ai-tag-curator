// Shared data shapes for the vault-wide tag usage index.
export interface IndexedNote {
  path: string;
  content: string;
  frontmatterTags: string[];
  metadataTags?: string[];
}

export interface TagIndex {
  updatedAt: string;
  tags: Record<string, TagUsage>;
}

export interface TagUsage {
  tag: string;
  normalized: string;
  count: number;
  files: TagFileUsage[];
  examples: TagExample[];
  namingSignals: TagNamingSignals;
}

export interface TagFileUsage {
  path: string;
  count: number;
  sources: TagSource[];
}

export interface TagExample {
  path: string;
  snippet: string;
}

export interface TagNamingSignals {
  hasHierarchy: boolean;
  depth: number;
}

export type TagSource = "frontmatter" | "inline" | "metadata";
