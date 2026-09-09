// The entry immediately.run runs (`package.json` → `main`). NOT the `vite dev` entry — that
// is `src/main.tsx`, reached through `index.html`, and it must stay SDK-free.
//
// Why this file has to exist at all (R3-553). The platform resolves an app's entry from
// `package.json` (`main`/`source`/`module`, then the preset defaults). With none of them
// present, reckoner had no entry, so the host served its read-only boot default — literally
// `boot();` — which installs the SDK's DEFAULT_ROUTING_SPEC: `/` → `MainContent`,
// `/files/*` → `FileRouter`, and **everything else → ErrorNotFound**. `MainContent` then
// redirects `/` to `/files/src/App.tsx`, which is why every published reckoner URL reads
// `…/main/files/src/App.tsx?doc=usage`: the app owned no path space at all, and the document
// selector had nowhere to live except the query string — where the host forwards it only at
// boot, so in-app navigation and Back could never work.
//
// `boot({ children })` is the fix, and deliberately not `boot({ routingSpec })`: given
// children, the SDK installs CATCH_ALL_ROUTING_SPEC — every `sandboxPath` matches — and
// renders them inside the navigation providers. Dispatch then stays in one place (the seed
// picker) instead of being split across a host route table and the app's own routing, which
// would have to agree with each other. It also means no not-found rule to own, and no need to
// enumerate the legacy URLs: they fall through the same normaliser as everything else.
//
// The `vite dev` split is the reason this is a separate file rather than a branch inside
// `main.tsx`: importing the SDK's `boot` reaches for the host transport at module load, which
// throws outright when there is no host.
import { boot } from '@immediately-run/sdk/boot';
import App from './App.tsx';

boot({ children: <App /> });
