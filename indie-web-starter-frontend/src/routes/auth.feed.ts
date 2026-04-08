import type { Context, Hono } from 'hono';
import type { AuthUser } from '../utils/auth';
import { resolveBackendRequestOptions } from '../utils/backend';
import type { FeedAuthDeps } from './auth.shared';

export const registerFeedAuthRoutes = (app: Hono, deps: FeedAuthDeps): void => {
	app.get('/dashboard/following/feed', deps.requireAuth, (c) => {
		const user = c.get('authUser') as AuthUser;
		const token = deps.getToken(c);
		const backendOptions = resolveBackendRequestOptions(c);
		return Promise.all([
			deps.resolveBaseCollections(backendOptions),
			deps.loadDashboardContent(backendOptions).catch(() => []),
			deps.loadRecentOutboundWebmentions(backendOptions).catch(() => []),
			deps.loadCollectionMetaMap(backendOptions).catch(() => new Map()),
		]).then(async ([baseCollections, items, recentOutboundItems, collectionMetaMap]) => {
			const mergedItems = (() => {
				if (recentOutboundItems.length === 0) return items;
				const byId = new Map<string, (typeof items)[number]>();
				for (const item of recentOutboundItems) {
					byId.set(item.id, item);
				}
				for (const item of items) {
					if (!byId.has(item.id)) byId.set(item.id, item);
				}
				return Array.from(byId.values());
			})();
			const followingSources = deps.resolveFollowingSources(mergedItems, collectionMetaMap);
			const backendOptions = resolveBackendRequestOptions(c);
			const followingFeedItems = token
				? await deps.loadFollowingFeedItems(followingSources, {
						currentOrigin: new URL(c.req.url).origin,
						backendOptions,
					})
				: [];
			const outboundByTarget = deps.resolveOutboundWebmentions(mergedItems, collectionMetaMap);
			const inboundRepliesByTarget = deps.resolveInboundRepliesByTarget(mergedItems, collectionMetaMap);
			const wmType = String(c.req.query('wmType') ?? '').trim();
			const webmentionActionSuccess =
				c.req.query('wmSent') === '1'
					? wmType === 'like'
						? 'Like sent as a webmention.'
						: wmType === 'reply'
						? 'Comment sent as a reply webmention.'
						: 'Outbound webmention created and sent.'
					: undefined;
			const webmentionActionError = String(c.req.query('wmError') ?? '').trim() || undefined;
			const commentAuthorName = user.username || user.email || 'You';
			const displayItems = deps.mapFollowingFeedItemsForDisplay(
				followingFeedItems,
				outboundByTarget,
				inboundRepliesByTarget,
				commentAuthorName
			);
			return c.html(
				deps.render(deps.followingFeedTemplate, {
					title: 'Following Feed',
					isAuthenticated: true,
					authUser: user,
					user,
					followingFeedItems: displayItems,
					hasFollowingFeedItems: displayItems.length > 0,
					webmentionActionSuccess,
					webmentionActionError,
					collections: baseCollections,
				}),
			);
		});
	});

	const handleFeedWebmentionAction = async (
		c: Context,
		action: 'like' | 'reply'
	): Promise<Response> => {
		const wantsJson = (c.req.header('accept') || '').toLowerCase().includes('application/json');
		const token = deps.getToken(c);
		if (!token) {
			return wantsJson
				? c.json({ ok: false, error: 'Not authenticated' }, 401)
				: c.redirect('/login?redirect=%2Fdashboard%2Ffollowing%2Ffeed');
		}

		const formData = await c.req.formData();
		const targetRaw = String(formData.get('targetUrl') ?? '').trim();
		const targetTitle = String(formData.get('targetTitle') ?? '').trim();
		const commentText = String(formData.get('commentText') ?? '').trim();
		if (!targetRaw) {
			return wantsJson
				? c.json({ ok: false, error: 'Target URL is required.' }, 400)
				: c.redirect('/dashboard/following/feed?wmError=Target%20URL%20is%20required.');
		}
		if (action === 'reply' && commentText.length < 2) {
			return wantsJson
				? c.json({ ok: false, error: 'Comment must be at least 2 characters.' }, 400)
				: c.redirect('/dashboard/following/feed?wmError=Comment%20must%20be%20at%20least%202%20characters.');
		}

		let targetUrl: string;
		try {
			targetUrl = deps.normalizeUrl(targetRaw);
		} catch {
			return wantsJson
				? c.json({ ok: false, error: 'Invalid target URL.' }, 400)
				: c.redirect('/dashboard/following/feed?wmError=Invalid%20target%20URL.');
		}
		const backendOptions = resolveBackendRequestOptions(c);
		const metaMap = await deps.loadCollectionMetaMap(backendOptions);
		const actionType = action === 'like' ? 'like' : 'reply';
		const mf2PropertyClass = action === 'like' ? 'u-like-of' : 'u-in-reply-to';
		const created = await deps.createOutboundWebmentionRecord(token, metaMap, {
			sourceUrl: '',
			targetUrl,
			targetTitle,
			mentionType: actionType,
			deliveryStatus: 'pending',
			sourceCollection: 'outbound-webmentions',
			sourceSlug: '',
			commentText: action === 'reply' ? commentText : '',
			mf2PropertyClass,
		}, backendOptions);
		if (!created.outboundId || !created.outboundUrl) {
			const message = 'Failed to create outbound webmention source.';
			return wantsJson
				? c.json({ ok: false, error: message, mentionType: actionType, status: 'failed' }, 500)
				: c.redirect(`/dashboard/following/feed?wmError=${encodeURIComponent(message)}`);
		}
		const sourceUrl = `${new URL(c.req.url).origin}${created.outboundUrl}`;
		await deps.updateOutboundWebmentionRecord(token, created.outboundId, {
			sourceUrl,
			sourceCollection: 'outbound-webmentions',
			sourceSlug: created.outboundUrl.split('/').pop() || '',
			mf2PropertyClass,
			errorMessage: '',
		}, backendOptions);

		try {
			const delivery = await deps.sendWebmentionNotification(sourceUrl, targetUrl, 6000, backendOptions);
			await deps.updateOutboundWebmentionRecord(token, created.outboundId, {
				sourceUrl,
				mentionType: actionType,
				deliveryStatus: 'sent',
				endpointUrl: delivery.endpointUrl,
				responseStatusCode: delivery.responseStatusCode,
				errorMessage: '',
			}, backendOptions);
			return wantsJson
				? c.json({ ok: true, mentionType: actionType, status: 'sent', outboundUrl: created.outboundUrl })
				: c.redirect(`/dashboard/following/feed?wmSent=1&wmType=${actionType}`);
		} catch (error) {
			const rawMessage = error instanceof Error && error.message ? error.message : 'Failed to send webmention.';
			const sanitized = rawMessage.length > 140 ? `${rawMessage.slice(0, 140)}...` : rawMessage;
			await deps.updateOutboundWebmentionRecord(token, created.outboundId, {
				sourceUrl,
				mentionType: actionType,
				deliveryStatus: 'failed',
				errorMessage: sanitized,
			}, backendOptions);
			return wantsJson
				? c.json(
						{ ok: false, error: sanitized, mentionType: actionType, status: 'failed', outboundUrl: created.outboundUrl },
						502
					)
				: c.redirect(`/dashboard/following/feed?wmError=${encodeURIComponent(sanitized)}`);
		}
	};

	app.post('/dashboard/following/feed/like', deps.requireAuth, async (c) => handleFeedWebmentionAction(c, 'like'));
	app.post('/dashboard/following/feed/comment', deps.requireAuth, async (c) => handleFeedWebmentionAction(c, 'reply'));
};
