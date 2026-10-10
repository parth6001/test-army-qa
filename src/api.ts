import { createApiClient } from '../shared/api-client.mjs';

export const SERVER = 'http://localhost:3001';
export const apiRequest = createApiClient(SERVER);
