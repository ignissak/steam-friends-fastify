FROM node:lts-slim AS build-stage
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package.json /app/package.json
WORKDIR /app

RUN pnpm install

COPY . /app
RUN pnpm build

ENV NODE_ENV production
EXPOSE 3000

ARG PORT=3000
ENV PORT $PORT

ARG STEAM_API_KEY
ENV STEAM_API_KEY $STEAM_API_KEY

ARG STEAM_AUTH_URL=https://steam.bordas.sk/api/auth/steam
ENV STEAM_AUTH_URL $STEAM_AUTH_URL

ARG STEAM_RETURN_URL=https://steam.bordas.sk/api/auth/steam/return
ENV STEAM_RETURN_URL $STEAM_RETURN_URL

ARG JWT_SECRET
ENV JWT_SECRET $JWT_SECRET

ARG DEBUG=true
ENV DEBUG $DEBUG

ARG COOKIE_DOMAIN=steam.bordas.sk
ENV COOKIE_DOMAIN $COOKIE_DOMAIN

ARG REDIRECT_URL=https://steam.bordas.sk/login
ENV REDIRECT_URL $REDIRECT_URL

ARG REDIS_URL=redis://cache:36231
ENV REDIS_URL $REDIS_URL

CMD ["pnpm", "start"]