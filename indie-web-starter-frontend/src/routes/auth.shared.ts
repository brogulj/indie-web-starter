import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthUser } from '../utils/auth';
import type { BackendRequestOptions } from '../utils/backend';

export type ContentStatus = 'draft' | 'published' | 'archived';

export type DashboardContentItem = {
	id: string;
	collectionId: string;
	title: string;
	slug: string;
	status: ContentStatus;
	createdAt: string;
	updatedAt: string;
	data: Record<string, unknown>;
};

export type DashboardCollectionMeta = {
	id: string;
	name: string;
	displayName: string;
};

export type PendingWebmentionItem = {
	id: string;
	title: string;
	sourceDomain: string;
	mentionType: string;
	targetCollection: string;
	targetSlug: string;
	updatedAt: string;
	collectionPath: string;
};

export type FollowingSourceItem = {
	id: string;
	title: string;
	siteUrl: string;
	feedUrl: string;
	active: boolean;
	updatedAt: string;
	collectionPath: string;
};

export type FollowingFeedItem = {
	sourceTitle: string;
	title: string;
	url: string;
	publishedAt: string;
	summary: string;
	photoUrl?: string;
	authorName?: string;
	authorPhotoUrl?: string;
	authorUrl?: string;
	categories?: string[];
	microformats?: Record<string, unknown>;
};

export type OutboundWebmentionStatus = 'sent' | 'failed' | 'pending';

export type OutboundWebmentionRecord = {
	targetUrl: string;
	targetTitle: string;
	sourceUrl: string;
	mentionType: 'like' | 'reply' | 'repost' | 'mention';
	status: OutboundWebmentionStatus;
	hasSuccessfulLike?: boolean;
	attemptedAt: string;
	errorMessage: string;
	commentText?: string;
	commentHistory?: Array<{ text: string; attemptedAt: string }>;
	outboundUrl?: string;
};

export type InboundReplyRecord = {
	authorName: string;
	authorUrl?: string;
	authorPhoto?: string;
	contentText: string;
	publishedAt: string;
	sourceUrl?: string;
};

export type AuthViewData = {
	isAuthenticated: boolean;
	authUser?: AuthUser;
};

export type RequireAuthHandler = MiddlewareHandler;

export type ContentAuthDeps = {
	requireAuth: RequireAuthHandler;
	getToken: (c: Context) => string | undefined;
	resolveBaseCollections: (options?: BackendRequestOptions) => Promise<unknown>;
	loadDashboardContent: (options?: BackendRequestOptions) => Promise<DashboardContentItem[]>;
	loadCollectionTitleMap: (options?: BackendRequestOptions) => Promise<Map<string, string>>;
	loadCollectionMetaMap: (options?: BackendRequestOptions) => Promise<Map<string, DashboardCollectionMeta>>;
	resolvePendingWebmentions: (
		items: DashboardContentItem[],
		collectionMetaMap: Map<string, DashboardCollectionMeta>
	) => PendingWebmentionItem[];
	groupDashboardItemsByCollection: (
		items: DashboardContentItem[],
		collectionTitles: Map<string, string>,
		excludedCollectionNames: Set<string>
	) => Array<{
		collectionId: string;
		collectionPath: string;
		collectionTitle: string;
		items: Array<DashboardContentItem & { collectionPath: string }>;
	}>;
	systemCollectionNames: Set<string>;
	approveWebmentionById: (
		token: string,
		collectionMetaMap: Map<string, DashboardCollectionMeta>,
		id: string,
		trustDomain: boolean,
		options?: BackendRequestOptions
	) => Promise<void>;
	render: (template: string, view: Record<string, unknown>) => string;
	dashboardTemplate: string;
};

