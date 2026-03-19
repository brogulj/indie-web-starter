import { beforeEach, describe, expect, it, vi } from 'vitest';

const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

describe('auth routes', () => {
	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		const sonic = await import('../src/utils/sonic');
		sonic.__resetSonicCollectionsCacheForTests();
	});

	it('redirects unauthenticated users from protected dashboard', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ collections: [] }))));
		const { default: app } = await import('../src/index');

		const response = await app.request('/dashboard');
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/login?redirect=%2Fdashboard');
	});

	it('logs in against backend auth endpoint and sets auth cookie', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.endsWith('/auth/login')) {
					expect(init?.method).toBe('POST');
					return Promise.resolve(
						jsonResponse({
							user: {
								id: 'u1',
								email: 'admin@sonicjs.com',
								username: 'admin',
								firstName: 'Admin',
								lastName: 'User',
								role: 'admin',
							},
							token: 'jwt-token',
						}),
					);
				}

				return Promise.resolve(jsonResponse({ collections: [] }));
			}),
		);

		const { default: app } = await import('../src/index');
		const body = new FormData();
		body.set('email', 'admin@sonicjs.com');
		body.set('password', 'sonicjs!');

		const response = await app.request('/login', {
			method: 'POST',
			body,
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/dashboard');
		expect(response.headers.get('set-cookie')).toContain('auth_token=jwt-token');
	});

	it('serves collection instructions route instead of treating instructions as a slug', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/auth/me')) {
					return Promise.resolve(
						jsonResponse({
							user: {
								id: 'u1',
								email: 'admin@sonicjs.com',
								username: 'admin',
								firstName: 'Admin',
								lastName: 'User',
								role: 'admin',
							},
						}),
					);
				}
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						jsonResponse({
							collections: [{ id: '1', name: 'blog-posts', display_name: 'Blog Posts', schema: { properties: {} } }],
						}),
					);
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			}),
		);

		const { default: app } = await import('../src/index');
		const response = await app.request('/blog-posts/instructions', {
			headers: { cookie: 'auth_token=jwt-token' },
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('Mustache Instructions');
	});

	it('does not clear auth cookie when auth check fails with transient server error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/auth/me')) {
					return Promise.resolve(new Response('backend unavailable', { status: 503 }));
				}
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(jsonResponse({ collections: [] }));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			}),
		);

		const { default: app } = await import('../src/index');
		const response = await app.request('/login', {
			headers: { cookie: 'auth_token=jwt-token' },
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	it('shows authenticated navbar on protected instructions 404 responses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/auth/me')) {
					return Promise.resolve(
						jsonResponse({
							user: {
								id: 'u1',
								email: 'admin@sonicjs.com',
								username: 'admin',
								firstName: 'Admin',
								lastName: 'User',
								role: 'admin',
							},
						}),
					);
				}
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						jsonResponse({
							collections: [{ id: '1', name: 'blog-posts', display_name: 'Blog Posts', schema: { properties: {} } }],
						}),
					);
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			}),
		);

		const { default: app } = await import('../src/index');
		const response = await app.request('/missing/instructions', {
			headers: { cookie: 'auth_token=jwt-token' },
		});
		const body = await response.text();

		expect(response.status).toBe(404);
		expect(body).toContain('Logout');
	});

	it('creates content from dashboard form and redirects to the new editor page', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.endsWith('/auth/me')) {
					return jsonResponse({
						user: {
							id: 'u1',
							email: 'admin@sonicjs.com',
							username: 'admin',
							firstName: 'Admin',
							lastName: 'User',
							role: 'admin',
						},
					});
				}
				if (url.endsWith('/api/content') && init?.method === 'POST') {
					expect(init.headers).toBeDefined();
					const body = JSON.parse(String(init.body)) as Record<string, unknown>;
					expect(body.collectionId).toBe('blog-posts-collection-id');
					expect(body.status).toBe('draft');
					return jsonResponse({
						data: {
							id: 'content-1',
							collectionId: 'blog-posts-collection-id',
							title: 'New title',
							slug: 'new-title',
							status: 'draft',
							data: { title: 'New title' },
						},
					});
				}
				return new Response('not found', { status: 404 });
			}),
		);

		const { default: app } = await import('../src/index');
		const body = new FormData();
		body.set('collectionId', 'blog-posts-collection-id');
		body.set('title', 'New title');
		body.set('slug', 'new-title');
		body.set('status', 'draft');
		body.set('dataJson', '{"title":"New title"}');

		const response = await app.request('/dashboard/content', {
			method: 'POST',
			headers: { cookie: 'auth_token=jwt-token' },
			body,
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/dashboard/content/content-1?saved=1');
	});

	it('updates content status to published from dashboard editor', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.endsWith('/auth/me')) {
					return jsonResponse({
						user: {
							id: 'u1',
							email: 'admin@sonicjs.com',
							username: 'admin',
							firstName: 'Admin',
							lastName: 'User',
							role: 'admin',
						},
					});
				}
				if (url.endsWith('/api/content/content-1') && init?.method === 'PUT') {
					const body = JSON.parse(String(init.body)) as Record<string, unknown>;
					expect(body.title).toBe('Updated title');
					expect(body.slug).toBe('updated-title');
					expect(body.status).toBe('published');
					return jsonResponse({
						id: 'content-1',
						title: 'Updated title',
						slug: 'updated-title',
						status: 'published',
						data: { title: 'Updated title' },
					});
				}
				return new Response('not found', { status: 404 });
			}),
		);

		const { default: app } = await import('../src/index');
		const body = new FormData();
		body.set('collectionId', 'blog-posts-collection-id');
		body.set('title', 'Updated title');
		body.set('slug', 'updated-title');
		body.set('status', 'published');
		body.set('dataJson', '{"title":"Updated title"}');

		const response = await app.request('/dashboard/content/content-1', {
			method: 'POST',
			headers: { cookie: 'auth_token=jwt-token' },
			body,
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/dashboard/content/content-1?saved=1');
	});
});
