import { Router } from 'itty-router';
import checkNfts from './handlers/checkNfts';
import checkNftsV1 from './handlers/v1/checkNfts';
import checkNftsUnlisted from './handlers/checkNftsUnlisted';
import checkNftsUnlistedV1 from './handlers/v1/checkNftsUnlisted';
import getRoyaltyBreakdown from './handlers/getRoyaltyBreakdown';

interface Env {
	HELIUS: any;
}

const validKeys = [
	'b8e58b039e0ca09991ae6b1feb5c3123',
	'0e332b19ad86ddb02e9dab9dac78c14b',
	'1da161caa390a9da65f0fe413699d49b',
	'36428a1100767fa5462013528f5bdd97',
	'865c1255ec94ec29d9730e585000238a',
	'd4a71dab0b888a0bcb99f4bb7e1d73b9',
	'fc9b7a4f4a2c8d733eb152d720a0630b',
	'79335ba0863dc99f1888c257919a4267',
	'c88509f4ba37ac5aed3d8221673742ef',
	'3991af72cd6305d8669a010775c050b8',
];

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
router.post('/api/v1/checked-nfts', async (request, env: Env) => {
	const apiKey = request.headers.get('renaissance-api-key');
	if (validKeys.includes(apiKey)) {
		// the API key is valid, so allow the request to proceed
		return checkNftsV1(request, env);
	} else {
		// the API key is not valid, so return a 401 Unauthorized response
		return new Response('Unauthorized', { status: 401 });
	}
});

router.post('/api/unlisted-nfts', async (request, env: Env) => checkNftsUnlisted(request, env));
router.post('/api/v1/unlisted-nfts', async (request, env: Env) => {
	const apiKey = request.headers.get('renaissance-api-key');
	if (validKeys.includes(apiKey)) {
		// the API key is valid, so allow the request to proceed
		return checkNftsUnlistedV1(request, env);
	} else {
		// the API key is not valid, so return a 401 Unauthorized response
		return new Response('Unauthorized', { status: 401 });
	}
});

router.post('/api/royalty-breakdown', async (request, env: Env) =>
	getRoyaltyBreakdown(request, env)
);

router.all('*', () => new Response('404, not found!', { status: 404 }));

export default {
	fetch: router.handle,
};
