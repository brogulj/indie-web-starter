import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { registerContentAuthRoutes } from './auth.content';
import { registerFeedAuthRoutes } from './auth.feed';
import { registerFollowAuthRoutes } from './auth.follow';
import { render } from '../render';
import { resolveBaseCollections } from '../services/required-collections';
import { dashboardFlashTemplate, dashboardLocalNavTemplate, dashboardPageHeaderTemplate } from '../templates/dashboard-shell';
import type { AuthUser } from '../utils/auth';
import { AuthApiError, authGetCurrentUser, authLogin } from '../utils/auth';
import { sonicGetCollectionsCached, sonicGetContent, type CollectionFilter } from '../utils/sonic';
import { fetchBackend, resolveBackendRequestOptions, type BackendRequestOptions } from '../utils/backend';

const AUTH_COOKIE_NAME = 'auth_token';
const REQUEST_TIMEOUT_MS = Number(process.env.SONIC_TIMEOUT_MS ?? '8000');

type ContentStatus = 'draft' | 'published' | 'archived';

type DashboardContentItem = {
	id: string;
	collectionId: string;
	title: string;
	slug: string;
	status: ContentStatus;
	createdAt: string;
	updatedAt: string;
	data: Record<string, unknown>;
};

type DashboardCollectionMeta = {
	id: string;
	name: string;
	displayName: string;
};

type PendingWebmentionItem = {
	id: string;
	title: string;
	sourceDomain: string;
	mentionType: string;
	targetCollection: string;
	targetSlug: string;
	updatedAt: string;
	collectionPath: string;
};

type FollowingSourceItem = {
	id: string;
	title: string;
	siteUrl: string;
	feedUrl: string;
	active: boolean;
	updatedAt: string;
	collectionPath: string;
};

type FollowingFeedItem = {
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
	webmentionEndpoint?: string;
	hasWebmentionEndpoint?: boolean;
	inboundRepliesFromFeed?: InboundReplyRecord[];
};

type DomElementLike = {
	localName?: string | null;
	tagName?: string | null;
	textContent?: string | null;
	innerHTML?: string | null;
	children?: Iterable<unknown> | ArrayLike<unknown>;
	parentElement?: DomElementLike | null;
	getAttribute?: (name: string) => string | null | undefined;
	querySelectorAll?: (selectors: string) => Iterable<unknown> | ArrayLike<unknown>;
	querySelector?: (selectors: string) => unknown;
};

type DomDocumentLike = {
	documentElement?: DomElementLike | null;
	getElementsByTagName?: (name: string) => Iterable<unknown> | ArrayLike<unknown>;
	querySelectorAll?: (selectors: string) => Iterable<unknown> | ArrayLike<unknown>;
	querySelector?: (selectors: string) => unknown;
};

type DomParserLike = {
	parseFromString: (input: string, mimeType: string) => DomDocumentLike;
};

type DomParserConstructor = new () => DomParserLike;

const asDomElement = (value: unknown): DomElementLike | null => {
	if (!value || typeof value !== 'object') return null;
	const maybeElement = value as DomElementLike;
	if (
		typeof maybeElement.getAttribute === 'function' ||
		typeof maybeElement.querySelector === 'function' ||
		typeof maybeElement.localName === 'string' ||
		typeof maybeElement.tagName === 'string'
	) {
		return maybeElement;
	}
	return null;
};

const toDomElements = (value: Iterable<unknown> | ArrayLike<unknown> | null | undefined): DomElementLike[] =>
	Array.from(value ?? [])
		.map((entry) => asDomElement(entry))
		.filter((entry): entry is DomElementLike => entry !== null);

const getDomElementName = (element: DomElementLike): string => (element.localName || element.tagName || '').toLowerCase();

type OutboundWebmentionStatus = 'sent' | 'failed' | 'pending';

type OutboundWebmentionRecord = {
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

type InboundReplyRecord = {
	authorName: string;
	authorUrl?: string;
	authorPhoto?: string;
	contentText: string;
	publishedAt: string;
	sourceUrl?: string;
};

const SYSTEM_COLLECTION_NAMES = new Set([
	'webmentions',
	'web mentions',
	'trusted-webmention-domains',
	'trusted webmention domains',
	'following-sources',
	'following sources',
	'outbound-webmentions',
	'outbound webmentions',
]);
const WEBMENTION_SOURCE_READY_MAX_ATTEMPTS = Math.max(8, Number(process.env.WEBMENTION_SOURCE_READY_MAX_ATTEMPTS ?? '24'));
const WEBMENTION_SOURCE_READY_BASE_DELAY_MS = Math.max(150, Number(process.env.WEBMENTION_SOURCE_READY_BASE_DELAY_MS ?? '300'));
const WEBMENTION_SOURCE_READY_MAX_DELAY_MS = Math.max(
	WEBMENTION_SOURCE_READY_BASE_DELAY_MS,
	Number(process.env.WEBMENTION_SOURCE_READY_MAX_DELAY_MS ?? '2500')
);

class ContentApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'ContentApiError';
		this.status = status;
	}
}

const loginTemplate = /* html */ `
<section class="border border-gray-300 p-4">
  <h1 class="text-2xl font-semibold">Sign In</h1>
  <p class="mt-2 text-sm text-gray-700">Use your account to continue.</p>

  {{#authError}}
  <p class="mt-3 border border-red-300 bg-red-50 p-2 text-sm text-red-700">{{authError}}</p>
  {{/authError}}

  <form method="post" action="/login{{#redirectTarget}}?redirect={{redirectTarget}}{{/redirectTarget}}" class="mt-4 space-y-3">
    <label class="block text-sm">
      <span class="mb-1 block">Email</span>
      <input name="email" type="email" required value="{{email}}" class="w-full border border-gray-300 px-3 py-2" />
    </label>

    <label class="block text-sm">
      <span class="mb-1 block">Password</span>
      <input name="password" type="password" required class="w-full border border-gray-300 px-3 py-2" />
    </label>

    <button type="submit" class="border border-gray-300 bg-gray-100 px-4 py-2 text-sm">Login</button>
  </form>
</section>
`;

const dashboardTemplate = /* html */ `
<section class="space-y-6">
  ${dashboardLocalNavTemplate}
  ${dashboardPageHeaderTemplate}
  ${dashboardFlashTemplate}

  <section class="rounded-lg border border-gray-200 bg-white p-4" aria-label="Summary">
    <h2 class="text-lg font-semibold">Content Overview</h2>
    <div class="mt-3 grid gap-3 sm:grid-cols-3">
      <article class="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p class="text-xs uppercase tracking-wide text-gray-600">Total items</p>
        <p class="mt-1 text-2xl font-semibold text-gray-900">{{overviewMetrics.totalItems}}</p>
      </article>
      <article class="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p class="text-xs uppercase tracking-wide text-gray-600">Drafts</p>
        <p class="mt-1 text-2xl font-semibold text-gray-900">{{overviewMetrics.totalDrafts}}</p>
      </article>
      <article class="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p class="text-xs uppercase tracking-wide text-gray-600">Updated in 7 days</p>
        <p class="mt-1 text-2xl font-semibold text-gray-900">{{overviewMetrics.recentlyUpdated}}</p>
      </article>
    </div>

    {{#hasRecentContentItems}}
    <div class="mt-4">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Recently Updated</h3>
      <ul class="mt-2 divide-y divide-gray-200 rounded-md border border-gray-200">
        {{#recentContentItems}}
        <li class="flex flex-wrap items-center justify-between gap-2 p-3">
          <div>
            <a class="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2" href="/dashboard/{{collectionPath}}/{{id}}">{{displayTitle}}</a>
            <p class="mt-0.5 text-sm text-gray-600">{{collectionTitle}} · {{status}} · {{updatedAt}}</p>
          </div>
          <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50" href="/dashboard/{{collectionPath}}/{{id}}">View / Edit</a>
        </li>
        {{/recentContentItems}}
      </ul>
    </div>
    {{/hasRecentContentItems}}
  </section>

  <section id="collections" class="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-label="Collections">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">Collections Overview</h2>
      <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50" href="/dashboard/content/new">New Content</a>
    </div>
    <p class="mt-1 text-sm text-gray-700">Jump into a collection to manage items in detail.</p>

    {{#hasCollectionSummaries}}
    <div class="mt-4 grid gap-3 md:grid-cols-2">
      {{#collectionSummaries}}
      <article class="rounded-md border border-gray-200 bg-gray-50 p-3">
        <h3 class="text-base font-semibold text-gray-900">{{collectionTitle}}</h3>
        <p class="mt-1 text-sm text-gray-600">{{itemCount}} items · {{draftCount}} drafts</p>
        <p class="mt-1 text-sm text-gray-600">Last updated: {{lastUpdatedDisplay}}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50" href="/dashboard/{{collectionPath}}">Open</a>
          <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50" href="/dashboard/{{collectionPath}}/new">New</a>
        </div>
      </article>
      {{/collectionSummaries}}
    </div>
    {{/hasCollectionSummaries}}

    {{^hasCollectionSummaries}}
    <p class="mt-3 text-sm text-gray-600">No content found.</p>
    {{/hasCollectionSummaries}}
  </section>

  <section class="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-label="Secondary operations">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">Secondary Operations</h2>
    </div>

    <div class="mt-3 grid gap-3 lg:grid-cols-2">
      <article class="rounded-md border border-gray-200 bg-gray-50 p-3">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Following</h3>
        <p class="mt-1 text-sm text-gray-700">{{followingSourcesCount}} active sources.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50" href="/dashboard/following">Manage Sources</a>
          <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50" href="/dashboard/following/feed">Open Feed</a>
        </div>
      </article>

      <article class="rounded-md border border-gray-200 bg-gray-50 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Webmention Moderation</h3>
          <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50" href="/dashboard/webmentions">Open Collection</a>
        </div>
        <p class="mt-1 text-sm text-gray-700">{{pendingWebmentionsCount}} pending items.</p>
        {{#hasPendingWebmentionPreview}}
        <ul class="mt-2 divide-y divide-gray-200 rounded-md border border-gray-200">
          {{#pendingWebmentionPreview}}
          <li class="flex flex-wrap items-start justify-between gap-2 p-3">
            <div>
              <p class="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2">{{sourceDomain}}</p>
              <p class="mt-0.5 text-sm text-gray-600">{{mentionType}} · /{{targetCollection}}/{{targetSlug}}</p>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <form method="post" action="/dashboard/webmentions/{{id}}/approve">
                <button type="submit" class="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50">Approve</button>
              </form>
              <form method="post" action="/dashboard/webmentions/{{id}}/approve">
                <input type="hidden" name="trustDomain" value="1" />
                <button type="submit" class="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50">Approve + Trust</button>
              </form>
              <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50" href="/dashboard/{{collectionPath}}/{{id}}">View / Edit</a>
            </div>
          </li>
          {{/pendingWebmentionPreview}}
        </ul>
        {{/hasPendingWebmentionPreview}}
        {{^hasPendingWebmentionPreview}}
        <p class="mt-2 text-sm text-gray-600">No pending webmentions.</p>
        {{/hasPendingWebmentionPreview}}
      </article>
    </div>
  </section>

  <section class="mt-4 flex justify-end">
    <form method="post" action="/logout">
      <button type="submit" class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50">Log Out</button>
    </form>
  </section>
</section>
`;

const followingSourcesTemplate = /* html */ `
<section class="space-y-6">
  <header class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
    <div>
      <h1 class="text-2xl font-semibold">Following Sources</h1>
      <p class="mt-1 text-sm text-gray-700">Manage followed feeds and discover new ones.</p>
    </div>
    <a class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100" href="/dashboard">Back to Dashboard</a>
  </header>

  {{#followingActionSuccess}}
  <p class="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{{followingActionSuccess}}</p>
  {{/followingActionSuccess}}

  <section class="rounded-lg border border-gray-200 bg-white p-4">
    <h2 class="text-lg font-semibold">Your Following Sources</h2>
    <p class="mt-1 text-sm text-gray-700">Add a source manually or remove sources you already follow.</p>

    <form method="post" action="/dashboard/following/add" class="mt-4 grid gap-2 sm:grid-cols-4">
      <input name="siteUrl" required placeholder="https://example.com" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <input name="feedUrl" placeholder="https://example.com/feed.xml (optional)" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <input name="title" placeholder="Display title (optional)" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <button type="submit" class="rounded-md border border-gray-900 bg-gray-900 px-3 py-2 text-sm text-white transition hover:bg-black">Follow</button>
    </form>

    {{#hasFollowingSources}}
    <div class="mt-4 overflow-x-auto">
      <table class="min-w-full border border-gray-200 text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="border border-gray-200 px-2 py-2 text-left">Title</th>
            <th class="border border-gray-200 px-2 py-2 text-left">Site</th>
            <th class="border border-gray-200 px-2 py-2 text-left">Feed</th>
            <th class="border border-gray-200 px-2 py-2 text-left">Updated</th>
            <th class="border border-gray-200 px-2 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {{#followingSources}}
          <tr>
            <td class="border border-gray-200 px-2 py-2">{{title}}</td>
            <td class="border border-gray-200 px-2 py-2"><a class="underline" href="{{siteUrl}}" target="_blank" rel="noopener noreferrer">{{siteUrl}}</a></td>
            <td class="border border-gray-200 px-2 py-2">{{#feedUrl}}<a class="underline" href="{{feedUrl}}" target="_blank" rel="noopener noreferrer">{{feedUrl}}</a>{{/feedUrl}}{{^feedUrl}}(auto-detect){{/feedUrl}}</td>
            <td class="border border-gray-200 px-2 py-2">{{updatedAt}}</td>
            <td class="border border-gray-200 px-2 py-2">
              <form method="post" action="/dashboard/following/{{id}}/remove">
                <button type="submit" class="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs transition hover:bg-gray-100">Remove</button>
              </form>
            </td>
          </tr>
          {{/followingSources}}
        </tbody>
      </table>
    </div>
    {{/hasFollowingSources}}

    {{^hasFollowingSources}}
    <p class="mt-3 text-sm text-gray-700">No followed sources yet.</p>
    {{/hasFollowingSources}}
  </section>

  <section class="rounded-lg border border-gray-200 bg-white p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">Recommended RSS Feeds</h2>
        <p class="mt-1 text-sm text-gray-700">Categories first, then countries. Source: <a class="underline" href="{{recommendationsSourceUrl}}" target="_blank" rel="noopener noreferrer">awesome-rss-feeds</a>.</p>
      </div>
      <p class="text-xs text-gray-600">{{totalRecommendationCount}} results</p>
    </div>

    <form method="get" action="/dashboard/following" class="mt-4 grid gap-2 sm:grid-cols-[240px_1fr_auto]">
      <select name="recFilter" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
        {{#filterOptions}}
        <option value="{{value}}" {{#isSelected}}selected{{/isSelected}}>{{label}}</option>
        {{/filterOptions}}
      </select>
      <input name="recQuery" value="{{recommendationQuery}}" placeholder="Search by title, domain, or URL" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <button type="submit" class="rounded-md border border-gray-900 bg-gray-900 px-3 py-2 text-sm text-white transition hover:bg-black">Apply</button>
    </form>

    {{#hasRecommendationGroups}}
    <div class="mt-4 space-y-5">
      {{#recommendationGroups}}
      <section>
        <div class="flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-700">{{kind}}: {{name}}</h3>
          <p class="text-xs text-gray-500">{{feedCount}} feeds</p>
        </div>
        <ul class="mt-3 space-y-2">
          {{#feeds}}
          <li class="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-gray-900">{{title}}</p>
                <p class="mt-0.5 truncate text-xs text-gray-600">{{domain}}</p>
                <p class="mt-1 truncate text-xs text-gray-500">{{feedUrl}}</p>
              </div>
              <form method="post" action="/dashboard/following/add" class="shrink-0">
                <input type="hidden" name="siteUrl" value="{{siteUrl}}" />
                <input type="hidden" name="feedUrl" value="{{feedUrl}}" />
                <input type="hidden" name="title" value="{{title}}" />
                <button type="submit" class="rounded-md border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs text-white transition hover:bg-black">Add Feed</button>
              </form>
            </div>
          </li>
          {{/feeds}}
        </ul>
      </section>
      {{/recommendationGroups}}
    </div>
    {{/hasRecommendationGroups}}

    {{^hasRecommendationGroups}}
    <p class="mt-4 text-sm text-gray-700">No recommended feeds match this filter.</p>
    {{/hasRecommendationGroups}}
  </section>
</section>
`;

