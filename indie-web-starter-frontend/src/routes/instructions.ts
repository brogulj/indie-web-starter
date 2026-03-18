import type { Hono } from 'hono';
import { render } from '../render';
import { collectionInstructionsTemplate } from '../templates/collection-instructions';
import { notFoundTemplate } from '../templates/not-found';
import { sonicGetCollectionsCached } from '../utils/sonic';
import { buildInstructionFields, toFieldLabel } from '../utils/view-models';

export const registerInstructionRoutes = (app: Hono): void => {
	app.get('/:collection/instructions', async (c) => {
		const collection = c.req.param('collection');

		try {
			const collections = await sonicGetCollectionsCached();
			const selectedCollection = collections.find((item) => item.name === collection);
			if (!selectedCollection) {
				return c.html(render(notFoundTemplate, { title: '404' }), 404);
			}

			const properties = selectedCollection.schema?.properties ?? {};
			const fields = buildInstructionFields(properties);
			const description = selectedCollection.description || 'No collection description provided.';
			const displayName = selectedCollection.display_name || toFieldLabel(collection);

			return c.html(
				render(collectionInstructionsTemplate, {
					title: `${displayName} Mustache Instructions`,
					collection,
					displayName,
					description,
					fields,
				})
			);
		} catch (error) {
			console.error(error);
			return c.json({ error: 'Internal Server Error' }, 500);
		}
	});
};
