FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && mkdir -p /profiles && chown -R pwuser:pwuser /app /profiles
COPY --chown=pwuser:pwuser src/ ./src/
USER pwuser
ENV NODE_ENV=production PORT=8787 ASTRA_BROWSER_PROFILE_ROOT=/profiles
EXPOSE 8787
CMD ["node", "src/server.mjs"]