const followingFeedTemplate = /* html */ `
<section class="mx-auto max-w-4xl space-y-4 md:space-y-5">
  <div class="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-3 md:pb-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">Following Feed</h1>
      <p class="mt-1 text-sm text-gray-600">Latest items from your followed sites and feeds.</p>
    </div>
    <div class="flex flex-wrap gap-3 text-sm">
      <a class="text-gray-700 underline decoration-gray-400 underline-offset-4 transition hover:text-black focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500" href="/dashboard/following">Manage Following Sources</a>
      <a class="text-gray-700 underline decoration-gray-400 underline-offset-4 transition hover:text-black focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500" href="/dashboard">Back to Dashboard</a>
    </div>
  </div>

  {{#webmentionActionSuccess}}
  <p class="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{{webmentionActionSuccess}}</p>
  {{/webmentionActionSuccess}}
  {{#webmentionActionError}}
  <p class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{{webmentionActionError}}</p>
  {{/webmentionActionError}}

  {{#hasFollowingFeedItems}}
  <div class="space-y-3 md:space-y-4">
    {{#followingFeedItems}}
    <article class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
      <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <div class="flex min-w-0 items-center gap-2">
              {{#authorPhotoUrl}}<img src="{{authorPhotoUrl}}" alt="{{displayAuthor}}" class="h-7 w-7 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />{{/authorPhotoUrl}}
              <p class="truncate font-medium text-gray-900">{{displayAuthor}}</p>
            </div>
            <span class="text-gray-300">•</span>
            <a class="truncate text-gray-600 underline decoration-gray-300 underline-offset-2 transition hover:text-gray-800 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500" href="{{displayHostUrl}}" target="_blank" rel="noopener noreferrer">{{displayHost}}</a>
            {{#displayDate}}<p class="ml-auto text-xs text-gray-500">{{displayDate}}</p>{{/displayDate}}
          </div>

          <h3 class="mt-3 text-xl font-semibold leading-snug text-gray-900 md:text-2xl">
            <a class="rounded-sm transition hover:text-black hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500" href="{{url}}" target="_blank" rel="noopener noreferrer">{{displayTitle}}</a>
          </h3>

          {{#summary}}<p class="mt-2 line-clamp-3 text-sm leading-6 text-gray-700">{{summary}}</p>{{/summary}}

          <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {{#displayCategories}}<p>{{displayCategories}}</p>{{/displayCategories}}
          </div>
        </div>

        {{#photoUrl}}
        <div class="sm:justify-self-end">
          <img src="{{photoUrl}}" alt="{{displayTitle}}" class="h-52 w-full rounded-lg object-cover sm:h-44 sm:w-[220px] md:h-48 md:w-[260px]" loading="lazy" />
        </div>
        {{/photoUrl}}
      </div>

      {{#webmentionAvailable}}
      <div data-wm-actions class="mt-4 rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-3 sm:p-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Quick response</p>
          <div class="flex items-center justify-end gap-2">
            <form method="post" action="/dashboard/following/feed/like" data-wm-action="like" class="shrink-0">
              <input type="hidden" name="targetUrl" value="{{url}}" />
              <input type="hidden" name="targetTitle" value="{{displayTitle}}" />
              {{#isLiked}}
              <button
                type="submit"
                disabled
                data-permanent-disabled="1"
                aria-label="Liked"
                title="Liked"
                class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-red-700 bg-red-700 text-base text-white disabled:cursor-not-allowed disabled:opacity-100"
              >
                <span aria-hidden="true">❤️</span>
              </button>
              {{/isLiked}}
              {{^isLiked}}
              <button
                type="submit"
                aria-label="Like this post"
                title="Like"
                class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rose-300 bg-rose-50 text-base text-rose-700 transition hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span aria-hidden="true">❤️</span>
              </button>
              {{/isLiked}}
            </form>

            <button
              type="button"
              data-comment-toggle
              aria-expanded="false"
              class="inline-flex h-10 items-center rounded-full border border-blue-300 bg-blue-50 px-3 text-xs font-medium text-blue-700 transition hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Comment
            </button>
          </div>
        </div>

        <form method="post" action="/dashboard/following/feed/comment" class="mt-3 hidden min-w-0 space-y-2" data-wm-action="comment" data-comment-form>
          <input type="hidden" name="targetUrl" value="{{url}}" />
          <input type="hidden" name="targetTitle" value="{{displayTitle}}" />
          <textarea
            name="commentText"
            required
            minlength="2"
            maxlength="280"
            rows="3"
            placeholder="Write a short comment..."
            class="min-h-[88px] min-w-0 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition focus:border-gray-500 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          ></textarea>
          <div class="flex items-center justify-end gap-2">
            <button type="button" data-comment-cancel class="h-9 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-100">Cancel</button>
            <button type="submit" class="h-9 rounded-md border border-blue-300 bg-blue-50 px-4 text-xs font-medium text-blue-700 transition hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60">Post</button>
          </div>
        </form>

        {{#outboundSuccess}}
        <p data-outbound-success class="mt-2 text-xs text-green-700">{{outboundSuccess}}</p>
        {{/outboundSuccess}}
        {{#outboundError}}
        <p data-outbound-error class="mt-1 text-xs text-red-600">{{outboundError}}</p>
        {{/outboundError}}
      </div>
      {{/webmentionAvailable}}

      {{#webmentionAvailable}}
      <div class="mt-3 space-y-2">
        <details data-conversation-details class="group rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2">
          <summary class="cursor-pointer list-none text-xs font-medium text-gray-800 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500">
            <span>Conversation</span>
            <span class="ml-1 text-gray-600">({{conversationEntries.length}})</span>
          </summary>
          <div data-conversation-list class="mt-2 space-y-2">
            {{#conversationEntries}}
            {{#isOwn}}
            <div class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[11px] font-medium text-blue-700">{{author}}</p>
                {{#displayDate}}<p class="text-[11px] text-blue-700/80">{{displayDate}}</p>{{/displayDate}}
              </div>
              <p class="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">{{text}}</p>
            </div>
            {{/isOwn}}
            {{^isOwn}}
            <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div class="flex items-center gap-2">
                {{#authorPhoto}}<img src="{{authorPhoto}}" alt="{{author}}" class="h-5 w-5 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />{{/authorPhoto}}
                {{#authorUrl}}<a href="{{authorUrl}}" target="_blank" rel="noopener noreferrer" class="text-[11px] font-medium text-emerald-700 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">{{author}}</a>{{/authorUrl}}
                {{^authorUrl}}<p class="text-[11px] font-medium text-emerald-700">{{author}}</p>{{/authorUrl}}
                {{#displayDate}}<p class="ml-auto text-[11px] text-emerald-700/80">{{displayDate}}</p>{{/displayDate}}
              </div>
              <p class="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">{{text}}</p>
              {{#sourceUrl}}<p class="mt-1 text-[11px]"><a href="{{sourceUrl}}" target="_blank" rel="noopener noreferrer" class="text-emerald-700 underline decoration-emerald-400 underline-offset-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">View original reply</a></p>{{/sourceUrl}}
            </div>
            {{/isOwn}}
            {{/conversationEntries}}
            {{^conversationEntries}}
            <p class="text-xs text-gray-600">No comments or replies yet.</p>
            {{/conversationEntries}}
          </div>
        </details>

        {{#microformatsPreview}}
        <details class="group rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <summary class="cursor-pointer list-none text-xs font-medium uppercase tracking-wide text-gray-600 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500">Microformats</summary>
          <p class="mt-2 whitespace-pre-wrap break-words text-xs text-gray-700">{{microformatsPreview}}</p>
        </details>
        {{/microformatsPreview}}
      </div>
      {{/webmentionAvailable}}
    </article>
    {{/followingFeedItems}}
  </div>
  {{/hasFollowingFeedItems}}

  {{^hasFollowingFeedItems}}
  <p class="mt-3 text-sm text-gray-700">No feed items yet.</p>
  {{/hasFollowingFeedItems}}
</section>
<script>
(() => {
  const forms = Array.from(
    document.querySelectorAll('form[action="/dashboard/following/feed/like"], form[action="/dashboard/following/feed/comment"]'),
  );
  const commentToggles = Array.from(document.querySelectorAll('[data-comment-toggle]'));

  const setFormPending = (form, pending) => {
    const submitButton = form.querySelector('button[type="submit"]');
    if (!(submitButton instanceof HTMLButtonElement)) return;
    if (pending) {
      submitButton.setAttribute('disabled', 'disabled');
      return;
    }
    if (submitButton.hasAttribute('data-permanent-disabled')) {
      submitButton.setAttribute('disabled', 'disabled');
    } else {
      submitButton.removeAttribute('disabled');
    }
  };

  const setCommentComposerOpen = (article, open) => {
    if (!(article instanceof HTMLElement)) return;
    const commentForm = article.querySelector('[data-comment-form]');
    const toggleButton = article.querySelector('[data-comment-toggle]');
    if (!(commentForm instanceof HTMLFormElement) || !(toggleButton instanceof HTMLButtonElement)) return;
    commentForm.classList.toggle('hidden', !open);
    toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleButton.textContent = open ? 'Close' : 'Comment';
    if (open) {
      const textarea = commentForm.querySelector('textarea[name="commentText"]');
      if (textarea instanceof HTMLTextAreaElement) textarea.focus();
    }
  };

  const setStatusMessage = (article, kind, message) => {
    if (!(article instanceof HTMLElement)) return;
    const actionsRoot = article.querySelector('[data-wm-actions]');
    if (!(actionsRoot instanceof HTMLElement)) return;
    const selector = kind === 'error' ? '[data-outbound-error]' : '[data-outbound-success]';
    const className = kind === 'error' ? 'mt-1 text-xs text-red-600' : 'mt-2 text-xs text-green-700';
    const existing = actionsRoot.querySelector(selector);
    const text = String(message || '').trim();

    if (!text) {
      if (existing instanceof HTMLElement) existing.remove();
      return;
    }

    const node =
      existing instanceof HTMLElement
        ? existing
        : (() => {
            const created = document.createElement('p');
            created.setAttribute(kind === 'error' ? 'data-outbound-error' : 'data-outbound-success', '');
            created.className = className;
            actionsRoot.appendChild(created);
            return created;
          })();
    node.className = className;
    node.textContent = text;
  };

  for (const toggle of commentToggles) {
    if (!(toggle instanceof HTMLButtonElement)) continue;
    toggle.addEventListener('click', () => {
      const article = toggle.closest('article');
      if (!(article instanceof HTMLElement)) return;
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      setCommentComposerOpen(article, !isOpen);
    });
  }

  const cancelButtons = Array.from(document.querySelectorAll('[data-comment-cancel]'));
  for (const cancelButton of cancelButtons) {
    if (!(cancelButton instanceof HTMLButtonElement)) continue;
    cancelButton.addEventListener('click', () => {
      const article = cancelButton.closest('article');
      setCommentComposerOpen(article, false);
    });
  }

  for (const form of forms) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const article = form.closest('article');
      if (!(article instanceof HTMLElement)) return;
      const actionType = form.getAttribute('data-wm-action') || '';
      const submittedComment =
        actionType === 'comment'
          ? String(form.querySelector('textarea[name="commentText"]')?.value || '').trim()
          : '';
      setStatusMessage(article, 'error', '');
      setStatusMessage(article, 'success', '');
      const originalText = submitButton ? submitButton.textContent : '';
      setFormPending(form, true);
      if (submitButton && actionType === 'comment') {
        submitButton.textContent = actionType === 'comment' ? 'Posting...' : 'Sending...';
      }
      setStatusMessage(article, 'success', actionType === 'comment' ? 'Posting your comment...' : 'Sending like webmention...');

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: { accept: 'application/json' },
          body: new FormData(form),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok !== true) {
          const message = String(payload?.error || 'Action failed');
          setStatusMessage(article, 'error', message);
          setStatusMessage(article, 'success', '');
          return;
        }
        if (actionType === 'like' && submitButton) {
          submitButton.setAttribute('data-permanent-disabled', '1');
          submitButton.setAttribute('disabled', 'disabled');
          submitButton.className =
            'inline-flex h-10 w-10 items-center justify-center rounded-full border border-red-700 bg-red-700 text-base text-white disabled:cursor-not-allowed disabled:opacity-100';
          submitButton.innerHTML = '<span aria-hidden="true">❤️</span>';
          submitButton.setAttribute('aria-label', 'Liked');
          submitButton.setAttribute('title', 'Liked');
          setStatusMessage(article, 'success', 'Like sent successfully.');
        }
        if (actionType === 'comment') {
          const commentInput = form.querySelector('textarea[name="commentText"]');
          const conversationList = article.querySelector('[data-conversation-list]');
          const conversationDetails = article.querySelector('[data-conversation-details]');
          if (conversationList && submittedComment) {
            const wrapper = document.createElement('div');
            wrapper.className = 'rounded-lg border border-blue-200 bg-blue-50 px-3 py-2';

            const header = document.createElement('div');
            header.className = 'flex items-center justify-between gap-2';

            const author = document.createElement('p');
            author.className = 'text-[11px] font-medium text-blue-700';
            author.textContent = 'You';

            const date = document.createElement('p');
            date.className = 'text-[11px] text-blue-700/80';
            date.textContent = new Date().toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            header.appendChild(author);
            header.appendChild(date);

            const body = document.createElement('p');
            body.className = 'mt-1 whitespace-pre-wrap break-words text-sm text-gray-800';
            body.textContent = submittedComment;

            wrapper.appendChild(header);
            wrapper.appendChild(body);
            conversationList.prepend(wrapper);
            if (conversationDetails instanceof HTMLDetailsElement) {
              conversationDetails.open = true;
            }
          }
          if (commentInput) commentInput.value = '';
          setStatusMessage(article, 'success', 'Comment posted successfully.');
          setCommentComposerOpen(article, false);
        }
        setStatusMessage(article, 'error', '');
      } catch {
        setStatusMessage(article, 'error', 'Network error while sending action.');
        setStatusMessage(article, 'success', '');
      } finally {
        setFormPending(form, false);
        if (submitButton) {
          if (submitButton.hasAttribute('data-permanent-disabled')) {
            submitButton.setAttribute('disabled', 'disabled');
          } else {
            submitButton.textContent = originalText || (actionType === 'comment' ? 'Post' : '');
          }
        }
      }
    });
  }
})();
</script>
`;

