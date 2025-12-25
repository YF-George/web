declare global {
	interface Liveblocks {
		// Custom user info set when authenticating with a secret key
		UserMeta: {
			id: string;
			info: Record<string, never>;
		};

		// Custom events, for use in your application
		// RoomEvent: {};

		// Custom metadata set on threads, for use in your application
		ThreadMetadata: Record<string, never>;

		// Custom room info set with REST API, for use in your application
		RoomInfo: Record<string, never>;
	}
}

export {};
