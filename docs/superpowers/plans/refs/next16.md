# Next.js 16.4 rules for this repo (cacheComponents + partialPrefetching + reactCompiler)

Source: `node_modules/next/dist/docs/01-app/`. Read the doc there if unsure.

## Must-follow rules
- `params` / `searchParams` are **Promises**. `const { id } = await params`. Global helpers (no import): `PageProps<'/p/[id]'>`, `LayoutProps<'/'>`, `RouteContext<'/api/x/[id]'>`.
- Anything reading `cookies()`, `headers()`, `params`, `searchParams`, `connection()`, or the DB **must render inside `<Suspense>`** (or be `'use cache'`). Otherwise error "Next.js encountered uncached or runtime data during prerendering".
  - Pattern: page component is sync and returns `<Suspense fallback={…}><Inner params={params}/></Suspense>`; `Inner` is async and awaits.
  - Never top-level await the session in a layout. Put the session-reading part in its own async component wrapped in `<Suspense>`.
- `'use cache'` functions cannot call `cookies()`/`headers()`. We do not use `'use cache'` for per-user data at all (YAGNI).
- Segment configs `dynamic`, `revalidate`, `fetchCache`, `dynamicParams` are **removed — exporting them errors**. `runtime = 'nodejs'` and `maxDuration` are still OK. Do not export `runtime = 'edge'`.
- Route handler GET with no request access is **prerendered at build**. For SSE/dynamic GETs call `await connection()` (from `next/server`) first.
- `middleware.ts` is renamed **`proxy.ts`** (in `src/`), export `function proxy(request: NextRequest)`, Node runtime only, do not set `runtime`. Always re-check auth in procedures; proxy is only a convenience redirect.
- `cookies().set` only in Route Handlers / Server Actions.
- `redirect()` / `notFound()` from `next/navigation` throw — call outside `try`.
- `revalidateTag(tag, 'max')` needs 2 args (we don't use it).
- `useState` persists across back/forward (routes kept in `<Activity>`). Reset form state explicitly after submit.
- Metadata: `export const metadata: Metadata = { title: { template: '%s · Alumni Connect', default: 'Alumni Connect' } }`. `generateMetadata` reading DB must not be the only dynamic thing — we use static metadata only.
- `next/font/google`: `Roboto_Flex({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })`.
- `serverExternalPackages`: `pg` etc auto. Add `postgres` is not needed (pure JS). Leave config alone unless a build error says otherwise.
- Next 16 dev writes to `.next/dev`. No `next lint`; use `bun run lint` (Biome).

## SSE route handler template
```ts
import { connection } from "next/server";
export async function GET(req: Request) {
  await connection();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (d: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 15000);
      req.signal.addEventListener("abort", () => { clearInterval(ping); controller.close(); });
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
```

## proxy.ts template
```ts
import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) { /* … */ return NextResponse.next(); }
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
```
