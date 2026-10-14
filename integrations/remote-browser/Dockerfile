FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /opt/remote-browser
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY auth.mjs server.mjs ./
RUN mkdir -p /home/pwuser/astra-browser && chown -R pwuser:pwuser /home/pwuser/astra-browser /opt/remote-browser
USER pwuser
ENV NODE_ENV=production PORT=8787 HOME=/home/pwuser/astra-browser BROWSER_PROFILE_DIR=/home/pwuser/astra-browser/profile
EXPOSE 8787
CMD ["node", "server.mjs"]
