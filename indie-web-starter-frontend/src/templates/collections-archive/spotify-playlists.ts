export const SpotifyPlaylistsArchiveTemplate = /* html */ `
<main class="mx-auto max-w-3xl p-4">
  <section class="space-y-2 rounded border border-gray-300 bg-white p-4">
    <p class="text-xs uppercase tracking-wide text-gray-600">
      spotify-playlists archive
    </p>
    <h1 class="text-2xl font-semibold text-gray-900">
      {{collection}}
    </h1>
    <p class="text-sm text-gray-600">
      {{totalItems}} total item(s) · page {{currentPage}} of {{totalPages}}
    </p>
  </section>

  <section class="mt-4 space-y-3">
    {{#items}}
    <article class="rounded border border-gray-200 bg-gray-50 p-3">
      <a href="/{{collection}}/{{slug}}" class="text-gray-900 hover:underline">
        <h2 class="text-lg font-medium">{{title}}</h2>
      </a>
      <p class="mt-1 text-sm text-gray-600">{{status}} · {{updatedAt}}</p>
    </article>
    {{/items}}
  </section>

  <nav class="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
    <div>
      {{#hasPreviousPage}}
      <a href="{{previousPageUrl}}" class="rounded border border-gray-300 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50">Previous</a>
      {{/hasPreviousPage}}
    </div>
    <p class="text-gray-600">Page {{currentPage}} / {{totalPages}}</p>
    <div>
      {{#hasNextPage}}
      <a href="{{nextPageUrl}}" class="rounded border border-gray-300 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50">Next</a>
      {{/hasNextPage}}
    </div>
  </nav>
</main>
`;
