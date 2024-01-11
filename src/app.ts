import { fastifyEnv } from '@fastify/env';
import fastifyPassport from '@fastify/passport';
import fastifySecureSession from '@fastify/secure-session';
import Fastify, {
	FastifyInstance,
	FastifyReply,
	FastifyRequest,
} from 'fastify';
import { Strategy as SteamStrategy } from 'passport-steam';
import { steamLogin, steamLoginReturn } from './routes/auth.routes';
import { steamRoutes } from './routes/steam.routes';

/* class App {


	public fastify;

	constructor() {
		this.fastify = fastify({ logger: true });

		this.fastify
			.register(require('@fastify/middie'), {
				hook: 'onRequest', // default
			})
			.after(async () => {
				this.middleware();
				this.routes();
				await this.start();
			});
	}

	private middleware() {
		this.fastify.register(subsystem);

		this.fastify.register(fastifyEnv, {
			dotenv: true,
			data: process.env,
			confKey: 'config',
			schema: {
				type: 'object',
				required: ['PORT'],
				properties: {
					PORT: {
						type: 'string',
						default: '3000',
					},
				},
			},
		});

		console.log(1);
		console.log(this.fastify.config);

		this.fastify.addHook('onSend', (_request, reply, payload, done) => {
			if (
				typeof payload === 'object' &&
				payload &&
				payload.hasOwnProperty('success')
			) {
				return done(null, payload);
			}
			const is_success =
				reply.statusCode >= 200 && reply.statusCode < 400;
			return done(null, { success: is_success, data: payload });
		});

		async function subsystem(fastify: any, _opts: any) {
			fastify.use(
				morgan(
					':remote-addr -> (:method) :url :status - :response-time ms',
					debugStream,
				),
			);
			fastify.use(
				morgan(
					':remote-addr -> (:method) :url :status - :response-time ms',
					winstonStream,
				),
			);
		}
	}

	private async routes() {}

	public async start() {
		try {
			console.log(this.fastify.config)
			await this.fastify.listen({ port: this.fastify.config.PORT });
		} catch (e) {
			this.fastify.log.error(e);
			process.exit(1);
		}
	}
}

const app = new App(); */

export function isAuthenticated(
	request: FastifyRequest,
	reply: FastifyReply,
	done,
) {
	if (request.isAuthenticated()) {
		return done();
	} else {
		reply.status(401).send({ success: false, message: 'Unauthorized' });
	}
}
async function routes(fastify: FastifyInstance) {
	fastify.get(
		'/auth/steam',
		{
			preValidation: fastifyPassport.authenticate('steam'),
			schema: {
				params: {
					type: 'object',
					properties: {
						id: { type: 'string', minLength: 1 },
					},
					required: ['id'],
				},
			},
		},
		steamLogin,
	);

	fastify.get(
		'/auth/steam/return',
		{
			preValidation: fastifyPassport.authenticate('steam', {
				failureRedirect: '/',
			}),
		},
		steamLoginReturn,
	);

	fastify.get('/', {}, async (request, reply) => {
		if (request.isAuthenticated()) {
			return reply.send({
				success: true,
				message: 'You are authenticated',
				user: request.user,
			});
		}
		return reply.redirect('/auth/steam');
	});

	await fastify.register(steamRoutes);
}

async function build() {
	const fastify = Fastify({
		logger: true,
		disableRequestLogging: true,
	});

	await fastify.register(require('@fastify/middie'), {
		hook: 'onRequest', // default
	});

	await fastify.register(require('@fastify/cookie'), {
		secret: 'my-secret', // for cookies signature
		hook: 'onRequest', // set to false to disable cookie autoparsing or set autoparsing on any of the following hooks: 'onRequest', 'preParsing', 'preHandler', 'preValidation'. default: 'onRequest'
		parseOptions: {}, // options for parsing cookies
	});

	await fastify.register(fastifyEnv, {
		dotenv: true,
		data: process.env,
		confKey: 'config',
		schema: {
			type: 'object',
			required: ['PORT'],
			properties: {
				PORT: {
					type: 'string',
					default: '3000',
				},
				STEAM_API_KEY: {
					type: 'string',
					default: '',
				},
				STEAM_AUTH_URL: {
					type: 'string',
					default: '',
				},
				STEAM_RETURN_URL: {
					type: 'string',
					default: '',
				},
				JWT_SECRET: {
					type: 'string',
					default: '',
				},
				DEBUG: {
					type: 'boolean',
					default: false,
				},
			},
		},
	});

	await fastify.register(fastifySecureSession, {
		sessionName: 'session',
		cookieName: 'session',
		cookie: {
			path: '/',
			secure: true,
		},
		key: Buffer.from(fastify['config'].JWT_SECRET),
	});
	await fastify.register(fastifyPassport.initialize());
	await fastify.register(fastifyPassport.secureSession());

	fastifyPassport.use(
		'steam',
		new SteamStrategy(
			{
				returnURL: fastify['config'].STEAM_RETURN_URL,
				realm: fastify['config'].STEAM_AUTH_URL,
				apiKey: fastify['config'].STEAM_API_KEY,
			},
			(identifier, profile, done) => {
				profile.identifier = identifier;
				return done(null, profile);
			},
		),
	);

	fastifyPassport.registerUserSerializer(
		async (user: any, _request) => user._json,
	);
	fastifyPassport.registerUserDeserializer(async (id, _request) => id);

	fastify.addHook('onResponse', (request, reply, done) => {
		request.log.info(
			`response - ${reply.request.method} ${
				reply.request.routeOptions.url
			} ${reply.statusCode} ${reply.getResponseTime().toFixed(2)}ms`,
		);
		done();
	});

	await routes(fastify);

	return fastify;
}

let app;
build()
	.then(fastify => {
		app = fastify;
		fastify.listen({ port: fastify['config'].PORT });
		fastify.log.info(`Server listening on port ${fastify['config'].PORT}`);
	})
	.catch(console.error);

export default app;
