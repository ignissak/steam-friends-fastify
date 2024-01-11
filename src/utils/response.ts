import { FastifyReply } from 'fastify';

namespace Res {
	export function not_found(res: FastifyReply) {
		return res.status(404).send({ success: false, message: 'Not Found' });
	}
}
