export const base = (content: string) => /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <link rel="stylesheet" href="/output.css">
</head>
<body class="bg-amber-100 text-stone-900">
  <div class="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_12%,rgba(251,191,36,0.24),transparent_32%),radial-gradient(circle_at_84%_16%,rgba(251,113,133,0.14),transparent_36%),radial-gradient(circle_at_62%_84%,rgba(20,184,166,0.12),transparent_30%)]"></div>
  <header class="mx-auto mt-3 w-full max-w-6xl px-4 sm:px-6">
    <nav class="border-4 border-stone-900 bg-amber-50 px-3 py-3 shadow-[6px_6px_0_0_#1c1917] sm:px-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <a href="/" class="inline-block border-2 border-stone-900 bg-amber-200 px-3 py-1.5 font-['Courier_New',ui-monospace,monospace] text-sm font-black uppercase tracking-[0.15em] text-stone-900">
          Indie Web Starter
        </a>
        <ul class="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] sm:text-sm">
          <li><a href="/" class="inline-block border-2 border-stone-900 bg-white px-3 py-1 transition hover:-translate-y-0.5 hover:bg-yellow-100">Home</a></li>
          <li><a href="/blog-posts/hello-world" class="inline-block border-2 border-stone-900 bg-white px-3 py-1 transition hover:-translate-y-0.5 hover:bg-yellow-100">Blog</a></li>
          <li><a href="/music/hello-world" class="inline-block border-2 border-stone-900 bg-white px-3 py-1 transition hover:-translate-y-0.5 hover:bg-yellow-100">Music</a></li>
        </ul>
      </div>
      <p class="mt-3 border-t-2 border-stone-900 pt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-stone-700 sm:text-xs">
        Analog web vibes, digital ink.
      </p>
    </nav>
  </header>
  <div class="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
    {{#routeWarning}}
    <section class="mb-4 border-4 border-stone-900 bg-yellow-200 p-3 shadow-[4px_4px_0_0_#1c1917]">
      <p class="font-mono text-xs font-bold uppercase tracking-[0.12em] text-stone-900">{{routeWarning}}</p>
    </section>
    {{/routeWarning}}
    ${content}
  </div>
  <footer class="mx-auto mb-6 w-full max-w-6xl px-4 sm:px-6">
    <div class="border-2 border-stone-900 bg-amber-50 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-stone-700 sm:text-xs">
      Indie Web Starter Press · Est. 2026
    </div>
  </footer>
</body>
</html>
`;
