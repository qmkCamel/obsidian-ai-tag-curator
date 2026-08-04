// Shared data shapes for the vault-wide tag usage index.
export interface IndexedNote {
  path: string;
  content: string;
  frontmatterTags: string[];
  inlineTags: string[];
  allTags: string[];
  sourceContentHash: string;
  /** Legacy compatibility for persisted/test inputs created before source-aware inventories. */
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
