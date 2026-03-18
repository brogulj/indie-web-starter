export const blogPostsArchiveTemplate = /* html */ `
<main class="mx-auto w-full max-w-6xl px-2 py-3 sm:px-4 sm:py-6">
  <section class="border-4 border-stone-900 bg-amber-50 p-4 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <p class="inline-block border-2 border-stone-900 bg-rose-200 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.16em]">
      Blog Archive
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-4xl font-black uppercase leading-tight text-stone-900 sm:text-6xl">
      Latest Dispatches
    </h1>
    <p class="mt-3 max-w-3xl border-l-4 border-rose-700 pl-4 font-serif text-lg italic text-stone-700">
      Notes from the indie web desk, sorted by recency.
    </p>
  </section>

  <section class="mt-5 grid gap-4 md:grid-cols-2">
    {{#items}}
    <article class="border-4 border-stone-900 bg-white p-4 shadow-[6px_6px_0_0_#1c1917]">
      <p class="inline-block border border-stone-900 bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.13em]">
        {{status}}
      </p>
      <a href="/blog-posts/{{slug}}" class="mt-2 block">
        <h2 class="font-['Courier_New',ui-monospace,monospace] text-2xl font-black uppercase leading-tight text-stone-900">
          {{title}}
        </h2>
      </a>
      <p class="mt-2 font-mono text-xs uppercase tracking-[0.13em] text-stone-700">
        Updated {{updatedAt}}
      </p>
      <p class="mt-3 line-clamp-3 font-serif text-stone-700">{{excerpt}}</p>
    </article>
    {{/items}}

    {{^items}}
    <article class="border-2 border-stone-900 bg-white p-4 md:col-span-2">
      <p class="font-mono text-sm uppercase tracking-[0.12em] text-stone-700">No posts available yet.</p>
    </article>
    {{/items}}
  </section>
  {{#collections.blog-posts}}
  <section class="mt-5 grid gap-4 md:grid-cols-2">
    {{#items}}
    <article class="border-4 border-stone-900 bg-white p-4 shadow-[6px_6px_0_0_#1c1917]">
      <p class="inline-block border border-stone-900 bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.13em]">
        {{status}}
      </p>
    </article>
  </section>
  {{/collections.blog-posts}}
</main>
`;
