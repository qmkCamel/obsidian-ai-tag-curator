// Derives folder-batch scope confirmation state without reading note contents or starting provider requests.
import { normalizeFolderPath } from "../obsidian/VaultReader";

export interface FolderBatchScopeInput {
  folderPath: string;
  includeSubfolders: boolean;
  filePaths: string[];
  maxFolderBatchFiles: number;
  hasApiKey: boolean;
}

export type FolderBatchScopeBlockReason = "missingApiKey" | "empty" | "overLimit" | null;

export interface FolderBatchScopeViewModel {
  folderPath: string;
  includeSubfolders: boolean;
  filePaths: string[];
  fileCount: number;
  estimatedRequestCount: number;
  maxFolderBatchFiles: number;
  blockReason: FolderBatchScopeBlockReason;
  canStart: boolean;
}

export function buildFolderBatchScopeViewModel(input: FolderBatchScopeInput): FolderBatchScopeViewModel {
  const filePaths = Array.from(new Set(input.filePaths)).sort((left, right) => left.localeCompare(right));
  const fileCount = filePaths.length;
  const blockReason: FolderBatchScopeBlockReason = !input.hasApiKey
    ? "missingApiKey"
    : fileCount === 0
      ? "empty"
      : fileCount > input.maxFolderBatchFiles
        ? "overLimit"
        : null;

  return {
    folderPath: normalizeFolderPath(input.folderPath),
    includeSubfolders: input.includeSubfolders,
    filePaths,
    fileCount,
    estimatedRequestCount: fileCount,
    maxFolderBatchFiles: input.maxFolderBatchFiles,
    blockReason,
    canStart: blockReason === null
  };
}
