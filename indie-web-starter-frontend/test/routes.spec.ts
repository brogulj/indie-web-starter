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

	it('renders a valid response when page name overlaps with a collection', async () => {
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
		expect(body).toContain('<h1 class="text-2xl font-semibold">about</h1>');
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

	it('renders posts template with semantic sections and media fallbacks', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						jsonResponse({
							collections: [{ id: '1', name: 'posts', display_name: 'Posts', schema: { properties: {} } }],
						})
					);
				}
				if (url.includes('/api/collections/posts/content') && url.includes('where=')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'post-1',
									title: 'Post title',
									slug: 'post-title',
									status: 'published',
									collectionId: 'posts',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-02T00:00:00.000Z',
									data: {
										caption: 'A caption for the post',
										media: ['https://cdn.example.com/post-a.jpg', { url: 'https://cdn.example.com/post-b.jpg' }],
									},
								},
							],
						})
					);
				}
				if (url.includes('/api/webmentions/mentions?')) {
					return Promise.resolve(jsonResponse({ mentions: [], counts: { likes: 0, reposts: 0, replies: 0, mentions: 0 } }));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			})
		);

		const { default: app } = await import('../src/index');
		const response = await app.request('/posts/post-title');
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain('Caption');
		expect(body).toContain('A caption for the post');
		expect(body).toContain('post-a.jpg');
		expect(body).toContain('post-b.jpg');
		expect(body).toContain('No public interactions yet.');
		expect(body).toContain('Published:');
	});

	it('renders specialized templates for events, reviews, and outfits', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						jsonResponse({
							collections: [
								{ id: '1', name: 'events', display_name: 'Events', schema: { properties: { content: { type: 'richtext' } } } },
								{
									id: '2',
									name: 'movie-reviews',
									display_name: 'Movie Reviews',
									schema: { properties: { content: { type: 'richtext' } } },
								},
								{
									id: '3',
									name: 'music-reviews',
									display_name: 'Music Reviews',
									schema: { properties: { content: { type: 'richtext' } } },
								},
								{ id: '4', name: 'outfits', display_name: 'Outfits', schema: { properties: {} } },
							],
						})
					);
				}
				if (url.includes('/api/collections/events/content') && url.includes('where=')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'event-1',
									title: 'Night Show',
									slug: 'night-show',
									status: 'published',
									collectionId: 'events',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-02T00:00:00.000Z',
									data: {
										content: 'Great show',
										rating: 8,
										eventDate: '2026-01-01T20:00:00.000Z',
										location: 'Zagreb',
										outfit: 'city-night',
										galleryImages: ['https://cdn.example.com/event-1.jpg'],
									},
								},
							],
						})
					);
				}
				if (url.includes('/api/collections/movie-reviews/content') && url.includes('where=')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'movie-1',
									title: 'Blade Runner',
									slug: 'blade-runner',
									status: 'published',
									collectionId: 'movie-reviews',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-02T00:00:00.000Z',
									data: {
										rating: 9,
										director: 'Ridley Scott',
										releaseYear: 1982,
										runtimeMinutes: 117,
										genres: 'Sci-Fi',
									},
								},
							],
						})
					);
				}
				if (url.includes('/api/collections/music-reviews/content') && url.includes('where=')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'music-1',
									title: 'Kid A',
									slug: 'kid-a',
									status: 'published',
									collectionId: 'music-reviews',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-02T00:00:00.000Z',
									data: {
										releaseType: 'album',
										artistName: 'Radiohead',
										releaseTitle: 'Kid A',
										rating: 10,
										featuredImage: { url: 'https://cdn.example.com/kid-a.jpg' },
									},
								},
							],
						})
					);
				}
				if (url.includes('/api/collections/outfits/content') && url.includes('where=')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'outfit-1',
									title: 'City Night',
									slug: 'city-night',
									status: 'published',
									collectionId: 'outfits',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-02T00:00:00.000Z',
									data: {
										mainImage: 'https://cdn.example.com/main-look.jpg',
										pieces: [{ name: 'Jacket', image: { url: 'https://cdn.example.com/jacket.jpg' }, order: 1 }],
									},
								},
							],
						})
					);
				}
				if (url.includes('/api/webmentions/mentions?')) {
					return Promise.resolve(jsonResponse({ mentions: [], counts: { likes: 0, reposts: 0, replies: 0, mentions: 0 } }));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			})
		);

		const { default: app } = await import('../src/index');

		const eventsResponse = await app.request('/events/night-show');
		const movieResponse = await app.request('/movie-reviews/blade-runner');
		const musicResponse = await app.request('/music-reviews/kid-a');
		const outfitsResponse = await app.request('/outfits/city-night');

		const eventsBody = await eventsResponse.text();
		const movieBody = await movieResponse.text();
		const musicBody = await musicResponse.text();
		const outfitsBody = await outfitsResponse.text();

		expect(eventsResponse.status).toBe(200);
		expect(eventsBody).toContain('Gallery');
		expect(eventsBody).toContain('Rating:');
		expect(eventsBody).toContain('/outfits/city-night');

		expect(movieResponse.status).toBe(200);
		expect(movieBody).toContain('Score');
		expect(movieBody).toContain('Director:');
		expect(movieBody).toContain('Ridley Scott');

		expect(musicResponse.status).toBe(200);
		expect(musicBody).toContain('Artist:');
		expect(musicBody).toContain('Release:');
		expect(musicBody).toContain('kid-a.jpg');

		expect(outfitsResponse.status).toBe(200);
		expect(outfitsBody).toContain('Main Look');
		expect(outfitsBody).toContain('Pieces');
		expect(outfitsBody).toContain('jacket.jpg');
	});

	it('renders outbound webmentions sections and reply text', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						jsonResponse({
							collections: [{ id: '1', name: 'outbound-webmentions', display_name: 'Outbound Webmentions', schema: { properties: {} } }],
						})
					);
				}
				if (url.includes('/api/collections/outbound-webmentions/content') && url.includes('where=')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'wm-1',
									title: 'Reply to article',
									slug: 'wm-1',
									status: 'published',
									collectionId: 'outbound-webmentions',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-02T00:00:00.000Z',
									data: {
										sourceUrl: 'https://mysite.com/posts/reply',
										targetUrl: 'https://target.site/post',
										targetDomain: 'target.site',
										targetTitle: 'A good post',
										mentionType: 'reply',
										deliveryStatus: 'sent',
										responseStatusCode: 202,
										sourceCollection: 'posts',
										sourceSlug: 'reply',
										attemptedAt: '2026-01-01T12:00:00.000Z',
										commentText: 'Loved this writeup!',
										mf2PropertyClass: 'u-in-reply-to',
									},
								},
							],
						})
					);
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			})
		);

		const { default: app } = await import('../src/index');
		const response = await app.request('/outbound-webmentions/wm-1');
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain('Action');
		expect(body).toContain('Delivery');
		expect(body).toContain('Links');
		expect(body).toContain('Reply Text');
		expect(body).toContain('Loved this writeup!');
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
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'wm-1',
									title: 'Approved reply',
									slug: 'approved-reply',
									status: 'published',
									collectionId: 'webmentions',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-02T00:10:00.000Z',
									data: {
										mentionType: 'reply',
										status: 'approved',
										targetCollection: 'blog-posts',
										targetSlug: 'blog-one',
										sourceDomain: 'localhost',
										sourceUrl: 'http://localhost/outbound-webmentions/wm-1',
										authorName: 'Replied to Blog One',
										contentText: 'Reply Text',
										publishedAt: '2026-01-02T00:10:00.000Z',
									},
								},
							],
						})
					);
				}
				if (url.includes('/api/collections/outbound-webmentions/content')) {
					return Promise.resolve(
						jsonResponse({
							data: [
								{
									id: 'owm-1',
									title: 'Outbound Reply',
									slug: 'wm-1',
									status: 'published',
									collectionId: 'outbound-webmentions',
									createdAt: '2026-01-01T00:00:00.000Z',
									updatedAt: '2026-01-02T00:09:00.000Z',
									data: {
										sourceUrl: 'http://localhost/outbound-webmentions/wm-1',
										commentText: 'This is my real reply text',
									},
								},
							],
						})
					);
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
		expect(body).toContain('<h3>Replies</h3>');
		expect(body).toContain('This is my real reply text');
		expect(body).not.toContain('Reply Text');
		expect(body).toContain('Fri, 02 Jan 2026');
		expect(body).not.toContain('Thu, 01 Jan 1970 00:00:00 GMT');
		expect(body).not.toContain('<category>webmentions</category>');
	});
});
