import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSonicCollectionsCacheForTests, SonicApiError, sonicGetCollectionsCached, sonicGetContent, sonicGetContentBySlug } from '../src/utils/sonic';

describe('sonic collections cache', () => {
	beforeEach(() => {
		__resetSonicCollectionsCacheForTests();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('clears cache after a failed request so the next call can recover', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('failed', { status: 500, statusText: 'Internal Error' }))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ collections: [{ id: '1', name: 'blog-posts', display_name: 'Blog Posts' }] }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(sonicGetCollectionsCached()).rejects.toBeInstanceOf(SonicApiError);

		const collections = await sonicGetCollectionsCached();
		expect(collections).toHaveLength(1);
		expect(collections[0]?.name).toBe('blog-posts');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('hydrates reference fields with id-first lookup, slug fallback, unresolved null, and deduped requests', async () => {
		const outfitLookups: Array<{ field: string; value: string }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								collections: [
									{
										id: 'events-id',
										name: 'events',
										display_name: 'Events',
										schema: { properties: { outfit: { type: 'reference', collection: 'outfits' } } },
									},
									{ id: 'outfits-id', name: 'outfits', display_name: 'Outfits', schema: { properties: {} } },
								],
							}),
							{ status: 200, headers: { 'content-type': 'application/json' } }
						)
					);
				}
				if (url.includes('/api/collections/events/content')) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								data: [
									{ id: 'e1', title: 'E1', slug: 'e1', status: 'published', collectionId: 'events-id', createdAt: '', updatedAt: '', data: { rating: 8, outfit: 'outfit-1' } },
									{ id: 'e2', title: 'E2', slug: 'e2', status: 'published', collectionId: 'events-id', createdAt: '', updatedAt: '', data: { rating: 9, outfit: 'outfit-1' } },
									{ id: 'e3', title: 'E3', slug: 'e3', status: 'published', collectionId: 'events-id', createdAt: '', updatedAt: '', data: { rating: 7, outfit: 'city-night' } },
									{ id: 'e4', title: 'E4', slug: 'e4', status: 'published', collectionId: 'events-id', createdAt: '', updatedAt: '', data: { rating: 6, outfit: 'missing' } },
								],
							}),
							{ status: 200, headers: { 'content-type': 'application/json' } }
						)
					);
				}
				if (url.includes('/api/collections/outfits/content')) {
					const parsed = new URL(url);
					const whereRaw = parsed.searchParams.get('where') ?? '{}';
					const where = JSON.parse(whereRaw) as { and?: Array<{ field?: string; value?: unknown }> };
					const [first] = where.and ?? [];
					const field = String(first?.field ?? '');
					const value = String(first?.value ?? '');
					outfitLookups.push({ field, value });

					if (field === 'id' && value === 'outfit-1') {
						return Promise.resolve(
							new Response(
								JSON.stringify({
									data: [{ id: 'outfit-1', title: 'City Night', slug: 'city-night', status: 'published', collectionId: 'outfits-id', createdAt: '', updatedAt: '', data: {} }],
								}),
								{ status: 200, headers: { 'content-type': 'application/json' } }
							)
						);
					}
					if (field === 'slug' && value === 'city-night') {
						return Promise.resolve(
							new Response(
								JSON.stringify({
									data: [{ id: 'outfit-2', title: 'City Night Alt', slug: 'city-night', status: 'published', collectionId: 'outfits-id', createdAt: '', updatedAt: '', data: {} }],
								}),
								{ status: 200, headers: { 'content-type': 'application/json' } }
							)
						);
					}

					return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			})
		);

		const items = await sonicGetContent('events');

		expect(items[0]?.data.outfit).toBe('outfit-1');
		expect(items[0]?.data.outfitData).toMatchObject({ id: 'outfit-1', slug: 'city-night' });
		expect(items[1]?.data.outfitData).toMatchObject({ id: 'outfit-1', slug: 'city-night' });
		expect(items[2]?.data.outfit).toBe('city-night');
		expect(items[2]?.data.outfitData).toMatchObject({ slug: 'city-night' });
		expect(items[3]?.data.outfitData).toBeNull();
		expect(items[0]?.data.rating).toBe(8);
		expect(outfitLookups).toEqual([
			{ field: 'id', value: 'outfit-1' },
			{ field: 'id', value: 'city-night' },
			{ field: 'slug', value: 'city-night' },
			{ field: 'id', value: 'missing' },
			{ field: 'slug', value: 'missing' },
		]);
	});

	it('hydrates references for slug fetches and keeps raw values intact', async () => {
		const outfitLookups: Array<{ field: string; value: string }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/api/collections')) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								collections: [
									{
										id: 'events-id',
										name: 'events',
										display_name: 'Events',
										schema: { properties: { outfit: { type: 'reference', collection: 'outfits' } } },
									},
									{ id: 'outfits-id', name: 'outfits', display_name: 'Outfits', schema: { properties: {} } },
								],
							}),
							{ status: 200, headers: { 'content-type': 'application/json' } }
						)
					);
				}
				if (url.includes('/api/collections/events/content')) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								data: [{ id: 'e1', title: 'E1', slug: 'night-show', status: 'published', collectionId: 'events-id', createdAt: '', updatedAt: '', data: { outfit: 'outfit-1' } }],
							}),
							{ status: 200, headers: { 'content-type': 'application/json' } }
						)
					);
				}
				if (url.includes('/api/collections/outfits/content')) {
					const parsed = new URL(url);
					const where = JSON.parse(parsed.searchParams.get('where') ?? '{}') as { and?: Array<{ field?: string; value?: unknown }> };
					const field = String(where.and?.[0]?.field ?? '');
					const value = String(where.and?.[0]?.value ?? '');
					outfitLookups.push({ field, value });
					if (field === 'id' && value === 'outfit-1') {
						return Promise.resolve(
							new Response(
								JSON.stringify({
									data: [{ id: 'outfit-1', title: 'City Night', slug: 'city-night', status: 'published', collectionId: 'outfits-id', createdAt: '', updatedAt: '', data: {} }],
								}),
								{ status: 200, headers: { 'content-type': 'application/json' } }
							)
						);
					}
					return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
				}
				return Promise.resolve(new Response('not found', { status: 404 }));
			})
		);

		const item = await sonicGetContentBySlug('events', 'night-show');
		expect(item?.data.outfit).toBe('outfit-1');
		expect(item?.data.outfitData).toMatchObject({ id: 'outfit-1', slug: 'city-night' });
		expect(outfitLookups).toEqual([{ field: 'id', value: 'outfit-1' }]);
	});
});
