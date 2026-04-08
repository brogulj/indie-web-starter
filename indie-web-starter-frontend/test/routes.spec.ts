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

	it('renders markdown formatting in collection titles', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						jsonResponse({
							collections: [
								{
									id: '1',
									name: 'blog-posts',
									display_name: 'Blog Posts',
									schema: { properties: {} },
								},
							],
						})
					);
				}
				if (url.includes('/api/collections/blog-posts/content') && url.includes('where=')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'post-1',
									title: '**Hello** World',
									slug: 'hello-world',
									status: 'published',
									collectionId: 'blog-posts',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-01T00:00:00.000Z',
									data: {
										title: '**Hello** World',
										excerpt: 'Excerpt',
										content: 'Body',
									},
								},
							],
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
		const response = await app.request('/blog-posts/hello-world');
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain('<strong>Hello</strong> World');
	});

	it('accepts webmention posts and forwards to backend ingest endpoint', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.endsWith('/api/webmentions/ingest')) {
					expect(init?.method).toBe('POST');
					expect(init?.headers).toMatchObject({
						'content-type': 'application/json',
						authorization: 'Bearer test-secret',
					});
					expect(JSON.parse(String(init?.body))).toEqual({
						source: 'https://example.com/post',
						target: 'https://mysite.com/posts/hello',
					});
					return Promise.resolve(jsonResponse({ accepted: true, status: 'pending' }, 202));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			}),
		);

		const { default: app } = await import('../src/index');
		const response = await app.request(
			'/webmention',
			{
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: 'source=https%3A%2F%2Fexample.com%2Fpost&target=https%3A%2F%2Fmysite.com%2Fposts%2Fhello',
			},
			{
				WEBMENTION_SHARED_SECRET: 'test-secret',
				WEBMENTION_ALLOWED_HOSTS: 'mysite.com',
				WEBMENTION_ENDPOINT_URL: 'http://localhost:8788/api/webmentions/ingest',
			} as never
		);

		expect(response.status).toBe(202);
	});

	it('surfaces backend ingest validation failures', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/webmentions/ingest')) {
					return Promise.resolve(jsonResponse({ error: 'Source does not link to target.' }, 422));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			}),
		);

		const { default: app } = await import('../src/index');
		const response = await app.request(
			'/webmention',
			{
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: 'source=https%3A%2F%2Fexample.com%2Fpost&target=https%3A%2F%2Fmysite.com%2Fposts%2Fhello',
			},
			{
				WEBMENTION_SHARED_SECRET: 'test-secret',
				WEBMENTION_ALLOWED_HOSTS: 'mysite.com',
				WEBMENTION_ENDPOINT_URL: 'http://localhost:8788/api/webmentions/ingest',
			} as never
		);

		expect(response.status).toBe(422);
		expect(await response.text()).toBe('Source does not link to target.');
	});

	it('surfaces backend ingest authorization failures', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/webmentions/ingest')) {
					return Promise.resolve(jsonResponse({ error: 'Unauthorized' }, 401));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			}),
		);

		const { default: app } = await import('../src/index');
		const response = await app.request(
			'/webmention',
			{
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: 'source=https%3A%2F%2Fexample.com%2Fpost&target=https%3A%2F%2Fmysite.com%2Fposts%2Fhello',
			},
			{
				WEBMENTION_SHARED_SECRET: 'test-secret',
				WEBMENTION_ALLOWED_HOSTS: 'mysite.com',
				WEBMENTION_ENDPOINT_URL: 'http://localhost:8788/api/webmentions/ingest',
			} as never
		);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Unauthorized');
	});

	it('rejects local source hosts before forwarding ingest', async () => {
		const fetchSpy = vi.fn((_input: RequestInfo | URL) => Promise.resolve(new Response('not found', { status: 404 })));
		vi.stubGlobal('fetch', fetchSpy);

		const { default: app } = await import('../src/index');
		const response = await app.request(
			'/webmention',
			{
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: 'source=http%3A%2F%2Flocalhost%3A3000%2Fpost&target=https%3A%2F%2Fmysite.com%2Fposts%2Fhello',
			},
			{
				WEBMENTION_SHARED_SECRET: 'test-secret',
				WEBMENTION_ALLOWED_HOSTS: 'mysite.com',
				WEBMENTION_ENDPOINT_URL: 'http://localhost:8788/api/webmentions/ingest',
			} as never
		);

		expect(response.status).toBe(403);
		expect(await response.text()).toBe('Source host is not allowed.');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('forwards repeated webmention submissions to backend ingest endpoint', async () => {
		let forwardedCount = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/webmentions/ingest')) {
					forwardedCount += 1;
					return Promise.resolve(jsonResponse({ accepted: true, status: 'pending' }, 202));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			}),
		);

		const { default: app } = await import('../src/index');
		const first = await app.request(
			'/webmention',
			{
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: 'source=https%3A%2F%2Fexample.com%2Flike-1&target=https%3A%2F%2Fmysite.com%2Fposts%2Fhello',
			},
			{
				WEBMENTION_SHARED_SECRET: 'test-secret',
				WEBMENTION_ALLOWED_HOSTS: 'mysite.com',
				WEBMENTION_ENDPOINT_URL: 'http://localhost:8788/api/webmentions/ingest',
			} as never
		);
		const second = await app.request(
			'/webmention',
			{
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: 'source=https%3A%2F%2Fexample.com%2Flike-2&target=https%3A%2F%2Fmysite.com%2Fposts%2Fhello',
			},
			{
				WEBMENTION_SHARED_SECRET: 'test-secret',
				WEBMENTION_ALLOWED_HOSTS: 'mysite.com',
				WEBMENTION_ENDPOINT_URL: 'http://localhost:8788/api/webmentions/ingest',
			} as never
		);

		expect(first.status).toBe(202);
		expect(second.status).toBe(202);
		expect(forwardedCount).toBe(2);
	});

	it('adds webmention discovery Link header on html responses', async () => {
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
		const response = await app.request('/webmention');
		const linkHeader = response.headers.get('Link') ?? '';

		expect(response.status).toBe(200);
		expect(linkHeader).toContain('rel="webmention"');
		expect(linkHeader).toContain('/webmention');
	});

	it('serves RSS feed on /feed aggregating published items across collections', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						jsonResponse({
							collections: [
								{ id: '1', name: 'posts', display_name: 'Posts' },
								{ id: '2', name: 'blog-posts', display_name: 'Blog Posts' },
								{ id: '3', name: 'webmentions', display_name: 'Webmentions' },
							],
						})
					);
				}
				if (url.includes('/api/collections/posts/content')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'p1',
									title: 'Post One',
									slug: 'post-one',
									status: 'published',
									collectionId: 'posts',
									created_at: 1767225600,
									updated_at: 1767398400,
									data: { caption: 'Hello from posts', media: ['https://cdn.example.com/post-one.jpg'] },
								},
							],
						})
					);
				}
				if (url.includes('/api/collections/blog-posts/content')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'b1',
									title: 'Blog One',
									slug: 'blog-one',
									status: 'published',
									collectionId: 'blog-posts',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-02T00:00:00.000Z',
									data: {
										excerpt: 'Hello from blog',
										featuredImage: { url: 'https://cdn.example.com/blog-one.webp' },
									},
								},
							],
						})
					);
				}
				if (url.includes('/api/collections/webmentions/content')) {
					return Promise.resolve(jsonResponse({ data: [] }));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			})
		);

		const { default: app } = await import('../src/index');
		const response = await app.request(
			'/feed',
			undefined,
			{
				SITE_PROFILE_IMAGE: '/avatar.webp',
			} as never
		);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/rss+xml');
		expect(body).toContain('<rss');
		expect(body).toContain('/posts/post-one');
		expect(body).toContain('/blog-posts/blog-one');
		expect(body).toContain('<content:encoded>');
		expect(body).toContain('<enclosure url="https://cdn.example.com/post-one.jpg" type="image/jpeg" />');
		expect(body).toContain('<enclosure url="https://cdn.example.com/blog-one.webp" type="image/webp" />');
		expect(body).toContain('<image><url>http://localhost/avatar.webp</url>');
		expect(body).toContain('<itunes:image href="http://localhost/avatar.webp" />');
		expect(body).not.toContain('Thu, 01 Jan 1970 00:00:00 GMT');
		expect(body).not.toContain('<category>webmentions</category>');
	});
});
