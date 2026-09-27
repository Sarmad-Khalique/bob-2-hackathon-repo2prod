# Repo2Prod hackathon site

Static preview site for Repo2Prod and team Necromancers.

## Local preview

Serve `dist/` with any static server.

## Add the final Drive links

Edit `dist/site-config.js` and replace the two `null` values:

```js
window.REPO2PROD_SITE = {
  presentationUrl: "https://drive.google.com/...",
  demoVideoUrl: "https://drive.google.com/..."
};
```

The placeholder cards will automatically change to active links.
