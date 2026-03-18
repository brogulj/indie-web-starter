import type { Hono } from 'hono';
import { render } from '../render';
import { resolveCollectionItemCollections } from '../services/required-collections';
import { collectionContentTemplate } from '../templates/collection-content';
import { collectionTemplates } from '../templates/collections';
import { notFoundTemplate } from '../templates/not-found';
import { SonicApiError, sonicGetCollections, sonicGetContentBySlug, sonicRenderRichTextFields } from '../utils/sonic';
import { buildFieldView } from '../utils/view-models';

type CollectionRouteOptions = {
	renderMarkdown: (value: string) => string;
};

const isNotFoundError = (error: unknown): boolean => {
	return error instanceof SonicApiError && error.status === 404;
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

		try {
			const content = await sonicGetContentBySlug(collection, slug);
			if (!content) {
				return c.html(render(notFoundTemplate, { title: '404' }), 404);
			}

			const renderedData = await sonicRenderRichTextFields(collection, content.data, options.renderMarkdown);
			const [requiredCollections, template] = await Promise.all([
				resolveCollectionItemCollections(collection),
				Promise.resolve(collectionTemplates[collection] ?? collectionContentTemplate),
			]);
			const fields = buildFieldView(renderedData);

			return c.html(
				render(template, {
					...content,
					title: content.title || `${collection}: ${slug}`,
					collection,
					slug,
					data: renderedData,
					fields,
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
