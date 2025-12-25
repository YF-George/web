import { createClient } from '@liveblocks/client';

const client = createClient({
	publicApiKey: 'pk_dev_RuPZplRdpmgk6Wzpo1L08Y9XZlbbxvaZkvaRgmdValbNRWm3pnAtUFx5P_0R_EhS'
});

export const { room, leave } = client.enterRoom('my-room');
