FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs protocol.mjs prompt.mjs ./
RUN mkdir -p /data && chown -R pwuser:pwuser /data /app
ENV NODE_ENV=production BROWSER_PROFILE_DIR=/data/profile PORT=8787
USER pwuser
EXPOSE 8787
CMD ["node", "server.mjs"]
