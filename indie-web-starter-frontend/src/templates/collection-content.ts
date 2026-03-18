export const collectionContentTemplate = /* html */ `
<main class="relative mx-auto w-full max-w-5xl px-1 py-2 sm:px-3 sm:py-4">
  <div class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(250,204,21,0.2),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(251,113,133,0.12),transparent_40%),radial-gradient(circle_at_60%_80%,rgba(45,212,191,0.14),transparent_35%)]"></div>

  <article class="border-4 border-stone-900 bg-amber-50 p-3 shadow-[8px_8px_0_0_#1c1917] sm:p-6">
    <header class="border-b-4 border-stone-900 pb-5">
      <p class="inline-block border-2 border-stone-900 bg-amber-200 px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.2em] text-stone-800">
        {{collection}}
      </p>
      <h1 class="mt-3 text-balance font-['Courier_New',ui-monospace,monospace] text-3xl font-black uppercase leading-[0.95] tracking-tight text-stone-900 sm:text-5xl">
        {{data.title}}{{^data.title}}{{title}}{{/data.title}}
      </h1>
      <p class="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-stone-700">
        slug /{{slug}}
      </p>
    </header>

    <section class="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2" aria-label="Entry metadata">
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Collection:</b> {{collection}}</p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Status:</b> {{status}}</p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Created:</b> <time id="created-at">-</time></p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono"><b class="font-black uppercase">Updated:</b> <time id="updated-at">-</time></p>
      <p class="border-2 border-stone-900 bg-amber-100 px-3 py-2 font-mono sm:col-span-2"><b class="font-black uppercase">ID:</b> {{id}}</p>
    </section>

    <section class="mt-6 grid gap-4">
      {{#fields}}
      <article class="border-2 border-stone-900 bg-white p-4">
        <p class="mb-3 border-b-2 border-stone-900 pb-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-stone-700">
          {{label}}
        </p>
        {{#isRichText}}
        <div class="max-w-none font-serif text-[1.05rem] leading-8 text-stone-900 [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-2 [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-rose-700 [&_blockquote]:bg-rose-50 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_code]:border [&_code]:border-stone-900 [&_code]:bg-amber-100 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mt-6 [&_h1]:font-['Courier_New',ui-monospace,monospace] [&_h1]:text-3xl [&_h1]:font-black [&_h2]:mt-6 [&_h2]:font-['Courier_New',ui-monospace,monospace] [&_h2]:text-2xl [&_h2]:font-black [&_h3]:mt-4 [&_h3]:font-['Courier_New',ui-monospace,monospace] [&_h3]:text-xl [&_h3]:font-bold [&_img]:my-4 [&_img]:border-2 [&_img]:border-stone-900 [&_img]:p-1 [&_li]:my-1.5 [&_ol]:my-3 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:border-2 [&_pre]:border-stone-900 [&_pre]:bg-stone-900 [&_pre]:p-3 [&_pre]:text-amber-100 [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-3 [&_ul]:ml-6 [&_ul]:list-disc">
          {{{htmlValue}}}
        </div>
        {{/isRichText}}
        {{^isRichText}}
        <pre class="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm text-stone-800">{{textValue}}</pre>
        {{/isRichText}}
      </article>
      {{/fields}}
    </section>
  </article>
</main>
<style>
  .blog-content {
    font-size: 1.06rem;
    line-height: 1.5;
    font-family: 'serif';
    color: #1c1917;
    background-color: #fafaf9;
    padding: 1rem;
  }
</style>

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

  setDateText('created-at', '{{createdAt}}');
  setDateText('updated-at', '{{updatedAt}}');
</script>
`;
