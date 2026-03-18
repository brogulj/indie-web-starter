import type { Hono } from 'hono';
import { render } from '../render';
import { resolveCollectionArchiveCollections, resolvePageCollections } from '../services/required-collections';
import { defaultCollectionArchiveTemplate } from '../templates/collections-archive/default';
import { collectionArchiveTemplates } from '../templates/collections-archive';
import { notFoundTemplate } from '../templates/not-found';
import { pageTemplates } from '../templates/pages';
import { SonicApiError, sonicGetCollectionsCached, sonicGetContent } from '../utils/sonic';
import { buildArchiveItems, toFieldLabel } from '../utils/view-models';

const notFound = (): Response => new Response(render(notFoundTemplate, { title: '404' }), { status: 404, headers: { 'content-type': 'text/html; charset=UTF-8' } });

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

const renderPage = async (page: string): Promise<Response | null> => {
	const pageTemplate = pageTemplates[page];
	if (!pageTemplate) return null;

	const requiredCollections = await resolvePageCollections(page);
	const [collections, hasArchiveTemplate] = await Promise.all([
		sonicGetCollectionsCached().catch((error) => {
			console.error('Failed to load collections while resolving route overlaps', error);
			return [];
		}),
		Promise.resolve(Boolean(collectionArchiveTemplates[page])),
	]);
	const hasCollection = collections.some((collection) => collection.name === page);
	const routeWarning = routeWarningFor(page, hasCollection, hasArchiveTemplate);

	return new Response(
		render(pageTemplate, {
			title: toFieldLabel(page),
			routeWarning,
			collections: requiredCollections,
		}),
		{ headers: { 'content-type': 'text/html; charset=UTF-8' } }
	);
};

const isNotFoundError = (error: unknown): boolean => {
	return error instanceof SonicApiError && error.status === 404;
};

export const registerPageRoutes = (app: Hono): void => {
	app.get('/', async () => {
		const response = await renderPage('home');
		return response ?? notFound();
	});

	app.get('/:page', async (c) => {
		const page = c.req.param('page');
		const pageResponse = await renderPage(page);
		if (pageResponse) return pageResponse;

		try {
			const collections = await sonicGetCollectionsCached();
			const collectionExists = collections.some((collection) => collection.name === page);
			if (!collectionExists) {
				return c.html(render(notFoundTemplate, { title: '404' }), 404);
			}

			const [items, requiredCollections] = await Promise.all([
				sonicGetContent(page),
				resolveCollectionArchiveCollections(page),
			]);
			const archiveItems = buildArchiveItems(page, items);
			return c.html(
				render(collectionArchiveTemplates[page] ?? defaultCollectionArchiveTemplate, {
					title: `${page} Archive`,
					collection: page,
					items: archiveItems,
					collections: requiredCollections,
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
