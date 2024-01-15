import axios from 'axios';
import { FastifyReply, FastifyRequest } from 'fastify';
import { isAuthenticated } from '../app';

export const steamRoutes = (fastify, _opts, done) => {
	fastify.get('/steam/:id', { preValidation: isAuthenticated }, getById);
	fastify.get(
		'/steam/:id/friends',
		{ preValidation: isAuthenticated },
		getFriendList,
	);
	fastify.get(
		'/steam/:id/games',
		{ preValidation: isAuthenticated },
		getOwnedGames,
	);
	fastify.get(
		'/steam/games/:appids',
		{ preValidation: isAuthenticated },
		getGamesInfo,
	);

	// TODO: Endpoint for resetting cache

	const { redis } = fastify;

	async function getById(request: FastifyRequest, reply: FastifyReply) {
		const id = request.params!!['id'];
		if (!id || id.length !== 17) {
			//id64
			return reply
				.status(400)
				.send({ success: false, message: 'Invalid ID' });
		}
		try {
			try {
				const cached = await redis.hexists(`/steam/${id}`, 'steamid')!!;
				if (cached) {
					return reply.status(200).send({
						success: true,
						data: await redis.hgetall(`/steam/${id}`),
					});
				}
			} catch (e) {
				console.error(e);
			}
			const response = await axios.get(
				`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${fastify['config'].STEAM_API_KEY}&steamids=${id}`,
			);

			const player = response.data.response.players[0];
			if (!player) {
				return reply
					.status(404)
					.send({ success: false, message: 'Player not found' });
			}
			try {
				redis.hset(`/steam/${id}`, player); // 1 day
				redis.expire(`/steam/${id}`, 86400);
			} catch (e) {
				console.error(e);
			}
			return reply.status(200).send({
				success: true,
				data: player,
			});
		} catch (e) {
			return reply.status(500).send({
				success: false,
				message: 'Internal server error',
			});
		}
	}

	async function getFriendList(request: FastifyRequest, reply: FastifyReply) {
		try {
			const id = request.params!!['id'];
			if (!id || id.length !== 17) {
				//id64
				return reply
					.status(400)
					.send({ success: false, message: 'Invalid ID' });
			}

			try {
				const cached = await redis.exists(`/steam/${id}/friends`)!!;
				if (cached) {
					return reply.status(200).send({
						success: true,
						data: JSON.parse(
							await redis.get(`/steam/${id}/friends`),
						),
					});
				}
			} catch (e) {
				console.error(e);
			}

			const response = await axios.get(
				`https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${fastify['config'].STEAM_API_KEY}&steamid=${id}&relationship=friend`,
			);

			const friendlist: any = response.data.friendslist.friends;
			const count = friendlist.length;
			const chunks: any[] = [];
			const chunkSize = 100;
			for (let i = 0; i < count; i += chunkSize) {
				chunks.push(friendlist.slice(i, i + chunkSize));
			}
			const promises = chunks.map(chunk =>
				axios.get(
					`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${
						fastify['config'].STEAM_API_KEY
					}&steamids=${chunk
						.map(friend => friend.steamid)
						.join(',')}`,
				),
			);
			const results = await Promise.all(promises);
			const players = results.map(result => result.data.response.players);
			// merge arrays
			const merged: any = [].concat.apply([], players);
			// sort by steamid
			merged.sort((a, b) => Number(a.steamid) - Number(b.steamid));

			try {
				redis.set(`/steam/${id}/friends`, JSON.stringify(merged)); // 15 minutes
				redis.expire(`/steam/${id}/friends`, 15 * 60);
			} catch (e) {
				console.error(e);
			}

			return reply.status(200).send({
				success: true,
				data: merged,
			});
		} catch (e) {
			if ((e as any).response.status === 401) {
				return reply.status(401).send({
					success: false,
					message: 'Friend list is private',
				});
			} else {
				return reply.status(500).send({
					success: false,
					message: 'Internal server error',
				});
			}
		}
	}

	async function getOwnedGames(request: FastifyRequest, reply: FastifyReply) {
		try {
			const id = request.params!!['id'];
			if (!id || id.length !== 17) {
				//id64
				return reply
					.status(400)
					.send({ success: false, message: 'Invalid ID' });
			}
			try {
				const cached = await redis.exists(`/steam/${id}/games`)!!;
				if (cached) {
					let games = JSON.parse(
						await redis.get(`/steam/${id}/games`),
					);
					return reply.status(200).send({
						success: true,
						count: games.length,
						data: games,
					});
				}
			} catch (e) {
				console.error(e);
			}
			const response = await axios.get(
				`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${fastify['config'].STEAM_API_KEY}&steamid=${id}&relationship=friend`,
			);
			const games = response.data.response.games;
			const count = games.length;
			try {
				redis.set(`/steam/${id}/games`, JSON.stringify(games)); // 1 hour
				redis.expire(`/steam/${id}/games`, 3600);
			} catch (e) {
				console.error(e);
			}
			return reply.status(200).send({
				success: true,
				count,
				data: games,
			});
		} catch (e) {
			if ((e as any).response.status === 401) {
				return reply.status(401).send({
					success: false,
					message: 'Games list is private',
				});
			} else {
				return reply.status(500).send({
					success: false,
					message: 'Internal server error',
				});
			}
		}
	}

	async function getGamesInfo(request: FastifyRequest, reply: FastifyReply) {
		try {
			const appIds = request.params!!['appids'].split(',');
			const finalData = {};
			for (const appId of appIds) {
				try {
					const cached = await redis.exists(
						`/steam/games/${appId}`,
					)!!;
					if (cached) {
						finalData[appId] = JSON.parse(
							await redis.get(`/steam/games/${appId}`),
						);
					}
					continue;
				} catch (e) {
					console.error(e);
				}
				const response = await axios.get(
					`https://store.steampowered.com/api/appdetails?appids=${appId}`,
				);
				const game = response.data;
				if (!game[appId].success) {
					return reply.status(404).send({
						success: false,
						message: 'Game not found',
						appId: appId,
					});
				}
				finalData[appId] = game[appId].data;
				try {
					redis.set(
						`/steam/games/${appId}`,
						JSON.stringify(game[appId].data),
					); // 1 day
					redis.expire(`/steam/games/${appId}`, 86400);
				} catch (e) {
					console.error(e);
				}
			}
			return reply.status(200).send({
				success: true,
				data: finalData,
			});
		} catch (e) {
			console.log(e);
			if ((e as any).response.status === 429) {
				return reply.status(429).send({
					success: false,
					message: 'Rate limited',
				});
			} else {
				return reply.status(500).send({
					success: false,
					message: 'Internal server error',
				});
			}
		}
	}

	done();
};
