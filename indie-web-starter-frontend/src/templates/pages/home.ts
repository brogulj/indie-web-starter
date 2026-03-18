export const homeTemplate = /* html */ `
<main class="mx-auto grid w-full max-w-6xl gap-4">
  <section class="border-4 border-stone-900 bg-amber-50 p-4 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <p class="inline-block border-2 border-stone-900 bg-rose-200 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.16em]">
      Welcome To The Web Corner
    </p>
    <h1 class="mt-3 font-['Courier_New',ui-monospace,monospace] text-4xl font-black uppercase leading-tight text-stone-900 sm:text-6xl">
      {{siteName}}
    </h1>
    <p class="mt-3 max-w-3xl border-l-4 border-teal-700 pl-4 font-serif text-lg italic text-stone-700">
      {{tagline}}
    </p>

    <div class="mt-4 grid gap-2 sm:grid-cols-3">
      {{#funFacts}}
      <p class="border-2 border-stone-900 bg-white px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] text-stone-800">
        {{.}}
      </p>
      {{/funFacts}}
    </div>
  </section>

  <section class="grid gap-4 md:grid-cols-3">
    <article class="border-4 border-stone-900 bg-white p-4 shadow-[6px_6px_0_0_#1c1917] md:col-span-2">
      <h2 class="font-['Courier_New',ui-monospace,monospace] text-2xl font-black uppercase text-stone-900">
        Fresh Posts
      </h2>
      <p class="mt-1 font-serif text-stone-700">Handmade thoughts from the indie web bench.</p>

      <ul class="mt-4 space-y-3">
        {{#collections.blog-posts}}
        <li class="border-2 border-stone-900 bg-amber-100 p-3 transition hover:-translate-y-0.5">
          <a href="{{url}}" class="block">
            <p class="font-['Courier_New',ui-monospace,monospace] text-lg font-bold uppercase text-stone-900">{{title}}</p>
            <p class="font-mono text-xs uppercase tracking-[0.13em] text-stone-700">{{date}}</p>
          </a>
        </li>
        {{/collections.blog-posts}}
      </ul>
    </article>

    <aside class="border-4 border-stone-900 bg-cyan-100 p-4 shadow-[6px_6px_0_0_#1c1917]">
      <h2 class="font-['Courier_New',ui-monospace,monospace] text-xl font-black uppercase text-stone-900">
        Now Spinning
      </h2>
      <ul class="mt-3 space-y-2">
        {{#playlist}}
        <li class="border border-stone-900 bg-white px-2 py-1.5 font-mono text-xs uppercase tracking-[0.11em] text-stone-800">
          {{.}}
        </li>
        {{/playlist}}
      </ul>
      <a href="/music/hello-world" class="mt-4 inline-block border-2 border-stone-900 bg-amber-200 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] hover:bg-amber-300">
        Visit Music Page
      </a>
    </aside>
  </section>

  <section class="border-4 border-stone-900 bg-lime-100 p-4 shadow-[8px_8px_0_0_#1c1917] sm:p-5">
    <p class="font-mono text-xs uppercase tracking-[0.16em] text-stone-800">Mini Site Map</p>
    <div class="mt-3 flex flex-wrap gap-2">
      {{#quickLinks}}
      <a href="{{url}}" class="inline-block border-2 border-stone-900 bg-white px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.12em] text-stone-900 hover:-translate-y-0.5">
        {{label}}
      </a>
      {{/quickLinks}}
    </div>
  </section>
</main>
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
