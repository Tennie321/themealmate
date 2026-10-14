FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs security.mjs ./
RUN mkdir -p /data/profiles && chown -R pwuser:pwuser /data /app
USER pwuser
ENV PORT=8787 PROFILE_ROOT=/data/profiles NODE_ENV=production
EXPOSE 8787
CMD ["node", "server.mjs"]
