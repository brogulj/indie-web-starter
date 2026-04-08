import type { Hono } from 'hono';
import { resolveAuthState } from './auth';
import { render } from '../render';
import { mergeCollectionContentMaps, resolveBaseCollections, resolveCollectionItemCollections } from '../services/required-collections';
import { collectionContentTemplate } from '../templates/collection-content';
import { collectionTemplates } from '../templates/collections';
import { notFoundTemplate } from '../templates/not-found';
import { SonicApiError, sonicGetCollections, sonicGetContentBySlug, sonicRenderRichTextFields } from '../utils/sonic';
import { buildFieldView } from '../utils/view-models';
import { getApprovedWebmentions } from '../utils/webmentions';

type CollectionRouteOptions = {
	renderMarkdown: (value: string) => string;
	renderInlineMarkdown: (value: string) => string;
};

const renderTitleMarkdown = (value: string, options: CollectionRouteOptions): string => {
	const inlineHtml = options.renderInlineMarkdown(value).trim();
	if (inlineHtml !== value.trim()) {
		return inlineHtml;
	}

	const blockHtml = options.renderMarkdown(value).trim();
	const paragraphMatch = blockHtml.match(/^<p>([\s\S]*)<\/p>$/i);
	return paragraphMatch ? paragraphMatch[1] : blockHtml;
};

const isNotFoundError = (error: unknown): boolean => {
	return error instanceof SonicApiError && error.status === 404;
};

const toHost = (urlValue: string | undefined): string => {
	if (!urlValue) return '';
	try {
		return new URL(urlValue).hostname.toLowerCase();
	} catch {
		return '';
	}
};

export const registerCollectionRoutes = (app: Hono, options: CollectionRouteOptions): void => {
	app.get('/api/collections', async (c) => {
		try {
			const collections = await sonicGetCollections();
			return c.json({ collections });
		} catch (error) {
			console.error(error);
			return c.json({ error: 'Internal Server Error' }, 500);
		}
	});

	app.get('/:collection/:slug', async (c) => {
		const collection = c.req.param('collection');
		const slug = c.req.param('slug');
		if (!slug) {
			return c.redirect(`/${encodeURIComponent(collection)}`, 301);
		}
		const auth = await resolveAuthState(c);

		try {
			const content = await sonicGetContentBySlug(collection, slug);
			if (!content) {
				return c.html(render(notFoundTemplate, { title: '404' }), 404);
			}

			const renderedData = await sonicRenderRichTextFields(collection, content.data, options.renderMarkdown);
			const dataWithRenderedTitle = { ...renderedData } as Record<string, unknown>;
			const rawDataTitle = typeof dataWithRenderedTitle.title === 'string' ? dataWithRenderedTitle.title : undefined;
			const rawRootTitle = typeof content.title === 'string' ? content.title : undefined;
			const rawTitle = rawDataTitle ?? rawRootTitle;
			if (rawTitle && !dataWithRenderedTitle.titleHtml) {
				dataWithRenderedTitle.titleHtml = renderTitleMarkdown(rawTitle, options);
			}
			const canonicalUrl = new URL(`/${encodeURIComponent(collection)}/${encodeURIComponent(slug)}`, c.req.url).toString();
			const [baseCollections, requiredCollections, template, webmentionData] = await Promise.all([
				resolveBaseCollections(),
				resolveCollectionItemCollections(collection),
				Promise.resolve(collectionTemplates[collection] ?? collectionContentTemplate),
				getApprovedWebmentions(canonicalUrl),
			]);
			const mergedCollections = mergeCollectionContentMaps(baseCollections, requiredCollections);
			const fields = buildFieldView(dataWithRenderedTitle);
			const mentionType = typeof dataWithRenderedTitle.mentionType === 'string' ? dataWithRenderedTitle.mentionType : '';
			const webmentions = webmentionData.mentions.map((item) => ({
				...item,
				isReply: item.mentionType === 'reply',
				isMention: item.mentionType === 'mention',
				isLike: item.mentionType === 'like',
				isRepost: item.mentionType === 'repost',
				displayAuthor: item.authorName || item.sourceDomain || 'Unknown author',
				displayDomain: item.sourceDomain || toHost(item.sourceUrl) || toHost(item.authorUrl) || 'unknown domain',
				displayDate: item.publishedAt || '',
				displayUrl: item.authorUrl || item.sourceUrl || '',
			}));

			return c.html(
				render(template, {
					...content,
					title: content.title || `${collection}: ${slug}`,
					titleHtml: rawTitle ? renderTitleMarkdown(rawTitle, options) : undefined,
					collection,
					slug,
					data: dataWithRenderedTitle,
					fields,
					canonicalUrl,
					webmentionEndpoint: new URL('/webmention', c.req.url).toString(),
					siteAuthorName: process.env.SITE_AUTHOR_NAME ?? 'Site Author',
					siteAuthorUrl: process.env.SITE_AUTHOR_URL ?? new URL('/', c.req.url).toString(),
					isLike: mentionType === 'like',
					isReply: mentionType === 'reply',
					isMention: mentionType !== 'like' && mentionType !== 'reply',
					webmentions,
					webmentionCounts: webmentionData.counts,
					collections: mergedCollections,
					...auth,
				})
			);
		} catch (error) {
			console.error(error);
			if (isNotFoundError(error)) {
				return c.html(render(notFoundTemplate, { title: '404' }), 404);
			}
			return c.json({ error: 'Internal Server Error' }, 500);
		}
	});
};
