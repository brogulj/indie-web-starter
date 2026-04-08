import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSonicCollectionsCacheForTests, SonicApiError, sonicGetCollectionsCached } from '../src/utils/sonic';

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
});
