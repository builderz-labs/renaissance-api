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

export const getCollectionData = async (
	env: any,
	verifiedCollectionAddresses?: string[],
	firstVerifiedCreators?: string[]
) => {
	const mints = await getAllMints(env, verifiedCollectionAddresses, firstVerifiedCreators);

	const nftMetadata = await (
		await env.HELIUS.fetch(`https://helius-rpc-proxy.builderzlabs.workers.dev/v0/token-metadata`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				mintAccounts: [mints[0]],
			}),
		})
	).json();

	console.log(nftMetadata);

	return { sfbp: 500, royaltyWalletPercentage: 1, royaltyWallet: '' };
};

export const getAllMints = async (
	env: any,
	verifiedCollectionAddresses?: string[],
	firstVerifiedCreators?: string[]
) => {
	const mints = [];
	let paginationToken;
	while (true) {
		const data: any = await (
			await env.HELIUS.fetch(`https://helius-rpc-proxy.builderzlabs.workers.dev/v1/mintlist`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					query: {
						firstVerifiedCreators: firstVerifiedCreators,
						verifiedCollectionAddresses: verifiedCollectionAddresses,
					},
					options: {
						paginationToken: paginationToken,
					},
				}),
			})
		).json();

		mints.push(...data.result);

		if (data.paginationToken) {
			paginationToken = data.paginationToken;
		} else {
			break;
		}
	}

	return mints.map(mint => mint.mint);
};

// Get all NFT events
export const getAllNftEvents = async (
	env: any,
	startTimestamp: string,
	endTimestamp: string,
	collections?: string[],
	firstVerifiedCreators?: string[]
) => {
	const events = [];
	let paginationToken;
	while (true) {
		const data: any = await (
			await env.HELIUS.fetch(`https://helius-rpc-proxy.builderzlabs.workers.dev/v1/nft-events`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					query: {
						types: ['NFT_SALE'],
						nftCollectionFilters: {
							firstVerifiedCreator: firstVerifiedCreators,
							verifiedCollectionAddress: collections,
						},
						startTime: Number(startTimestamp),
						endTime: Number(endTimestamp),
					},
					options: {
						limit: 100,
						paginationToken: paginationToken,
					},
				}),
			})
		).json();
		events.push(...data.result);

		if (data.paginationToken) {
			paginationToken = data.paginationToken;
		} else {
			break;
		}
	}
	return events;
};

// Program history
export const fetchTransactionPages = async (env: any, amount?: number, timestamp?: number) => {
	let oldestTransaction = '';
	let transactions: any[] = [];

	let oldestTransactionTimestamp = Infinity;
	let maxTxAmount = amount || Infinity;
	let maxTxTimestamp = timestamp || Infinity;

	try {
		while (transactions.length <= maxTxAmount && oldestTransactionTimestamp >= maxTxTimestamp) {
			const url = `https://helius-rpc-proxy.builderzlabs.workers.dev/v0/addresses/9ZskGH9wtdwM9UXjBq1KDwuaLfrZyPChz41Hx7NWhTFf/transactions?before=${oldestTransaction}`;
			const data = await env.HELIUS.fetch(url);

			if (data.length === 0) {
				// Exhausted all transactions for the given address
				return transactions;
			}

			oldestTransaction = data[data.length - 1].signature;

			oldestTransactionTimestamp = data[data.length - 1].timestamp * 1000;

			const timeFilteredData = data.filter((tx: any) => tx.timestamp * 1000 >= maxTxTimestamp);

			if (timeFilteredData.length === 0) {
				return transactions;
			}

			transactions.push(...timeFilteredData);
		}

		return transactions;
	} catch (error) {
		throw error;
	}
};

export const fetchHistory = async (
	env: any,
	timestamp: number,
	verifiedCollectionAddresses?: string[],
	firstVerifiedCreators?: string[]
) => {
	const mintList = await getAllMints(env, verifiedCollectionAddresses, firstVerifiedCreators);

	const redemptionTransactions = await fetchTransactionPages(undefined, timestamp);

	const filtered: Array<any> = [];

	redemptionTransactions &&
		redemptionTransactions.forEach((tx: any) => {
			// Filter each instruction
			const filteredInstructions = tx.instructions.filter((ix: any) => {
				if (ix.accounts && [mintList.includes(ix.accounts[1])]) {
					return ix;
				}
			});

			const royaltyAccounts = filteredInstructions[0].accounts.slice(6);
			const royaltyTransfers = tx.nativeTransfers.filter((transfer: any) =>
				royaltyAccounts.includes(transfer.toUserAccount)
			);
			let amount = 0;
			royaltyTransfers.forEach((transfer: any) => {
				amount += transfer.amount;
			});

			filtered.push({
				nft: filteredInstructions[0].accounts[1],
				wallet: tx.feePayer,
				amount: amount,
				date: tx.timestamp * 1000,
				signature: tx.signature,
			});
		});

	return filtered;
};
