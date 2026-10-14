FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /home/pwuser/app
COPY --chown=pwuser:pwuser package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=pwuser:pwuser *.mjs ./
RUN mkdir -p /data/profiles && chown -R pwuser:pwuser /data
USER pwuser
ENV NODE_ENV=production PORT=3100 BROWSER_DATA_DIR=/data
EXPOSE 3100
CMD ["node", "server.mjs"]
