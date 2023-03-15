const getLatestEventOfType = (data: any, eventType: string, mint: string) => {
	const filteredData = data.result.filter(
		(s: any) => s.nfts.some((nft: any) => nft.mint === mint) && s.type === eventType
	);

	const latestEvent = filteredData.length
		? filteredData.reduce((accumulator: any, currentValue: any) => {
				return currentValue.timestamp > accumulator ? currentValue : null;
		  }, 0)
		: null;

	return latestEvent;
};

interface checkUnlistedNftReq {
	mints: string[];
	unlistedValue: number;
}

export type checkUnlistedRes = {
	unlisted: boolean;
	mint: string;
};

const checkNftsUnlisted = async (req: Request, env: any): Promise<Response> => {
	let unlistedValue = 0;
	let mints: string[];
	// Check if request is valid
	try {
		const body = (await req.json()) as checkUnlistedNftReq;
		mints = body.mints;
		unlistedValue = body.unlistedValue;
	} catch (error) {
		console.error(error);
		return new Response('Invalid request body', { status: 400 });
	}

	let mintSubArrays: string[][] = [];

	// Split mints into subarrays of 100
	for (let i = 0; i < mints.length; i += 100) {
		mintSubArrays.push(mints.slice(i, i + 100));
	}

	const url = `https://helius-rpc-proxy.builderzlabs.workers.dev/v1/nft-events`;

	let nftDatas: {
		mint: string;
		latestListing: any;
		latestCancel: any;
		latestSale: any;
	}[] = [];

	let checkedNfts: checkUnlistedRes[] = [];

	for (const subArray of mintSubArrays) {
		try {
			const data = await (
				await env.HELIUS.fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						query: {
							accounts: subArray,
							types: ['NFT_LISTING', 'NFT_CANCEL_LISTING', 'NFT_SALE'],
						},
					}),
				})
			).json();

			nftDatas = subArray.map((m: any) => {
				const latestListing = getLatestEventOfType(data, 'NFT_LISTING', m);
				const latestCancel = getLatestEventOfType(data, 'NFT_CANCEL_LISTING', m);
				const latestSale = getLatestEventOfType(data, 'NFT_SALE', m);

				return {
					mint: m,
					latestListing,
					latestCancel,
					latestSale,
				};
			});
		} catch (error) {
			console.log(error);
			new Response('Not found', { status: 404 });
		}

		// Check Unlisted
		for (const nft of nftDatas) {
			// No latest listing
			if (!nft.latestListing) {
				checkedNfts.push({ unlisted: true, mint: nft.mint });
				continue;
			}

			// Calculate cut-off timestamp
			const unlistedForUnix = new Date(Number(unlistedValue) * 24 * 60 * 60 * 1000).getTime();
			const currentTimestamp = new Date().getTime();
			const limitDateForEligible = currentTimestamp - unlistedForUnix;

			// check if both cancel listing and sale event exist
			if (nft.latestCancel && nft.latestSale) {
				const cancelListingDate = new Date(nft.latestCancel.timestamp * 1000).getTime();

				const saleDate = new Date(nft.latestSale.timestamp * 1000).getTime();

				if (cancelListingDate <= limitDateForEligible || saleDate <= limitDateForEligible) {
					checkedNfts.push({ unlisted: true, mint: nft.mint });
					continue;
				} else {
					checkedNfts.push({ unlisted: false, mint: nft.mint });
					continue;
				}
			} else if (nft.latestCancel) {
				// Check if cancel listing event exists
				const cancelListingDate = new Date(nft.latestCancel.timestamp * 1000).getTime();

				if (cancelListingDate <= limitDateForEligible) {
					checkedNfts.push({ unlisted: true, mint: nft.mint });
					continue;
				} else {
					checkedNfts.push({ unlisted: false, mint: nft.mint });
					continue;
				}
			} else if (nft.latestSale) {
				// check if latest sale event exists
				const saleDate = new Date(nft.latestSale.timestamp * 1000).getTime();

				if (saleDate <= limitDateForEligible) {
					checkedNfts.push({ unlisted: true, mint: nft.mint });
					continue;
				} else {
					checkedNfts.push({ unlisted: false, mint: nft.mint });
					continue;
				}
			} else {
				checkedNfts.push({ unlisted: false, mint: nft.mint });
				continue;
			}
		}
	}

	const headers = { 'Content-type': 'application/json', 'Access-Control-Allow-Origin': '*' };
	return new Response(JSON.stringify(checkedNfts), { headers });
};

export default checkNftsUnlisted;
