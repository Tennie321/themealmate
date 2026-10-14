FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY auth.mjs server.mjs ./
RUN mkdir -p /profiles && chown -R pwuser:pwuser /profiles /app
USER pwuser
ENV NODE_ENV=production PORT=8788 BROWSER_PROFILE_DIR=/profiles/owner
EXPOSE 8788
CMD ["node", "server.mjs"]
