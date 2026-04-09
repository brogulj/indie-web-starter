export const MovieReviewsTemplate = /* html */ `
<main class="mx-auto max-w-6xl p-2 md:p-4">
  <article class="h-entry overflow-hidden rounded-3xl border border-gray-300 bg-white">
    <header class="border-b border-gray-200 bg-gradient-to-r from-amber-50 via-white to-gray-100 p-5 md:p-7">
      <p class="text-xs uppercase tracking-[0.2em] text-amber-700">Movie Review</p>
      <h1 class="p-name mt-2 text-3xl font-semibold leading-tight text-gray-900 md:text-4xl">{{{data.titleHtml}}}{{^data.titleHtml}}{{{titleHtml}}}{{^titleHtml}}{{data.title}}{{^data.title}}{{title}}{{/data.title}}{{/titleHtml}}{{/data.titleHtml}}</h1>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <a class="u-url rounded-full border border-amber-200 bg-amber-50 px-3 py-1 hover:bg-amber-100" href="/movie-reviews/{{slug}}">/movie-reviews/{{slug}}</a>
        <p class="h-card"><a class="p-name u-url underline-offset-2 hover:underline" href="{{siteAuthorUrl}}">{{siteAuthorName}}</a></p>
      </div>
    </header>

    <div class="grid gap-6 p-5 md:grid-cols-3 md:p-7">
      <section class="space-y-4 md:col-span-1">
        <div class="rounded-2xl border border-gray-300 bg-gray-900 p-4 text-center text-white">
          <p class="text-xs uppercase tracking-[0.14em] text-gray-300">Score</p>
          <p class="text-5xl font-bold leading-none">{{data.rating}}</p>
          <p class="mt-1 text-sm text-gray-300">out of 10</p>
        </div>

        {{#data.featuredImage}}
        <figure class="overflow-hidden rounded-2xl border border-gray-300 bg-gray-100">
          <img src="{{data.featuredImage.url}}{{^data.featuredImage.url}}{{data.featuredImage}}{{/data.featuredImage.url}}" alt="{{data.title}}{{^data.title}}{{title}}{{/data.title}}" class="h-full w-full object-cover" loading="lazy" />
        </figure>
        {{/data.featuredImage}}

        <div class="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p><strong>Published:</strong> {{publishedAt}}{{^publishedAt}}-{{/publishedAt}}</p>
          <p class="mt-1"><strong>Status:</strong> {{status}}</p>
        </div>
      </section>

      <section class="space-y-5 md:col-span-2">
        <div class="grid gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 sm:grid-cols-2">
          <p><strong>Director:</strong> {{data.director}}{{^data.director}}-{{/data.director}}</p>
          <p><strong>Release Year:</strong> {{data.releaseYear}}{{^data.releaseYear}}-{{/data.releaseYear}}</p>
          <p><strong>Runtime:</strong> {{data.runtimeMinutes}}{{#data.runtimeMinutes}} min{{/data.runtimeMinutes}}{{^data.runtimeMinutes}}-{{/data.runtimeMinutes}}</p>
          <p><strong>Genres:</strong> {{data.genres}}{{^data.genres}}-{{/data.genres}}</p>
        </div>

        {{#data.contentHtml}}
        <section class="e-content prose prose-sm max-w-none rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 md:p-5">{{{data.contentHtml}}}</section>
        {{/data.contentHtml}}
        {{^data.contentHtml}}
        {{#data.content}}
        <section class="e-content whitespace-pre-wrap break-words rounded-2xl border border-gray-200 bg-white p-4 text-base leading-relaxed text-gray-900 md:p-5">{{data.content}}</section>
        {{/data.content}}
        {{/data.contentHtml}}

        <section class="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
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
      </section>
    </div>
  </article>
</main>
`;
