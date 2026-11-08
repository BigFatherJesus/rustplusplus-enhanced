FROM node:20-bookworm

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm install

# Copy the rest of the application (respects .dockerignore)
COPY . /app

# Runtime-mutable data — mount these as volumes to persist across container recreation
VOLUME [ "/app/credentials" ]
VOLUME [ "/app/instances" ]
VOLUME [ "/app/logs" ]
VOLUME [ "/app/maps" ]
# NOTE: the AI/ knowledge folder (curated docs + generated per-item JSON) is baked into
# the image. Do NOT blindly volume-mount it or you shadow the baked-in data; only
# bind-mount AI/ if you intentionally manage that content on the host.

ENV NODE_ENV=production

CMD ["npm", "start"]
