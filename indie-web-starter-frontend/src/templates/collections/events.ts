export const EventsTemplate = /* html */ `
<main class="mx-auto max-w-6xl p-2 md:p-4">
  <article class="h-entry rounded-3xl border border-gray-300 bg-white p-4 md:p-6">
    <header class="mb-6 space-y-3 border-b border-gray-200 pb-6">
      <p class="text-xs uppercase tracking-[0.18em] text-gray-500">Event</p>
      <h1 class="p-name text-3xl font-semibold leading-tight text-gray-900 md:text-4xl">{{{data.titleHtml}}}{{^data.titleHtml}}{{{titleHtml}}}{{^titleHtml}}{{data.title}}{{^data.title}}{{title}}{{/data.title}}{{/titleHtml}}{{/data.titleHtml}}</h1>
      <div class="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <a class="u-url rounded-full border border-gray-300 bg-gray-50 px-3 py-1 hover:bg-gray-100" href="/events/{{slug}}">/events/{{slug}}</a>
        <p class="h-card"><a class="p-name u-url underline-offset-2 hover:underline" href="{{siteAuthorUrl}}">{{siteAuthorName}}</a></p>
      </div>
    </header>

    <div class="grid gap-6 {{#data.outfitData}}lg:grid-cols-3{{/data.outfitData}}{{^data.outfitData}}lg:grid-cols-1{{/data.outfitData}}">
      <div class="space-y-6 {{#data.outfitData}}lg:col-span-2{{/data.outfitData}}">
        <section class="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 sm:grid-cols-3">
          <p><strong>Date:</strong> {{data.eventDate}}{{^data.eventDate}}-{{/data.eventDate}}</p>
          <p><strong>Location:</strong> {{data.location}}{{^data.location}}-{{/data.location}}</p>
          <p><strong>Rating:</strong> {{data.rating}} / 10</p>
        </section>

        {{#data.featuredImage}}
        <figure class="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
          <img src="{{data.featuredImage.url}}{{^data.featuredImage.url}}{{data.featuredImage}}{{/data.featuredImage.url}}" alt="{{data.title}}{{^data.title}}{{title}}{{/data.title}}" class="h-full w-full object-cover" loading="lazy" />
        </figure>
        {{/data.featuredImage}}

        {{#data.galleryImages}}
        <section class="space-y-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Gallery</h2>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {{#.}}
            <figure class="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
              <img src="{{url}}{{^url}}{{.}}{{/url}}" alt="Event gallery image" class="h-full w-full object-cover" loading="lazy" />
            </figure>
            {{/.}}
          </div>
        </section>
        {{/data.galleryImages}}

        {{#data.contentHtml}}
        <section class="e-content prose prose-sm max-w-none rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 md:p-5">{{{data.contentHtml}}}</section>
        {{/data.contentHtml}}
        {{^data.contentHtml}}
        <section class="e-content whitespace-pre-wrap break-words rounded-2xl border border-gray-200 bg-white p-4 text-base leading-relaxed text-gray-900 md:p-5">{{data.content}}</section>
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
      </div>

      {{#data.outfitData}}
      <aside class="space-y-4 lg:col-span-1">
        <section class="rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:sticky lg:top-24">
          <p class="mb-1 text-xs uppercase tracking-[0.16em] text-gray-500">Linked Outfit</p>
          <h2 class="text-xl font-semibold text-gray-900">
            <a href="/outfits/{{slug}}" class="underline-offset-2 hover:underline">{{title}}{{^title}}{{slug}}{{/title}}</a>
          </h2>
          {{#data.mainImage}}
          <figure class="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <img src="{{url}}{{^url}}{{.}}{{/url}}" alt="Outfit image" class="h-56 w-full object-cover" loading="lazy" />
          </figure>
          {{/data.mainImage}}

          {{#data.pieces}}
          <div class="mt-4 border-t border-gray-200 pt-3">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Pieces</p>
            <ul class="space-y-2">
              {{#.}}
              <li class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-700">
                <div class="overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                  {{#image}}<img src="{{url}}{{^url}}{{.}}{{/url}}" alt="{{name}}{{^name}}Outfit piece{{/name}}" class="h-32 w-full object-cover" loading="lazy" />{{/image}}
                  {{^image}}<div class="flex h-20 items-center justify-center text-[11px] text-gray-500">No image</div>{{/image}}
                </div>
                <span class="font-medium text-gray-900">{{name}}{{^name}}Piece{{/name}}</span>
              </li>
              {{/.}}
            </ul>
          </div>
          {{/data.pieces}}
        </section>
      </aside>
      {{/data.outfitData}}
    </div>
  </article>
</main>
`;
