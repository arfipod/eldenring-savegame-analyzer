# Deploying to Vercel

## From GitHub

1. Create a repository and push the contents of this directory.
2. In Vercel, select **Add New → Project** and import the repository.
3. Framework preset: **Vite**.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Node.js: 22.x.
7. Do not add environment variables.
8. Deploy and test with a backup of a save file, never the only copy.

## Post-deployment verification

- The home page should display status badges for local processing and read-only operation.
- Open DevTools → Network. Selecting a save file must not trigger any request containing its data.
- Only the application's own resources and GET requests to static catalogs on `raw.githubusercontent.com` should appear.
- Check the default export for the Steam ID and the MD5 displayed on the technical tab; neither should be present.
- Enable completionist mode only for a playthrough where spoilers do not matter.

## Headers

`vercel.json` prevents framing, restricts browser capabilities, and limits network connections to the application itself and its pinned catalogs.
