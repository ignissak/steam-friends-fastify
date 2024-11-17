FROM node:lts-alpine as build-stage
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
CMD ["pnpm", "start"]