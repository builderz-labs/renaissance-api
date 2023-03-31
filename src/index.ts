import { Router } from 'itty-router';
import checkNfts from './handlers/checkNfts';
import checkNftsUnlisted from './handlers/checkNftsUnlisted';
import getRoyaltyBreakdown from './handlers/getRoyaltyBreakdown';

interface Env {
	HELIUS: any;
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS',
	'Access-Control-Allow-Headers': '*',
};

const router = Router();

router.options('*', () => new Response(null, { status: 200, headers: corsHeaders }));

router.get('/api/test', (request, env: Env) => {
	return new Response('Hello, world! This is the root page of your Worker template.');
});

router.post('/api/check-nfts', async (request, env: Env) => checkNfts(request, env));

router.post('/api/unlisted-nfts', async (request, env: Env) => checkNftsUnlisted(request, env));

router.post('/api/royalty-breakdown', async (request, env: Env) =>
	getRoyaltyBreakdown(request, env)
);

router.all('*', () => new Response('404, not found!', { status: 404 }));

export default {
	fetch: router.handle,
};
