FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
COPY browser/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY browser/server.mjs browser/token.mjs ./
RUN mkdir -p /profiles && chown -R pwuser:pwuser /profiles /app
USER pwuser
ENV NODE_ENV=production BROWSER_PROFILE_DIR=/profiles/owner
EXPOSE 8787
CMD ["node", "server.mjs"]
