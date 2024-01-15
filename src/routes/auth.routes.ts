import fastifyPassport from '@fastify/passport';
import { FastifyReply, FastifyRequest } from 'fastify';

export const authRoutes = (fastify, _opts, done) => {
	fastify.get(
		'/auth/steam',
		{ preValidation: fastifyPassport.authenticate('steam') },
		steamLogin,
	);
	fastify.get(
		'/auth/steam/return',
		{ preValidation: fastifyPassport.authenticate('steam') },
		steamLoginReturn,
	);

	function steamLogin() {}

	function steamLoginReturn(
		_request: FastifyRequest,
		reply: FastifyReply & { cookie: Function },
	) {
		console.log(fastify.config.REDIRECT_URL);
		return reply.redirect(fastify.config.REDIRECT_URL);
	}

	done();
};