const isSafeRedirectPath = (value: string | undefined): value is string => {
	if (!value) return false;
	if (!value.startsWith('/')) return false;
	return !value.startsWith('//');
};

const getRedirectTarget = (c: Context): string | undefined => {
	const redirectTarget = c.req.query('redirect');
	return isSafeRedirectPath(redirectTarget) ? redirectTarget : undefined;
};

export const getToken = (c: Context): string | undefined => {
	return getCookie(c, AUTH_COOKIE_NAME);
};

const shouldUseSecureCookie = (url: string): boolean => {
	try {
		const parsed = new URL(url);
		if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
			return false;
		}
		return parsed.protocol === 'https:';
	} catch {
		return false;
	}
};

const setTokenCookie = (c: Context, token: string): void => {
	setCookie(c, AUTH_COOKIE_NAME, token, {
		httpOnly: true,
		secure: shouldUseSecureCookie(c.req.url),
		sameSite: 'Lax',
		path: '/',
		maxAge: 60 * 60 * 24,
	});
};

const clearTokenCookie = (c: Context): void => {
	deleteCookie(c, AUTH_COOKIE_NAME, {
		path: '/',
	});
};

const asObject = (value: unknown): Record<string, unknown> | null => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
};

const parseContentStatus = (value: string): ContentStatus => {
	if (value === 'published' || value === 'archived') return value;
	return 'draft';
};

const toIsoDate = (value: unknown): string => {
	if (typeof value === 'string' && value.length > 0) return value;
	if (typeof value === 'number' && Number.isFinite(value)) {
		const epochMs = value < 1_000_000_000_000 ? value * 1000 : value;
		const date = new Date(epochMs);
		return Number.isNaN(date.getTime()) ? '' : date.toISOString();
	}
	return '';
};

const toContentItem = (value: unknown): DashboardContentItem | null => {
	const obj = asObject(value);
	if (!obj) return null;
	const id = typeof obj.id === 'string' ? obj.id : '';
	if (!id) return null;
	return {
		id,
		collectionId: typeof obj.collectionId === 'string' ? obj.collectionId : '',
		title: typeof obj.title === 'string' ? obj.title : '',
		slug: typeof obj.slug === 'string' ? obj.slug : '',
		status: parseContentStatus(typeof obj.status === 'string' ? obj.status : 'draft'),
		createdAt: toIsoDate(obj.createdAt ?? obj.created_at),
		updatedAt: toIsoDate(obj.updatedAt ?? obj.updated_at),
		data: asObject(obj.data) ?? {},
	};
};

const parseContentListResponse = (payload: unknown): DashboardContentItem[] => {
	const obj = asObject(payload);
	if (!obj) return [];
	const rawData = obj.data;
	if (!Array.isArray(rawData)) return [];
	return rawData.map((item) => toContentItem(item)).filter((item): item is DashboardContentItem => Boolean(item));
};

const parseContentItemResponse = (payload: unknown): DashboardContentItem | null => {
	const obj = asObject(payload);
	if (!obj) return null;
	if ('data' in obj) {
		const nested = asObject(obj.data);
		if (nested && typeof nested.id === 'string') return toContentItem(nested);
	}
	if (typeof obj.id === 'string') return toContentItem(obj);
	return null;
};

const fetchApiJson = async <T>(path: string, init: RequestInit = {}, token?: string, options?: BackendRequestOptions): Promise<T> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const headers = new Headers(init.headers);
		if (!headers.has('content-type') && init.body && typeof init.body === 'string') {
			headers.set('content-type', 'application/json');
		}
		if (token) headers.set('authorization', `Bearer ${token}`);

		const response = await fetchBackend(path, {
			...init,
			headers,
			signal: controller.signal,
		}, options);

		if (!response.ok) {
			let message = 'Content request failed';
			try {
				const errorBody = (await response.json()) as { error?: string; message?: string };
				message = errorBody.error ?? errorBody.message ?? message;
			} catch {
				// ignore JSON parse errors for error responses
			}
			throw new ContentApiError(message, response.status);
		}

		return (await response.json()) as T;
	} catch (error) {
		if (error instanceof ContentApiError) throw error;
		if (error instanceof Error && error.name === 'AbortError') {
			throw new ContentApiError(`Content request timed out after ${REQUEST_TIMEOUT_MS}ms`, 504);
		}
		throw new ContentApiError('Content request failed due to a network error', 502);
	} finally {
		clearTimeout(timeoutId);
	}
};

const loadDashboardContent = async (options?: BackendRequestOptions): Promise<DashboardContentItem[]> => {
	const params = new URLSearchParams();
	params.set('limit', '50');
	params.set('sort', '-updatedAt');
	const payload = await fetchApiJson<unknown>(`/api/content?${params.toString()}`, { method: 'GET' }, undefined, options);
	return parseContentListResponse(payload);
};

const loadRecentOutboundWebmentions = async (options?: BackendRequestOptions): Promise<DashboardContentItem[]> => {
	const params = new URLSearchParams();
	params.set('limit', '200');
	params.set('sort', '-updatedAt');
	const payload = await fetchApiJson<unknown>(
		`/api/collections/${encodeURIComponent('outbound-webmentions')}/content?${params.toString()}`,
		{ method: 'GET' },
		undefined,
		options
	);
	return parseContentListResponse(payload);
};

const loadCollectionTitleMap = async (options?: BackendRequestOptions): Promise<Map<string, string>> => {
	const collections = await sonicGetCollectionsCached(options);
	const titleMap = new Map<string, string>();
	for (const collection of collections) {
		const title = collection.display_name || collection.name || collection.id;
		if (collection.id) titleMap.set(collection.id, title);
		if (collection.name) titleMap.set(collection.name, title);
	}
	return titleMap;
};

const loadCollectionMetaMap = async (options?: BackendRequestOptions): Promise<Map<string, DashboardCollectionMeta>> => {
	const collections = await sonicGetCollectionsCached(options);
	const metaMap = new Map<string, DashboardCollectionMeta>();
	for (const collection of collections) {
		const meta: DashboardCollectionMeta = {
			id: collection.id,
			name: collection.name,
			displayName: collection.display_name || collection.name,
		};
		if (collection.id) metaMap.set(collection.id, meta);
		if (collection.name) metaMap.set(collection.name, meta);
	}
	return metaMap;
};

const toSafeSlug = (value: string): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '') || 'item';

const normalizeUrl = (value: string): string => {
	const parsed = new URL(value.trim());
	parsed.hash = '';
	parsed.hostname = parsed.hostname.toLowerCase();
	if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
		parsed.port = '';
	}
	if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
		parsed.pathname = parsed.pathname.slice(0, -1);
	}
	return parsed.toString();
};

const normalizeUrlWithoutQuery = (value: string): string => {
	const parsed = new URL(normalizeUrl(value));
	parsed.search = '';
	return parsed.toString();
};

const toHostPathKey = (value: string): string => {
	const parsed = new URL(value.trim());
	let pathname = parsed.pathname || '/';
	if (pathname.length > 1 && pathname.endsWith('/')) {
		pathname = pathname.slice(0, -1);
	}
	return `${parsed.hostname.toLowerCase()}${pathname}`;
};

const safeCodePoint = (value: number, fallback: string): string => {
	if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return fallback;
	try {
		return String.fromCodePoint(value);
	} catch {
		return fallback;
	}
};

const decodeHtmlEntities = (value: string): string =>
	value
		.replace(/&#x([0-9a-f]+);/gi, (match, hex) => safeCodePoint(Number.parseInt(hex, 16), match))
		.replace(/&#([0-9]+);/g, (match, dec) => safeCodePoint(Number.parseInt(dec, 10), match))
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&rsquo;/g, "'")
		.replace(/&lsquo;/g, "'")
		.replace(/&rdquo;/g, '"')
		.replace(/&ldquo;/g, '"')
		.replace(/&mdash;/g, '-')
		.replace(/&ndash;/g, '-')
		.replace(/&nbsp;/g, ' ');

const stripTags = (value: string): string =>
	decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

const unwrapCdata = (value: string): string => {
	const trimmed = value.trim();
	const cdataMatch = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
	return cdataMatch?.[1] ? cdataMatch[1].trim() : trimmed;
};

const extractTextTag = (xml: string, tagName: string): string => {
	const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
	const match = xml.match(pattern);
	return match?.[1] ? stripTags(unwrapCdata(match[1])) : '';
};

const extractRawTag = (xml: string, tagName: string): string => {
	const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
	const match = xml.match(pattern);
	return match?.[1] ? unwrapCdata(match[1]) : '';
};

const parseEmbeddedRepliesFromFeedContent = (contentHtml: string, baseUrl: string): InboundReplyRecord[] => {
	const sectionMatch = contentHtml.match(/<section\b[\s\S]*?<h3[^>]*>\s*Replies\s*<\/h3>[\s\S]*?<\/section>/i);
	if (!sectionMatch?.[0]) return [];
	const sectionHtml = sectionMatch[0];
	const listItems = Array.from(sectionHtml.matchAll(/<li\b[\s\S]*?<\/li>/gi)).map((match) => match[0]);
	const replies: InboundReplyRecord[] = [];

	for (const itemHtml of listItems) {
		const authorStrong = stripTags(itemHtml.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || '').trim();
		const authorImgAlt = stripTags(itemHtml.match(/<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/i)?.[1] || '').trim();
		const authorName = authorStrong || authorImgAlt || 'Unknown author';

		const authorAnchorHref = itemHtml.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*<strong/i)?.[1] || '';
		const sourceLinkMatch = itemHtml.match(
			/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*View original reply\s*<\/a>/i
		);
		const sourceUrlRaw = sourceLinkMatch?.[1] || '';

		const authorPhotoRaw = itemHtml.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1] || '';
		const paragraphs = Array.from(itemHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)).map((match) =>
			stripTags(match[1] || '').trim()
		);
		const contentText = paragraphs.find((text) => text && !/^view original reply$/i.test(text)) || '';
		if (!contentText) continue;

		replies.push({
			authorName,
			authorUrl: authorAnchorHref ? resolveUrlWithBase(authorAnchorHref, baseUrl) : '',
			authorPhoto: authorPhotoRaw ? resolveUrlWithBase(authorPhotoRaw, baseUrl) : '',
			contentText,
			publishedAt: '',
			sourceUrl: sourceUrlRaw ? resolveUrlWithBase(sourceUrlRaw, baseUrl) : '',
		});
	}

	return replies;
};

const fetchTextWithTimeout = async (url: string, accept: string, timeoutMs = 6000): Promise<string> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			method: 'GET',
			redirect: 'follow',
			headers: {
				accept,
				'user-agent': 'indie-web-starter-following/1.0',
			},
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		return await response.text();
	} finally {
		clearTimeout(timeoutId);
	}
};

const hasWebmentionRel = (value: string): boolean => {
	const relTokens = value
		.toLowerCase()
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);
	return relTokens.includes('webmention') || relTokens.includes('http://webmention.org/');
};

const resolveEndpointFromLinkHeader = (linkHeader: string, baseUrl: string): string => {
	const pattern = /<([^>]+)>\s*;\s*rel="?([^";,]+)"?/gi;
	for (const match of linkHeader.matchAll(pattern)) {
		const href = match[1]?.trim() || '';
		const rel = match[2]?.trim() || '';
		if (!href || !hasWebmentionRel(rel)) continue;
		return resolveUrlWithBase(href, baseUrl);
	}
	return '';
};

const resolveEndpointFromHtml = (html: string, baseUrl: string): string => {
	const patterns = [
		/<link\b[^>]*rel=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
		/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']([^"']+)["'][^>]*>/gi,
		/<a\b[^>]*rel=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
		/<a\b[^>]*href=["']([^"']+)["'][^>]*rel=["']([^"']+)["'][^>]*>/gi,
	];
	for (const pattern of patterns) {
		for (const match of html.matchAll(pattern)) {
			const first = match[1]?.trim() || '';
			const second = match[2]?.trim() || '';
			const relFirst = hasWebmentionRel(first);
			const relSecond = hasWebmentionRel(second);
			if (relFirst && second) return resolveUrlWithBase(second, baseUrl);
			if (relSecond && first) return resolveUrlWithBase(first, baseUrl);
		}
	}
	return '';
};

const collectFetchDebugInfo = async (
	response: Response,
	maxSnippetLength = 1500
): Promise<{
	status: number;
	statusText: string;
	finalUrl: string;
	contentType: string;
	locationHeader: string;
	cacheStatus: string;
	cfRay: string;
	server: string;
	bodySnippet: string;
}> => {
	const contentType = response.headers.get('content-type') || '';
	const locationHeader = response.headers.get('location') || '';
	const cacheStatus = response.headers.get('cf-cache-status') || '';
	const cfRay = response.headers.get('cf-ray') || '';
	const server = response.headers.get('server') || '';
	let bodySnippet = '';
	try {
		const raw = await response.clone().text();
		bodySnippet = raw.slice(0, maxSnippetLength);
	} catch {
		bodySnippet = '';
	}
	return {
		status: response.status,
		statusText: response.statusText || '',
		finalUrl: response.url || '',
		contentType,
		locationHeader,
		cacheStatus,
		cfRay,
		server,
		bodySnippet,
	};
};

const isCloudflare1042Body = (value: string): boolean => /error code:\s*1042/i.test(value);

