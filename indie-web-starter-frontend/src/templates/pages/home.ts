export const homeTemplate = /* html */ `
<section class="space-y-8">
  <section class="overflow-hidden border border-gray-300 bg-gradient-to-b from-gray-100 to-gray-50">
    <div class="grid gap-6 p-6 md:grid-cols-[1.6fr_1fr] md:items-end md:p-8">
      <div>
        <p class="text-xs font-medium tracking-[0.18em] text-gray-600 uppercase">Personal site</p>
        <h1 class="mt-3 max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-gray-900 md:text-4xl">
          Notes, stories, and little updates from the week.
        </h1>
        <p class="mt-4 max-w-xl text-sm leading-relaxed text-gray-700 md:text-base">
          This is a quiet home for writing and sharing what I am learning. No loud design, no noise,
          just useful thoughts, honest reviews, and occasional field notes.
        </p>
        <div class="mt-5 flex flex-wrap gap-2 text-sm">
          <a href="/blog-posts" class="border border-gray-400 bg-white px-3 py-1.5 text-gray-900 hover:bg-gray-100">Read blog posts</a>
          <a href="/about" class="border border-transparent px-3 py-1.5 text-gray-700 underline underline-offset-3 hover:text-gray-900">About this site</a>
        </div>
      </div>

      <div class="border border-gray-300 bg-white/70 p-4 text-sm text-gray-700 backdrop-blur-sm">
        <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">What to expect</h2>
        <ul class="mt-3 space-y-2 leading-relaxed">
          <li>Short posts about projects and ideas.</li>
          <li>Longer stories when something is worth documenting.</li>
          <li>Reviews and references I keep coming back to.</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="grid gap-4 md:grid-cols-3">
    <article class="border border-gray-300 bg-white p-4">
      <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">Writing</h2>
      <p class="mt-2 text-sm leading-relaxed text-gray-700">
        Practical notes from what works, what breaks, and what changes over time.
      </p>
    </article>
    <article class="border border-gray-300 bg-white p-4">
      <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">Collecting</h2>
      <p class="mt-2 text-sm leading-relaxed text-gray-700">
        A small archive of links, media, and things worth revisiting later.
      </p>
    </article>
    <article class="border border-gray-300 bg-white p-4">
      <h2 class="text-sm font-semibold tracking-wide text-gray-900 uppercase">Iterating</h2>
      <p class="mt-2 text-sm leading-relaxed text-gray-700">
        The site evolves slowly, with small improvements instead of redesigns.
      </p>
    </article>
  </section>

  <section class="border border-gray-300 bg-white p-4 md:p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xl font-semibold text-gray-900">Recent stories</h2>
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
      <li class="border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        No stories available yet. Check back soon.
      </li>
      {{/collections.blog-posts}}
    </ul>
  </section>
</section>
`;

export const requiredData = {
	collections: [
		{
			name: 'blog-posts',
			limit: 10,
			sort: '-created_at',
		},
	],
};
