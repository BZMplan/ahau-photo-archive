import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import {
  emptyMetadata,
  nextActivePhotoId,
  submissionFormData,
  validateEditor,
  type UploadItem,
} from "../../src/lib/submission-editor";

function item(id: string): UploadItem {
  return {
    id,
    file: new File([id], "same.png", { type: "image/png" }),
    previewUrl: "blob:" + id,
  };
}
const a = item("a"),
  b = item("b"),
  c = item("c");
const author = {
  authorName: "Campus photographer",
  contactEmail: "private@example.invalid",
  message: "Batch note",
  consentAccepted: true,
};

test("removing another photo preserves the stable selection; removing current chooses next then previous", () => {
  expect(nextActivePhotoId([a, b, c], [b, c], "b")).toBe("b");
  expect(nextActivePhotoId([a, b, c], [a, c], "b")).toBe("c");
  expect(nextActivePhotoId([a, b, c], [a, b], "c")).toBe("b");
  expect(nextActivePhotoId([a], [], "a")).toBeNull();
  expect(nextActivePhotoId([], [a, b], null)).toBe("a");
  expect(nextActivePhotoId([a, b], [a, b, c], "b")).toBe("b");
});
test("mapping after removal uses IDs and original file order, including duplicate filenames", async () => {
  const draft = {
    a: { ...emptyMetadata(), title: "A", takenAt: "2025-01-01" },
    b: { ...emptyMetadata(), title: "B" },
    c: { ...emptyMetadata(), title: "C", location: "Library" },
  };
  const form = submissionFormData([c, a], draft, author, randomUUID(), "token");
  const files = form.getAll("files") as File[];
  expect(await files[0].text()).toBe("c");
  expect(await files[1].text()).toBe("a");
  expect(JSON.parse(String(form.get("metadata")))).toEqual([draft.c, draft.a]);
  expect(form.getAll("authorName")).toEqual([author.authorName]);
  expect(form.getAll("contactEmail")).toEqual([author.contactEmail]);
});
test("shared schema identifies date and whitespace errors per photo without changing drafts", () => {
  const drafts = {
    a: { ...emptyMetadata(), title: "A" },
    b: { ...emptyMetadata(), title: "  " },
  };
  expect(
    validateEditor([a, b], drafts, author, randomUUID(), "token"),
  ).toMatchObject({ photoId: "b", field: "title" });
  drafts.b.title = "B";
  drafts.b.takenAt = "2025-02-30";
  expect(
    validateEditor([a, b], drafts, author, randomUUID(), "token"),
  ).toMatchObject({ photoId: "b", field: "takenAt" });
  expect(drafts.a.title).toBe("A");
});
