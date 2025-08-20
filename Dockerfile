FROM oven/bun:1-alpine

# Set resource constraints
ENV NODE_OPTIONS="--max-old-space-size=500"

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

EXPOSE 3000

# Add resource limits via Docker run flags
# Use --cpus=1.0 and --memory=500m when running the container
CMD ["bun", "run", "src/http-server.ts"]


