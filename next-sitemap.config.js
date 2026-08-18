/** @type {import('next-sitemap').IConfig} */
module.exports = {
  // Dated puzzle pages are noindex and unbounded in number, so they stay out of the sitemap.
  // They are deliberately NOT disallowed in robots.txt — link preview crawlers honor robots.txt,
  // and blocking /p/ would break the unfurl on every shared puzzle link.
  exclude: ['/p/**', '/404', '/500'],
  generateRobotsTxt: true,
  // Write into the static export, not public/. next build copies public/ into out/ before
  // next-sitemap runs, so the default would deploy the previous build's sitemap.
  outDir: 'out',
  siteUrl: 'https://lull.dbowland.com',
}
