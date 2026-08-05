FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm db:generate && pnpm build

FROM build AS api
EXPOSE 4000
CMD ["pnpm", "--filter", "@tadpods/api", "start"]

FROM build AS web
EXPOSE 3000
CMD ["pnpm", "--filter", "@tadpods/web", "start"]

FROM build AS worker
CMD ["pnpm", "--filter", "@tadpods/worker", "start"]

FROM build AS tools
CMD ["pnpm", "verify"]
