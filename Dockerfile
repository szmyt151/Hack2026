FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    pulseaudio \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY meeting-runner/package.json meeting-runner/package.json
COPY voice-core/package.json voice-core/package.json
COPY brain/package.json brain/package.json
RUN npm install

COPY . .
RUN npx playwright install --with-deps chromium

ENV NODE_ENV=production
