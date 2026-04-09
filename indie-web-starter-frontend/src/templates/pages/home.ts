export const homeTemplate = /* html */ `
<section class="space-y-8">
  <section class="overflow-hidden border border-gray-300 bg-gradient-to-b from-gray-100 to-gray-50">
    <div class="grid gap-6 p-6 md:grid-cols-[1.6fr_1fr] md:items-end md:p-8">
      <div>
        <p class="text-xs font-medium tracking-[0.18em] text-gray-600 uppercase">Personal site</p>
        <h1 class="mt-3 max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-gray-900 md:text-4xl">
          Writing, reviews, outfits, playlists, and updates.
        </h1>
        <p class="mt-4 max-w-xl text-sm leading-relaxed text-gray-700 md:text-base">
          A simple place to publish blog posts, short updates, movie and music reviews,
          event notes, and related collections.
        </p>
        <div class="mt-5 flex flex-wrap gap-2 text-sm">
          <a href="/blog-posts" class="border border-gray-400 bg-white px-3 py-1.5 text-gray-900 hover:bg-gray-100">Read blog posts</a>
          <a href="/posts" class="border border-gray-400 bg-white px-3 py-1.5 text-gray-900 hover:bg-gray-100">Browse posts</a>
          <a href="/about" class="border border-transparent px-3 py-1.5 text-gray-700 underline underline-offset-3 hover:text-gray-900">About this site</a>
        </div>
      </div>

      <div class="border border-gray-300 bg-white/70 p-4 text-sm text-gray-700 backdrop-blur-sm">
        <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">What to expect</h2>
        <ul class="mt-3 space-y-2 leading-relaxed">
          <li>Short posts and media updates.</li>
          <li>Longer articles and notes.</li>
          <li>Movie, music, and event reviews.</li>
          <li>Outfits and Spotify playlists.</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="grid gap-4 lg:grid-cols-2">
    <section class="border border-gray-300 bg-white p-4 md:p-5">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-gray-900">Recent Stories</h2>
        <a href="/blog-posts" class="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900">View all</a>
      </div>
      <ul class="mt-4 space-y-3">
        {{#collections.blog-posts}}
        <li class="border border-gray-200 bg-gray-50 p-3">
          <a href="/blog-posts/{{slug}}" class="font-medium text-gray-900 underline underline-offset-2">{{title}}</a>
          <p class="mt-1 text-sm leading-relaxed text-gray-700">{{data.excerpt}}</p>
        </li>
        {{/collections.blog-posts}}
        {{^collections.blog-posts}}
        <li class="border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">No stories available yet.</li>
        {{/collections.blog-posts}}
      </ul>
    </section>

    <section class="border border-gray-300 bg-white p-4 md:p-5">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-gray-900">Recent Posts</h2>
        <a href="/posts" class="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900">View all</a>
      </div>
      <ul class="mt-4 space-y-3">
        {{#collections.posts}}
        <li class="border border-gray-200 bg-gray-50 p-3">
          <a href="/posts/{{slug}}" class="font-medium text-gray-900 underline underline-offset-2">{{title}}</a>
          <p class="mt-1 text-sm leading-relaxed text-gray-700">{{data.caption}}</p>
        </li>
        {{/collections.posts}}
        {{^collections.posts}}
        <li class="border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">No posts available yet.</li>
        {{/collections.posts}}
      </ul>
    </section>
  </section>

  <section class="grid gap-4 lg:grid-cols-3">
    <section class="border border-gray-300 bg-white p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">Movie Reviews</h2>
        <a href="/movie-reviews" class="text-xs text-gray-700 underline underline-offset-2">All</a>
      </div>
      <ul class="mt-3 space-y-2 text-sm">
        {{#collections.movie-reviews}}
        <li class="border border-gray-200 bg-gray-50 p-2">
          <a href="/movie-reviews/{{slug}}" class="font-medium text-gray-900 underline underline-offset-2">{{title}}</a>
          <p class="mt-1 text-gray-700">Score: {{data.rating}} / 10</p>
        </li>
        {{/collections.movie-reviews}}
        {{^collections.movie-reviews}}
        <li class="border border-gray-200 bg-gray-50 p-2 text-gray-700">No movie reviews yet.</li>
        {{/collections.movie-reviews}}
      </ul>
    </section>

    <section class="border border-gray-300 bg-white p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">Music Reviews</h2>
        <a href="/music-reviews" class="text-xs text-gray-700 underline underline-offset-2">All</a>
      </div>
      <ul class="mt-3 space-y-2 text-sm">
        {{#collections.music-reviews}}
        <li class="border border-gray-200 bg-gray-50 p-2">
          <a href="/music-reviews/{{slug}}" class="font-medium text-gray-900 underline underline-offset-2">{{title}}</a>
          <p class="mt-1 text-gray-700">{{data.artistName}} - {{data.releaseTitle}}</p>
        </li>
        {{/collections.music-reviews}}
        {{^collections.music-reviews}}
        <li class="border border-gray-200 bg-gray-50 p-2 text-gray-700">No music reviews yet.</li>
        {{/collections.music-reviews}}
      </ul>
    </section>

    <section class="border border-gray-300 bg-white p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">Events</h2>
        <a href="/events" class="text-xs text-gray-700 underline underline-offset-2">All</a>
      </div>
      <ul class="mt-3 space-y-2 text-sm">
        {{#collections.events}}
        <li class="border border-gray-200 bg-gray-50 p-2">
          <a href="/events/{{slug}}" class="font-medium text-gray-900 underline underline-offset-2">{{title}}</a>
          <p class="mt-1 text-gray-700">{{data.location}}{{^data.location}}Location pending{{/data.location}}</p>
        </li>
        {{/collections.events}}
        {{^collections.events}}
        <li class="border border-gray-200 bg-gray-50 p-2 text-gray-700">No events yet.</li>
        {{/collections.events}}
      </ul>
    </section>
  </section>

  <section class="grid gap-4 lg:grid-cols-2">
    <section class="border border-gray-300 bg-white p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">Outfits</h2>
        <a href="/outfits" class="text-xs text-gray-700 underline underline-offset-2">All</a>
      </div>
      <ul class="mt-3 space-y-2 text-sm">
        {{#collections.outfits}}
        <li class="border border-gray-200 bg-gray-50 p-2">
          <a href="/outfits/{{slug}}" class="font-medium text-gray-900 underline underline-offset-2">{{title}}</a>
        </li>
        {{/collections.outfits}}
        {{^collections.outfits}}
        <li class="border border-gray-200 bg-gray-50 p-2 text-gray-700">No outfits published yet.</li>
        {{/collections.outfits}}
      </ul>
    </section>

    <section class="border border-gray-300 bg-white p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">Spotify Playlists</h2>
        <a href="/spotify-playlists" class="text-xs text-gray-700 underline underline-offset-2">All</a>
      </div>
      <ul class="mt-3 space-y-2 text-sm">
        {{#collections.spotify-playlists}}
        <li class="border border-gray-200 bg-gray-50 p-2">
          <a href="/spotify-playlists/{{slug}}" class="font-medium text-gray-900 underline underline-offset-2">{{title}}</a>
          <p class="mt-1 break-all text-gray-700">{{data.spotifyPlaylistId}}</p>
        </li>
        {{/collections.spotify-playlists}}
        {{^collections.spotify-playlists}}
        <li class="border border-gray-200 bg-gray-50 p-2 text-gray-700">No playlists yet.</li>
        {{/collections.spotify-playlists}}
      </ul>
    </section>
  </section>
</section>
`;

export const requiredData = {
	collections: [
		{
			name: 'blog-posts',
			limit: 5,
			sort: '-created_at',
		},
		{
			name: 'posts',
			limit: 5,
			sort: '-created_at',
		},
		{
			name: 'movie-reviews',
			limit: 4,
			sort: '-created_at',
		},
		{
			name: 'music-reviews',
			limit: 4,
			sort: '-created_at',
		},
		{
			name: 'events',
			limit: 4,
			sort: '-created_at',
		},
		{
			name: 'outfits',
			limit: 4,
			sort: '-created_at',
		},
		{
			name: 'spotify-playlists',
			limit: 4,
			sort: '-created_at',
		},
	],
};
