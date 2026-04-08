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

		const response = await app.request('/dashboard/content/blog-posts-collection-id', {
			method: 'POST',
			headers: { cookie: 'auth_token=jwt-token' },
			body,
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/dashboard/blog-posts-collection-id/content-1?saved=1');
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

		const response = await app.request('/dashboard/content/blog-posts-collection-id/content-1', {
			method: 'POST',
			headers: { cookie: 'auth_token=jwt-token' },
			body,
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/dashboard/blog-posts-collection-id/content-1?saved=1');
	});

	it('renders following sources page with success message and source rows', async () => {
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
							collections: [{ id: 'following-id', name: 'following-sources', display_name: 'Following Sources', schema: { properties: {} } }],
						}),
					);
				}
				if (url.includes('/api/content?')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'follow-1',
									collectionId: 'following-id',
									title: 'Example Site',
									slug: 'example-site',
									status: 'published',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-01T00:00:00.000Z',
									data: {
										siteUrl: 'https://example.com',
										feedUrl: 'https://example.com/feed.xml',
										active: true,
									},
								},
							],
						}),
					);
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			}),
		);

		const { default: app } = await import('../src/index');
		const response = await app.request('/dashboard/following?followSaved=1', {
			headers: { cookie: 'auth_token=jwt-token' },
		});
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain('Following source saved.');
		expect(body).toContain('Example Site');
		expect(body).toContain('https://example.com/feed.xml');
		expect(body).toContain('Logout');
		expect(body).not.toContain('>Login<');
	});

	it('adds following source and redirects with followSaved query', async () => {
		let createdPayload: Record<string, unknown> | null = null;
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
				if (url.endsWith('/api/collections')) {
					return jsonResponse({
						collections: [{ id: 'following-id', name: 'following-sources', display_name: 'Following Sources', schema: { properties: {} } }],
					});
				}
				if (url.endsWith('/api/content') && init?.method === 'POST') {
					createdPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
					return jsonResponse({
						data: {
							id: 'follow-1',
							collectionId: 'following-id',
							title: 'Example',
							slug: 'follow-example',
							status: 'published',
							data: {},
						},
					});
				}
				return new Response('not found', { status: 404 });
			}),
		);

		const { default: app } = await import('../src/index');
		const body = new FormData();
		body.set('siteUrl', 'https://example.com');
		body.set('feedUrl', 'https://example.com/feed.xml');
		body.set('title', 'Example');

		const response = await app.request('/dashboard/following/add', {
			method: 'POST',
			headers: { cookie: 'auth_token=jwt-token' },
			body,
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/dashboard/following?followSaved=1');
		expect(createdPayload?.collectionId).toBe('following-id');
		expect(createdPayload?.status).toBe('published');
		expect((createdPayload?.data as Record<string, unknown>)?.siteUrl).toBe('https://example.com/');
	});

	it('sends feed like action as JSON and returns sent status', async () => {
		const putBodies: Array<Record<string, unknown>> = [];
		let createdPayload: Record<string, unknown> | undefined;
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
				if (url.endsWith('/api/collections')) {
					return jsonResponse({
						collections: [{ id: 'outbound-id', name: 'outbound-webmentions', display_name: 'Outbound Webmentions', schema: { properties: {} } }],
					});
				}
				if (url.endsWith('/api/content') && init?.method === 'POST') {
					createdPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
					return jsonResponse({
						data: {
							id: 'outbound-1',
							collectionId: 'outbound-id',
							title: 'Outbound mention',
							slug: 'outbound-slug',
							status: 'published',
							data: {},
						},
					});
				}
				if (url.endsWith('/api/content/outbound-1') && init?.method === 'GET') {
					return jsonResponse({
						id: 'outbound-1',
						collectionId: 'outbound-id',
						title: 'Outbound mention',
						slug: 'outbound-slug',
						status: 'published',
						data: {},
					});
				}
				if (url.endsWith('/api/content/outbound-1') && init?.method === 'PUT') {
					putBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
					return jsonResponse({
						id: 'outbound-1',
						collectionId: 'outbound-id',
						title: 'Outbound mention',
						slug: 'outbound-slug',
						status: 'published',
						data: {},
					});
				}
				if (url === 'https://target.example/post' && (!init?.method || init.method === 'GET')) {
					return new Response('<html><head><link rel="webmention" href="https://target.example/webmention" /></head></html>', {
						status: 200,
						headers: { 'content-type': 'text/html' },
					});
				}
				if (url === 'http://localhost/outbound-webmentions/outbound-slug' && (!init?.method || init.method === 'GET')) {
					return new Response(
						'<html><body><a href="https://target.example/post" class="u-like-of">Target</a></body></html>',
						{
							status: 200,
							headers: { 'content-type': 'text/html' },
						},
					);
				}
				if (url === 'https://target.example/webmention' && init?.method === 'POST') {
					return new Response('accepted', { status: 202 });
				}
				return new Response('not found', { status: 404 });
			}),
		);

		const { default: app } = await import('../src/index');
		const body = new FormData();
		body.set('targetUrl', 'https://target.example/post');
		body.set('targetTitle', 'Target title');

		const response = await app.request('/dashboard/following/feed/like', {
			method: 'POST',
			headers: {
				cookie: 'auth_token=jwt-token',
				accept: 'application/json',
			},
			body,
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			ok: true,
			mentionType: 'like',
			status: 'sent',
			outboundUrl: '/outbound-webmentions/outbound-slug',
		});
		expect(createdPayload?.collectionId).toBe('outbound-id');
		expect(typeof createdPayload?.slug).toBe('string');
		expect(String(createdPayload?.slug)).toContain('webmention-like-');
		const createdData = (createdPayload?.data ?? {}) as Record<string, unknown>;
		expect(createdData.sourceCollection).toBe('outbound-webmentions');
		expect(String(createdData.sourceSlug ?? '')).toContain('webmention-like-');
		expect(putBodies.length).toBeGreaterThanOrEqual(2);
	});

	it('sends feed reply action with comment text persisted in outbound record payload', async () => {
		let createdPayload: Record<string, unknown> | undefined;
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
				if (url.endsWith('/api/collections')) {
					return jsonResponse({
						collections: [{ id: 'outbound-id', name: 'outbound-webmentions', display_name: 'Outbound Webmentions', schema: { properties: {} } }],
					});
				}
				if (url.endsWith('/api/content') && init?.method === 'POST') {
					createdPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
					return jsonResponse({
						data: {
							id: 'outbound-1',
							collectionId: 'outbound-id',
							title: 'Outbound mention',
							slug: 'outbound-slug',
							status: 'published',
							data: {},
						},
					});
				}
				if (url.endsWith('/api/content/outbound-1') && init?.method === 'GET') {
					return jsonResponse({
						id: 'outbound-1',
						collectionId: 'outbound-id',
						title: 'Outbound mention',
						slug: 'outbound-slug',
						status: 'published',
						data: {},
					});
				}
				if (url.endsWith('/api/content/outbound-1') && init?.method === 'PUT') {
					return jsonResponse({
						id: 'outbound-1',
						collectionId: 'outbound-id',
						title: 'Outbound mention',
						slug: 'outbound-slug',
						status: 'published',
						data: {},
					});
				}
				if (url === 'https://target.example/post' && (!init?.method || init.method === 'GET')) {
					return new Response('<html><head><link rel="webmention" href="https://target.example/webmention" /></head></html>', {
						status: 200,
						headers: { 'content-type': 'text/html' },
					});
				}
				if (url === 'http://localhost/outbound-webmentions/outbound-slug' && (!init?.method || init.method === 'GET')) {
					return new Response(
						'<html><body><a href="https://target.example/post" class="u-in-reply-to">Target</a></body></html>',
						{
							status: 200,
							headers: { 'content-type': 'text/html' },
						},
					);
				}
				if (url === 'https://target.example/webmention' && init?.method === 'POST') {
					return new Response('accepted', { status: 202 });
				}
				return new Response('not found', { status: 404 });
			}),
		);

		const { default: app } = await import('../src/index');
		const body = new FormData();
		body.set('targetUrl', 'https://target.example/post');
		body.set('targetTitle', 'Target title');
		body.set('commentText', 'This is my reply comment.');

		const response = await app.request('/dashboard/following/feed/comment', {
			method: 'POST',
			headers: {
				cookie: 'auth_token=jwt-token',
				accept: 'application/json',
			},
			body,
		});

		expect(response.status).toBe(200);
		const createdData = (createdPayload?.data ?? {}) as Record<string, unknown>;
		expect(createdData.mentionType).toBe('reply');
		expect(createdData.commentText).toBe('This is my reply comment.');
		expect(createdData.mf2PropertyClass).toBe('u-in-reply-to');
	});

	it('approves webmention and trusts domain when requested', async () => {
		let trustedDomainCreated = false;
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
				if (url.endsWith('/api/collections')) {
					return jsonResponse({
						collections: [
							{ id: 'webmentions-id', name: 'webmentions', display_name: 'Webmentions', schema: { properties: {} } },
							{
								id: 'trusted-id',
								name: 'trusted-webmention-domains',
								display_name: 'Trusted Domains',
								schema: { properties: {} },
							},
						],
					});
				}
				if (url.endsWith('/api/content/wm-1') && init?.method === 'GET') {
					return jsonResponse({
						id: 'wm-1',
						collectionId: 'webmentions-id',
						title: 'Pending mention',
						slug: 'pending-mention',
						status: 'published',
						data: { status: 'pending', sourceDomain: 'example.com' },
					});
				}
				if (url.endsWith('/api/content/wm-1') && init?.method === 'PUT') {
					return jsonResponse({
						id: 'wm-1',
						collectionId: 'webmentions-id',
						title: 'Pending mention',
						slug: 'pending-mention',
						status: 'published',
						data: { status: 'approved', sourceDomain: 'example.com' },
					});
				}
				if (url.includes('/api/content?') && init?.method === 'GET') {
					return jsonResponse({ data: [] });
				}
				if (url.endsWith('/api/content') && init?.method === 'POST') {
					const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
					if ((payload.collectionId as string) === 'trusted-id') {
						trustedDomainCreated = true;
					}
					return jsonResponse({
						data: {
							id: 'trusted-1',
							collectionId: 'trusted-id',
							title: 'Trusted domain: example.com',
							slug: 'trusted-example-com',
							status: 'published',
							data: {},
						},
					});
				}
				return new Response('not found', { status: 404 });
			}),
		);

		const { default: app } = await import('../src/index');
		const body = new FormData();
		body.set('trustDomain', '1');

		const response = await app.request('/dashboard/webmentions/wm-1/approve', {
			method: 'POST',
			headers: { cookie: 'auth_token=jwt-token' },
			body,
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/dashboard?wmApproved=1&trusted=1');
		expect(trustedDomainCreated).toBe(true);
	});
});
