/**
 * My SonicJS Application
 *
 * Entry point for your SonicJS headless CMS application
 */

import { createSonicJSApp, registerCollections } from "@sonicjs-cms/core";
import type { SonicJSConfig } from "@sonicjs-cms/core";

// Import your collection configurations
// Add new collections here after creating them in src/collections/
import blogPostsCollection from "./collections/blog-posts.collection";
import eventsCollection from "./collections/events.collection";
import followingSourcesCollection from "./collections/following-sources.collection";
import musicReviewsCollection from "./collections/music-reviews.collection";
import movieReviewsCollection from "./collections/movie-reviews.collection";
import outboundWebmentionsCollection from "./collections/outbound-webmentions.collection";
import outfitsCollection from "./collections/outfits.collection";
import postsCollection from "./collections/posts.collection";
import trustedWebmentionDomainsCollection from "./collections/trusted-webmention-domains.collection";
import webmentionsCollection from "./collections/webmentions.collection";
import webmentionApiRoutes from "./routes/webmentions";

// Register collections BEFORE creating the app
// This ensures they are synced to the database on startup
registerCollections([
  blogPostsCollection,
  eventsCollection,
  followingSourcesCollection,
  musicReviewsCollection,
  movieReviewsCollection,
  outboundWebmentionsCollection,
  outfitsCollection,
  postsCollection,
  webmentionsCollection,
  trustedWebmentionDomainsCollection,
  // Add more collections here as you create them
]);

// Application configuration
const config: SonicJSConfig = {
  collections: {
    autoSync: true,
  },
  plugins: {
    directory: "./src/plugins",
    autoLoad: false, // Set to true to auto-load custom plugins
  },
  routes: [
    {
      path: "/api/webmentions",
      handler: webmentionApiRoutes,
    },
  ],
};

// Create and export the application
export default createSonicJSApp(config);
