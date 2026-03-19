/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Generated from http://localhost:8788/api/collections

export type RichText = string & { readonly __fieldType: "richtext" };

export type CollectionDefinition = {
	id: string;
	name: string;
	display_name?: string;
	description?: string;
	schema?: {
		type?: string;
		properties?: Record<string, unknown>;
		required?: string[];
	};
};

export const COLLECTION_COUNT = 4;

export interface BlogPostsCollectionData {
	"title": string;
	"slug": string;
	"excerpt"?: string;
	"content": RichText;
	"featuredImage"?: string;
	"author": string;
	"publishedAt"?: string;
	"status"?: "draft" | "published" | "archived";
	"tags"?: string;
}

export interface BlogPostsCollectionFieldKinds {
	"title": "string";
	"slug": "slug";
	"excerpt": "textarea";
	"content": "richtext";
	"featuredImage": "media";
	"author": "string";
	"publishedAt": "datetime";
	"status": "select";
	"tags": "string";
}

export interface MusicCollectionData {
	"title": string;
	"content"?: RichText;
	"status"?: "draft" | "published" | "archived";
	"album_cover"?: string;
}

export interface MusicCollectionFieldKinds {
	"title": "string";
	"content": "richtext";
	"status": "string";
	"album_cover": "media";
}

export interface NewsCollectionData {
	"title": string;
	"content"?: RichText;
	"publish_date"?: string;
	"author"?: string;
	"category"?: "technology" | "business" | "general";
}

export interface NewsCollectionFieldKinds {
	"title": "string";
	"content": "richtext";
	"publish_date": "date";
	"author": "string";
	"category": "string";
}

export interface PagesCollectionData {
	"title": string;
	"content"?: RichText;
	"slug"?: string;
	"meta_description"?: string;
	"featured_image"?: string;
}

export interface PagesCollectionFieldKinds {
	"title": "string";
	"content": "richtext";
	"slug": "slug";
	"meta_description": "string";
	"featured_image": "media";
}

export type CollectionName = "blog-posts" | "music" | "news" | "pages";

export interface CollectionDataMap {
	"blog-posts": BlogPostsCollectionData;
	"music": MusicCollectionData;
	"news": NewsCollectionData;
	"pages": PagesCollectionData;
}

export type CollectionData<K extends CollectionName = CollectionName> = CollectionDataMap[K];

export interface CollectionFieldKindsMap {
	"blog-posts": BlogPostsCollectionFieldKinds;
	"music": MusicCollectionFieldKinds;
	"news": NewsCollectionFieldKinds;
	"pages": PagesCollectionFieldKinds;
}

export type CollectionFieldKind<C extends CollectionName, F extends keyof CollectionFieldKindsMap[C]> = CollectionFieldKindsMap[C][F];

