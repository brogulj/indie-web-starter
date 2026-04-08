import type { Hono } from 'hono';
import { resolveAuthState } from './auth';
import { render } from '../render';
import { mergeCollectionContentMaps, resolveBaseCollections, resolveCollectionArchiveCollections, resolvePageCollections } from '../services/required-collections';
import { defaultCollectionArchiveTemplate } from '../templates/collections-archive/default';
import { collectionArchiveTemplates } from '../templates/collections-archive';
import { notFoundTemplate } from '../templates/not-found';
import { pageTemplates } from '../templates/pages';
import { type CollectionFilter, SonicApiError, sonicGetCollectionsCached, sonicGetContent } from '../utils/sonic';
import { buildArchiveItems, toFieldLabel } from '../utils/view-models';

const notFound = (): Response => new Response(render(notFoundTemplate, { title: '404' }), { status: 404, headers: { 'content-type': 'text/html; charset=UTF-8' } });
const ARCHIVE_PAGE_SIZE = Number(process.env.ARCHIVE_PAGE_SIZE ?? '10');
const ARCHIVE_STATUS_VALUES = new Set(['draft', 'published', 'archived']);

export const routeWarningFor = (page: string, hasCollection: boolean, hasArchiveTemplate: boolean): string | undefined => {
	if (hasCollection && hasArchiveTemplate) {
		return `Warning: "${page}" matches a page, collection, and collection archive. Showing page template.`;
	}
	if (hasCollection) {
		return `Warning: "${page}" matches both a page and a collection. Showing page template.`;
	}
	if (hasArchiveTemplate) {
		return `Warning: "${page}" matches both a page and a collection archive. Showing page template.`;
	}
	return undefined;
};

const renderPage = async (page: string, auth: { isAuthenticated: boolean; authUser?: unknown }): Promise<Response | null> => {
	const pageTemplate = pageTemplates[page];
	if (!pageTemplate) return null;

	const [baseCollections, pageCollections, collections, hasArchiveTemplate] = await Promise.all([
		resolveBaseCollections(),
		resolvePageCollections(page),
		sonicGetCollectionsCached().catch((error) => {
			console.error('Failed to load collections while resolving route overlaps', error);
			return [];
		}),
		Promise.resolve(Boolean(collectionArchiveTemplates[page])),
	]);
	const requiredCollections = mergeCollectionContentMaps(baseCollections, pageCollections);
	const hasCollection = collections.some((collection) => collection.name === page);
	const routeWarning = routeWarningFor(page, hasCollection, hasArchiveTemplate);

	return new Response(
		render(pageTemplate, {
			title: toFieldLabel(page),
			routeWarning,
			collections: requiredCollections,
			...auth,
		}),
		{ headers: { 'content-type': 'text/html; charset=UTF-8' } }
	);
};

const isNotFoundError = (error: unknown): boolean => {
	return error instanceof SonicApiError && error.status === 404;
};

export const registerPageRoutes = (app: Hono): void => {
	app.get('/', async (c) => {
		const auth = await resolveAuthState(c);
		const response = await renderPage('home', auth);
		return response ?? notFound();
	});

	app.get('/:page', async (c) => {
		const page = c.req.param('page');
		const auth = await resolveAuthState(c);
		const pageResponse = await renderPage(page, auth);
		if (pageResponse) return pageResponse;

		try {
			const collections = await sonicGetCollectionsCached();
			const collectionExists = collections.some((collection) => collection.name === page);
			if (!collectionExists) {
				return c.html(render(notFoundTemplate, { title: '404' }), 404);
			}

			const statusQuery = String(c.req.query('status') ?? '')
				.trim()
				.toLowerCase();
			const allowRequestedStatus = ARCHIVE_STATUS_VALUES.has(statusQuery) && (statusQuery !== 'draft' || auth.isAuthenticated);
			const statusFilters: CollectionFilter[] = allowRequestedStatus
				? [{ field: 'status', operator: 'equals', value: statusQuery }]
				: [{ field: 'status', operator: 'not_equals', value: 'draft' }];

			const [baseCollections, items, requiredCollections] = await Promise.all([
				resolveBaseCollections(),
				sonicGetContent(page, statusFilters),
				resolveCollectionArchiveCollections(page),
			]);
			const requestedPage = Number.parseInt(String(c.req.query('page') ?? '1'), 10);
			const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
			const safePageSize = Number.isFinite(ARCHIVE_PAGE_SIZE) && ARCHIVE_PAGE_SIZE > 0 ? ARCHIVE_PAGE_SIZE : 10;
			const totalItems = items.length;
			const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
			const normalizedPage = Math.min(currentPage, totalPages);
			const startIndex = (normalizedPage - 1) * safePageSize;
			const pagedItems = items.slice(startIndex, startIndex + safePageSize);
			const buildPageUrl = (nextPage: number): string => {
				const params = new URLSearchParams();
				if (nextPage > 1) params.set('page', String(nextPage));
				if (ARCHIVE_STATUS_VALUES.has(statusQuery)) params.set('status', statusQuery);
				const query = params.toString();
				return query ? `/${encodeURIComponent(page)}?${query}` : `/${encodeURIComponent(page)}`;
			};
			const mergedCollections = mergeCollectionContentMaps(baseCollections, requiredCollections);
			const archiveItems = buildArchiveItems(page, pagedItems);
			return c.html(
				render(collectionArchiveTemplates[page] ?? defaultCollectionArchiveTemplate, {
					title: `${page} Archive`,
					collection: page,
					items: archiveItems,
					totalItems,
					pageSize: safePageSize,
					currentPage: normalizedPage,
					totalPages,
					hasPreviousPage: normalizedPage > 1,
					hasNextPage: normalizedPage < totalPages,
					previousPageUrl: buildPageUrl(normalizedPage - 1),
					nextPageUrl: buildPageUrl(normalizedPage + 1),
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

	app.get('/:page/', async (c) => {
		const page = c.req.param('page');
		return c.redirect(`/${encodeURIComponent(page)}`, 301);
	});
};
