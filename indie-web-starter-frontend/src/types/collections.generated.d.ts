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

export const COLLECTION_COUNT = 6;

export interface BlogPostsCollectionData {
	"excerpt"?: string;
	"content": RichText;
	"featuredImage"?: string;
	"author": string;
	"publishedAt"?: string;
	"status"?: "draft" | "published" | "archived";
	"tags"?: string;
}

export interface BlogPostsCollectionFieldKinds {
	"excerpt": "textarea";
	"content": "richtext";
	"featuredImage": "media";
	"author": "string";
	"publishedAt": "datetime";
	"status": "select";
	"tags": "string";
}

export interface EventsCollectionData {
	"content": RichText;
	"rating": number;
	"featuredImage"?: string;
	"galleryImages"?: string[];
	"eventDate"?: string;
	"location"?: string;
	"outfit"?: string;
}

export interface EventsCollectionFieldKinds {
	"content": "richtext";
	"rating": "number";
	"featuredImage": "media";
	"galleryImages": "media-array";
	"eventDate": "datetime";
	"location": "string";
	"outfit": "reference";
}

export interface MovieReviewsCollectionData {
	"director"?: string;
	"releaseYear"?: number;
	"genres"?: string;
	"runtimeMinutes"?: number;
	"content"?: RichText;
	"rating": number;
	"featuredImage"?: string;
	"publishedAt"?: string;
	"status"?: "draft" | "published" | "archived";
}

export interface MovieReviewsCollectionFieldKinds {
	"director": "string";
	"releaseYear": "number";
	"genres": "string";
	"runtimeMinutes": "number";
	"content": "richtext";
	"rating": "number";
	"featuredImage": "media";
	"publishedAt": "datetime";
	"status": "select";
}

export interface MusicReviewsCollectionData {
	"releaseType": "album" | "single";
	"artistName": string;
	"releaseTitle": string;
	"content"?: RichText;
	"rating": number;
	"label"?: string;
	"genres"?: string;
	"releaseDate"?: string;
	"featuredImage"?: string;
	"publishedAt"?: string;
	"status"?: "draft" | "published" | "archived";
}

export interface MusicReviewsCollectionFieldKinds {
	"releaseType": "select";
	"artistName": "string";
	"releaseTitle": "string";
	"content": "richtext";
	"rating": "number";
	"label": "string";
	"genres": "string";
	"releaseDate": "datetime";
	"featuredImage": "media";
	"publishedAt": "datetime";
	"status": "select";
}

export interface OutfitsCollectionData {
	"mainImage": string;
	"pieces"?: {
	"name"?: string;
	"image"?: string;
	"order"?: number;
}[];
}

export interface OutfitsCollectionFieldKinds {
	"mainImage": "media";
	"pieces": "object-array";
}

export interface PostsCollectionData {
	"caption": string;
	"media"?: string[];
}

export interface PostsCollectionFieldKinds {
	"caption": "textarea";
	"media": "media-array";
}

export type CollectionName = "blog-posts" | "events" | "movie-reviews" | "music-reviews" | "outfits" | "posts";

export interface CollectionDataMap {
	"blog-posts": BlogPostsCollectionData;
	"events": EventsCollectionData;
	"movie-reviews": MovieReviewsCollectionData;
	"music-reviews": MusicReviewsCollectionData;
	"outfits": OutfitsCollectionData;
	"posts": PostsCollectionData;
}

export type CollectionData<K extends CollectionName = CollectionName> = CollectionDataMap[K];

export interface CollectionFieldKindsMap {
	"blog-posts": BlogPostsCollectionFieldKinds;
	"events": EventsCollectionFieldKinds;
	"movie-reviews": MovieReviewsCollectionFieldKinds;
	"music-reviews": MusicReviewsCollectionFieldKinds;
	"outfits": OutfitsCollectionFieldKinds;
	"posts": PostsCollectionFieldKinds;
}

export type CollectionFieldKind<C extends CollectionName, F extends keyof CollectionFieldKindsMap[C]> = CollectionFieldKindsMap[C][F];

