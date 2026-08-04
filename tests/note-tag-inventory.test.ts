import { describe, expect, it } from "vitest";
import { createNoteTagInventory, findUnsyncedInlineTags } from "../src/tags/NoteTagInventory";

describe("NoteTagInventory", () => {
  it("normalizes and deduplicates each source while preserving stable source order", () => {
    const inventory = createNoteTagInventory(
      ["Project/AI", " research ", "#project/ai"],
      ["#Workflow", "RESEARCH", "topic/deep learning"]
    );

    expect(inventory.frontmatterTags).toEqual(["project/ai", "research"]);
    expect(inventory.inlineTags).toEqual(["workflow", "research", "topic/deep-learning"]);
    expect(inventory.allTags).toEqual(["project/ai", "research", "workflow", "topic/deep-learning"]);
    expect(findUnsyncedInlineTags(inventory)).toEqual(["workflow", "topic/deep-learning"]);
  });
});
