import type { Hono } from 'hono';
import type { AuthUser } from '../utils/auth';
import { resolveBackendRequestOptions } from '../utils/backend';
import type { ContentAuthDeps } from './auth.shared';

type DashboardOverviewMetrics = {
	totalItems: number;
	totalDrafts: number;
	recentlyUpdated: number;
};

type DashboardCollectionSummary = {
	collectionId: string;
	collectionPath: string;
	collectionTitle: string;
	itemCount: number;
	draftCount: number;
	lastUpdatedDisplay: string;
};

const toTimestamp = (value: string): number => {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const toDateLabel = (value: string): string => {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return 'Unknown';
	return parsed.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
};

const normalizeTitle = (value: string): string => {
	const trimmed = String(value || '').trim();
	return trimmed || 'Untitled';
};

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
			const flattenedItems = collectionSections
				.flatMap((section) =>
					section.items.map((item) => ({
						...item,
						collectionTitle: section.collectionTitle,
						collectionPath: section.collectionPath,
					}))
				)
				.sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt));
			const totalItems = flattenedItems.length;
			const totalDrafts = flattenedItems.filter((item) => item.status === 'draft').length;
			const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
			const recentlyUpdated = flattenedItems.filter((item) => toTimestamp(item.updatedAt) >= sevenDaysAgo).length;

			const collectionSummaries: DashboardCollectionSummary[] = collectionSections.map((section) => {
				const sortedByUpdated = [...section.items].sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt));
				const latest = sortedByUpdated[0];
				return {
					collectionId: section.collectionId,
					collectionPath: section.collectionPath,
					collectionTitle: section.collectionTitle,
					itemCount: section.items.length,
					draftCount: section.items.filter((item) => item.status === 'draft').length,
					lastUpdatedDisplay: latest ? toDateLabel(latest.updatedAt) : 'Never',
				};
			});
			const overviewMetrics: DashboardOverviewMetrics = {
				totalItems,
				totalDrafts,
				recentlyUpdated,
			};

			const followingCollection = Array.from(collectionMetaMap.values()).find((meta) => meta.name === 'following-sources');
			const followingSourcesCount = followingCollection
				? items.filter((item) => {
						const sameCollection = item.collectionId === followingCollection.id || item.collectionId === followingCollection.name;
						if (!sameCollection) return false;
						if (typeof item.data.active === 'boolean') return item.data.active;
						return true;
					}).length
				: 0;

			const webmentionActionSuccess =
				c.req.query('wmApproved') === '1'
					? c.req.query('trusted') === '1'
						? 'Webmention approved and source domain trusted.'
						: 'Webmention approved.'
					: undefined;
			return c.html(
				deps.render(deps.dashboardTemplate, {
					title: 'Dashboard',
					pageTitle: 'Dashboard',
					pageDescription: 'Create and manage content with quick visibility into collection health.',
					hasPrimaryAction: true,
					primaryActionHref: '/dashboard/content/new',
					primaryActionLabel: 'New Content',
					navOverviewActive: true,
					navCollectionsActive: false,
					navFollowingActive: false,
					navFeedActive: false,
					isAuthenticated: true,
					authUser: user,
					user,
					overviewMetrics,
					recentContentItems: flattenedItems.slice(0, 8).map((item) => ({
						...item,
						displayTitle: normalizeTitle(item.title),
						updatedAt: toDateLabel(item.updatedAt),
					})),
					hasRecentContentItems: flattenedItems.length > 0,
					collectionSummaries,
					hasCollectionSummaries: collectionSummaries.length > 0,
					pendingWebmentionPreview: pendingWebmentions.slice(0, 5),
					hasPendingWebmentionPreview: pendingWebmentions.length > 0,
					pendingWebmentionsCount: pendingWebmentions.length,
					followingSourcesCount,
					flashSuccess: webmentionActionSuccess,
					flashError: undefined,
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
