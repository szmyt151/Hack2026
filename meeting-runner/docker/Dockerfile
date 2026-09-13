FROM mcr.microsoft.com/playwright:v1.47.0-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
    pulseaudio ffmpeg xvfb && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Profil usera montuj jako wolumen: -v $(pwd)/.chromium-profile:/app/.chromium-profile
ENV HEADLESS=false
CMD ["bash", "-c", "npm run audio:setup && npm run start:xvfb"]
