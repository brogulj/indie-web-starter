import type { Hono } from 'hono';
import { type CollectionFilter, sonicGetCollectionsCached, sonicGetContent } from '../utils/sonic';
import { resolveBackendRequestOptions } from '../utils/backend';

const FEED_EXCLUDED_COLLECTIONS = new Set([
	'webmentions',
	'trusted-webmention-domains',
	'following-sources',
	'outbound-webmentions',
]);

type FeedItem = {
	collection: string;
	slug: string;
	title: string;
	description: string;
	contentHtml: string;
	imageUrl?: string;
	link: string;
	guid: string;
	pubDate: string;
};

type ReplyComment = {
	authorName: string;
	authorUrl: string;
	authorPhoto: string;
	contentText: string;
	publishedAt: string;
	sourceUrl: string;
};

const xmlEscape = (value: string): string =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');

const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const toCdata = (value: string): string => `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const firstString = (...values: unknown[]): string => {
	for (const value of values) {
		if (typeof value === 'string' && value.trim().length > 0) return value.trim();
	}
	return '';
};

const parseDateValue = (value: unknown): Date | null => {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value === 'number' && Number.isFinite(value)) {
		const epochMs = value < 1_000_000_000_000 ? value * 1000 : value;
		const parsed = new Date(epochMs);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;
		if (/^\d+$/.test(trimmed)) {
			const numeric = Number(trimmed);
			if (Number.isFinite(numeric)) {
				const epochMs = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
				const parsed = new Date(epochMs);
				return Number.isNaN(parsed.getTime()) ? null : parsed;
			}
		}
		const parsed = new Date(trimmed);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	return null;
};

const resolvePubDate = (data: Record<string, unknown>, item: { createdAt?: unknown; updatedAt?: unknown }): string => {
	const itemRecord = item as Record<string, unknown>;
	const candidates = [
		data.publishedAt,
		data.published_at,
		data.createdAt,
		data.created_at,
		data.updatedAt,
		data.updated_at,
		item.createdAt,
		itemRecord.created_at,
		item.updatedAt,
		itemRecord.updated_at,
	];
	for (const candidate of candidates) {
		const parsed = parseDateValue(candidate);
		if (parsed) return parsed.toUTCString();
	}
	return new Date(0).toUTCString();
};

const resolveAbsoluteUrl = (value: string, origin: string): string => {
	try {
		const resolved = new URL(value, origin);
		if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return '';
		return resolved.toString();
	} catch {
		return '';
	}
};

const toHost = (value: string): string => {
	try {
		return new URL(value).hostname.toLowerCase();
	} catch {
		return '';
	}
};

const extractFirstImageFromHtml = (value: string, origin: string): string => {
	const match = value.match(/<img\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/i);
	if (!match?.[1]) return '';
	return resolveAbsoluteUrl(match[1], origin);
};

const buildItemContentHtml = (data: Record<string, unknown>, description: string, imageUrl: string): string => {
	const rawContent = typeof data.content === 'string' ? data.content.trim() : '';
	const hasHtml = rawContent.includes('<') && rawContent.includes('>');
	const safeDescription = xmlEscape(description);
	const imageMarkup = imageUrl ? `<p><img src="${xmlEscape(imageUrl)}" alt="" /></p>` : '';

	if (hasHtml) {
		return `${imageMarkup}${rawContent}`;
	}
	if (rawContent) {
		return `${imageMarkup}<p>${xmlEscape(rawContent)}</p>`;
	}
	return `${imageMarkup}<p>${safeDescription}</p>`;
};

const IMAGE_KEY_PATTERN = /(image|media|photo|thumbnail|thumb|cover|featured|gallery|main|poster|avatar|artwork)/i;

const asObject = (value: unknown): Record<string, unknown> | null => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
};

const looksLikeImageUrl = (value: string): boolean => {
	const lower = value.toLowerCase();
	return (
		/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/.test(lower) ||
		lower.includes('/api/media/') ||
		lower.includes('/media/')
	);
};

const extractImageUrlFromUnknown = (value: unknown, origin: string, keyHint = '', depth = 0): string => {
	if (depth > 5) return '';
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return '';
		if (!IMAGE_KEY_PATTERN.test(keyHint) && !looksLikeImageUrl(trimmed)) return '';
		return resolveAbsoluteUrl(trimmed, origin);
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = extractImageUrlFromUnknown(entry, origin, keyHint, depth + 1);
			if (found) return found;
		}
		return '';
	}
	const obj = asObject(value);
	if (!obj) return '';

	const priorityKeys = Object.keys(obj).sort((a, b) => {
		const aScore = IMAGE_KEY_PATTERN.test(a) ? 0 : 1;
		const bScore = IMAGE_KEY_PATTERN.test(b) ? 0 : 1;
		return aScore - bScore;
	});

	for (const key of priorityKeys) {
		if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
		const found = extractImageUrlFromUnknown(obj[key], origin, key, depth + 1);
		if (found) return found;
	}

	return '';
};

const resolveFeedImageUrl = (data: Record<string, unknown>, origin: string): string => {
	const found = extractImageUrlFromUnknown(data, origin);
	if (found) return found;
	const content = typeof data.content === 'string' ? data.content : '';
	return content ? extractFirstImageFromHtml(content, origin) : '';
};

const guessImageMimeType = (url: string): string => {
	const lower = url.toLowerCase().split('?')[0];
	if (lower.endsWith('.png')) return 'image/png';
	if (lower.endsWith('.webp')) return 'image/webp';
	if (lower.endsWith('.gif')) return 'image/gif';
	if (lower.endsWith('.svg')) return 'image/svg+xml';
	if (lower.endsWith('.avif')) return 'image/avif';
	return 'image/jpeg';
};

const buildItemDescription = (data: Record<string, unknown>): string => {
	return firstString(
		typeof data.summary === 'string' ? data.summary : '',
		typeof data.excerpt === 'string' ? data.excerpt : '',
		typeof data.caption === 'string' ? data.caption : '',
		typeof data.contentText === 'string' ? data.contentText : '',
		typeof data.content === 'string' ? stripHtml(data.content) : ''
	).slice(0, 600);
};

const toTargetKey = (collection: string, slug: string): string => `${collection.trim().toLowerCase()}/${slug.trim().toLowerCase()}`;

const buildRepliesHtml = (replies: ReplyComment[], origin: string): string => {
	if (replies.length === 0) return '';
	const itemsHtml = replies
		.map((reply) => {
			const authorName = xmlEscape(reply.authorName || 'Someone');
			const authorUrl = resolveAbsoluteUrl(reply.authorUrl, origin);
			const authorPhoto = resolveAbsoluteUrl(reply.authorPhoto, origin);
			const sourceUrl = resolveAbsoluteUrl(reply.sourceUrl, origin);
			const parsedDate = parseDateValue(reply.publishedAt);
			const displayDate = parsedDate ? parsedDate.toUTCString() : '';
			return [
				'<li style="margin-top:12px;">',
				'<div>',
				authorPhoto
					? `<img src="${xmlEscape(authorPhoto)}" alt="${authorName}" style="width:24px;height:24px;border-radius:9999px;vertical-align:middle;margin-right:6px;" />`
					: '',
				authorUrl ? `<a href="${xmlEscape(authorUrl)}"><strong>${authorName}</strong></a>` : `<strong>${authorName}</strong>`,
				displayDate ? ` <span style="color:#6b7280;font-size:12px;">${xmlEscape(displayDate)}</span>` : '',
				'</div>',
				`<p>${xmlEscape(reply.contentText)}</p>`,
				sourceUrl ? `<p><a href="${xmlEscape(sourceUrl)}">View original reply</a></p>` : '',
				'</li>',
			].join('');
		})
		.join('');

	return [
		'<section>',
		'<h3>Replies</h3>',
		'<ul style="list-style:none;padding-left:0;margin:8px 0 0 0;">',
		itemsHtml,
		'</ul>',
		'</section>',
	].join('');
};

export const registerFeedRoutes = (app: Hono): void => {
	app.get('/feed', async (c) => {
		try {
			const backendOptions = resolveBackendRequestOptions(c);
			const env = c.env as Record<string, string | undefined>;
			const siteUrl = new URL(c.req.url);
			const origin = siteUrl.origin;
			const siteHost = siteUrl.hostname.toLowerCase();
			const feedUrl = `${origin}/feed`;
			const feedTitle = env.SITE_TITLE || process.env.SITE_TITLE || 'Indie Web Starter';
			const feedDescription =
				env.SITE_DESCRIPTION || process.env.SITE_DESCRIPTION || 'Latest posts across all collections.';
			const configuredProfileImage = firstString(
				env.SITE_PROFILE_IMAGE,
				process.env.SITE_PROFILE_IMAGE,
				env.SITE_AUTHOR_IMAGE,
				process.env.SITE_AUTHOR_IMAGE,
				env.SITE_LOGO_URL,
				process.env.SITE_LOGO_URL,
				'/avatar.webp'
			);
			const feedProfileImage = configuredProfileImage ? resolveAbsoluteUrl(configuredProfileImage, origin) : '';
			const statusFilter: CollectionFilter[] = [{ field: 'status', operator: 'equals', value: 'published' }];
			const replyCommentsByTarget = await sonicGetContent('webmentions', statusFilter, backendOptions)
				.then((items) => {
					const result = new Map<string, ReplyComment[]>();
					for (const item of items) {
						const data = item.data && typeof item.data === 'object' ? (item.data as Record<string, unknown>) : null;
						if (!data) continue;
						const mentionType = typeof data.mentionType === 'string' ? data.mentionType.toLowerCase() : '';
						const moderationStatus = typeof data.status === 'string' ? data.status.toLowerCase() : '';
						const targetCollection = typeof data.targetCollection === 'string' ? data.targetCollection : '';
						const targetSlug = typeof data.targetSlug === 'string' ? data.targetSlug : '';
						const sourceDomain = typeof data.sourceDomain === 'string' ? data.sourceDomain.toLowerCase() : '';
						const authorUrl = firstString(typeof data.authorUrl === 'string' ? data.authorUrl : '');
						const sourceUrl = firstString(typeof data.sourceUrl === 'string' ? data.sourceUrl : '');
						const contentText = firstString(
							typeof data.contentText === 'string' ? data.contentText : '',
							typeof data.content === 'string' ? stripHtml(data.content) : ''
						);
						const isSelfReply =
							sourceDomain === siteHost || toHost(authorUrl) === siteHost || toHost(sourceUrl) === siteHost;
						if (mentionType !== 'reply' || moderationStatus !== 'approved' || !targetCollection || !targetSlug || !contentText) {
							continue;
						}
						if (isSelfReply) continue;
						const key = toTargetKey(targetCollection, targetSlug);
						const reply: ReplyComment = {
							authorName: firstString(
								typeof data.authorName === 'string' ? data.authorName : '',
								typeof data.sourceDomain === 'string' ? data.sourceDomain : '',
								'Someone'
							),
							authorUrl,
							authorPhoto: firstString(typeof data.authorPhoto === 'string' ? data.authorPhoto : ''),
							contentText,
							publishedAt: firstString(typeof data.publishedAt === 'string' ? data.publishedAt : ''),
							sourceUrl,
						};
						const existing = result.get(key) || [];
						existing.push(reply);
						result.set(key, existing);
					}
					for (const comments of result.values()) {
						const seen = new Set<string>();
						const deduped = comments.filter((reply) => {
							const signature = [
								reply.authorName.trim().toLowerCase(),
								reply.contentText.trim(),
								reply.publishedAt.trim(),
							].join('|');
							if (seen.has(signature)) return false;
							seen.add(signature);
							return true;
						});
						comments.length = 0;
						comments.push(...deduped);
						comments.sort((a, b) => {
							const aTs = parseDateValue(a.publishedAt)?.getTime() || 0;
							const bTs = parseDateValue(b.publishedAt)?.getTime() || 0;
							return aTs - bTs;
						});
					}
					return result;
				})
				.catch((error) => {
					console.error('Failed to fetch webmention replies for feed enrichment', error);
					return new Map<string, ReplyComment[]>();
				});

			const collections = (await sonicGetCollectionsCached(backendOptions)).filter(
				(collection) => !FEED_EXCLUDED_COLLECTIONS.has(String(collection.name || '').toLowerCase())
			);

			const itemsByCollection = await Promise.all(
				collections.map(async (collection) => {
					try {
						const items = await sonicGetContent(collection.name, statusFilter, backendOptions);
						return items.map((item) => {
							const link = `${origin}/${encodeURIComponent(collection.name)}/${encodeURIComponent(item.slug)}`;
							const dataObject = item.data && typeof item.data === 'object' ? (item.data as Record<string, unknown>) : {};
							const title = firstString(
								typeof dataObject.title === 'string' ? dataObject.title : '',
								item.title,
								`${collection.display_name || collection.name}: ${item.slug}`
							);
							const imageUrl = resolveFeedImageUrl(dataObject, origin) || feedProfileImage;
							const description = buildItemDescription(dataObject);
							const replyKey = toTargetKey(collection.name, item.slug);
							const replies = replyCommentsByTarget.get(replyKey) || [];
							const repliesHtml = buildRepliesHtml(replies, origin);
							return {
								collection: collection.name,
								slug: item.slug,
								title,
								description,
								contentHtml: `${buildItemContentHtml(dataObject, description, imageUrl)}${repliesHtml}`,
								imageUrl: imageUrl || undefined,
								link,
								guid: link,
								pubDate: resolvePubDate(dataObject, item),
							} satisfies FeedItem;
						});
					} catch (error) {
						console.error(`Failed to fetch feed items for collection "${collection.name}"`, error);
						return [] as FeedItem[];
					}
				})
			);

			const items = itemsByCollection
				.flat()
				.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
				.slice(0, 200);

			const xml = [
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:webfeeds="http://webfeeds.org/rss/1.0">',
				'<channel>',
				`<title>${xmlEscape(feedTitle)}</title>`,
				`<link>${xmlEscape(origin)}</link>`,
				`<description>${xmlEscape(feedDescription)}</description>`,
				`<atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml" />`,
				feedProfileImage
					? `<image><url>${xmlEscape(feedProfileImage)}</url><title>${xmlEscape(feedTitle)}</title><link>${xmlEscape(origin)}</link><width>144</width><height>144</height></image>`
					: '',
				feedProfileImage ? `<itunes:image href="${xmlEscape(feedProfileImage)}" />` : '',
				feedProfileImage ? `<webfeeds:icon>${xmlEscape(feedProfileImage)}</webfeeds:icon>` : '',
				feedProfileImage ? `<webfeeds:logo>${xmlEscape(feedProfileImage)}</webfeeds:logo>` : '',
				...items.map(
					(item) =>
						[
							'<item>',
							`<title>${xmlEscape(item.title)}</title>`,
							`<link>${xmlEscape(item.link)}</link>`,
							`<guid isPermaLink="true">${xmlEscape(item.guid)}</guid>`,
							`<category>${xmlEscape(item.collection)}</category>`,
							`<pubDate>${xmlEscape(item.pubDate)}</pubDate>`,
							`<description>${xmlEscape(item.description)}</description>`,
							`<content:encoded>${toCdata(item.contentHtml)}</content:encoded>`,
							item.imageUrl
								? `<enclosure url="${xmlEscape(item.imageUrl)}" type="${xmlEscape(guessImageMimeType(item.imageUrl))}" />`
								: '',
							item.imageUrl ? `<media:content url="${xmlEscape(item.imageUrl)}" medium="image" />` : '',
							'</item>',
						].join('')
				),
				'</channel>',
				'</rss>',
			].join('');

			c.header('content-type', 'application/rss+xml; charset=UTF-8');
			return c.body(xml);
		} catch (error) {
			console.error(error);
			return c.json({ error: 'Internal Server Error' }, 500);
		}
	});
};
