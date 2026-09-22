// The §4.3 relPath gate (DOCUMENT_NAVIGATOR_SPEC, DN-R7): a hostile workbook's
// `manifest.worksheets` entry must never reach `capFile`. The gate is pure and total,
// and these cases are the traversal shapes the loader would otherwise compose into a
// delegatable path — each one is asserted REFUSED, so the delegation is never
// constructed (G-DN-B3/B7's unit half; the host-exercised half runs on the venue).

import { describe, it, expect } from 'vitest';
import { validDocumentRelPath } from './documentPaths.ts';

describe('validDocumentRelPath', () => {
  it('accepts the four document families at their natural shapes', () => {
    expect(validDocumentRelPath('worksheets/review.sheet.js')).toBe(true);
    expect(validDocumentRelPath('worksheets/nested/model.sheet.js')).toBe(true);
    expect(validDocumentRelPath('templates/weekly.mdx')).toBe(true);
    expect(validDocumentRelPath('fixtures/exec_summary.frame.json')).toBe(true);
    expect(validDocumentRelPath('feeds/motion.feed.json')).toBe(true);
  });

  it('refuses traversal in every spelling a hostile manifest can produce', () => {
    expect(validDocumentRelPath('worksheets/../../../etc/passwd.sheet.js')).toBe(false);
    expect(validDocumentRelPath('../worksheets/x.sheet.js')).toBe(false);
    expect(validDocumentRelPath('worksheets/../templates/x.mdx')).toBe(false);
  });

  it('refuses absolute, empty and malformed paths', () => {
    expect(validDocumentRelPath('/worksheets/x.sheet.js')).toBe(false);
    expect(validDocumentRelPath('')).toBe(false);
    expect(validDocumentRelPath('worksheets//x.sheet.js')).toBe(false);
    expect(validDocumentRelPath('worksheets/./x.sheet.js')).toBe(false);
    expect(validDocumentRelPath('worksheets/x\\y.sheet.js')).toBe(false);
    expect(validDocumentRelPath('worksheets/x\0y.sheet.js')).toBe(false);
  });

  it('refuses anything outside the known document subdirectories', () => {
    expect(validDocumentRelPath('reckoner.json')).toBe(false);
    expect(validDocumentRelPath('src/App.tsx')).toBe(false);
    expect(validDocumentRelPath('immediately.run.json')).toBe(false);
  });
});
