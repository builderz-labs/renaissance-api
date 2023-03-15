import { PublicKey } from '@solana/web3.js';
import { NftState } from '@builderz/royalty-solution';

export const getNftStateApi = async (address: PublicKey, env: any): Promise<NftState> => {
	const accountInfo = await (
		await env.HELIUS.fetch('https://helius-rpc-proxy.builderzlabs.workers.dev', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'getAccountInfo',
				params: [
					address.toBase58(),
					{
						encoding: 'base64',
					},
				],
			}),
		})
	).json();

	let res = accountInfo.result.value;

	res.data = accountInfo.result.value.data = Buffer.from(
		accountInfo.result.value.data[0],
		'base64'
	);

	if (!accountInfo) {
		throw new Error(`Account ${address.toBase58()} not found`);
	}
	const [nftState] = NftState.fromAccountInfo(res);
	return nftState;
};
