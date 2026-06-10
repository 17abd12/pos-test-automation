# Playwright's official image ships Node + all browsers + system libs.
# Pin the tag to the @playwright/test version in package.json.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /tests

# Install JS deps first (better layer caching).
COPY package.json ./
RUN npm install

# Copy the suite (node_modules excluded via .dockerignore).
COPY . .

# Default: run the Playwright suite. The app under test must be reachable at
# PW_BASE_URL (see docker-compose: http://host.docker.internal:3000).
CMD ["npm", "run", "test:pw"]
