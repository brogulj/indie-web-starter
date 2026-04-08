import type { Hono } from 'hono';
import type { AuthUser } from '../utils/auth';
import { resolveBackendRequestOptions } from '../utils/backend';
import type { FollowAuthDeps } from './auth.shared';

export const registerFollowAuthRoutes = (app: Hono, deps: FollowAuthDeps): void => {
	app.get('/dashboard/following', deps.requireAuth, (c) => {
		const user = c.get('authUser') as AuthUser;
		const backendOptions = resolveBackendRequestOptions(c);
		return Promise.all([
			deps.resolveBaseCollections(backendOptions),
			deps.loadDashboardContent(backendOptions).catch(() => []),
			deps.loadCollectionMetaMap(backendOptions).catch(() => new Map()),
		]).then(async ([baseCollections, items, collectionMetaMap]) => {
			const followingSources = deps.resolveFollowingSources(items, collectionMetaMap);
			const followingActionSuccess =
				c.req.query('followSaved') === '1'
					? 'Following source saved.'
					: c.req.query('followRemoved') === '1'
					? 'Following source removed.'
					: undefined;
			return c.html(
				deps.render(deps.followingSourcesTemplate, {
					title: 'Following Sources',
					isAuthenticated: true,
					authUser: user,
					user,
					followingSources,
					hasFollowingSources: followingSources.length > 0,
					followingActionSuccess,
					collections: baseCollections,
				}),
			);
		});
	});

	app.post('/dashboard/following/add', deps.requireAuth, async (c) => {
		const token = deps.getToken(c);
		if (!token) return c.redirect('/login?redirect=%2Fdashboard%2Ffollowing');

		try {
			const formData = await c.req.formData();
			const siteUrl = String(formData.get('siteUrl') ?? '').trim();
			const feedUrl = String(formData.get('feedUrl') ?? '').trim();
			const title = String(formData.get('title') ?? '').trim();
			if (!siteUrl) {
				return c.redirect('/dashboard/following');
			}
			const backendOptions = resolveBackendRequestOptions(c);
			const metaMap = await deps.loadCollectionMetaMap(backendOptions);
			await deps.createFollowingSource(token, metaMap, { siteUrl, feedUrl: feedUrl || undefined, title: title || undefined }, backendOptions);
			return c.redirect('/dashboard/following?followSaved=1');
		} catch (error) {
			console.error(error);
			return c.redirect('/dashboard/following');
		}
	});

	app.post('/dashboard/following/:id/remove', deps.requireAuth, async (c) => {
		const token = deps.getToken(c);
		const id = String(c.req.param('id') ?? '').trim();
		if (!token) return c.redirect('/login?redirect=%2Fdashboard%2Ffollowing');
		if (!id) return c.redirect('/dashboard/following');

		try {
			const backendOptions = resolveBackendRequestOptions(c);
			const metaMap = await deps.loadCollectionMetaMap(backendOptions);
			await deps.removeFollowingSource(token, metaMap, id, backendOptions);
			return c.redirect('/dashboard/following?followRemoved=1');
		} catch (error) {
			console.error(error);
			return c.redirect('/dashboard/following');
		}
	});
};
