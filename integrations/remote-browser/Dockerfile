FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY protocol.mjs server.mjs ./
RUN mkdir -p /app/profiles && chown -R pwuser:pwuser /app
USER pwuser
ENV NODE_ENV=production BIND_HOST=0.0.0.0 PORT=8787 REMOTE_BROWSER_PROFILE_DIR=/app/profiles
EXPOSE 8787
CMD ["node", "server.mjs"]
