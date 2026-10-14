FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /srv/app
COPY services/browser-control/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY services/browser-control/*.mjs ./
RUN mkdir -p /data/profiles && chown -R pwuser:pwuser /data /srv/app
USER pwuser
ENV NODE_ENV=production BROWSER_PORT=8787 BROWSER_HOST=0.0.0.0 BROWSER_DATA_DIR=/data/profiles
EXPOSE 8787
CMD ["node", "server.mjs"]
