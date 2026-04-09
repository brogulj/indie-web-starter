import { describe, expect, it } from 'vitest';
import {
	buildFollowingRecommendationsViewModel,
	parseOpmlFeedEntries,
	type RecommendedFeedsSnapshot,
} from '../src/services/recommended-feeds';
import { recommendedFeedsSnapshot } from '../src/services/recommended-feeds.generated';

describe('recommended feeds service', () => {
	it('parses OPML feed entries and deduplicates by xmlUrl', () => {
		const opml = `<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="Example One" title="Example One" type="rss" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com" />
      <outline text="Example Two" type="rss" xmlUrl="https://another.example/rss" />
      <outline text="Example One duplicate" type="rss" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com" />
    </outline>
  </body>
</opml>`;
		const feeds = parseOpmlFeedEntries(opml);
		expect(feeds).toHaveLength(2);
		expect(feeds[0]).toMatchObject({
			title: 'Example One',
			feedUrl: 'https://example.com/feed.xml',
			siteUrl: 'https://example.com/',
			domain: 'example.com',
		});
		expect(feeds[1]).toMatchObject({
			title: 'Example Two',
			feedUrl: 'https://another.example/rss',
			siteUrl: 'https://another.example/',
			domain: 'another.example',
		});
	});

	it('builds recommendations view model with categories first and filter options', () => {
		const snapshot: RecommendedFeedsSnapshot = {
			metadata: {
				generatedAt: '2026-04-09T00:00:00.000Z',
				sourceRepoUrl: 'https://github.com/plenaryapp/awesome-rss-feeds',
			},
			categories: [
				{
					id: 'tech',
					name: 'Tech',
					kind: 'category',
					feeds: [{ title: 'Tech Daily', feedUrl: 'https://tech.example/rss', siteUrl: 'https://tech.example', domain: 'tech.example' }],
				},
			],
			countries: [
				{
					id: 'united-states',
					name: 'United States',
					kind: 'country',
					feeds: [
						{
							title: 'US News',
							feedUrl: 'https://news.example/us.xml',
							siteUrl: 'https://news.example',
							domain: 'news.example',
						},
					],
				},
			],
		};

		const model = buildFollowingRecommendationsViewModel(snapshot, 'all', 'news');
		expect(model.filterOptions.map((option) => option.value)).toEqual(['all', 'category:tech', 'country:united-states']);
		expect(model.recommendationGroups).toHaveLength(1);
		expect(model.recommendationGroups[0].kind).toBe('country');
		expect(model.totalRecommendationCount).toBe(1);
	});

	it('generated snapshot has required metadata and groups', () => {
		expect(recommendedFeedsSnapshot.metadata.sourceRepoUrl).toBe('https://github.com/plenaryapp/awesome-rss-feeds');
		expect(recommendedFeedsSnapshot.categories.length).toBeGreaterThan(0);
		expect(recommendedFeedsSnapshot.countries.length).toBeGreaterThan(0);
		expect(recommendedFeedsSnapshot.categories[0]?.kind).toBe('category');
		expect(recommendedFeedsSnapshot.countries[0]?.kind).toBe('country');
	});
});
