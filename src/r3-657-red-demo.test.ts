// R3-657 exit criterion 2: a deliberately failing check. This PR is closed unmerged.
import { expect, test } from 'vitest';

test('deliberately red (R3-657 demo)', () => {
  expect(1).toBe(2);
});
