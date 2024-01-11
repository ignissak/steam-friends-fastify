import axios from 'axios';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isAuthenticated } from '../app';

export const steamRoutes = (fastify: FastifyInstance, _opts, done) => {
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

	async function getById(request: FastifyRequest, reply: FastifyReply) {
		const id = request.params!!['id'];
		if (!id || id.length !== 17) {
			//id64
			return reply
				.status(400)
				.send({ success: false, message: 'Invalid ID' });
		}
		try {
			const response = await axios.get(
				`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${fastify['config'].STEAM_API_KEY}&steamids=${id}`,
			);

			const player = response.data.response.players[0];
			if (!player) {
				return reply
					.status(404)
					.send({ success: false, message: 'Player not found' });
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
			const response = await axios.get(
				`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${fastify['config'].STEAM_API_KEY}&steamid=${id}&relationship=friend`,
			);
			const games = response.data.response.games;
			const count = games.length;
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

	done();
};
