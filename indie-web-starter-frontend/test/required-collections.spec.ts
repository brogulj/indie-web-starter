import { describe, expect, it } from 'vitest';
import { applyCollectionSortAndLimit, getCollectionSortValue } from '../src/services/required-collections';
import type { SonicCollectionContentItem } from '../src/utils/sonic';

const item = (overrides: Partial<SonicCollectionContentItem>): SonicCollectionContentItem => ({
	id: 'id',
	title: 'title',
	slug: 'slug',
	status: 'published',
	collectionId: 'collection-id',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	data: {},
	...overrides,
});

describe('required collection helpers', () => {
	it('resolves sort values from root or data keys (snake and camel case)', () => {
		const rootItem = item({ createdAt: '2026-01-01T00:00:00.000Z' });
		const dataItem = item({ data: { published_at: '2026-02-01T00:00:00.000Z' } });
		const camelDataItem = item({ data: { publishedAt: '2026-03-01T00:00:00.000Z' } });

		expect(getCollectionSortValue(rootItem, 'created_at')).toBe('2026-01-01T00:00:00.000Z');
		expect(getCollectionSortValue(dataItem, 'published_at')).toBe('2026-02-01T00:00:00.000Z');
		expect(getCollectionSortValue(camelDataItem, 'published_at')).toBe('2026-03-01T00:00:00.000Z');
	});

	it('sorts and limits items using configuration', () => {
		const items = [
			item({ slug: 'a', data: { order: 2 } }),
			item({ slug: 'b', data: { order: 3 } }),
			item({ slug: 'c', data: { order: 1 } }),
		];

		const result = applyCollectionSortAndLimit(items, { name: 'x', sort: '-order', limit: 2 });
		expect(result.map((entry) => entry.slug)).toEqual(['b', 'a']);
	});
});
