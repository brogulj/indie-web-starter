export const MovieReviewsTemplate = /* html */ `
<main class="mx-auto max-w-4xl p-4">
  <article class="h-entry space-y-5 rounded-2xl border border-gray-300 bg-white p-5">
    <header class="space-y-2">
      <p class="text-xs uppercase tracking-wide text-gray-500">Movie Review</p>
      <h1 class="p-name text-3xl font-semibold text-gray-900">{{{data.titleHtml}}}{{^data.titleHtml}}{{{titleHtml}}}{{^titleHtml}}{{data.title}}{{^data.title}}{{title}}{{/data.title}}{{/titleHtml}}{{/data.titleHtml}}</h1>
      <p class="text-sm text-gray-600"><a class="u-url hover:underline" href="/movie-reviews/{{slug}}">/movie-reviews/{{slug}}</a></p>
      <p class="h-card text-sm text-gray-600"><a class="p-name u-url hover:underline" href="{{siteAuthorUrl}}">{{siteAuthorName}}</a></p>
    </header>

    <section class="grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-3">
      <div class="sm:col-span-1 rounded-lg border border-gray-300 bg-white p-4 text-center">
        <p class="text-xs uppercase tracking-wide text-gray-500">Score</p>
        <p class="text-4xl font-bold text-gray-900">{{data.rating}}</p>
        <p class="text-sm text-gray-600">out of 10</p>
      </div>
      <div class="sm:col-span-2 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
        <p><strong>Director:</strong> {{data.director}}{{^data.director}}-{{/data.director}}</p>
        <p><strong>Release Year:</strong> {{data.releaseYear}}{{^data.releaseYear}}-{{/data.releaseYear}}</p>
        <p><strong>Runtime:</strong> {{data.runtimeMinutes}}{{#data.runtimeMinutes}} min{{/data.runtimeMinutes}}{{^data.runtimeMinutes}}-{{/data.runtimeMinutes}}</p>
        <p><strong>Genres:</strong> {{data.genres}}{{^data.genres}}-{{/data.genres}}</p>
        <p><strong>Published:</strong> {{data.publishedAt}}{{^data.publishedAt}}-{{/data.publishedAt}}</p>
        <p><strong>Status:</strong> {{data.status}}{{^data.status}}{{status}}{{/data.status}}</p>
      </div>
    </section>

    {{#data.featuredImage}}
    <figure class="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      <img src="{{data.featuredImage.url}}{{^data.featuredImage.url}}{{data.featuredImage}}{{/data.featuredImage.url}}" alt="{{data.title}}{{^data.title}}{{title}}{{/data.title}}" class="h-full w-full object-cover" loading="lazy" />
    </figure>
    {{/data.featuredImage}}

    {{#data.contentHtml}}
    <section class="e-content prose prose-sm max-w-none text-gray-900">{{{data.contentHtml}}}</section>
    {{/data.contentHtml}}
    {{^data.contentHtml}}
    {{#data.content}}
    <section class="e-content whitespace-pre-wrap break-words text-base leading-relaxed text-gray-900">{{data.content}}</section>
    {{/data.content}}
    {{/data.contentHtml}}

    <section class="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Interactions</h2>
      <p class="text-sm text-gray-700">Likes: {{webmentionCounts.likes}} · Reposts: {{webmentionCounts.reposts}} · Replies: {{webmentionCounts.replies}} · Mentions: {{webmentionCounts.mentions}}</p>
      {{#webmentions}}
      {{#isReply}}
      <article class="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <p class="font-medium text-gray-900">Reply from {{displayAuthor}}</p>
        <p class="text-xs text-gray-500">{{displayDomain}} · {{displayDate}}</p>
        {{#contentText}}<p class="mt-2 text-gray-800">{{contentText}}</p>{{/contentText}}
        <a href="{{sourceUrl}}" class="mt-2 inline-block text-gray-700 underline">Source</a>
      </article>
      {{/isReply}}
      {{#isMention}}
      <article class="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <p class="font-medium text-gray-900">Mention by {{displayAuthor}}</p>
        <p class="text-xs text-gray-500">{{displayDomain}} · {{displayDate}}</p>
        {{#contentText}}<p class="mt-2 text-gray-800">{{contentText}}</p>{{/contentText}}
        <a href="{{sourceUrl}}" class="mt-2 inline-block text-gray-700 underline">Source</a>
      </article>
      {{/isMention}}
      {{#isRepost}}
      <article class="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <p class="font-medium text-gray-900">Repost by {{displayAuthor}}</p>
        <p class="text-xs text-gray-500">{{displayDomain}} · {{displayDate}}</p>
        <a href="{{sourceUrl}}" class="mt-2 inline-block text-gray-700 underline">Source</a>
      </article>
      {{/isRepost}}
      {{/webmentions}}
      {{^webmentions}}
      <p class="text-sm text-gray-500">No public interactions yet.</p>
      {{/webmentions}}
    </section>
  </article>
</main>
`;
