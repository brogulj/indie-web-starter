export const dashboardLocalNavTemplate = /* html */ `
<nav class="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2" aria-label="Dashboard">
  <a href="/dashboard" class="rounded-md px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 hover:text-black {{#navOverviewActive}}bg-gray-900 text-white hover:bg-gray-900 hover:text-white{{/navOverviewActive}}">Overview</a>
  <a href="/dashboard#collections" class="rounded-md px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 hover:text-black {{#navCollectionsActive}}bg-gray-900 text-white hover:bg-gray-900 hover:text-white{{/navCollectionsActive}}">Collections</a>
  <a href="/dashboard/following" class="rounded-md px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 hover:text-black {{#navFollowingActive}}bg-gray-900 text-white hover:bg-gray-900 hover:text-white{{/navFollowingActive}}">Following</a>
  <a href="/dashboard/following/feed" class="rounded-md px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 hover:text-black {{#navFeedActive}}bg-gray-900 text-white hover:bg-gray-900 hover:text-white{{/navFeedActive}}">Feed</a>
</nav>
`;

export const dashboardPageHeaderTemplate = /* html */ `
<header class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
  <div>
    <h1 class="text-2xl font-semibold">{{pageTitle}}</h1>
    <p class="mt-1 text-sm text-gray-700">{{pageDescription}}</p>
  </div>
  {{#hasPrimaryAction}}
  <a href="{{primaryActionHref}}" class="inline-flex items-center rounded-md border border-gray-900 bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-black">{{primaryActionLabel}}</a>
  {{/hasPrimaryAction}}
</header>
`;

export const dashboardFlashTemplate = /* html */ `
{{#flashSuccess}}
<p class="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">{{flashSuccess}}</p>
{{/flashSuccess}}
{{#flashError}}
<p class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{{flashError}}</p>
{{/flashError}}
`;
