import { vi } from 'vitest';

if (!globalThis.CSS) {
  globalThis.CSS = { escape: (str) => str.replace(/([^\w-])/g, '\\$1') };
}

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn((key, cb) => cb({})),
      set: vi.fn()
    },
    onChanged: {
      addListener: vi.fn()
    }
  },
  runtime: {
    id: 'test-extension-id',
    sendMessage: vi.fn(),
    getURL: vi.fn(path => `chrome-extension://test/${path}`),
    onMessage: {
      addListener: vi.fn()
    }
  },
  tabs: {
    sendMessage: vi.fn()
  }
};
