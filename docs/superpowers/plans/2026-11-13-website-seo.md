# Website SEO implementation plan

Goal: improve discoverability for multi-platform buyer order export and platform-specific searches. User selected both technical and content work.

Architecture: preserve existing buildless static site, assets, downloads and public access. No framework dependency. Follow Google Search Central and Schema.org. Lighthouse (Apache-2.0) is an audit candidate, not a runtime dependency.

- [x] Inspect current source, live pages, robots, sitemap, server configuration and deployment identity.
- [x] Improve unique metadata; add truthful SoftwareApplication, WebPage/TechArticle and breadcrumbs without fabricated reviews.
- [x] Add nine platform guides and an Excel/CSV guide with actual platform differences and navigation.
- [ ] Validate HTML, JSON-LD, sitemap, local links and mobile browser display.
- [ ] Push exact website changes; verify GitHub/Gitee synchronization.
- [ ] Deploy a backed-up mainland release, correct real 404 handling, synchronize existing public Sites project.
- [ ] Check live status, redirects, missing URLs and content parity. Inspect search console access if available; do not claim submission without evidence.
