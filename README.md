# Crease Live Scores

## Publish for everyone (Netlify, free)
1. Put this folder in a GitHub repository (github.com, "New repository", upload the files).
2. On netlify.com choose "Add new site", "Import an existing project", pick the repository, and deploy.
3. In Netlify open Site configuration, Environment variables, add:
   CRICKET_API_KEY = your key from cricketdata.org
4. In `config.js` set `useProxy: true`, commit the change. Netlify redeploys.
5. Open your `yourname.netlify.app` link. Share it with anyone.

The key stays on Netlify's server, and one API call is shared by all visitors for 60 seconds,
so many users will not use up your free quota.

## Test on your computer
Leave `useProxy: false`, paste your key in `apiKey`, then run `python3 -m http.server 8000`.
Never publish a site with your key in `config.js`.

## Files
- `index.html`, `styles.css`, `app.js`: the site
- `config.js`: settings
- `netlify/functions/cricket.js`: server function that holds the key
- `netlify.toml`: Netlify settings
