import type { Hono } from 'hono';
import type { AuthUser } from '../utils/auth';
import { resolveBackendRequestOptions } from '../utils/backend';
import type { ContentAuthDeps } from './auth.shared';

export const registerContentAuthRoutes = (app: Hono, deps: ContentAuthDeps): void => {
	app.get('/dashboard', deps.requireAuth, (c) => {
		const user = c.get('authUser') as AuthUser;
		const backendOptions = resolveBackendRequestOptions(c);
		return Promise.all([
			deps.resolveBaseCollections(backendOptions),
			deps.loadDashboardContent(backendOptions).catch(() => []),
			deps.loadCollectionTitleMap(backendOptions).catch(() => new Map<string, string>()),
			deps.loadCollectionMetaMap(backendOptions).catch(() => new Map()),
		]).then(async ([baseCollections, items, collectionTitles, collectionMetaMap]) => {
			const pendingWebmentions = deps.resolvePendingWebmentions(items, collectionMetaMap);
			const collectionSections = deps.groupDashboardItemsByCollection(items, collectionTitles, deps.systemCollectionNames);
			const webmentionActionSuccess =
				c.req.query('wmApproved') === '1'
					? c.req.query('trusted') === '1'
						? 'Webmention approved and source domain trusted.'
						: 'Webmention approved.'
					: undefined;
			return c.html(
				deps.render(deps.dashboardTemplate, {
					title: 'Dashboard',
					isAuthenticated: true,
					authUser: user,
					user,
					collectionSections,
					hasCollectionSections: collectionSections.length > 0,
					pendingWebmentions,
					hasPendingWebmentions: pendingWebmentions.length > 0,
					webmentionActionSuccess,
					contentError: undefined,
					collections: baseCollections,
				}),
			);
		});
	});

	app.post('/dashboard/webmentions/:id/approve', deps.requireAuth, async (c) => {
		const id = String(c.req.param('id') ?? '').trim();
		const token = deps.getToken(c);
		if (!token) return c.redirect('/login?redirect=%2Fdashboard');
		if (!id) return c.redirect('/dashboard');

		try {
			const formData = await c.req.formData();
			const trustDomain = String(formData.get('trustDomain') ?? '') === '1';
			const backendOptions = resolveBackendRequestOptions(c);
			const metaMap = await deps.loadCollectionMetaMap(backendOptions);
			await deps.approveWebmentionById(token, metaMap, id, trustDomain, backendOptions);
			return c.redirect(`/dashboard?wmApproved=1${trustDomain ? '&trusted=1' : ''}`);
		} catch (error) {
			console.error(error);
			return c.redirect('/dashboard');
		}
	});
};
