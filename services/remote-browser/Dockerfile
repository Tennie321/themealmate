FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && mkdir -p /data/profile && chown -R pwuser:pwuser /app /data
COPY --chown=pwuser:pwuser src ./src
USER pwuser
ENV NODE_ENV=production
ENV PORT=8787
ENV ASTRA_BROWSER_PROFILE_DIR=/data/profile
EXPOSE 8787
CMD ["node", "src/server.mjs"]