const discoverWebmentionEndpoint = async (
	targetUrl: string,
	timeoutMs = 6000,
	backendOptions?: BackendRequestOptions
): Promise<string> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchBackend(
			targetUrl,
			{
			method: 'GET',
			redirect: 'follow',
			headers: {
				accept: 'text/html,application/xhtml+xml,*/*',
				'user-agent': 'indie-web-starter-following/1.0',
			},
			signal: controller.signal,
			},
			backendOptions
		);
		if (!response.ok) {
			const fetchDebug = await collectFetchDebugInfo(response, 1200);
			console.log('webmention target endpoint discovery fetch failed', {
				targetUrl,
				fetchDebug,
			});
			throw new Error(`Target fetch failed: HTTP ${response.status}`);
		}
		const finalTargetUrl = response.url || targetUrl;
		const linkHeader = response.headers.get('link') || '';
		const endpointFromHeader = linkHeader ? resolveEndpointFromLinkHeader(linkHeader, finalTargetUrl) : '';
		if (endpointFromHeader) return endpointFromHeader;
		const html = await response.text();
		const endpointFromHtml = resolveEndpointFromHtml(html, finalTargetUrl);
		if (endpointFromHtml) return endpointFromHtml;
		console.log('webmention target endpoint discovery no endpoint found', {
			targetUrl,
			finalTargetUrl,
			linkHeader: linkHeader || null,
			htmlSnippet: html.slice(0, 1200),
		});
		throw new Error('No webmention endpoint found on target');
	} finally {
		clearTimeout(timeoutId);
	}
};

const ensureSourcePageReadyForWebmention = async (
	sourceUrl: string,
	targetUrl: string,
	timeoutMs = 6000,
	backendOptions?: BackendRequestOptions
): Promise<void> => {
	const collectSourceAnchorDetails = (html: string): { matched: boolean; resolvedHrefs: string[]; rawHrefs: string[] } => {
		const resolvedHrefs: string[] = [];
		const rawHrefs: string[] = [];
		let matched = false;
		for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
			const href = decodeHtmlEntities((match[1] || '').trim());
			if (!href) continue;
			rawHrefs.push(href);
			try {
				const resolvedHref = normalizeUrl(new URL(href, sourceUrl).toString());
				resolvedHrefs.push(resolvedHref);
				if (resolvedHref === targetUrl) {
					matched = true;
				}
			} catch {
				// keep scanning
			}
		}
		return { matched, resolvedHrefs, rawHrefs };
	};

	for (let attempt = 1; attempt <= WEBMENTION_SOURCE_READY_MAX_ATTEMPTS; attempt += 1) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetchBackend(
				sourceUrl,
				{
				method: 'GET',
				redirect: 'follow',
				headers: {
					accept: 'text/html,application/xhtml+xml,*/*',
					'user-agent': 'indie-web-starter-following/1.0',
				},
				signal: controller.signal,
				},
				backendOptions
			);
			if (response.ok) {
				const fetchDebug = await collectFetchDebugInfo(response, 1200);
				const html = await response.text().catch(() => '');
				const { matched, resolvedHrefs, rawHrefs } = collectSourceAnchorDetails(html);
				console.log('webmention source readiness check', {
					attempt,
					sourceUrl,
					targetUrl,
					responseStatus: response.status,
					finalSourceUrl: response.url || sourceUrl,
					fetchDebug,
					matched,
					resolvedHrefs: resolvedHrefs.slice(0, 12),
					rawHrefs: rawHrefs.slice(0, 12),
					htmlLength: html.length,
					htmlSnippet: html.slice(0, 700),
					html,
				});
				if (matched) {
					return;
				}
			} else {
				const fetchDebug = await collectFetchDebugInfo(response, 1200);
				if (isCloudflare1042Body(fetchDebug.bodySnippet)) {
					console.log('webmention source readiness check bypassed due to Cloudflare 1042', {
						attempt,
						sourceUrl,
						targetUrl,
						responseStatus: response.status,
						finalSourceUrl: response.url || sourceUrl,
						fetchDebug,
					});
					return;
				}
				console.log('webmention source readiness check', {
					attempt,
					sourceUrl,
					targetUrl,
					responseStatus: response.status,
					finalSourceUrl: response.url || sourceUrl,
					fetchDebug,
					matched: false,
					reason: 'source fetch was not OK',
				});
			}
		} catch (error) {
			console.log('webmention source readiness check', {
				attempt,
				sourceUrl,
				targetUrl,
				matched: false,
				reason: 'source fetch threw',
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			clearTimeout(timeoutId);
		}
		if (attempt < WEBMENTION_SOURCE_READY_MAX_ATTEMPTS) {
			const delayMs = Math.min(WEBMENTION_SOURCE_READY_MAX_DELAY_MS, attempt * WEBMENTION_SOURCE_READY_BASE_DELAY_MS);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
	throw new Error('Source page is not ready yet (target link not visible).');
};

const sendWebmentionNotification = async (
	sourceUrl: string,
	targetUrl: string,
	timeoutMs = 6000,
	backendOptions?: BackendRequestOptions
): Promise<{ endpointUrl: string; responseStatusCode: number }> => {
	await ensureSourcePageReadyForWebmention(sourceUrl, targetUrl, timeoutMs, backendOptions);
	const endpoint = await discoverWebmentionEndpoint(targetUrl, timeoutMs, backendOptions);
	const body = new URLSearchParams();
	body.set('source', sourceUrl);
	body.set('target', targetUrl);

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetchBackend(
				endpoint,
				{
				method: 'POST',
				redirect: 'follow',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					accept: '*/*',
					'user-agent': 'indie-web-starter-following/1.0',
				},
				body: body.toString(),
				signal: controller.signal,
				},
				backendOptions
			);
			if (response.ok) {
				return { endpointUrl: endpoint, responseStatusCode: response.status };
			}

			const errorBody = await response.text().catch(() => '');
			const snippet = errorBody.slice(0, 300).trim();
			const isPropagationRace = response.status === 422 && /source does not link to target\.?/i.test(snippet);
			if (isPropagationRace && attempt < 3) {
				await new Promise((resolve) => setTimeout(resolve, attempt * 250));
				continue;
			}

			console.error('Webmention send failed', {
				endpoint,
				sourceUrl,
				targetUrl,
				status: response.status,
				bodySnippet: snippet,
			});
			throw new Error(`Webmention send failed: HTTP ${response.status}${snippet ? ` - ${snippet}` : ''}`);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	throw new Error('Webmention send failed: retries exhausted.');
};

const resolveUrlWithBase = (value: string, baseUrl: string): string => {
	try {
		return new URL(value, baseUrl).toString();
	} catch {
		return value;
	}
};

const FOLLOWING_IMAGE_KEY_PATTERN = /(image|media|photo|thumbnail|thumb|cover|featured|gallery|main|poster|avatar|artwork)/i;

const looksLikeImageUrlForFollowing = (value: string): boolean => {
	const lower = value.toLowerCase();
	return (
		/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/.test(lower) ||
		lower.includes('/api/media/') ||
		lower.includes('/media/') ||
		lower.includes('/files/')
	);
};

const extractFirstImageFromHtmlForFollowing = (value: string, baseUrl: string): string => {
	const match = value.match(/<img\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/i);
	const src = match?.[1]?.trim() || '';
	return src ? resolveUrlWithBase(src, baseUrl) : '';
};

const extractImageUrlFromUnknownForFollowing = (value: unknown, baseUrl: string, keyHint = '', depth = 0): string => {
	if (depth > 5) return '';
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return '';
		if (!FOLLOWING_IMAGE_KEY_PATTERN.test(keyHint) && !looksLikeImageUrlForFollowing(trimmed)) return '';
		return resolveUrlWithBase(trimmed, baseUrl);
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = extractImageUrlFromUnknownForFollowing(entry, baseUrl, keyHint, depth + 1);
			if (found) return found;
		}
		return '';
	}
	if (!value || typeof value !== 'object') return '';
	const obj = value as Record<string, unknown>;
	const sortedKeys = Object.keys(obj).sort((a, b) => {
		const aScore = FOLLOWING_IMAGE_KEY_PATTERN.test(a) ? 0 : 1;
		const bScore = FOLLOWING_IMAGE_KEY_PATTERN.test(b) ? 0 : 1;
		return aScore - bScore;
	});
	for (const key of sortedKeys) {
		if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
		const found = extractImageUrlFromUnknownForFollowing(obj[key], baseUrl, key, depth + 1);
		if (found) return found;
	}
	return '';
};

const resolveFollowingLocalItemImageUrl = (data: Record<string, unknown>, baseUrl: string): string => {
	const fromData = extractImageUrlFromUnknownForFollowing(data, baseUrl);
	if (fromData) return fromData;
	const richTextCandidates = ['content', 'body', 'html', 'description'];
	for (const key of richTextCandidates) {
		const raw = data[key];
		if (typeof raw !== 'string' || !raw) continue;
		const extracted = extractFirstImageFromHtmlForFollowing(raw, baseUrl);
		if (extracted) return extracted;
	}
	return '';
};

const extractImageFromXmlBlock = (block: string, baseUrl: string): string => {
	const patterns = [
		/<media:thumbnail\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
		/<media:content\b[^>]*\b(?:type=["']image\/[^"']+["']|medium=["']image["'])[^>]*\burl=["']([^"']+)["'][^>]*>/i,
		/<media:content\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
		/<enclosure\b[^>]*\btype=["']image\/[^"']+["'][^>]*\burl=["']([^"']+)["'][^>]*>/i,
		/<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*\btype=["']image\/[^"']+["'][^>]*>/i,
		/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i,
	];
	for (const pattern of patterns) {
		const match = block.match(pattern);
		const candidate = match?.[1]?.trim();
		if (candidate) return resolveUrlWithBase(candidate, baseUrl);
	}
	return '';
};

const extractFeedLevelImage = (xml: string, baseUrl: string): string => {
	const patterns = [
		/<itunes:image\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i,
		/<webfeeds:icon\b[^>]*>([^<]+)<\/webfeeds:icon>/i,
		/<webfeeds:logo\b[^>]*>([^<]+)<\/webfeeds:logo>/i,
		/<image\b[\s\S]*?<url\b[^>]*>([^<]+)<\/url>[\s\S]*?<\/image>/i,
		/<logo\b[^>]*>([^<]+)<\/logo>/i,
	];
	for (const pattern of patterns) {
		const candidate = pattern.exec(xml)?.[1]?.trim();
		if (candidate) return resolveUrlWithBase(candidate, baseUrl);
	}
	return '';
};

const extractFeedLevelAuthor = (xml: string): string => {
	const patterns = [
		/<itunes:author\b[^>]*>([^<]+)<\/itunes:author>/i,
		/<managingEditor\b[^>]*>([^<]+)<\/managingEditor>/i,
		/<dc:creator\b[^>]*>([^<]+)<\/dc:creator>/i,
		/<author\b[^>]*>([^<]+)<\/author>/i,
	];
	for (const pattern of patterns) {
		const candidate = stripTags(pattern.exec(xml)?.[1] || '').trim();
		if (candidate) return candidate;
	}
	return '';
};

const fallbackFaviconUrl = (urlValue: string): string => {
	try {
		const parsed = new URL(urlValue);
		return `${parsed.origin}/favicon.ico`;
	} catch {
		return '';
	}
};

const parseRssItems = (xml: string, sourceTitle: string, limit = 8): FollowingFeedItem[] => {
	const matches = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)).slice(0, limit);
	return matches
	.map<FollowingFeedItem | null>((match) => {
			const block = match[0];
			const title = extractTextTag(block, 'title');
			const url = extractTextTag(block, 'link') || extractTextTag(block, 'guid');
			const summary = extractTextTag(block, 'description');
			const publishedAt = extractTextTag(block, 'pubDate') || extractTextTag(block, 'dc:date');
			const photoUrl = url ? extractImageFromXmlBlock(block, url) : '';
			const contentEncodedRaw = extractRawTag(block, 'content:encoded') || extractRawTag(block, 'encoded');
			const inboundRepliesFromFeed = contentEncodedRaw ? parseEmbeddedRepliesFromFeedContent(contentEncodedRaw, url) : [];
			if (!title || !url) return null;
			return {
				sourceTitle,
				title,
				url,
				publishedAt,
				summary: summary.slice(0, 300),
				photoUrl: photoUrl || undefined,
				inboundRepliesFromFeed: inboundRepliesFromFeed.length > 0 ? inboundRepliesFromFeed : undefined,
			} satisfies FollowingFeedItem;
		})
		.filter((item): item is FollowingFeedItem => Boolean(item));
};

const parseAtomItems = (xml: string, sourceTitle: string, limit = 8): FollowingFeedItem[] => {
	const matches = Array.from(xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)).slice(0, limit);
	return matches
		.map<FollowingFeedItem | null>((match) => {
			const block = match[0];
			const title = extractTextTag(block, 'title');
			const summary = extractTextTag(block, 'summary') || extractTextTag(block, 'content');
			const publishedAt = extractTextTag(block, 'updated') || extractTextTag(block, 'published');
			const linkMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
			const url = linkMatch?.[1] ?? '';
			if (!title || !url) return null;
			return {
				sourceTitle,
				title,
				url,
				publishedAt,
				summary: summary.slice(0, 300),
			} satisfies FollowingFeedItem;
		})
		.filter((item): item is FollowingFeedItem => Boolean(item));
};

const getChildrenByLocalName = (element: DomElementLike, localNames: string[]): DomElementLike[] => {
	const expected = new Set(localNames.map((name) => name.toLowerCase()));
	return toDomElements(element.children).filter((child) => expected.has(getDomElementName(child)));
};

const getFirstChildTextByLocalName = (element: DomElementLike, localNames: string[]): string => {
	const child = getChildrenByLocalName(element, localNames)[0];
	if (!child) return '';
	return stripTags(child.textContent || '');
};

const getFirstLinkFromAtomEntry = (entry: DomElementLike): string => {
	const links = getChildrenByLocalName(entry, ['link']);
	if (links.length === 0) return '';
	const preferred =
		links.find((link) => {
			const rel = (link.getAttribute?.('rel') || '').toLowerCase();
			return rel === '' || rel === 'alternate';
		}) ?? links[0];
	return preferred?.getAttribute?.('href')?.trim() || '';
};

const getImageFromFeedEntry = (entry: DomElementLike, baseUrl: string): string => {
	const childElements = toDomElements(entry.children);
	for (const child of childElements) {
		const local = getDomElementName(child);
		if (local === 'thumbnail' || local === 'content') {
			const url = child.getAttribute?.('url')?.trim() || child.getAttribute?.('href')?.trim() || '';
			if (url) return resolveUrlWithBase(url, baseUrl);
		}
		if (local === 'enclosure') {
			const type = (child.getAttribute?.('type') || '').toLowerCase();
			const url = child.getAttribute?.('url')?.trim() || child.getAttribute?.('href')?.trim() || '';
			if (url && (type.startsWith('image/') || type === '')) return resolveUrlWithBase(url, baseUrl);
		}
	}
	const rawContent = getChildrenByLocalName(entry, ['description', 'content', 'encoded', 'summary'])
		.map((node) => node.textContent || '')
		.join('\n');
	const inlineImage = rawContent.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1] || '';
	return inlineImage ? resolveUrlWithBase(inlineImage, baseUrl) : '';
};

