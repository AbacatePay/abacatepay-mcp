# Versão fixa: a tag "1" virou Bun 1.4 em 10/10/2026 e entrou em produção sem ninguém mudar nada aqui
FROM oven/bun:1.4.3-alpine

# Set resource constraints
ENV NODE_OPTIONS="--max-old-space-size=500"

WORKDIR /app

# Com o lockfile: sem ele, cada build resolve as dependências do zero
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

# Add resource limits via Docker run flags
# Use --cpus=1.0 and --memory=500m when running the container
CMD ["bun", "run", "src/http-server.ts"]


