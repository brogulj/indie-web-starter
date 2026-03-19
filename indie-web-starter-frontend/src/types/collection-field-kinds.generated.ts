/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Generated from http://localhost:8788/api/collections

export const collectionFieldKindsMap = {
  "blog-posts": {
    "title": "string",
    "slug": "slug",
    "excerpt": "textarea",
    "content": "richtext",
    "featuredImage": "media",
    "author": "string",
    "publishedAt": "datetime",
    "status": "select",
    "tags": "string"
  },
  "music": {
    "title": "string",
    "content": "richtext",
    "status": "string",
    "album_cover": "media"
  },
  "news": {
    "title": "string",
    "content": "richtext",
    "publish_date": "date",
    "author": "string",
    "category": "string"
  },
  "pages": {
    "title": "string",
    "content": "richtext",
    "slug": "slug",
    "meta_description": "string",
    "featured_image": "media"
  }
} as const;

export const collectionRequiredFieldsMap = {
  "blog-posts": [
    "title",
    "slug",
    "content",
    "author"
  ],
  "music": [
    "title"
  ],
  "news": [
    "title"
  ],
  "pages": [
    "title"
  ]
} as const;

