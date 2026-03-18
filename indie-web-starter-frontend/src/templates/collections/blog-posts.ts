export const blogPostsTemplate = /* html */ `
<main class="relative mx-auto w-full max-w-5xl px-1 py-2 sm:px-3 sm:py-4">
  <div class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(250,204,21,0.2),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(251,113,133,0.12),transparent_40%),radial-gradient(circle_at_60%_80%,rgba(45,212,191,0.14),transparent_35%)]"></div>

  <article class="border-4 border-stone-900 bg-amber-50 p-3 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <header class="border-b-4 border-stone-900 pb-5">
      <p class="inline-block border-2 border-stone-900 bg-amber-200 px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.2em] text-stone-800">
        {{data.status}}{{^data.status}}{{status}}{{/data.status}}
      </p>
      <h1 class="mt-3 text-balance font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase leading-[0.95] tracking-tight text-stone-900 sm:text-5xl">
        {{data.title}}{{^data.title}}{{title}}{{/data.title}}
      </h1>
      <p class="mt-4 max-w-3xl border-l-4 border-rose-700 pl-4 font-serif text-base italic leading-relaxed text-stone-700 sm:text-lg">
        {{data.excerpt}}{{^data.excerpt}}-{{/data.excerpt}}
      </p>
      <p class="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-stone-700">
        slug /{{data.slug}}{{^data.slug}}{{slug}}{{/data.slug}}
      </p>
    </header>

    {{#data.featuredImage}}
    <figure class="mt-5 border-2 border-stone-900 bg-stone-100 p-2">
      <img
        src="{{data.featuredImage}}"
        alt="{{data.title}}{{^data.title}}{{title}}{{/data.title}}"
        class="max-h-[65vh] w-full border border-stone-900 object-cover"
        loading="lazy"
      />
    </figure>
    {{/data.featuredImage}}

    <section class="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2" aria-label="Post metadata">
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Author:</b> {{data.author}}{{^data.author}}-{{/data.author}}</p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Status:</b> {{data.status}}{{^data.status}}{{status}}{{/data.status}}</p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Published:</b> <time id="published-at">-</time></p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Created:</b> <time id="created-at">-</time></p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Updated:</b> <time id="updated-at">-</time></p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Slug:</b> {{data.slug}}{{^data.slug}}{{slug}}{{/data.slug}}</p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Featured Image:</b> {{data.featuredImage}}{{^data.featuredImage}}-{{/data.featuredImage}}</p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Collection:</b> {{collectionId}}{{^collectionId}}-{{/collectionId}}</p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono sm:col-span-2"><b class="font-black uppercase">ID:</b> {{id}}{{^id}}-{{/id}}</p>
    </section>

    <p class="mt-5 border-y-2 border-stone-900 py-2 font-mono text-sm uppercase tracking-[0.15em] text-stone-800">
      <b class="font-black">Tags:</b> <span id="post-tags" data-tags="{{data.tags}}">-</span>
    </p>

    <section
      class="blog-content mt-6 border-2 border-stone-900 bg-white p-4 font-serif text-[1.06rem] leading-8 text-stone-900 sm:p-6 [&_a]:font-semibold [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-2 [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-rose-700 [&_blockquote]:bg-rose-50 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:italic [&_code]:rounded-none [&_code]:border [&_code]:border-stone-900 [&_code]:bg-amber-100 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mt-8 [&_h1]:font-['Courier_New',ui-monospace,monospace] [&_h1]:text-3xl [&_h1]:font-black [&_h1]:uppercase [&_h2]:mt-8 [&_h2]:font-['Courier_New',ui-monospace,monospace] [&_h2]:text-2xl [&_h2]:font-black [&_h2]:uppercase [&_h3]:mt-6 [&_h3]:font-['Courier_New',ui-monospace,monospace] [&_h3]:text-xl [&_h3]:font-bold [&_h3]:uppercase [&_img]:my-6 [&_img]:w-full [&_img]:border-2 [&_img]:border-stone-900 [&_img]:p-1 [&_li]:my-2 [&_ol]:my-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-4 [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:border-2 [&_pre]:border-stone-900 [&_pre]:bg-stone-900 [&_pre]:p-4 [&_pre]:text-amber-100 [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-4 [&_ul]:ml-6 [&_ul]:list-disc"
      id="blog-content"
    >
      {{{data.contentHtml}}}
      {{^data.contentHtml}}<p>-</p>{{/data.contentHtml}}
    </section>
  </article>
  <hr class="my-5 border-stone-900" />
  <h2 class="text-2xl font-bold uppercase">Related Blog Posts</h2>
  <section class="mt-5 grid gap-4 md:grid-cols-2">
  {{#collections.blog-posts}}
  <a href="/blog-posts/{{slug}}">
    <article class="border-4 border-stone-900 bg-white p-4 shadow-[6px_6px_0_0_#1c1917]">
      <p class="inline-block border border-stone-900 bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.13em]">
        {{title}}
      </p>
    </article>
    </a>
    {{/collections.blog-posts}}
    </section>
</main>

<script>
  const formatDate = (rawValue) => {
    if (!rawValue) return '-';
    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  const setDateText = (id, rawValue) => {
    const element = document.getElementById(id);
    if (element) element.textContent = formatDate(rawValue);
  };

  setDateText('published-at', '{{data.publishedAt}}');
  setDateText('created-at', '{{createdAt}}');
  setDateText('updated-at', '{{updatedAt}}');

  const tagsElement = document.getElementById('post-tags');
  if (tagsElement) {
    const tags = (tagsElement.dataset.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    tagsElement.textContent = tags.length ? tags.join(' | ') : '-';
  }
</script>
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
