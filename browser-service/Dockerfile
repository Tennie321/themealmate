FROM mcr.microsoft.com/playwright:v1.55.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && mkdir -p /data/profiles \
 && chown -R pwuser:pwuser /data
COPY --chown=pwuser:pwuser *.mjs ./
USER pwuser
ENV NODE_ENV=production PORT=8787 BROWSER_PROFILE_DIR=/data/profiles/owner
EXPOSE 8787
CMD ["node", "server.mjs"]