export type FollowAuthDeps = {
	requireAuth: RequireAuthHandler;
	getToken: (c: Context) => string | undefined;
	resolveBaseCollections: (options?: BackendRequestOptions) => Promise<unknown>;
	loadDashboardContent: (options?: BackendRequestOptions) => Promise<DashboardContentItem[]>;
	loadCollectionMetaMap: (options?: BackendRequestOptions) => Promise<Map<string, DashboardCollectionMeta>>;
	resolveFollowingSources: (
		items: DashboardContentItem[],
		collectionMetaMap: Map<string, DashboardCollectionMeta>
	) => FollowingSourceItem[];
	createFollowingSource: (
		token: string,
		collectionMetaMap: Map<string, DashboardCollectionMeta>,
		input: { siteUrl: string; feedUrl?: string; title?: string },
		options?: BackendRequestOptions
	) => Promise<void>;
	removeFollowingSource: (
		token: string,
		collectionMetaMap: Map<string, DashboardCollectionMeta>,
		id: string,
		options?: BackendRequestOptions
	) => Promise<void>;
	render: (template: string, view: Record<string, unknown>) => string;
	followingSourcesTemplate: string;
};

export type FeedAuthDeps = {
	requireAuth: RequireAuthHandler;
	getToken: (c: Context) => string | undefined;
	resolveBaseCollections: (options?: BackendRequestOptions) => Promise<unknown>;
	loadDashboardContent: (options?: BackendRequestOptions) => Promise<DashboardContentItem[]>;
	loadRecentOutboundWebmentions: (options?: BackendRequestOptions) => Promise<DashboardContentItem[]>;
	loadCollectionMetaMap: (options?: BackendRequestOptions) => Promise<Map<string, DashboardCollectionMeta>>;
	resolveFollowingSources: (
		items: DashboardContentItem[],
		collectionMetaMap: Map<string, DashboardCollectionMeta>
	) => FollowingSourceItem[];
	loadFollowingFeedItems: (
		sources: FollowingSourceItem[],
		options?: { currentOrigin?: string; backendOptions?: BackendRequestOptions }
	) => Promise<FollowingFeedItem[]>;
	resolveOutboundWebmentions: (
		items: DashboardContentItem[],
		collectionMetaMap: Map<string, DashboardCollectionMeta>
	) => Map<string, OutboundWebmentionRecord>;
	resolveInboundRepliesByTarget: (
		items: DashboardContentItem[],
		collectionMetaMap: Map<string, DashboardCollectionMeta>
	) => Map<string, InboundReplyRecord[]>;
	mapFollowingFeedItemsForDisplay: (
		items: FollowingFeedItem[],
		outboundByTarget: Map<string, OutboundWebmentionRecord>,
		inboundRepliesByTarget?: Map<string, InboundReplyRecord[]>,
		commentAuthorName?: string
	) => unknown[];
	normalizeUrl: (value: string) => string;
	createOutboundWebmentionRecord: (
		token: string,
		collectionMetaMap: Map<string, DashboardCollectionMeta>,
		input: {
			sourceUrl: string;
			targetUrl: string;
			targetTitle?: string;
			mentionType?: 'mention' | 'reply' | 'like' | 'repost';
			deliveryStatus: OutboundWebmentionStatus;
			endpointUrl?: string;
			responseStatusCode?: number;
			sourceCollection?: string;
			sourceSlug?: string;
			errorMessage?: string;
			commentText?: string;
			mf2PropertyClass?: string;
		},
		options?: BackendRequestOptions
	) => Promise<{ outboundId?: string; outboundUrl?: string }>;
	updateOutboundWebmentionRecord: (
		token: string,
		outboundId: string,
		patch: Record<string, unknown>,
		options?: BackendRequestOptions
	) => Promise<void>;
	sendWebmentionNotification: (
		sourceUrl: string,
		targetUrl: string,
		timeoutMs?: number,
		options?: BackendRequestOptions
	) => Promise<{ endpointUrl: string; responseStatusCode: number }>;
	render: (template: string, view: Record<string, unknown>) => string;
	followingFeedTemplate: string;
};

export type AuthRegistrar<TDeps> = (app: Hono, deps: TDeps) => void;
