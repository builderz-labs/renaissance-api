import { getAllNftEvents, fetchHistory, getCollectionData } from '../utils';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface checkUnlistedNftReq {
	collectionVerifiedCreators?: string[];
	collectionVerifiedAddresses?: string[];
}

const getRoyaltyBreakdown = async (req: Request, env: any): Promise<Response> => {
	let collectionVerifiedAddresses: string[] | undefined;
	let collectionVerifiedCreators: string[] | undefined;

	try {
		const body = (await req.json()) as checkUnlistedNftReq;
		collectionVerifiedAddresses = body.collectionVerifiedAddresses;
		collectionVerifiedCreators = body.collectionVerifiedCreators;

		if (!collectionVerifiedAddresses && !collectionVerifiedCreators) {
			return new Response('Invalid request body', { status: 400 });
		}
	} catch (error) {
		console.error(error);
		return new Response('Invalid request body', { status: 400 });
	}

	// Fetching additional data

	// const sfbp = 500; // set manually
	// const royaltyWalletPercentage = 1; // set manually
	// const royaltyWallet = '3NoPerEGS1JpPA6FGYpPfKJ8QUkBjYPngST2pwpQt7ED'; // set manually

	const { sfbp, royaltyWalletPercentage, royaltyWallet } = await getCollectionData(
		env,
		collectionVerifiedAddresses,
		collectionVerifiedCreators
	);

	const now = new Date();
	const daysAgo = 30; // set manually

	let endTimestamp = Math.floor(now.getTime() / 1000); // Round down to nearest second
	let startTimestamp = Math.floor(now.getTime() / 1000 - 60 * 60 * 24 * daysAgo); // Round down to nearest second

	const nftSales = await getAllNftEvents(
		env,
		startTimestamp.toString(),
		endTimestamp.toString(),
		collectionVerifiedAddresses,
		collectionVerifiedCreators
	);

	const royaltyRedemptions = await fetchHistory(
		env,
		startTimestamp * 1000,
		collectionVerifiedAddresses,
		collectionVerifiedCreators
	);

	// Filter sales by day and calculate metrics
	const metricsByDay = [];
	while (endTimestamp > startTimestamp) {
		const date = new Date(endTimestamp * 1000);
		const dateString = date.toLocaleDateString();

		// Marketplace sales
		const daySales = nftSales.filter(sale => {
			const saleTimestamp = Math.floor(sale.timestamp);

			// Convert to seconds
			return saleTimestamp >= endTimestamp - 60 * 60 * 24 && saleTimestamp < endTimestamp;
		});

		const salesVolume = daySales.reduce((total, sale) => total + sale.amount, 0);

		const royaltiesPaid = daySales.reduce((total, sale) => {
			const saleAmount = sale.amount;

			const royaltyPayment = sale.nativeTransfers.find(
				(transfer: any) => transfer.toUserAccount === royaltyWallet
			);

			if (
				royaltyPayment &&
				royaltyPayment.amount === (saleAmount * sfbp * royaltyWalletPercentage) / 10000
			) {
				return total + (saleAmount * sfbp) / 10000;
			} else {
				return total;
			}
		}, 0);

		const outstandingRoyalties = daySales.reduce((total, sale) => {
			const sfbp = 750; // set manually
			const saleAmount = sale.amount;
			const royaltiesPaid = sale.nativeTransfers.reduce((total: number, transfer: any) => {
				if (transfer.toUserAccount === royaltyWallet) {
					return total + transfer.amount;
				} else {
					return total;
				}
			}, 0);
			const outstanding = (saleAmount * sfbp) / 10000 - royaltiesPaid;
			return total + outstanding;
		}, 0);

		// Redemptions
		const dayRedemptions = royaltyRedemptions.filter(redemption => {
			const redemptionTimestamp = Math.floor(redemption.date / 1000);

			return (
				redemptionTimestamp >= endTimestamp - 60 * 60 * 24 && redemptionTimestamp < endTimestamp
			);
		});

		const redemptions = dayRedemptions.reduce((total, redemption) => {
			return total + redemption.amount;
		}, 0);

		metricsByDay.push({
			date: dateString,
			sales: daySales.length,
			salesVolume: salesVolume / LAMPORTS_PER_SOL,
			royaltiesPaid: royaltiesPaid / LAMPORTS_PER_SOL,
			redemptions: redemptions / LAMPORTS_PER_SOL,
			outstandingRoyalties:
				outstandingRoyalties / LAMPORTS_PER_SOL - redemptions / LAMPORTS_PER_SOL,
			percentagePaid: (royaltiesPaid / (royaltiesPaid + outstandingRoyalties)) * 100,
			percentageWithRedemptions:
				((royaltiesPaid + redemptions) / (royaltiesPaid + outstandingRoyalties)) * 100,
		});

		// Move to previous day
		endTimestamp = Math.floor(endTimestamp - 60 * 60 * 24);
	}

	// Calculate totals
	const totalSales = metricsByDay.reduce((total, day) => {
		return total + day.sales;
	}, 0);

	const totalSalesVolume = metricsByDay.reduce((total, day) => {
		return total + day.salesVolume;
	}, 0);

	const totalRoyaltiesPaid = metricsByDay.reduce((total, day) => {
		return total + day.royaltiesPaid;
	}, 0);

	const totalRedemptions = metricsByDay.reduce((total, day) => {
		return total + day.redemptions;
	}, 0);

	const totalOutstandingRoyalties = metricsByDay.reduce((total, day) => {
		return total + day.outstandingRoyalties;
	}, 0);

	const total = {
		totalSales,
		totalSalesVolume,
		totalRoyaltiesPaid,
		totalOutstandingRoyalties,
		totalRedemptions,
		totalPercentagePaid:
			(totalRoyaltiesPaid / (totalOutstandingRoyalties + totalRoyaltiesPaid)) * 100,
		totalPercentageWithRedemptions:
			((totalRoyaltiesPaid + totalRedemptions) / (totalRoyaltiesPaid + totalOutstandingRoyalties)) *
			100,
	};
	console.log(metricsByDay);
	console.log(total);

	const headers = { 'Content-type': 'application/json', 'Access-Control-Allow-Origin': '*' };
	return new Response(JSON.stringify({ metricsByDay, total }), { headers });
};

export default getRoyaltyBreakdown;
