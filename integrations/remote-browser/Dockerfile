FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /opt/astra-browser
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && mkdir -p /home/pwuser/profiles \
    && chown -R pwuser:pwuser /opt/astra-browser /home/pwuser/profiles
COPY --chown=pwuser:pwuser server.mjs token.mjs ./
USER pwuser
ENV NODE_ENV=production BROWSER_PROFILE_DIR=/home/pwuser/profiles PORT=8787
EXPOSE 8787
CMD ["xvfb-run", "-a", "node", "server.mjs"]
