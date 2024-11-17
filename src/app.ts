import cors from '@fastify/cors';
import { fastifyEnv } from '@fastify/env';
import fastifyPassport from '@fastify/passport';
import fastifySecureSession from '@fastify/secure-session';
import Fastify, {
	FastifyInstance,
	FastifyReply,
	FastifyRequest,
} from 'fastify';
import { Strategy as SteamStrategy } from 'passport-steam';
import { authRoutes } from './routes/auth.routes';
import { steamRoutes } from './routes/steam.routes';

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
	fastify.get('/api/me', {}, async (request, reply) => {
		reply.header('access-control-allow-credentials', true);
		if (request.isAuthenticated()) {
			return reply.send({
				success: true,
				message: 'You are authenticated',
				user: request.user,
			});
		}
		return reply.status(401).send({ redirect: '/api/auth/steam' });
	});

	await fastify.register(steamRoutes, { prefix: '/api' });
	await fastify.register(authRoutes, { prefix: '/api' });
}

async function build() {
	const fastify = Fastify({
		logger: true,
		disableRequestLogging: true,
	});

	await fastify.register(cors, {
		origin: ['http://localhost:5173', 'https://steam.bordas.sk'],
		credentials: true,
		methods: ['GET'],
	});

	await fastify.register(require('@fastify/middie'), {
		hook: 'onRequest', // default
	});

	await fastify.register(require('@fastify/cookie'), {
		secret: 'my-secret', // for cookies signature
		hook: 'onRequest', // set to false to disable cookie autoparsing or set autoparsing on any of the following hooks: 'onRequest', 'preParsing', 'preHandler', 'preValidation'. default: 'onRequest'
		parseOptions: {}, // options for parsing cookies
	});

	const dotenvPath =
		process.env.NODE_ENV === 'production' ? '.env' : '.env.dev';

	console.debug(`Loading config from ${dotenvPath}`);

	await fastify.register(fastifyEnv, {
		dotenv: {
			path: dotenvPath,
			debug: true,
		},
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
				COOKIE_DOMAIN: {
					type: 'string',
					default: 'localhost',
				},
				REDIRECT_URL: {
					type: 'string',
					default: 'http://localhost:5173/login',
				},
				REDIS_URL: {
					type: 'string',
					default: 'redis://localhost:6379',
				},
			},
		},
	});

	fastify.log.info(
		`Trying to connect to redis at ${fastify['config'].REDIS_URL}...`,
	);
	await fastify.register(require('@fastify/redis'), {
		url: fastify['config'].REDIS_URL,
	});

	await fastify.register(fastifySecureSession, {
		sessionName: 'session',
		cookieName: 'steam-session',
		cookie: {
			path: '/',
			domain: fastify['config'].COOKIE_DOMAIN,
			secure: true,
			sameSite: 'none',
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

	await fastify.register(import('@fastify/rate-limit'), {
		global: true,
		max: 20, // limit each IP to 100 requests per windowMs
		timeWindow: '1 minute',
	});
	fastify.log.info('Rate limit registered');

	const metricsPlugin = require('fastify-metrics');
	await fastify.register(metricsPlugin, { endpoint: '/api/metrics' });
	fastify.log.info('Metrics registered');

	await routes(fastify);
	fastify.log.info('Routes registered');

	return fastify;
}

let app;
build()
	.then(fastify => {
		app = fastify;
		const prod = process.env.NODE_ENV === 'production';
		fastify.listen({
			port: fastify['config'].PORT,
			host: prod ? '0.0.0.0' : '127.0.0.1',
		});
		fastify.log.info(`Server listening on port ${fastify['config'].PORT}`);
	})
	.catch(console.error);

export default app;