const parseFeedItemsUniversal = (xml: string, sourceTitle: string, limit = 8): FollowingFeedItem[] => {
	const domParserCtor = (globalThis as { DOMParser?: DomParserConstructor }).DOMParser;
	if (!domParserCtor) return [];

	try {
		const parser = new domParserCtor();
		const doc = parser.parseFromString(xml, 'application/xml');
		if (toDomElements(doc.getElementsByTagName?.('parsererror')).length > 0) return [];

		const rootName = doc.documentElement ? getDomElementName(doc.documentElement) : '';
		const isAtom = rootName === 'feed';
		const entries = isAtom ? toDomElements(doc.getElementsByTagName?.('entry')) : toDomElements(doc.getElementsByTagName?.('item'));

		return entries
			.slice(0, limit)
			.map((entry) => {
				const title = getFirstChildTextByLocalName(entry, ['title']);
				const url = isAtom
					? getFirstLinkFromAtomEntry(entry)
					: getFirstChildTextByLocalName(entry, ['link']) || getFirstChildTextByLocalName(entry, ['guid']);
				const publishedAt = isAtom
					? getFirstChildTextByLocalName(entry, ['updated', 'published'])
					: getFirstChildTextByLocalName(entry, ['pubDate', 'date']);
				const summary = isAtom
					? getFirstChildTextByLocalName(entry, ['summary', 'content'])
					: getFirstChildTextByLocalName(entry, ['description', 'encoded']);
				const photoUrl = url ? getImageFromFeedEntry(entry, url) : '';
				const contentRaw = getChildrenByLocalName(entry, ['content', 'encoded'])
					.map((node) => node.textContent || '')
					.join('\n');
				const inboundRepliesFromFeed = contentRaw && url ? parseEmbeddedRepliesFromFeedContent(contentRaw, url) : [];

				return {
					sourceTitle,
					title: title || 'Untitled',
					url,
					publishedAt,
					summary: summary.slice(0, 300),
					photoUrl: photoUrl || undefined,
					inboundRepliesFromFeed: inboundRepliesFromFeed.length > 0 ? inboundRepliesFromFeed : undefined,
				} satisfies FollowingFeedItem;
			})
			.filter((item) => Boolean(item.url) && Boolean(item.title));
	} catch {
		return [];
	}
};

const extractHtmlHeadlines = (html: string, baseUrl: string, sourceTitle: string, limit = 12): FollowingFeedItem[] => {
	const blockedTokens = ['privacy', 'terms', 'cookie', 'account', 'login', 'signup', 'subscribe', 'advertis'];
	const matches = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
	const dedupe = new Set<string>();
	const items: FollowingFeedItem[] = [];

	for (const match of matches) {
		const href = match[1] ?? '';
		const rawText = stripTags(match[2] ?? '');
		if (!href || !rawText) continue;
		if (rawText.length < 18 || rawText.length > 180) continue;

		const lowerText = rawText.toLowerCase();
		if (blockedTokens.some((token) => lowerText.includes(token))) continue;

		let absolute: string;
		try {
			absolute = new URL(href, baseUrl).toString();
		} catch {
			continue;
		}
		if (dedupe.has(absolute)) continue;
		dedupe.add(absolute);

		items.push({
			sourceTitle,
			title: rawText,
			url: absolute,
			publishedAt: '',
			summary: '',
		});
		if (items.length >= limit) break;
	}

	return items;
};

const getElementClassTokens = (element: DomElementLike): string[] => {
	const classAttr = element.getAttribute?.('class') || '';
	return classAttr
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);
};

const getHTypeClasses = (element: DomElementLike): string[] =>
	getElementClassTokens(element).filter((token) => /^h-[a-z0-9-]+$/.test(token));

const getClosestMicroformatRoot = (node: DomElementLike, entryRoot: DomElementLike): DomElementLike | null => {
	let current: DomElementLike | null = node;
	while (current && current !== entryRoot) {
		if (getHTypeClasses(current).length > 0) return current;
		current = current.parentElement ?? null;
	}
	return entryRoot;
};

const resolveUrlMaybe = (value: string, baseUrl: string): string => {
	const trimmed = value.trim();
	if (!trimmed) return '';
	try {
		return new URL(trimmed, baseUrl).toString();
	} catch {
		return trimmed;
	}
};

const getNodeTextValue = (element: DomElementLike): string => {
	const title = element.getAttribute?.('title')?.trim();
	if (title) return title;
	const valueAttr = element.getAttribute?.('value')?.trim();
	if (valueAttr) return valueAttr;
	return stripTags(element.textContent || '').trim();
};

const getMf2ValueForClass = (element: DomElementLike, mfClass: string, baseUrl: string): string => {
	if (mfClass.startsWith('u-')) {
		const candidate =
			element.getAttribute?.('href') ||
			element.getAttribute?.('src') ||
			element.getAttribute?.('data') ||
			element.getAttribute?.('value') ||
			element.getAttribute?.('title') ||
			element.textContent ||
			'';
		return resolveUrlMaybe(candidate, baseUrl);
	}
	if (mfClass.startsWith('dt-')) {
		return (
			element.getAttribute?.('datetime')?.trim() ||
			element.getAttribute?.('title')?.trim() ||
			element.getAttribute?.('value')?.trim() ||
			getNodeTextValue(element)
		);
	}
	if (mfClass.startsWith('e-')) {
		return element.innerHTML?.trim() || '';
	}
	return getNodeTextValue(element);
};

const addMicroformatsProperty = (store: Record<string, unknown>, key: string, value: string): void => {
	if (!value) return;
	const current = store[key];
	if (current === undefined) {
		store[key] = value;
		return;
	}
	if (Array.isArray(current)) {
		if (!current.includes(value)) current.push(value);
		return;
	}
	if (current !== value) {
		store[key] = [current as string, value];
	}
};

const getMf2First = (properties: Record<string, unknown>, key: string): string => {
	const value = properties[key];
	if (typeof value === 'string') return value;
	if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
	return '';
};

const getMf2List = (properties: Record<string, unknown>, key: string): string[] => {
	const value = properties[key];
	if (typeof value === 'string') return [value];
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string');
};

const collectMicroformatsProperties = (entry: DomElementLike, baseUrl: string): Record<string, unknown> => {
	const properties: Record<string, unknown> = {};
	const nodes = [entry, ...toDomElements(entry.querySelectorAll?.('*'))];
	for (const node of nodes) {
		const classes = getElementClassTokens(node).filter((className) => /^(p|u|dt|e)-[a-z0-9-]+$/.test(className));
		if (classes.length === 0) continue;
		const closestRoot = getClosestMicroformatRoot(node, entry);
		for (const mfClass of classes) {
			// Respect nested microformat roots (e.g. p-author h-card) by only allowing
			// properties from the entry root context, or from the nested root itself when
			// it carries a property class directly.
			if (closestRoot && closestRoot !== entry && closestRoot !== node) {
				continue;
			}
			const value = getMf2ValueForClass(node, mfClass, baseUrl);
			addMicroformatsProperty(properties, mfClass, value);
		}
	}
	return properties;
};

const extractMicroformatsEntries = (html: string, baseUrl: string, sourceTitle: string, limit = 10): FollowingFeedItem[] => {
	const domParserCtor = (globalThis as { DOMParser?: DomParserConstructor }).DOMParser;
	if (!domParserCtor) return [];
	try {
		const parser = new domParserCtor();
		const doc = parser.parseFromString(html, 'text/html');
		const hEntries = toDomElements(doc.querySelectorAll?.('.h-entry')).slice(0, limit);
		if (hEntries.length === 0) return [];

		const entries: FollowingFeedItem[] = [];
		for (const entry of hEntries) {
			const properties = collectMicroformatsProperties(entry, baseUrl);
			const url = getMf2First(properties, 'u-url');
			if (!url) continue;
			const title = getMf2First(properties, 'p-name');
			const summary = getMf2First(properties, 'p-summary');
			const contentHtml = getMf2First(properties, 'e-content');
			const contentText = contentHtml ? stripTags(contentHtml) : '';
			const publishedAt = getMf2First(properties, 'dt-published');
			const photoUrl = getMf2First(properties, 'u-photo');
			const authorName = getMf2First(properties, 'p-author');
			const authorUrl = getMf2First(properties, 'u-author');
			const categories = getMf2List(properties, 'p-category');
			const fallbackAnchor = asDomElement(entry.querySelector?.('a[href]'));
			const fallbackUrl = fallbackAnchor ? resolveUrlMaybe(fallbackAnchor.getAttribute?.('href') || '', baseUrl) : '';
			const canonicalUrl = url || fallbackUrl;
			if (!canonicalUrl) continue;

			entries.push({
				sourceTitle,
				title: title || summary || contentText || canonicalUrl,
				url: canonicalUrl,
				publishedAt,
				summary: (summary || contentText).slice(0, 300),
				photoUrl: photoUrl || undefined,
				authorName: authorName || undefined,
				authorUrl: authorUrl || undefined,
				categories,
				microformats: properties,
			});
		}
		return entries;
	} catch {
		return [];
	}
};

