import test from "node:test";
import assert from "node:assert/strict";
import { fileKind } from "./fileKind.js";

test("fileKind reads the MIME type first", () => {
  assert.equal(fileKind("photo.bin", "image/png"), "image");
  assert.equal(fileKind("clip", "video/mp4"), "video");
  assert.equal(fileKind("tone", "audio/mpeg"), "audio");
  assert.equal(fileKind("report", "application/pdf"), "pdf");
});

test("fileKind falls back to the extension, in any case", () => {
  assert.equal(fileKind("Budget.XLSX"), "spreadsheet");
  assert.equal(fileKind("talk.pptx"), "slides");
  assert.equal(fileKind("notes.docx"), "document");
  assert.equal(fileKind("backup.tar.gz"), "archive");
  assert.equal(fileKind("main.rs"), "code");
  assert.equal(fileKind("readme.md"), "text");
});

test("fileKind calls other text files text, and anything else a file", () => {
  assert.equal(fileKind("demo-report.txt", "text/plain"), "text");
  assert.equal(fileKind("server.log", "text/plain"), "text");
  assert.equal(fileKind("blob", ""), "file");
  assert.equal(fileKind(undefined, undefined), "file");
  assert.equal(fileKind("Makefile"), "file");
});
