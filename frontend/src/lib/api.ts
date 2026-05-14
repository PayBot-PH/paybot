import { createClient } from '@metagptx/web-sdk';
import { getStoredToken } from './auth';

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
	const token = getStoredToken();
	if (!token) {
		return originalFetch(input, init);
	}

	const headers = new Headers(init?.headers || {});
	if (!headers.has('Authorization')) {
		headers.set('Authorization', `Bearer ${token}`);
	}

	return originalFetch(input, {
		...init,
		headers,
	});
};

// Create client instance
export const client = createClient();