const discoverFeedUrl = async (siteUrl: string): Promise<string | null> => {
	try {
		const html = await fetchTextWithTimeout(siteUrl, 'text/html,application/xhtml+xml');
		const alternateLinks = Array.from(
			html.matchAll(
				/<link\b[^>]*rel=["'][^"']*alternate[^"']*["'][^>]*type=["'](?:application\/rss\+xml|application\/atom\+xml|application\/xml|text\/xml)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi
			)
		);
		for (const link of alternateLinks) {
			const href = link[1];
			if (!href) continue;
			try {
				return new URL(href, siteUrl).toString();
			} catch {
				continue;
			}
		}

		const candidates = ['/feed', '/feed.xml', '/rss', '/rss.xml', '/atom.xml'];
		for (const path of candidates) {
			const candidate = new URL(path, siteUrl).toString();
			try {
				const body = await fetchTextWithTimeout(candidate, 'application/rss+xml,application/atom+xml,application/xml,text/xml');
				const lower = body.toLowerCase();
				if (lower.includes('<rss') || lower.includes('<feed')) {
					return candidate;
				}
			} catch {
				// keep trying
			}
		}
		return null;
	} catch {
		return null;
	}
};

const resolveFollowingSources = (
	items: DashboardContentItem[],
	collectionMetaMap: Map<string, DashboardCollectionMeta>
): FollowingSourceItem[] => {
	const followsMeta = findCollectionByName(collectionMetaMap, 'following-sources');
	if (!followsMeta) return [];
	return items
		.filter((item) => item.collectionId === followsMeta.id || item.collectionId === followsMeta.name)
		.map((item) => {
			const siteUrl = typeof item.data.siteUrl === 'string' ? item.data.siteUrl : '';
			const feedUrl = typeof item.data.feedUrl === 'string' ? item.data.feedUrl : '';
			const active = typeof item.data.active === 'boolean' ? item.data.active : true;
			return {
				id: item.id,
				title: item.title || siteUrl || 'Untitled source',
				siteUrl,
				feedUrl,
				active,
				updatedAt: item.updatedAt,
				collectionPath: encodeURIComponent(followsMeta.name),
			} satisfies FollowingSourceItem;
		})
		.filter((item) => item.active && Boolean(item.siteUrl))
		.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};

const toDisplayHost = (url: string): string => {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
};

const toReplyAuthorLabel = (authorName: string, authorUrl?: string, sourceUrl?: string): string => {
	const normalizedAuthor = String(authorName || '').trim();
	const isPlaceholder = /^replied\s+to\b/i.test(normalizedAuthor) || /^unknown author$/i.test(normalizedAuthor);
	const fallbackFromUrl = toDisplayHost(sourceUrl || authorUrl || '').trim();
	const isLocalFallback = fallbackFromUrl === 'localhost' || fallbackFromUrl === '127.0.0.1';
	const safeFallback = isLocalFallback ? '' : fallbackFromUrl;
	if (isPlaceholder) return safeFallback || 'Unknown author';
	return normalizedAuthor || safeFallback || 'Unknown author';
};

const toHost = (url: string): string => {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
};

const toDisplayHostUrl = (url: string): string => {
	try {
		return new URL(url).origin;
	} catch {
		return url;
	}
};

const toDisplayTitle = (title: string, url: string): string => {
	const trimmed = String(title || '').trim();
	if (trimmed && !/^https?:\/\//i.test(trimmed)) return trimmed;

	try {
		const parsed = new URL(url);
		const parts = parsed.pathname.split('/').filter(Boolean);
		const last = decodeURIComponent(parts[parts.length - 1] || '');
		if (!last) return parsed.hostname.replace(/^www\./, '');
		const cleaned = last
			.replace(/\.(html|htm|php|asp|aspx)$/i, '')
			.replace(/[-_]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : parsed.hostname.replace(/^www\./, '');
	} catch {
		return trimmed || url;
	}
};

const toRelativeTime = (value: string): string => {
	const raw = String(value || '').trim();
	if (!raw) return '';
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) return raw;
	const diffMs = Math.max(0, Date.now() - parsed.getTime());
	const minuteMs = 60 * 1000;
	const hourMs = 60 * 60 * 1000;
	const dayMs = 24 * hourMs;
	const weekMs = 7 * dayMs;
	if (diffMs < minuteMs) return 'just now';
	if (diffMs < hourMs) return `${Math.floor(diffMs / minuteMs)}m ago`;
	if (diffMs < dayMs) return `${Math.floor(diffMs / hourMs)}h ago`;
	if (diffMs < weekMs) return `${Math.floor(diffMs / dayMs)}d ago`;
	return `${Math.floor(diffMs / weekMs)}w ago`;
};

const toPublishedTimestamp = (value: string): number => {
	const raw = String(value || '').trim();
	if (!raw) return 0;
	if (/^\d+$/.test(raw)) {
		const numeric = Number(raw);
		if (Number.isFinite(numeric)) {
			const epochMs = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
			return Number.isFinite(epochMs) ? epochMs : 0;
		}
	}
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const toDisplayDate = (value: string): string => {
	return toRelativeTime(value);
};

const toDisplayDateTime = (value: string): string => {
	return toRelativeTime(value);
};

const isGenericReplyText = (value: string): boolean => {
	const normalized = String(value || '')
		.trim()
		.toLowerCase();
	return normalized === 'reply text';
};

const scoreReplyQuality = (reply: { author: string; text: string; sourceUrl?: string; authorUrl?: string; displayDate?: string }): number => {
	let score = 0;
	if (!isGenericReplyText(reply.text)) score += 5;
	if (reply.text.trim().length >= 6) score += 2;
	if (reply.sourceUrl && /^https:\/\//i.test(reply.sourceUrl)) score += 2;
	if (reply.authorUrl && /^https:\/\//i.test(reply.authorUrl)) score += 1;
	if (reply.author && !/^(localhost|127\.0\.0\.1)$/i.test(reply.author.trim())) score += 1;
	if (reply.displayDate && reply.displayDate !== 'just now') score += 1;
	return score;
};

const toLastNonEmptyCommentText = (outbound?: OutboundWebmentionRecord): string => {
	if (!outbound) return '';
	const fromHistory = [...(outbound.commentHistory || [])]
		.reverse()
		.map((entry) => String(entry.text || '').trim())
		.find((text) => text.length > 0);
	return fromHistory || String(outbound.commentText || '').trim();
};

const areUrlsEquivalent = (left: string, right: string): boolean => {
	const leftRaw = String(left || '').trim();
	const rightRaw = String(right || '').trim();
	if (!leftRaw || !rightRaw) return false;
	try {
		return normalizeUrl(leftRaw) === normalizeUrl(rightRaw);
	} catch {
		return leftRaw === rightRaw;
	}
};

const loadLocalFollowingFeedItems = async (
	source: FollowingSourceItem,
	options?: { currentOrigin?: string; backendOptions?: BackendRequestOptions }
): Promise<FollowingFeedItem[]> => {
	const currentOrigin = options?.currentOrigin;
	if (!currentOrigin) return [];
	const sourceHost = toHost(source.siteUrl || source.feedUrl || '');
	const currentHost = toHost(currentOrigin);
	if (!sourceHost || !currentHost || sourceHost !== currentHost) return [];

	const statusFilter: CollectionFilter[] = [{ field: 'status', operator: 'equals', value: 'published' }];
	const collections = (await sonicGetCollectionsCached(options?.backendOptions)).filter(
		(collection) => !SYSTEM_COLLECTION_NAMES.has(String(collection.name || '').trim().toLowerCase())
	);
	const itemsByCollection = await Promise.all(
		collections.map(async (collection) => {
			try {
					const items = await sonicGetContent(collection.name, statusFilter, options?.backendOptions);
					return items.map((item) => {
						const dataObject = item.data && typeof item.data === 'object' ? (item.data as Record<string, unknown>) : {};
					const title =
						(typeof dataObject.title === 'string' && dataObject.title.trim()) ||
						item.title ||
						`${collection.display_name || collection.name}: ${item.slug}`;
					const summarySource =
						(typeof dataObject.summary === 'string' && dataObject.summary) ||
						(typeof dataObject.excerpt === 'string' && dataObject.excerpt) ||
						(typeof dataObject.caption === 'string' && dataObject.caption) ||
						(typeof dataObject.contentText === 'string' && dataObject.contentText) ||
						(typeof dataObject.content === 'string' ? stripTags(dataObject.content) : '');
						const publishedAt =
							(typeof dataObject.publishedAt === 'string' && dataObject.publishedAt) ||
							(typeof dataObject.createdAt === 'string' && dataObject.createdAt) ||
							item.updatedAt ||
							item.createdAt ||
							'';
						const photoUrl = resolveFollowingLocalItemImageUrl(dataObject, currentOrigin);
						return {
							sourceTitle: source.title,
							title: String(title),
							url: `${currentOrigin}/${encodeURIComponent(collection.name)}/${encodeURIComponent(item.slug)}`,
							publishedAt,
							summary: String(summarySource).slice(0, 300),
							photoUrl: photoUrl || undefined,
						} satisfies FollowingFeedItem;
					});
				} catch {
				return [] as FollowingFeedItem[];
			}
		})
	);

	return itemsByCollection
		.flat()
		.sort((a, b) => toPublishedTimestamp(b.publishedAt) - toPublishedTimestamp(a.publishedAt))
		.slice(0, 8);
};

const getMetaContent = (doc: DomDocumentLike, attrs: Array<{ name?: string; property?: string }>): string => {
	for (const attr of attrs) {
		let selector = 'meta';
		if (attr.name) selector += `[name="${attr.name}"]`;
		if (attr.property) selector += `[property="${attr.property}"]`;
		const value = asDomElement(doc.querySelector?.(selector))?.getAttribute?.('content')?.trim();
		if (value) return value;
	}
	return '';
};

const normalizeKeywordList = (value: string): string[] =>
	value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

const parseLinkedPageDetails = (
	html: string,
	itemUrl: string
): {
	title?: string;
	summary?: string;
	photoUrl?: string;
	authorName?: string;
	authorPhotoUrl?: string;
	authorUrl?: string;
	categories?: string[];
	publishedAt?: string;
	microformats?: Record<string, unknown>;
} => {
	const domParserCtor = (globalThis as { DOMParser?: DomParserConstructor }).DOMParser;
	if (!domParserCtor) return {};
	try {
		const parser = new domParserCtor();
		const doc = parser.parseFromString(html, 'text/html');
		const entry = asDomElement(doc.querySelector?.('.h-entry'));
		const mf2Props = entry ? collectMicroformatsProperties(entry, itemUrl) : {};

		const mf2Title = getMf2First(mf2Props, 'p-name');
		const mf2Summary = getMf2First(mf2Props, 'p-summary');
		const mf2Content = getMf2First(mf2Props, 'e-content');
		const mf2Photo = getMf2First(mf2Props, 'u-photo');
		const mf2AuthorPhoto = getMf2First(mf2Props, 'u-author-photo');
		const mf2Author = getMf2First(mf2Props, 'p-author');
		const mf2AuthorUrl = getMf2First(mf2Props, 'u-author');
		const mf2Published = getMf2First(mf2Props, 'dt-published');
		const mf2Categories = getMf2List(mf2Props, 'p-category');

		const ogTitle = getMetaContent(doc, [{ property: 'og:title' }, { name: 'twitter:title' }]);
		const ogDescription = getMetaContent(doc, [{ property: 'og:description' }, { name: 'twitter:description' }, { name: 'description' }]);
		const ogImage = getMetaContent(doc, [{ property: 'og:image' }, { name: 'twitter:image' }]);
		const metaAuthor = getMetaContent(doc, [{ name: 'author' }]);
		const metaAuthorImage = getMetaContent(doc, [{ property: 'profile:image' }, { property: 'author:image' }, { name: 'author:image' }]);
		const metaPublished = getMetaContent(doc, [{ property: 'article:published_time' }]);
		const articleTags = toDomElements(doc.querySelectorAll?.('meta[property="article:tag"]'))
			.map((tag) => tag.getAttribute?.('content')?.trim() || '')
			.filter(Boolean);
		const metaKeywords = normalizeKeywordList(getMetaContent(doc, [{ name: 'keywords' }]));
		const canonical = asDomElement(doc.querySelector?.('link[rel="canonical"]'))?.getAttribute?.('href') || '';

		const parsedTitle = mf2Title || ogTitle || (asDomElement(doc.querySelector?.('title'))?.textContent || '').trim() || undefined;
		const parsedSummary = (mf2Summary || (mf2Content ? stripTags(mf2Content) : '') || ogDescription || '').trim() || undefined;
		const parsedPhoto = resolveUrlMaybe(mf2Photo || ogImage || '', itemUrl) || undefined;
		const parsedAuthor = (mf2Author || metaAuthor || '').trim() || undefined;
		const authorPhotoFromCard =
			resolveUrlMaybe(
				asDomElement(doc.querySelector?.('.p-author .u-photo'))?.getAttribute?.('src') ||
					asDomElement(doc.querySelector?.('.p-author .u-photo'))?.getAttribute?.('href') ||
					asDomElement(doc.querySelector?.('.h-card .u-photo'))?.getAttribute?.('src') ||
					asDomElement(doc.querySelector?.('.h-card .u-photo'))?.getAttribute?.('href') ||
					asDomElement(doc.querySelector?.('a[rel~="author"] img'))?.getAttribute?.('src') ||
					'',
				itemUrl
			) || '';
		const parsedAuthorPhoto = resolveUrlMaybe(mf2AuthorPhoto || metaAuthorImage || authorPhotoFromCard || '', itemUrl) || undefined;
		const parsedAuthorUrl = resolveUrlMaybe(mf2AuthorUrl || '', itemUrl) || undefined;
		const parsedPublished = (mf2Published || metaPublished || '').trim() || undefined;
		const parsedCategories = Array.from(new Set([...mf2Categories, ...articleTags, ...metaKeywords]));

		const metadataProps: Record<string, unknown> = {
			...mf2Props,
			'meta-og:title': ogTitle || undefined,
			'meta-og:description': ogDescription || undefined,
			'meta-og:image': ogImage || undefined,
			'meta-author': metaAuthor || undefined,
			'meta-article:published_time': metaPublished || undefined,
			'meta-canonical': canonical ? resolveUrlMaybe(canonical, itemUrl) : undefined,
			'meta-article:tag': articleTags.length > 0 ? articleTags : undefined,
			'meta-keywords': metaKeywords.length > 0 ? metaKeywords : undefined,
		};

		return {
			title: parsedTitle,
			summary: parsedSummary,
			photoUrl: parsedPhoto,
			authorName: parsedAuthor,
			authorPhotoUrl: parsedAuthorPhoto,
			authorUrl: parsedAuthorUrl,
			categories: parsedCategories,
			publishedAt: parsedPublished,
			microformats: metadataProps,
		};
	} catch {
		return {};
	}
};

const isUrlLikeTitle = (title: string): boolean => /^https?:\/\//i.test(title) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title.trim());

const enrichFollowingFeedItem = async (item: FollowingFeedItem): Promise<FollowingFeedItem> => {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 4500);
		let response: Response;
		try {
			response = await fetchBackend(
				item.url,
				{
					method: 'GET',
					redirect: 'follow',
					headers: {
						accept: 'text/html,application/xhtml+xml,*/*',
						'user-agent': 'indie-web-starter-following/1.0',
					},
					signal: controller.signal,
				},
				undefined
			);
		} finally {
			clearTimeout(timeoutId);
		}
		if (!response.ok) return item;
		const finalUrl = response.url || item.url;
		const linkHeader = response.headers.get('link') || '';
		const endpointFromHeader = linkHeader ? resolveEndpointFromLinkHeader(linkHeader, finalUrl) : '';
		const html = await response.text().catch(() => '');
		const endpointFromHtml = html ? resolveEndpointFromHtml(html, finalUrl) : '';
		const webmentionEndpoint = endpointFromHeader || endpointFromHtml || '';
		const details = parseLinkedPageDetails(html, finalUrl);
		const nextTitle = details.title && (isUrlLikeTitle(item.title) || item.title.length < 8) ? details.title : item.title;
		const nextSummary = item.summary || details.summary || '';
		const nextPhoto = item.photoUrl || details.photoUrl;
		const nextAuthorName = item.authorName || details.authorName;
		const nextAuthorPhoto = item.authorPhotoUrl || details.authorPhotoUrl;
		const nextAuthorUrl = item.authorUrl || details.authorUrl;
		const nextPublishedAt = item.publishedAt || details.publishedAt || '';
		const nextCategories = Array.from(new Set([...(item.categories || []), ...(details.categories || [])]));
		return {
			...item,
			title: nextTitle || item.title,
			summary: nextSummary,
			photoUrl: nextPhoto,
			authorName: nextAuthorName,
			authorPhotoUrl: nextAuthorPhoto,
			authorUrl: nextAuthorUrl,
			publishedAt: nextPublishedAt,
			categories: nextCategories,
			webmentionEndpoint: webmentionEndpoint || undefined,
			hasWebmentionEndpoint: Boolean(webmentionEndpoint),
			microformats: {
				...(item.microformats || {}),
				...(details.microformats || {}),
			},
		};
	} catch {
		return item;
	}
};

const toMicroformatsPreview = (value: Record<string, unknown> | undefined): string => {
	if (!value || typeof value !== 'object') return '';
	const parts: string[] = [];
	for (const [key, raw] of Object.entries(value)) {
		if (raw === null || raw === undefined) continue;
		if (typeof raw === 'string') {
			if (!raw.trim()) continue;
			parts.push(`${key}: ${raw}`);
			continue;
		}
		if (Array.isArray(raw)) {
			const values = raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
			if (values.length === 0) continue;
			parts.push(`${key}: ${values.join(', ')}`);
		}
	}
	return parts.slice(0, 8).join('\n');
};

const mapFollowingFeedItemsForDisplay = (
	items: FollowingFeedItem[],
	outboundByTarget = new Map<string, OutboundWebmentionRecord>(),
	inboundRepliesByTarget = new Map<string, InboundReplyRecord[]>(),
	commentAuthorName = 'You'
) => {
	const selfReplyHosts = new Set(
		Array.from(outboundByTarget.values())
			.map((record) => toHost(record.sourceUrl || ''))
			.filter((host) => host.length > 0)
	);
	return items.map((item) => {
		let normalizedTarget = item.url;
		let normalizedTargetNoQuery = item.url;
		let targetHostPathKey = '';
		try {
			normalizedTarget = normalizeUrl(item.url);
			normalizedTargetNoQuery = normalizeUrlWithoutQuery(item.url);
			targetHostPathKey = toHostPathKey(item.url);
		} catch {
			// keep raw value
		}
		const outbound =
			outboundByTarget.get(normalizedTarget) ||
			outboundByTarget.get(normalizedTargetNoQuery) ||
			(targetHostPathKey ? outboundByTarget.get(targetHostPathKey) : undefined);
		const outboundReplyText = toLastNonEmptyCommentText(outbound);
		const previousComments = (outbound?.commentHistory || []).map((entry) => ({
			author: commentAuthorName,
			text: entry.text,
			displayDate: toDisplayDateTime(entry.attemptedAt),
			authorUrl: '',
			authorPhoto: '',
			sourceUrl: '',
			isOwn: true,
		}));
		const ownCommentTexts = new Set(previousComments.map((entry) => entry.text.trim().toLowerCase()).filter((entry) => entry.length > 0));
		const inboundRepliesFromFeed = (item.inboundRepliesFromFeed || [])
			.filter((entry) => {
				const normalizedText = entry.contentText.trim().toLowerCase();
				return normalizedText.length > 0;
			})
			.map((entry) => ({
				author: toReplyAuthorLabel(entry.authorName || '', entry.authorUrl, entry.sourceUrl),
				authorUrl: entry.authorUrl || '',
				authorPhoto: entry.authorPhoto || '',
				text: entry.contentText,
				displayDate: toDisplayDateTime(entry.publishedAt),
				sourceUrl: entry.sourceUrl || '',
				isOwn: false,
			}));
		const inboundRepliesFromWebmentions = (
			inboundRepliesByTarget.get(normalizedTarget) ||
			inboundRepliesByTarget.get(normalizedTargetNoQuery) ||
			(targetHostPathKey ? inboundRepliesByTarget.get(targetHostPathKey) : undefined) ||
			[]
		)
			.map((entry) => ({
				author: toReplyAuthorLabel(entry.authorName || '', entry.authorUrl, entry.sourceUrl),
				authorUrl: entry.authorUrl || '',
				authorPhoto: entry.authorPhoto || '',
				text:
					isGenericReplyText(entry.contentText) &&
					outboundReplyText &&
					(!entry.sourceUrl || areUrlsEquivalent(entry.sourceUrl, outbound?.sourceUrl || ''))
						? outboundReplyText
						: entry.contentText,
				displayDate: toDisplayDateTime(entry.publishedAt),
				sourceUrl: entry.sourceUrl || '',
				isOwn: false,
			}))
			.filter((entry) => {
				const normalizedText = entry.text.trim().toLowerCase();
				const sourceHost = toHost(entry.sourceUrl || '');
				const authorHost = toHost(entry.authorUrl || '');
				const isSelfReply = (sourceHost && selfReplyHosts.has(sourceHost)) || (authorHost && selfReplyHosts.has(authorHost));
				if (normalizedText.length === 0) return false;
				if (ownCommentTexts.has(normalizedText)) return false;
				if (isSelfReply) return false;
				if (isGenericReplyText(entry.text) && entry.sourceUrl && areUrlsEquivalent(entry.sourceUrl, outbound?.sourceUrl || '')) {
					return false;
				}
				return true;
			});
		const inboundReplies = [...inboundRepliesFromFeed, ...inboundRepliesFromWebmentions];
		const dedupedBySource = new Map<string, (typeof inboundReplies)[number]>();
		const dedupedBySignature = new Set<string>();
		for (const reply of inboundReplies) {
			const sourceKey = reply.sourceUrl.trim().toLowerCase();
			if (sourceKey) {
				const existing = dedupedBySource.get(sourceKey);
				if (!existing || scoreReplyQuality(reply) > scoreReplyQuality(existing)) {
					dedupedBySource.set(sourceKey, reply);
				}
				continue;
			}
			const signature = [reply.author.trim().toLowerCase(), reply.text.trim().toLowerCase()].join('|');
			if (dedupedBySignature.has(signature)) continue;
			dedupedBySignature.add(signature);
			dedupedBySource.set(`sig:${signature}`, reply);
		}
		const dedupedInboundReplies = Array.from(dedupedBySource.values());
		const conversationEntries = [...previousComments, ...dedupedInboundReplies];
		return {
			...item,
			displaySource: item.sourceTitle || toDisplayHost(item.url),
			displayTitle: toDisplayTitle(item.title, item.url),
			displayHost: toDisplayHost(item.url),
			displayHostUrl: toDisplayHostUrl(item.url),
			displayDate: toDisplayDate(item.publishedAt),
			displayAuthor: item.authorName || item.sourceTitle || toDisplayHost(item.url),
			authorPhotoUrl: item.authorPhotoUrl ?? '',
			hasAuthor: Boolean(item.authorName || item.authorPhotoUrl || item.sourceTitle),
			displayCategories: (item.categories ?? []).join(' · '),
			summary: item.summary,
			microformatsPreview: toMicroformatsPreview(item.microformats),
			outboundBadge: outbound?.status ? `${outbound.mentionType} ${outbound.status}` : '',
			outboundError: outbound?.errorMessage || '',
				isLiked: Boolean(outbound?.hasSuccessfulLike || (outbound?.mentionType === 'like' && outbound?.status === 'sent')),
				webmentionAvailable: Boolean(item.hasWebmentionEndpoint),
				previousComment: outbound?.commentText || '',
				previousComments,
				inboundReplies: dedupedInboundReplies,
				conversationEntries,
			};
	});
};

const loadFollowingFeedItems = async (
	sources: FollowingSourceItem[],
	options?: { currentOrigin?: string; backendOptions?: BackendRequestOptions }
): Promise<FollowingFeedItem[]> => {
	const output: FollowingFeedItem[] = [];
	for (const source of sources.slice(0, 12)) {
		const resolvedFeedUrl = source.feedUrl || (await discoverFeedUrl(source.siteUrl)) || '';
		const fetchTargets = [resolvedFeedUrl, source.siteUrl].filter(Boolean);

		let appended = false;
		for (const target of fetchTargets) {
			try {
				const body = await fetchTextWithTimeout(target, 'application/rss+xml,application/atom+xml,application/xml,text/xml,text/html,*/*');
				const lower = body.toLowerCase();
				const universalParsed = parseFeedItemsUniversal(body, source.title, 8);
				const parsedFeed =
					universalParsed.length > 0
						? universalParsed
						: lower.includes('<rss') || lower.includes('<rdf:rdf')
						? parseRssItems(body, source.title, 8)
						: lower.includes('<feed')
						? parseAtomItems(body, source.title, 8)
						: [];
				if (parsedFeed.length > 0) {
					const feedLevelAuthor = extractFeedLevelAuthor(body);
					const feedLevelImage = extractFeedLevelImage(body, target);
					const fallbackAvatar = feedLevelImage || fallbackFaviconUrl(source.siteUrl || target);
					output.push(
						...parsedFeed.map((item) => ({
							...item,
							authorName: item.authorName || feedLevelAuthor || source.title || undefined,
							authorPhotoUrl: item.authorPhotoUrl || fallbackAvatar || undefined,
						}))
					);
					appended = true;
					break;
				}

				// Prefer structured microformats extraction from h-entry when XML feeds are unavailable.
				const mf2Items = extractMicroformatsEntries(body, target, source.title, 8);
				if (mf2Items.length > 0) {
					output.push(...mf2Items);
					appended = true;
					break;
				}

				// Fallback: scrape headline links from HTML pages when feeds are blocked/empty.
				const parsedHtml = extractHtmlHeadlines(body, target, source.title, 8);
				if (parsedHtml.length > 0) {
					output.push(...parsedHtml);
					appended = true;
					break;
				}
			} catch {
				continue;
			}
		}

		if (!appended) {
			continue;
		}
	}

	const sorted = output.sort((a, b) => toPublishedTimestamp(b.publishedAt) - toPublishedTimestamp(a.publishedAt)).slice(0, 30);

	const enrichCount = sorted.length;
	const enriched = await Promise.all(sorted.slice(0, enrichCount).map((item) => enrichFollowingFeedItem(item)));
	return [...enriched, ...sorted.slice(enrichCount)];
};

const resolvePendingWebmentions = (
	items: DashboardContentItem[],
	collectionMetaMap: Map<string, DashboardCollectionMeta>
): PendingWebmentionItem[] => {
	const webmentionsMeta = Array.from(collectionMetaMap.values()).find((meta) => meta.name === 'webmentions');
	if (!webmentionsMeta) return [];

	return items
		.filter((item) => item.collectionId === webmentionsMeta.id || item.collectionId === webmentionsMeta.name)
		.filter((item) => {
			const nestedStatus = typeof item.data.status === 'string' ? item.data.status : '';
			return nestedStatus === 'pending';
		})
		.map((item) => ({
			id: item.id,
			title: item.title,
			sourceDomain: typeof item.data.sourceDomain === 'string' ? item.data.sourceDomain : 'unknown',
			mentionType: typeof item.data.mentionType === 'string' ? item.data.mentionType : 'mention',
			targetCollection: typeof item.data.targetCollection === 'string' ? item.data.targetCollection : '',
			targetSlug: typeof item.data.targetSlug === 'string' ? item.data.targetSlug : '',
			updatedAt: item.updatedAt,
			collectionPath: encodeURIComponent(webmentionsMeta.name),
		}))
		.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};

const resolveOutboundWebmentions = (
	items: DashboardContentItem[],
	collectionMetaMap: Map<string, DashboardCollectionMeta>
): Map<string, OutboundWebmentionRecord> => {
	const outboundMeta = findCollectionByName(collectionMetaMap, 'outbound-webmentions');
	const result = new Map<string, OutboundWebmentionRecord>();
	if (!outboundMeta) return result;

	const candidates = items
		.filter((item) => (item.collectionId === outboundMeta.id || item.collectionId === outboundMeta.name) && item.status === 'published')
		.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

	for (const item of candidates) {
		const targetUrl = typeof item.data.targetUrl === 'string' ? item.data.targetUrl : '';
		if (!targetUrl) continue;
		let normalizedTarget = targetUrl;
		let normalizedTargetNoQuery = targetUrl;
		let targetHostPathKey = '';
		try {
			normalizedTarget = normalizeUrl(targetUrl);
			normalizedTargetNoQuery = normalizeUrlWithoutQuery(targetUrl);
			targetHostPathKey = toHostPathKey(targetUrl);
		} catch {
			// keep raw value
		}
		const mentionType =
			item.data.mentionType === 'like' || item.data.mentionType === 'reply' || item.data.mentionType === 'repost'
				? item.data.mentionType
				: 'mention';
		const deliveryStatus: OutboundWebmentionStatus =
			item.data.deliveryStatus === 'sent' || item.data.deliveryStatus === 'failed' ? item.data.deliveryStatus : 'pending';
		const commentText = typeof item.data.commentText === 'string' ? item.data.commentText.trim() : '';
		const existing =
			result.get(normalizedTarget) ||
			result.get(normalizedTargetNoQuery) ||
			(targetHostPathKey ? result.get(targetHostPathKey) : undefined);
		if (!existing) {
			const attemptedAt = typeof item.data.attemptedAt === 'string' ? item.data.attemptedAt : item.updatedAt;
			const commentHistory = mentionType === 'reply' && commentText ? [{ text: commentText, attemptedAt }] : [];
			const record: OutboundWebmentionRecord = {
				targetUrl,
				targetTitle: typeof item.data.targetTitle === 'string' ? item.data.targetTitle : item.title,
				sourceUrl: typeof item.data.sourceUrl === 'string' ? item.data.sourceUrl : '',
				mentionType,
				status: deliveryStatus,
				hasSuccessfulLike: mentionType === 'like' && deliveryStatus === 'sent',
				attemptedAt,
				errorMessage: typeof item.data.errorMessage === 'string' ? item.data.errorMessage : '',
				commentText: mentionType === 'reply' && commentText ? commentText : '',
				commentHistory,
				outboundUrl: item.slug ? `/${encodeURIComponent(outboundMeta.name)}/${encodeURIComponent(item.slug)}` : undefined,
			};
			result.set(normalizedTarget, record);
			if (!result.has(normalizedTargetNoQuery)) {
				result.set(normalizedTargetNoQuery, record);
			}
			if (targetHostPathKey && !result.has(targetHostPathKey)) {
				result.set(targetHostPathKey, record);
			}
			continue;
		}
		if (mentionType === 'reply' && commentText) {
			if (!existing.commentHistory) existing.commentHistory = [];
			existing.commentHistory.push({
				text: commentText,
				attemptedAt: typeof item.data.attemptedAt === 'string' ? item.data.attemptedAt : item.updatedAt,
			});
			if (!existing.commentText) existing.commentText = commentText;
		}
		if (mentionType === 'like' && deliveryStatus === 'sent') {
			existing.hasSuccessfulLike = true;
		}
	}

	return result;
};

const resolveInboundRepliesByTarget = (
	items: DashboardContentItem[],
	collectionMetaMap: Map<string, DashboardCollectionMeta>
): Map<string, InboundReplyRecord[]> => {
	const webmentionsMeta = findCollectionByName(collectionMetaMap, 'webmentions');
	const result = new Map<string, InboundReplyRecord[]>();
	if (!webmentionsMeta) return result;

	const candidates = items
		.filter(
			(item) => (item.collectionId === webmentionsMeta.id || item.collectionId === webmentionsMeta.name) && item.status === 'published'
		)
		.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));

	for (const item of candidates) {
		const mentionType = typeof item.data.mentionType === 'string' ? item.data.mentionType.toLowerCase() : '';
		const moderationStatus = typeof item.data.status === 'string' ? item.data.status.toLowerCase() : '';
		if (mentionType !== 'reply' || moderationStatus !== 'approved') continue;
		const targetUrl = typeof item.data.targetUrl === 'string' ? item.data.targetUrl : '';
		const contentText = typeof item.data.contentText === 'string' ? item.data.contentText.trim() : '';
		if (!targetUrl || !contentText) continue;

		let normalizedTarget = targetUrl;
		let normalizedTargetNoQuery = targetUrl;
		let targetHostPathKey = '';
		try {
			normalizedTarget = normalizeUrl(targetUrl);
			normalizedTargetNoQuery = normalizeUrlWithoutQuery(targetUrl);
			targetHostPathKey = toHostPathKey(targetUrl);
		} catch {
			// keep raw value
		}

		const entry: InboundReplyRecord = {
			authorName:
				(typeof item.data.authorName === 'string' && item.data.authorName.trim()) ||
				(typeof item.data.sourceDomain === 'string' && item.data.sourceDomain.trim()) ||
				'Unknown author',
			authorUrl: typeof item.data.authorUrl === 'string' ? item.data.authorUrl : '',
			authorPhoto: typeof item.data.authorPhoto === 'string' ? item.data.authorPhoto : '',
			contentText,
			publishedAt:
				(typeof item.data.publishedAt === 'string' && item.data.publishedAt) ||
				(typeof item.data.updatedAt === 'string' && item.data.updatedAt) ||
				item.updatedAt,
			sourceUrl: typeof item.data.sourceUrl === 'string' ? item.data.sourceUrl : '',
		};

		const existing = result.get(normalizedTarget) || [];
		existing.push(entry);
		result.set(normalizedTarget, existing);
		if (!result.has(normalizedTargetNoQuery)) {
			result.set(normalizedTargetNoQuery, existing);
		}
		if (targetHostPathKey && !result.has(targetHostPathKey)) {
			result.set(targetHostPathKey, existing);
		}
	}

	for (const [target, replies] of result.entries()) {
		const seen = new Set<string>();
		const deduped = replies.filter((reply) => {
			const signature = [reply.authorName.trim().toLowerCase(), reply.contentText.trim(), reply.publishedAt.trim()].join('|');
			if (seen.has(signature)) return false;
			seen.add(signature);
			return true;
		});
		result.set(target, deduped);
	}

	return result;
};

const createOutboundWebmentionRecord = async (
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
): Promise<{ outboundId?: string; outboundUrl?: string }> => {
	const outboundMeta = findCollectionByName(collectionMetaMap, 'outbound-webmentions');
	if (!outboundMeta) throw new ContentApiError('Outbound webmentions collection is not available.', 500);
	const mentionType = input.mentionType || 'mention';
	const targetDomain = toDisplayHost(input.targetUrl);
	const targetLabel = (input.targetTitle || input.targetUrl || targetDomain).trim();
	const titleByType: Record<'mention' | 'reply' | 'like' | 'repost', string> = {
		mention: `Mentioned ${targetLabel}`,
		reply: `Replied to ${targetLabel}`,
		like: `Liked ${targetLabel}`,
		repost: `Reposted ${targetLabel}`,
	};
	const outboundSlug = `webmention-${mentionType}-${toSafeSlug(targetDomain)}-${Date.now()}`;
	const mf2PropertyClassByType: Record<'mention' | 'reply' | 'like' | 'repost', string> = {
		mention: 'u-mention-of',
		reply: 'u-in-reply-to',
		like: 'u-like-of',
		repost: 'u-repost-of',
	};
	const now = new Date().toISOString();

	const payload = await fetchApiJson<unknown>(
		'/api/content',
		{
			method: 'POST',
			body: JSON.stringify({
				collectionId: outboundMeta.id,
				title: titleByType[mentionType],
				slug: outboundSlug,
				status: 'published',
				data: {
					sourceUrl: input.sourceUrl,
					targetUrl: input.targetUrl,
					targetDomain,
					targetTitle: input.targetTitle || '',
					mentionType,
					endpointUrl: input.endpointUrl || '',
					deliveryStatus: input.deliveryStatus,
					responseStatusCode: Number.isFinite(input.responseStatusCode) ? input.responseStatusCode : undefined,
					sourceCollection: outboundMeta.name,
					sourceSlug: outboundSlug,
					attemptedAt: now,
					errorMessage: input.errorMessage || '',
					commentText: input.commentText || '',
					mf2PropertyClass: input.mf2PropertyClass || mf2PropertyClassByType[mentionType],
				},
			}),
		},
		token,
		options
	);
	const created = parseContentItemResponse(payload);
	if (!created?.slug || !created.id) return {};
	return {
		outboundId: created.id,
		outboundUrl: `/${encodeURIComponent(outboundMeta.name)}/${encodeURIComponent(created.slug)}`,
	};
};

const updateOutboundWebmentionRecord = async (
	token: string,
	outboundId: string,
	patch: Record<string, unknown>,
	options?: BackendRequestOptions
): Promise<void> => {
	const payload = await fetchApiJson<unknown>(`/api/content/${outboundId}`, { method: 'GET' }, token, options);
	const item = parseContentItemResponse(payload);
	if (!item) throw new ContentApiError('Outbound webmention not found.', 404);

	await fetchApiJson<unknown>(
		`/api/content/${outboundId}`,
		{
			method: 'PUT',
			body: JSON.stringify({
				title: item.title,
				slug: item.slug,
				status: item.status,
				data: {
					...item.data,
					...patch,
					attemptedAt: new Date().toISOString(),
				},
			}),
		},
		token,
		options
	);
};

const findCollectionByName = (metaMap: Map<string, DashboardCollectionMeta>, name: string): DashboardCollectionMeta | null => {
	return Array.from(metaMap.values()).find((item) => item.name === name) ?? null;
};

const upsertTrustedDomainRecord = async (
	token: string,
	metaMap: Map<string, DashboardCollectionMeta>,
	sourceDomain: string,
	options?: BackendRequestOptions
): Promise<void> => {
	const trustedCollection = findCollectionByName(metaMap, 'trusted-webmention-domains');
	if (!trustedCollection) return;

	const params = new URLSearchParams();
	params.set('limit', '100');
	params.set('sort', '-updatedAt');
	const listPayload = await fetchApiJson<unknown>(`/api/content?${params.toString()}`, { method: 'GET' }, token, options);
	const allItems = parseContentListResponse(listPayload).filter(
		(item) => item.collectionId === trustedCollection.id || item.collectionId === trustedCollection.name
	);
	const existing = allItems.find((item) => {
		const domain = typeof item.data.domain === 'string' ? item.data.domain.toLowerCase() : '';
		return domain === sourceDomain.toLowerCase();
	});

	const nowIso = new Date().toISOString();
	if (existing) {
		const nextData = {
			...existing.data,
			domain: sourceDomain,
			active: true,
			lastSeenAt: nowIso,
			firstApprovedAt: typeof existing.data.firstApprovedAt === 'string' ? existing.data.firstApprovedAt : nowIso,
		};
		await fetchApiJson<unknown>(
			`/api/content/${existing.id}`,
			{
				method: 'PUT',
				body: JSON.stringify({
					title: existing.title || `Trusted domain: ${sourceDomain}`,
					slug: existing.slug || `trusted-${toSafeSlug(sourceDomain)}`,
					status: existing.status,
					data: nextData,
				}),
			},
			token,
			options
		);
		return;
	}

	await fetchApiJson<unknown>(
		'/api/content',
		{
			method: 'POST',
			body: JSON.stringify({
				collectionId: trustedCollection.id,
				title: `Trusted domain: ${sourceDomain}`,
				slug: `trusted-${toSafeSlug(sourceDomain)}`,
				status: 'published',
				data: {
					domain: sourceDomain,
					active: true,
					firstApprovedAt: nowIso,
					lastSeenAt: nowIso,
					notes: 'Added from dashboard webmention moderation.',
				},
			}),
		},
		token,
		options
	);
};

const approveWebmentionById = async (
	token: string,
	collectionMetaMap: Map<string, DashboardCollectionMeta>,
	id: string,
	trustDomain: boolean,
	options?: BackendRequestOptions
): Promise<void> => {
	const webmentionsCollection = findCollectionByName(collectionMetaMap, 'webmentions');
	if (!webmentionsCollection) {
		throw new ContentApiError('Webmentions collection is not available.', 500);
	}

	const payload = await fetchApiJson<unknown>(`/api/content/${id}`, { method: 'GET' }, token, options);
	const item = parseContentItemResponse(payload);
	if (!item) {
		throw new ContentApiError('Webmention item not found.', 404);
	}

	if (!(item.collectionId === webmentionsCollection.id || item.collectionId === webmentionsCollection.name)) {
		throw new ContentApiError('Item is not in the webmentions collection.', 400);
	}

	const nextData = {
		...item.data,
		status: 'approved',
		verificationCheckedAt: new Date().toISOString(),
	};

	await fetchApiJson<unknown>(
		`/api/content/${id}`,
		{
			method: 'PUT',
			body: JSON.stringify({
				title: item.title,
				slug: item.slug,
				status: item.status,
				data: nextData,
			}),
		},
		token,
		options
	);

	if (!trustDomain) return;
	const sourceDomain = typeof item.data.sourceDomain === 'string' ? item.data.sourceDomain.trim() : '';
	if (!sourceDomain) return;
	await upsertTrustedDomainRecord(token, collectionMetaMap, sourceDomain, options);
};

const createFollowingSource = async (
	token: string,
	collectionMetaMap: Map<string, DashboardCollectionMeta>,
	input: { siteUrl: string; feedUrl?: string; title?: string },
	options?: BackendRequestOptions
): Promise<void> => {
	const followsCollection = findCollectionByName(collectionMetaMap, 'following-sources');
	if (!followsCollection) {
		throw new ContentApiError('Following sources collection is not available.', 500);
	}

	const siteUrl = normalizeUrl(input.siteUrl);
	const explicitFeedUrl = input.feedUrl ? normalizeUrl(input.feedUrl) : '';
	const discoveredFeedUrl = explicitFeedUrl || (await discoverFeedUrl(siteUrl)) || '';
	const sourceTitle = input.title?.trim() || new URL(siteUrl).hostname;

	await fetchApiJson<unknown>(
		'/api/content',
		{
			method: 'POST',
			body: JSON.stringify({
				collectionId: followsCollection.id,
				title: sourceTitle,
				slug: `follow-${toSafeSlug(sourceTitle)}-${Date.now()}`,
				status: 'published',
				data: {
					siteUrl,
					feedUrl: discoveredFeedUrl,
					active: true,
					lastCheckedAt: new Date().toISOString(),
					lastError: '',
				},
			}),
		},
		token,
		options
	);
};

const removeFollowingSource = async (
	token: string,
	collectionMetaMap: Map<string, DashboardCollectionMeta>,
	id: string,
	options?: BackendRequestOptions
): Promise<void> => {
	const followsCollection = findCollectionByName(collectionMetaMap, 'following-sources');
	if (!followsCollection) {
		throw new ContentApiError('Following sources collection is not available.', 500);
	}

	const payload = await fetchApiJson<unknown>(`/api/content/${id}`, { method: 'GET' }, token, options);
	const item = parseContentItemResponse(payload);
	if (!item) {
		throw new ContentApiError('Following source not found.', 404);
	}

	if (!(item.collectionId === followsCollection.id || item.collectionId === followsCollection.name)) {
		throw new ContentApiError('Item is not a following source.', 400);
	}

	const nextData = {
		...item.data,
		active: false,
		lastCheckedAt: new Date().toISOString(),
	};

	await fetchApiJson<unknown>(
		`/api/content/${id}`,
		{
			method: 'PUT',
			body: JSON.stringify({
				title: item.title,
				slug: item.slug,
				status: item.status,
				data: nextData,
			}),
		},
		token,
		options
	);
};

const groupDashboardItemsByCollection = (
	items: DashboardContentItem[],
	collectionTitles: Map<string, string>,
	excludedCollectionNames: Set<string> = new Set()
): Array<{
	collectionId: string;
	collectionPath: string;
	collectionTitle: string;
	items: Array<DashboardContentItem & { collectionPath: string }>;
}> => {
	const sections = new Map<
		string,
		{
			collectionId: string;
			collectionPath: string;
			collectionTitle: string;
			items: Array<DashboardContentItem & { collectionPath: string }>;
		}
	>();

	for (const item of items) {
		const collectionId = item.collectionId || 'unknown-collection';
		const collectionTitle = collectionTitles.get(collectionId) ?? collectionId;
		if (excludedCollectionNames.has(collectionTitle.toLowerCase()) || excludedCollectionNames.has(collectionId.toLowerCase())) {
			continue;
		}
		const section = sections.get(collectionId) ?? {
			collectionId,
			collectionPath: encodeURIComponent(collectionId),
			collectionTitle,
			items: [],
		};
		section.items.push({ ...item, collectionPath: section.collectionPath });
		sections.set(collectionId, section);
	}

	return Array.from(sections.values()).filter((section) => section.items.length > 0);
};

export type AuthViewData = {
	isAuthenticated: boolean;
	authUser?: AuthUser;
};

export const resolveAuthState = async (c: Context): Promise<AuthViewData> => {
	const cachedState = c.get('isAuthenticated');
	const cachedUser = c.get('authUser');
	if (cachedState && cachedUser) {
		return { isAuthenticated: true, authUser: cachedUser };
	}

	const token = getToken(c);
	if (!token) {
		c.set('isAuthenticated', false);
		return { isAuthenticated: false };
	}

	try {
		const backendOptions = resolveBackendRequestOptions(c);
		const user = await authGetCurrentUser(token, {
			apiBaseUrl: backendOptions.apiBaseUrl,
			backendService: backendOptions.backendService,
		});
		c.set('authUser', user);
		c.set('isAuthenticated', true);
		return { isAuthenticated: true, authUser: user };
	} catch (error) {
		if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
			clearTokenCookie(c);
		}
		c.set('isAuthenticated', false);
		return { isAuthenticated: false };
	}
};

