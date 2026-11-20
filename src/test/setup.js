import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/app/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(cleanup);
