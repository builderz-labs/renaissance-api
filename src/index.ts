import { Router } from 'itty-router';
import checkNfts from './handlers/checkNfts';

interface Env {
	HELIUS: any;
}

const router = Router();

router.get('/api/test', (request, env: Env) => {
	console.log(env);
	return new Response('Hello, world! This is the root page of your Worker template.');
});

router.post('/api/check-nfts', async (request, env: Env) => checkNfts(request, env));

router.all('*', () => new Response('404, not found!', { status: 404 }));

export default {
	fetch: router.handle,
};
