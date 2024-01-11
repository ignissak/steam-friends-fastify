import { FastifyReply, FastifyRequest } from 'fastify';

export function steamLogin() {}

export function steamLoginReturn(request: FastifyRequest, reply: FastifyReply & { cookie: Function }) {
	return reply.status(200).send({ success: true, data: request['user'] });
}
