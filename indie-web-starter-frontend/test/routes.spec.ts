import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routeWarningFor } from '../src/routes/pages';

const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

describe('routes', () => {
	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		const sonic = await import('../src/utils/sonic');
		sonic.__resetSonicCollectionsCacheForTests();
	});

	it('prefers page templates when page name overlaps with a collection', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						jsonResponse({
							collections: [{ id: '1', name: 'about', display_name: 'About' }],
						})
					);
				}
				if (url.includes('/api/collections/blog-posts/content')) {
					return Promise.resolve(jsonResponse({ data: [] }));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			})
		);

		const { default: app } = await import('../src/index');
		const response = await app.request('/about');
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain('<h1>About</h1>');
		expect(body).toContain('matches both a page and a collection');
	});

	it('returns 404 for unknown page/collection routes', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(jsonResponse({ collections: [] }));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			})
		);

		const { default: app } = await import('../src/index');
		const response = await app.request('/missing-page');

		expect(response.status).toBe(404);
		expect(await response.text()).toContain('<title>404</title>');
	});

	it('returns 500 when collection archive fetch fails unexpectedly', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						jsonResponse({
							collections: [{ id: '2', name: 'music', display_name: 'Music' }],
						})
					);
				}
				if (url.includes('/api/collections/music/content')) {
					return Promise.resolve(new Response('boom', { status: 500, statusText: 'Internal Error' }));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			})
		);

		const { default: app } = await import('../src/index');
		const response = await app.request('/music');

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: 'Internal Server Error' });
	});

	it('builds the page-vs-archive warning when both overlap', () => {
		expect(routeWarningFor('about', false, true)).toBe(
			'Warning: "about" matches both a page and a collection archive. Showing page template.'
		);
	});
});
