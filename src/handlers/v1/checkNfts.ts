import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '@builderz/royalty-solution';
import { getNftStateApi } from '../../utils';
import { Buffer } from 'buffer';
import { decodePaginationToken, encodePaginationToken } from '../../utils';

interface checkNftReq {
	mints: string[];
	paginationToken: string;
}

export const tryGetAccount = async (nftStateAddress: PublicKey, env: any) => {
	try {
		return await getNftStateApi(nftStateAddress, env);
	} catch (error) {
		return null;
	}
};

export type checkNftRes = {
	mint: string;
	royaltiesPaid: boolean;
	royaltiesToPay: number;
	royaltiesPaidAmount: number;
	status: string;
};

const checkNfts = async (req: Request, env: any): Promise<Response> => {
	const limit = 100;

	let mints: string[];
	let paginationToken: string | undefined = undefined;

	// Check if request is valid
	try {
		const body = (await req.json()) as checkNftReq;
		mints = body.mints;
		paginationToken = body.paginationToken;
	} catch (error) {
		console.error(error);
		return new Response('Invalid request body', { status: 400 });
	}

	if (paginationToken) {
		const { mint, index } = decodePaginationToken(paginationToken);
		const tokenIndex = mints.findIndex((m, i) => m === mint && i === index);

		if (tokenIndex !== -1) {
			mints = mints.slice(tokenIndex + 1, tokenIndex + 1 + limit);
		}
	} else {
		mints = mints.slice(0, limit);
	}

	const nftEventsUrl = `https://helius-rpc-proxy.builderzlabs.workers.dev/v1/nft-events`;
	const metadataUrl = `https://helius-rpc-proxy.builderzlabs.workers.dev/v0/token-metadata`;

	let nftDatas: {
		mint: string;
		sellerFeeBasisPoints: number;
		creators: { address: string; share: number; verified: boolean }[];
		latestSale: any;
	}[] = [];

	let checkedNfts: checkNftRes[] = [];

	// Try get latest Sales + NFT Metadatas
	try {
		const saleDatas = await (
			await env.HELIUS.fetch(nftEventsUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					query: {
						accounts: mints,
						types: ['NFT_SALE'],
					},
				}),
			})
		).json();

		const metadatas = await (
			await env.HELIUS.fetch(metadataUrl, {
				method: 'POST',
				body: JSON.stringify({
					mintAccounts: mints,
					includeOffChainData: false,
				}),
			})
		).json();

		nftDatas = metadatas.map((m: any) => {
			const { metadata } = m.onChainMetadata;

			const salesForNft = saleDatas.result.filter((s: any) =>
				s.nfts.some((nft: any) => nft.mint === metadata.mint)
			);

			const latestSale = salesForNft.length
				? salesForNft.reduce((accumulator: any, currentValue: any) => {
						return currentValue.timestamp > accumulator.timestamp ? currentValue : accumulator;
				  }, salesForNft[0])
				: null;

			return {
				mint: metadata.mint,
				sellerFeeBasisPoints: metadata.data.sellerFeeBasisPoints,
				creators: metadata.data.creators,
				latestSale: latestSale,
			};
		});
	} catch (error: any) {
		console.log(error);
		new Response('Not found', { status: 404 });
	}

	// Check if royalties paid

	for (const nft of nftDatas) {
		// Get one creator
		const royaltyReceiver = nft.creators?.find(c => c.share > 0);

		if (!royaltyReceiver) {
			// No royalty receiver wallet found
			checkedNfts.push({
				mint: nft.mint,
				royaltiesPaid: true,
				royaltiesToPay: 0,
				royaltiesPaidAmount: 0,
				status: '',
			});
			continue;
		}

		if (!nft.latestSale) {
			// Nft never sold
			checkedNfts.push({
				mint: nft.mint,
				royaltiesPaid: true,
				royaltiesToPay: 0,
				royaltiesPaidAmount: 0,
				status: 'never-sold',
			});
		} else {
			// There is a latest sale
			const saleAmount = nft.latestSale.amount; // total amount
			const royaltiesToPay = (saleAmount * nft.sellerFeeBasisPoints) / 10000;
			const royaltyPayment = nft.latestSale.nativeTransfers.find(
				(transfer: any) => transfer.toUserAccount === royaltyReceiver.address
			);

			if (royaltiesToPay === 0) {
				// Royalties paid
				checkedNfts.push({
					mint: nft.mint,
					royaltiesPaid: true,
					royaltiesPaidAmount: royaltiesToPay,
					royaltiesToPay: 0,
					status: '',
				});
				continue;
			}

			// Check Royalty Payment of Sale
			if (royaltyPayment) {
				// Full royalties paid at sale
				if (royaltiesToPay * 0.99 <= royaltyPayment.amount * (100 / royaltyReceiver.share)) {
					checkedNfts.push({
						mint: nft.mint,
						royaltiesPaid: true,
						royaltiesPaidAmount: royaltiesToPay,
						royaltiesToPay: 0,
						status: 'paid-at-sale',
					});
					continue;
				} else {
					console.log('Partial payment');

					const percentagePaid =
						(royaltyPayment.amount * (100 / royaltyReceiver.share)) / royaltiesToPay;
					const amountPaid = royaltyPayment.amount * (100 / royaltyReceiver.share);
					const outstanding = royaltiesToPay - amountPaid;

					console.log(
						'Amount paid: ' +
							amountPaid +
							'; Outstanding: ' +
							outstanding +
							'; Percentage: ' +
							percentagePaid * 100
					);

					// TODO: Check if remaining amount was paid via tool
					const [nftStateAddress] = PublicKey.findProgramAddressSync(
						[Buffer.from('nft-state'), new PublicKey(nft.mint).toBuffer()],
						PROGRAM_ID
					);

					const nftStateAccount = await tryGetAccount(nftStateAddress, env);

					if (
						nftStateAccount &&
						Number(nftStateAccount.repayTimestamp.toNumber()) >= nft.latestSale.timestamp
					) {
						// Royalties paid
						checkedNfts.push({
							mint: nft.mint,
							royaltiesPaid: true,
							royaltiesPaidAmount: royaltiesToPay,
							royaltiesToPay: 0,
							status: 'paid-with-tool',
						});
						continue;
					} else {
						checkedNfts.push({
							mint: nft.mint,
							royaltiesPaid: false,
							royaltiesToPay: outstanding,
							royaltiesPaidAmount: amountPaid,
							status: 'partial',
						});
						continue;
					}
				}
			} else {
				// No royalty payment found at sale -> Check repayment via tool
				const [nftStateAddress] = PublicKey.findProgramAddressSync(
					[Buffer.from('nft-state'), new PublicKey(nft.mint).toBuffer()],
					PROGRAM_ID
				);

				const nftStateAccount = await tryGetAccount(nftStateAddress, env);

				if (
					nftStateAccount &&
					Number(nftStateAccount.repayTimestamp.toNumber()) >= nft.latestSale.timestamp
				) {
					console.log('Royalty payment via tool found');

					// Royalties paid
					checkedNfts.push({
						mint: nft.mint,
						royaltiesPaid: true,
						royaltiesToPay: 0,
						royaltiesPaidAmount: royaltiesToPay,
						status: 'paid-with-tool',
					});
					continue;
				} else {
					console.log('No royalty payment via tool found');

					checkedNfts.push({
						mint: nft.mint,
						royaltiesPaid: false,
						royaltiesToPay: royaltiesToPay,
						royaltiesPaidAmount: 0,
						status: '',
					});
					continue;
				}
			}
		}
	}

	const lastItemIndex =
		mints.length > 0
			? mints.length - 1 + (paginationToken ? decodePaginationToken(paginationToken).index + 1 : 0)
			: null;
	const lastItem = checkedNfts[checkedNfts.length - 1];

	// Create new Pagination Token
	const newPaginationToken =
		lastItem && checkedNfts.length === limit && lastItemIndex !== null
			? encodePaginationToken(lastItem.mint, lastItemIndex)
			: null;

	const res = JSON.stringify({ checkedNfts, paginationToken: newPaginationToken });
	const headers = { 'Content-type': 'application/json', 'Access-Control-Allow-Origin': '*' };
	return new Response(res, { headers });
};

export default checkNfts;