export const requireAuth = async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
	const authState = await resolveAuthState(c);
	if (!authState.isAuthenticated) {
		const currentPath = c.req.path;
		return c.redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
	}
	await next();
};

export const registerAuthRoutes = (app: Hono): void => {
	app.get('/login', async (c) => {
		const authState = await resolveAuthState(c);
		if (authState.isAuthenticated) {
			const redirectTarget = getRedirectTarget(c) ?? '/dashboard';
			return c.redirect(redirectTarget);
		}

		const errorFromQuery = c.req.query('error');
		const redirectTarget = getRedirectTarget(c);
		const backendOptions = resolveBackendRequestOptions(c);
		const baseCollections = await resolveBaseCollections(backendOptions);
		return c.html(
			render(loginTemplate, {
				title: 'Login',
				authError: errorFromQuery,
				redirectTarget,
				email: '',
				collections: baseCollections,
			})
		);
	});

	app.post('/login', async (c) => {
		const redirectTarget = getRedirectTarget(c) ?? '/dashboard';
		const formData = await c.req.formData();
		const email = String(formData.get('email') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		if (!email || !password) {
			const backendOptions = resolveBackendRequestOptions(c);
			const baseCollections = await resolveBaseCollections(backendOptions);
			return c.html(
				render(loginTemplate, {
					title: 'Login',
					authError: 'Email and password are required.',
					redirectTarget,
					email,
					collections: baseCollections,
				}),
				400
			);
		}

		try {
			const backendOptions = resolveBackendRequestOptions(c);
			const { token } = await authLogin(email, password, {
				apiBaseUrl: backendOptions.apiBaseUrl,
				backendService: backendOptions.backendService,
			});
			setTokenCookie(c, token);
			return c.redirect(redirectTarget);
		} catch (error) {
			const authError = error instanceof AuthApiError ? error.message : 'Login failed';

			const backendOptions = resolveBackendRequestOptions(c);
			const baseCollections = await resolveBaseCollections(backendOptions);
			return c.html(
				render(loginTemplate, {
					title: 'Login',
					authError,
					redirectTarget,
					email,
					collections: baseCollections,
				}),
				401
			);
		}
	});

	app.get('/logout', (c) => {
		clearTokenCookie(c);
		return c.redirect('/login');
	});

	app.post('/logout', (c) => {
		clearTokenCookie(c);
		return c.redirect('/login');
	});

	registerContentAuthRoutes(app, {
		requireAuth,
		getToken,
		resolveBaseCollections,
		loadDashboardContent,
		loadCollectionTitleMap,
		loadCollectionMetaMap,
		resolvePendingWebmentions,
		groupDashboardItemsByCollection,
		systemCollectionNames: SYSTEM_COLLECTION_NAMES,
		approveWebmentionById,
		render,
		dashboardTemplate,
	});

	registerFollowAuthRoutes(app, {
		requireAuth,
		getToken,
		resolveBaseCollections,
		loadDashboardContent,
		loadCollectionMetaMap,
		resolveFollowingSources,
		createFollowingSource,
		removeFollowingSource,
		render,
		followingSourcesTemplate,
	});

	registerFeedAuthRoutes(app, {
		requireAuth,
		getToken,
		resolveBaseCollections,
		loadDashboardContent,
		loadRecentOutboundWebmentions,
		loadCollectionMetaMap,
		resolveFollowingSources,
		loadFollowingFeedItems,
		resolveOutboundWebmentions,
		resolveInboundRepliesByTarget,
		mapFollowingFeedItemsForDisplay,
		normalizeUrl,
		createOutboundWebmentionRecord,
		updateOutboundWebmentionRecord,
		sendWebmentionNotification,
		render,
		followingFeedTemplate,
	});
};
