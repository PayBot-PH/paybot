import test from 'node:test';
import assert from 'node:assert/strict';
import { authApi, clearStoredToken } from './auth.ts';

class MockStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.get(key) ?? null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;

test.beforeEach(() => {
  globalThis.localStorage = new MockStorage() as Storage;
  clearStoredToken();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalLocalStorage;
});

test('authApi.login posts credentials to the terminal-login endpoint and stores the access token', async () => {
  let requestUrl: string | undefined;
  let requestBody: unknown;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestBody = init?.body ? JSON.parse(init.body as string) : undefined;

    return new Response(JSON.stringify({
      access_token: 'demo-access-token',
      user: { id: 'admin', email: 'admin@example.com', role: 'admin' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await authApi.login('admin@example.com', 'secret-password');

  assert.equal(requestUrl, '/api/v1/auth/terminal-login');
  assert.deepEqual(requestBody, {
    email: 'admin@example.com',
    password: 'secret-password',
  });
  assert.equal(globalThis.localStorage.getItem('token'), 'demo-access-token');
});
