import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  // jsdom does not implement scrolling. Browser behavior is covered by Playwright.
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  // Unit tests must never contact the backend or a live provider by accident.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected fetch in unit test')));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
