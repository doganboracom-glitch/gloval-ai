# gloval-ai

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_qr9T6Z6zca68xF157iLOfVgAm5hu)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Demo images (cache busting)

Images under `public/demos/` are named `<name>.<sha8>.webp`, where `<sha8>` is the first 8 hex chars of the file's SHA-256, and are served with `immutable` year-long caching (see `next.config.mjs`). Never replace an image under the same name: after adding or changing one, run

```bash
node scripts/hash-demo-assets.mjs
```

It renames every file to match its content and rewrites all references in `app/`, `components/` and `lib/`. `lib/demo-assets.test.ts` fails if a hash is stale or a reference is broken.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
