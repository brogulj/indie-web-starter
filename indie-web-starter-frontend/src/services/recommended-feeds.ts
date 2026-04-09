export type RecommendedFeedItem = {
	title: string;
	feedUrl: string;
	siteUrl: string;
	domain: string;
};

export type RecommendedFeedGroup = {
	id: string;
	name: string;
	kind: 'category' | 'country';
	feeds: RecommendedFeedItem[];
};

export type RecommendedFeedsSnapshot = {
	metadata: {
		generatedAt: string;
		sourceRepoUrl: string;
	};
	categories: RecommendedFeedGroup[];
	countries: RecommendedFeedGroup[];
};

export type RecommendationFilterOption = {
	value: string;
	label: string;
};

export type RecommendationFeedView = RecommendedFeedItem & {
	formId: string;
};

export type RecommendationGroupView = {
	id: string;
	name: string;
	kind: 'category' | 'country';
	feedCount: number;
	feeds: RecommendationFeedView[];
};

export type FollowingRecommendationsViewModel = {
	filterOptions: RecommendationFilterOption[];
	selectedFilter: string;
	query: string;
	recommendationGroups: RecommendationGroupView[];
	hasRecommendationGroups: boolean;
	totalRecommendationCount: number;
};

const toSafeId = (value: string): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '') || 'item';

const parseXmlAttributes = (input: string): Record<string, string> => {
	const attributes: Record<string, string> = {};
	for (const match of input.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
		attributes[match[1]] = match[2];
	}
	return attributes;
};

const normalizeUrl = (value: string): string => {
	try {
		const parsed = new URL(value.trim());
		parsed.hash = '';
		parsed.hostname = parsed.hostname.toLowerCase();
		return parsed.toString();
	} catch {
		return value.trim();
	}
};

const resolveDomain = (siteUrl: string, feedUrl: string): string => {
	const candidates = [siteUrl, feedUrl];
	for (const candidate of candidates) {
		try {
			return new URL(candidate).hostname.toLowerCase();
		} catch {
			continue;
		}
	}
	return '';
};

const resolveSiteUrl = (htmlUrl: string, feedUrl: string): string => {
	if (htmlUrl) return normalizeUrl(htmlUrl);
	try {
		const parsed = new URL(feedUrl);
		return `${parsed.protocol}//${parsed.hostname}/`;
	} catch {
		return feedUrl;
	}
};

export const parseOpmlFeedEntries = (opml: string): RecommendedFeedItem[] => {
	const entries: RecommendedFeedItem[] = [];
	const seen = new Set<string>();

	for (const match of opml.matchAll(/<outline\b([^>]*)\/?>/gi)) {
		const attributes = parseXmlAttributes(match[1] || '');
		const rawFeedUrl = String(attributes.xmlUrl || '').trim();
		if (!rawFeedUrl) continue;
		const feedUrl = normalizeUrl(rawFeedUrl);
		if (!feedUrl || seen.has(feedUrl)) continue;
		seen.add(feedUrl);

		const siteUrl = resolveSiteUrl(String(attributes.htmlUrl || '').trim(), feedUrl);
		const title = String(attributes.title || attributes.text || siteUrl || feedUrl).trim() || 'Untitled feed';
		const domain = resolveDomain(siteUrl, feedUrl);

		entries.push({
			title,
			feedUrl,
			siteUrl,
			domain,
		});
	}

	return entries;
};

const applyFeedQuery = (feeds: RecommendedFeedItem[], query: string): RecommendedFeedItem[] => {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return feeds;
	return feeds.filter((feed) => {
		const haystack = `${feed.title} ${feed.domain} ${feed.feedUrl} ${feed.siteUrl}`.toLowerCase();
		return haystack.includes(normalizedQuery);
	});
};

const filterGroups = (
	groups: RecommendedFeedGroup[],
	selectedFilter: string,
	query: string
): RecommendationGroupView[] => {
	const filtered = groups
		.filter((group) => selectedFilter === 'all' || selectedFilter === `${group.kind}:${group.id}`)
		.map((group) => {
			const feeds = applyFeedQuery(group.feeds, query).map((feed, index) => ({
				...feed,
				formId: `${group.kind}-${group.id}-${index}-${toSafeId(feed.title)}`,
			}));
			return {
				id: group.id,
				name: group.name,
				kind: group.kind,
				feedCount: feeds.length,
				feeds,
			};
		})
		.filter((group) => group.feeds.length > 0);

	return filtered;
};

const toFilterOptions = (snapshot: RecommendedFeedsSnapshot): RecommendationFilterOption[] => [
	{ value: 'all', label: 'All' },
	...snapshot.categories.map((group) => ({
		value: `category:${group.id}`,
		label: `Category: ${group.name}`,
	})),
	...snapshot.countries.map((group) => ({
		value: `country:${group.id}`,
		label: `Country: ${group.name}`,
	})),
];

export const buildFollowingRecommendationsViewModel = (
	snapshot: RecommendedFeedsSnapshot,
	selectedFilterRaw: string | undefined,
	queryRaw: string | undefined
): FollowingRecommendationsViewModel => {
	const filterOptions = toFilterOptions(snapshot);
	const selectedFilterCandidate = String(selectedFilterRaw || 'all').trim() || 'all';
	const selectedFilter = filterOptions.some((option) => option.value === selectedFilterCandidate) ? selectedFilterCandidate : 'all';
	const query = String(queryRaw || '').trim();

	const orderedGroups = [...snapshot.categories, ...snapshot.countries];
	const recommendationGroups = filterGroups(orderedGroups, selectedFilter, query);
	const totalRecommendationCount = recommendationGroups.reduce((sum, group) => sum + group.feedCount, 0);

	return {
		filterOptions: filterOptions.map((option) => ({
			...option,
			label: option.label,
		})),
		selectedFilter,
		query,
		recommendationGroups,
		hasRecommendationGroups: recommendationGroups.length > 0,
		totalRecommendationCount,
	};
};
